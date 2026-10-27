# Deploying FairShift to Vercel

Decision: Vercel only (no Cloud Run; the `Dockerfile` is unused).

## Before you deploy
1. **Set `EMPLOYER_PIN`** in Project → Settings → Environment Variables. In production there is no default PIN: without it the employer view cannot be unlocked.
2. Optional: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, Vapi variables (see README). Never use `NEXT_PUBLIC_` for secrets.
3. Do not set `FAIRSHIFT_DEMO_MODE` unless you want the separate `/api/v1` demo backend exposed.

## Deploy (from `app/`, after you log in)
```bash
npx vercel login
npx vercel --prod
```
Set the Vercel project **Root Directory** to `app` if you import the Git repo instead.

## Known limitation: in-memory state
`src/lib/store.ts` keeps all data in process memory. Vercel serverless instances do not share memory and are recycled, so
the worker, employer and simulation pages may show different data or lose it. For a single-presenter demo, expect to
re-create the sample data (Employer → Attendance → load sample shifts) if state disappears. A durable store (Supabase/Postgres,
Vercel KV) is needed for anything beyond that.

## Verify after deploy
- `GET /api/health` returns `{"ok":true,"service":"fairshift"}`.
- `/worker`, `/employer` (PIN), `/simulation` load; run the demo workflow in the README against the deployed URL.
