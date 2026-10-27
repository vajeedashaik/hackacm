"use client";

import { useState } from "react";
import { useFair, useT } from "@/lib/client";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { EmptyState } from "@/components/ui";
import { Msg, useAction } from "@/components/common";
import { useExplain } from "@/components/worker/Fatigue";
import { useAttention } from "@/components/employer/Overview";
import { INDUSTRIES, industryIds } from "@/lib/industries";
import { useLabel } from "@/lib/client";

export function AlertsPanel() {
  const { cfg } = useFair();
  const t = useT();
  const explain = useExplain();
  const { alerts } = useAttention();
  const name = (id: string) => cfg.workers.find((w) => w.id === id)?.name ?? id;
  return (
    <section className="space-y-3" aria-labelledby="al-h">
      <h2 id="al-h" className="text-lg font-bold">{t("fatigue_title")}</h2>
      <p className="text-sm text-muted">{t("fatigue_disclaimer")}</p>
      {alerts.length === 0 ? <EmptyState title={t("no_alerts_emp")} hint={t("no_alerts_hint")} /> : (
        <ul className="space-y-2">
          {alerts.map((a) => (
            <li key={a.key} className="card border-warn">
              <p className="font-bold text-warn">⚠ {name(a.workerId)} — {t(`fr_${a.rule}`)}</p>
              <p className="text-sm">{explain(a)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function FeedbackPanel({ reviewer }: { reviewer: string }) {
  const { cfg, snap, call } = useFair();
  const t = useT();
  const act = useAction();
  const items = snap?.feedback ?? [];
  const name = (id?: string) => cfg.workers.find((w) => w.id === id)?.name ?? "—";
  return (
    <section className="space-y-3" aria-labelledby="fb-h">
      <h2 id="fb-h" className="text-lg font-bold">{t("tab_feedback")}</h2>
      <p className="text-sm text-muted">{t("fb_emp_note")}</p>
      <Msg msg={act.msg} />
      {items.length === 0 ? <EmptyState title={t("no_feedback")} /> : (
        <ul className="space-y-2">
          {items.map((f) => (
            <li key={f.id} className="card space-y-1">
              <p className="flex flex-wrap items-center gap-2">
                <span className={`pill ${f.mode === "anonymous" ? "bg-[#efe7d4] text-ink" : "bg-blue-100 text-blue-800"}`}>{t(`fb_${f.mode}`)}</span>
                <span className="pill bg-[#efe7d4] text-ink">{t(`topic_${f.category}` as "topic_pay")}</span>
                <span className="text-sm text-muted">{f.mode === "anonymous" ? fmtDate(new Date(f.ts + 330 * 60_000).toISOString().slice(0, 10)) : fmtDateTime(f.ts)}</span>
                {f.mode === "confidential" && <span className="text-sm">{t("from")}: <strong>{name(f.reporterId)}</strong></span>}
              </p>
              <p>“{f.text}”</p>
              {f.reviewed ? <p className="text-sm text-good">✓ {t("reviewed")}</p> : (
                <button className="btn !min-h-11 text-sm" disabled={act.busy} onClick={() => act.run(() => call("PATCH", `/api/feedback/${f.id}`, { reviewer }), t("marked_reviewed"))}>{t("mark_reviewed")}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SkillsPanel({ reviewer }: { reviewer: string }) {
  const { cfg, snap, call } = useFair();
  const t = useT();
  const act = useAction();
  const skills = snap?.skills ?? [];
  const queue = skills.filter((s) => s.status === "verification_requested");
  const name = (id: string) => cfg.workers.find((w) => w.id === id)?.name ?? id;
  const decide = (id: string, action: "verify" | "decline") =>
    act.run(() => call("PATCH", `/api/skills/${id}`, { action, reviewer }), action === "verify" ? t("verified_ok") : t("declined_ok"));
  return (
    <>
      <section className="card space-y-2" aria-labelledby="vq-h">
        <h2 id="vq-h" className="text-lg font-bold">{t("verif_queue")}</h2>
        <Msg msg={act.msg} />
        {queue.length === 0 ? <p className="text-muted">{t("verif_empty")}</p> : (
          <ul className="divide-y divide-line">
            {queue.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <div className="min-w-48 flex-1">
                  <p className="font-semibold">{name(s.workerId)} — {s.name}{s.year ? ` (${s.year})` : ""}</p>
                  <p className="text-sm text-muted">{t(`kind_${s.kind}`)}{s.detail ? ` · ${s.detail}` : ""}</p>
                </div>
                <button className="btn btn-primary" disabled={act.busy} onClick={() => decide(s.id, "verify")}>{t("verify")}</button>
                <button className="btn" disabled={act.busy} onClick={() => decide(s.id, "decline")}>{t("decline")}</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card space-y-2" aria-labelledby="so-h">
        <h2 id="so-h" className="text-lg font-bold">{t("skills_overview")}</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">{t("name")}</th><th scope="col">{t("kind_skill")}</th><th scope="col">{t("kind_training")}</th><th scope="col">{t("kind_experience")}</th><th scope="col">{t("sk_verified")}</th></tr></thead>
            <tbody>
              {cfg.workers.map((w) => {
                const mine = skills.filter((s) => s.workerId === w.id);
                const n = (k: string) => mine.filter((s) => s.kind === k).length;
                return (
                  <tr key={w.id}>
                    <th scope="row" className="text-left">{w.name}<span className="block text-xs font-normal text-muted">{w.role}</span></th>
                    <td>{n("skill")}</td><td>{n("training")}</td><td>{n("experience")}</td>
                    <td>{mine.filter((s) => s.status === "verified").length}/{mine.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {skills.length === 0 && <p className="text-sm text-muted">{t("skills_none_yet")}</p>}
      </section>
    </>
  );
}

export function ConfigPanel() {
  const { industry } = useFair();
  const t = useT();
  const label = useLabel();
  return (
    <section className="space-y-3" aria-labelledby="cfg-h">
      <h2 id="cfg-h" className="text-lg font-bold">{t("tab_config")}</h2>
      <p className="text-sm text-muted">{t("config_intro")}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {industryIds.map((id) => {
          const c = INDUSTRIES[id];
          const rows: [string, string][] = [
            [t("cfg_shift"), `${c.shift.start}–${c.shift.end}`],
            [t("cfg_ot"), `> ${c.overtimeAfter} h/day × ${c.overtimeMultiplier}`],
            [t("cfg_daily"), `${c.maxSafeHours} h`],
            [t("cfg_weekly"), `${c.maxWeeklyHours} h`],
            [t("cfg_rest"), `${c.minRestHours} h`],
            [t("cfg_streak"), `${c.maxConsecutiveDays}`],
            [label(c.allowancePerDay.label), `₹${c.allowancePerDay.amount}/day`],
            [label(c.deductionPerDay.label), `₹${c.deductionPerDay.amount}/day`],
            [t("cfg_reviewers"), c.reviewers.join(", ")],
            [t("cfg_workers"), c.workers.map((w) => `${w.name} (₹${w.hourlyRate})`).join(", ")],
          ];
          return (
            <article key={id} className={`card ${id === industry ? "!border-brand" : ""}`} aria-label={c.label.en}>
              <h3 className="font-bold">{label(c.label)} {id === industry && <span className="pill bg-green-100 text-good">{t("active")}</span>}</h3>
              <p className="text-sm text-muted">{c.site}</p>
              <dl className="mt-2 space-y-1 text-sm">
                {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-3"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function AuditPanel() {
  const { snap, cfg } = useFair();
  const t = useT();
  const [q, setQ] = useState("");
  const rows = (snap?.audit ?? []).filter((a) => !q || `${a.caseId ?? ""} ${a.actor} ${a.action} ${a.note ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  void cfg;
  return (
    <section className="card space-y-2" aria-labelledby="au-h">
      <h2 id="au-h" className="text-lg font-bold">{t("tab_audit")}</h2>
      <label htmlFor="au-q" className="block text-sm font-semibold">{t("search")}</label>
      <input id="au-q" className="field max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} />
      {rows.length === 0 ? <EmptyState title={t("no_audit")} /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">{t("time")}</th><th scope="col">{t("actor")}</th><th scope="col">{t("action")}</th><th scope="col">{t("case")}</th><th scope="col">{t("visibility")}</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{fmtDateTime(a.ts)}</td>
                  <td>{a.actor}<span className="block text-xs text-muted">{a.role}</span></td>
                  <td>{a.action}{a.note && <span className="block text-muted">“{a.note}”</span>}</td>
                  <td>{a.caseId ?? "—"}</td>
                  <td>{a.visibility === "internal" ? t("internal") : t("visible_worker")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
