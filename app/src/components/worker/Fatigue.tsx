"use client";

import { useFair, useT } from "@/lib/client";
import { dayOf, fatigueAlerts, hoursBetween, weekStart } from "@/lib/calc";
import { fmtDate, hrs } from "@/lib/format";
import { EmptyState } from "@/components/ui";
import type { FatigueAlert } from "@/lib/calc";

export function explainKey(a: FatigueAlert) {
  return `fa_${a.rule}` as const;
}

export function useExplain() {
  const t = useT();
  return (a: FatigueAlert) => t(explainKey(a), { value: a.value, limit: a.limit, date: fmtDate(a.date) });
}

export function Fatigue() {
  const { cfg, snap, workerId } = useFair();
  const t = useT();
  const explain = useExplain();
  const now = snap?.now ?? 0;
  const records = snap?.attendance ?? [];
  const alerts = fatigueAlerts(cfg, records, workerId, now);
  const wk = weekStart(dayOf(now));
  const weekHours = records
    .filter((r) => r.workerId === workerId && r.date >= wk)
    .reduce((s, r) => s + hoursBetween(r.clockIn, r.clockOut ?? now), 0);

  return (
    <>
      <section className="card space-y-2" aria-labelledby="fat-h">
        <h2 id="fat-h" className="text-lg font-bold">{t("fatigue_title")}</h2>
        <p className="text-sm text-muted">{t("fatigue_disclaimer")}</p>
        <p>{t("week_so_far", { h: hrs(weekHours), limit: cfg.maxWeeklyHours })}</p>
        <progress className="h-3 w-full" max={cfg.maxWeeklyHours} value={Math.min(weekHours, cfg.maxWeeklyHours)} aria-label={t("week_so_far", { h: hrs(weekHours), limit: cfg.maxWeeklyHours })} />
      </section>

      {!snap ? <p className="text-muted">{t("loading")}</p> : alerts.length === 0 ? (
        <EmptyState title={t("no_alerts")} hint={t("no_alerts_hint")} />
      ) : (
        <ul className="space-y-3" aria-label={t("fatigue_title")}>
          {alerts.map((a) => (
            <li key={a.key} className="card border-warn">
              <p className="font-bold text-warn">⚠ {t(`fr_${a.rule}`)}</p>
              <p>{explain(a)}</p>
            </li>
          ))}
        </ul>
      )}

      <section className="card" aria-labelledby="rules-h">
        <h2 id="rules-h" className="text-lg font-bold">{t("rules_title")}</h2>
        <ul className="list-disc pl-5 text-sm">
          <li>{t("rule_daily", { limit: cfg.maxSafeHours })}</li>
          <li>{t("rule_weekly", { limit: cfg.maxWeeklyHours })}</li>
          <li>{t("rule_rest", { limit: cfg.minRestHours })}</li>
          <li>{t("rule_streak", { limit: cfg.maxConsecutiveDays })}</li>
        </ul>
      </section>
    </>
  );
}
