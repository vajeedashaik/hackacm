// Agent activity -> SimEvents (source "agent"). Same contract as adapter.ts: real backend records in,
// simulation events out. Everything here comes from persisted agent events, never from the scripted demo.
import { categoryOf } from "./types";
import type { AgentEvent } from "../lib/ai/types";
import type { SimEvent, SimEventType } from "./types";

type Topic = NonNullable<AgentEvent["topic"]>;

// "attendance" disputes have no attendance.* review type in the simulation, so they appear under hours.
const REVIEW: Record<Topic, SimEventType> = {
  wage: "wage.review-required", safety: "safety.review-required",
  attendance: "hours.review-required", hours: "hours.review-required",
};
const DEFAULT: Record<Topic, SimEventType> = {
  wage: "wage.check-completed", safety: "safety.inspection",
  attendance: "hours.overtime-concern", hours: "hours.fatigue-alert",
};

export function adaptAgentEvent(e: AgentEvent): SimEvent {
  const topic: Topic = e.topic ?? "wage";
  const needsHuman = e.type === "human-review-required" || e.type === "action-proposed";
  const type = needsHuman ? REVIEW[topic] : DEFAULT[topic];
  return {
    id: `agent:${e.id}`, source: "agent", type, category: categoryOf(type), industry: e.industry, ts: e.ts, seq: 0,
    severity: e.outcome === "failed" ? "warning" : needsHuman ? "warning" : "info",
    title: e.summary,
    detail: `Recorded by the ${e.actor} agent${e.source ? ` (${e.source === "model" ? "AI model, output validated" : "rule-based"})` : ""}. Outcome: ${e.outcome}.`,
    characterId: e.workerId,
    confidential: true, // always case-related: employer view only
  };
}

export const adaptAgentEvents = (events: AgentEvent[], industry: string) =>
  events.filter((e) => e.industry === industry).map(adaptAgentEvent);
