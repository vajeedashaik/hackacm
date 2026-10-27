-- Row Level Security. Model:
--   * Browser clients use the anon key + the signed-in user's JWT, i.e. role `authenticated`.
--   * `authenticated` gets SELECT (filtered by the policies below) and INSERT only on
--     safety_incidents and feedback. Every other write goes through server-side services
--     using the service role, which bypasses RLS and must never reach browser code.
--   * `anon` gets nothing.

-- ---------------------------------------------------------------- helpers
create schema if not exists app;

create or replace function app.uid() returns uuid
language sql stable as $$ select auth.uid() $$;

create or replace function app.org_id() returns uuid
language sql stable security definer set search_path = public as
$$ select org_id from profiles where id = auth.uid() $$;

create or replace function app.role() returns text
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

-- May the caller see records belonging to worker `w` in organisation `o`?
--   worker -> only themself; supervisor -> only workers assigned to them; employer_admin -> whole org.
create or replace function app.can_see_worker(w uuid, o uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select o = (select org_id from profiles where id = auth.uid())
    and (
      w = auth.uid()
      or (select role from profiles where id = auth.uid()) = 'employer_admin'
      or (
        (select role from profiles where id = auth.uid()) = 'supervisor'
        and exists (select 1 from worker_profiles wp where wp.profile_id = w and wp.supervisor_id = auth.uid())
      )
    )
$$;

create or replace function app.is_admin(o uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select o = org_id and role = 'employer_admin' from profiles where id = auth.uid() $$;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------- privileges
revoke all on all tables in schema public from anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert on safety_incidents, feedback to authenticated;
grant all on all tables in schema public to service_role;

-- ---------------------------------------------------------------- enable RLS everywhere
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- organisation-scoped reads
create policy industry_configs_read on industry_configs for select to authenticated using (true);
create policy organisations_read on organisations for select to authenticated using (id = app.org_id());
create policy worksites_read on worksites for select to authenticated using (org_id = app.org_id());
create policy work_areas_read on work_areas for select to authenticated using (org_id = app.org_id());
create policy job_roles_read on job_roles for select to authenticated using (org_id = app.org_id());
create policy skills_read on skills for select to authenticated using (org_id = app.org_id());
create policy pay_rules_read on pay_rules for select to authenticated using (org_id = app.org_id());
create policy scenario_definitions_read on scenario_definitions for select to authenticated
  using (org_id is null or org_id = app.org_id());

-- ---------------------------------------------------------------- people
create policy profiles_read on profiles for select to authenticated
  using (id = auth.uid() or app.can_see_worker(id, org_id));
create policy worker_profiles_read on worker_profiles for select to authenticated
  using (app.can_see_worker(profile_id, org_id));

-- ---------------------------------------------------------------- worker-owned records
create policy shifts_read on shifts for select to authenticated using (app.can_see_worker(worker_id, org_id));
create policy attendance_read on attendance_records for select to authenticated using (app.can_see_worker(worker_id, org_id));
create policy corrections_read on attendance_corrections for select to authenticated using (app.can_see_worker(requested_by, org_id));
create policy wage_calcs_read on wage_calculations for select to authenticated using (app.can_see_worker(worker_id, org_id));
create policy payroll_records_read on payroll_records for select to authenticated using (app.can_see_worker(worker_id, org_id));
create policy payroll_comparisons_read on payroll_comparisons for select to authenticated using (app.can_see_worker(worker_id, org_id));
create policy fairness_cases_read on fairness_cases for select to authenticated using (app.can_see_worker(worker_id, org_id));
create policy hours_alerts_read on hours_alerts for select to authenticated using (app.can_see_worker(worker_id, org_id));
create policy training_read on training_records for select to authenticated using (app.can_see_worker(worker_id, org_id));
create policy passport_read on skill_passport_entries for select to authenticated using (app.can_see_worker(worker_id, org_id));
create policy incidents_read on safety_incidents for select to authenticated using (app.can_see_worker(reporter_id, org_id));
create policy notifications_read on notifications for select to authenticated using (recipient_id = auth.uid());

-- Evidence and transitions follow visibility of the parent case (the subquery is itself RLS-filtered).
create policy case_evidence_read on case_evidence for select to authenticated
  using (exists (select 1 from fairness_cases c where c.id = case_id));
create policy case_transitions_read on case_transitions for select to authenticated
  using (exists (select 1 from fairness_cases c where c.id = case_id));

-- ---------------------------------------------------------------- self-service inserts
create policy incidents_insert on safety_incidents for insert to authenticated
  with check (reporter_id = auth.uid() and org_id = app.org_id());

-- Confidential feedback names its author; anonymous feedback stores no author at all.
create policy feedback_insert on feedback for insert to authenticated
  with check (
    org_id = app.org_id()
    and ((is_anonymous and submitted_by is null) or (not is_anonymous and submitted_by = auth.uid()))
  );

-- Employer admins read all org feedback. Authors read only their own non-anonymous feedback.
-- Supervisors cannot read feedback. Nobody can link an anonymous row to a user through the database.
create policy feedback_read on feedback for select to authenticated
  using (app.is_admin(org_id) or (submitted_by is not null and submitted_by = auth.uid()));

-- ---------------------------------------------------------------- admin-only operational data
create policy scenario_runs_read on scenario_runs for select to authenticated
  using (app.is_admin(org_id) or started_by = auth.uid());
create policy agent_runs_read on agent_runs for select to authenticated using (app.is_admin(org_id));
create policy agent_events_read on agent_events for select to authenticated
  using (exists (select 1 from agent_runs r where r.id = run_id));
create policy agent_tool_actions_read on agent_tool_actions for select to authenticated
  using (exists (select 1 from agent_runs r where r.id = run_id));
create policy audit_read on audit_events for select to authenticated using (app.is_admin(org_id));

-- Events: admins see the org stream; others only events about themselves.
create policy app_events_read on app_events for select to authenticated
  using (app.is_admin(org_id) or (worker_id is not null and worker_id = auth.uid() and org_id = app.org_id()));

-- ---------------------------------------------------------------- append-only history
create or replace function app.forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end $$;

create trigger audit_events_append_only before update or delete on audit_events
  for each row execute function app.forbid_change();
create trigger case_transitions_append_only before update or delete on case_transitions
  for each row execute function app.forbid_change();
