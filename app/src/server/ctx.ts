import { randomUUID } from "node:crypto";
import type { Actor } from "./domain";
import { isStaff } from "./domain";
import type { Db, Role } from "./db/rows";
import { ServiceError } from "./errors";

/** Everything a service needs. `now`/`id` are injectable so tests are deterministic. */
export interface Ctx {
  db: Db;
  actor: Actor;
  now: () => Date;
  id: () => string;
}

export const makeCtx = (db: Db, actor: Actor, over: Partial<Pick<Ctx, "now" | "id">> = {}): Ctx => ({
  db, actor, now: over.now ?? (() => new Date()), id: over.id ?? randomUUID,
});

/** Calendar date in India Standard Time (the platform's reference zone for work days). */
export const istDate = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);

// ------------------------------------------------------------------ authorisation (mirrors RLS)
export function profileOf(db: Db, userId: string) {
  return db.profiles.find((p) => p.id === userId);
}

/**
 * Same rule as SQL `app.can_see_worker`: same org, and the worker themself, or an employer_admin,
 * or the supervisor the worker is assigned to.
 */
export function canSeeWorker(ctx: Ctx, workerId: string): boolean {
  const { db, actor } = ctx;
  const w = profileOf(db, workerId);
  if (!w || w.org_id !== actor.orgId) return false;
  if (workerId === actor.userId) return true;
  if (actor.role === "employer_admin") return true;
  if (actor.role === "supervisor") {
    return db.worker_profiles.some((x) => x.profile_id === workerId && x.supervisor_id === actor.userId);
  }
  return false;
}

/** 404 (not 403) when invisible, so existence of other people's records is not revealed. */
export function requireWorker(ctx: Ctx, workerId: string) {
  if (!canSeeWorker(ctx, workerId)) throw new ServiceError(404, "Worker not found");
  return profileOf(ctx.db, workerId)!;
}

export function requireRole(ctx: Ctx, ...roles: Role[]) {
  if (!roles.includes(ctx.actor.role)) throw new ServiceError(403, "Your role cannot do this");
}

export function requireHuman(ctx: Ctx) {
  if (ctx.actor.kind === "agent") throw new ServiceError(403, "This action must be performed by a person");
}

export const requireStaff = (ctx: Ctx) => {
  if (!isStaff(ctx.actor)) throw new ServiceError(403, "Staff access required");
};

export function industryOf(ctx: Ctx, orgId = ctx.actor.orgId) {
  const org = ctx.db.organisations.find((o) => o.id === orgId);
  const cfg = org && ctx.db.industry_configs.find((c) => c.id === org.industry_id);
  if (!cfg) throw new ServiceError(404, "Organisation not configured");
  return cfg;
}

// ------------------------------------------------------------------ privacy-safe payloads
/**
 * Events, audit details and logs may carry ids, enums and numbers only. Anything that could be
 * free text (complaint bodies, notes, names) is dropped rather than stored.
 */
const SAFE_STRING = /^[\w.:-]{0,64}$/;
export function sanitize(input: Record<string, unknown> = {}): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && SAFE_STRING.test(v)) out[k] = v;
  }
  return out;
}

export function audit(
  ctx: Ctx,
  action: string,
  entityType: string,
  entityId: string | null,
  details?: Record<string, unknown>,
  opts: { anonymous?: boolean } = {},
) {
  ctx.db.audit_events.push({
    id: ctx.id(), org_id: ctx.actor.orgId,
    actor_id: opts.anonymous ? null : ctx.actor.userId,
    actor_is_agent: !opts.anonymous && ctx.actor.kind === "agent",
    action, entity_type: entityType, entity_id: entityId,
    details: sanitize(details), created_at: ctx.now().toISOString(),
  });
}

export function notify(ctx: Ctx, recipientId: string, kind: string, title: string, body = "") {
  ctx.db.notifications.push({
    id: ctx.id(), org_id: ctx.actor.orgId, recipient_id: recipientId, kind, title, body,
    read_at: null, created_at: ctx.now().toISOString(),
  });
}

export const adminIds = (ctx: Ctx) =>
  ctx.db.profiles.filter((p) => p.org_id === ctx.actor.orgId && p.role === "employer_admin").map((p) => p.id);
