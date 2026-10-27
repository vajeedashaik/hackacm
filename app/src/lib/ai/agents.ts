import type { Analysis, IndustryConfig, Priority, Worker } from "../types";
import type { FatigueAlert } from "../calc";
import { complete } from "./provider";
import { SUPERVISOR_PERSONA, WORKER_PERSONA } from "./personas";
import { claimsDecision, cleanList, cleanText, moneyIsGrounded, parseJsonObject, rupeeAmounts } from "./validate";
import type { AgentSource, AttendanceFinding } from "./types";
import type { Evidence } from "./tools";

// Each agent has one job and a deterministic fallback. Models only ever write wording (or raise a
// safety urgency); numbers, categories of action and state changes come from rules and the backend.

export interface Out<T> { value: T; source: AgentSource }

const SYSTEM_BASE =
  "You are one component of a workplace-fairness tool in India. Use ONLY the facts you are given. " +
  "Never calculate or change any amount, never say a case is approved, paid, resolved or rejected, " +
  "and never guess missing facts. Reply in plain English.";

// ---------- Wage Analysis Agent ----------

export async function wageAnalysisAgent(a: {
  cfg: IndustryConfig; worker: Worker; date: string; hours: number; paid: number; analysis: Analysis;
}): Promise<Out<string>> {
  const { cfg, worker, hours, paid, analysis } = a;
  const regularPay = analysis.regularHours * worker.hourlyRate;
  const overtimePay = Math.round(analysis.overtimeHours * worker.hourlyRate * cfg.overtimeMultiplier * 100) / 100;
  const rules =
    `For ${a.date} you reported ${hours}h: ${analysis.regularHours}h regular at ₹${worker.hourlyRate}/h` +
    (analysis.overtimeHours > 0 ? ` and ${analysis.overtimeHours}h overtime at ${cfg.overtimeMultiplier}x` : "") +
    `. Expected pay ₹${analysis.expectedPay}; you were paid ₹${paid}. ${analysis.summary}`;

  const allowed = [worker.hourlyRate, analysis.expectedPay, paid, analysis.shortfall, regularPay, overtimePay];
  const r = await complete({
    system: `${SYSTEM_BASE} Explain this wage calculation to the worker in 2-4 short sentences. Tone: ${WORKER_PERSONA[cfg.id].tone}.`,
    user: JSON.stringify({
      hoursWorked: hours, regularHours: analysis.regularHours, overtimeHours: analysis.overtimeHours,
      hourlyRate: worker.hourlyRate, overtimeMultiplier: cfg.overtimeMultiplier,
      expectedPay: analysis.expectedPay, amountPaid: paid, shortfall: analysis.shortfall,
    }),
  });
  if (r.ok) {
    const t = cleanText(r.text, 600);
    if (t && moneyIsGrounded(t, allowed) && !claimsDecision(t)) return { value: t, source: "model" };
  }
  return { value: rules, source: "rules" };
}

// ---------- Attendance Agent (rule-based: it reads evidence, it does not invent any) ----------

export function attendanceAgent(a: {
  cfg: IndustryConfig; evidence: Evidence; claimedHours?: number; alerts: FatigueAlert[];
}): Out<AttendanceFinding> {
  const { cfg, evidence: ev, claimedHours } = a;
  const flags: string[] = [];
  let consistent = true;
  if (ev.recordedHours === null) {
    flags.push(`No attendance record exists for ${ev.date}, so the claim cannot be checked against attendance.`);
    consistent = claimedHours === undefined;
  } else {
    if (claimedHours !== undefined && Math.abs(claimedHours - ev.recordedHours) > 0.5) {
      consistent = false;
      flags.push(`Claimed ${claimedHours}h but attendance records show ${ev.recordedHours}h on ${ev.date}.`);
    }
    if (ev.recordedHours > cfg.maxSafeHours) flags.push(`Recorded ${ev.recordedHours}h exceeds the ${cfg.maxSafeHours}h daily limit.`);
    if (ev.records.some((r) => r.open)) flags.push("A shift on this date is still open, so recorded hours may change.");
    if (ev.records.some((r) => r.method === "supervisor")) flags.push("Some hours were entered by a supervisor, not clocked by the worker.");
    if (ev.records.some((r) => r.corrected)) flags.push("At least one record was corrected after the fact.");
  }
  for (const al of a.alerts.filter((x) => x.date === ev.date || x.rule === "weekly" || x.rule === "streak").slice(0, 3)) {
    flags.push(`Workload rule "${al.rule}": ${al.value} against a limit of ${al.limit}.`);
  }
  return { value: { claimedHours, recordedHours: ev.recordedHours, consistent, flags }, source: "rules" };
}

// ---------- Safety Triage Agent ----------

const URGENCY: Priority[] = ["low", "medium", "high", "urgent"];
const CRITICAL_WORDS = /\b(unconscious|bleeding|collapsed?|trapped|fire|electric(?:al)? shock|gas leak|fell from|fractur\w*)\b/i;
const CATEGORY_WORDS: [RegExp, string][] = [
  [/\b(fell|fall|height|ladder|scaffold\w*|edge)\b/i, "fall"],
  [/\b(shock|wire|wiring|spark\w*|short circuit|electric\w*)\b/i, "electrical"],
  [/\b(helmet|gloves?|harness|ppe|goggles?|mask)\b/i, "ppe"],
  [/\b(machine|drill|crane|mixer|equipment|tool)\b/i, "equipment"],
  [/\b(wet floor|slip\w*|slippery)\b/i, "slip"],
  [/\b(chemical|acid|fumes?|lab)\b/i, "chemical"],
  [/\b(fire|smoke|extinguisher)\b/i, "fire"],
  [/\b(injur\w*|hurt|bleeding|near miss)\b/i, "injury"],
];

