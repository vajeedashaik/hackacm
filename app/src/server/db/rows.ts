// Row types mirroring supabase/migrations/0001_schema.sql (snake_case, timestamps as ISO strings,
// money as INR numbers with two decimals). Hand-maintained: regenerate with `supabase gen types`
// once a project is connected and keep this file as the adapter-facing shape.

export type Role = "worker" | "supervisor" | "employer_admin";
export type CaseStatus =
  | "reported" | "triaged" | "under_review" | "action_proposed" | "resolved" | "rejected" | "disputed";
export type CaseType = "wage_discrepancy" | "excessive_hours" | "safety" | "other";
export type Severity = "low" | "medium" | "high" | "critical";

export interface IndustryConfigRow {
  id: string; label: string;
  shift_patterns: { name: string; start: string; end: string }[];
  safety_categories: string[];
  max_safe_hours_per_day: number;
}
export interface OrganisationRow { id: string; name: string; industry_id: string }
export interface WorksiteRow { id: string; org_id: string; name: string }
export interface WorkAreaRow { id: string; org_id: string; worksite_id: string; name: string }
export interface JobRoleRow { id: string; org_id: string; name: string; base_hourly_rate: number }
export interface AuthUserRow { id: string; email: string }
export interface ProfileRow {
  id: string; org_id: string; role: Role; display_name: string; preferred_language: "en" | "ta";
}
export interface WorkerProfileRow {
  profile_id: string; org_id: string; job_role_id: string; worksite_id: string;
  supervisor_id: string | null; hourly_rate: number;
}
export interface ShiftRow {
  id: string; org_id: string; worker_id: string; worksite_id: string; work_area_id: string | null;
  scheduled_start: string; scheduled_end: string;
}
export interface AttendanceRow {
  id: string; org_id: string; worker_id: string; shift_id: string | null; work_area_id: string | null;
  clock_in: string; clock_out: string | null; source: "self" | "supervisor" | "correction";
}
export interface AttendanceCorrectionRow {
  id: string; org_id: string; attendance_id: string; requested_by: string;
  proposed_clock_in: string; proposed_clock_out: string | null; reason: string;
  status: "pending" | "approved" | "rejected"; decided_by: string | null; decided_at: string | null;
  created_at: string;
}
export interface PayRuleRow {
  id: string; org_id: string; name: string; effective_from: string;
  regular_hours_per_day: number; overtime_multiplier: number; discrepancy_tolerance: number;
}
export interface WageCalculationRow {
  id: string; org_id: string; worker_id: string; work_date: string; pay_rule_id: string;
  hours_total: number; regular_hours: number; overtime_hours: number; hourly_rate: number;
  expected_amount: number; basis: "attendance_estimate";
  inputs: Record<string, unknown>; result: Record<string, unknown>; created_at: string;
}
export interface PayrollRecordRow {
  id: string; org_id: string; worker_id: string; work_date: string; amount_paid: number;
  source: "employer_payroll" | "worker_reported"; recorded_by: string; created_at: string;
}
export interface PayrollComparisonRow {
  id: string; org_id: string; worker_id: string; wage_calculation_id: string; payroll_record_id: string;
  expected_amount: number; paid_amount: number; shortfall: number; paid_is_confirmed: boolean;
  flagged: boolean; created_at: string;
}
export interface SafetyIncidentRow {
  id: string; org_id: string; reporter_id: string; worksite_id: string | null; work_area_id: string | null;
  category: string; severity: Severity; description: string;
  status: "open" | "investigating" | "closed"; created_at: string;
}
export interface FeedbackRow {
  id: string; org_id: string; submitted_by: string | null; is_anonymous: boolean;
  category: string; body: string; created_at: string;
}
export interface FairnessCaseRow {
  id: string; org_id: string; worker_id: string; case_type: CaseType; status: CaseStatus;
  title: string; summary: string; payroll_comparison_id: string | null; opened_by: string;
  assigned_to: string | null; resolution_note: string | null;
  created_at: string; updated_at: string; resolved_at: string | null;
}
export interface CaseEvidenceRow {
  id: string; org_id: string; case_id: string; added_by: string; added_by_agent: boolean;
  kind: "note" | "attendance" | "payroll" | "photo" | "other"; content: string; created_at: string;
}
export interface CaseTransitionRow {
  id: string; org_id: string; case_id: string; from_status: CaseStatus | null; to_status: CaseStatus;
  actor_id: string; actor_is_agent: boolean; note: string | null; created_at: string;
}
export interface SkillRow { id: string; org_id: string; name: string }
export interface TrainingRecordRow {
  id: string; org_id: string; worker_id: string; skill_id: string; title: string;
  completed_at: string; verified_by: string | null;
}
export interface SkillPassportRow {
  id: string; org_id: string; worker_id: string; skill_id: string;
  level: "beginner" | "intermediate" | "advanced"; training_record_id: string | null;
  verified_by: string | null; updated_at: string;
}
export interface HoursAlertRow {
  id: string; org_id: string; worker_id: string; work_date: string; total_hours: number;
  threshold_hours: number; status: "open" | "acknowledged"; created_at: string;
}
export interface NotificationRow {
  id: string; org_id: string; recipient_id: string; kind: string; title: string; body: string;
  read_at: string | null; created_at: string;
}
export interface ScenarioDefinitionRow {
  id: string; org_id: string | null; industry_id: string; name: string; definition: Record<string, unknown>;
}
export interface ScenarioRunRow {
  id: string; org_id: string; scenario_id: string; started_by: string;
  status: "running" | "completed" | "failed"; started_at: string; ended_at: string | null;
  result: Record<string, unknown> | null;
}
export interface AgentRunRow {
  id: string; org_id: string; scenario_run_id: string | null; initiated_by: string; agent_name: string;
  status: "running" | "completed" | "failed" | "cancelled"; started_at: string; ended_at: string | null;
  outcome: Record<string, unknown> | null;
}
export interface AgentEventRow {
  id: string; run_id: string; seq: number; kind: string; payload: Record<string, unknown>; created_at: string;
}
export interface AgentToolActionRow {
  id: string; run_id: string; tool_name: string; input: Record<string, unknown>;
  output: Record<string, unknown> | null; allowed: boolean; error: string | null; created_at: string;
}
export interface AppEventRow {
  id: string; org_id: string; kind: string; entity_type: string; entity_id: string | null;
  worker_id: string | null; payload: Record<string, unknown>; created_at: string;
}
export interface AuditEventRow {
  id: string; org_id: string; actor_id: string | null; actor_is_agent: boolean; action: string;
  entity_type: string; entity_id: string | null; details: Record<string, unknown>; created_at: string;
}

