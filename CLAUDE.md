# FairShift — project instructions

SDG 8 hackathon project (Prompt Wars 2026 × SRM ACM). Earlier phase plans were removed from the repo; `urgebt.md` sets the
current priority: **ship a working MVP fast, no optional tooling, no invented results.**

## Architecture (as built)
- `app/` — Next.js (App Router, TypeScript, Tailwind v4), Phaser for the simulation.
- Three top-nav destinations: `/employer`, `/worker`, `/simulation`.
- Shared state: `src/lib/store.ts` (in-memory, process-wide) behind API routes `/api/state|attendance|cases`.
  All pages poll `/api/state` every 2 s, so they stay consistent. **Not durable**; Supabase is not wired up yet.
- UI kit: `src/components/ui.tsx` (Badge/StatusBadge, Notice, Spinner, EmptyState, Stat, native-`<dialog>` Dialog) plus
  `.card/.btn/.field` classes in `globals.css`. Use these instead of ad-hoc markup. `ConnectionBanner` shows offline state
  (`online` flag in `useFair`, set by the 2 s poll); `app/error.tsx`, `loading.tsx`, `not-found.tsx` are the route boundaries.
- Industry configs in `src/lib/industries.ts` (`construction`, `college`). Add an industry = add one entry.
- AI agents + Vapi voice: `src/lib/ai/` (see `app/AI.md`). Agents propose, humans decide; money is never model-calculated; model optional (rule-based fallback).
- Wage logic is deterministic (`src/lib/calc.ts`): regular + overtime vs amount paid.
- English/Tamil: `useT` (`src/lib/client.tsx`) reads typed `{en, ta}` strings from `src/lib/i18n.ts` (add both languages per key; `{name}` placeholders).
  Worker dashboard fully translated; employer dashboard tabs/headings/actions translated; free-text from the API (e.g. analysis summary) is English.
- Access control is demo-grade: every employer action and the employer view of `/api/state` need `x-employer-pin` (`EMPLOYER_PIN`; default `1234` only outside production, closed in production if unset,
  failed guesses rate-limited). Workers are not authenticated: `/api/state?workerId=` returns only that worker's cases/skills/payroll.
  Replace with Supabase Auth + RLS before real use.

## Phase 3 status: worker + employer dashboards (done; API-verified, NOT browser-verified)
- Data (`src/lib/store.ts`, one place for all state): `Case` (type wage|safety|attendance; status open|in_review|resolved|rejected; rule-based
  priority via `calc.priorityFor`; id `FS-0001`), `AuditEntry` (visibility worker|internal), feedback, skills, payroll confirmations, evidence
  (base64 in memory, served only to filing worker or employer), attendance with IST dates. `snapshot(industry,{employer,workerId})` filters per viewer.
- Rules in `calc.ts` (tested in `src/lib/calc.test.mjs`, run `node --test src/lib/calc.test.mjs`): `analyse`, `payslip` (weekly, Mon start),
  `fatigueAlerts` (daily, weekly, rest between shifts on different days, consecutive days; workload checks, never medical). Limits, allowances,
  deductions, safety categories, reviewers live in `industries.ts` (demo values).
- API: `/api/{state,attendance,cases,cases/[id],cases/[id]/evidence/[idx],feedback,feedback/[id],skills,skills/[id],payroll}`; helpers `lib/api.ts`
  (PIN check, `handle`) on top of `lib/http.ts`; store throws `DomainError` (`lib/errors.ts`) for user-fixable errors. Validate before mutating state.
- UI: `app/worker/page.tsx` + `components/worker/*`, `app/employer/page.tsx` + `components/employer/*`, shared `components/common.tsx`
  (Tabs, pills, Timeline, EvidenceLinks, `useAction`). `useFair()` also exposes `workerId`, `pin`, `unlock/lock`, `call()`.
- Supervisor-assisted demo: employer Attendance tab shows the daily site code (stand-in for QR), records past shifts, and loads clearly labelled sample shifts.
- Gaps: no browser/mobile/keyboard/Tamil check done; no Playwright tests; QR scanning not built (site code instead); Config tab read-only;
  Vapi entry card only (`components/worker/Voice.tsx` fires `fairshift:voice-start`, handled by phase 5 `VoiceController`); store not durable;
  Tamil wording needs native review.

## Commands (run in `app/`)
`npm run dev` · `npm run lint` · `npx tsc --noEmit` · `npm test` (vitest) · `npm run build` · `npm start`

## Phase 5 status: AI agents + Vapi voice (done; details in `app/AI.md`)
- Code: `src/lib/ai/` (agents, orchestrator, scoped `tools.ts`, `provider.ts`, `voice.ts`, `personas.ts`), UI `src/components/agents/`,
  routes `/api/agents{,/investigate,/proposals/[caseId],/workload/[id],/assist}`, `/api/voice/session`, `/api/vapi/tools`,
  sim bridge `src/sim/agentAdapter.ts` (events appear as source `agent`, employer view only). Hooks: cases/attendance routes call the
  orchestrator via `after()`; no edits to `store.ts`.
- Rules: agents only *propose*; `decideProposal` (employer PIN) is the only path to a case change and goes through `actOnCase`.
  Money always from `calc.ts`; model text with unknown amounts or decision claims is discarded; models may only raise safety urgency.
- Model is optional: `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` (any OpenAI-compatible endpoint). Unset = labelled rule-based fallback.
- Verified: 102 vitest tests pass (37 agent tests incl. real HTTP provider vs a local mock); live API flow worked end to end with no model.
- NOT verified: any real model call; any real Vapi call (needs `NEXT_PUBLIC_VAPI_PUBLIC_KEY`, `NEXT_PUBLIC_VAPI_ASSISTANT_ID`,
  `VAPI_WEBHOOK_SECRET`; header name, `variableValues` delivery and Tamil quality unconfirmed); visual browser check of the new panels.
- Gaps: agent state is in-memory (resets, per instance); agent text English only; `after()` may be cut short on serverless.
- Repo is edited by more than one session: keep changes in new files, avoid rewriting shared files. `vitest.config.ts` excludes
  `src/sim/**` and `*.test.mjs` (those use `node:test`).
- User instruction: **no deployment for now** (local work only) until told otherwise.

## Deployment (decision: Vercel only)
The owner decided deployment is on **Vercel, not Google Cloud Run**; Cloud Run mentions in phase*.md are outdated. See `app/DEPLOY.md`.
Vercel is serverless, so the in-memory store is NOT reliable there; a durable store (e.g. Supabase) is needed for consistent shared state.

## Submission constraints
Public GitHub repo, URL ends in `.git`, exactly one branch, initial size < 10 MB (never commit `node_modules`, `.next`).

## Secrets
Never commit or print keys/tokens/service-role credentials. `.env*` is git-ignored.

## Installed skills (project-scoped, `.claude/skills/`, see `TOOLING.md`)
Addy Osmani agent-skills, trimmed to 5 (test-driven-development, code-review-and-quality, security-and-hardening, shipping-and-launch,
debugging-and-error-recovery). `impeccable`, `find-skills` and the other skills were removed to keep the repo under 10 MB. Invoke by name.
