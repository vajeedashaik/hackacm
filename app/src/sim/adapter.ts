// The ONLY place where backend data (the /api/state snapshot) enters the simulation view.
// It converts application records into (a) per-character state overlays and (b) SimEvents tagged source "app".
// The AI-agent phase plugs in here: see SIMULATION.md.
//
// Privacy: the server already filters the snapshot. Cases are only present for employer requests (or the
// caller's own worker), and the shared event feed never names a reporter. The adapter additionally ignores
// cases unless snap.employer is true, so a worker's own case can never colour the public map.
import { INDUSTRIES } from "../lib/industries.ts";
import { categoryOf } from "./types.ts";
import type { Case, FairEvent, Snapshot } from "../lib/types.ts";
import type { Anchor, SimEvent, SimEventType, SimStatus } from "./types.ts";

/** How long a closed case keeps showing the "Resolved case" marker on the map. */
export const RESOLVED_MARKER_MS = 5 * 60_000;

export interface LiveState { status: SimStatus; anchor: Anchor; activity: string; confidential: boolean }
export interface LiveCaseSummary { id: string; status: Case["status"]; text: string }
export interface LiveWorker {
  hoursToday: number;
  /** state including case info (employer snapshots only) */
  full?: LiveState;
  /** state derived from attendance only (safe for everyone) */
  pub?: LiveState;
  cases: LiveCaseSummary[];
}
export interface Adapted { workers: Record<string, LiveWorker>; events: SimEvent[] }

const KIND_TO_TYPE: Record<FairEvent["kind"], SimEventType> = {
  "clock-in": "attendance.clock-in",
  "clock-out": "attendance.clock-out",
  "case-filed": "wage.case-filed",
  "case-update": "system.case-update",
  "case-resolved": "wage.case-resolved",
  "case-rejected": "wage.case-rejected",
  "fatigue-alert": "hours.fatigue-alert",
  feedback: "system.feedback-received",
  skill: "system.skill-update",
  payroll: "system.payroll-confirmed",
};

export const todayOf = (now: number) => new Date(now).toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

export function adaptEvent(e: FairEvent): SimEvent {
  const type = KIND_TO_TYPE[e.kind];
  return {
    id: `app:${e.id}`, source: "app", type, category: categoryOf(type), industry: e.industry, ts: e.ts, seq: 0,
    severity: e.kind === "fatigue-alert" || e.kind === "case-filed" ? "warning" : "info",
    title: e.message, detail: `Recorded by the application (${e.actor}).`,
    characterId: e.workerId,
    // the shared feed is anonymous by design (it never names a case reporter)
    confidential: false,
  };
}

const caseText = (c: Case) =>
  `${c.title} (${c.type}, ${c.status.replace("_", " ")}, priority ${c.priority})` +
  (c.wage ? `. ${c.wage.analysis.summary}` : "");

/** Live state implied by a worker's cases. Safety outranks review outranks investigation outranks resolved. */
function caseState(cases: Case[], now: number): LiveState | undefined {
  const active = cases.filter((c) => c.status === "open" || c.status === "in_review");
  if (active.some((c) => c.type === "safety" && c.status === "open")) {
    return { status: "safety", anchor: "hazard", activity: "Safety report awaiting review", confidential: true };
  }
  if (active.some((c) => c.status === "open")) {
    return { status: "review", anchor: "admin", activity: "Case awaiting the employer's decision", confidential: true };
  }
  if (active.length) {
    return { status: "investigating", anchor: "admin", activity: "Case under review", confidential: true };
  }
  const recent = cases.find((c) => (c.resolvedAt ?? 0) >= now - RESOLVED_MARKER_MS);
  if (recent) return { status: "resolved", anchor: "home", activity: `Case ${recent.status}`, confidential: true };
  return undefined;
}

export function adaptSnapshot(snap: Snapshot | null): Adapted {
  if (!snap) return { workers: {}, events: [] };
  const cfg = INDUSTRIES[snap.industry];
  const day = todayOf(snap.now);
  const workers: Record<string, LiveWorker> = {};

  for (const w of cfg.workers) {
    const recs = snap.attendance.filter((a) => a.workerId === w.id && a.date === day);
    const hours = round2(recs.reduce((s, a) => s + ((a.clockOut ?? snap.now) - a.clockIn) / 3_600_000, 0));
    const open = recs.some((a) => !a.clockOut);
    const cases = snap.employer ? snap.cases.filter((c) => c.workerId === w.id) : [];

    let pub: LiveState | undefined;
    if (recs.length) {
      if (hours > cfg.maxSafeHours) {
        pub = { status: "overtime", anchor: "home", activity: `Past the ${cfg.maxSafeHours} h safe limit (${hours} h today)`, confidential: false };
      } else if (open && hours > cfg.overtimeAfter) {
        pub = { status: "overtime", anchor: "home", activity: `Past the ${cfg.overtimeAfter} h overtime threshold (${hours} h today)`, confidential: false };
      } else if (open) {
        pub = { status: "working", anchor: "home", activity: `Clocked in (${hours} h today)`, confidential: false };
      } else {
        pub = { status: "offshift", anchor: "gate", activity: `Clocked out (${hours} h today)`, confidential: false };
      }
    }

    workers[w.id] = {
      hoursToday: hours, pub, full: caseState(cases, snap.now) ?? pub,
      cases: cases.map((c) => ({ id: c.id, status: c.status, text: caseText(c) })),
    };
  }
  return { workers, events: snap.events.map(adaptEvent) };
}
