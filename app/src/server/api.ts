import { ZodError, type ZodType } from "zod";
import { demoModeEnabled, resolveActor } from "./auth";
import { type Ctx, canSeeWorker, makeCtx } from "./ctx";
import { ServiceError } from "./errors";
import { getDb, resetDemoDb } from "./seed";
import * as S from "./schemas";
import { addCaseEvidence, createFairnessCase, getCase, listCases, transitionCase, updateFairnessCase } from "./services/cases";
import { listEvents } from "./services/events";
import { listFeedback, listIncidents, submitFeedback, submitSafetyIncident } from "./services/reports";
import { endShift, startShift } from "./services/shifts";
import { getSkillPassport, updateSkillPassport } from "./services/skills";
import { calculateWageForDay, comparePayroll, reconcileDay, recordPayroll } from "./services/wages";

/**
 * HTTP surface of the shared backend: /api/v1/<path>. Thin by design: authenticate, validate with
 * zod, call one service, map errors. Request bodies and complaint text are never logged.
 */
type Handler = (c: { ctx: Ctx; p: string[]; body: unknown; q: URLSearchParams }) => unknown;
const parse = <T>(schema: ZodType<T>, v: unknown): T => schema.parse(v);

const ROUTES: [method: string, pattern: string, handler: Handler][] = [
  ["GET", "me", ({ ctx }) => ({ userId: ctx.actor.userId, role: ctx.actor.role, orgId: ctx.actor.orgId })],
  ["POST", "shifts/start", ({ ctx, body }) => startShift(ctx, parse(S.startShiftInput, body))],
  ["POST", "shifts/end", ({ ctx, body }) => endShift(ctx, parse(S.endShiftInput, body))],
  ["GET", "alerts", ({ ctx }) => ctx.db.hours_alerts.filter((a) => canSeeWorker(ctx, a.worker_id))],
  ["POST", "wages/calculate", ({ ctx, body }) => calculateWageForDay(ctx, parse(S.wageInput, body))],
  ["POST", "wages/reconcile", ({ ctx, body }) => reconcileDay(ctx, parse(S.payrollInput, body))],
  ["POST", "payroll", ({ ctx, body }) => recordPayroll(ctx, parse(S.payrollInput, body))],
  ["POST", "payroll/compare", ({ ctx, body }) => comparePayroll(ctx, parse(S.compareInput, body))],
  ["POST", "incidents", ({ ctx, body }) => submitSafetyIncident(ctx, parse(S.incidentInput, body))],
  ["GET", "incidents", ({ ctx }) => listIncidents(ctx)],
  ["POST", "feedback", ({ ctx, body }) => submitFeedback(ctx, parse(S.feedbackInput, body))],
  ["GET", "feedback", ({ ctx }) => listFeedback(ctx)],
  ["GET", "cases", ({ ctx }) => listCases(ctx)],
  ["POST", "cases", ({ ctx, body }) => createFairnessCase(ctx, parse(S.createCaseInput, body))],
  ["GET", "cases/:id", ({ ctx, p }) => getCase(ctx, p[0])],
  ["PATCH", "cases/:id", ({ ctx, p, body }) => updateFairnessCase(ctx, { caseId: p[0], ...parse(S.updateCaseInput, body) })],
  ["POST", "cases/:id/transition", ({ ctx, p, body }) => transitionCase(ctx, { caseId: p[0], ...parse(S.transitionInput, body) })],
  ["POST", "cases/:id/evidence", ({ ctx, p, body }) => addCaseEvidence(ctx, { caseId: p[0], ...parse(S.evidenceInput, body) })],
  ["POST", "skills/passport", ({ ctx, body }) => updateSkillPassport(ctx, parse(S.passportInput, body))],
  ["GET", "skills/passport", ({ ctx, q }) => getSkillPassport(ctx, parse(S.wageInput.shape.workerId, q.get("workerId")))],
  ["GET", "events", ({ ctx, q }) => listEvents(ctx, q.get("after") ?? undefined)],
  ["GET", "notifications", ({ ctx }) => ctx.db.notifications.filter((n) => n.recipient_id === ctx.actor.userId)],
  [
    "POST", "demo/reset",
    ({ ctx }) => {
      if (ctx.actor.role !== "employer_admin") throw new ServiceError(403, "Employer admin only");
      resetDemoDb();
      return { ok: true };
    },
  ],
];

function match(method: string, segs: string[]) {
  for (const [m, pattern, handler] of ROUTES) {
    if (m !== method) continue;
    const ps = pattern.split("/");
    if (ps.length !== segs.length) continue;
    const params: string[] = [];
    if (ps.every((s, i) => (s === ":id" ? (params.push(segs[i]), true) : s === segs[i]))) return { handler, params };
  }
  return null;
}

const MAX_BODY = 16_384;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export async function handleApi(req: Request, segs: string[]): Promise<Response> {
  try {
    const route = match(req.method, segs);
    if (!route) return json({ error: "Not found" }, 404);
    const db = getDb();
    const actor = resolveActor(req, db);
    let body: unknown = undefined;
    if (req.method !== "GET") {
      const text = await req.text();
      if (text.length > MAX_BODY) return json({ error: "Request too large" }, 413);
      try { body = text ? JSON.parse(text) : {}; } catch { return json({ error: "Invalid JSON" }, 400); }
    }
    const ctx = makeCtx(db, actor);
    const result = await route.handler({ ctx, p: route.params, body, q: new URL(req.url).searchParams });
    return json(result, req.method === "POST" ? 201 : 200);
  } catch (e) {
    if (e instanceof ServiceError) return json({ error: e.message }, e.status);
    if (e instanceof ZodError) {
      // Field paths and rule names only; never echo submitted values.
      return json({ error: "Invalid input", fields: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
    }
    console.error("api error:", e instanceof Error ? e.name : "unknown");
    return json({ error: "Something went wrong" }, 500);
  }
}

export { demoModeEnabled };
