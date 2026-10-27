import { DomainError } from "./errors";
import { INDUSTRIES } from "./industries";
import {
  addDays, analyse, dayOf, fatigueAlerts, hoursBetween, istMs, payslip, priorityFor, weekStart,
} from "./calc";
import type {
  AttendanceRecord, AuditEntry, Case, CaseType, FairEvent, FeedbackItem, FeedbackMode, IndustryId,
  PayrollConfirmation, Priority, Severity, SkillEntry, SkillKind, Snapshot,
} from "./types";

// Process-wide in-memory store. Every interface reads and writes it through the
// same API routes, so all pages share one source of truth. It is NOT durable: it
// resets on restart and does not work across serverless instances (see DEPLOY.md).
// Supabase/Postgres is the intended durable backend; keep all access in this file.

export interface UploadedFile { name: string; type: string; data: string } // data: base64

interface State {
  attendance: AttendanceRecord[];
  cases: Case[];
  audit: AuditEntry[];
  events: FairEvent[];
  feedback: FeedbackItem[];
  skills: SkillEntry[];
  payroll: PayrollConfirmation[];
  evidence: Record<string, string[]>; // case id -> base64 per file (never sent in snapshots)
  alertKeys: Set<string>;
  seq: number;
  caseSeq: number;
}

const g = globalThis as unknown as { __fairshift3?: State };
const state: State = (g.__fairshift3 ??= {
  attendance: [], cases: [], audit: [], events: [], feedback: [], skills: [], payroll: [],
  evidence: {}, alertKeys: new Set(), seq: 0, caseSeq: 0,
});

const nextId = (p: string) => `${p}${++state.seq}`;
const cfgOf = (i: IndustryId) => INDUSTRIES[i];
const findWorker = (industry: IndustryId, workerId: string) =>
  cfgOf(industry).workers.find((w) => w.id === workerId);
const needWorker = (industry: IndustryId, workerId: string) => {
  const w = findWorker(industry, workerId);
  if (!w) throw new DomainError("Unknown worker");
  return w;
};

function log(e: Omit<FairEvent, "id" | "ts">) {
  state.events.unshift({ ...e, id: nextId("e"), ts: Date.now() });
  state.events.length = Math.min(state.events.length, 200);
}

function audit(e: Omit<AuditEntry, "id" | "ts" | "visibility"> & { visibility?: AuditEntry["visibility"] }) {
  state.audit.unshift({ visibility: "worker", ...e, id: nextId("u"), ts: Date.now() });
  state.audit.length = Math.min(state.audit.length, 1000);
}

/** Demo stand-in for a rotating QR: a per-day code the supervisor reads out or shows. */
export function siteCodeFor(industry: IndustryId, now = Date.now()) {
  const s = `${industry}:${dayOf(now)}:${process.env.SITE_CODE_SALT ?? "fairshift"}`;
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return String(h % 1_000_000).padStart(6, "0");
}

export function snapshot(
  industry: IndustryId,
  view: { employer: boolean; workerId?: string },
): Snapshot {
  const now = Date.now();
  const inInd = <T extends { industry: IndustryId }>(xs: T[]) => xs.filter((x) => x.industry === industry);
  const { employer, workerId } = view;
  const mineOnly = <T extends { workerId: string }>(xs: T[]) =>
    employer ? xs : workerId ? xs.filter((x) => x.workerId === workerId) : [];

  const cases = mineOnly(inInd(state.cases));
  const caseIds = new Set(cases.map((c) => c.id));
  return {
    industry,
    employer,
    // attendance is the site board used by the simulation; it carries no pay or case data
    attendance: inInd(state.attendance),
    cases,
    audit: inInd(state.audit)
      .filter((a) => (employer ? true : a.visibility === "worker" && a.caseId && caseIds.has(a.caseId)))
      .slice(0, employer ? 300 : 100),
    events: inInd(state.events).slice(0, 40),
    skills: mineOnly(inInd(state.skills)),
    payroll: mineOnly(inInd(state.payroll)),
    feedback: employer ? inInd(state.feedback) : [],
    siteCode: employer ? siteCodeFor(industry, now) : undefined,
    now,
  };
}

// ---------- attendance ----------

