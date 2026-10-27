import { type Ctx, adminIds, audit, istDate, notify, requireHuman, requireRole, requireWorker } from "../ctx";
import { calculateWage, compareToPaid, fromPaise } from "../domain";
import { ServiceError } from "../errors";
import { publishEvent } from "./events";

/** Pay rule in force on `date`: the one with the latest effective_from not after it. */
export function payRuleFor(ctx: Ctx, date: string) {
  const rule = ctx.db.pay_rules
    .filter((r) => r.org_id === ctx.actor.orgId && r.effective_from <= date)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  if (!rule) throw new ServiceError(422, "No pay rule is in force for that date");
  return rule;
}

/**
 * Estimated wage for one worker-day from CLOSED attendance records, the worker's rate and the
 * org's pay rule. Always an estimate (basis: attendance_estimate); inputs and results are stored.
 */
export function calculateWageForDay(ctx: Ctx, input: { workerId: string; date: string }) {
  requireWorker(ctx, input.workerId);
  const wp = ctx.db.worker_profiles.find((w) => w.profile_id === input.workerId);
  if (!wp) throw new ServiceError(404, "Worker has no pay profile");
  const rule = payRuleFor(ctx, input.date);
  const records = ctx.db.attendance_records.filter(
    (a) => a.worker_id === input.workerId && a.clock_out && istDate(a.clock_in) === input.date,
  );
  if (records.length === 0) throw new ServiceError(422, "No completed attendance for that date");
  const hours = records.reduce((s, a) => s + (Date.parse(a.clock_out!) - Date.parse(a.clock_in)) / 3_600_000, 0);
  const b = calculateWage(Math.min(24, hours), wp.hourly_rate, {
    regularHoursPerDay: rule.regular_hours_per_day, overtimeMultiplier: rule.overtime_multiplier,
  });
  const row = {
    id: ctx.id(), org_id: ctx.actor.orgId, worker_id: input.workerId, work_date: input.date,
    pay_rule_id: rule.id, hours_total: b.hoursTotal, regular_hours: b.regularHours,
    overtime_hours: b.overtimeHours, hourly_rate: wp.hourly_rate, expected_amount: fromPaise(b.expectedPaise),
    basis: "attendance_estimate" as const,
    inputs: {
      attendance_ids: records.map((r) => r.id), hourly_rate: wp.hourly_rate,
      regular_hours_per_day: rule.regular_hours_per_day, overtime_multiplier: rule.overtime_multiplier,
    },
    result: { ...b }, created_at: ctx.now().toISOString(),
  };
  ctx.db.wage_calculations.push(row);
  audit(ctx, "wage.calculate", "wage_calculation", row.id, { worker: input.workerId, expected: row.expected_amount });
  publishEvent(ctx, { kind: "wage.calculated", entityType: "wage_calculation", entityId: row.id, workerId: input.workerId });
  return row;
}

/**
 * Record what was paid. `employer_payroll` is confirmed payroll and may only be entered by an
 * employer admin; `worker_reported` is the worker's own claim and is never treated as confirmed.
 */
export function recordPayroll(
  ctx: Ctx,
  input: { workerId: string; date: string; amountPaid: number; source: "employer_payroll" | "worker_reported" },
) {
  requireHuman(ctx);
  requireWorker(ctx, input.workerId);
  if (input.source === "employer_payroll") requireRole(ctx, "employer_admin");
  else if (ctx.actor.role === "worker" && input.workerId !== ctx.actor.userId) {
    throw new ServiceError(403, "Workers can only report their own pay");
  }
  const row = {
    id: ctx.id(), org_id: ctx.actor.orgId, worker_id: input.workerId, work_date: input.date,
    amount_paid: input.amountPaid, source: input.source, recorded_by: ctx.actor.userId,
    created_at: ctx.now().toISOString(),
  };
  ctx.db.payroll_records.push(row);
  audit(ctx, "payroll.record", "payroll_record", row.id, { worker: input.workerId, source: input.source });
  publishEvent(ctx, { kind: "payroll.recorded", entityType: "payroll_record", entityId: row.id, workerId: input.workerId, payload: { source: input.source } });
  return row;
}

/** Compare an estimate with a payroll record and flag it when the shortfall exceeds the rule's tolerance. */
export function comparePayroll(ctx: Ctx, input: { wageCalculationId: string; payrollRecordId: string }) {
  const calc = ctx.db.wage_calculations.find((c) => c.id === input.wageCalculationId && c.org_id === ctx.actor.orgId);
  const pay = ctx.db.payroll_records.find((p) => p.id === input.payrollRecordId && p.org_id === ctx.actor.orgId);
  if (!calc || !pay) throw new ServiceError(404, "Not found");
  requireWorker(ctx, calc.worker_id);
  if (calc.worker_id !== pay.worker_id || calc.work_date !== pay.work_date) {
    throw new ServiceError(422, "Calculation and payroll record are for different worker-days");
  }
  const rule = ctx.db.pay_rules.find((r) => r.id === calc.pay_rule_id)!;
  const expectedPaise = Math.round(calc.expected_amount * 100);
  const { shortfallPaise, flagged } = compareToPaid(expectedPaise, pay.amount_paid, rule.discrepancy_tolerance);
  const row = {
    id: ctx.id(), org_id: ctx.actor.orgId, worker_id: calc.worker_id, wage_calculation_id: calc.id,
    payroll_record_id: pay.id, expected_amount: calc.expected_amount, paid_amount: pay.amount_paid,
    shortfall: fromPaise(shortfallPaise), paid_is_confirmed: pay.source === "employer_payroll",
    flagged, created_at: ctx.now().toISOString(),
  };
  ctx.db.payroll_comparisons.push(row);
  audit(ctx, "payroll.compare", "payroll_comparison", row.id, { worker: calc.worker_id, shortfall: row.shortfall, flagged });
  if (flagged) {
    for (const id of adminIds(ctx)) notify(ctx, id, "wage.discrepancy", "Wage discrepancy flagged", `Shortfall of ₹${row.shortfall}`);
    publishEvent(ctx, {
      kind: "wage.discrepancy", entityType: "payroll_comparison", entityId: row.id, workerId: calc.worker_id,
      payload: { shortfall: row.shortfall, confirmed: row.paid_is_confirmed },
    });
  }
  return row;
}

/** Convenience for the worker's "report a discrepancy" flow: estimate + record + compare in one call. */
export function reconcileDay(
  ctx: Ctx,
  input: { workerId: string; date: string; amountPaid: number; source: "employer_payroll" | "worker_reported" },
) {
  const calculation = calculateWageForDay(ctx, input);
  const payroll = recordPayroll(ctx, input);
  const comparison = comparePayroll(ctx, { wageCalculationId: calculation.id, payrollRecordId: payroll.id });
  return { calculation, payroll, comparison };
}
