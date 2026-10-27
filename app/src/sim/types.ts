// Shared contract between the simulation, the Phaser renderer, the React UI and the backend adapter.
// Keep these event types stable: the AI-agent phase will produce events of the same shape (see SIMULATION.md).
import type { IndustryId } from "../lib/types";

export type { IndustryId };

export type SimStatus =
  | "working" | "break" | "offshift" | "overtime"
  | "safety" | "investigating" | "review" | "resolved";

export type ScenarioId = "wage-discrepancy" | "safety-hazard" | "excessive-hours" | "worker-grievance";

/** synthetic = scripted demo, app = real application store, agent = reserved for the AI-agent phase (unused). */
export type EventSource = "synthetic" | "app" | "agent";

export type SimEventType =
  | "system.scenario-started" | "system.scenario-completed"
  | "system.case-update" | "system.feedback-received" | "system.skill-update" | "system.payroll-confirmed"
  | "attendance.clock-in" | "attendance.clock-out"
  | "hours.overtime-concern" | "hours.fatigue-alert" | "hours.review-required" | "hours.roster-adjusted"
  | "wage.query-raised" | "wage.check-completed" | "wage.review-required"
  | "wage.case-filed" | "wage.case-resolved" | "wage.case-rejected"
  | "safety.hazard-reported" | "safety.incident" | "safety.inspection" | "safety.review-required" | "safety.area-cleared"
  | "grievance.received" | "grievance.investigation" | "grievance.review-required" | "grievance.closed";

export type EventCategory = "system" | "attendance" | "hours" | "wage" | "safety" | "grievance";
export type Severity = "info" | "warning" | "critical";

export interface SimEvent {
  id: string;
  source: EventSource;
  type: SimEventType;
  category: EventCategory;
  severity: Severity;
  industry: IndustryId;
  /** epoch ms when the event reached the UI (display ordering only; never used by the engine's logic) */
  ts: number;
  /** tie-break for events sharing a timestamp */
  seq: number;
  title: string;
  detail: string;
  characterId?: string;
  scenarioId?: ScenarioId;
  /** simulation tick for synthetic events */
  tick?: number;
  /** complaint/case related: hidden from anyone who has not unlocked the employer view */
  confidential: boolean;
}

export type Viewer = "public" | "employer";

/** Where a character stands. "home" = own workstation; "area:<id>" = centre of an area. */
export type Anchor = "home" | "admin" | "break" | "gate" | "hazard" | "meeting" | `area:${string}`;

export type RunState = "idle" | "running" | "paused" | "finished";

export const categoryOf = (t: SimEventType): EventCategory => t.split(".")[0] as EventCategory;
