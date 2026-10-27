-- FairShift core schema (PostgreSQL / Supabase).
-- Money is numeric(12,2) INR. Timestamps are timestamptz. All business tables carry org_id so
-- RLS can scope by organisation. Writes beyond the few self-service inserts in 0002_rls.sql go
-- through server-side services using the service role (never shipped to the browser).
-- gen_random_uuid() is built into PostgreSQL 13+, so no extension is needed.


-- ---------------------------------------------------------------- tenancy & people
create table industry_configs (
  id text primary key,                       -- 'construction' | 'college' | future industries
  label text not null,
  shift_patterns jsonb not null default '[]',   -- [{name,start,end}]
  safety_categories jsonb not null default '[]',-- [text]
  max_safe_hours_per_day numeric(4,1) not null check (max_safe_hours_per_day between 1 and 24),
  created_at timestamptz not null default now()
);

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry_id text not null references industry_configs(id),
  created_at timestamptz not null default now()
);

create table worksites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);
create index on worksites(org_id);

create table work_areas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  worksite_id uuid not null references worksites(id) on delete cascade,
  name text not null,
  unique (worksite_id, name)
);
create index on work_areas(org_id);

create table job_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  base_hourly_rate numeric(12,2) not null check (base_hourly_rate >= 0),
  unique (org_id, name)
);

-- One row per signed-in user. role: worker | supervisor | employer_admin.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organisations(id) on delete cascade,
  role text not null check (role in ('worker','supervisor','employer_admin')),
  display_name text not null,
  preferred_language text not null default 'en' check (preferred_language in ('en','ta')),
  created_at timestamptz not null default now()
);
create index on profiles(org_id, role);

create table worker_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  org_id uuid not null references organisations(id) on delete cascade,
  job_role_id uuid not null references job_roles(id),
  worksite_id uuid not null references worksites(id),
  supervisor_id uuid references profiles(id) on delete set null,
  hourly_rate numeric(12,2) not null check (hourly_rate >= 0)   -- overrides job role base rate
);
create index on worker_profiles(org_id);
create index on worker_profiles(supervisor_id);

-- ---------------------------------------------------------------- shifts & attendance
create table shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  worksite_id uuid not null references worksites(id),
  work_area_id uuid references work_areas(id),
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  check (scheduled_end > scheduled_start)
);
create index on shifts(org_id, scheduled_start);
create index on shifts(worker_id, scheduled_start);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  shift_id uuid references shifts(id) on delete set null,
  work_area_id uuid references work_areas(id),
  clock_in timestamptz not null,
  clock_out timestamptz,
  source text not null default 'self' check (source in ('self','supervisor','correction')),
  check (clock_out is null or clock_out > clock_in)
);
create unique index attendance_one_open_per_worker on attendance_records(worker_id) where clock_out is null;
create index on attendance_records(org_id, clock_in);
create index on attendance_records(worker_id, clock_in);

create table attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  attendance_id uuid not null references attendance_records(id) on delete cascade,
  requested_by uuid not null references profiles(id),
  proposed_clock_in timestamptz not null,
  proposed_clock_out timestamptz,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (proposed_clock_out is null or proposed_clock_out > proposed_clock_in)
);
create index on attendance_corrections(org_id, status);

-- ---------------------------------------------------------------- pay
create table pay_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  effective_from date not null,
  regular_hours_per_day numeric(4,1) not null check (regular_hours_per_day between 1 and 24),
  overtime_multiplier numeric(4,2) not null check (overtime_multiplier >= 1),
  discrepancy_tolerance numeric(12,2) not null default 0 check (discrepancy_tolerance >= 0),
  created_at timestamptz not null default now(),
  unique (org_id, effective_from)
);

-- Always an ESTIMATE derived from clock records and an explicit pay rule. Inputs and results are
-- stored so any figure can be reproduced. Never produced by an LLM.
create table wage_calculations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  work_date date not null,
  pay_rule_id uuid not null references pay_rules(id),
  hours_total numeric(6,2) not null,
  regular_hours numeric(6,2) not null,
  overtime_hours numeric(6,2) not null,
  hourly_rate numeric(12,2) not null,
  expected_amount numeric(12,2) not null,
  basis text not null default 'attendance_estimate' check (basis = 'attendance_estimate'),
  inputs jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index on wage_calculations(org_id, work_date);
create index on wage_calculations(worker_id, work_date);

-- source employer_payroll = confirmed payroll; worker_reported = what the worker says they received.
create table payroll_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  work_date date not null,
  amount_paid numeric(12,2) not null check (amount_paid >= 0),
  source text not null check (source in ('employer_payroll','worker_reported')),
  recorded_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index on payroll_records(org_id, work_date);
create index on payroll_records(worker_id, work_date);

create table payroll_comparisons (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  wage_calculation_id uuid not null references wage_calculations(id) on delete cascade,
  payroll_record_id uuid not null references payroll_records(id) on delete cascade,
  expected_amount numeric(12,2) not null,
  paid_amount numeric(12,2) not null,
  shortfall numeric(12,2) not null check (shortfall >= 0),
  paid_is_confirmed boolean not null,        -- true only when payroll_records.source = employer_payroll
  flagged boolean not null,
  created_at timestamptz not null default now()
);
create index on payroll_comparisons(org_id, flagged);
create index on payroll_comparisons(worker_id);

