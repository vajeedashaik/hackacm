"use client";

import { useState } from "react";
import { useFair, useT } from "@/lib/client";
import { dayOf, hoursBetween } from "@/lib/calc";
import { fmtDate, fmtTime, hrs } from "@/lib/format";
import { Dialog, EmptyState, Notice } from "@/components/ui";
import { Msg, StatusPill, useAction } from "@/components/common";
import type { Case } from "@/lib/types";

export function Shifts() {
  const { cfg, snap, workerId, call } = useFair();
  const t = useT();
  const [code, setCode] = useState("");
  const [flagId, setFlagId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const clockAct = useAction();
  const flagAct = useAction();

  const now = snap?.now ?? 0;
  const mine = (snap?.attendance ?? []).filter((a) => a.workerId === workerId).sort((a, b) => b.clockIn - a.clockIn);
  const open = mine.find((a) => !a.clockOut);
  const today = dayOf(now);
  const todayHours = Math.round(
    mine.filter((a) => a.date === today).reduce((s, a) => s + hoursBetween(a.clockIn, a.clockOut ?? now), 0) * 100,
  ) / 100;
  const overtime = Math.max(0, Math.round((todayHours - cfg.overtimeAfter) * 100) / 100);
  const attCases: Case[] = (snap?.cases ?? []).filter((c) => c.type === "attendance" && c.workerId === workerId);
  const pending = attCases.filter((c) => c.status === "open" || c.status === "in_review");
  const flaggedBy = (id: string) => pending.find((c) => c.attendanceIds.includes(id));

  const clock = (action: "in" | "out") =>
    clockAct.run(async () => {
      await call("POST", "/api/attendance", { industry: cfg.id, workerId, action, siteCode: action === "in" ? code : undefined });
      if (action === "in") setCode("");
    }, action === "in" ? t("checked_in") : t("checked_out"));

  const submitFlag = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await flagAct.run(
      () => call("POST", "/api/cases", { type: "attendance", industry: cfg.id, workerId, attendanceId: flagId, description: reason }),
      t("flag_sent"),
    );
    if (ok) { setFlagId(null); setReason(""); }
  };

  return (
    <>
      <section className="card space-y-3" aria-labelledby="today-h">
        <h2 id="today-h" className="text-lg font-bold">{t("todays_shift")}</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div><dt className="text-xs text-muted">{t("scheduled")}</dt><dd className="font-bold">{cfg.shift.start}–{cfg.shift.end}</dd></div>
          <div><dt className="text-xs text-muted">{t("status")}</dt><dd className="font-bold">{open ? t("on_shift") : t("not_on_shift")}</dd></div>
          <div><dt className="text-xs text-muted">{t("hours_today")}</dt><dd className="font-bold">{hrs(todayHours)}</dd></div>
          <div><dt className="text-xs text-muted">{t("overtime_today")}</dt><dd className="font-bold">{hrs(overtime)}</dd></div>
        </dl>
        {open && <p className="text-sm text-muted">{t("since", { time: fmtTime(open.clockIn) })}</p>}

        {!open && (
          <div>
            <label htmlFor="site-code" className="block font-semibold">{t("site_code")}</label>
            <p id="site-code-h" className="text-sm text-muted">{t("site_code_hint")}</p>
            <input id="site-code" className="field mt-1 max-w-48" inputMode="numeric" maxLength={6} aria-describedby="site-code-h"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={clockAct.busy || !!open} onClick={() => clock("in")}>{t("clockIn")}</button>
          <button className="btn" disabled={clockAct.busy || !open} onClick={() => clock("out")}>{t("clockOut")}</button>
        </div>
        <Msg msg={clockAct.msg} />
      </section>

      {pending.length > 0 && (
        <section className="card space-y-2" aria-labelledby="pend-h">
          <h2 id="pend-h" className="text-lg font-bold">{t("pending_corrections")}</h2>
          <ul className="space-y-2">
            {pending.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                <strong>{c.id}</strong> <span>{fmtDate(c.date)}</span> <StatusPill status={c.status} />
                <span className="text-muted">“{c.description}”</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-2" aria-labelledby="hist-h">
        <h2 id="hist-h" className="text-lg font-bold">{t("attendance_history")}</h2>
        {!snap ? <p className="text-muted">{t("loading")}</p> : mine.length === 0 ? (
          <EmptyState title={t("no_attendance")} hint={t("no_attendance_hint")} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t("date")}</th><th scope="col">{t("in")}</th><th scope="col">{t("out")}</th>
                  <th scope="col">{t("hours")}</th><th scope="col">{t("how_recorded")}</th><th scope="col"><span className="sr-only">{t("actions")}</span></th>
                </tr>
              </thead>
              <tbody>
                {mine.slice(0, 20).map((a) => {
                  const f = flaggedBy(a.id);
                  return (
                    <tr key={a.id}>
                      <td>{fmtDate(a.date)}</td>
                      <td>{fmtTime(a.clockIn)}</td>
                      <td>{a.clockOut ? fmtTime(a.clockOut) : "—"}</td>
                      <td>{hrs(hoursBetween(a.clockIn, a.clockOut ?? now))}{a.corrected ? ` (${t("corrected")})` : ""}</td>
                      <td>{t(`m_${a.method}`)}</td>
                      <td>
                        {f ? <StatusPill status={f.status} /> : (
                          <button className="btn !min-h-11 text-sm" onClick={() => { setFlagId(a.id); flagAct.setMsg(null); }}>
                            {t("flag_problem")}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Msg msg={flagAct.msg} />
      </section>

      <Dialog open={flagId !== null} title={t("flag_title")} onClose={() => setFlagId(null)}>
        <form onSubmit={submitFlag} className="space-y-3">
          <p className="text-sm text-muted">{t("flag_help")}</p>
          <div>
            <label htmlFor="flag-reason" className="block font-semibold">{t("what_wrong")}</label>
            <textarea id="flag-reason" className="field" required minLength={5} maxLength={500} value={reason}
              onChange={(e) => setReason(e.target.value)} />
          </div>
          {flagAct.msg && !flagAct.msg.ok && <Notice tone="error">{flagAct.msg.text}</Notice>}
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={flagAct.busy}>{t("submit")}</button>
            <button type="button" className="btn" onClick={() => setFlagId(null)}>{t("cancel")}</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
