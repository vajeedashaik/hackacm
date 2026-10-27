// Data-driven simulation setup: map layout, characters and scripted scenarios per industry.
// Adding an industry = adding one entry here (plus its entry in lib/industries.ts).
import { INDUSTRIES } from "../lib/industries.ts";
import type { Anchor, IndustryId, ScenarioId, Severity, SimEventType, SimStatus } from "./types.ts";

export const TILE = 20;
export const COLS = 40;
export const ROWS = 26;
export const MAP_W = COLS * TILE;
export const MAP_H = ROWS * TILE;

export type AreaKind = "work" | "safety" | "break" | "admin" | "gate";

export interface Equipment { kind: string; label: string; dx: number; dy: number; w?: number; h?: number }
export interface Area {
  id: string; label: string; kind: AreaKind;
  col: 0 | 1 | 2; row: 0 | 1 | 2;
  color: number;
  equipment: Equipment[];
}
export interface PlaceRef { area: string; dx: number; dy: number }

export interface SimCharacter {
  id: string; name: string; role: string;
  kind: "worker" | "supervisor" | "admin";
  /** true when the id matches a worker record in the application store */
  appWorker: boolean;
  workArea: string;
  home: PlaceRef;
  color: string;
  baseline: { status: SimStatus; activity: string };
}

export interface CharSet { id: string; status?: SimStatus; anchor?: Anchor; activity?: string; note?: string }
export interface Step {
  at: number; type: SimEventType; severity: Severity; title: string; detail: string;
  actor?: string; set?: CharSet[]; confidential?: boolean;
}
export interface Scenario { id: ScenarioId; title: string; description: string; duration: number; steps: Step[] }

export interface SimIndustry {
  id: IndustryId;
  areas: Area[];
  places: Record<"admin" | "break" | "gate" | "hazard" | "meeting", PlaceRef>;
  characters: SimCharacter[];
  scenarios: Record<ScenarioId, Scenario>;
  ground: [number, number];
}

export const SCENARIO_IDS: ScenarioId[] = ["wage-discrepancy", "safety-hazard", "excessive-hours", "worker-grievance"];

// 3x3 grid of areas shared by every industry.
const COL_X = [1, 14, 26], COL_W = [12, 11, 13];
const ROW_Y = [1, 10, 17], ROW_H = [8, 6, 8];
export const areaRect = (a: Area) => ({
  x: COL_X[a.col] * TILE, y: ROW_Y[a.row] * TILE, w: COL_W[a.col] * TILE, h: ROW_H[a.row] * TILE,
});

export const BASELINE_ANCHOR: Record<SimStatus, Anchor> = {
  working: "home", break: "break", offshift: "gate", overtime: "home",
  safety: "hazard", investigating: "home", review: "admin", resolved: "home",
};

const st = (
  at: number, type: SimEventType, severity: Severity, title: string, detail: string,
  extra: { actor?: string; set?: CharSet[]; confidential?: boolean } = {},
): Step => ({ at, type, severity, title, detail, ...extra });

const DEMO = "Scripted demo event (deterministic simulation, no AI).";
const start = (name: string): Step =>
  st(0, "system.scenario-started", "info", `Scenario started: ${name}`, `${DEMO} Real application records are not changed.`);
const done = (at: number, name: string): Step =>
  st(at, "system.scenario-completed", "info", `Scenario complete: ${name}`, "Press Reset to return to the baseline, or Start to replay.");

