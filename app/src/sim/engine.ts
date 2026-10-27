// Pure, deterministic simulation state machine. No timers, no React, no Phaser, no network:
// the UI feeds it actions ("tick" once per interval) and renders the resulting state.
// The same actions always produce the same states and events (timestamps aside).
import { BASELINE_ANCHOR, SIM_INDUSTRIES } from "./config.ts";
import { categoryOf } from "./types.ts";
import type { Anchor, IndustryId, RunState, ScenarioId, SimEvent, SimStatus } from "./types.ts";

export interface CharSim {
  status: SimStatus;
  anchor: Anchor;
  activity: string;
  note?: string;
  /** true once a scenario step has changed this character since the last reset */
  touched: boolean;
  /** the change belongs to a confidential case; hidden from non-employer viewers */
  confidential: boolean;
}

export interface SimState {
  industry: IndustryId;
  scenarioId: ScenarioId;
  run: RunState;
  tick: number;
  /** increments on every start so event ids stay unique across replays */
  runSeq: number;
  chars: Record<string, CharSim>;
  /** synthetic events only, oldest first */
  events: SimEvent[];
}

export type SimAction =
  | { type: "start"; now: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "reset" }
  | { type: "tick"; now: number }
  | { type: "set-scenario"; scenarioId: ScenarioId }
  | { type: "set-industry"; industry: IndustryId };

export function baselineChars(industry: IndustryId): Record<string, CharSim> {
  return Object.fromEntries(
    SIM_INDUSTRIES[industry].characters.map((c) => [
      c.id,
      { status: c.baseline.status, anchor: BASELINE_ANCHOR[c.baseline.status], activity: c.baseline.activity, touched: false, confidential: false },
    ]),
  );
}

export function createSim(industry: IndustryId, scenarioId: ScenarioId = "wage-discrepancy"): SimState {
  return { industry, scenarioId, run: "idle", tick: 0, runSeq: 0, chars: baselineChars(industry), events: [] };
}

export const scenarioOf = (s: Pick<SimState, "industry" | "scenarioId">) =>
  SIM_INDUSTRIES[s.industry].scenarios[s.scenarioId];

function applyTick(s: SimState, tick: number, now: number): SimState {
  const sc = scenarioOf(s);
  const chars = { ...s.chars };
  const events = [...s.events];
  sc.steps.forEach((step, i) => {
    if (step.at !== tick) return;
    events.push({
      id: `syn:${s.industry}:${s.scenarioId}:${s.runSeq}:${i}`,
      source: "synthetic", type: step.type, category: categoryOf(step.type), severity: step.severity,
      industry: s.industry, ts: now, seq: tick * 100 + i,
      title: step.title, detail: step.detail, characterId: step.actor,
      scenarioId: s.scenarioId, tick, confidential: !!step.confidential,
    });
    for (const c of step.set ?? []) {
      const prev = chars[c.id];
      if (!prev) continue;
      const status = c.status ?? prev.status;
      chars[c.id] = {
        status,
        anchor: c.anchor ?? (c.status ? BASELINE_ANCHOR[status] : prev.anchor),
        activity: c.activity ?? prev.activity,
        note: c.note ?? prev.note,
        touched: true,
        confidential: !!step.confidential,
      };
    }
  });
  return { ...s, tick, chars, events, run: tick >= sc.duration ? "finished" : s.run };
}

/** Invalid transitions return the same state object, so callers can detect no-ops by identity. */
export function simReducer(s: SimState, a: SimAction): SimState {
  switch (a.type) {
    case "start": {
      if (s.run !== "idle" && s.run !== "finished") return s;
      const fresh = createSim(s.industry, s.scenarioId);
      return applyTick({ ...fresh, run: "running", runSeq: s.runSeq + 1 }, 0, a.now);
    }
    case "pause":
      return s.run === "running" ? { ...s, run: "paused" } : s;
    case "resume":
      return s.run === "paused" ? { ...s, run: "running" } : s;
    case "reset":
      return { ...createSim(s.industry, s.scenarioId), runSeq: s.runSeq };
    case "tick":
      return s.run === "running" ? applyTick(s, s.tick + 1, a.now) : s;
    case "set-scenario":
      return a.scenarioId === s.scenarioId && s.run === "idle"
        ? s
        : { ...createSim(s.industry, a.scenarioId), runSeq: s.runSeq };
    case "set-industry":
      return a.industry === s.industry ? s : { ...createSim(a.industry, s.scenarioId), runSeq: s.runSeq };
  }
}
