"use client";

import { useAgents } from "./useAgents";

/** Plain-language explanation of a worker's own case, written by the agents. The figures come from the rule-based calculation. */
export function WorkerCaseExplanation({ caseId }: { caseId: string }) {
  const a = useAgents();
  const r = a?.reports.find((x) => x.caseId === caseId);
  if (!r) return null;
  const labels = Object.values(r.sources);
  return (
    <div className="rounded-lg bg-[#f7f4ea] p-2 text-sm">
      <p className="font-semibold">
        What the checks found{" "}
        <span className="pill bg-[#efe7d4] text-ink">{labels.includes("model") ? "AI-assisted" : "automatic check"}</span>
      </p>
      <p>{r.explanation}</p>
      {r.missingInfo.length > 0 && <p className="text-muted">Helpful to add: {r.missingInfo.join(" · ")}</p>}
      <p className="text-xs text-muted">This is an explanation, not a decision. Your employer decides.</p>
    </div>
  );
}