function charsFor(id: IndustryId): SimCharacter[] {
  const w = Object.fromEntries(INDUSTRIES[id].workers.map((x) => [x.id, x]));
  const mk = (
    wid: string, workArea: string, dx: number, dy: number,
    status: SimStatus, activity: string,
  ): SimCharacter => ({
    id: wid, name: w[wid].name, role: w[wid].role, kind: "worker", appWorker: true,
    workArea, home: { area: workArea, dx, dy }, color: w[wid].color, baseline: { status, activity },
  });
  if (id === "construction") {
    return [
      mk("c1", "scaffold", 6, 5, "working", "Laying brickwork on level 2"),
      mk("c2", "mixing", 5, 5, "working", "Mixing mortar"),
      mk("c3", "store", 9, 5, "break", "Tea break"),
      mk("c4", "rebar", 6, 5, "offshift", "Shift starts later"),
      { id: "s1", name: "Ravi", role: "Site supervisor", kind: "supervisor", appWorker: false, workArea: "scaffold",
        home: { area: "scaffold", dx: 9, dy: 5 }, color: "#f97316", baseline: { status: "working", activity: "Walking the site" } },
      { id: "s2", name: "Devi", role: "Site administrator", kind: "admin", appWorker: false, workArea: "office",
        home: { area: "office", dx: 5, dy: 5 }, color: "#3b82f6", baseline: { status: "working", activity: "Updating the daily register" } },
    ];
  }
  return [
    mk("f1", "workshop", 5, 5, "working", "Repairing a hostel pipeline"),
    mk("f2", "hostel", 6, 5, "working", "Cleaning hostel corridors"),
    mk("f3", "lab", 5, 5, "break", "Tea break"),
    mk("f4", "canteen", 3, 4, "offshift", "Shift starts later"),
    { id: "g1", name: "Suresh", role: "Facilities supervisor", kind: "supervisor", appWorker: false, workArea: "workshop",
      home: { area: "workshop", dx: 9, dy: 5 }, color: "#f97316", baseline: { status: "working", activity: "Checking work orders" } },
    { id: "g2", name: "Kavitha", role: "Facilities administrator", kind: "admin", appWorker: false, workArea: "office",
      home: { area: "office", dx: 5, dy: 5 }, color: "#3b82f6", baseline: { status: "working", activity: "Updating the duty roster" } },
  ];
}

