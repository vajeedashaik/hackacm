import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "./industries";
import { actOnCase, addFeedback, createCase, reopenCase, snapshot } from "./store";

const cfg = INDUSTRIES.construction;
const [w1, w2] = cfg.workers;
const REVIEWER = cfg.reviewers[0];
let day = 0;
// each test uses its own past date so open-case de-duplication never collides across tests
const freshDate = () => `2025-03-${String(++day).padStart(2, "0")}`;

const safety = (workerId: string, extra: Record<string, unknown> = {}) =>
  createCase({
    type: "safety", industry: "construction", workerId, category: cfg.safetyCategories[0].id,
    location: cfg.zones[0].name, severity: "high", description: "Scaffold plank is cracked near the ladder.", ...extra,
  });

describe("case lifecycle rules", () => {
  it("creates a reviewable safety case and rejects incomplete reports", () => {
    const c = safety(w1.id);
    expect(c.status).toBe("open");
    expect(c.id).toMatch(/^FS-\d+$/);
    expect(() => safety(w1.id, { description: "short" })).toThrow(/at least 10/);
    expect(() => safety(w1.id, { severity: "extreme" })).toThrow(/severity/i);
    expect(() => safety(w1.id, { location: "Moon" })).toThrow(/work area/i);
  });

  it("only allows valid status transitions", () => {
    const c = createCase({ type: "wage", industry: "construction", workerId: w1.id, date: freshDate(), hoursWorked: 10, amountPaid: 500 });
    actOnCase(c.id, { action: "review", reviewer: REVIEWER });
    expect(() => actOnCase(c.id, { action: "review", reviewer: REVIEWER })).toThrow(/already started/);
    expect(() => actOnCase(c.id, { action: "reject", reviewer: REVIEWER })).toThrow(/reason/);
    expect(() => actOnCase(c.id, { action: "assign", reviewer: REVIEWER, assignTo: "Nobody" })).toThrow(/reviewer/i);
    actOnCase(c.id, { action: "reject", reviewer: REVIEWER, note: "Hours do not match the site log." });
    expect(() => actOnCase(c.id, { action: "resolve", reviewer: REVIEWER })).toThrow(/closed/);
  });

  it("lets only the filing worker reopen a closed case, and only closed ones", () => {
    const c = safety(w1.id, { description: "Exposed wiring in the site office." });
    expect(() => reopenCase(c.id, w1.id, "I disagree with this")).toThrow(/closed/);
    actOnCase(c.id, { action: "reject", reviewer: REVIEWER, note: "Duplicate of an earlier report." });
    expect(() => reopenCase(c.id, w2.id, "not my case at all")).toThrow(/not found/i);
    expect(() => reopenCase(c.id, w1.id, "no")).toThrow(/why you disagree/);
    const reopened = reopenCase(c.id, w1.id, "The earlier report was a different hazard");
    expect(reopened.status).toBe("open");
    expect(reopened.reopenCount).toBe(1);
  });
});

describe("what each viewer can see", () => {
  it("shows a worker only their own cases, and never internal notes", () => {
    const c = safety(w2.id, { description: "Missing guard rail on level two." });
    actOnCase(c.id, { action: "note", reviewer: REVIEWER, note: "Internal: check contractor history." });
    const mine = snapshot("construction", { employer: false, workerId: w2.id });
    const theirs = snapshot("construction", { employer: false, workerId: w1.id });
    const anon = snapshot("construction", { employer: false });
    expect(mine.cases.some((x) => x.id === c.id)).toBe(true);
    expect(theirs.cases.some((x) => x.id === c.id)).toBe(false);
    expect(anon.cases).toHaveLength(0);
    expect(JSON.stringify(mine.audit)).not.toContain("contractor history");
    expect(JSON.stringify(snapshot("construction", { employer: true }).audit)).toContain("contractor history");
  });

  it("keeps anonymous feedback free of identity, and hides all feedback from workers", () => {
    const text = "Supervisors keep skipping the rest breaks.";
    addFeedback({ industry: "construction", mode: "anonymous", category: "conditions", text, workerId: w1.id });
    const boss = snapshot("construction", { employer: true });
    const item = boss.feedback.find((f) => f.text === text)!;
    expect(item.reporterId).toBeUndefined();
    expect(JSON.stringify(item)).not.toContain(w1.id);
    expect(new Date(item.ts + 5.5 * 3_600_000).getUTCHours()).toBe(0);
    expect(snapshot("construction", { employer: false, workerId: w1.id }).feedback).toEqual([]);
  });

  it("requires a real worker for confidential feedback and validates input", () => {
    expect(() => addFeedback({ industry: "construction", mode: "confidential", category: "pay", text: "Overtime is not being paid.", workerId: "nobody" })).toThrow();
    expect(() => addFeedback({ industry: "construction", mode: "anonymous", category: "pay", text: "short" })).toThrow(/10 characters/);
    expect(() => addFeedback({ industry: "construction", mode: "anonymous", category: "bogus", text: "Long enough text here." })).toThrow(/topic/);
  });
});
