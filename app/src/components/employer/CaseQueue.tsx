"use client";

import { useState } from "react";
import { useFair, useT } from "@/lib/client";
import { hoursBetween } from "@/lib/calc";
import { fmtDate, fmtDateTime, hrs, inr } from "@/lib/format";
import { EmptyState } from "@/components/ui";
import { CaseAgentPanel } from "@/components/agents/CaseAgentPanel";
import { EvidenceLinks, Msg, PriorityPill, StatusPill, Timeline, useAction } from "@/components/common";
import type { Case, CaseStatus, CaseType, Priority } from "@/lib/types";

const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

export function CaseQueue({ reviewer }: { reviewer: string }) {
  const { cfg, snap } = useFair();
  const t = useT();
  const [type, setType] = useState<CaseType | "">("");
  const [status, setStatus] = useState<CaseStatus | "active" | "">("active");
  const [priority, setPriority] = useState<Priority | "">("");
  const [assignee, setAssignee] = useState("");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const name = (id: string) => cfg.workers.find((w) => w.id === id)?.name ?? id;
  const all = snap?.cases ?? [];
  const rows = all
    .filter((c) => !type || c.type === type)
    .filter((c) => !status || (status === "active" ? c.status === "open" || c.status === "in_review" : c.status === status))
    .filter((c) => !priority || c.priority === priority)
    .filter((c) => !assignee || (assignee === "none" ? !c.assignedTo : c.assignedTo === assignee))
    .filter((c) => !q || `${c.id} ${name(c.workerId)} ${c.title}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.createdAt - a.createdAt);
  const sel = all.find((c) => c.id === selected);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="min-w-0 space-y-3">
        <form className="card grid grid-cols-2 gap-2 sm:grid-cols-3" role="search" aria-label={t("filters")} onSubmit={(e) => e.preventDefault()}>
          <Select id="f-type" label={t("type")} value={type} onChange={(v) => setType(v as CaseType | "")}
            options={[["", t("all")], ["wage", t("ty_wage")], ["safety", t("ty_safety")], ["attendance", t("ty_attendance")]]} />
          <Select id="f-status" label={t("status")} value={status} onChange={(v) => setStatus(v as CaseStatus | "active" | "")}
            options={[["active", t("f_active")], ["", t("all")], ["open", t("st_open")], ["in_review", t("st_in_review")], ["resolved", t("st_resolved")], ["rejected", t("st_rejected")]]} />
          <Select id="f-pri" label={t("priority")} value={priority} onChange={(v) => setPriority(v as Priority | "")}
            options={[["", t("all")], ["urgent", t("pr_urgent")], ["high", t("pr_high")], ["medium", t("pr_medium")], ["low", t("pr_low")]]} />
          <Select id="f-asg" label={t("assignee")} value={assignee} onChange={setAssignee}
            options={[["", t("all")], ["none", t("not_assigned")], ...cfg.reviewers.map((r) => [r, r] as [string, string])]} />
          <div className="col-span-2">
            <label htmlFor="f-q" className="block text-sm font-semibold">{t("search")}</label>
            <input id="f-q" className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="FS-0001, Murugan…" />
          </div>
        </form>

        <p className="text-sm text-muted" aria-live="polite">{t("n_cases", { n: rows.length, total: all.length })}</p>
        {!snap ? <p className="text-muted">{t("loading")}</p> : rows.length === 0 ? (
          <EmptyState title={all.length ? t("no_match") : t("no_cases_emp")} hint={all.length ? t("no_match_hint") : t("no_cases_emp_hint")} />
        ) : (
          <ul className="space-y-2">
            {rows.map((c) => (
              <li key={c.id}>
                <button className={`card w-full text-left hover:border-brand ${selected === c.id ? "!border-brand" : ""}`}
                  aria-pressed={selected === c.id} onClick={() => setSelected(c.id)}>
                  <span className="flex flex-wrap items-center gap-2">
                    <strong>{c.id}</strong> <StatusPill status={c.status} /> <PriorityPill priority={c.priority} />
                    <span className="pill bg-[#efe7d4] text-ink">{t(`ty_${c.type}`)}</span>
                  </span>
                  <span className="mt-1 block font-semibold">{name(c.workerId)} · {c.title}</span>
                  <span className="block text-sm text-muted">
                    {c.assignedTo ?? t("not_assigned")} · {fmtDateTime(c.updatedAt)}{c.reopenCount ? ` · ${t("reopened_n", { n: c.reopenCount })}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="min-w-0" aria-live="polite">
        {sel ? <CaseDetail key={sel.id} c={sel} reviewer={reviewer} /> : <EmptyState title={t("select_case")} hint={t("select_case_hint")} />}
      </div>
    </div>
  );
}