const construction: SimIndustry = {
  id: "construction",
  ground: [0xbfae8f, 0xb8a685],
  areas: [
    { id: "scaffold", label: "Scaffolding bay", kind: "work", col: 0, row: 0, color: 0xd9c49a, equipment: [
      { kind: "scaffold", label: "Scaffold", dx: 1, dy: 1, w: 3 }, { kind: "toolbox", label: "Toolbox", dx: 8, dy: 1 },
      { kind: "scaffold", label: "Scaffold", dx: 9, dy: 2, w: 2 } ] },
    { id: "mixing", label: "Mixing yard", kind: "work", col: 1, row: 0, color: 0xc4ccd2, equipment: [
      { kind: "mixer", label: "Cement mixer", dx: 1, dy: 1 }, { kind: "mixer", label: "Cement mixer", dx: 3, dy: 1 },
      { kind: "sand", label: "Sand pile", dx: 7, dy: 1, w: 2 } ] },
    { id: "rebar", label: "Rebar yard", kind: "work", col: 2, row: 0, color: 0xd6bf9a, equipment: [
      { kind: "rebar", label: "Rebar rack", dx: 1, dy: 1, w: 4 }, { kind: "rebar", label: "Rebar rack", dx: 8, dy: 1, w: 3 } ] },
    { id: "excavation", label: "Excavation edge", kind: "safety", col: 0, row: 1, color: 0xe7d9a8, equipment: [
      { kind: "barrier", label: "Safety barrier", dx: 1, dy: 1, w: 10 }, { kind: "pit", label: "Open excavation", dx: 3, dy: 2, w: 6, h: 3 } ] },
    { id: "crane", label: "Crane swing zone", kind: "safety", col: 1, row: 1, color: 0xe7d9a8, equipment: [
      { kind: "barrier", label: "Safety barrier", dx: 1, dy: 1, w: 9 }, { kind: "crane", label: "Tower crane", dx: 5, dy: 2 },
      { kind: "crates", label: "Suspended load", dx: 8, dy: 3 } ] },
    { id: "break", label: "Break shelter", kind: "break", col: 2, row: 1, color: 0xbfe0c3, equipment: [
      { kind: "bench", label: "Bench", dx: 2, dy: 2, w: 2 }, { kind: "bench", label: "Bench", dx: 8, dy: 2, w: 2 },
      { kind: "water", label: "Drinking water", dx: 11, dy: 1 } ] },
    { id: "store", label: "Material store & electrics", kind: "work", col: 0, row: 2, color: 0xd2b48c, equipment: [
      { kind: "crates", label: "Material crates", dx: 1, dy: 1, w: 3, h: 2 }, { kind: "panel", label: "Electrical panel", dx: 9, dy: 1, w: 2 } ] },
    { id: "office", label: "Site office · reporting desk", kind: "admin", col: 1, row: 2, color: 0xb9d3ee, equipment: [
      { kind: "desk", label: "Desk", dx: 2, dy: 2 }, { kind: "computer", label: "Computer", dx: 2, dy: 2 },
      { kind: "desk", label: "Desk", dx: 6, dy: 2 }, { kind: "computer", label: "Computer", dx: 6, dy: 2 } ] },
    { id: "gate", label: "Site gate", kind: "gate", col: 2, row: 2, color: 0xcfcfcf, equipment: [
      { kind: "gate", label: "Gate post", dx: 1, dy: 3 }, { kind: "gate", label: "Gate post", dx: 11, dy: 3 } ] },
  ],
  places: {
    admin: { area: "office", dx: 3, dy: 4 }, break: { area: "break", dx: 5, dy: 3 }, gate: { area: "gate", dx: 6, dy: 5 },
    hazard: { area: "crane", dx: 5, dy: 4 }, meeting: { area: "office", dx: 8, dy: 5 },
  },
  characters: charsFor("construction"),
  scenarios: {
    "wage-discrepancy": { id: "wage-discrepancy", title: "Wage discrepancy", duration: 12,
      description: "A mason works a 10-hour day but is paid only regular wages. The query goes to the site office and waits for a human decision.",
      steps: [
        start("Wage discrepancy"),
        st(2, "hours.overtime-concern", "warning", "Murugan passes the 8 h overtime threshold", "Overtime pay (2x) applies after 8 hours.",
          { actor: "c1", set: [{ id: "c1", status: "overtime", activity: "Still working at hour 9" }] }),
        st(4, "wage.query-raised", "warning", "Wage query raised at the site office", "Illustrative case: 10 h worked, ₹720 paid. Reported by the worker.",
          { actor: "c1", confidential: true, set: [{ id: "c1", status: "overtime", anchor: "admin", activity: "Raising a wage query", note: "Demo wage query: 10 h worked, ₹720 paid (illustrative)." }] }),
        st(6, "wage.check-completed", "info", "Rule-based check: ₹360 shortfall", "Expected ₹1,080 (8 h × ₹90 + 2 h × ₹180) against ₹720 paid. Calculated by fixed rules, not AI.",
          { actor: "s2", confidential: true, set: [{ id: "s2", status: "investigating", anchor: "admin", activity: "Comparing attendance with pay" }] }),
        st(8, "wage.review-required", "warning", "Human review required: employer decision pending", "Nothing is paid back until the employer approves.",
          { actor: "c1", confidential: true, set: [{ id: "c1", status: "review", anchor: "admin", activity: "Waiting for the employer's decision" }, { id: "s1", status: "review", anchor: "admin", activity: "Reviewing the wage query" }] }),
        st(10, "wage.case-resolved", "info", "Back-pay of ₹360 approved (demo)", "The employer approved the claim and the case is closed.",
          { actor: "c1", confidential: true, set: [{ id: "c1", status: "resolved", anchor: "home", activity: "Case resolved, back to work" }, { id: "s1", status: "working", anchor: "home", activity: "Walking the site" }, { id: "s2", status: "working", anchor: "home", activity: "Updating the daily register" }] }),
        done(12, "Wage discrepancy"),
      ] },
    "safety-hazard": { id: "safety-hazard", title: "Safety hazard (crane zone)", duration: 12,
      description: "An electrician spots a damaged cable under the crane swing zone. A near-miss follows, the supervisor inspects and the area is cleared after sign-off.",
      steps: [
        start("Safety hazard"),
        st(2, "safety.hazard-reported", "warning", "Damaged cable spotted in the crane swing zone", "Karthik reports a frayed power cable under the crane path.",
          { actor: "c3", set: [{ id: "c3", status: "safety", anchor: "hazard", activity: "Reporting a frayed cable" }] }),
        st(4, "safety.incident", "critical", "Near-miss: suspended load swung into the walkway", "No injuries. The zone is cordoned off and work stops.",
          { actor: "c2", set: [{ id: "c2", status: "safety", anchor: "hazard", activity: "Near-miss, shaken but unhurt" }] }),
        st(6, "safety.inspection", "info", "Supervisor inspecting the zone", "Ravi checks the cable, crane limits and barriers.",
          { actor: "s1", set: [{ id: "s1", status: "investigating", anchor: "hazard", activity: "Inspecting the crane zone" }] }),
        st(8, "safety.review-required", "warning", "Human review required: incident report awaiting sign-off", "The site administrator needs a person to approve before the zone reopens.",
          { actor: "s2", set: [{ id: "s2", status: "review", anchor: "admin", activity: "Incident report awaiting sign-off" }] }),
        st(10, "safety.area-cleared", "info", "Crane zone cleared and reopened", "Cable replaced and barriers reset. Incident logged as resolved.",
          { actor: "c3", set: [{ id: "c3", status: "resolved", anchor: "home", activity: "Hazard fixed" }, { id: "c2", status: "working", anchor: "home", activity: "Back to mixing mortar" }, { id: "s1", status: "working", anchor: "home", activity: "Walking the site" }, { id: "s2", status: "working", anchor: "home", activity: "Updating the daily register" }] }),
        done(12, "Safety hazard"),
      ] },
    "excessive-hours": { id: "excessive-hours", title: "Excessive working hours", duration: 12,
      description: "A helper keeps working past the 10 h safe limit. A fatigue alert goes to the supervisor, who needs to approve a rest break and a roster change.",
      steps: [
        start("Excessive working hours"),
        st(2, "hours.overtime-concern", "warning", "Selvi has logged 9.5 h today", "Overtime pay applies after 8 h; the safe limit on this site is 10 h.",
          { actor: "c2", set: [{ id: "c2", status: "overtime", activity: "Hour 9.5 of the shift" }] }),
        st(4, "hours.overtime-concern", "warning", "Selvi is approaching the 10 h safe limit", "A supervisor should plan a rest break.",
          { actor: "c2", set: [{ id: "c2", status: "overtime", activity: "Hour 10, tired" }] }),
        st(6, "hours.fatigue-alert", "critical", "Fatigue alert: 10.5 h worked (safe limit 10 h)", "The supervisor has been notified.",
          { actor: "c2", set: [{ id: "c2", status: "overtime", activity: "Fatigue alert raised" }] }),
        st(8, "hours.review-required", "warning", "Human review required: rest break and roster change", "A person must approve the schedule change.",
          { actor: "s1", set: [{ id: "s1", status: "review", anchor: "area:mixing", activity: "Deciding on a rest break" }, { id: "c2", status: "break", anchor: "break", activity: "Mandatory rest break" }] }),
        st(10, "hours.roster-adjusted", "info", "Roster adjusted: Selvi sent home to rest", "Tomorrow's shift starts later. Hours are recorded for payroll.",
          { actor: "s1", set: [{ id: "c2", status: "offshift", anchor: "gate", activity: "Off shift, rest day adjusted" }, { id: "s1", status: "working", anchor: "home", activity: "Walking the site" }] }),
        done(12, "Excessive working hours"),
      ] },
    "worker-grievance": { id: "worker-grievance", title: "Worker grievance (confidential)", duration: 12,
      description: "An anonymous grievance is logged. The complainant is never stored or shown on the map; only the handling steps are visible, and only to the employer.",
      steps: [
        start("Worker grievance"),
        st(2, "grievance.received", "warning", "Anonymous grievance received", "Category: workplace conduct. The complainant's identity is not recorded.",
          { actor: "s2", confidential: true, set: [{ id: "s2", status: "investigating", anchor: "admin", activity: "Logging a confidential grievance", note: "Anonymous grievance: complainant not recorded." }] }),
        st(4, "grievance.investigation", "info", "Confidential fact-finding started", "Interviews are held privately, away from the work areas.",
          { actor: "s2", confidential: true, set: [{ id: "s2", status: "investigating", anchor: "meeting", activity: "Confidential fact-finding" }] }),
        st(6, "grievance.investigation", "info", "Site records and roster reviewed", "No complainant details are used in this step.",
          { actor: "s2", confidential: true, set: [{ id: "s2", status: "investigating", anchor: "admin", activity: "Reviewing records" }] }),
        st(8, "grievance.review-required", "warning", "Human review required: outcome recommendation", "The employer must decide on corrective action.",
          { actor: "s2", confidential: true, set: [{ id: "s2", status: "review", anchor: "admin", activity: "Recommendation awaiting the employer" }] }),
        st(10, "grievance.closed", "info", "Grievance closed with corrective action (demo)", "A toolbox talk on site conduct was scheduled.",
          { actor: "s2", confidential: true, set: [{ id: "s2", status: "resolved", anchor: "home", activity: "Grievance closed" }] }),
        done(12, "Worker grievance"),
      ] },
  },
};

