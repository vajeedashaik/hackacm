import test from "node:test";
import assert from "node:assert/strict";
import { adaptSnapshot, RESOLVED_MARKER_MS } from "./adapter.ts";
import { buildFeed, deriveCharacters } from "./derive.ts";
import { createSim, simReducer } from "./engine.ts";
import { CATEGORIES } from "./status.ts";
import { REDACTED_TITLE } from "./privacy.ts";
import type { Case, Snapshot } from "../lib/types.ts";
import type { EventCategory, EventSource } from "./types.ts";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const hour = 3_600_000;
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  industry: "construction", employer: false, attendance: [], cases: [], audit: [], events: [], skills: [], payroll: [], feedback: [], now: NOW, ...over,
});
const clockIn = (hoursAgo: number, out?: number) => ({
  id: "a1", workerId: "c1", industry: "construction" as const, date: "2026-10-27", clockIn: NOW - hoursAgo * hour, clockOut: out, method: "self" as const,
});
const wageCase = (over: Partial<Case> = {}): Case => ({
  id: "FS-0001", type: "wage", industry: "construction", workerId: "c1", category: "overtime", priority: "high", status: "open",
  title: "Overtime not paid", description: "", date: "2026-10-27", attendanceIds: [], evidence: [], reopenCount: 0,
  wage: { hoursWorked: 10, amountPaid: 720, analysis: { regularHours: 8, overtimeHours: 2, expectedPay: 1080, shortfall: 360, overtimeUnpaid: true, summary: "Shortfall ₹360." } },
  createdAt: NOW - 1000, updatedAt: NOW - 1000, ...over,
});
const all = { sources: new Set<EventSource>(["synthetic", "app"]), categories: new Set<EventCategory>(CATEGORIES) };
const find = (cs: ReturnType<typeof deriveCharacters>, id: string) => cs.find((c) => c.id === id)!;

test("adapter: no snapshot means no live data", () => {
  assert.deepEqual(adaptSnapshot(null), { workers: {}, events: [] });
});

test("adapter: clock-in makes a worker Working; clock-out makes them Off shift", () => {
  const on = adaptSnapshot(snap({ attendance: [clockIn(2)] })).workers.c1;
  assert.equal(on.pub?.status, "working");
  const off = adaptSnapshot(snap({ attendance: [clockIn(3, NOW - hour)] })).workers.c1;
  assert.equal(off.pub?.status, "offshift");
  assert.equal(adaptSnapshot(snap()).workers.c1.pub, undefined, "no records means baseline stays");
});

test("adapter: hours past the overtime and safe limits raise an overtime concern", () => {
  assert.equal(adaptSnapshot(snap({ attendance: [clockIn(9)] })).workers.c1.pub?.status, "overtime");
  assert.equal(adaptSnapshot(snap({ attendance: [clockIn(11, NOW - 1)] })).workers.c1.pub?.status, "overtime");
});

test("adapter: case status drives the live map state (employer snapshots only)", () => {
  const w = (c: Case, employer = true) => adaptSnapshot(snap({ employer, attendance: [clockIn(2)], cases: [c] })).workers.c1;
  assert.equal(w(wageCase()).full?.status, "review");
  assert.equal(w(wageCase({ status: "in_review" })).full?.status, "investigating");
  assert.equal(w(wageCase({ type: "safety" })).full?.status, "safety");
  assert.equal(w(wageCase({ status: "resolved", resolvedAt: NOW - 1000 })).full?.status, "resolved");
  assert.equal(w(wageCase({ status: "resolved", resolvedAt: NOW - RESOLVED_MARKER_MS - 1 })).full?.status, "working");
  assert.equal(w(wageCase()).pub?.status, "working", "attendance-only state never reveals the case");
  const nonEmployer = w(wageCase(), false);
  assert.equal(nonEmployer.full?.status, "working", "cases in a non-employer snapshot are ignored");
  assert.deepEqual(nonEmployer.cases, []);
});

