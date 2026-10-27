# FairShift

Wage transparency, safety reporting and grievance resolution for informal and shift workers.
Built for Prompt Wars 2026 × SRM ACM, **SDG 8: Decent Work and Economic Growth**.

A worker sees what they worked and what they should be paid, reports a discrepancy or a safety problem, and follows
the case to a decision. An employer reviews the same records, with AI agents that *propose* and a human who *decides*.
A live workplace simulation shows the same shared events.

Two industry configurations ship: **construction site** and **college facilities**. Interface languages: English and Tamil.

## Three destinations

| Route | What it is |
|---|---|
| `/worker` | Shifts and check-in, payslip and wage-discrepancy report, safety report, my cases (dispute/reopen), confidential or anonymous feedback, skill passport, rest and hours alerts, voice entry |
| `/employer` | PIN-gated: overview, case queue with agent analysis, attendance (site code, supervisor-entered shifts), workload alerts, feedback, skill verification, config, audit |
| `/simulation` | Phaser top-down workplace driven by the same shared records and event feed |

## Run locally

Requires Node 20+.

```bash
cd app
npm install
npm run dev            # http://localhost:3000, employer PIN defaults to 1234 outside production
```

Production build: `npm run build`, then `EMPLOYER_PIN=<pin> npm start`.

## Environment variables (names only; never commit values)

| Variable | Needed | Purpose |
|---|---|---|
| `EMPLOYER_PIN` | **Yes in production** | Employer gate. With no value in production, employer access stays closed (no default PIN). |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Optional (recommended on Vercel) | Durable shared state. With both set, the case, attendance, feedback, skills and payroll state is saved to one Supabase row (`supabase/migrations/0003_app_state.sql`) and shared across serverless instances. Unset = in-memory only. |
| `SITE_CODE_SALT` | Optional | Salt for the daily check-in code. |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Optional | Any OpenAI-compatible endpoint. Unset = labelled rule-based fallback. |
| `AI_TIMEOUT_MS`, `AGENT_STEP_TIMEOUT_MS` | Optional | Model and per-step deadlines. |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY`, `NEXT_PUBLIC_VAPI_ASSISTANT_ID`, `VAPI_WEBHOOK_SECRET` | Optional | Voice. Unset = voice card says it is unavailable; everything works by text. |
| `FAIRSHIFT_DEMO_MODE` | Optional | Opens the separate `/api/v1` demo backend (see below). Leave unset to keep it closed. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Not used yet | Reserved for the Postgres backend. The service-role key is server-only. |

See `.env.example`. `GET /api/health` returns `{"ok":true}` for liveness checks.

## Architecture

```
Worker UI ─┐                                  ┌─ rules: src/lib/calc.ts (money, overtime, fatigue)
Employer UI├─ polls /api/state every 2 s ──── │
Simulation ┘   (viewer-filtered snapshot)      └─ src/lib/store.ts  (in-memory, process-wide)  ◄── API routes
                                                        ▲
 case / clock-in / shift routes ── after() ──► AI orchestrator (src/lib/ai) ── tools.ts (scoped) ── agentStore
                                                        │ proposes only
 employer (PIN) ── /api/agents/proposals/[id] ──────────┘ decideProposal → actOnCase (the only path to a decision)
