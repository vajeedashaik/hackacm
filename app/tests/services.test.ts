import { beforeEach, describe, expect, it } from "vitest";
import { demoModeEnabled } from "@/server/auth";
import { makeCtx } from "@/server/ctx";
import type { Actor } from "@/server/domain";
import { type Db } from "@/server/db/rows";
import { SEED, buildSeedDb } from "@/server/seed";
import { handleApi } from "@/server/api";
import { addCaseEvidence, createFairnessCase, getCase, listCases, transitionCase } from "@/server/services/cases";
import { publishEvent, listEvents } from "@/server/services/events";
import { listFeedback, submitFeedback, submitSafetyIncident } from "@/server/services/reports";
import { endShift, startShift } from "@/server/services/shifts";
import { updateSkillPassport } from "@/server/services/skills";
import { reconcileDay, recordPayroll } from "@/server/services/wages";
import { ServiceError } from "@/server/errors";

const C = SEED.construction, K = SEED.college;
let db: Db;
let t: number;
const human = (userId: string, orgId: string, role: Actor["role"], kind: Actor["kind"] = "human") =>
  makeCtx(db, { userId, orgId, role, kind }, { now: () => new Date(t) });
const as = {
  murugan: () => human(C.murugan, SEED.orgConstruction, "worker"),
  selvi: () => human(C.selvi, SEED.orgConstruction, "worker"),
  karthik: () => human(C.karthik, SEED.orgConstruction, "worker"),
  sup: () => human(C.supervisor, SEED.orgConstruction, "supervisor"),
  admin: () => human(C.admin, SEED.orgConstruction, "employer_admin"),
  agent: () => human(C.admin, SEED.orgConstruction, "employer_admin", "agent"),
  collegeAdmin: () => human(K.admin, SEED.orgCollege, "employer_admin"),
  collegeWorker: () => human(K.rajesh, SEED.orgCollege, "worker"),
};
const thrown = (fn: () => unknown) => { try { fn(); } catch (e) { return e; } return undefined; };
const status = (fn: () => unknown) => (thrown(fn) as ServiceError | undefined)?.status;

beforeEach(() => {
  db = buildSeedDb();
  t = Date.parse("2026-04-01T04:00:00Z"); // 09:30 IST
});

describe("seed", () => {
  it("covers both industries with workers, cases and pay rules", () => {
    expect(db.organisations.map((o) => o.industry_id).sort()).toEqual(["college", "construction"]);
    expect(db.fairness_cases.length).toBeGreaterThanOrEqual(2);
    expect(db.pay_rules).toHaveLength(2);
  });
  it("is reproducible", () => {
    expect(JSON.stringify(buildSeedDb())).toBe(JSON.stringify(buildSeedDb()));
  });
  it("derives the seeded wage discrepancy deterministically", () => {
    const cmp = db.payroll_comparisons.find((c) => c.worker_id === C.murugan)!;
    expect(cmp).toMatchObject({ expected_amount: 1440, paid_amount: 720, shortfall: 720, flagged: true, paid_is_confirmed: false });
  });
});

describe("shifts and hours alerts", () => {
  it("starts and ends a shift and records hours", () => {
    startShift(as.selvi(), {});
    t += 3 * 3_600_000;
    const r = endShift(as.selvi());
    expect(r.hours).toBe(3);
    expect(r.alert).toBeNull();
  });
  it("rejects a double clock-in and clock-out when not clocked in", () => {
    startShift(as.selvi(), {});
    expect(status(() => startShift(as.selvi(), {}))).toBe(409);
    t += 1000;
    endShift(as.selvi());
    expect(status(() => endShift(as.selvi()))).toBe(409);
  });
  it("raises one alert past the industry limit and notifies the right people", () => {
    startShift(as.selvi(), {});
    t += 10.5 * 3_600_000;
    const r = endShift(as.selvi());
    expect(r.alert).toMatchObject({ total_hours: 10.5, threshold_hours: 10, status: "open" });
    const recipients = db.notifications.filter((n) => n.kind === "hours.alert").map((n) => n.recipient_id);
    expect(recipients).toEqual(expect.arrayContaining([C.admin, C.supervisor, C.selvi]));
    expect(db.hours_alerts.filter((a) => a.worker_id === C.selvi)).toHaveLength(1);
  });
  it("uses the college threshold (11h) for the college org", () => {
    startShift(as.collegeWorker(), {});
    t += 10.5 * 3_600_000;
    expect(endShift(as.collegeWorker()).alert).toBeNull();
  });
  it("lets a worker clock only themselves in", () => {
    expect(status(() => startShift(as.selvi(), { workerId: C.murugan }))).toBe(404);
  });
  it("lets agents neither start nor end shifts", () => {
    expect(status(() => startShift(as.agent(), { workerId: C.selvi }))).toBe(403);
  });
});

