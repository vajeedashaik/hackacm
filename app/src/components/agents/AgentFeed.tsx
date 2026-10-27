"use client";

import { useAgents } from "./useAgents";
import type { AgentEvent } from "@/lib/ai/types";

const ICON: Record<AgentEvent["type"], string> = {
  "agent-invoked": "🤖", "evidence-retrieved": "🔎", "calculation-completed": "🧮", "issue-classified": "🏷️",
  "action-proposed": "💡", "human-review-required": "🧑‍⚖️", "action-accepted": "✅", "action-rejected": "🚫",
  "case-updated": "📋", "agent-failed": "⚠️",
};
const ROLE: Record<string, string> = {
  orchestrator: "Orchestrator", "worker-persona": "Worker assistant", "supervisor-persona": "Supervisor assistant",
  attendance: "Attendance agent", "wage-analysis": "Wage agent", "safety-triage": "Safety triage",
  "fairness-case": "Case agent", employer: "Employer",
};

/** Persisted agent activity: who did what, with a concise safe summary. No reasoning text, no credentials. */
export function AgentFeed({ className = "" }: { className?: string }) {
  const a = useAgents();
  return (
    <section className={`card ${className}`} aria-label="AI agent activity">
      <h2 className="pixel mb-1 text-sm font-bold uppercase">AI agent activity</h2>
      {a && !a.provider.configured && (
        <p className="mb-2 text-xs text-muted">No AI model is configured, so agents use rule-based fallbacks. Results are labelled “rules”.</p>
      )}
      <ul className="max-h-80 space-y-2 overflow-auto" aria-live="polite">
        {a?.events.length ? a.events.map((e) => (
          <li key={e.id} className="text-sm">
            <span aria-hidden>{ICON[e.type]} </span>
            <strong>{ROLE[e.actor] ?? e.actor}</strong>: {e.summary}
            {e.source && <span className="pill ml-1 bg-[#efe7d4] text-ink">{e.source}</span>}
            {e.outcome === "failed" && <span className="pill ml-1 bg-red-100 text-bad">failed</span>}
            {e.outcome === "pending" && <span className="pill ml-1 bg-amber-100 text-warn">pending</span>}
            <span className="ml-2 text-xs text-muted">{new Date(e.ts).toLocaleTimeString()}</span>
          </li>
        )) : <li className="text-sm text-muted">{a ? "No agent activity yet. File a report to see the agents work." : "Loading…"}</li>}
      </ul>
    </section>
  );
}
