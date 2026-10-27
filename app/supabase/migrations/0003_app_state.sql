-- Durable snapshot of the demo app's shared state (src/lib/persist.ts). One row per deployment.
-- Written only by the server with the service role, which bypasses RLS. RLS is enabled with no
-- policies and all client roles are revoked, so the anon and authenticated keys can read nothing.
create table if not exists public.fairshift_state (
  id         text primary key,
  version    bigint      not null default 0,
  data       jsonb       not null,
  updated_at timestamptz not null default now()
);
alter table public.fairshift_state enable row level security;
revoke all on public.fairshift_state from anon, authenticated;