describe("wages and payroll", () => {
  const workDay = () => {
    startShift(as.selvi(), {});
    t += 9 * 3_600_000; // 9h: 1h overtime
    endShift(as.selvi());
    return new Date(t - 9 * 3_600_000 + 330 * 60_000).toISOString().slice(0, 10);
  };
  it("computes an estimate with stored inputs and flags a shortfall", () => {
    const date = workDay();
    const r = reconcileDay(as.selvi(), { workerId: C.selvi, date, amountPaid: 520, source: "worker_reported" });
    expect(r.calculation).toMatchObject({ expected_amount: 650, basis: "attendance_estimate", overtime_hours: 1 }); // 8*65 + 1*65*2
    expect(r.calculation.inputs).toMatchObject({ hourly_rate: 65, overtime_multiplier: 2 });
    expect(r.comparison).toMatchObject({ shortfall: 130, flagged: true, paid_is_confirmed: false });
  });
  it("marks only employer payroll as confirmed", () => {
    const date = workDay();
    const r = reconcileDay(as.admin(), { workerId: C.selvi, date, amountPaid: 650, source: "employer_payroll" });
    expect(r.comparison).toMatchObject({ shortfall: 0, flagged: false, paid_is_confirmed: true });
  });
  it("does not let workers enter employer payroll or report for others", () => {
    const date = workDay();
    expect(status(() => recordPayroll(as.selvi(), { workerId: C.selvi, date, amountPaid: 1, source: "employer_payroll" }))).toBe(403);
    expect(status(() => recordPayroll(as.selvi(), { workerId: C.murugan, date, amountPaid: 1, source: "worker_reported" }))).toBe(404);
  });
  it("refuses to estimate without completed attendance", () => {
    expect(status(() => reconcileDay(as.selvi(), { workerId: C.selvi, date: "2026-04-01", amountPaid: 1, source: "worker_reported" }))).toBe(422);
  });
});

describe("safety incidents and feedback", () => {
  it("validates the category against the industry config", () => {
    expect(status(() => submitSafetyIncident(as.selvi(), { category: "slip_hazard", severity: "low", description: "x" }))).toBe(422); // college-only
    expect(submitSafetyIncident(as.selvi(), { category: "electrical", severity: "high", description: "Exposed wire" }).reporter_id).toBe(C.selvi);
  });
  it("keeps complaint text out of audit, events and notifications", () => {
    submitSafetyIncident(as.selvi(), { category: "electrical", severity: "high", description: "SECRET-DESCRIPTION" });
    submitFeedback(as.selvi(), { category: "workplace", body: "SECRET-FEEDBACK", anonymous: false });
    expect(JSON.stringify([db.audit_events, db.app_events, db.notifications])).not.toMatch(/SECRET-/);
  });
  it("stores no author for anonymous feedback, anywhere", () => {
    const fb = submitFeedback(as.selvi(), { category: "pay", body: "ANON-BODY", anonymous: true });
    const row = db.feedback.find((f) => f.id === fb.id)!;
    expect(row.submitted_by).toBeNull();
    const audit = db.audit_events.find((a) => a.entity_id === fb.id)!;
    expect(audit.actor_id).toBeNull();
    expect(db.app_events.find((e) => e.entity_id === fb.id)!.worker_id).toBeNull();
    expect(JSON.stringify([row, audit, db.app_events.filter((e) => e.entity_id === fb.id)])).not.toContain(C.selvi);
  });
  it("shows feedback only to the employer admin (anonymous) or the author (confidential)", () => {
    submitFeedback(as.selvi(), { category: "pay", body: "anon", anonymous: true });
    submitFeedback(as.selvi(), { category: "pay", body: "named", anonymous: false });
    expect(listFeedback(as.selvi()).map((f) => f.body)).toEqual(["named"]);
    expect(listFeedback(as.sup())).toHaveLength(0);
    expect(listFeedback(as.karthik())).toHaveLength(0);
    expect(listFeedback(as.admin()).length).toBeGreaterThanOrEqual(3);
    expect(listFeedback(as.collegeAdmin())).toHaveLength(0);
  });
});

