import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dbToInsertSql } from "@/server/db/sql";
import { SEED, buildSeedDb } from "@/server/seed";

// Applies the real migrations to an in-process Postgres (PGlite), loads the synthetic seed, then
// queries as the `authenticated`/`anon` roles with a JWT subject, exactly as Supabase does.
// Only the Supabase-provided pieces (auth schema, roles) are stubbed here.
const C = SEED.construction, K = SEED.college;
let pg: PGlite;

const AUTH_STUB = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, aud text, role text);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
`;

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(AUTH_STUB);
  await pg.exec(readFileSync("supabase/migrations/0001_schema.sql", "utf8"));
  await pg.exec(readFileSync("supabase/migrations/0002_rls.sql", "utf8"));
  await pg.exec(dbToInsertSql(buildSeedDb()));
});
afterAll(() => pg.close());

async function as<T>(uid: string | null, fn: () => Promise<T>, role = "authenticated"): Promise<T> {
  await pg.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false)`);
  try { return await fn(); } finally { await pg.exec("reset role; select set_config('request.jwt.claim.sub', '', false)"); }
}
const rows = async (uid: string | null, sql: string, role?: string) =>
  (await as(uid, () => pg.query<Record<string, unknown>>(sql), role)).rows;
const count = async (uid: string | null, table: string, where = "true") =>
  Number((await rows(uid, `select count(*)::int as n from ${table} where ${where}`))[0].n);
const fails = async (uid: string | null, sql: string, role?: string) => {
  try { await as(uid, () => pg.exec(sql), role); return false; } catch { return true; }
};

describe("schema", () => {
  it("applies cleanly and enables RLS on every public table", async () => {
    const r = await pg.query<{ tablename: string }>(
      "select c.relname as tablename from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
    );
    expect(r.rows).toEqual([]);
  });
  it("seeds both industries", async () => {
    const r = await pg.query("select industry_id from organisations order by 1");
    expect(r.rows).toEqual([{ industry_id: "college" }, { industry_id: "construction" }]);
  });
  it("enforces integrity constraints", async () => {
    // one open attendance record per worker
    await pg.exec(`insert into attendance_records (org_id, worker_id, clock_in) values ('${SEED.orgConstruction}', '${C.karthik}', now())`);
    await expect(
      pg.exec(`insert into attendance_records (org_id, worker_id, clock_in) values ('${SEED.orgConstruction}', '${C.karthik}', now())`),
    ).rejects.toThrow();
    await pg.exec(`delete from attendance_records where worker_id='${C.karthik}' and clock_out is null`);
    // invalid case status
    await expect(pg.exec(`update fairness_cases set status='done'`)).rejects.toThrow();
    // anonymous feedback may not carry an author
    await expect(
      pg.exec(`insert into feedback (org_id, submitted_by, is_anonymous, category, body) values ('${SEED.orgConstruction}', '${C.selvi}', true, 'x', 'y')`),
    ).rejects.toThrow();
  });
  it("keeps audit and case history append-only", async () => {
    await expect(pg.exec("update audit_events set action='x'")).rejects.toThrow(/append-only/);
    await expect(pg.exec("delete from case_transitions")).rejects.toThrow(/append-only/);
  });
});

describe("RLS: workers", () => {
  it("see only their own private records", async () => {
    expect(await count(C.murugan, "fairness_cases")).toBe(1);
    expect(await count(C.selvi, "fairness_cases")).toBe(0);
    for (const t of ["attendance_records", "wage_calculations", "payroll_records", "payroll_comparisons", "hours_alerts"]) {
      expect(await count(C.selvi, t, `worker_id <> '${C.selvi}'`), t).toBe(0);
    }
    expect(await count(C.selvi, "attendance_records", `worker_id = '${C.murugan}'`)).toBe(0);
    expect(await count(C.murugan, "attendance_records", `worker_id = '${C.murugan}'`)).toBe(1);
  });
  it("cannot read other workers' profiles, evidence or case history", async () => {
    expect(await count(C.selvi, "profiles", `id = '${C.murugan}'`)).toBe(0);
    expect(await count(C.selvi, "case_transitions")).toBe(0);
    expect(await count(C.murugan, "case_transitions")).toBeGreaterThan(0);
  });
  it("cannot read the audit log, agent runs or admin streams", async () => {
    await pg.exec(`insert into agent_runs (org_id, initiated_by, agent_name) values ('${SEED.orgConstruction}', '${C.admin}', 'triage')`);
    expect(await count(C.murugan, "audit_events")).toBe(0);
    expect(await count(C.murugan, "agent_runs")).toBe(0);
    expect(await count(C.admin, "agent_runs")).toBe(1);
    expect(await count(C.murugan, "app_events", `worker_id <> '${C.murugan}' or worker_id is null`)).toBe(0);
    expect(await count(C.murugan, "app_events")).toBeGreaterThan(0);
  });
  it("cannot write privileged tables directly", async () => {
    expect(await fails(C.murugan, `update fairness_cases set status='resolved'`)).toBe(true);
    expect(await fails(C.murugan, `insert into payroll_records (org_id, worker_id, work_date, amount_paid, source, recorded_by) values ('${SEED.orgConstruction}','${C.murugan}','2026-03-02',9999,'employer_payroll','${C.murugan}')`)).toBe(true);
    expect(await fails(C.murugan, `delete from attendance_records`)).toBe(true);
    expect(await fails(C.murugan, `update profiles set role='employer_admin' where id='${C.murugan}'`)).toBe(true);
  });
  it("cannot file incidents or feedback as someone else", async () => {
    const o = SEED.orgConstruction;
    expect(await fails(C.selvi, `insert into safety_incidents (org_id, reporter_id, category, severity, description) values ('${o}','${C.murugan}','electrical','low','x')`)).toBe(true);
    expect(await fails(C.selvi, `insert into feedback (org_id, submitted_by, is_anonymous, category, body) values ('${o}','${C.murugan}',false,'x','y')`)).toBe(true);
    expect(await fails(C.selvi, `insert into safety_incidents (org_id, reporter_id, category, severity, description) values ('${SEED.orgCollege}','${C.selvi}','electrical','low','x')`)).toBe(true);
    expect(await fails(C.selvi, `insert into safety_incidents (org_id, reporter_id, category, severity, description) values ('${o}','${C.selvi}','electrical','low','x')`)).toBe(false);
  });
});

