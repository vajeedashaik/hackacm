import type { CaseStatus, Role } from "./db/rows";

// ------------------------------------------------------------------ actors & permissions
/**
 * Who is acting. Agents act on behalf of a human (`role`/`userId`/`orgId` are that human's) and
 * go through the exact same checks, plus the extra restrictions in `canTransition`.
 */
export interface Actor {
  userId: string;
  orgId: string;
  role: Role;
  kind: "human" | "agent";
}

export const isStaff = (a: Actor) => a.role === "supervisor" || a.role === "employer_admin";

// ------------------------------------------------------------------ pay (integer paise, deterministic)
export interface PayRuleInput {
  regularHoursPerDay: number;
  overtimeMultiplier: number;
}
export interface WageBreakdown {
  hoursTotal: number;
  regularHours: number;
  overtimeHours: number;
  hourlyRatePaise: number;
  regularPaise: number;
  overtimePaise: number;
  expectedPaise: number;
}

const toPaise = (inr: number) => Math.round(inr * 100);
export const fromPaise = (p: number) => p / 100;
const hours2 = (h: number) => Math.round(h * 100) / 100;

/** Hours between two ISO timestamps, rounded to 2 dp. */
export const hoursBetween = (fromIso: string, toIso: string) =>
  hours2((Date.parse(toIso) - Date.parse(fromIso)) / 3_600_000);

/**
 * Regular + overtime pay from explicit inputs. Pure: no clock, no I/O, no model. All money is
 * integer paise so results are exactly reproducible; overtime pay is rounded once, half-up.
 */
export function calculateWage(hoursWorked: number, hourlyRateInr: number, rule: PayRuleInput): WageBreakdown {
  if (!(hoursWorked >= 0 && hoursWorked <= 24)) throw new RangeError("hoursWorked must be within 0..24");
  if (!(hourlyRateInr >= 0)) throw new RangeError("hourlyRate must be >= 0");
  const hoursTotal = hours2(hoursWorked);
  const regularHours = Math.min(hoursTotal, rule.regularHoursPerDay);
  const overtimeHours = hours2(Math.max(0, hoursTotal - rule.regularHoursPerDay));
  const hourlyRatePaise = toPaise(hourlyRateInr);
  const regularPaise = Math.round(regularHours * hourlyRatePaise);
  const overtimePaise = Math.round(overtimeHours * hourlyRatePaise * rule.overtimeMultiplier);
  return {
    hoursTotal, regularHours, overtimeHours, hourlyRatePaise, regularPaise, overtimePaise,
    expectedPaise: regularPaise + overtimePaise,
  };
}

/** Shortfall in paise and whether it exceeds the rule's tolerance (INR). */
export function compareToPaid(expectedPaise: number, paidInr: number, toleranceInr: number) {
  const shortfallPaise = Math.max(0, expectedPaise - toPaise(paidInr));
  return { shortfallPaise, flagged: shortfallPaise > toPaise(toleranceInr) };
}

// ------------------------------------------------------------------ fairness case lifecycle
type Who = "staff" | "admin" | "owner_worker";
interface Edge { to: CaseStatus; who: Who; agentAllowed: boolean }

/**
 *  reported → triaged → under_review → action_proposed → resolved
 *  any open stage → rejected; resolved/rejected → disputed (worker) or reopened to under_review (admin);
 *  disputed → under_review. Only a human employer_admin can resolve, reject after a proposal,
 *  or reopen: an agent recommendation never closes a case.
 */
export const CASE_EDGES: Record<CaseStatus, Edge[]> = {
  reported: [
    { to: "triaged", who: "staff", agentAllowed: true },
    { to: "rejected", who: "admin", agentAllowed: false },
  ],
  triaged: [
    { to: "under_review", who: "staff", agentAllowed: true },
    { to: "rejected", who: "admin", agentAllowed: false },
  ],
  under_review: [
    { to: "action_proposed", who: "staff", agentAllowed: true },
    { to: "rejected", who: "admin", agentAllowed: false },
  ],
  action_proposed: [
    { to: "resolved", who: "admin", agentAllowed: false },
    { to: "under_review", who: "staff", agentAllowed: true },
    { to: "rejected", who: "admin", agentAllowed: false },
  ],
  resolved: [
    { to: "disputed", who: "owner_worker", agentAllowed: false },
    { to: "under_review", who: "admin", agentAllowed: false },
  ],
  rejected: [
    { to: "disputed", who: "owner_worker", agentAllowed: false },
    { to: "under_review", who: "admin", agentAllowed: false },
  ],
  disputed: [{ to: "under_review", who: "staff", agentAllowed: true }],
};

export const TERMINAL_NEEDS_NOTE: CaseStatus[] = ["resolved", "rejected", "disputed"];

export type TransitionCheck = { ok: true } | { ok: false; status: 403 | 409; reason: string };

export function checkTransition(
  from: CaseStatus,
  to: CaseStatus,
  actor: Actor,
  caseWorkerId: string,
): TransitionCheck {
  const edge = CASE_EDGES[from].find((e) => e.to === to);
  if (!edge) return { ok: false, status: 409, reason: `Transition ${from} → ${to} is not allowed` };
  if (actor.kind === "agent" && !edge.agentAllowed) {
    return { ok: false, status: 403, reason: "Agents may not make this transition; a human must" };
  }
  const allowed =
    edge.who === "staff" ? isStaff(actor)
    : edge.who === "admin" ? actor.role === "employer_admin"
    : actor.role === "worker" && actor.userId === caseWorkerId;
  return allowed ? { ok: true } : { ok: false, status: 403, reason: "Your role cannot make this transition" };
}
