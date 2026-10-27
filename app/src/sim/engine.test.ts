import test from "node:test";
import assert from "node:assert/strict";
import { createSim, scenarioOf, simReducer, type SimAction, type SimState } from "./engine.ts";
import { SCENARIO_IDS, SIM_INDUSTRIES } from "./config.ts";
import { STATUS_META } from "./status.ts";

const run = (s: SimState, actions: SimAction[]) => actions.reduce(simReducer, s);
const ticks = (n: number, t0 = 1000): SimAction[] => Array.from({ length: n }, (_, i) => ({ type: "tick", now: t0 + i }));
const shape = (s: SimState) => ({ ...s, events: s.events.map((e) => ({ ...e, ts: 0 })) });

test("a new simulation is idle at the baseline with no events", () => {
  const s = createSim("construction");
  assert.equal(s.run, "idle");
  assert.equal(s.tick, 0);
  assert.equal(s.events.length, 0);
  assert.ok(Object.values(s.chars).every((c) => !c.touched));
});

test("illegal transitions are no-ops that return the same state object", () => {
  const idle = createSim("college");
  assert.equal(simReducer(idle, { type: "pause" }), idle);
  assert.equal(simReducer(idle, { type: "resume" }), idle);
  assert.equal(simReducer(idle, { type: "tick", now: 1 }), idle);
  const running = simReducer(idle, { type: "start", now: 1 });
  assert.equal(simReducer(running, { type: "start", now: 2 }), running);
  assert.equal(simReducer(running, { type: "resume" }), running);
});

test("start, pause, resume and reset move through the expected run states", () => {
  let s = simReducer(createSim("construction"), { type: "start", now: 1 });
  assert.equal(s.run, "running");
  assert.equal(s.events[0].type, "system.scenario-started");
  s = run(s, ticks(2));
  assert.equal(s.tick, 2);
  s = simReducer(s, { type: "pause" });
  assert.equal(s.run, "paused");
  assert.equal(simReducer(s, { type: "tick", now: 5 }), s, "paused simulation must not advance");
  s = simReducer(s, { type: "resume" });
  assert.equal(s.run, "running");
  s = simReducer(s, { type: "reset" });
  assert.equal(s.run, "idle");
  assert.equal(s.tick, 0);
  assert.equal(s.events.length, 0);
});

test("every scenario in every industry plays to completion and ends with a completion event", () => {
  for (const industry of ["construction", "college"] as const) {
    for (const id of SCENARIO_IDS) {
      const sc = SIM_INDUSTRIES[industry].scenarios[id];
      let s = run(createSim(industry, id), [{ type: "start", now: 0 }, ...ticks(sc.duration)]);
      assert.equal(s.run, "finished", `${industry}/${id}`);
      assert.equal(s.events.at(-1)?.type, "system.scenario-completed");
      assert.equal(s.events.length, sc.steps.length);
      s = simReducer(s, { type: "tick", now: 99 });
      assert.equal(s.events.length, sc.steps.length, "finished simulation must not emit more events");
    }
  }
});

test("playback is deterministic: same actions give the same state", () => {
  const actions: SimAction[] = [{ type: "start", now: 5 }, ...ticks(8, 6)];
  const a = run(createSim("construction", "safety-hazard"), actions);
  const b = run(createSim("construction", "safety-hazard"), actions);
  assert.deepEqual(shape(a), shape(b));
});

test("restarting after finish replays from scratch with new unique event ids", () => {
  const first = run(createSim("college", "excessive-hours"), [{ type: "start", now: 0 }, ...ticks(12)]);
  const second = run(first, [{ type: "start", now: 100 }]);
  assert.equal(second.run, "running");
  assert.equal(second.tick, 0);
  assert.equal(second.events.length, 1);
  assert.ok(!first.events.some((e) => e.id === second.events[0].id));
});

test("reset clears scenario state and restores the baseline", () => {
  const mid = run(createSim("construction", "safety-hazard"), [{ type: "start", now: 0 }, ...ticks(5)]);
  assert.ok(Object.values(mid.chars).some((c) => c.touched));
  const reset = simReducer(mid, { type: "reset" });
  assert.deepEqual(reset.chars, createSim("construction").chars);
  assert.equal(reset.scenarioId, "safety-hazard");
});

test("changing scenario or industry returns to a clean idle state", () => {
  const mid = run(createSim("construction"), [{ type: "start", now: 0 }, ...ticks(3)]);
  const sc = simReducer(mid, { type: "set-scenario", scenarioId: "worker-grievance" });
  assert.equal(sc.run, "idle");
  assert.equal(sc.scenarioId, "worker-grievance");
  const ind = simReducer(mid, { type: "set-industry", industry: "college" });
  assert.equal(ind.industry, "college");
  assert.equal(ind.run, "idle");
  assert.ok("f1" in ind.chars && !("c1" in ind.chars));
});

test("scenario steps reference real characters and valid statuses", () => {
  for (const industry of ["construction", "college"] as const) {
    const ids = new Set(SIM_INDUSTRIES[industry].characters.map((c) => c.id));
    for (const id of SCENARIO_IDS) {
      for (const step of scenarioOf({ industry, scenarioId: id }).steps) {
        if (step.actor) assert.ok(ids.has(step.actor), `${industry}/${id} actor ${step.actor}`);
        for (const c of step.set ?? []) {
          assert.ok(ids.has(c.id));
          if (c.status) assert.ok(c.status in STATUS_META);
        }
      }
    }
  }
});

test("the grievance scenario never links an event to a worker complainant", () => {
  for (const industry of ["construction", "college"] as const) {
    const ind = SIM_INDUSTRIES[industry];
    for (const step of ind.scenarios["worker-grievance"].steps) {
      const touched = [step.actor, ...(step.set ?? []).map((c) => c.id)].filter(Boolean) as string[];
      for (const id of touched) assert.notEqual(ind.characters.find((c) => c.id === id)?.kind, "worker");
      if (step.type.startsWith("grievance.")) assert.equal(step.confidential, true);
    }
  }
});