describe("RLS: employers and supervisors", () => {
  it("restrict an employer admin to their organisation", async () => {
    expect(await count(C.admin, "fairness_cases")).toBe(1);
    expect(await count(K.admin, "fairness_cases")).toBe(1);
    expect(await count(C.admin, "fairness_cases", `org_id <> '${SEED.orgConstruction}'`)).toBe(0);
    expect(await count(K.admin, "profiles", `org_id <> '${SEED.orgCollege}'`)).toBe(0);
    expect(await count(K.admin, "audit_events", `org_id = '${SEED.orgConstruction}'`)).toBe(0);
    expect(await count(C.admin, "organisations")).toBe(1);
  });
  it("restrict a supervisor to assigned workers", async () => {
    expect(await count(C.supervisor, "attendance_records", `worker_id = '${C.murugan}'`)).toBe(1);
    expect(await count(K.supervisor, "attendance_records", `worker_id = '${C.murugan}'`)).toBe(0);
    await pg.exec(`update worker_profiles set supervisor_id = null where profile_id = '${C.murugan}'`);
    expect(await count(C.supervisor, "fairness_cases")).toBe(0);
    expect(await count(C.supervisor, "attendance_records", `worker_id = '${C.murugan}'`)).toBe(0);
    await pg.exec(`update worker_profiles set supervisor_id = '${C.supervisor}' where profile_id = '${C.murugan}'`);
    expect(await count(C.supervisor, "fairness_cases")).toBe(1);
  });
  it("do not get audit-log access as supervisors, and cannot write cases directly", async () => {
    expect(await count(C.supervisor, "audit_events")).toBe(0);
    expect(await count(C.admin, "audit_events")).toBeGreaterThan(0);
    expect(await fails(C.admin, `update fairness_cases set status='resolved'`)).toBe(true);
  });
});

describe("RLS: anonymous and confidential feedback", () => {
  it("hides anonymous feedback from everyone but the employer admin of that org", async () => {
    const anon = "is_anonymous";
    expect(await count(C.selvi, "feedback", anon)).toBe(0); // even the (unrecorded) author
    expect(await count(C.murugan, "feedback", anon)).toBe(0);
    expect(await count(C.supervisor, "feedback")).toBe(0);
    expect(await count(K.admin, "feedback", anon)).toBe(0);
    expect(await count(C.admin, "feedback", anon)).toBe(1);
  });
  it("stores no reporter identity for anonymous rows", async () => {
    const r = await pg.query("select submitted_by from feedback where is_anonymous");
    expect(r.rows.every((x) => (x as { submitted_by: unknown }).submitted_by === null)).toBe(true);
  });
  it("shows confidential (named) feedback to its author and the admin only", async () => {
    await as(C.murugan, () =>
      pg.exec(`insert into feedback (org_id, submitted_by, is_anonymous, category, body) values ('${SEED.orgConstruction}','${C.murugan}',false,'pay','named-feedback')`));
    expect(await count(C.murugan, "feedback", "not is_anonymous")).toBe(1);
    expect(await count(C.selvi, "feedback", "not is_anonymous")).toBe(0);
    expect(await count(C.supervisor, "feedback", "not is_anonymous")).toBe(0);
    expect(await count(C.admin, "feedback", "not is_anonymous")).toBe(1);
  });
  it("lets an authenticated user submit anonymously without being able to read it back", async () => {
    await as(C.selvi, () =>
      pg.exec(`insert into feedback (org_id, submitted_by, is_anonymous, category, body) values ('${SEED.orgConstruction}',null,true,'workplace','new-anon')`));
    expect(await count(C.selvi, "feedback", "body = 'new-anon'")).toBe(0);
    expect(await count(C.admin, "feedback", "body = 'new-anon'")).toBe(1);
  });
});

describe("RLS: anon role", () => {
  it("has no access to any table", async () => {
    for (const t of ["profiles", "fairness_cases", "feedback", "industry_configs", "organisations"]) {
      expect(await fails(null, `select * from ${t}`, "anon"), t).toBe(true);
    }
    expect(await fails(null, `insert into feedback (org_id, is_anonymous, category, body) values ('${SEED.orgConstruction}', true, 'x', 'y')`, "anon")).toBe(true);
  });
});
