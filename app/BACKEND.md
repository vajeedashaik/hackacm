# FairShift shared backend (Phase 2)

Schema, RLS, typed services, validated HTTP API and synthetic seed for **construction** and **college facilities**.
Nothing here is deployed or connected to a live database.

## Layout

| Path | What |
|---|---|
| `supabase/migrations/0001_schema.sql` | 31 tables, FKs, checks, indexes |
| `supabase/migrations/0002_rls.sql` | RLS policies, grants, append-only triggers |
| `supabase/seed.sql` | **Generated** synthetic data (`npm run db:seed-sql`) |
| `supabase/reset.sql` | Destructive reset. Needs explicit approval for a live DB |
| `src/server/domain.ts` | Pure logic: pay maths, case lifecycle, actors |
| `src/server/services/*` | Business services (below) |
| `src/server/schemas.ts` | zod input schemas (strict) |
| `src/server/auth.ts` | Actor resolution (demo mode only) |
| `src/server/api.ts` + `src/app/api/v1/[...path]/route.ts` | HTTP API `/api/v1/*` |
| `src/server/seed.ts` | Builds seed data by running the real services under a fixed clock |
| `src/server/db/rows.ts` | Row types mirroring the SQL |

The MVP's `src/lib/store.ts` and `/api/state|attendance|cases` are untouched. `/api/v1` is separate and does not
share state with them yet (see limitations).

## Setup and tests (run in `app/`)

```bash
npm install
npm run test:backend      # domain + services + HTTP gating + boundary + RLS (PGlite)
npm run typecheck
npm run db:seed-sql       # regenerate supabase/seed.sql
```

Demo mode (in-memory backend): copy `.env.example` to `.env.local`, set `FAIRSHIFT_DEMO_MODE=true`, run `npm run dev`.
Call the API with `x-demo-user: <profile uuid>`; staff also send `x-employer-pin`. IDs are exported as `SEED` from
`src/server/seed.ts`.

With a Supabase project (not done here): `supabase db reset` applies the migrations and `seed.sql` locally;
for a hosted project run the two migrations in the SQL editor. **Do not run `reset.sql` on a live project without approval.**

### Environment variables (names only)

`FAIRSHIFT_DEMO_MODE`, `EMPLOYER_PIN`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server only; never `NEXT_PUBLIC_`). A test fails if client code references it.

## Services (`src/server/services`)

All take `(ctx, input)`. `ctx = makeCtx(db, actor)`; `actor = { userId, orgId, role, kind: "human" | "agent" }`.
Agents pass `kind: "agent"` with the delegating user's identity, so they get the same checks plus agent limits.

| Need | Function |
|---|---|
| Start / end shift | `startShift`, `endShift` (`shifts.ts`) |
| Hours + excessive-hours alert | `hoursOnDate`, `generateHoursAlert` |
| Wage estimate / payroll / flag | `calculateWageForDay`, `recordPayroll`, `comparePayroll`, `reconcileDay` (`wages.ts`) |
| Safety incident | `submitSafetyIncident` (`reports.ts`) |
| Confidential / anonymous feedback | `submitFeedback`, `listFeedback` |
| Cases | `createFairnessCase`, `updateFairnessCase`, `transitionCase`, `addCaseEvidence`, `getCase`, `listCases` (`cases.ts`) |
| Skill passport | `updateSkillPassport`, `getSkillPassport` |
| Events | `publishEvent`, `listEvents`, `subscribe` (`events.ts`) |

Audit rows are written by every service via `audit()`.

### Money
Deterministic, integer paise (`calculateWage`). Wage calculations are always **estimates**
(`basis = attendance_estimate`) with inputs and results stored. Only `payroll_records.source = employer_payroll`
(employer admin only) is **confirmed**; `worker_reported` never is. Comparisons carry `paid_is_confirmed`.
No LLM is involved in any figure.

### Case lifecycle
`reported → triaged → under_review → action_proposed → resolved`; `rejected` from any open stage (admin);
`resolved|rejected → disputed` (owning worker) or `→ under_review` (admin reopen); `disputed → under_review`.
`resolved`/`rejected`/`disputed` require a note. **Agents may triage, review and propose; they can never resolve,
reject, reopen or dispute.** Every transition records the actor and whether it was an agent.

## API (`/api/v1`)

`GET me · alerts · incidents · feedback · cases · cases/:id · skills/passport?workerId= · events?after=ISO · notifications`
`POST shifts/start · shifts/end · wages/calculate · wages/reconcile · payroll · payroll/compare · incidents · feedback ·
cases · cases/:id/transition · cases/:id/evidence · skills/passport · demo/reset`  `PATCH cases/:id`

Errors: `400` validation (field paths only, values never echoed), `401/403` auth, `404` for anything the caller may not
see (hides existence), `409` invalid transition, `422` business-rule failure, `503` auth not configured.

## Realtime
Services write `app_events` (ids, enums, numbers only; free text is dropped by `sanitize`). Interface for other phases:
- **Configured Supabase:** subscribe to `postgres_changes` INSERT on `app_events` (table is added to
  `supabase_realtime`; RLS applies, so workers only get events about themselves).
- **Fallback (today):** poll `GET /api/v1/events?after=<last created_at>`; in-process code can use `subscribe()`.

## Security summary
- RLS on every table (a test asserts none is missing). `authenticated` gets SELECT plus INSERT on `safety_incidents`
  and `feedback` only; all other writes need the service role on the server. `anon` has nothing.
- Visibility: worker = self; supervisor = assigned workers; employer_admin = own org. Cross-org reads return nothing.
- Anonymous feedback stores no author in the row, audit log or events, and only the employer admin can read it.
- `audit_events` and `case_transitions` are append-only (trigger).
- **Anonymity limits:** wording, timing, a tiny team, or infrastructure logs (API gateway, IP) may identify an author.
  The UI must not promise absolute anonymity.
- Auth is **demo-grade**: workers are unauthenticated by id; staff use a shared PIN. API is closed (503) unless
  `FAIRSHIFT_DEMO_MODE=true`, and staff are refused in production when `EMPLOYER_PIN` is unset.

## Limitations (honest list)
- The services run on an **in-memory adapter**. A Supabase/Postgres adapter for the same service functions is not
  written, so nothing reads or writes a live database. Not durable and not shared across serverless instances.
- RLS is verified against PGlite with stubbed Supabase `auth`/roles, not against a real Supabase project.
- Supabase Auth/JWT verification is not implemented; no rate limiting on `/api/v1`.
- Attendance corrections, training records, scenario runs and agent run/event/tool tables exist in the schema but have
  no service yet (agent phase should add them via `makeCtx` with `kind: "agent"`).
- `/api/v1` and the MVP store are separate data sets; pages built in other phases still read `/api/state`.
- Event polling uses `created_at > after`; events created in the same millisecond can be skipped.
