// Run: node --test src/lib/calc.test.mjs   (Node 22+ strips the TypeScript types itself)
import test from "node:test";
import assert from "node:assert/strict";
import { analyse, fatigueAlerts, payslip, priorityFor, weekStart, istMs } from "./calc.ts";

const cfg = {
  id: "construction", overtimeAfter: 8, overtimeMultiplier: 2, maxSafeHours: 10, maxWeeklyHours: 48,
  minRestHours: 11, maxConsecutiveDays: 6,
  allowancePerDay: { amount: 50 }, deductionPerDay: { amount: 10 },
};
const w = { id: "c1", name: "Murugan", hourlyRate: 100 };
let n = 0;
const rec = (date, start, end) => ({
  id: `a${++n}`, workerId: "c1", industry: "construction", date,
  clockIn: istMs(date, start), clockOut: istMs(date, end), method: "supervisor",
});

test("wage analysis: unpaid overtime is detected", () => {
  const a = analyse(cfg, w, 10, 800);
  assert.equal(a.expectedPay, 800 + 2 * 100 * 2); // 8h regular + 2h at 2x
  assert.equal(a.shortfall, 400);
  assert.equal(a.overtimeUnpaid, true);
});

test("wage analysis: correct payment has no shortfall", () => {
  assert.equal(analyse(cfg, w, 6, 600).shortfall, 0);
});

test("priority is rule based", () => {
  assert.equal(priorityFor("safety", cfg, w, { severity: "critical" }), "urgent");
  assert.equal(priorityFor("wage", cfg, w, { shortfall: 800 }), "high");
  assert.equal(priorityFor("wage", cfg, w, { shortfall: 50 }), "medium");
  assert.equal(priorityFor("wage", cfg, w, { shortfall: 0 }), "low");
});

test("weeks start on Monday", () => {
  assert.equal(weekStart("2026-10-28"), "2026-10-26"); // Wednesday
  assert.equal(weekStart("2026-10-25"), "2026-10-19"); // Sunday
});

test("payslip: regular, overtime, allowances and deductions", () => {
  const p = payslip(cfg, w, [rec("2026-10-26", "08:00", "18:00")], "2026-10-26", istMs("2026-10-30", "12:00"));
  assert.equal(p.regularPay, 800);
  assert.equal(p.overtimePay, 400);
  assert.equal(p.allowances, 50);
  assert.equal(p.deductions, 10);
  assert.equal(p.net, 1240);
  assert.equal(p.inProgress, false);
});

test("fatigue: daily limit, short rest between days, and nothing for a normal week", () => {
  const long = fatigueAlerts(cfg, [rec("2026-10-26", "06:00", "18:00")], "c1", Date.now());
  assert.deepEqual(long.map((a) => a.rule), ["daily"]);

  const rest = fatigueAlerts(cfg, [rec("2026-10-26", "14:00", "23:00"), rec("2026-10-27", "06:00", "14:00")], "c1", Date.now());
  assert.ok(rest.some((a) => a.rule === "rest" && a.value === 7));

  const split = fatigueAlerts(cfg, [rec("2026-10-26", "08:00", "12:00"), rec("2026-10-26", "13:00", "17:00")], "c1", Date.now());
  assert.equal(split.length, 0); // a same-day gap is a break, not a new shift
});

test("fatigue: seven days in a row triggers the streak rule once", () => {
  const days = ["26", "27", "28", "29", "30", "31"].map((d) => rec(`2026-10-${d}`, "08:00", "16:00"));
  days.push(rec("2026-11-01", "08:00", "16:00"));
  const alerts = fatigueAlerts(cfg, days, "c1", Date.now()).filter((a) => a.rule === "streak");
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].value, 7);
});
