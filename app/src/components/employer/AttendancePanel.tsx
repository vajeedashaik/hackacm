"use client";

import { useState } from "react";
import { useFair, useT } from "@/lib/client";
import { addDays, dayOf, hoursBetween, payslip, weekStart } from "@/lib/calc";
import { fmtDate, fmtTime, hrs, inr } from "@/lib/format";
import { EmptyState } from "@/components/ui";
import { Msg, useAction } from "@/components/common";

export function AttendancePanel({ reviewer }: { reviewer: string }) {
  const { cfg, snap, call } = useFair();
  const t = useT();
  const now = snap?.now ?? 0;
  const today = dayOf(now);
  const [wid, setWid] = useState(cfg.workers[0].id);
  const [pickedDate, setDate] = useState<string | null>(null);
  const date = pickedDate ?? addDays(today, -1);
  const [start, setStart] = useState(cfg.shift.start);
  const [end, setEnd] = useState(cfg.shift.end);
  const [picked, setPicked] = useState<string | null>(null);
  const period = picked ?? addDays(weekStart(today), -7);
  const setPeriod = setPicked;
  const shiftAct = useAction();
  const seedAct = useAction();
  const payAct = useAction();

  const name = (id: string) => cfg.workers.find((w) => w.id === id)?.name ?? id;
  const att = snap?.attendance ?? [];

  // exceptions: days over the overtime threshold, and shifts that have been open suspiciously long
  const dayTotals = new Map<string, { workerId: string; date: string; hours: number }>();
  for (const r of att) {
    const k = `${r.workerId}|${r.date}`;
    const cur = dayTotals.get(k) ?? { workerId: r.workerId, date: r.date, hours: 0 };
    cur.hours += hoursBetween(r.clockIn, r.clockOut ?? now);
    dayTotals.set(k, cur);
  }
  const overtime = [...dayTotals.values()].filter((d) => d.hours > cfg.overtimeAfter).sort((a, b) => b.date.localeCompare(a.date));
  const longOpen = att.filter((r) => !r.clockOut && hoursBetween(r.clockIn, now) > cfg.maxSafeHours);
  const flagged = (snap?.cases ?? []).filter((c) => c.type === "attendance" && (c.status === "open" || c.status === "in_review"));

  const confirmed = (id: string) => (snap?.payroll ?? []).find((p) => p.workerId === id && p.period === period);

  return (
    <>
      <section className="card space-y-2" aria-labelledby="exc-h">
        <h2 id="exc-h" className="text-lg font-bold">{t("exceptions")}</h2>
        {!snap ? <p className="text-muted">{t("loading")}</p> : overtime.length + longOpen.length + flagged.length === 0 ? (
          <EmptyState title={t("no_exceptions")} hint={t("no_exceptions_hint")} />
        ) : (
          <ul className="space-y-1 text-sm">
            {longOpen.map((r) => (
              <li key={r.id}>⚠ <strong>{name(r.workerId)}</strong> {t("open_long", { h: hrs(hoursBetween(r.clockIn, now)), since: fmtTime(r.clockIn) })}</li>
            ))}
            {overtime.map((d) => (
              <li key={`${d.workerId}${d.date}`}>⏱ <strong>{name(d.workerId)}</strong> · {fmtDate(d.date)} · {hrs(d.hours)} ({t("ot_hours", { h: hrs(d.hours - cfg.overtimeAfter) })})</li>
            ))}
            {flagged.map((c) => (
              <li key={c.id}>🚩 <strong>{name(c.workerId)}</strong> · {c.id} · {t("flagged_rec")}: “{c.description}”</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-2" aria-labelledby="pay-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pay-h" className="text-lg font-bold">{t("payroll")}</h2>
          <div className="flex items-center gap-1">
            <button className="btn !px-3" aria-label={t("prev_week")} onClick={() => setPeriod(addDays(period, -7))}>‹</button>
            <span className="min-w-44 text-center font-semibold" aria-live="polite">{fmtDate(period)} – {fmtDate(addDays(period, 6))}</span>
            <button className="btn !px-3" aria-label={t("next_week")} disabled={period >= weekStart(today)} onClick={() => setPeriod(addDays(period, 7))}>›</button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">{t("name")}</th><th scope="col">{t("hours")}</th><th scope="col">{t("overtime")}</th><th scope="col">{t("net_estimated")}</th><th scope="col">{t("status")}</th></tr></thead>
            <tbody>
              {cfg.workers.map((w) => {
                const s = payslip(cfg, w, att, period, now);
                const c = confirmed(w.id);
                return (
                  <tr key={w.id}>
                    <th scope="row" className="text-left">{w.name}</th>
                    <td>{hrs(s.hours)}</td><td>{hrs(s.overtimeHours)}</td><td>{inr(s.net)}</td>
                    <td>
                      {c ? <span className="pill bg-green-100 text-good">{t("confirmed")} · {inr(c.net)}</span> : (
                        <button className="btn !min-h-11 text-sm" disabled={payAct.busy || s.days.length === 0 || s.inProgress}
                          onClick={() => payAct.run(() => call("POST", "/api/payroll", { industry: cfg.id, workerId: w.id, period, reviewer }), t("payroll_ok", { name: w.name }))}>
                          {t("confirm_payroll")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Msg msg={payAct.msg} />
      </section>

      <section className="card space-y-3" aria-labelledby="sup-h">
        <h2 id="sup-h" className="text-lg font-bold">{t("supervisor_tools")}</h2>
        <div className="rounded-lg bg-[#f3efe3] p-3">
          <p className="text-sm font-semibold">{t("site_code_today")}</p>
          <p className="pixel text-3xl font-bold" aria-label={t("site_code_today")}>{snap?.siteCode ?? "—"}</p>
          <p className="text-sm text-muted">{t("site_code_note")}</p>
        </div>
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void shiftAct.run(() => call("POST", "/api/attendance", { action: "shift", industry: cfg.id, workerId: wid, date, start, end, reviewer }), t("shift_added")); }}>
          <h3 className="font-semibold">{t("add_shift")}</h3>
          <div className="grid gap-2 sm:grid-cols-4">
            <div><label htmlFor="m-w" className="block text-sm font-semibold">{t("name")}</label>
              <select id="m-w" className="field" value={wid} onChange={(e) => setWid(e.target.value)}>{cfg.workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>
            <div><label htmlFor="m-d" className="block text-sm font-semibold">{t("date")}</label>
              <input id="m-d" type="date" className="field" max={today} required value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label htmlFor="m-s" className="block text-sm font-semibold">{t("in")}</label>
              <input id="m-s" type="time" className="field" required value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><label htmlFor="m-e" className="block text-sm font-semibold">{t("out")}</label>
              <input id="m-e" type="time" className="field" required value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <button className="btn btn-primary" disabled={shiftAct.busy}>{t("add_shift")}</button>
          <Msg msg={shiftAct.msg} />
        </form>
        <div className="space-y-1">
          <h3 className="font-semibold">{t("sample_data")}</h3>
          <p className="text-sm text-muted">{t("sample_note")}</p>
          <button className="btn" disabled={seedAct.busy} onClick={() => seedAct.run(() => call("POST", "/api/attendance", { action: "demo-seed", industry: cfg.id, reviewer }), t("sample_ok"))}>{t("load_sample")}</button>
          <Msg msg={seedAct.msg} />
        </div>
      </section>
    </>
  );
}
