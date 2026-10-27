export type IndustryId = "construction" | "college";
export type Bilingual = { en: string; ta: string };

export interface Worker {
  id: string;
  name: string;
  role: string;
  hourlyRate: number; // INR per hour
  color: string; // sprite colour
}

export interface IndustryConfig {
  id: IndustryId;
  label: Bilingual;
  site: string;
  overtimeAfter: number; // hours/day before overtime applies
  overtimeMultiplier: number;
  // fatigue rules (workload checks, not medical assessments)
  maxSafeHours: number; // hours in one day
  maxWeeklyHours: number; // hours in one Mon-Sun week
  minRestHours: number; // minimum gap between two shifts
  maxConsecutiveDays: number;
  shift: { start: string; end: string }; // scheduled shift, HH:MM (IST)
  allowancePerDay: { label: Bilingual; amount: number };
  deductionPerDay: { label: Bilingual; amount: number };
  safetyCategories: { id: string; label: Bilingual }[];
  skillSuggestions: string[];
  reviewers: string[];
  zones: { name: string; x: number; y: number; w: number; h: number; color: number }[];
  workers: Worker[];
}

export interface AttendanceRecord {
  id: string;
  workerId: string;
  industry: IndustryId;
  date: string; // YYYY-MM-DD (IST)
  clockIn: number; // epoch ms
  clockOut?: number;
  method: "self" | "site-code" | "supervisor" | "demo";
  corrected?: boolean;
}

export type CaseType = "wage" | "safety" | "attendance";
export type CaseStatus = "open" | "in_review" | "resolved" | "rejected";
export type Priority = "low" | "medium" | "high" | "urgent";
export type Severity = "low" | "medium" | "high" | "critical";

export interface Analysis {
  regularHours: number;
  overtimeHours: number;
  expectedPay: number;
  shortfall: number;
  overtimeUnpaid: boolean;
  summary: string;
}

export interface EvidenceMeta {
  name: string;
  type: string;
  size: number;
}

export interface Case {
  id: string; // reference, e.g. FS-0007
  type: CaseType;
  industry: IndustryId;
  workerId: string;
  category: string;
  priority: Priority;
  status: CaseStatus;
  title: string;
  description: string;
  date: string;
  location?: string;
  severity?: Severity;
  wage?: { hoursWorked: number; amountPaid: number; analysis: Analysis };
  attendanceIds: string[]; // related attendance records
  evidence: EvidenceMeta[];
  assignedTo?: string;
  resolutionNote?: string; // shown to the worker
  paidBack?: number;
  reopenCount: number;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
}

export interface AuditEntry {
  id: string;
  ts: number;
  industry: IndustryId;
  caseId?: string;
  actor: string;
  role: "worker" | "employer" | "system";
  action: string;
  note?: string;
  visibility: "worker" | "internal";
}

export type FeedbackMode = "anonymous" | "confidential";
export interface FeedbackItem {
  id: string;
  industry: IndustryId;
  mode: FeedbackMode;
  category: string;
  text: string;
  ts: number;
  reviewed: boolean;
  /** present only for confidential feedback, and only in the employer view */
  reporterId?: string;
}

export type SkillKind = "skill" | "training" | "experience";
export type SkillStatus = "self_reported" | "verification_requested" | "verified" | "declined";
export interface SkillEntry {
  id: string;
  industry: IndustryId;
  workerId: string;
  kind: SkillKind;
  name: string;
  detail: string;
  year?: number;
  status: SkillStatus;
  verifiedBy?: string;
  updatedAt: number;
}

export interface PayrollConfirmation {
  id: string;
  industry: IndustryId;
  workerId: string;
  period: string; // Monday of the week, YYYY-MM-DD
  net: number;
  gross: number;
  hours: number;
  confirmedBy: string;
  confirmedAt: number;
}

export interface FairEvent {
  id: string;
  ts: number;
  industry: IndustryId;
  actor: string; // worker name, "Employer" or "System"
  kind:
    | "clock-in" | "clock-out" | "case-filed" | "case-resolved" | "case-rejected"
    | "case-update" | "fatigue-alert" | "feedback" | "skill" | "payroll";
  message: string;
  workerId?: string;
}

export interface Snapshot {
  industry: IndustryId;
  /** true when the request carried a valid employer PIN */
  employer: boolean;
  attendance: AttendanceRecord[];
  cases: Case[];
  audit: AuditEntry[];
  events: FairEvent[];
  skills: SkillEntry[];
  payroll: PayrollConfirmation[];
  feedback: FeedbackItem[]; // employer view only
  siteCode?: string; // employer view only
  now: number;
}
