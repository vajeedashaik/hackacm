# FairShift AI agents and voice (Phase 5)

All code is in `src/lib/ai/`; UI in `src/components/agents/`; routes under `src/app/api/{agents,voice,vapi}`.

## How it works
`createCase` / `reopenCase` / clock-out / supervisor shift entry call the **orchestrator** after the response is sent
(`after()`), so a slow or failed model never blocks the worker.

| Agent | Job | Uses a model? | Fallback |
|---|---|---|---|
| Orchestrator | routes, 10 s step timeout, validates, writes the activity feed | no | – |
| Wage Analysis | explains the **deterministic** `analyse()` result | wording only | templated text |
| Attendance | compares claim with attendance records, reads workload rules | no (rules) | – |
| Safety Triage | urgency + missing information | may **raise** urgency only | severity/keyword rules |
| Fairness Case | reviewer summary, next steps | wording only | templated text |
| Worker Persona | helps a worker put a concern into words; files nothing | wording only | worker's own words |
| Supervisor Persona | picks a response from a fixed policy list (`personas.ts`) | no | – |

Every result is labelled `model` or `rules`. Persona data lives in `personas.ts`; simulated employees do not run an LLM.

### Boundaries (enforced in code, not by prompt)
* Tools (`tools.ts`) are the only data/effect path. Workers can only read their own records; another industry's data is
  "not found"; workers cannot propose actions.
* Money comes from `calc.ts`. A model sentence is discarded if it mentions an amount the calculation did not produce
  (`moneyIsGrounded`) or claims a decision was made (`claimsDecision`). Back-pay proposals are capped at the shortfall.
* Agents only **propose**. `decideProposal` (employer PIN required by the route) is the sole way a proposal changes a case, and it
  goes through `actOnCase`, so normal lifecycle rules apply (a case the employer closed by hand supersedes the proposal).
* Workers receive only the plain explanation of their own cases; proposals/attendance flags are employer-only.
  Feed summaries never contain worker names; confidential-feedback reporter ids are never returned by any agent route.

## Model provider (optional)
Any OpenAI-compatible `/chat/completions` endpoint. Server-only variables:
```
AI_BASE_URL=https://api.openai.com/v1   # or Groq, OpenRouter, a local gateway
AI_API_KEY=...
AI_MODEL=...
AI_TIMEOUT_MS=8000        # optional
AGENT_STEP_TIMEOUT_MS=10000  # optional
```
Unset = every agent uses its rule-based fallback; the whole investigation flow still works (this is how it was tested).

## Vapi voice (NOT verified against a live account)
Variables: `NEXT_PUBLIC_VAPI_PUBLIC_KEY`, `NEXT_PUBLIC_VAPI_ASSISTANT_ID` (browser), `VAPI_WEBHOOK_SECRET` (server),
optional `VOICE_SESSION_SECRET` (signs session tokens; random per process if unset).

Flow: "Start voice help" -> `POST /api/voice/session` (returns `configured:false` + the missing variable names if unset) ->
server mints a 30-minute HMAC token binding the call to one worker -> browser calls `vapi.start(assistantId,
{ variableValues: { sessionToken, language } })` -> Vapi POSTs tool calls to `/api/vapi/tools`, which checks `X-Vapi-Secret`
and each call's `sessionToken`.

Configure in the Vapi dashboard:
1. Create an assistant. In its system prompt include: "The caller's session token is {{sessionToken}}. Always pass it as the
   `sessionToken` argument of every tool. Speak {{language}}. Never state or guess amounts; read tool results."
2. Add five function tools, each with server URL `https://<your-host>/api/vapi/tools` and a custom credential header
   `X-Vapi-Secret: <VAPI_WEBHOOK_SECRET>`; every tool requires string `sessionToken`:
   * `get_shift_records` (`days` number) · `explain_payslip` (`period` YYYY-MM-DD Monday, optional) · `get_case_status`
   * `report_safety_issue` (`category`, `location`, `severity` low|medium|high|critical, `description`)
   * `raise_grievance` (`category` conditions|pay|safety|management|other, `description`) - stored as confidential feedback
3. Choose a transcriber and voice that support Tamil if you want Tamil; this repo does not verify that.

Unverified: the exact header Vapi sends for the credential, whether `variableValues` reaches the prompt as above on your
plan, Tamil quality, tool-call latency. Docs checked: custom-tools request/response shape (`message.toolCallList`,
`{results:[{toolCallId,result}]}`) and the web SDK's `start(assistant, overrides)` / `variableValues` types. The webhook is unit-tested
with that shape; no real call has been made. The text forms are always available.

## Tests
`npm test` (vitest): `src/lib/ai/ai.test.ts` - end-to-end investigation, model failure modes, untrusted-output rejection,
permission and lifecycle rejections, workload flow, voice tokens/webhook, simulation adapter.

## Known gaps
* State is in-memory like the rest of the store (see DEPLOY.md); agent reports/events reset on restart and are per-instance.
* Agent text is English only (the Tamil toggle covers the app chrome, not agent output).
* `after()` work can be cut short on serverless hosts; a durable queue is needed there.