function Select({ id, label, value, onChange, options }: {
  id: string; label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function CaseDetail({ c, reviewer }: { c: Case; reviewer: string }) {
  const { cfg, snap, call } = useFair();
  const t = useT();
  const [assignTo, setAssignTo] = useState(c.assignedTo ?? "");
  const [decisionNote, setDecisionNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [paidBack, setPaidBack] = useState(c.wage ? String(c.wage.analysis.shortfall) : "");
  const [corrected, setCorrected] = useState("");
  const act = useAction();
  const w = cfg.workers.find((x) => x.id === c.workerId);
  const closed = c.status === "resolved" || c.status === "rejected";
  const entries = (snap?.audit ?? []).filter((a) => a.caseId === c.id);
  const linked = (snap?.attendance ?? []).filter((a) => c.attendanceIds.includes(a.id));
  const recorded = linked.reduce((s, a) => s + hoursBetween(a.clockIn, a.clockOut ?? snap?.now ?? 0), 0);

  const patch = (body: Record<string, unknown>, ok: string) =>
    act.run(() => call("PATCH", `/api/cases/${c.id}`, { reviewer, ...body }), ok);

  return (
    <article className="card space-y-3" aria-label={`${t("case_detail")} ${c.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">{c.id}</h2>
        <StatusPill status={c.status} /> <PriorityPill priority={c.priority} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div><dt className="text-muted">{t("name")}</dt><dd className="font-semibold">{w?.name} · {w?.role}</dd></div>
        <div><dt className="text-muted">{t("type")}</dt><dd className="font-semibold">{t(`ty_${c.type}`)} / {c.category.replaceAll("_", " ")}</dd></div>
        <div><dt className="text-muted">{t("date")}</dt><dd className="font-semibold">{fmtDate(c.date)}</dd></div>
        <div><dt className="text-muted">{t("assignee")}</dt><dd className="font-semibold">{c.assignedTo ?? t("not_assigned")}</dd></div>
        {c.location && <div><dt className="text-muted">{t("work_area")}</dt><dd className="font-semibold">{c.location}</dd></div>}
        {c.severity && <div><dt className="text-muted">{t("severity")}</dt><dd className="font-semibold">{t(`sev_${c.severity}`)}</dd></div>}
      </dl>
      {c.description && <p>“{c.description}”</p>}

      {c.wage && (
        <div className="rounded-lg bg-[#f3efe3] p-3 text-sm">
          <p className="font-semibold">{t("wage_check")}</p>
          <p>{t("claimed_hours", { h: c.wage.hoursWorked, r: c.wage.analysis.regularHours, o: c.wage.analysis.overtimeHours })}</p>
          <p>{t("wage_result", { expected: inr(c.wage.analysis.expectedPay), paid: inr(c.wage.amountPaid), short: inr(c.wage.analysis.shortfall) })}</p>
          <p className="text-muted">
            {linked.length ? t("recorded_hours", { h: hrs(recorded) }) : t("no_records_date")}
            {linked.length > 0 && Math.abs(recorded - c.wage.hoursWorked) > 0.25 && <strong className="text-warn"> · {t("hours_mismatch")}</strong>}
          </p>
        </div>
      )}
      {c.type === "attendance" && linked[0] && (
        <p className="rounded-lg bg-[#f3efe3] p-3 text-sm">{t("linked_record", { h: hrs(recorded), method: t(`m_${linked[0].method}`) })}</p>
      )}
      <EvidenceLinks c={c} />
      <CaseAgentPanel caseId={c.id} reviewer={reviewer} />

      {closed ? (
        <div className="rounded-lg border-2 border-line p-3 text-sm">
          <p className="font-semibold">{c.status === "resolved" ? t("decision_resolved") : t("decision_rejected")}</p>
          {c.paidBack !== undefined && <p>{t("backpay", { amt: inr(c.paidBack) })}</p>}
          {c.resolutionNote && <p>“{c.resolutionNote}”</p>}
          <p className="text-muted">{t("closed_note")}</p>
        </div>
      ) : (
        <fieldset className="space-y-3 rounded-lg border-2 border-line p-3" disabled={act.busy}>
          <legend className="px-1 font-semibold">{t("review_actions")}</legend>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1">
              <label htmlFor="assign" className="block text-sm font-semibold">{t("assign_to")}</label>
              <select id="assign" className="field" value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
                <option value="">{t("select")}</option>
                {cfg.reviewers.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <button className="btn" disabled={!assignTo} onClick={() => patch({ action: "assign", assignTo }, t("assigned_ok", { who: assignTo }))}>{t("assign")}</button>
            {c.status === "open" && <button className="btn" onClick={() => patch({ action: "review" }, t("review_started"))}>{t("start_review")}</button>}
          </div>

          <div>
            <label htmlFor="inote" className="block text-sm font-semibold">{t("internal_note")}</label>
            <div className="flex gap-2">
              <input id="inote" className="field" maxLength={500} value={internalNote} onChange={(e) => setInternalNote(e.target.value)} />
              <button className="btn" disabled={!internalNote.trim()}
                onClick={async () => { if (await patch({ action: "note", note: internalNote }, t("note_added"))) setInternalNote(""); }}>{t("add")}</button>
            </div>
            <p className="text-xs text-muted">{t("internal_hint")}</p>
          </div>

          {c.wage && c.wage.analysis.shortfall > 0 && (
            <div>
              <label htmlFor="payback" className="block text-sm font-semibold">{t("backpay_amt", { max: inr(c.wage.analysis.shortfall) })}</label>
              <input id="payback" className="field max-w-48" type="number" min="0" max={c.wage.analysis.shortfall} value={paidBack} onChange={(e) => setPaidBack(e.target.value)} />
            </div>
          )}
          {c.type === "attendance" && linked[0]?.clockOut && (
            <div>
              <label htmlFor="corr" className="block text-sm font-semibold">{t("corrected_hours")}</label>
              <input id="corr" className="field max-w-48" type="number" step="0.25" min="0.25" max="16" value={corrected} onChange={(e) => setCorrected(e.target.value)} />
            </div>
          )}
          <div>
            <label htmlFor="dnote" className="block text-sm font-semibold">{t("decision_note")}</label>
            <textarea id="dnote" className="field" maxLength={500} rows={2} value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary"
              onClick={() => patch({ action: "resolve", note: decisionNote, paidBack: c.wage ? paidBack : undefined, correctedHours: corrected || undefined }, t("resolved_ok"))}>
              {t("resolve")}
            </button>
            <button className="btn" onClick={() => patch({ action: "reject", note: decisionNote }, t("rejected_ok"))}>{t("reject")}</button>
          </div>
        </fieldset>
      )}
      <Msg msg={act.msg} />

      <div>
        <h3 className="mb-2 font-semibold">{t("history")}</h3>
        <Timeline entries={entries} />
      </div>
    </article>
  );
}
