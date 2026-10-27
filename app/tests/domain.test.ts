import { describe, expect, it } from "vitest";
import { CASE_EDGES, type Actor, calculateWage, checkTransition, compareToPaid } from "@/server/domain";
import type { CaseStatus } from "@/server/db/rows";

const rule = { regularHoursPerDay: 8, overtimeMultiplier: 2 };

describe("calculateWage (deterministic, integer paise)", () => {
  it("pays regular hours only at or below the threshold", () => {
    const b = calculateWage(8, 90, rule);
    expect(b).toMatchObject({ regularHours: 8, overtimeHours: 0, expectedPaise: 72_000 });
  });
  it("applies the multiplier to overtime", () => {
    const b = calculateWage(12, 90, rule); // 8*90 + 4*90*2
    expect(b.expectedPaise).toBe(72_000 + 72_000);
    expect(b.overtimeHours).toBe(4);
  });
  it("handles fractional rates without float drift", () => {
    expect(calculateWage(3, 33.33, rule).expectedPaise).toBe(9_999);
    expect(calculateWage(8.5, 70.1, { regularHoursPerDay: 8, overtimeMultiplier: 1.5 }).expectedPaise).toBe(
      Math.round(8 * 7010) + Math.round(0.5 * 7010 * 1.5),
    );
  });
  it("is a pure function: same inputs, same output", () => {
    expect(calculateWage(9.25, 101.5, rule)).toEqual(calculateWage(9.25, 101.5, rule));
  });
  it("rejects impossible inputs", () => {
    expect(() => calculateWage(-1, 90, rule)).toThrow(RangeError);
    expect(() => calculateWage(25, 90, rule)).toThrow(RangeError);
    expect(() => calculateWage(8, -5, rule)).toThrow(RangeError);
  });
});

describe("compareToPaid", () => {
  it("never reports a negative shortfall (overpayment)", () => {
    expect(compareToPaid(10_000, 150, 0)).toEqual({ shortfallPaise: 0, flagged: false });
  });
  it("flags only when the shortfall exceeds the tolerance", () => {
    expect(compareToPaid(10_000, 99, 1)).toEqual({ shortfallPaise: 100, flagged: false });
    expect(compareToPaid(10_000, 98.99, 1).flagged).toBe(true);
  });
});

const actor = (role: Actor["role"], kind: Actor["kind"] = "human", userId = "u-staff"): Actor => ({ userId, orgId: "o", role, kind });
const ok = (from: CaseStatus, to: CaseStatus, a: Actor, owner = "w1") => checkTransition(from, to, a, owner).ok;

describe("case lifecycle", () => {
  it("walks the happy path in order", () => {
    const admin = actor("employer_admin");
    expect(ok("reported", "triaged", admin)).toBe(true);
    expect(ok("triaged", "under_review", admin)).toBe(true);
    expect(ok("under_review", "action_proposed", admin)).toBe(true);
    expect(ok("action_proposed", "resolved", admin)).toBe(true);
  });
  it("forbids skipping stages", () => {
    const admin = actor("employer_admin");
    expect(ok("reported", "resolved", admin)).toBe(false);
    expect(ok("triaged", "action_proposed", admin)).toBe(false);
    expect(ok("under_review", "resolved", admin)).toBe(false);
  });
  it("lets only a human employer admin resolve", () => {
    expect(ok("action_proposed", "resolved", actor("supervisor"))).toBe(false);
    expect(ok("action_proposed", "resolved", actor("worker", "human", "w1"))).toBe(false);
    const agent = checkTransition("action_proposed", "resolved", actor("employer_admin", "agent"), "w1");
    expect(agent).toMatchObject({ ok: false, status: 403 });
  });
  it("lets agents triage, review and propose, but never close or reopen", () => {
    const agent = actor("employer_admin", "agent");
    expect(ok("reported", "triaged", agent)).toBe(true);
    expect(ok("triaged", "under_review", agent)).toBe(true);
    expect(ok("under_review", "action_proposed", agent)).toBe(true);
    for (const [from, edges] of Object.entries(CASE_EDGES)) {
      for (const e of edges) {
        if (["resolved", "rejected", "disputed"].includes(e.to) || ["resolved", "rejected"].includes(from)) {
          expect(ok(from as CaseStatus, e.to, agent), `${from}→${e.to}`).toBe(false);
        }
      }
    }
  });
  it("lets only the owning worker dispute a closed case", () => {
    expect(ok("resolved", "disputed", actor("worker", "human", "w1"))).toBe(true);
    expect(ok("rejected", "disputed", actor("worker", "human", "w1"))).toBe(true);
    expect(ok("resolved", "disputed", actor("worker", "human", "someone-else"))).toBe(false);
    expect(ok("resolved", "disputed", actor("employer_admin"))).toBe(false);
  });
  it("supports reopening by an admin and handling a dispute", () => {
    expect(ok("resolved", "under_review", actor("employer_admin"))).toBe(true);
    expect(ok("resolved", "under_review", actor("supervisor"))).toBe(false);
    expect(ok("disputed", "under_review", actor("supervisor"))).toBe(true);
  });
  it("allows rejection from every open stage, by an admin", () => {
    for (const s of ["reported", "triaged", "under_review", "action_proposed"] as CaseStatus[]) {
      expect(ok(s, "rejected", actor("employer_admin")), s).toBe(true);
      expect(ok(s, "rejected", actor("supervisor")), s).toBe(false);
    }
  });
});