function raiseFatigueAlerts(industry: IndustryId, workerId: string) {
  const w = needWorker(industry, workerId);
  for (const a of fatigueAlerts(cfgOf(industry), state.attendance.filter((r) => r.industry === industry), workerId, Date.now())) {
    if (state.alertKeys.has(a.key)) continue;
    state.alertKeys.add(a.key);
    const what: Record<typeof a.rule, string> = {
      daily: `${a.value}h in one day (limit ${a.limit}h)`,
      weekly: `${a.value}h in the week of ${a.date} (limit ${a.limit}h)`,
      rest: `only ${a.value}h of rest before the shift on ${a.date} (minimum ${a.limit}h)`,
      streak: `${a.value} days in a row (limit ${a.limit})`,
    };
    log({ industry, actor: "System", kind: "fatigue-alert", workerId, message: `Workload alert: ${w.name} — ${what[a.rule]}` });
  }
}

export function clock(industry: IndustryId, workerId: string, action: "in" | "out", siteCode?: string) {
  const w = needWorker(industry, workerId);
  const now = Date.now();
  const open = state.attendance.find((a) => a.workerId === workerId && a.industry === industry && !a.clockOut);
  if (action === "in") {
    if (open) throw new DomainError("Already clocked in");
    const code = (siteCode ?? "").trim();
    if (code && code !== siteCodeFor(industry, now)) throw new DomainError("Site check-in code does not match");
    state.attendance.push({
      id: nextId("a"), workerId, industry, date: dayOf(now), clockIn: now,
      method: code ? "site-code" : "self",
    });
    log({ industry, actor: w.name, kind: "clock-in", workerId, message: `${w.name} (${w.role}) clocked in${code ? " with site code" : ""}` });
    return;
  }
  if (!open) throw new DomainError("Not clocked in");
  open.clockOut = now;
  log({ industry, actor: w.name, kind: "clock-out", workerId, message: `${w.name} clocked out after ${hoursBetween(open.clockIn, now)}h` });
  raiseFatigueAlerts(industry, workerId);
}

/** Supervisor-assisted entry for a past shift (employer PIN checked by the route). */
export function addShift(
  industry: IndustryId, workerId: string, date: string, start: string, end: string,
  by: string, method: AttendanceRecord["method"] = "supervisor",
) {
  const w = needWorker(industry, workerId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) {
    throw new DomainError("Use a valid date and HH:MM times");
  }
  const clockIn = istMs(date, start);
  let clockOut = istMs(date, end);
  if (Number.isNaN(clockIn) || Number.isNaN(clockOut)) throw new DomainError("Invalid date or time");
  if (clockOut <= clockIn) clockOut += 86_400_000; // overnight shift
  if (clockOut > Date.now()) throw new DomainError("A shift cannot end in the future");
  if (clockOut - clockIn > 16 * 3_600_000) throw new DomainError("A single shift cannot be longer than 16 hours");
  const overlap = state.attendance.some(
    (r) => r.workerId === workerId && r.industry === industry && r.clockIn < clockOut && (r.clockOut ?? Date.now()) > clockIn,
  );
  if (overlap) throw new DomainError("This overlaps an existing attendance record");
  state.attendance.push({ id: nextId("a"), workerId, industry, date, clockIn, clockOut, method });
  if (method === "supervisor") {
    audit({ industry, actor: by, role: "employer", action: `Recorded a ${hoursBetween(clockIn, clockOut)}h shift for ${w.name} on ${date}`, visibility: "internal" });
  }
  raiseFatigueAlerts(industry, workerId);
}

/** Sample shift history so overtime and workload rules can be demonstrated immediately. */
export function seedDemoShifts(industry: IndustryId, by: string) {
  const cfg = cfgOf(industry);
  if (state.attendance.some((r) => r.industry === industry && r.method === "demo")) {
    throw new DomainError("Sample shifts are already loaded for this industry");
  }
  const today = dayOf(Date.now());
  const day = (n: number) => addDays(today, -n);
  cfg.workers.forEach((w, i) => {
    if (i === 0) {
      // evening shift, then an early start next morning with little rest, then a long day
      addShift(industry, w.id, day(3), "14:00", "23:00", by, "demo");
      addShift(industry, w.id, day(2), "06:00", "17:00", by, "demo");
      addShift(industry, w.id, day(1), "07:00", "18:30", by, "demo");
    } else if (i === 1) {
      addShift(industry, w.id, day(2), cfg.shift.start, "17:00", by, "demo");
      addShift(industry, w.id, day(1), cfg.shift.start, "18:00", by, "demo"); // overtime
    } else {
      addShift(industry, w.id, day(2), cfg.shift.start, cfg.shift.end, by, "demo");
      addShift(industry, w.id, day(1), cfg.shift.start, cfg.shift.end, by, "demo");
    }
  });
  audit({ industry, actor: by, role: "employer", action: "Loaded sample shift history (demo data)", visibility: "internal" });
}

