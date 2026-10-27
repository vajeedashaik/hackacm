"use client";

import { useFair, useT } from "@/lib/client";
import { dayOf, fatigueAlerts, hoursBetween, weekStart } from "@/lib/calc";
import { hrs, inr } from "@/lib/format";
import { Stat } from "@/components/ui";

export type EmployerTab = "overview" | "cases" | "attendance" | "alerts" | "feedback" | "skills" | "config" | "audit";

/** Everything here is derived from the shared snapshot, so no figure is hard-coded. */
export function useAttention() {
  const { cfg, snap } = useFair();
  const now = snap?.now ?? 0;
  const cases = snap?.cases ?? [];
  const active = cases.filter((c) => c.status === "open" || c.status === "in_review");
  const alerts = cfg.workers.flatMap((w) => fatigueAlerts(cfg, snap?.attendance ?? [], w.id, now));
  return {
    active,
    unassigned: active.filter((c) => !c.assignedTo),
    urgent: active.filter((c) => c.priority === "urgent" || c.priority === "high"),
    skillQueue: (snap?.skills ?? []).filter((s) => s.status === "verification_requested"),
    newFeedback: (snap?.feedback ?? []).filter((f) => !f.reviewed),
    alerts,
  };
}

export function Overview({ go }: { go: (t: EmployerTab) => void }) {
  const { cfg, snap } = useFair();
  const t = useT();
  const a = useAttention();
  const now = snap?.now ?? 0;
  const today = dayOf(now);
  const wk = weekStart(today);
  const att = snap?.attendance ?? [];
  const onSite = att.filter((r) => !r.clockOut).length;
  const owed = a.active.reduce((s, c) => s + (c.wage?.analysis.shortfall ?? 0), 0);
  const backPay = (snap?.cases ?? []).reduce((s, c) => s + (c.paidBack ?? 0), 0);

  const items: { n: number; text: string; tab: EmployerTab }[] = ([
    { n: a.unassigned.length, text: t("att_unassigned", { n: a.unassigned.length }), tab: "cases" },
    { n: a.urgent.length, text: t("att_urgent", { n: a.urgent.length }), tab: "cases" },
    { n: a.alerts.length, text: t("att_alerts", { n: a.alerts.length }), tab: "alerts" },
    { n: a.skillQueue.length, text: t("att_skills", { n: a.skillQueue.length }), tab: "skills" },
    { n: a.newFeedback.length, text: t("att_feedback", { n: a.newFeedback.length }), tab: "feedback" as EmployerTab },
  ] as { n: number; text: string; tab: EmployerTab }[]).filter((i) => i.n > 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label={t("st_active_cases")} value={String(a.active.length)} />
        <Stat label={t("st_unpaid")} value={inr(owed)} />
        <Stat label={t("st_backpay")} value={inr(backPay)} />
        <Stat label={t("st_on_site")} value={`${onSite}/${cfg.workers.length}`} />
        <Stat label={t("st_alerts")} value={String(a.alerts.length)} />
      </div>

      <section className="card space-y-2" aria-labelledby="attn-h">
        <h2 id="attn-h" className="text-lg font-bold">{t("needs_attention")}</h2>
        {items.length === 0 ? <p className="text-muted">{t("all_clear")}</p> : (
          <ul className="space-y-1">
            {items.map((i) => (
              <li key={i.text}>
                <button className="btn w-full justify-between text-left" onClick={() => go(i.tab)}>
                  <span>{i.text}</span><span aria-hidden>→</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-2" aria-labelledby="wf-h">
        <h2 id="wf-h" className="text-lg font-bold">{t("workforce")}</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t("name")}</th><th scope="col">{t("status")}</th><th scope="col">{t("hours_today")}</th>
                <th scope="col">{t("hours_week")}</th><th scope="col">{t("cases")}</th><th scope="col">{t("tab_alerts")}</th>
              </tr>
            </thead>
            <tbody>
              {cfg.workers.map((w) => {
                const mine = att.filter((r) => r.workerId === w.id);
                const h = (from: string) =>
                  mine.filter((r) => r.date >= from).reduce((s, r) => s + hoursBetween(r.clockIn, r.clockOut ?? now), 0);
                const open = (snap?.cases ?? []).filter((c) => c.workerId === w.id && (c.status === "open" || c.status === "in_review")).length;
                const al = a.alerts.filter((x) => x.workerId === w.id).length;
                return (
                  <tr key={w.id}>
                    <th scope="row" className="text-left font-semibold">{w.name}<span className="block text-xs font-normal text-muted">{w.role} · ₹{w.hourlyRate}/h</span></th>
                    <td>{mine.some((r) => !r.clockOut) ? t("on_shift") : t("not_on_shift")}</td>
                    <td>{hrs(mine.filter((r) => r.date === today).reduce((s, r) => s + hoursBetween(r.clockIn, r.clockOut ?? now), 0))}</td>
                    <td>{hrs(h(wk))}</td>
                    <td>{open}</td>
                    <td>{al}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
