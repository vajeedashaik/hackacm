import { type Ctx, audit, canSeeWorker, notify, profileOf, requireStaff, requireWorker } from "../ctx";
import type { CaseEvidenceRow, CaseStatus, CaseType, FairnessCaseRow } from "../db/rows";
import { TERMINAL_NEEDS_NOTE, checkTransition, isStaff } from "../domain";
import { ServiceError } from "../errors";
import { publishEvent } from "./events";

function loadCase(ctx: Ctx, caseId: string): FairnessCaseRow {
  const c = ctx.db.fairness_cases.find((x) => x.id === caseId);
  // Invisible and non-existent cases look identical.
  if (!c || c.org_id !== ctx.actor.orgId || !canSeeWorker(ctx, c.worker_id)) throw new ServiceError(404, "Case not found");
  return c;
}

function recordTransition(ctx: Ctx, c: FairnessCaseRow, from: CaseStatus | null, to: CaseStatus, note?: string) {
  ctx.db.case_transitions.push({
    id: ctx.id(), org_id: c.org_id, case_id: c.id, from_status: from, to_status: to,
    actor_id: ctx.actor.userId, actor_is_agent: ctx.actor.kind === "agent", note: note ?? null,
    created_at: ctx.now().toISOString(),
  });
  audit(ctx, "case.transition", "fairness_case", c.id, { from: from ?? "none", to });
}

/** Open a case. Workers open their own; staff may open one for a worker they can see. Starts as `reported`. */
export function createFairnessCase(
  ctx: Ctx,
  input: { workerId?: string; caseType: CaseType; title: string; summary?: string; payrollComparisonId?: string },
) {
  const workerId = input.workerId ?? ctx.actor.userId;
  requireWorker(ctx, workerId);
  if (ctx.actor.kind === "agent") throw new ServiceError(403, "This action must be performed by a person");
  if (input.payrollComparisonId) {
    const cmp = ctx.db.payroll_comparisons.find((p) => p.id === input.payrollComparisonId && p.worker_id === workerId);
    if (!cmp) throw new ServiceError(404, "Payroll comparison not found");
  }
  const now = ctx.now().toISOString();
  const row: FairnessCaseRow = {
    id: ctx.id(), org_id: ctx.actor.orgId, worker_id: workerId, case_type: input.caseType,
    status: "reported", title: input.title, summary: input.summary ?? "",
    payroll_comparison_id: input.payrollComparisonId ?? null, opened_by: ctx.actor.userId,
    assigned_to: null, resolution_note: null, created_at: now, updated_at: now, resolved_at: null,
  };
  ctx.db.fairness_cases.push(row);
  recordTransition(ctx, row, null, "reported");
  publishEvent(ctx, { kind: "case.created", entityType: "fairness_case", entityId: row.id, workerId, payload: { type: row.case_type } });
  for (const a of ctx.db.profiles.filter((p) => p.org_id === row.org_id && p.role === "employer_admin")) {
    notify(ctx, a.id, "case.created", "New fairness case", row.case_type);
  }
  return row;
}

/** Staff-only edits to non-status fields. Status changes go through transitionCase. */
export function updateFairnessCase(
  ctx: Ctx,
  input: { caseId: string; title?: string; summary?: string; assignedTo?: string | null },
) {
  requireStaff(ctx);
  const c = loadCase(ctx, input.caseId);
  if (input.assignedTo) {
    const a = profileOf(ctx.db, input.assignedTo);
    if (!a || a.org_id !== c.org_id || !(a.role === "supervisor" || a.role === "employer_admin")) {
      throw new ServiceError(422, "Assignee must be staff in this organisation");
    }
  }
  if (input.title !== undefined) c.title = input.title;
  if (input.summary !== undefined) c.summary = input.summary;
  if (input.assignedTo !== undefined) c.assigned_to = input.assignedTo;
  c.updated_at = ctx.now().toISOString();
  audit(ctx, "case.update", "fairness_case", c.id, { assigned: input.assignedTo ?? "none" });
  return c;
}

/**
 * Move a case along the lifecycle. Validates the edge, the actor's role, and that agents never
 * perform human-only steps. A case is resolved only by a human employer admin with a note.
 */
export function transitionCase(ctx: Ctx, input: { caseId: string; to: CaseStatus; note?: string }) {
  const c = loadCase(ctx, input.caseId);
  const check = checkTransition(c.status, input.to, ctx.actor, c.worker_id);
  if (!check.ok) throw new ServiceError(check.status, check.reason);
  if (TERMINAL_NEEDS_NOTE.includes(input.to) && !input.note?.trim()) {
    throw new ServiceError(422, `A note is required to move a case to ${input.to}`);
  }
  const from = c.status;
  c.status = input.to;
  c.updated_at = ctx.now().toISOString();
  if (input.to === "resolved") {
    c.resolved_at = c.updated_at;
    c.resolution_note = input.note!.trim();
  } else if (from === "resolved" || from === "rejected") {
    c.resolved_at = null; // reopened or disputed
  }
  recordTransition(ctx, c, from, input.to, input.note);
  publishEvent(ctx, {
    kind: "case.transitioned", entityType: "fairness_case", entityId: c.id, workerId: c.worker_id,
    payload: { from, to: input.to, by_agent: ctx.actor.kind === "agent" },
  });
  if (c.worker_id !== ctx.actor.userId) notify(ctx, c.worker_id, "case.transitioned", "Your case was updated", `Status: ${input.to}`);
  return c;
}

/** Attach evidence. The worker who owns the case or staff who can see it; agent-added items are flagged. */
export function addCaseEvidence(
  ctx: Ctx,
  input: { caseId: string; kind: CaseEvidenceRow["kind"]; content: string },
) {
  const c = loadCase(ctx, input.caseId);
  if (!isStaff(ctx.actor) && c.worker_id !== ctx.actor.userId) throw new ServiceError(403, "Not allowed");
  const row: CaseEvidenceRow = {
    id: ctx.id(), org_id: c.org_id, case_id: c.id, added_by: ctx.actor.userId,
    added_by_agent: ctx.actor.kind === "agent", kind: input.kind, content: input.content,
    created_at: ctx.now().toISOString(),
  };
  ctx.db.case_evidence.push(row);
  audit(ctx, "case.evidence", "fairness_case", c.id, { kind: input.kind });
  publishEvent(ctx, { kind: "case.evidence_added", entityType: "fairness_case", entityId: c.id, workerId: c.worker_id, payload: { kind: input.kind } });
  return row;
}

export function getCase(ctx: Ctx, caseId: string) {
  const c = loadCase(ctx, caseId);
  return {
    case: c,
    evidence: ctx.db.case_evidence.filter((e) => e.case_id === c.id),
    history: ctx.db.case_transitions.filter((t) => t.case_id === c.id),
  };
}

export const listCases = (ctx: Ctx) =>
  ctx.db.fairness_cases.filter((c) => c.org_id === ctx.actor.orgId && canSeeWorker(ctx, c.worker_id));