test("adapter: backend events become app-sourced SimEvents with a known type", () => {
  const { events } = adaptSnapshot(snap({ events: [
    { id: "e3", ts: NOW, industry: "construction", actor: "System", kind: "case-filed", message: "New wage report FS-0001 (priority high)" },
    { id: "e2", ts: NOW - 2, industry: "construction", actor: "System", kind: "payroll", message: "Payroll confirmed" },
    { id: "e1", ts: NOW - 5, industry: "construction", actor: "Murugan", kind: "clock-in", message: "Murugan clocked in", workerId: "c1" },
  ] }));
  assert.deepEqual(events.map((e) => e.type), ["wage.case-filed", "system.payroll-confirmed", "attendance.clock-in"]);
  assert.ok(events.every((e) => e.source === "app" && !e.confidential));
});

test("map: a live open case shows Human review for the employer only", () => {
  const live = adaptSnapshot(snap({ employer: true, attendance: [clockIn(2)], cases: [wageCase()] }));
  const sim = createSim("construction");
  const emp = find(deriveCharacters(sim, live, "employer"), "c1");
  const pub = find(deriveCharacters(sim, live, "public"), "c1");
  assert.equal(emp.status, "review");
  assert.equal(emp.source, "live");
  assert.ok(emp.caseNotes.some((n) => n.includes("FS-0001")));
  assert.equal(pub.status, "working");
  assert.deepEqual(pub.caseNotes, []);
});

test("map: scenario state overrides live data for touched characters, and reset restores it", () => {
  const live = adaptSnapshot(snap({ attendance: [clockIn(2)] }));
  let sim = simReducer(createSim("construction", "safety-hazard"), { type: "start", now: 0 });
  sim = simReducer(simReducer(sim, { type: "tick", now: 1 }), { type: "tick", now: 2 });
  const during = find(deriveCharacters(sim, live, "public"), "c3");
  assert.equal(during.status, "safety");
  assert.equal(during.source, "scenario");
  const after = find(deriveCharacters(simReducer(sim, { type: "reset" }), live, "public"), "c3");
  assert.equal(after.source, "baseline");
});

test("privacy: confidential scenario states and events are hidden from the public view", () => {
  let sim = simReducer(createSim("construction", "worker-grievance"), { type: "start", now: 0 });
  for (let i = 1; i <= 2; i++) sim = simReducer(sim, { type: "tick", now: i });
  const live = adaptSnapshot(null);
  const pubDevi = find(deriveCharacters(sim, live, "public"), "s2");
  assert.equal(pubDevi.source, "baseline");
  assert.deepEqual(pubDevi.caseNotes, []);
  assert.equal(find(deriveCharacters(sim, live, "employer"), "s2").status, "investigating");

  const pubFeed = buildFeed(sim.events, [], "public", all);
  const grievance = pubFeed.find((e) => e.category === "grievance")!;
  assert.equal(grievance.title, REDACTED_TITLE);
  assert.equal(grievance.characterId, undefined);
  const empFeed = buildFeed(sim.events, [], "employer", all);
  assert.notEqual(empFeed.find((e) => e.category === "grievance")!.title, REDACTED_TITLE);
});

test("feed: filters by source and category, newest first", () => {
  let sim = simReducer(createSim("college", "safety-hazard"), { type: "start", now: 100 });
  sim = simReducer(sim, { type: "tick", now: 200 });
  sim = simReducer(sim, { type: "tick", now: 300 });
  const live = adaptSnapshot(snap({ industry: "college", events: [
    { id: "e1", ts: 250, industry: "college", actor: "Rajesh", kind: "clock-in", message: "Rajesh clocked in", workerId: "f1" },
  ] }));
  const feed = buildFeed(sim.events, live.events, "public", all);
  assert.deepEqual(feed.map((e) => e.ts), [...feed.map((e) => e.ts)].sort((a, b) => b - a));
  const demoOnly = buildFeed(sim.events, live.events, "public", { ...all, sources: new Set<EventSource>(["synthetic"]) });
  assert.ok(demoOnly.every((e) => e.source === "synthetic"));
  const safetyOnly = buildFeed(sim.events, live.events, "public", { ...all, categories: new Set<EventCategory>(["safety"]) });
  assert.ok(safetyOnly.length > 0 && safetyOnly.every((e) => e.category === "safety"));
});