// ---------- cases ----------

const PRIORITY_ORDER: Priority[] = ["low", "medium", "high", "urgent"];
const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];
const FILE_TYPES = ["image/png", "image/jpeg", "application/pdf"];
const MAX_FILE_BYTES = 1_000_000;

function checkEvidence(files: UploadedFile[] | undefined) {
  const list = files ?? [];
  if (list.length > 3) throw new DomainError("Attach at most 3 files");
  for (const f of list) {
    if (!FILE_TYPES.includes(f.type)) throw new DomainError("Evidence must be a PNG, JPEG or PDF file");
    if (!/^[A-Za-z0-9+/=]+$/.test(f.data)) throw new DomainError("Evidence file is not valid");
    if (Math.floor((f.data.length * 3) / 4) > MAX_FILE_BYTES) throw new DomainError("Each file must be under 1 MB");
  }
  return list;
}

export interface NewCase {
  type: CaseType;
  industry: IndustryId;
  workerId: string;
  description?: string;
  date?: string;
  // wage
  hoursWorked?: number;
  amountPaid?: number;
  // safety
  category?: string;
  location?: string;
  severity?: Severity;
  // attendance
  attendanceId?: string;
  evidence?: UploadedFile[];
}

export function createCase(input: NewCase) {
  const cfg = cfgOf(input.industry);
  const w = needWorker(input.industry, input.workerId);
  const description = (input.description ?? "").trim().slice(0, 1000);
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : dayOf(Date.now());
  const evidence = checkEvidence(input.evidence);
  const dup = (pred: (c: Case) => boolean) =>
    state.cases.some((c) => c.workerId === w.id && c.industry === cfg.id && c.type === input.type && c.status !== "resolved" && c.status !== "rejected" && pred(c));

  const c: Case = {
    id: "", type: input.type, industry: cfg.id, workerId: w.id,
    category: "", priority: "medium", status: "open", title: "", description, date,
    attendanceIds: state.attendance.filter((a) => a.workerId === w.id && a.date === date).map((a) => a.id),
    evidence: evidence.map((f) => ({ name: f.name.slice(0, 80), type: f.type, size: Math.floor((f.data.length * 3) / 4) })),
    reopenCount: 0, createdAt: Date.now(), updatedAt: Date.now(),
  };

  if (input.type === "wage") {
    const hours = Number(input.hoursWorked);
    const paid = Number(input.amountPaid);
    if (!(hours > 0 && hours <= 24)) throw new DomainError("Hours must be between 0 and 24");
    if (!(paid >= 0 && paid < 1_000_000)) throw new DomainError("Invalid amount");
    if (dup((x) => x.date === date)) throw new DomainError(`You already have an open wage report for ${date}`);
    const analysis = analyse(cfg, w, hours, paid);
    c.wage = { hoursWorked: hours, amountPaid: paid, analysis };
    c.category = analysis.overtimeUnpaid ? "unpaid_overtime" : analysis.shortfall > 0 ? "underpayment" : "verification";
    c.title = `Wage discrepancy for ${date}`;
    c.priority = priorityFor("wage", cfg, w, { shortfall: analysis.shortfall });
  } else if (input.type === "safety") {
    if (!cfg.safetyCategories.some((s) => s.id === input.category)) throw new DomainError("Choose a safety category");
    if (!input.location || !(cfg.zones.some((z) => z.name === input.location) || input.location === "Other")) {
      throw new DomainError("Choose the work area");
    }
    if (!SEVERITIES.includes(input.severity as Severity)) throw new DomainError("Choose a severity");
    if (description.length < 10) throw new DomainError("Please describe what happened (at least 10 characters)");
    c.category = input.category!;
    c.location = input.location;
    c.severity = input.severity;
    c.title = `${cfg.safetyCategories.find((s) => s.id === input.category)!.label.en} — ${input.location}`;
    c.priority = priorityFor("safety", cfg, w, { severity: input.severity });
  } else if (input.type === "attendance") {
    const rec = state.attendance.find((a) => a.id === input.attendanceId && a.workerId === w.id);
    if (!rec) throw new DomainError("Attendance record not found");
    if (description.length < 5) throw new DomainError("Please explain what looks wrong");
    if (dup((x) => x.attendanceIds.includes(rec.id) && x.attendanceIds.length === 1 && x.category === "attendance_error")) {
      throw new DomainError("This record is already flagged and waiting for review");
    }
    c.category = "attendance_error";
    c.date = rec.date;
    c.attendanceIds = [rec.id];
    c.title = `Attendance discrepancy for ${rec.date}`;
    c.priority = priorityFor("attendance", cfg, w, {});
  } else {
    throw new DomainError("Unknown report type");
  }

  c.id = `FS-${String(++state.caseSeq).padStart(4, "0")}`;
  state.cases.unshift(c);
  if (evidence.length) state.evidence[c.id] = evidence.map((f) => f.data);
  audit({ industry: cfg.id, caseId: c.id, actor: w.name, role: "worker", action: `Filed ${c.type} report (priority ${c.priority})`, note: description || undefined });
  // shared feed stays anonymous: it never names the reporter
  log({ industry: cfg.id, actor: "System", kind: "case-filed", message: `New ${c.type} report ${c.id} (priority ${c.priority})` });
  return c;
}

