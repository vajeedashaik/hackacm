"use client";

import { useCallback, useEffect, useReducer } from "react";
import { createSim, simReducer } from "./engine.ts";
import type { IndustryId, ScenarioId } from "./types.ts";

/** One scripted step per tick. */
export const TICK_MS = 1500;

/** React binding for the pure engine: owns the single interval and nothing else. */
export function useSimulation(industry: IndustryId) {
  const [sim, dispatch] = useReducer(simReducer, industry, (i) => createSim(i));

  // The global industry selector drives the simulation's industry (React-approved "adjust state during render").
  if (sim.industry !== industry) dispatch({ type: "set-industry", industry });

  useEffect(() => {
    if (sim.run !== "running") return;
    const id = setInterval(() => dispatch({ type: "tick", now: Date.now() }), TICK_MS);
    return () => clearInterval(id);
  }, [sim.run]);

  const start = useCallback(() => dispatch({ type: "start", now: Date.now() }), []);
  const pause = useCallback(() => dispatch({ type: "pause" }), []);
  const resume = useCallback(() => dispatch({ type: "resume" }), []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const setScenario = useCallback((scenarioId: ScenarioId) => dispatch({ type: "set-scenario", scenarioId }), []);

  return { sim, start, pause, resume, reset, setScenario };
}
