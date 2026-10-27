"use client";

import { useState } from "react";
import { useFair, useLabel, useT } from "@/lib/client";
import { addDays, dayOf, payslip, weekStart } from "@/lib/calc";
import { fmtDate, hrs, inr } from "@/lib/format";
import { EmptyState, Notice } from "@/components/ui";
import { Msg, useAction } from "@/components/common";
import { EvidenceInput } from "@/components/EvidenceInput";
import type { UploadedFile } from "@/lib/store";
import type { Case } from "@/lib/types";

export function Payslip({ onFiled }: { onFiled: () => void }) {
  const { cfg, snap, workerId, call } = useFair();
  const t = useT();
  const label = useLabel();
  const now = snap?.now ?? 0;
  const thisWeek = weekStart(dayOf(now));
  const [picked, setPicked] = useState<string | null>(null);
  const period = picked ?? thisWeek;
  const setPeriod = setPicked;
  const [date, setDate] = useState("");
  const [hours, setHours] = useState("");
  const [paid, setPaid] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [filed, setFiled] = useState<Case | null>(null);
  const act = useAction();

  const worker = cfg.workers.find((w) => w.id === workerId)!;
  const slip = payslip(cfg, worker, snap?.attendance ?? [], period, now);
  const confirmed = (snap?.payroll ?? []).find((p) => p.workerId === workerId && p.period === period);
  const changed = confirmed && Math.abs(confirmed.net - slip.net) > 0.01;

  const dispute = (d: string, h: number) => {
    setDate(d);
    setHours(String(h));
    setFiled(null);
    document.getElementById("wage-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("wage-paid")?.focus({ preventScroll: true });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let created: Case | null = null;
    const ok = await act.run(async () => {
      created = await call<Case>("POST", "/api/cases", {
        type: "wage", industry: cfg.id, workerId, date: date || dayOf(now),
        hoursWorked: Number(hours), amountPaid: Number(paid), description: note, evidence: files,
      });
    });
    if (ok) {
      setFiled(created);
      setHours(""); setPaid(""); setNote(""); setFiles([]); setDate("");
      onFiled();
    }
  };

  const rate = worker.hourlyRate;
  const otRate = rate * cfg.overtimeMultiplier;

  return (
    <>
      <section className="card space-y-3" aria-labelledby="slip-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="slip-h" className="text-lg font-bold">{t("payslip")}</h2>
          <div className="flex items-center gap-1">
            <button className="btn !px-3" aria-label={t("prev_week")} onClick={() => setPeriod(addDays(period, -7))}>‹</button>
            <span className="min-w-44 text-center font-semibold" aria-live="polite">{fmtDate(period)} – {fmtDate(slip.periodEnd)}</span>
            <button className="btn !px-3" aria-label={t("next_week")} disabled={period >= thisWeek} onClick={() => setPeriod(addDays(period, 7))}>›</button>
          </div>
        </div>

        {confirmed ? (
          <Notice tone="success">{t("confirmed_label", { net: inr(confirmed.net), by: confirmed.confirmedBy })}</Notice>
        ) : (
          <Notice tone="warning">{t("estimated_label")}</Notice>
        )}
        {changed && <Notice tone="warning">{t("changed_after", { live: inr(slip.net), conf: inr(confirmed!.net) })}</Notice>}
        {slip.inProgress && <Notice tone="info">{t("shift_open_note")}</Notice>}

        {!snap ? <p className="text-muted">{t("loading")}</p> : slip.days.length === 0 ? (
          <EmptyState title={t("no_pay_days")} hint={t("no_attendance_hint")} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{t("date")}</th><th scope="col">{t("hours")}</th><th scope="col">{t("regular")}</th>
                    <th scope="col">{t("overtime")}</th><th scope="col">{t("earned")}</th><th scope="col"><span className="sr-only">{t("actions")}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {slip.days.map((d) => (
                    <tr key={d.date}>
                      <td>{fmtDate(d.date)}</td><td>{hrs(d.hours)}</td><td>{hrs(d.regularHours)}</td>
                      <td>{hrs(d.overtimeHours)}</td><td>{inr(d.regularPay + d.overtimePay)}</td>
                      <td><button className="btn !min-h-11 text-sm" onClick={() => dispute(d.date, d.hours)}>{t("report_problem")}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="space-y-2">
              <div>
                <dt className="font-semibold">{t("regular_pay")}: {inr(slip.regularPay)}</dt>
                <dd className="text-sm text-muted">{t("ex_regular", { h: slip.regularHours, rate: inr(rate), total: inr(slip.regularPay) })}</dd>
              </div>
              <div>
                <dt className="font-semibold">{t("overtime_pay")}: {inr(slip.overtimePay)}</dt>
                <dd className="text-sm text-muted">
                  {t("ex_overtime", { h: slip.overtimeHours, after: cfg.overtimeAfter, rate: inr(rate), mult: cfg.overtimeMultiplier, otrate: inr(otRate), total: inr(slip.overtimePay) })}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">+ {label(cfg.allowancePerDay.label)}: {inr(slip.allowances)}</dt>
                <dd className="text-sm text-muted">{t("ex_perday", { n: slip.days.length, amt: inr(cfg.allowancePerDay.amount) })}</dd>
              </div>
              <div>
                <dt className="font-semibold">− {label(cfg.deductionPerDay.label)}: {inr(slip.deductions)}</dt>
                <dd className="text-sm text-muted">{t("ex_perday", { n: slip.days.length, amt: inr(cfg.deductionPerDay.amount) })}</dd>
              </div>
              <div className="border-t-2 border-line pt-2">
                <dt className="text-lg font-bold">{confirmed ? t("net_confirmed") : t("net_estimated")}: {inr(confirmed?.net ?? slip.net)}</dt>
                <dd className="text-sm text-muted">{t("ex_net")}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted">{t("config_note")}</p>
          </>
        )}
      </section>

      <form id="wage-form" onSubmit={submit} className="card space-y-3" aria-labelledby="wage-h">
        <h2 id="wage-h" className="text-lg font-bold">{t("report")}</h2>
        <p className="text-sm text-muted">{t("report_help")}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="wage-date" className="block font-semibold">{t("date")}</label>
            <input id="wage-date" type="date" className="field" max={dayOf(now)} value={date || dayOf(now)} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="wage-hours" className="block font-semibold">{t("hours_worked")}</label>
            <input id="wage-hours" className="field" type="number" step="0.25" min="0.25" max="24" required inputMode="decimal"
              value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
          <div>
            <label htmlFor="wage-paid" className="block font-semibold">{t("paid")}</label>
            <input id="wage-paid" className="field" type="number" step="1" min="0" required inputMode="numeric"
              value={paid} onChange={(e) => setPaid(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="wage-note" className="block font-semibold">{t("note_opt")}</label>
          <textarea id="wage-note" className="field" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <EvidenceInput files={files} onChange={setFiles} />
        <button className="btn btn-primary" disabled={act.busy}>{act.busy ? t("sending") : t("submit")}</button>
        <Msg msg={act.msg} />
        {filed && (
          <Notice tone="success">
            {t("wage_filed", { id: filed.id })} {filed.wage && (
              <>
                {" "}{t("wage_result", { expected: inr(filed.wage.analysis.expectedPay), paid: inr(filed.wage.amountPaid), short: inr(filed.wage.analysis.shortfall) })}
              </>
            )}
          </Notice>
        )}
      </form>
    </>
  );
}