export type CaseAction =
  | { action: "assign"; reviewer: string; assignTo: string }
  | { action: "review"; reviewer: string; note?: string }
  | { action: "note"; reviewer: string; note?: string }
  | { action: "resolve"; reviewer: string; note?: string; paidBack?: number; correctedHours?: number }
  | { action: "reject"; reviewer: string; note?: string };

export function actOnCase(caseId: string, a: CaseAction) {
  const c = state.cases.find((x) => x.id === caseId);
  if (!c) throw new DomainError("Case not found");
  const cfg = cfgOf(c.industry);
  const closed = c.status === "resolved" || c.status === "rejected";
  const who = a.reviewer.trim().slice(0, 40) || "Employer";
  const touch = () => { c.updatedAt = Date.now(); };

  if (a.action === "note") {
    const note = (a.note ?? "").trim();
    if (!note) throw new DomainError("Write a note first");
    audit({ industry: c.industry, caseId, actor: who, role: "employer", action: "Added an internal note", note: note.slice(0, 500), visibility: "internal" });
    return c;
  }
  if (closed) throw new DomainError("This case is closed. The worker can reopen it if they disagree.");

  if (a.action === "assign") {
    if (!cfg.reviewers.includes(a.assignTo)) throw new DomainError("Choose a reviewer from the list");
    c.assignedTo = a.assignTo;
    touch();
    audit({ industry: c.industry, caseId, actor: who, role: "employer", action: `Assigned to ${a.assignTo}` });
    return c;
  }
  if (a.action === "review") {
    if (c.status !== "open") throw new DomainError("Review has already started");
    c.status = "in_review";
    touch();
    audit({ industry: c.industry, caseId, actor: who, role: "employer", action: "Started review", note: a.note?.trim().slice(0, 500) || undefined });
    log({ industry: c.industry, actor: "System", kind: "case-update", message: `${c.id} is now in review` });
    return c;
  }

  const note = (a.note ?? "").trim().slice(0, 500);
  // validate everything before changing any state, so a rejected request leaves the case untouched
  let paidBack: number | undefined;
  let correction: { rec: AttendanceRecord; hrs: number } | undefined;
  if (a.action === "reject") {
    if (!note) throw new DomainError("Give the worker a reason for rejecting");
  } else {
    if (c.wage) {
      const max = c.wage.analysis.shortfall;
      paidBack = a.paidBack === undefined ? max : Number(a.paidBack);
      if (!(paidBack >= 0 && paidBack <= max)) throw new DomainError(`Back-pay must be between 0 and ₹${max}`);
    }
    if (c.type === "attendance" && a.correctedHours !== undefined) {
      const hrs = Number(a.correctedHours);
      const rec = state.attendance.find((r) => r.id === c.attendanceIds[0]);
      if (!rec || rec.clockOut === undefined) throw new DomainError("Only a completed shift can be corrected");
      if (!(hrs > 0 && hrs <= 16)) throw new DomainError("Corrected hours must be between 0 and 16");
      correction = { rec, hrs };
    }
  }
  c.status = a.action === "reject" ? "rejected" : "resolved";
  c.paidBack = paidBack;
  if (correction) {
    const { rec, hrs } = correction;
    const before = hoursBetween(rec.clockIn, rec.clockOut!);
    rec.clockOut = rec.clockIn + Math.round(hrs * 3_600_000);
    rec.corrected = true;
    audit({ industry: c.industry, caseId, actor: who, role: "employer", action: `Corrected attendance from ${before}h to ${hrs}h` });
  }
  c.resolutionNote = note || undefined;
  c.resolvedAt = Date.now();
  touch();
  audit({
    industry: c.industry, caseId, actor: who, role: "employer",
    action: c.status === "resolved" ? (c.paidBack !== undefined ? `Resolved with ₹${c.paidBack} back-pay` : "Resolved") : "Rejected",
    note: note || undefined,
  });
  log({
    industry: c.industry, actor: "Employer", kind: c.status === "resolved" ? "case-resolved" : "case-rejected",
    message: `${c.id} was ${c.status}`,
  });
  return c;
}

