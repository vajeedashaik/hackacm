// Pure view-model builders: merge baseline + scenario + live data into what the UI and Phaser render.
import { BASELINE_ANCHOR, SIM_INDUSTRIES, anchorPx, areaOf } from "./config.ts";
import { redactEvent } from "./privacy.ts";
import type { SimCharacter } from "./config.ts";
import type { Adapted } from "./adapter.ts";
import type { SimState } from "./engine.ts";
import type { Anchor, EventCategory, EventSource, SimEvent, SimStatus, Viewer } from "./types.ts";

export type StateSource = "scenario" | "live" | "baseline";

export interface DisplayChar {
  id: string; name: string; role: string; kind: SimCharacter["kind"]; color: string;
  appWorker: boolean;
  areaId: string; areaLabel: string;
  status: SimStatus; activity: string; anchor: Anchor; source: StateSource;
  x: number; y: number;
  hoursToday?: number;
  /** employer-only text; empty for everyone else */
  caseNotes: string[];
}

export function deriveCharacters(sim: SimState, live: Adapted, viewer: Viewer): DisplayChar[] {
  const ind = SIM_INDUSTRIES[sim.industry];
  const employer = viewer === "employer";
  return ind.characters.map((c) => {
    const s = sim.chars[c.id];
    const w = live.workers[c.id];
    const liveState = employer ? w?.full : w?.pub;
    const scenarioVisible = s.touched && (employer || !s.confidential);

    let status = c.baseline.status, activity = c.baseline.activity;
    let anchor: Anchor = BASELINE_ANCHOR[c.baseline.status];
    let source: StateSource = "baseline";
    if (scenarioVisible) {
      ({ status, activity, anchor } = s); source = "scenario";
    } else if (liveState) {
      ({ status, activity, anchor } = liveState); source = "live";
    }

    const caseNotes: string[] = [];
    if (employer) {
      if (s.touched && s.note) caseNotes.push(`DEMO: ${s.note}`);
      for (const k of w?.cases ?? []) caseNotes.push(`LIVE ${k.id}: ${k.text}`);
    }
    const p = anchorPx(ind, c.id, anchor);
    return {
      id: c.id, name: c.name, role: c.role, kind: c.kind, color: c.color, appWorker: c.appWorker,
      areaId: c.workArea, areaLabel: areaOf(ind, c.workArea)?.label ?? c.workArea,
      status, activity, anchor, source, x: p.x, y: p.y, hoursToday: w?.hoursToday, caseNotes,
    };
  });
}

export interface FeedFilter { sources: ReadonlySet<EventSource>; categories: ReadonlySet<EventCategory> }

/** Merge demo + live events, redact for the viewer, filter, newest first. */
export function buildFeed(synthetic: SimEvent[], live: SimEvent[], viewer: Viewer, f: FeedFilter): SimEvent[] {
  return [...synthetic, ...live]
    .filter((e) => f.sources.has(e.source) && f.categories.has(e.category))
    .map((e) => redactEvent(e, viewer))
    .sort((a, b) => b.ts - a.ts || b.seq - a.seq);
}
