"use client";

import { useState } from "react";
import { useFair, useT } from "@/lib/client";
import { fmtDate, inr } from "@/lib/format";
import { Dialog, EmptyState, Notice } from "@/components/ui";
import { WorkerCaseExplanation } from "@/components/agents/WorkerCaseExplanation";
import { EvidenceLinks, Msg, PriorityPill, StatusPill, Timeline, useAction } from "@/components/common";
import type { Case } from "@/lib/types";

export function Cases() {
  const { snap, workerId, call } = useFair();
  const t = useT();
  const [reopenId, setReopenId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const act = useAction();

  const mine = (snap?.cases ?? []).filter((c) => c.workerId === workerId);

  const reopen = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await act.run(
      () => call("POST", `/api/cases/${reopenId}`, { action: "reopen", workerId, reason }),
      t("reopened"),
    );
    if (ok) { setReopenId(null); setReason(""); }
  };

  if (!snap) return <p className="text-muted">{t("loading")}</p>;
  if (mine.length === 0) return <EmptyState title={t("no_cases")} hint={t("no_cases_hint")} />;

  return (
    <>
      <Msg msg={act.msg} />
      {mine.map((c) => <CaseCard key={c.id} c={c} onReopen={() => { setReopenId(c.id); act.setMsg(null); }} />)}
      <Dialog open={reopenId !== null} title={t("reopen_title")} onClose={() => setReopenId(null)}>
        <form onSubmit={reopen} className="space-y-3">
          <p className="text-sm text-muted">{t("reopen_help")}</p>
          <div>
            <label htmlFor="reopen-reason" className="block font-semibold">{t("why_disagree")}</label>
            <textarea id="reopen-reason" className="field" required minLength={5} maxLength={500} value={reason}
              onChange={(e) => setReason(e.target.value)} />
          </div>
          {act.msg && !act.msg.ok && <Notice tone="error">{act.msg.text}</Notice>}
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={act.busy}>{t("reopen")}</button>
            <button type="button" className="btn" onClick={() => setReopenId(null)}>{t("cancel")}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function CaseCard({ c, onReopen }: { c: Case; onReopen: () => void }) {
  const { snap } = useFair();
  const t = useT();
  const entries = (snap?.audit ?? []).filter((a) => a.caseId === c.id);
  const closed = c.status === "resolved" || c.status === "rejected";
  return (
    <article className="card space-y-2" aria-label={`${t(`ty_${c.type}`)} ${c.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">{c.id} · {t(`ty_${c.type}`)}</h3>
        <StatusPill status={c.status} /> <PriorityPill priority={c.priority} />
        <span className="ml-auto text-sm text-muted">{fmtDate(c.date)}</span>
      </div>
      <p className="font-semibold">{c.title}</p>
      {c.description && <p className="text-sm">“{c.description}”</p>}
      {c.wage && (
        <p className="text-sm">
          {t("wage_result", { expected: inr(c.wage.analysis.expectedPay), paid: inr(c.wage.amountPaid), short: inr(c.wage.analysis.shortfall) })}
        </p>
      )}
      <WorkerCaseExplanation caseId={c.id} />
      <p className="text-sm text-muted">
        {c.assignedTo ? t("assigned_to", { who: c.assignedTo }) : t("not_assigned")}
        {c.reopenCount > 0 && ` · ${t("reopened_n", { n: c.reopenCount })}`}
      </p>
      {closed && (
        <Notice tone={c.status === "resolved" ? "success" : "warning"}>
          {c.status === "resolved" ? t("decision_resolved") : t("decision_rejected")}
          {c.paidBack !== undefined && ` ${t("backpay", { amt: inr(c.paidBack) })}`}
          {c.resolutionNote ? ` — “${c.resolutionNote}”` : ""}
        </Notice>
      )}
      <EvidenceLinks c={c} />
      <details>
        <summary className="cursor-pointer font-semibold">{t("history")}</summary>
        <div className="mt-2"><Timeline entries={entries} /></div>
      </details>
      {closed && <button className="btn" onClick={onReopen}>{t("dispute")}</button>}
    </article>
  );
}