/** The worker disputes a closed decision. */
export function reopenCase(caseId: string, workerId: string, reason: string) {
  const c = state.cases.find((x) => x.id === caseId);
  if (!c || c.workerId !== workerId) throw new DomainError("Case not found");
  if (c.status !== "resolved" && c.status !== "rejected") throw new DomainError("Only a closed case can be reopened");
  const text = reason.trim().slice(0, 500);
  if (text.length < 5) throw new DomainError("Please say why you disagree");
  const w = needWorker(c.industry, workerId);
  const prior = c.status;
  c.status = "open";
  c.reopenCount += 1;
  c.resolvedAt = undefined;
  c.resolutionNote = undefined;
  c.paidBack = undefined;
  c.assignedTo = undefined;
  c.priority = PRIORITY_ORDER[Math.min(PRIORITY_ORDER.indexOf(c.priority) + 1, PRIORITY_ORDER.length - 1)];
  c.updatedAt = Date.now();
  audit({ industry: c.industry, caseId, actor: w.name, role: "worker", action: `Disputed the ${prior} decision and reopened the case (priority now ${c.priority})`, note: text });
  log({ industry: c.industry, actor: "System", kind: "case-update", message: `${c.id} was reopened by the worker` });
  return c;
}

export function getEvidence(caseId: string, idx: number) {
  const c = state.cases.find((x) => x.id === caseId);
  const data = state.evidence[caseId]?.[idx];
  if (!c || data === undefined) throw new DomainError("Evidence not found");
  return { buffer: Buffer.from(data, "base64"), meta: c.evidence[idx], workerId: c.workerId };
}

// ---------- feedback ----------

export function addFeedback(input: { industry: IndustryId; mode: FeedbackMode; category: string; text: string; workerId?: string }) {
  const text = input.text.trim().slice(0, 1000);
  if (text.length < 10) throw new DomainError("Please write at least 10 characters");
  if (input.mode !== "anonymous" && input.mode !== "confidential") throw new DomainError("Choose how to send this");
  if (!["conditions", "pay", "safety", "management", "other"].includes(input.category)) throw new DomainError("Choose a topic");
  const now = Date.now();
  const f: FeedbackItem = {
    id: nextId("fb"), industry: input.industry, mode: input.mode, category: input.category, text,
    // anonymous: no identity stored, and the time is rounded to the day to resist matching against clock-ins
    ts: input.mode === "anonymous" ? istMs(dayOf(now), "00:00") : now,
    reviewed: false,
  };
  if (input.mode === "confidential") {
    f.reporterId = needWorker(input.industry, String(input.workerId)).id;
    log({ industry: input.industry, actor: "System", kind: "feedback", message: "New confidential feedback was submitted" });
  }
  state.feedback.unshift(f);
  return { id: f.id };
}

