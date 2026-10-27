import type { IndustryId } from "../types";

// Configurable persona data. Simulated employees do not each run an LLM: the simulation and the
// agents read these small profiles instead. Add or edit entries here; no code changes needed.

export interface WorkerPersona {
  /** how the Worker Persona Agent phrases things for this workforce */
  tone: string;
  languages: ("en" | "ta")[];
}

export interface SupervisorPersona {
  title: string;
  /**
   * The only operational responses the Supervisor Persona Agent may propose. Anything outside this
   * list is rejected by the backend, whatever the model says.
   */
  policy: Record<"daily" | "weekly" | "rest" | "streak", string>;
}

export const WORKER_PERSONA: Record<IndustryId, WorkerPersona> = {
  construction: { tone: "short, plain sentences; avoid legal terms; assume the reader is on a phone on site", languages: ["en", "ta"] },
  college: { tone: "short, polite, plain sentences; avoid legal terms", languages: ["en", "ta"] },
};

export const SUPERVISOR_PERSONA: Record<IndustryId, SupervisorPersona> = {
  construction: {
    title: "Site supervisor",
    policy: {
      daily: "Release the worker from further duty today and review tomorrow's roster.",
      weekly: "Cap next week's hours for this worker and redistribute tasks.",
      rest: "Delay the next start time so the minimum rest period is met.",
      streak: "Schedule a rest day for this worker before the next shift.",
    },
  },
  college: {
    title: "Facilities manager",
    policy: {
      daily: "Release the staff member from further duty today and review tomorrow's roster.",
      weekly: "Cap next week's hours for this staff member and share tasks with the team.",
      rest: "Move the next shift later so the minimum rest period is met.",
      streak: "Schedule a rest day for this staff member before the next shift.",
    },
  },
};