-- ---------------------------------------------------------------- safety, feedback
create table safety_incidents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  reporter_id uuid not null references profiles(id),
  worksite_id uuid references worksites(id),
  work_area_id uuid references work_areas(id),
  category text not null,
  severity text not null check (severity in ('low','medium','high','critical')),
  description text not null check (char_length(description) between 1 and 2000),
  status text not null default 'open' check (status in ('open','investigating','closed')),
  created_at timestamptz not null default now()
);
create index on safety_incidents(org_id, status);
create index on safety_incidents(reporter_id);

-- submitted_by is NULL for anonymous feedback: no reporter identifier is stored. Timing, wording
-- or a very small team can still let a reader guess the author; this is not absolute anonymity.
create table feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  submitted_by uuid references profiles(id) on delete set null,
  is_anonymous boolean not null,
  category text not null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  check ((is_anonymous and submitted_by is null) or (not is_anonymous and submitted_by is not null))
);
create index on feedback(org_id, created_at);

-- ---------------------------------------------------------------- fairness cases
create table fairness_cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  case_type text not null check (case_type in ('wage_discrepancy','excessive_hours','safety','other')),
  status text not null default 'reported'
    check (status in ('reported','triaged','under_review','action_proposed','resolved','rejected','disputed')),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null default '' check (char_length(summary) <= 2000),
  payroll_comparison_id uuid references payroll_comparisons(id) on delete set null,
  opened_by uuid not null references profiles(id),
  assigned_to uuid references profiles(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index on fairness_cases(org_id, status);
create index on fairness_cases(worker_id);

create table case_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  case_id uuid not null references fairness_cases(id) on delete cascade,
  added_by uuid not null references profiles(id),
  added_by_agent boolean not null default false,
  kind text not null check (kind in ('note','attendance','payroll','photo','other')),
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on case_evidence(case_id);

-- Who moved a case, from what to what. Append-only.
create table case_transitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  case_id uuid not null references fairness_cases(id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_id uuid not null references profiles(id),
  actor_is_agent boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);
create index on case_transitions(case_id, created_at);

-- ---------------------------------------------------------------- skills
create table skills (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  name text not null,
  unique (org_id, name)
);

create table training_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  skill_id uuid not null references skills(id),
  title text not null,
  completed_at date not null,
  verified_by uuid references profiles(id)
);
create index on training_records(worker_id);

create table skill_passport_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  skill_id uuid not null references skills(id),
  level text not null check (level in ('beginner','intermediate','advanced')),
  training_record_id uuid references training_records(id) on delete set null,
  verified_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  unique (worker_id, skill_id)
);

-- ---------------------------------------------------------------- alerts & notifications
create table hours_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  worker_id uuid not null references profiles(id) on delete cascade,
  work_date date not null,
  total_hours numeric(6,2) not null,
  threshold_hours numeric(4,1) not null,
  status text not null default 'open' check (status in ('open','acknowledged')),
  created_at timestamptz not null default now(),
  unique (worker_id, work_date)
);
create index on hours_alerts(org_id, status);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  recipient_id uuid not null references profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications(recipient_id, read_at);

-- ---------------------------------------------------------------- scenarios & agents
create table scenario_definitions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organisations(id) on delete cascade,  -- null = built-in, visible to all
  industry_id text not null references industry_configs(id),
  name text not null,
  definition jsonb not null
);

create table scenario_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  scenario_id uuid not null references scenario_definitions(id),
  started_by uuid not null references profiles(id),
  status text not null default 'running' check (status in ('running','completed','failed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  result jsonb
);
create index on scenario_runs(org_id, started_at);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  scenario_run_id uuid references scenario_runs(id) on delete set null,
  initiated_by uuid not null references profiles(id),   -- the human whose permissions the agent uses
  agent_name text not null,
  status text not null default 'running' check (status in ('running','completed','failed','cancelled')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  outcome jsonb
);
create index on agent_runs(org_id, started_at);

create table agent_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  seq integer not null,
  kind text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (run_id, seq)
);

create table agent_tool_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  tool_name text not null,
  input jsonb not null default '{}',
  output jsonb,
  allowed boolean not null,              -- false when the permission check rejected the call
  error text,
  created_at timestamptz not null default now()
);
create index on agent_tool_actions(run_id);

-- ---------------------------------------------------------------- events & audit
-- Application events fanned out via Supabase Realtime. Payloads carry ids and counts only,
-- never complaint text or personal data.
create table app_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  kind text not null,
  entity_type text not null,
  entity_id uuid,
  worker_id uuid references profiles(id) on delete set null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on app_events(org_id, created_at);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null,  -- null for anonymous submissions
  actor_is_agent boolean not null default false,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}',                      -- ids/statuses only, no complaint text
  created_at timestamptz not null default now()
);
create index on audit_events(org_id, created_at);
create index on audit_events(entity_type, entity_id);

-- Realtime: publish app_events when the Supabase publication exists (it does not in plain Postgres).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table app_events;
  end if;
end $$;