export function reviewFeedback(id: string, reviewer: string) {
  const f = state.feedback.find((x) => x.id === id);
  if (!f) throw new DomainError("Feedback not found");
  f.reviewed = true;
  audit({ industry: f.industry, actor: reviewer || "Employer", role: "employer", action: `Marked ${f.mode} feedback as reviewed`, visibility: "internal" });
}

// ---------- skill passport ----------

export function addSkill(input: { industry: IndustryId; workerId: string; kind: SkillKind; name: string; detail?: string; year?: number }) {
  const w = needWorker(input.industry, input.workerId);
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new DomainError("Enter a name");
  if (!["skill", "training", "experience"].includes(input.kind)) throw new DomainError("Choose a type");
  const year = input.year === undefined || Number.isNaN(input.year) ? undefined : Number(input.year);
  if (year !== undefined && !(year >= 1970 && year <= new Date().getFullYear())) throw new DomainError("Enter a valid year");
  if (state.skills.some((s) => s.workerId === w.id && s.kind === input.kind && s.name.toLowerCase() === name.toLowerCase())) {
    throw new DomainError("You already added this");
  }
  const s: SkillEntry = {
    id: nextId("s"), industry: input.industry, workerId: w.id, kind: input.kind, name,
    detail: (input.detail ?? "").trim().slice(0, 200), year, status: "self_reported", updatedAt: Date.now(),
  };
  state.skills.unshift(s);
  return s;
}

export function skillAction(
  id: string,
  a:
    | { action: "request"; workerId: string }
    | { action: "remove"; workerId: string }
    | { action: "verify"; reviewer: string }
    | { action: "decline"; reviewer: string },
) {
  const s = state.skills.find((x) => x.id === id);
  if (!s) throw new DomainError("Entry not found");
  const w = needWorker(s.industry, s.workerId);
  if (a.action === "request" || a.action === "remove") {
    if (a.workerId !== s.workerId) throw new DomainError("Entry not found");
    if (a.action === "remove") {
      if (s.status === "verified") throw new DomainError("Verified entries cannot be removed by the worker");
      state.skills = state.skills.filter((x) => x.id !== id);
      return s;
    }
    if (s.status !== "self_reported" && s.status !== "declined") throw new DomainError("Verification is already requested or done");
    s.status = "verification_requested";
    s.updatedAt = Date.now();
    log({ industry: s.industry, actor: w.name, kind: "skill", workerId: w.id, message: `${w.name} asked to verify "${s.name}"` });
    return s;
  }
  if (s.status !== "verification_requested") throw new DomainError("Nothing to review: verification was not requested");
  s.status = a.action === "verify" ? "verified" : "declined";
  s.verifiedBy = a.action === "verify" ? a.reviewer.slice(0, 40) || "Employer" : undefined;
  s.updatedAt = Date.now();
  audit({ industry: s.industry, actor: a.reviewer || "Employer", role: "employer", action: `${a.action === "verify" ? "Verified" : "Declined"} "${s.name}" for ${w.name}`, visibility: "internal" });
  return s;
}

// ---------- payroll ----------

export function confirmPayroll(industry: IndustryId, workerId: string, period: string, by: string) {
  const w = needWorker(industry, workerId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period) || weekStart(period) !== period) throw new DomainError("Invalid pay period");
  if (state.payroll.some((p) => p.workerId === workerId && p.period === period && p.industry === industry)) {
    throw new DomainError("This pay period is already confirmed");
  }
  const slip = payslip(cfgOf(industry), w, state.attendance.filter((r) => r.industry === industry), period, Date.now());
  if (slip.inProgress) throw new DomainError("A shift is still open for this worker");
  if (slip.days.length === 0) throw new DomainError("No attendance in this pay period");
  const p: PayrollConfirmation = {
    id: nextId("p"), industry, workerId, period, net: slip.net, gross: slip.gross, hours: slip.hours,
    confirmedBy: by.slice(0, 40) || "Employer", confirmedAt: Date.now(),
  };
  state.payroll.unshift(p);
  audit({ industry, actor: p.confirmedBy, role: "employer", action: `Confirmed payroll for ${w.name}, week of ${period}: net ₹${p.net}`, visibility: "internal" });
  log({ industry, actor: "System", kind: "payroll", message: `Payroll confirmed for the week of ${period}` });
  return p;
}
