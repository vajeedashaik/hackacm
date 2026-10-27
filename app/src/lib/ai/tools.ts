import { DomainError } from "../errors";
import { INDUSTRIES } from "../industries";
import { analyse, dayOf, fatigueAlerts, hoursBetween, payslip, weekStart } from "../calc";
import { actOnCase, snapshot } from "../store";
import type { Analysis, AttendanceRecord, Case, IndustryConfig, Worker } from "../types";
import { getReport, recordEvent } from "./agentStore";
import type { Actor, Proposal, ProposalAction, ToolCtx } from "./types";

// Narrow, server-side tools. Agents (and the Vapi webhook) get data and effects ONLY through these.
// Every tool re-checks the actor and the organisation (industry); nothing trusts model output.

const NOT_FOUND = "Case not found"; // same message for "missing" and "not yours": no existence leak

const cfgOf = (ctx: ToolCtx): IndustryConfig => {
  const cfg = INDUSTRIES[ctx.industry];
  if (!cfg) throw new DomainError("Unknown industry");
  return cfg;
};

/** The id of the worker whose records this actor may read; employers/system may name any worker in their industry. */
function readableWorker(ctx: ToolCtx, workerId?: string): Worker {
  const cfg = cfgOf(ctx);
  const id = ctx.actor.role === "worker" ? ctx.actor.workerId : workerId;
  if (ctx.actor.role === "worker" && workerId && workerId !== ctx.actor.workerId) throw new DomainError("Not allowed");
  const w = cfg.workers.find((x) => x.id === id);
  if (!w) throw new DomainError("Unknown worker");
  return w;
}

function allAttendance(ctx: ToolCtx): AttendanceRecord[] {
  return snapshot(ctx.industry, { employer: true }).attendance;
}

export function getCase(ctx: ToolCtx, caseId: string): Case {
  const c = snapshot(ctx.industry, { employer: true }).cases.find((x) => x.id === caseId);
  if (!c) throw new DomainError(NOT_FOUND);
  if (ctx.actor.role === "worker" && c.workerId !== ctx.actor.workerId) throw new DomainError(NOT_FOUND);
  return c;
}

export interface Evidence {
  date: string;
  recordedHours: number | null; // null: no attendance records that day
  records: { id: string; method: AttendanceRecord["method"]; open: boolean; corrected: boolean; hours: number }[];
}

/** Attendance for the case's worker on the case's date. Never invents records. */
export function getAttendanceEvidence(ctx: ToolCtx, caseId: string): Evidence {
  const c = getCase(ctx, caseId);
  const now = Date.now();
  const recs = allAttendance(ctx).filter((a) => a.workerId === c.workerId && a.date === c.date);
  const records = recs.map((a) => ({
    id: a.id, method: a.method, open: a.clockOut === undefined, corrected: !!a.corrected,
    hours: hoursBetween(a.clockIn, a.clockOut ?? now),
  }));
  const total = records.reduce((s, r) => s + r.hours, 0);
  return { date: c.date, recordedHours: records.length ? Math.round(total * 100) / 100 : null, records };
}

/** Deterministic recalculation using the configured industry rules. */
export function recalcWage(ctx: ToolCtx, caseId: string): { analysis: Analysis; worker: Worker; cfg: IndustryConfig } {
  const c = getCase(ctx, caseId);
  if (!c.wage) throw new DomainError("Not a wage case");
  const cfg = cfgOf(ctx);
  const worker = cfg.workers.find((w) => w.id === c.workerId)!;
  return { analysis: analyse(cfg, worker, c.wage.hoursWorked, c.wage.amountPaid), worker, cfg };
}

export function getWorkloadAlerts(ctx: ToolCtx, workerId?: string) {
  const w = readableWorker(ctx, workerId);
  return fatigueAlerts(cfgOf(ctx), allAttendance(ctx).filter((a) => a.workerId === w.id), w.id, Date.now());
}

/** Recent shifts for the worker, as plain facts (used by the voice assistant and the worker agent). */
export function getShiftRecords(ctx: ToolCtx, workerId?: string, days = 7) {
  const w = readableWorker(ctx, workerId);
  const now = Date.now();
  const since = dayOf(now - Math.min(Math.max(days, 1), 31) * 86_400_000);
  const byDay = new Map<string, number>();
  for (const a of allAttendance(ctx)) {
    if (a.workerId !== w.id || a.date < since) continue;
    byDay.set(a.date, (byDay.get(a.date) ?? 0) + hoursBetween(a.clockIn, a.clockOut ?? now));
  }
  return [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([date, hours]) => ({ date, hours: Math.round(hours * 100) / 100 }));
}

