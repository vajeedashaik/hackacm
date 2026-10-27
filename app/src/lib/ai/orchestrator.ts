import { INDUSTRIES } from "../industries";
import type { Case, IndustryId } from "../types";
import { addFlag, getFlag, recordEvent, saveReport } from "./agentStore";
import {
  attendanceAgent, fairnessCaseAgent, safetyTriageAgent, supervisorPersonaAgent, wageAnalysisAgent, type Out,
} from "./agents";
import {
  getAttendanceEvidence, getCase, getWorkloadAlerts, proposeAction, recalcWage,
} from "./tools";
import type {
  AgentEvent, AgentRole, AgentSource, CaseAgentReport, Proposal, ToolCtx, WorkloadFlag,
} from "./types";
import { DomainError } from "../errors";

// The orchestrator routes a case to the right agents, bounds each step with a timeout, validates what
// comes back, records every step in the activity feed, and ends by asking a HUMAN to decide.
// It never throws into the caller: a failed step is logged and the rule-based result is used.

const SYSTEM: Omit<ToolCtx, "industry"> = { actor: { role: "system" } };
const STEP_TIMEOUT_MS = Number(process.env.AGENT_STEP_TIMEOUT_MS) || 10_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms); });
  return Promise.race([p, timeout]).finally(() => clearTimeout(t));
}

type Emit = (actor: AgentRole, type: AgentEvent["type"], summary: string, outcome?: AgentEvent["outcome"], source?: AgentSource) => void;

function emitter(industry: IndustryId, recordId: string, workerId: string | undefined, topic: AgentEvent["topic"]): Emit {
  return (actor, type, summary, outcome = "ok", source) =>
    void recordEvent({ industry, actor, type, summary, recordId, outcome, source, workerId, topic });
}

/** Runs one agent step with a deadline. On failure the supplied rule-based fallback is used and the feed says so. */
async function step<T>(emit: Emit, actor: AgentRole, label: string, run: () => Promise<Out<T>>, fallback: () => Out<T>): Promise<Out<T>> {
  try {
    const out = await withTimeout(run(), STEP_TIMEOUT_MS);
    emit(actor, "agent-invoked", `${label}: ${out.source === "model" ? "model-assisted, output validated" : "rule-based result"}`,
      out.source === "model" ? "ok" : "fallback", out.source);
    return out;
  } catch {
    emit(actor, "agent-failed", `${label} did not finish; using the rule-based result`, "failed", "rules");
    return fallback();
  }
}

const money = (n: number) => `₹${n}`;

function safeProposal(industry: IndustryId, caseId: string, want: Parameters<typeof proposeAction>[2]): Proposal {
  const ctx: ToolCtx = { industry, ...SYSTEM };
  try {
    return proposeAction(ctx, caseId, want);
  } catch (e) {
    // a rejected proposal (outside the allowed set / lifecycle) degrades to a note for the reviewer
    if (!(e instanceof DomainError)) throw e;
    return proposeAction(ctx, caseId, { action: "request_info", reason: "Reviewer should check this case manually." });
  }
}