describe("fairness case lifecycle through the service", () => {
  const open = () => createFairnessCase(as.selvi(), { caseType: "other", title: "Test case" });
  it("starts reported with a transition record naming the actor", () => {
    const c = open();
    const h = getCase(as.selvi(), c.id).history;
    expect(c.status).toBe("reported");
    expect(h).toEqual([expect.objectContaining({ from_status: null, to_status: "reported", actor_id: C.selvi, actor_is_agent: false })]);
  });
  it("rejects invalid edges and missing notes", () => {
    const c = open();
    expect(status(() => transitionCase(as.admin(), { caseId: c.id, to: "resolved", note: "x" }))).toBe(409);
    transitionCase(as.admin(), { caseId: c.id, to: "triaged" });
    transitionCase(as.admin(), { caseId: c.id, to: "under_review" });
    transitionCase(as.admin(), { caseId: c.id, to: "action_proposed" });
    expect(status(() => transitionCase(as.admin(), { caseId: c.id, to: "resolved" }))).toBe(422);
    expect(transitionCase(as.admin(), { caseId: c.id, to: "resolved", note: "Back pay approved" })).toMatchObject({ status: "resolved", resolution_note: "Back pay approved" });
  });
  it("never lets an agent resolve, even for an employer-admin delegate", () => {
    const c = open();
    for (const to of ["triaged", "under_review", "action_proposed"] as const) transitionCase(as.agent(), { caseId: c.id, to });
    expect(status(() => transitionCase(as.agent(), { caseId: c.id, to: "resolved", note: "AI recommends resolving" }))).toBe(403);
    expect(db.fairness_cases.find((x) => x.id === c.id)!.status).toBe("action_proposed");
    expect(db.case_transitions.filter((x) => x.case_id === c.id && x.actor_is_agent)).toHaveLength(3);
  });
  it("lets the worker dispute a resolution, then staff reopen it", () => {
    const c = open();
    for (const to of ["triaged", "under_review", "action_proposed"] as const) transitionCase(as.admin(), { caseId: c.id, to });
    transitionCase(as.admin(), { caseId: c.id, to: "resolved", note: "Done" });
    expect(status(() => transitionCase(as.karthik(), { caseId: c.id, to: "disputed", note: "no" }))).toBe(404);
    transitionCase(as.selvi(), { caseId: c.id, to: "disputed", note: "Not fully paid" });
    expect(transitionCase(as.sup(), { caseId: c.id, to: "under_review" }).status).toBe("under_review");
  });
  it("records evidence and flags agent-added evidence", () => {
    const c = open();
    addCaseEvidence(as.selvi(), { caseId: c.id, kind: "note", content: "My note" });
    addCaseEvidence(as.agent(), { caseId: c.id, kind: "attendance", content: "Agent summary" });
    expect(getCase(as.admin(), c.id).evidence.map((e) => e.added_by_agent)).toEqual([false, true]);
  });
});