export function explainPayslip(ctx: ToolCtx, workerId?: string, period?: string) {
  const w = readableWorker(ctx, workerId);
  const now = Date.now();
  const p = period ?? weekStart(dayOf(now));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p) || weekStart(p) !== p) throw new DomainError("Invalid pay period");
  return { worker: w, slip: payslip(cfgOf(ctx), w, allAttendance(ctx), p, now) };
}

export function listCasesFor(ctx: ToolCtx, workerId?: string) {
  const w = readableWorker(ctx, workerId);
  return snapshot(ctx.industry, { employer: true }).cases.filter((c) => c.workerId === w.id);
}

// ---------- proposals ----------

const PROPOSABLE: Record<Case["type"], ProposalAction[]> = {
  wage: ["start_review", "request_info", "resolve_backpay", "reject_claim"],
  safety: ["start_review", "request_info", "resolve", "reject_claim"],
  attendance: ["start_review", "request_info", "resolve", "reject_claim"],
};

/** Validates a proposed action against the case type, lifecycle and the deterministic maximum. It only validates; nothing executes. */
export function proposeAction(ctx: ToolCtx, caseId: string, p: { action: ProposalAction; amount?: number; reason: string }): Proposal {
  if (ctx.actor.role === "worker") throw new DomainError("Workers cannot propose case actions");
  const c = getCase(ctx, caseId);
  if (c.status === "resolved" || c.status === "rejected") throw new DomainError("This case is closed");
  if (!PROPOSABLE[c.type].includes(p.action)) throw new DomainError(`"${p.action}" is not allowed for a ${c.type} case`);
  if (p.action === "start_review" && c.status !== "open") throw new DomainError("Review has already started");
  if (p.action === "resolve_backpay") {
    const max = recalcWage(ctx, caseId).analysis.shortfall;
    if (!(p.amount !== undefined && p.amount > 0 && p.amount <= max)) throw new DomainError("Back-pay must be within the calculated shortfall");
  }
  return { action: p.action, amount: p.amount, reason: p.reason.slice(0, 300), status: "pending" };
}

/**
 * The ONLY path from an agent proposal to a case change. Requires an employer actor (the route has
 * already checked the PIN) and goes through actOnCase, so the normal lifecycle rules still apply.
 */
export function decideProposal(ctx: ToolCtx, caseId: string, decision: "accept" | "reject", note?: string) {
  if (ctx.actor.role !== "employer") throw new DomainError("Only an authorised employer can decide on a proposal");
  const by = ctx.actor.name;
  const report = getReport(caseId);
  const c = getCase(ctx, caseId);
  if (!report || report.industry !== ctx.industry) throw new DomainError("No agent proposal for this case");
  const p = report.proposal;
  if (p.status !== "pending") throw new DomainError(`This proposal is already ${p.status}`);
  const ev = { industry: ctx.industry, actor: "employer" as const, recordId: caseId, workerId: c.workerId, topic: c.type };

  if (decision === "reject") {
    p.status = "rejected"; p.decidedBy = by; p.decidedAt = Date.now();
    recordEvent({ ...ev, type: "action-rejected", outcome: "rejected", summary: `${by} rejected the suggested action "${p.action}" for ${caseId}` });
    return report;
  }

  const text = (note ?? "").trim();
  switch (p.action) {
    case "start_review": actOnCase(caseId, { action: "review", reviewer: by, note: text }); break;
    case "request_info": actOnCase(caseId, { action: "note", reviewer: by, note: text || p.reason }); break;
    case "resolve_backpay": actOnCase(caseId, { action: "resolve", reviewer: by, note: text || "Back-pay confirmed after review.", paidBack: p.amount }); break;
    case "resolve": actOnCase(caseId, { action: "resolve", reviewer: by, note: text || "Resolved after review." }); break;
    case "reject_claim": actOnCase(caseId, { action: "reject", reviewer: by, note: text || p.reason }); break;
  }
  p.status = "accepted"; p.decidedBy = by; p.decidedAt = Date.now();
  recordEvent({ ...ev, type: "action-accepted", outcome: "accepted", summary: `${by} accepted the suggested action "${p.action}" for ${caseId}` });
  recordEvent({ ...ev, type: "case-updated", outcome: "ok", summary: `${caseId} updated through the case lifecycle` });
  return report;
}

/** A report's proposal is superseded when the employer closed the case by hand. */
export function currentReport(ctx: ToolCtx, caseId: string) {
  const c = getCase(ctx, caseId);
  const r = getReport(caseId);
  if (!r) return undefined;
  if (r.proposal.status === "pending" && (c.status === "resolved" || c.status === "rejected")) {
    return { ...r, proposal: { ...r.proposal, status: "superseded" as const } };
  }
  return r;
}

export const workerActor = (workerId: string): Actor => ({ role: "worker", workerId });