/** Table name -> row type. Order is insertion order for seeding (parents before children). */
export interface Tables {
  industry_configs: IndustryConfigRow;
  organisations: OrganisationRow;
  worksites: WorksiteRow;
  work_areas: WorkAreaRow;
  job_roles: JobRoleRow;
  "auth.users": AuthUserRow;
  profiles: ProfileRow;
  worker_profiles: WorkerProfileRow;
  shifts: ShiftRow;
  attendance_records: AttendanceRow;
  attendance_corrections: AttendanceCorrectionRow;
  pay_rules: PayRuleRow;
  wage_calculations: WageCalculationRow;
  payroll_records: PayrollRecordRow;
  payroll_comparisons: PayrollComparisonRow;
  safety_incidents: SafetyIncidentRow;
  feedback: FeedbackRow;
  fairness_cases: FairnessCaseRow;
  case_evidence: CaseEvidenceRow;
  case_transitions: CaseTransitionRow;
  skills: SkillRow;
  training_records: TrainingRecordRow;
  skill_passport_entries: SkillPassportRow;
  hours_alerts: HoursAlertRow;
  notifications: NotificationRow;
  scenario_definitions: ScenarioDefinitionRow;
  scenario_runs: ScenarioRunRow;
  agent_runs: AgentRunRow;
  agent_events: AgentEventRow;
  agent_tool_actions: AgentToolActionRow;
  app_events: AppEventRow;
  audit_events: AuditEventRow;
}
export type TableName = keyof Tables;
export type Db = { [K in TableName]: Tables[K][] };

export const TABLE_ORDER: TableName[] = [
  "industry_configs", "organisations", "worksites", "work_areas", "job_roles", "auth.users", "profiles",
  "worker_profiles", "shifts", "attendance_records", "attendance_corrections", "pay_rules",
  "wage_calculations", "payroll_records", "payroll_comparisons", "safety_incidents", "feedback",
  "fairness_cases", "case_evidence", "case_transitions", "skills", "training_records",
  "skill_passport_entries", "hours_alerts", "notifications", "scenario_definitions", "scenario_runs",
  "agent_runs", "agent_events", "agent_tool_actions", "app_events", "audit_events",
];

export const emptyDb = (): Db =>
  Object.fromEntries(TABLE_ORDER.map((t) => [t, []])) as unknown as Db;
