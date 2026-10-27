import type { IndustryId } from "../types";

export type AgentRole =
  | "orchestrator" | "worker-persona" | "supervisor-persona" | "attendance"
  | "wage-analysis" | "safety-triage" | "fairness-case";

export type AgentEventType =
  | "agent-invoked" | "evidence-retrieved" | "calculation-completed" | "issue-classified"
  | "action-proposed" | "human-review-required" | "action-accepted" | "action-rejected"
  | "case-updated" | "agent-failed";

export type AgentOutcome = "ok" | "fallback" | "failed" | "pending" | "accepted" | "rejected";

/** "model" = text came from the configured LLM and passed validation; "rules" = deterministic fallback or rule-only agent. */
export type AgentSource = "model" | "rules";

/** One entry in the agent activity feed. `summary` is short and safe to show; never hidden reasoning or PII. */
export interface AgentEvent {
  id: string;
  ts: number;
  industry: IndustryId;
  actor: AgentRole | "employer";
  type: AgentEventType;
  summary: string;
  recordId?: string; // case id, workload flag id, ...
  outcome: AgentOutcome;
  source?: AgentSource;
  /** what the record is about; lets the simulation file the event under the right category */
  topic?: "wage" | "safety" | "attendance" | "hours";
  /**
   * Worker the record belongs to. Employers receive it (the simulation links it to a character);
   * it is removed from what workers receive, and used server-side to show a worker only their own events.
   */
  workerId?: string;
}

export type ProposalAction = "start_review" | "resolve_backpay" | "reject_claim" | "request_info" | "resolve";
export type ProposalStatus = "pending" | "accepted" | "rejected" | "superseded";

export interface Proposal {
  action: ProposalAction;
  amount?: number; // back-pay, always taken from the deterministic calculation
  reason: string;
  status: ProposalStatus;
  decidedBy?: string;
  decidedAt?: number;
}

export interface AttendanceFinding {
  claimedHours?: number;
  recordedHours: number | null; // null = no attendance record that day
  consistent: boolean;
  flags: string[];
}

/** What the agents concluded about one case. Numbers inside come from deterministic code, not from the model. */
export interface CaseAgentReport {
  caseId: string;
  industry: IndustryId;
  createdAt: number;
  explanation: string; // worker-friendly
  summary: string; // for the reviewer
  nextSteps: string[];
  missingInfo: string[];
  urgency?: "low" | "medium" | "high" | "urgent";
  attendance?: AttendanceFinding;
  proposal: Proposal;
  sources: Partial<Record<AgentRole, AgentSource>>;
}

export interface WorkloadFlag {
  id: string;
  industry: IndustryId;
  workerId: string;
  rule: "daily" | "weekly" | "rest" | "streak";
  detail: string;
  proposedResponse: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: number;
  decidedBy?: string;
}

/** Who a tool call acts for. Tools check this on every call; the model never supplies it. */
export type Actor =
  | { role: "worker"; workerId: string }
  | { role: "employer"; name: string }
  | { role: "system" };

export interface ToolCtx { industry: IndustryId; actor: Actor }
