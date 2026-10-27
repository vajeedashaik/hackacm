import type { IndustryId } from "../types";
import type { AgentEvent, CaseAgentReport, WorkloadFlag } from "./types";

// Agent activity, reports and workload flags. Same durability as the main store: process memory,
// so it resets on restart (see DEPLOY.md). Kept in its own module so the case store stays untouched.
interface AgentState {
  events: AgentEvent[];
  reports: Map<string, CaseAgentReport>;
  flags: WorkloadFlag[];
  seq: number;
}

const g = globalThis as unknown as { __fairshiftAgents?: AgentState };
const state: AgentState = (g.__fairshiftAgents ??= { events: [], reports: new Map(), flags: [], seq: 0 });

export const nextAgentId = (p: string) => `${p}${++state.seq}`;

export function recordEvent(e: Omit<AgentEvent, "id" | "ts">): AgentEvent {
  const ev: AgentEvent = { ...e, summary: e.summary.slice(0, 240), id: nextAgentId("ag"), ts: Date.now() };
  state.events.unshift(ev);
  state.events.length = Math.min(state.events.length, 500);
  return ev;
}

/** Events visible to a viewer. Workers see only events about their own records. */
export function eventsFor(industry: IndustryId, view: { employer: boolean; workerId?: string }, limit = 60): AgentEvent[] {
  return state.events
    .filter((e) => e.industry === industry && (view.employer || (!!view.workerId && e.workerId === view.workerId)))
    .slice(0, limit)
    .map((e) => { if (view.employer) return e; const { workerId: _w, ...rest } = e; return rest; }); // eslint-disable-line @typescript-eslint/no-unused-vars
}

export const saveReport = (r: CaseAgentReport) => void state.reports.set(r.caseId, r);
export const getReport = (caseId: string) => state.reports.get(caseId);

export const addFlag = (f: WorkloadFlag) => void state.flags.unshift(f);
export const getFlag = (id: string) => state.flags.find((f) => f.id === id);
export const flagsFor = (industry: IndustryId, workerId?: string) =>
  state.flags.filter((f) => f.industry === industry && (!workerId || f.workerId === workerId));