export async function investigateCase(industry: IndustryId, caseId: string): Promise<CaseAgentReport | undefined> {
  const ctx: ToolCtx = { industry, ...SYSTEM };
  let c: Case;
  try { c = getCase(ctx, caseId); } catch { return undefined; }
  const cfg = INDUSTRIES[industry];
  const emit = emitter(industry, caseId, c.workerId, c.type);
  const sources: CaseAgentReport["sources"] = {};
  try {
    emit("orchestrator", "agent-invoked", `Investigation started for ${caseId} (${c.type})`);

    let explanation = "";
    let summary = "";
    let nextSteps: string[] = [];
    let missingInfo: string[] = [];
    let urgency: CaseAgentReport["urgency"] = c.priority;
    let finding: CaseAgentReport["attendance"];
    let want: Parameters<typeof proposeAction>[2];

    if (c.type === "wage" && c.wage) {
      const evidence = getAttendanceEvidence(ctx, caseId);
      emit("attendance", "evidence-retrieved", `Retrieved ${evidence.records.length} attendance record(s) for ${evidence.date}`);

      const { analysis, worker } = recalcWage(ctx, caseId);
      emit("wage-analysis", "calculation-completed",
        `Rule-based recalculation: expected ${money(analysis.expectedPay)}, paid ${money(c.wage.amountPaid)}, shortfall ${money(analysis.shortfall)}`, "ok", "rules");

      const att = attendanceAgent({ cfg, evidence, claimedHours: c.wage.hoursWorked, alerts: getWorkloadAlerts(ctx, c.workerId) });
      finding = att.value; sources.attendance = att.source;
      emit("attendance", "issue-classified",
        finding.consistent ? "Claimed hours match attendance records" : "Claimed hours do not match attendance records", "ok", "rules");

      const expl = await step(emit, "wage-analysis", "Wage Analysis Agent",
        () => wageAnalysisAgent({ cfg, worker, date: c.date, hours: c.wage!.hoursWorked, paid: c.wage!.amountPaid, analysis }),
        () => ({ value: analysis.summary, source: "rules" as const }));
      explanation = expl.value; sources["wage-analysis"] = expl.source;

      if (analysis.shortfall > 0 && finding.consistent && finding.recordedHours !== null) {
        want = { action: "resolve_backpay", amount: analysis.shortfall, reason: `Attendance supports the claim; calculated shortfall ${money(analysis.shortfall)}.` };
        nextSteps = ["Review the attendance records below.", `If you agree, accept the suggested ${money(analysis.shortfall)} back-pay.`, "The worker is notified when you decide."];
      } else if (analysis.shortfall > 0) {
        want = { action: "request_info", reason: "Claimed hours cannot be confirmed from attendance; verify before paying." };
        nextSteps = ["Check the shift with the supervisor.", "Add a supervisor-entered shift if the work was done but not clocked.", "Then decide on back-pay."];
      } else {
        want = { action: "reject_claim", reason: "Payment matches the configured wage rules." };
        nextSteps = ["Share the calculation with the worker.", "Reject only if you agree with the calculation."];
      }
      const fair = await step(emit, "fairness-case", "Fairness Case Agent",
        () => fairnessCaseAgent({
          type: "wage", title: c.title,
          facts: [analysis.summary, ...finding!.flags],
          allowedAmounts: [analysis.expectedPay, analysis.shortfall, c.wage!.amountPaid, worker.hourlyRate],
          nextSteps,
        }),
        () => ({ value: `${c.title}. ${analysis.summary}`, source: "rules" as const }));
      summary = fair.value; sources["fairness-case"] = fair.source;
    } else if (c.type === "safety") {
      const tri = await step(emit, "safety-triage", "Safety Triage Agent",
        () => safetyTriageAgent({ cfg, category: c.category, severity: c.severity, description: c.description, floor: c.priority }),
        () => ({ value: { urgency: c.priority, missingInfo: [], note: "Urgency taken from the reported severity." }, source: "rules" as const }));
      urgency = tri.value.urgency; missingInfo = tri.value.missingInfo; sources["safety-triage"] = tri.source;
      emit("safety-triage", "issue-classified",
        `Urgency ${tri.value.urgency}${tri.value.suggestedCategory ? `; wording suggests category "${tri.value.suggestedCategory}"` : ""}`, "ok", tri.source);
      explanation = urgency === "urgent" || urgency === "high"
        ? "Your safety report has been marked high priority and is waiting for a safety reviewer."
        : "Your safety report was received and is waiting for review.";
      summary = `${c.title}. ${tri.value.note}${tri.value.suggestedCategory ? ` Possible better category: ${tri.value.suggestedCategory}.` : ""}`;
      nextSteps = urgency === "urgent" ? ["Contact the safety officer now.", "Make the area safe before work continues."] : ["Assign a safety reviewer.", "Inspect the area."];
      if (missingInfo.length) nextSteps.push("Ask the reporter for the missing details.");
      want = c.status === "open"
        ? { action: "start_review", reason: `Safety report with ${urgency} urgency needs a reviewer.` }
        : { action: "request_info", reason: "Follow up on the safety report." };
    } else {
      const evidence = getAttendanceEvidence(ctx, caseId);
      emit("attendance", "evidence-retrieved", `Retrieved ${evidence.records.length} attendance record(s) for ${evidence.date}`);
      const att = attendanceAgent({ cfg, evidence, alerts: getWorkloadAlerts(ctx, c.workerId) });
      finding = att.value; sources.attendance = att.source;
      emit("attendance", "issue-classified", `${finding.flags.length} point(s) flagged for the attendance record`, "ok", "rules");
      explanation = "Your attendance report was received. A reviewer will compare it with the clock records.";
      summary = `${c.title}. ${finding.flags.join(" ") || "No automatic flags."}`;
      nextSteps = ["Compare the record with the supervisor's roster.", "Correct the hours if the record is wrong."];
      want = c.status === "open" ? { action: "start_review", reason: "Attendance dispute needs a reviewer." } : { action: "request_info", reason: "Follow up on the attendance report." };
    }

    const proposal = safeProposal(industry, caseId, want);
    emit("fairness-case", "action-proposed", `Suggested: ${proposal.action.replace(/_/g, " ")}${proposal.amount ? ` ${money(proposal.amount)}` : ""} (pending human decision)`, "pending");
    emit("orchestrator", "human-review-required", `${caseId} needs an authorised employer decision; nothing changes until then`, "pending");

    const report: CaseAgentReport = {
      caseId, industry, createdAt: Date.now(), explanation, summary, nextSteps, missingInfo, urgency,
      attendance: finding, proposal, sources,
    };
    saveReport(report);
    return report;
  } catch {
    emit("orchestrator", "agent-failed", `Investigation of ${caseId} could not finish; the case is unaffected`, "failed", "rules");
    return undefined;
  }
}

