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

## Durable state (recommended on Vercel)
1. In Supabase, run `supabase/migrations/0003_app_state.sql` (creates `fairshift_state`, RLS on, client roles revoked).
2. In Vercel, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (server-side; not `NEXT_PUBLIC_`). Redeploy.
3. Verify: file a case, then load the site from a second browser; both should show it, and it should survive a redeploy.
Limits: one row, last-write-wins, agent proposals not persisted, evidence files are stored in the row (3 files, 1 MB each per case).

## Known limitation: in-memory state (when the above is not configured)
`src/lib/store.ts` keeps all data in process memory. Vercel serverless instances do not share memory and are recycled, so
the worker, employer and simulation pages may show different data or lose it. For a single-presenter demo, expect to
re-create the sample data (Employer → Attendance → load sample shifts) if state disappears. A durable store (Supabase/Postgres,
Vercel KV) is needed for anything beyond that.

## Verify after deploy
- `GET /api/health` returns `{"ok":true,"service":"fairshift"}`.
- `/worker`, `/employer` (PIN), `/simulation` load; run the demo workflow in the README against the deployed URL.
