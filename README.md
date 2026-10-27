# FairShift

Wage transparency, safety reporting and grievance resolution for shift workers.
Built for Prompt Wars 2026 × SRM ACM, **SDG 8: Decent Work and Economic Growth**.

The application lives in [`app/`](app/). Full documentation: [`app/README.md`](app/README.md),
[`app/AI.md`](app/AI.md), [`app/SIMULATION.md`](app/SIMULATION.md), [`app/BACKEND.md`](app/BACKEND.md), [`app/DEPLOY.md`](app/DEPLOY.md).

## Challenge vertical and persona
Fair work for informal and shift workers in two industries: **construction sites** and **college facilities**.
Personas: the worker (basic smartphone, English or Tamil) and the employer or supervisor reviewing cases.

## Approach and logic
- **Deterministic rules decide money and limits.** Regular vs overtime pay, payslips and fatigue (rest and hours) alerts come from
  `app/src/lib/calc.ts` and are unit-tested. Models never calculate amounts.
- **AI agents propose, humans decide.** Attendance, wage, safety and case agents analyse a case with scoped, read-only tools and write a
  *proposal*. Only an employer action (PIN-gated) changes a case. Without a model key a labelled rule-based fallback runs.
- **Context-aware.** Priority, safety urgency, workload alerts and industry limits depend on the worker's records and the selected industry config.

## How it works
1. Worker checks in, sees hours, overtime and payslip, then files a wage discrepancy, safety report or feedback.
2. A case is created with a rule-based priority; agents attach an analysis for the employer.
3. Employer reviews evidence, assigns, and moves the case through validated states; each step is audited and visible to the worker.
4. `/simulation` shows the same shared records as a 2D workplace; events are labelled by source.

## Run
```bash
cd app && npm install && npm run dev      # http://localhost:3000, employer PIN 1234 outside production
npm test                                  # vitest
```

## Assumptions and limitations
- Wage limits, allowances and deductions are **demo values**, not a legal payroll determination.
- State is in memory (not durable); Supabase is not wired in. Employer access is a demo PIN; workers are not authenticated.
- Anonymous feedback is best-effort; do not read it as a guarantee of anonymity.
- Voice (Vapi) and live model calls need credentials and are unverified end to end. Tamil wording needs native review.
- Deployment target is Vercel per the owner's decision; no live deployment exists yet.