const college: SimIndustry = {
  id: "college",
  ground: [0xa3bf8f, 0x9bb787],
  areas: [
    { id: "hostel", label: "Hostel block", kind: "work", col: 0, row: 0, color: 0xe6cdd6, equipment: [
      { kind: "bunk", label: "Hostel beds", dx: 1, dy: 1, w: 3 }, { kind: "bunk", label: "Hostel beds", dx: 8, dy: 1, w: 3 },
      { kind: "trolley", label: "Cleaning trolley", dx: 5, dy: 3 } ] },
    { id: "lab", label: "Lab building", kind: "work", col: 1, row: 0, color: 0xc2d8bb, equipment: [
      { kind: "labbench", label: "Lab bench", dx: 1, dy: 1, w: 3 }, { kind: "labbench", label: "Lab bench", dx: 6, dy: 1, w: 3 } ] },
    { id: "canteen", label: "Canteen", kind: "work", col: 2, row: 0, color: 0xf0dcae, equipment: [
      { kind: "counter", label: "Serving counter", dx: 1, dy: 1, w: 4 }, { kind: "table", label: "Dining table", dx: 7, dy: 3, w: 2 },
      { kind: "table", label: "Dining table", dx: 10, dy: 3, w: 2 }, { kind: "table", label: "Dining table", dx: 7, dy: 5, w: 2 } ] },
    { id: "pump", label: "Pump room · wet floor", kind: "safety", col: 0, row: 1, color: 0xcfe3f3, equipment: [
      { kind: "tank", label: "Water tank", dx: 1, dy: 1, w: 2 }, { kind: "pump", label: "Water pump", dx: 5, dy: 2, w: 2 },
      { kind: "barrier", label: "Wet-floor barrier", dx: 8, dy: 1, w: 3 } ] },
    { id: "hv", label: "High-voltage panel room", kind: "safety", col: 1, row: 1, color: 0xf2e3a0, equipment: [
      { kind: "hvpanel", label: "High-voltage panel", dx: 1, dy: 1, w: 4 }, { kind: "barrier", label: "Safety barrier", dx: 1, dy: 4, w: 7 } ] },
    { id: "lounge", label: "Staff lounge", kind: "break", col: 2, row: 1, color: 0xc7e3cb, equipment: [
      { kind: "sofa", label: "Sofa", dx: 2, dy: 2, w: 2 }, { kind: "table", label: "Table", dx: 7, dy: 2 },
      { kind: "water", label: "Drinking water", dx: 11, dy: 1 } ] },
    { id: "workshop", label: "Maintenance workshop", kind: "work", col: 0, row: 2, color: 0xc8d1da, equipment: [
      { kind: "toolbench", label: "Tool bench", dx: 1, dy: 1, w: 3 }, { kind: "trolley", label: "Tool trolley", dx: 8, dy: 2 },
      { kind: "pump", label: "Spare pump", dx: 9, dy: 1, w: 2 } ] },
    { id: "office", label: "Facilities office · reporting desk", kind: "admin", col: 1, row: 2, color: 0xb9d3ee, equipment: [
      { kind: "desk", label: "Desk", dx: 2, dy: 2 }, { kind: "computer", label: "Computer", dx: 2, dy: 2 },
      { kind: "desk", label: "Desk", dx: 6, dy: 2 }, { kind: "computer", label: "Computer", dx: 6, dy: 2 } ] },
    { id: "gate", label: "Staff entrance", kind: "gate", col: 2, row: 2, color: 0xd5d5d5, equipment: [
      { kind: "gate", label: "Gate post", dx: 1, dy: 3 }, { kind: "gate", label: "Gate post", dx: 11, dy: 3 } ] },
  ],
  places: {
    admin: { area: "office", dx: 3, dy: 4 }, break: { area: "lounge", dx: 5, dy: 4 }, gate: { area: "gate", dx: 6, dy: 5 },
    hazard: { area: "hv", dx: 5, dy: 3 }, meeting: { area: "office", dx: 8, dy: 5 },
  },
  characters: charsFor("college"),
  scenarios: {
    "wage-discrepancy": { id: "wage-discrepancy", title: "Wage discrepancy", duration: 12,
      description: "A plumber works 9 hours on a pipe repair but overtime is left out of the payout. The query waits for a human decision.",
      steps: [
        start("Wage discrepancy"),
        st(2, "hours.overtime-concern", "warning", "Rajesh passes the 8 h overtime threshold", "Overtime pay (1.5x) applies after 8 hours.",
          { actor: "f1", set: [{ id: "f1", status: "overtime", activity: "Finishing an urgent pipe repair" }] }),
        st(4, "wage.query-raised", "warning", "Wage query raised at the facilities office", "Illustrative case: 9 h worked, ₹800 paid. Reported by the worker.",
          { actor: "f1", confidential: true, set: [{ id: "f1", status: "overtime", anchor: "admin", activity: "Raising a wage query", note: "Demo wage query: 9 h worked, ₹800 paid (illustrative)." }] }),
        st(6, "wage.check-completed", "info", "Rule-based check: ₹150 shortfall", "Expected ₹950 (8 h × ₹100 + 1 h × ₹150) against ₹800 paid. Calculated by fixed rules, not AI.",
          { actor: "g2", confidential: true, set: [{ id: "g2", status: "investigating", anchor: "admin", activity: "Comparing attendance with pay" }] }),
        st(8, "wage.review-required", "warning", "Human review required: employer decision pending", "Nothing is paid back until the employer approves.",
          { actor: "f1", confidential: true, set: [{ id: "f1", status: "review", anchor: "admin", activity: "Waiting for the employer's decision" }, { id: "g1", status: "review", anchor: "admin", activity: "Reviewing the wage query" }] }),
        st(10, "wage.case-resolved", "info", "Back-pay of ₹150 approved (demo)", "The employer approved the claim and the case is closed.",
          { actor: "f1", confidential: true, set: [{ id: "f1", status: "resolved", anchor: "home", activity: "Case resolved, back to work" }, { id: "g1", status: "working", anchor: "home", activity: "Checking work orders" }, { id: "g2", status: "working", anchor: "home", activity: "Updating the duty roster" }] }),
        done(12, "Wage discrepancy"),
      ] },
    "safety-hazard": { id: "safety-hazard", title: "Safety hazard (high-voltage room)", duration: 12,
      description: "An electrician finds the high-voltage panel door open after a leak. A slip incident follows, the supervisor inspects and the room reopens after sign-off.",
      steps: [
        start("Safety hazard"),
        st(2, "safety.hazard-reported", "warning", "High-voltage panel door found open", "Anwar reports exposed terminals and water on the floor nearby.",
          { actor: "f3", set: [{ id: "f3", status: "safety", anchor: "hazard", activity: "Reporting an open HV panel" }] }),
        st(4, "safety.incident", "critical", "Slip on the wet floor next to the panel", "First aid called. The room is cordoned off and power isolated.",
          { actor: "f2", set: [{ id: "f2", status: "safety", anchor: "hazard", activity: "Slipped, receiving first aid" }] }),
        st(6, "safety.inspection", "info", "Supervisor inspecting the room", "Suresh checks isolation, the leak source and barriers.",
          { actor: "g1", set: [{ id: "g1", status: "investigating", anchor: "hazard", activity: "Inspecting the HV room" }] }),
        st(8, "safety.review-required", "warning", "Human review required: incident report awaiting sign-off", "A person must approve before the room reopens.",
          { actor: "g2", set: [{ id: "g2", status: "review", anchor: "admin", activity: "Incident report awaiting sign-off" }] }),
        st(10, "safety.area-cleared", "info", "High-voltage room cleared and reopened", "Leak fixed and panel secured. Incident logged as resolved.",
          { actor: "f3", set: [{ id: "f3", status: "resolved", anchor: "home", activity: "Hazard fixed" }, { id: "f2", status: "working", anchor: "home", activity: "Cleaning hostel corridors" }, { id: "g1", status: "working", anchor: "home", activity: "Checking work orders" }, { id: "g2", status: "working", anchor: "home", activity: "Updating the duty roster" }] }),
        done(12, "Safety hazard"),
      ] },
    "excessive-hours": { id: "excessive-hours", title: "Excessive working hours", duration: 12,
      description: "A housekeeper covers a double shift and passes the 11 h safe limit. A fatigue alert needs the supervisor to approve a rest break and roster change.",
      steps: [
        start("Excessive working hours"),
        st(2, "hours.overtime-concern", "warning", "Meena has logged 9.5 h today", "Overtime pay applies after 8 h; the safe limit on campus is 11 h.",
          { actor: "f2", set: [{ id: "f2", status: "overtime", activity: "Covering a colleague's shift" }] }),
        st(4, "hours.overtime-concern", "warning", "Meena is approaching the 11 h safe limit", "A supervisor should plan a rest break.",
          { actor: "f2", set: [{ id: "f2", status: "overtime", activity: "Hour 10.5, tired" }] }),
        st(6, "hours.fatigue-alert", "critical", "Fatigue alert: 11.5 h worked (safe limit 11 h)", "The supervisor has been notified.",
          { actor: "f2", set: [{ id: "f2", status: "overtime", activity: "Fatigue alert raised" }] }),
        st(8, "hours.review-required", "warning", "Human review required: rest break and roster change", "A person must approve the schedule change.",
          { actor: "g1", set: [{ id: "g1", status: "review", anchor: "area:hostel", activity: "Deciding on a rest break" }, { id: "f2", status: "break", anchor: "break", activity: "Mandatory rest break" }] }),
        st(10, "hours.roster-adjusted", "info", "Roster adjusted: Meena sent home to rest", "Tomorrow's shift starts later. Hours are recorded for payroll.",
          { actor: "g1", set: [{ id: "f2", status: "offshift", anchor: "gate", activity: "Off shift, rest day adjusted" }, { id: "g1", status: "working", anchor: "home", activity: "Checking work orders" }] }),
        done(12, "Excessive working hours"),
      ] },
    "worker-grievance": { id: "worker-grievance", title: "Worker grievance (confidential)", duration: 12,
      description: "An anonymous grievance is logged. The complainant is never stored or shown on the map; only the handling steps are visible, and only to the employer.",
      steps: [
        start("Worker grievance"),
        st(2, "grievance.received", "warning", "Anonymous grievance received", "Category: workplace conduct. The complainant's identity is not recorded.",
          { actor: "g2", confidential: true, set: [{ id: "g2", status: "investigating", anchor: "admin", activity: "Logging a confidential grievance", note: "Anonymous grievance: complainant not recorded." }] }),
        st(4, "grievance.investigation", "info", "Confidential fact-finding started", "Interviews are held privately, away from the work areas.",
          { actor: "g2", confidential: true, set: [{ id: "g2", status: "investigating", anchor: "meeting", activity: "Confidential fact-finding" }] }),
        st(6, "grievance.investigation", "info", "Duty rosters and records reviewed", "No complainant details are used in this step.",
          { actor: "g2", confidential: true, set: [{ id: "g2", status: "investigating", anchor: "admin", activity: "Reviewing records" }] }),
        st(8, "grievance.review-required", "warning", "Human review required: outcome recommendation", "The employer must decide on corrective action.",
          { actor: "g2", confidential: true, set: [{ id: "g2", status: "review", anchor: "admin", activity: "Recommendation awaiting the employer" }] }),
        st(10, "grievance.closed", "info", "Grievance closed with corrective action (demo)", "A conduct refresher was scheduled for the facilities team.",
          { actor: "g2", confidential: true, set: [{ id: "g2", status: "resolved", anchor: "home", activity: "Grievance closed" }] }),
        done(12, "Worker grievance"),
      ] },
  },
};

