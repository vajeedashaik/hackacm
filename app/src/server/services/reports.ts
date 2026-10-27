import { type Ctx, adminIds, audit, industryOf, notify, requireHuman, requireStaff } from "../ctx";
import type { Severity } from "../db/rows";
import { ServiceError } from "../errors";
import { publishEvent } from "./events";

/** Safety incident. The reporter is always the caller; agents cannot file reports. */
export function submitSafetyIncident(
  ctx: Ctx,
  input: { category: string; severity: Severity; description: string; worksiteId?: string; workAreaId?: string },
) {
  requireHuman(ctx);
  if (!industryOf(ctx).safety_categories.includes(input.category)) {
    throw new ServiceError(422, "Unknown safety category for this industry");
  }
  const row = {
    id: ctx.id(), org_id: ctx.actor.orgId, reporter_id: ctx.actor.userId,
    worksite_id: input.worksiteId ?? null, work_area_id: input.workAreaId ?? null,
    category: input.category, severity: input.severity, description: input.description,
    status: "open" as const, created_at: ctx.now().toISOString(),
  };
  ctx.db.safety_incidents.push(row);
  // Audit/event/notification carry category and severity only, never the description.
  audit(ctx, "incident.submit", "safety_incident", row.id, { category: row.category, severity: row.severity });
  publishEvent(ctx, {
    kind: "incident.submitted", entityType: "safety_incident", entityId: row.id, workerId: ctx.actor.userId,
    payload: { category: row.category, severity: row.severity },
  });
  for (const id of adminIds(ctx)) notify(ctx, id, "incident.submitted", "New safety incident", `${row.severity} severity: ${row.category}`);
  return row;
}

/**
 * Feedback. anonymous=true stores NO author reference anywhere (row, audit, event); only the
 * employer admin can read it. Wording, timing or a very small team can still reveal the author,
 * so callers must not describe this as guaranteed anonymity.
 */
export function submitFeedback(ctx: Ctx, input: { category: string; body: string; anonymous: boolean }) {
  requireHuman(ctx);
  const row = {
    id: ctx.id(), org_id: ctx.actor.orgId, submitted_by: input.anonymous ? null : ctx.actor.userId,
    is_anonymous: input.anonymous, category: input.category, body: input.body, created_at: ctx.now().toISOString(),
  };
  ctx.db.feedback.push(row);
  audit(ctx, "feedback.submit", "feedback", row.id, { category: row.category, anonymous: input.anonymous }, { anonymous: input.anonymous });
  publishEvent(ctx, {
    kind: "feedback.submitted", entityType: "feedback", entityId: row.id,
    workerId: input.anonymous ? null : ctx.actor.userId, payload: { category: row.category, anonymous: input.anonymous },
  });
  for (const id of adminIds(ctx)) notify(ctx, id, "feedback.submitted", "New feedback received", "");
  return { id: row.id, createdAt: row.created_at };
}

/** Employer admins read all org feedback; others read only their own non-anonymous feedback. */
export function listFeedback(ctx: Ctx) {
  const mine = (f: { org_id: string; submitted_by: string | null }) =>
    f.org_id === ctx.actor.orgId &&
    (ctx.actor.role === "employer_admin" || (f.submitted_by !== null && f.submitted_by === ctx.actor.userId));
  return ctx.db.feedback.filter(mine);
}

/** Supervisors/admins list incidents they may see (own org; supervisors limited to assigned workers). */
export function listIncidents(ctx: Ctx) {
  requireStaff(ctx);
  return ctx.db.safety_incidents.filter((i) => {
    if (i.org_id !== ctx.actor.orgId) return false;
    if (ctx.actor.role === "employer_admin") return true;
    return ctx.db.worker_profiles.some((w) => w.profile_id === i.reporter_id && w.supervisor_id === ctx.actor.userId);
  });
}
