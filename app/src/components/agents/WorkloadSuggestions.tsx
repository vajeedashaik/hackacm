"use client";

import { useFair } from "@/lib/client";
import { EmptyState } from "@/components/ui";
import { Msg, useAction } from "@/components/common";
import { refreshAgents, useAgents } from "./useAgents";

/** Supervisor-assistant suggestions for workload-rule breaches. Accepting records the decision; it does not edit rosters or pay. */
export function WorkloadSuggestions({ reviewer }: { reviewer: string }) {
  const { cfg, industry, call } = useFair();
  const a = useAgents();
  const act = useAction();
  const name = (id: string) => cfg.workers.find((w) => w.id === id)?.name ?? id;
  const flags = a?.flags ?? [];

  const decide = (id: string, decision: "accept" | "reject") =>
    act.run(async () => {
      const out = await call("POST", `/api/agents/workload/${encodeURIComponent(id)}`, { industry, decision, reviewer });
      await refreshAgents();
      return out;
    }, decision === "accept" ? "Suggestion accepted and recorded" : "Suggestion rejected");

  return (
    <section className="space-y-2" aria-label="Supervisor assistant suggestions">
      <h3 className="text-lg font-bold">Supervisor assistant suggestions</h3>
      <Msg msg={act.msg} />
      {flags.length === 0 ? (
        <EmptyState title="No workload suggestions." hint="They appear when a worker passes a configured hours or rest limit." />
      ) : flags.map((f) => (
        <article key={f.id} className="card space-y-1 text-sm">
          <p className="font-semibold">{name(f.workerId)} · {f.detail}</p>
          <p>Suggested response: {f.proposedResponse}</p>
          <p className="text-xs text-muted">
            Chosen from the {cfg.reviewers[0]} policy list. Accepting records your decision; any roster change is yours to make.
          </p>
          {f.status === "pending" ? (
            <div className="flex gap-2">
              <button className="btn btn-primary" disabled={act.busy} onClick={() => decide(f.id, "accept")}>Accept</button>
              <button className="btn" disabled={act.busy} onClick={() => decide(f.id, "reject")}>Reject</button>
            </div>
          ) : <p className="pill bg-[#efe7d4] text-ink w-fit">{f.status} by {f.decidedBy}</p>}
        </article>
      ))}
    </section>
  );
}
