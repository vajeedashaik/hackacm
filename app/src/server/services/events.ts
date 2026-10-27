import { type Ctx, sanitize } from "../ctx";

/** The only event kinds the application may publish. Keeps the realtime stream predictable and safe. */
export const EVENT_KINDS = [
  "shift.started", "shift.ended", "hours.alert", "wage.calculated", "wage.discrepancy",
  "payroll.recorded", "incident.submitted", "feedback.submitted", "case.created", "case.transitioned",
  "case.evidence_added", "skill.updated",
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

type Listener = (e: { id: string; org_id: string; kind: string }) => void;
const g = globalThis as unknown as { __fsListeners?: Set<Listener> };
const listeners = (g.__fsListeners ??= new Set<Listener>());

/** In-process fan-out (used by the demo/in-memory mode and as the fallback when Realtime is off). */
export const subscribe = (fn: Listener) => (listeners.add(fn), () => void listeners.delete(fn));

export function publishEvent(
  ctx: Ctx,
  ev: { kind: EventKind; entityType: string; entityId?: string | null; workerId?: string | null; payload?: Record<string, unknown> },
) {
  if (!EVENT_KINDS.includes(ev.kind)) throw new Error(`Event kind not permitted: ${ev.kind}`);
  const row = {
    id: ctx.id(), org_id: ctx.actor.orgId, kind: ev.kind, entity_type: ev.entityType,
    entity_id: ev.entityId ?? null, worker_id: ev.workerId ?? null,
    payload: sanitize(ev.payload), created_at: ctx.now().toISOString(),
  };
  ctx.db.app_events.push(row);
  for (const l of listeners) l({ id: row.id, org_id: row.org_id, kind: row.kind });
  return row;
}

/** Events visible to the caller after `afterIso`: admins see the org stream, others only events about themselves. */
export function listEvents(ctx: Ctx, afterIso?: string, limit = 100) {
  const { actor } = ctx;
  return ctx.db.app_events
    .filter((e) => e.org_id === actor.orgId)
    .filter((e) => actor.role === "employer_admin" || e.worker_id === actor.userId)
    .filter((e) => !afterIso || e.created_at > afterIso)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(-limit);
}