/** Looks for new workload-rule breaches for a worker and files a pending supervisor suggestion for each. */
export function scanWorkload(industry: IndustryId, workerId: string): WorkloadFlag[] {
  const ctx: ToolCtx = { industry, ...SYSTEM };
  const cfg = INDUSTRIES[industry];
  const created: WorkloadFlag[] = [];
  try {
    for (const a of getWorkloadAlerts(ctx, workerId)) {
      const id = `wf:${a.key}`;
      if (getFlag(id)) continue;
      const emit = emitter(industry, id, workerId, "hours");
      const sup = supervisorPersonaAgent(cfg, a.rule);
      const detail: Record<typeof a.rule, string> = {
        daily: `${a.value}h in one day (limit ${a.limit}h)`,
        weekly: `${a.value}h in the week of ${a.date} (limit ${a.limit}h)`,
        rest: `${a.value}h rest before the shift on ${a.date} (minimum ${a.limit}h)`,
        streak: `${a.value} consecutive days (limit ${a.limit})`,
      };
      const flag: WorkloadFlag = {
        id, industry, workerId, rule: a.rule, detail: detail[a.rule], proposedResponse: sup.response,
        status: "pending", createdAt: Date.now(),
      };
      addFlag(flag);
      created.push(flag);
      emit("attendance", "issue-classified", `Workload rule exceeded: ${flag.detail}`, "ok", "rules");
      emit("supervisor-persona", "action-proposed", `${sup.title} suggestion: ${sup.response}`, "pending", "rules");
      emit("orchestrator", "human-review-required", "A workload alert needs an authorised employer decision", "pending");
    }
  } catch {
    recordEvent({ industry, actor: "orchestrator", type: "agent-failed", outcome: "failed", topic: "hours", summary: "Workload scan could not finish; attendance records are unaffected" });
  }
  return created;
}

export function decideFlag(ctx: ToolCtx, id: string, decision: "accept" | "reject") {
  if (ctx.actor.role !== "employer") throw new DomainError("Only an authorised employer can decide on a suggestion");
  const f = getFlag(id);
  if (!f || f.industry !== ctx.industry) throw new DomainError("Suggestion not found");
  if (f.status !== "pending") throw new DomainError(`This suggestion is already ${f.status}`);
  f.status = decision === "accept" ? "accepted" : "rejected";
  f.decidedBy = ctx.actor.name;
  recordEvent({
    industry: f.industry, actor: "employer", topic: "hours", type: decision === "accept" ? "action-accepted" : "action-rejected",
    outcome: decision === "accept" ? "accepted" : "rejected", recordId: id, workerId: f.workerId,
    summary: decision === "accept"
      ? `${ctx.actor.name} accepted the workload suggestion (recorded; roster changes are made by the employer)`
      : `${ctx.actor.name} rejected the workload suggestion`,
  });
  return f;
}