```

- **One source of truth for the UI:** `src/lib/store.ts`, behind `/api/{state,attendance,cases,feedback,skills,payroll}`.
  Worker, employer and simulation all read the same snapshot, filtered per viewer.
- **Deterministic money:** pay, overtime and shortfall come only from `calc.ts`. Models may reword, never calculate;
  model text containing an unknown amount or a decision claim is discarded.
- **Agents propose, humans decide:** details and boundaries in [AI.md](AI.md).
- **Privacy:** workers get only their own cases and audit; anonymous feedback stores no identity and a day-rounded time;
  the shared feed never names a reporter.
- **Postgres backend (not connected to the UI):** `supabase/` (schema, RLS), `src/server/` and `/api/v1` are a tested
  separate backend verified against an in-process Postgres (PGlite). It does **not** share data with the UI store yet. See [BACKEND.md](BACKEND.md).

## Demo workflow (wage discrepancy, about 3 minutes)

1. `/employer`: unlock, **Attendance** tab, record yesterday's 10 h shift for Selvi (or load sample shifts).
2. `/worker`: choose Selvi, **Payslip** tab, report 10 h worked, paid ₹500, for that date.
3. `/employer`: **Cases** tab. The agents have retrieved attendance, recalculated ₹780 expected / ₹280 shortfall, and proposed back-pay.
4. Accept the suggestion. The case resolves through the normal lifecycle.
5. `/worker` → **My reports**: same status and ₹280. Dispute it to reopen.
6. `/simulation`: the event feed shows the filing and the resolution; **Employer → Audit** has the full history.

## Tests

Run in `app/`:

```bash
npm run typecheck && npm run lint
npm test                     # vitest: domain, services, boundary, RLS (PGlite), AI agents
npm run test:backend         # the /api/v1 backend suite
npm run test:sim             # simulation engine (node:test)
node --test src/lib/calc.test.mjs
npx playwright test          # browser e2e in Microsoft Edge (builds and starts its own server)
```

Last verified run (2026-10-27, local): typecheck clean; lint clean; `npm test` 117 passed; `test:backend` 66 passed;
`test:sim` 19 passed; calc 7 passed; `npm run build` succeeds; `npm audit` 0 vulnerabilities; Playwright 34 passed:
- **Workflow:** wage scenario worker → employer → worker, wrong-PIN refusal, offline banner, keyboard and Tamil toggle,
  both industries, simulation canvas and feed, reduced motion, health endpoint.
- **Accessibility:** axe-core WCAG 2.x A/AA scan of all four pages in English and Tamil, plus every worker and employer
  tab; mobile no-horizontal-scroll and accessible names on all four pages. Automated scans do not replace a manual
  screen-reader review, which has not been done.
- **Security:** headers and CSP present and not violated on any page, unauthenticated writes refused, PIN rate limit,
  oversized body rejected.

Unit tests also cover the case lifecycle (invalid transitions, reopening), worker data isolation, anonymous-feedback
privacy and the conditional `/api/state` responses. Coverage percentages were not measured.

## Security and privacy notes

- **Access control is demo-grade:** a shared employer PIN (rate limited, closed in production if unset) and unauthenticated
  workers. Replace with Supabase Auth and the included RLS policies (tested against the real migrations in PGlite) before real use.
- **Headers:** CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; the framework header is removed.
  The CSP allows only `vapi.ai` and `daily.co` as external origins (voice); it has not been exercised against a live Vapi call.
- **Anonymous feedback** stores no identity and rounds the time to the day, but a small team can still be guessable from the
  text itself. The worker screen says so. **Confidential** feedback is visible to reviewers by name.
- **AI** only proposes; money comes from `calc.ts`; model text that invents amounts or claims a decision is discarded.
- Dependencies: `npm audit` reports 0 vulnerabilities (2026-10-27).

## Efficiency notes

- `/api/state` is polled every 3 s only while the tab is visible. It returns an ETag and a body-less `304` when nothing
  changed (measured: 3 of 4 polls were 304 on an idle page), so idle tabs neither download nor re-render.
- Phaser (about 1.4 MB) and the Vapi SDK load only on the simulation page and when voice starts. Dashboard pages ship about
  650 KB of JavaScript (decoded), which is mostly the React and Next runtime.
- The event feed is capped at 200 entries; responses are filtered per viewer, so nothing is cached across users.

## Deploy on Vercel

See [DEPLOY.md](DEPLOY.md). **Important:** state is in memory. On Vercel's serverless functions each instance has its own
memory, so the three pages can disagree and state resets. Use it for a single-presenter demo only, or move the store to a
durable database first.

## Known limits (honest list)

- State is in memory by default. With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set, core state is persisted to one jsonb row
  and reloaded across instances (tested against a mock PostgREST server; **not yet run against a live Supabase project**).
  Concurrent writers are last-write-wins, and AI agent proposals and events are still in memory only. The per-record schema in
  `supabase/migrations/0001-0002` is not wired to the UI.
- Employer access is a shared PIN; workers are not authenticated (they pick an identity). Demo-grade only.
- Not exercised against live services: any real AI model call, any real Vapi call (needs the keys above).
- Agent panel text (employer side) is English only; Tamil wording needs native review.
- QR check-in is replaced by a daily site code.
- Config tab is read-only.

## SDG 8 fit

Targets 8.5 (decent work, equal pay) and 8.8 (safe and secure working environments): transparent wage calculation with
overtime, evidence-backed discrepancy cases with an auditable decision trail, safety reporting that never waits for a model,
workload and fatigue limits, protected feedback channels, and a portable skill record for workers.

## Submission checklist (Innovator Dashboard)

- [ ] Repository is public, URL ends in `.git`, exactly one branch (`main`)
- [ ] Initial repository size under 10 MB (see the note in the release report about the tracked 20 MB `impeccable.exe`)
- [ ] No secrets in tree or history (scanned; none found by pattern search)
- [ ] Vercel URL deployed with `EMPLOYER_PIN` set, and the demo workflow above tested on that URL
- [ ] LinkedIn post published (draft below), link added
- [ ] Form submitted on the Innovator Dashboard and confirmation seen

## LinkedIn draft

> Many shift workers can't easily check whether their pay matches the hours they worked, and when something is wrong,
> raising it feels risky.
>
> For Prompt Wars 2026 (SDG 8) I built FairShift: workers see their shifts and a transparent payslip calculation, report a wage
> or safety problem, and follow it to a decision. Employers review the same records. AI agents gather the attendance evidence
> and explain it, but the money is always calculated by deterministic rules and a human makes every decision, with a full audit trail.
>
> It works for construction sites and college facilities, in English and Tamil, with a live workplace simulation.
> Honest status: it's a working prototype with in-memory data and a demo PIN, not production auth. Next step is a durable database and real sign-in.
>
> Repo: <add .git URL>  ·  Demo: <add Vercel URL after deploy>
> #SDG8 #PromptWars2026 #SRMACM