describe("access control", () => {
  it("hides other workers' cases and returns 404, not 403", () => {
    const c = db.fairness_cases.find((x) => x.worker_id === C.murugan)!;
    expect(status(() => getCase(as.selvi(), c.id))).toBe(404);
    expect(listCases(as.selvi()).map((x) => x.worker_id)).toEqual([]);
    expect(listCases(as.murugan()).map((x) => x.worker_id)).toEqual([C.murugan]);
  });
  it("scopes a supervisor to assigned workers only", () => {
    db.worker_profiles.find((w) => w.profile_id === C.karthik)!.supervisor_id = null;
    const c = createFairnessCase(as.karthik(), { caseType: "other", title: "k" });
    expect(status(() => getCase(as.sup(), c.id))).toBe(404);
    expect(getCase(as.admin(), c.id).case.id).toBe(c.id);
  });
  it("isolates organisations in both directions", () => {
    const cCase = db.fairness_cases.find((x) => x.worker_id === C.murugan)!;
    expect(status(() => getCase(as.collegeAdmin(), cCase.id))).toBe(404);
    expect(status(() => transitionCase(as.collegeAdmin(), { caseId: cCase.id, to: "under_review" }))).toBe(404);
    expect(listCases(as.collegeAdmin()).every((x) => x.org_id === SEED.orgCollege)).toBe(true);
    expect(status(() => recordPayroll(as.collegeAdmin(), { workerId: C.murugan, date: "2026-03-02", amountPaid: 1, source: "employer_payroll" }))).toBe(404);
  });
  it("only lets staff update passport entries, verified by a person", () => {
    const args = { workerId: C.selvi, skillId: C.skillMasonry, level: "advanced" as const };
    expect(status(() => updateSkillPassport(as.selvi(), args))).toBe(403);
    expect(status(() => updateSkillPassport(as.agent(), args))).toBe(403);
    expect(updateSkillPassport(as.sup(), args)).toMatchObject({ verified_by: C.supervisor, level: "advanced" });
    expect(status(() => updateSkillPassport(as.sup(), { ...args, skillId: K.skillPlumbing }))).toBe(404);
  });
  it("limits the event stream by role and refuses unlisted event kinds or free text", () => {
    t += 1000;
    startShift(as.selvi(), {});
    expect(listEvents(as.selvi()).every((e) => e.worker_id === C.selvi)).toBe(true);
    expect(listEvents(as.admin()).length).toBeGreaterThan(listEvents(as.selvi()).length);
    expect(() => publishEvent(as.admin(), { kind: "evil" as never, entityType: "x" })).toThrow();
    const e = publishEvent(as.admin(), { kind: "case.created", entityType: "x", payload: { ok: 1, note: "free text with spaces" } });
    expect(e.payload).toEqual({ ok: 1 });
  });
});

describe("HTTP API gating", () => {
  const req = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    handleApi(new Request(`http://x/api/v1/${path}`, init), path.split("?")[0].split("/"));
  const env = process.env as Record<string, string | undefined>;
  const saved = { ...env };
  beforeEach(() => { env.FAIRSHIFT_DEMO_MODE = "true"; delete env.EMPLOYER_PIN; });
  const restore = () => { for (const k of ["FAIRSHIFT_DEMO_MODE", "EMPLOYER_PIN", "NODE_ENV"]) { if (saved[k] === undefined) delete env[k]; else env[k] = saved[k]; } };

  it("is closed unless demo mode is on", async () => {
    delete env.FAIRSHIFT_DEMO_MODE;
    expect(demoModeEnabled()).toBe(false);
    expect((await req("me", { headers: { "x-demo-user": C.admin, "x-employer-pin": "1234" } })).status).toBe(503);
    restore();
  });
  it("never grants staff access without the PIN, and refuses unknown users", async () => {
    expect((await req("me", { headers: { "x-demo-user": C.admin } })).status).toBe(403);
    expect((await req("me", { headers: { "x-demo-user": C.admin, "x-employer-pin": "0000" } })).status).toBe(403);
    expect((await req("me", { headers: { "x-demo-user": "nope" } })).status).toBe(401);
    expect((await req("me")).status).toBe(401);
    expect((await req("me", { headers: { "x-demo-user": C.admin, "x-employer-pin": "1234" } })).status).toBe(200);
    restore();
  });
  it("refuses staff in production when no PIN is configured", async () => {
    env.NODE_ENV = "production";
    expect((await req("me", { headers: { "x-demo-user": C.admin, "x-employer-pin": "1234" } })).status).toBe(403);
    restore();
  });
  it("validates input strictly without echoing values", async () => {
    const res = await req("feedback", {
      method: "POST", headers: { "x-demo-user": C.selvi },
      body: JSON.stringify({ category: "pay", body: "LEAKY-VALUE", anonymous: "yes", extra: 1 }),
    });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("LEAKY-VALUE");
    restore();
  });
  it("runs a worker flow end to end", async () => {
    const h = { "x-demo-user": C.selvi };
    const created = await req("cases", { method: "POST", headers: h, body: JSON.stringify({ caseType: "other", title: "API case" }) });
    expect(created.status).toBe(201);
    const { id } = await created.json();
    const bad = await req(`cases/${id}/transition`, { method: "POST", headers: h, body: JSON.stringify({ to: "resolved", note: "me" }) });
    expect(bad.status).toBe(409);
    restore();
  });
});
