import type {
  Analysis, AttendanceRecord, CaseType, IndustryConfig, Priority, Severity, Worker,
} from "./types";

const round = (n: number) => Math.round(n * 100) / 100;

// All calendar logic uses India Standard Time (UTC+5:30, no DST) so server and browser agree.
const IST = 330 * 60_000;
export const dayOf = (ts: number) => new Date(ts + IST).toISOString().slice(0, 10);
export const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Monday of the week containing `date`. */
export const weekStart = (date: string) => {
  const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
};
/** Epoch ms of HH:MM on a given IST date. */
export const istMs = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00Z`) - IST;

export function hoursBetween(from: number, to: number) {
  return round((to - from) / 3_600_000);
}

/** Deterministic wage check: regular + overtime pay versus what was actually paid. */
export function analyse(
  cfg: IndustryConfig,
  worker: Worker,
  hoursWorked: number,
  amountPaid: number,
): Analysis {
  const regularHours = Math.min(hoursWorked, cfg.overtimeAfter);
  const overtimeHours = Math.max(0, hoursWorked - cfg.overtimeAfter);
  const regularPay = regularHours * worker.hourlyRate;
  const overtimePay = overtimeHours * worker.hourlyRate * cfg.overtimeMultiplier;
  const expectedPay = round(regularPay + overtimePay);
  const shortfall = round(Math.max(0, expectedPay - amountPaid));
  const overtimeUnpaid = overtimeHours > 0 && shortfall > 0 && amountPaid <= regularPay + 0.01;
  const summary =
    shortfall === 0
      ? "Payment matches expected wages. No discrepancy found."
      : overtimeUnpaid
        ? `Overtime of ${overtimeHours}h (at ${cfg.overtimeMultiplier}x) appears unpaid. Shortfall ₹${shortfall}.`
        : `Paid ₹${amountPaid} against expected ₹${expectedPay}. Shortfall ₹${shortfall}.`;
  return { regularHours, overtimeHours, expectedPay, shortfall, overtimeUnpaid, summary };
}

/** Case priority is rule-based so it is explainable and identical for every reviewer. */
export function priorityFor(
  type: CaseType,
  cfg: IndustryConfig,
  worker: Worker,
  input: { severity?: Severity; shortfall?: number },
): Priority {
  if (type === "safety") {
    const m: Record<Severity, Priority> = { low: "low", medium: "medium", high: "high", critical: "urgent" };
    return m[input.severity ?? "medium"];
  }
  if (type === "wage") {
    const s = input.shortfall ?? 0;
    if (s >= worker.hourlyRate * cfg.overtimeAfter) return "high"; // a day's pay or more
    return s > 0 ? "medium" : "low";
  }
  return "medium";
}

// ---------- payslip ----------

export interface PayDay {
  date: string;
  hours: number;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
}

export interface Payslip {
  period: string; // Monday
  periodEnd: string; // Sunday
  days: PayDay[];
  hours: number;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  allowances: number;
  deductions: number;
  gross: number;
  net: number;
  inProgress: boolean; // a shift is still open, so the figures will change
}

/** Weekly payslip computed purely from attendance records and the industry rules. */
export function payslip(
  cfg: IndustryConfig,
  worker: Worker,
  records: AttendanceRecord[],
  period: string,
  now: number,
): Payslip {
  const periodEnd = addDays(period, 6);
  const mine = records.filter((r) => r.workerId === worker.id && r.date >= period && r.date <= periodEnd);
  const byDay = new Map<string, number>();
  for (const r of mine) {
    byDay.set(r.date, (byDay.get(r.date) ?? 0) + hoursBetween(r.clockIn, r.clockOut ?? now));
  }
  const days: PayDay[] = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, h]) => {
      const hours = round(h);
      const regularHours = Math.min(hours, cfg.overtimeAfter);
      const overtimeHours = round(Math.max(0, hours - cfg.overtimeAfter));
      return {
        date, hours, regularHours, overtimeHours,
        regularPay: round(regularHours * worker.hourlyRate),
        overtimePay: round(overtimeHours * worker.hourlyRate * cfg.overtimeMultiplier),
      };
    })
    .filter((d) => d.hours > 0);
  const sum = (f: (d: PayDay) => number) => round(days.reduce((s, d) => s + f(d), 0));
  const regularPay = sum((d) => d.regularPay);
  const overtimePay = sum((d) => d.overtimePay);
  const allowances = round(days.length * cfg.allowancePerDay.amount);
  const deductions = round(days.length * cfg.deductionPerDay.amount);
  const gross = round(regularPay + overtimePay + allowances);
  return {
    period, periodEnd, days,
    hours: sum((d) => d.hours),
    regularHours: sum((d) => d.regularHours),
    overtimeHours: sum((d) => d.overtimeHours),
    regularPay, overtimePay, allowances, deductions, gross,
    net: round(gross - deductions),
    inProgress: mine.some((r) => !r.clockOut),
  };
}

// ---------- fatigue rules ----------

export interface FatigueAlert {
  key: string; // stable, so the same alert is never raised twice
  workerId: string;
  rule: "daily" | "weekly" | "rest" | "streak";
  value: number;
  limit: number;
  date: string;
}

/**
 * Workload checks against the industry's configured limits. These describe hours and rest
 * only; they say nothing about anyone's health.
 */
export function fatigueAlerts(
  cfg: IndustryConfig,
  records: AttendanceRecord[],
  workerId: string,
  now: number,
): FatigueAlert[] {
  const mine = records.filter((r) => r.workerId === workerId).sort((a, b) => a.clockIn - b.clockIn);
  const out: FatigueAlert[] = [];
  const mk = (rule: FatigueAlert["rule"], date: string, value: number, limit: number) =>
    out.push({ key: `${workerId}:${rule}:${date}`, workerId, rule, value: round(value), limit, date });

  const perDay = new Map<string, number>();
  for (const r of mine) {
    perDay.set(r.date, (perDay.get(r.date) ?? 0) + hoursBetween(r.clockIn, r.clockOut ?? now));
  }
  for (const [date, h] of perDay) if (h > cfg.maxSafeHours) mk("daily", date, h, cfg.maxSafeHours);

  const perWeek = new Map<string, number>();
  for (const [date, h] of perDay) perWeek.set(weekStart(date), (perWeek.get(weekStart(date)) ?? 0) + h);
  for (const [wk, h] of perWeek) if (h > cfg.maxWeeklyHours) mk("weekly", wk, h, cfg.maxWeeklyHours);

  // back-to-back: next shift starts on a later day with less than the minimum rest in between
  for (let i = 1; i < mine.length; i++) {
    const prev = mine[i - 1];
    const next = mine[i];
    if (prev.clockOut === undefined || prev.date === next.date) continue;
    const gap = hoursBetween(prev.clockOut, next.clockIn);
    if (gap >= 0 && gap < cfg.minRestHours) mk("rest", next.date, gap, cfg.minRestHours);
  }

  const dates = [...perDay.keys()].sort();
  let start = 0;
  dates.forEach((d, i) => {
    if (i > 0 && addDays(dates[i - 1], 1) !== d) start = i;
    const len = i - start + 1;
    if (len > cfg.maxConsecutiveDays) {
      // one alert per run, keyed by the run's first day and updated as the run grows
      const key = `${workerId}:streak:${dates[start]}`;
      const alert: FatigueAlert = { key, workerId, rule: "streak", value: len, limit: cfg.maxConsecutiveDays, date: d };
      const at = out.findIndex((a) => a.key === key);
      if (at >= 0) out[at] = alert; else out.push(alert);
    }
  });

  return out.sort((a, b) => b.date.localeCompare(a.date));
}