export const SIM_INDUSTRIES: Record<IndustryId, SimIndustry> = { construction, college };

export const areaOf = (ind: SimIndustry, id: string) => ind.areas.find((a) => a.id === id);

/** Pixel centre of a place reference. */
function placePx(ind: SimIndustry, p: PlaceRef) {
  const a = areaOf(ind, p.area);
  if (!a) return { x: MAP_W / 2, y: MAP_H / 2 };
  const r = areaRect(a);
  return { x: r.x + (p.dx + 0.5) * TILE, y: r.y + (p.dy + 0.5) * TILE };
}

/** Resolve an anchor to pixels. Characters sharing a non-home anchor are spread out so they do not stack. */
export function anchorPx(ind: SimIndustry, charId: string, anchor: Anchor) {
  const idx = Math.max(0, ind.characters.findIndex((c) => c.id === charId));
  const c = ind.characters[idx];
  if (anchor === "home") return placePx(ind, c.home);
  const spread = { x: ((idx % 3) - 1) * 16, y: (Math.floor(idx / 3) % 2) * 20 };
  if (anchor.startsWith("area:")) {
    const a = areaOf(ind, anchor.slice(5));
    if (!a) return placePx(ind, c.home);
    const r = areaRect(a);
    return { x: r.x + r.w / 2 + spread.x, y: r.y + r.h / 2 + spread.y };
  }
  const base = placePx(ind, ind.places[anchor as keyof SimIndustry["places"]] ?? c.home);
  return { x: base.x + spread.x, y: base.y + spread.y };
}
