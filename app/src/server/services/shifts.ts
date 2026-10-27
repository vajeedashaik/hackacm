import { type Ctx, adminIds, audit, industryOf, istDate, notify, requireHuman, requireWorker } from "../ctx";
import { hoursBetween } from "../domain";
import { ServiceError } from "../errors";
import { publishEvent } from "./events";

/** Total closed + (optionally) open hours a worker has on an IST calendar day. */
export function hoursOnDate(ctx: Ctx, workerId: string, date: string, includeOpen = false) {
  const nowIso = ctx.now().toISOString();
  const total = ctx.db.attendance_records
    .filter((a) => a.worker_id === workerId && istDate(a.clock_in) === date)
    .filter((a) => a.clock_out || includeOpen)
    .reduce((s, a) => s + hoursBetween(a.clock_in, a.clock_out ?? nowIso), 0);
  return Math.round(total * 100) / 100;
}

/** Clock in. Workers clock themselves in; staff may clock in a worker they can see. */
export function startShift(ctx: Ctx, input: { workerId?: string; shiftId?: string; workAreaId?: string }) {
  requireHuman(ctx);
  const workerId = input.workerId ?? ctx.actor.userId;
  const worker = requireWorker(ctx, workerId);
  if (worker.role !== "worker") throw new ServiceError(400, "Only workers have attendance");
  if (ctx.db.attendance_records.some((a) => a.worker_id === workerId && !a.clock_out)) {
    throw new ServiceError(409, "Already clocked in");
  }
  if (input.shiftId) {
    const s = ctx.db.shifts.find((x) => x.id === input.shiftId && x.worker_id === workerId);
    if (!s) throw new ServiceError(404, "Shift not found");
  }
  const rec = {
    id: ctx.id(), org_id: ctx.actor.orgId, worker_id: workerId, shift_id: input.shiftId ?? null,
    work_area_id: input.workAreaId ?? null, clock_in: ctx.now().toISOString(), clock_out: null,
    source: workerId === ctx.actor.userId ? ("self" as const) : ("supervisor" as const),
  };
  ctx.db.attendance_records.push(rec);
  audit(ctx, "shift.start", "attendance_record", rec.id, { worker: workerId });
  publishEvent(ctx, { kind: "shift.started", entityType: "attendance_record", entityId: rec.id, workerId });
  return rec;
}

/** Clock out, then re-evaluate the excessive-hours alert for that day. */
export function endShift(ctx: Ctx, input: { workerId?: string } = {}) {
  requireHuman(ctx);
  const workerId = input.workerId ?? ctx.actor.userId;
  requireWorker(ctx, workerId);
  const rec = ctx.db.attendance_records.find((a) => a.worker_id === workerId && !a.clock_out);
  if (!rec) throw new ServiceError(409, "Not clocked in");
  const out = ctx.now().toISOString();
  if (Date.parse(out) <= Date.parse(rec.clock_in)) throw new ServiceError(409, "Clock-out must be after clock-in");
  rec.clock_out = out;
  const hours = hoursBetween(rec.clock_in, out);
  audit(ctx, "shift.end", "attendance_record", rec.id, { worker: workerId, hours });
  publishEvent(ctx, { kind: "shift.ended", entityType: "attendance_record", entityId: rec.id, workerId, payload: { hours } });
  const alert = generateHoursAlert(ctx, workerId, istDate(rec.clock_in));
  return { record: rec, hours, alert };
}

/**
 * Create/refresh an excessive-hours alert when the day's total exceeds the industry limit.
 * Idempotent per worker per day; returns null when under the limit.
 */
export function generateHoursAlert(ctx: Ctx, workerId: string, date: string) {
  requireWorker(ctx, workerId);
  const threshold = industryOf(ctx).max_safe_hours_per_day;
  const total = hoursOnDate(ctx, workerId, date);
  if (total <= threshold) return null;
  let alert = ctx.db.hours_alerts.find((a) => a.worker_id === workerId && a.work_date === date);
  if (alert) {
    alert.total_hours = total;
    return alert;
  }
  alert = {
    id: ctx.id(), org_id: ctx.actor.orgId, worker_id: workerId, work_date: date, total_hours: total,
    threshold_hours: threshold, status: "open", created_at: ctx.now().toISOString(),
  };
  ctx.db.hours_alerts.push(alert);
  const sup = ctx.db.worker_profiles.find((w) => w.profile_id === workerId)?.supervisor_id;
  for (const id of new Set([...adminIds(ctx), ...(sup ? [sup] : [])])) {
    notify(ctx, id, "hours.alert", "Excessive hours", `A worker exceeded ${threshold}h on ${date}`);
  }
  notify(ctx, workerId, "hours.alert", "Long working day", `You worked over ${threshold}h on ${date}. Please rest.`);
  audit(ctx, "hours.alert", "hours_alert", alert.id, { worker: workerId, total, threshold });
  publishEvent(ctx, { kind: "hours.alert", entityType: "hours_alert", entityId: alert.id, workerId, payload: { total, threshold } });
  return alert;
}
