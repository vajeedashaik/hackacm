-- DESTRUCTIVE: empties every FairShift table (TRUNCATE skips the append-only triggers).
-- Never run against a live project without explicit approval. Then re-run seed.sql.
truncate table
  audit_events, app_events, agent_tool_actions, agent_events, agent_runs, scenario_runs,
  scenario_definitions, notifications, hours_alerts, skill_passport_entries, training_records, skills,
  case_transitions, case_evidence, fairness_cases, feedback, safety_incidents, payroll_comparisons,
  payroll_records, wage_calculations, pay_rules, attendance_corrections, attendance_records, shifts,
  worker_profiles, profiles, job_roles, work_areas, worksites, organisations, industry_configs
restart identity cascade;
-- Seed users live in auth.users; remove only the synthetic demo ones.
delete from auth.users where email like '%@demo.invalid';