export interface Triage { urgency: Priority; missingInfo: string[]; suggestedCategory?: string; note: string }

export async function safetyTriageAgent(a: {
  cfg: IndustryConfig; category: string; severity?: string; description: string; floor: Priority;
}): Promise<Out<Triage>> {
  const text = a.description;
  let floor = URGENCY.indexOf(a.floor);
  if (CRITICAL_WORDS.test(text)) floor = Math.max(floor, URGENCY.indexOf("urgent"));

  const missing: string[] = [];
  if (!/\b(today|yesterday|morning|evening|night|\d{1,2}(:\d{2})?\s?(am|pm)?)\b/i.test(text)) missing.push("When did it happen?");
  if (!/\b(injur\w*|hurt|no one|nobody|everyone|safe)\b/i.test(text)) missing.push("Was anyone injured or at risk?");
  if (text.length < 40) missing.push("More detail about what exactly was unsafe.");

  const ids = new Set(a.cfg.safetyCategories.map((c) => c.id));
  const guess = CATEGORY_WORDS.find(([re, id]) => re.test(text) && ids.has(id))?.[1];
  const suggestedCategory = guess && guess !== a.category && a.category !== "injury" ? guess : undefined;

  const base: Triage = {
    urgency: URGENCY[floor], missingInfo: missing, suggestedCategory,
    note: `Urgency "${URGENCY[floor]}" from the reported severity${CRITICAL_WORDS.test(text) ? " and serious wording" : ""}.`,
  };

  const r = await complete({
    json: true,
    system:
      `${SYSTEM_BASE} Triage a workplace safety report. Reply with JSON only: ` +
      `{"urgency":"low|medium|high|urgent","missingInfo":["short question", ...max 4]}.`,
    user: JSON.stringify({ category: a.category, reportedSeverity: a.severity, description: text }),
  });
  if (r.ok) {
    const j = parseJsonObject(r.text);
    const u = typeof j?.urgency === "string" ? URGENCY.indexOf(j.urgency as Priority) : -1;
    const m = j ? cleanList(j.missingInfo, 4, 120) : null;
    if (j && u >= 0 && m) {
      // the model may raise urgency, never lower it below the rule-based floor
      const merged = [...new Set([...missing, ...m])].slice(0, 5);
      return {
        value: { ...base, urgency: URGENCY[Math.max(u, floor)], missingInfo: merged,
          note: u > floor ? `Model raised urgency to "${URGENCY[u]}".` : base.note },
        source: "model",
      };
    }
  }
  return { value: base, source: "rules" };
}

// ---------- Fairness Case Agent ----------

export async function fairnessCaseAgent(a: {
  type: "wage" | "safety" | "attendance"; title: string; facts: string[]; allowedAmounts: number[]; nextSteps: string[];
}): Promise<Out<string>> {
  const rules = `${a.title}. ${a.facts.join(" ")}`.trim();
  const r = await complete({
    system: `${SYSTEM_BASE} Summarise this ${a.type} case for the employer reviewer in at most 3 sentences. Do not recommend a final decision.`,
    user: JSON.stringify({ title: a.title, facts: a.facts }),
  });
  if (r.ok) {
    const t = cleanText(r.text, 700);
    if (t && moneyIsGrounded(t, a.allowedAmounts) && !claimsDecision(t)) return { value: t, source: "model" };
  }
  return { value: rules, source: "rules" };
}

// ---------- Worker Persona Agent ----------

export type ConcernKind = "wage" | "safety" | "attendance" | "grievance" | "unclear";
const KIND_WORDS: [RegExp, ConcernKind][] = [
  [/\b(unsafe|danger\w*|hazard|injur\w*|accident|fire|shock|helmet|harness)\b/i, "safety"],
  [/\b(salary|wage|pay(?:ment)?|paid|overtime|short|money|payslip)\b/i, "wage"],
  [/\b(clock\w*|attendance|hours?|shift|punch)\b/i, "attendance"],
  [/\b(harass\w*|abuse|shout\w*|unfair|discriminat\w*|bully\w*|threat\w*)\b/i, "grievance"],
];

/** Helps a worker put a concern into words and pick the right report type. It files nothing. */
export async function workerPersonaAgent(a: { cfg: IndustryConfig; message: string }): Promise<Out<{ kind: ConcernKind; draft: string }>> {
  const msg = a.message.trim().slice(0, 600);
  const kind = KIND_WORDS.find(([re]) => re.test(msg))?.[1] ?? "unclear";
  const fallback = { kind, draft: msg };
  const r = await complete({
    json: true,
    system:
      `${SYSTEM_BASE} Rewrite the worker's message as a clear, factual first-person report in at most 3 short sentences. ` +
      `Keep every fact, and add none. Tone: ${WORKER_PERSONA[a.cfg.id].tone}. Reply with JSON only: {"draft":"..."}.`,
    user: msg,
  });
  if (r.ok) {
    const draft = cleanText(parseJsonObject(r.text)?.draft, 500);
    if (draft && moneyIsGrounded(draft, rupeeAmounts(msg)) && !claimsDecision(draft)) return { value: { kind, draft }, source: "model" };
  }
  return { value: fallback, source: "rules" };
}

// ---------- Supervisor Persona Agent ----------

/** Chooses from the persona's fixed policy list; it cannot invent a response or a penalty. */
export function supervisorPersonaAgent(cfg: IndustryConfig, rule: FatigueAlert["rule"]) {
  const p = SUPERVISOR_PERSONA[cfg.id];
  return { title: p.title, response: p.policy[rule] };
}
