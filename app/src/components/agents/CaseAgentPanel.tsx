"use client";

import { useState } from "react";
import { useFair } from "@/lib/client";
import { Msg, useAction } from "@/components/common";
import { refreshAgents, useAgents } from "./useAgents";
import type { CaseAgentReport } from "@/lib/ai/types";

const LABEL: Record<CaseAgentReport["proposal"]["action"], string> = {
  start_review: "Start review", request_info: "Ask for more information (internal note)",
  resolve_backpay: "Approve back-pay", reject_claim: "Reject the claim", resolve: "Mark as resolved",
};

/** Employer view of what the agents found, plus the human accept / dismiss step for their suggestion. */
export function CaseAgentPanel({ caseId, reviewer }: { caseId: string; reviewer: string }) {
  const { industry, call } = useFair();
  const a = useAgents();
  const act = useAction();
  const [note, setNote] = useState("");
  const r = a?.reports.find((x) => x.caseId === caseId);
  const report = r && "proposal" in r ? r : undefined;

  if (!a) return null;
  if (!report) {
    return (
      <section className="rounded-lg border-2 border-dashed border-line p-3 text-sm text-muted" aria-label="AI analysis">
        AI analysis has not finished for this case.{" "}
        <button className="underline" disabled={act.busy}
          onClick={async () => { await act.run(() => call("POST", "/api/agents/investigate", { industry, caseId }), "Analysis updated"); await refreshAgents(); }}>
          Run it now
        </button>
        <Msg msg={act.msg} />
      </section>
    );
  }

  const p = report.proposal;
  const decide = (decision: "accept" | "reject") =>
    act.run(async () => {
      const out = await call("POST", `/api/agents/proposals/${caseId}`, { industry, decision, reviewer, note });
      await refreshAgents();
      return out;
    }, decision === "accept" ? "Suggestion applied through the case lifecycle" : "Suggestion dismissed");

  return (
    <section className="space-y-2 rounded-lg border-2 border-line bg-[#f7f4ea] p-3 text-sm" aria-label="AI analysis">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">AI-assisted analysis</h3>
        {Object.entries(report.sources).map(([k, v]) => (
          <span key={k} className="pill bg-[#efe7d4] text-ink" title={`${k} agent`}>{k}: {v}</span>
        ))}
        {report.urgency && <span className="pill bg-amber-100 text-warn">urgency {report.urgency}</span>}
      </div>
      <p>{report.summary}</p>
      {report.attendance && report.attendance.flags.length > 0 && (
        <ul className="list-disc pl-5">
          {report.attendance.flags.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
      {report.missingInfo.length > 0 && (
        <p><strong>Missing information:</strong> {report.missingInfo.join(" · ")}</p>
      )}
      {report.nextSteps.length > 0 && (
        <ol className="list-decimal pl-5">{report.nextSteps.map((s) => <li key={s}>{s}</li>)}</ol>
      )}

      <div className="rounded-lg bg-surface p-2">
        <p>
          <strong>Suggested:</strong> {LABEL[p.action]}{p.amount ? ` ₹${p.amount}` : ""} — {p.reason}{" "}
          <span className="pill bg-[#efe7d4] text-ink">{p.status}</span>
        </p>
        <p className="text-xs text-muted">Nothing changes until you accept. The amount comes from the rule-based calculation, not the AI model.</p>
        {p.status === "pending" && (
          <fieldset className="mt-2 space-y-2" disabled={act.busy}>
            <label htmlFor={`pn-${caseId}`} className="block text-xs font-semibold">Note for the worker (optional)</label>
            <input id={`pn-${caseId}`} className="field" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-primary" onClick={() => decide("accept")}>Accept and apply</button>
              <button className="btn" onClick={() => decide("reject")}>Dismiss suggestion</button>
              <button className="btn" onClick={async () => { await act.run(() => call("POST", "/api/agents/investigate", { industry, caseId }), "Analysis re-run"); await refreshAgents(); }}>
                Re-run analysis
              </button>
            </div>
          </fieldset>
        )}
        {p.status === "superseded" && <p className="text-xs text-muted">You decided this case yourself, so the suggestion no longer applies.</p>}
      </div>
      <Msg msg={act.msg} />
    </section>
  );
}
