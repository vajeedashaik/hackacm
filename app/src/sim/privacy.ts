// Display-level privacy rules. Confidential complaint/case events and character states are
// hidden unless the viewer has unlocked the employer view. NOTE: /api/state is still unauthenticated
// in this demo, so this is a UI rule, not a security boundary (see SIMULATION.md).
import type { SimEvent, Viewer } from "./types.ts";

export const REDACTED_TITLE = "Confidential case update";
export const REDACTED_DETAIL = "Details are restricted to the employer. Unlock the employer view to read them.";

export function redactEvent(e: SimEvent, viewer: Viewer): SimEvent {
  if (!e.confidential || viewer === "employer") return e;
  return { ...e, title: REDACTED_TITLE, detail: REDACTED_DETAIL, characterId: undefined };
}

export const canSeeConfidential = (v: Viewer) => v === "employer";
