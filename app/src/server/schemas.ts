import { z } from "zod";

// Input validation for every write. All objects are strict: unknown keys are rejected, and free
// text has explicit length limits matching the database CHECK constraints.
const id = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date");
const money = z.number().finite().min(0).max(10_000_000).multipleOf(0.01);
const text = (max: number) => z.string().trim().min(1).max(max);

export const startShiftInput = z.strictObject({ workerId: id.optional(), shiftId: id.optional(), workAreaId: id.optional() });
export const endShiftInput = z.strictObject({ workerId: id.optional() });

export const wageInput = z.strictObject({ workerId: id, date });
export const payrollInput = z.strictObject({
  workerId: id, date, amountPaid: money, source: z.enum(["employer_payroll", "worker_reported"]),
});
export const compareInput = z.strictObject({ wageCalculationId: id, payrollRecordId: id });

export const incidentInput = z.strictObject({
  category: text(60), severity: z.enum(["low", "medium", "high", "critical"]), description: text(2000),
  worksiteId: id.optional(), workAreaId: id.optional(),
});
export const feedbackInput = z.strictObject({ category: text(60), body: text(4000), anonymous: z.boolean() });

export const caseTypes = ["wage_discrepancy", "excessive_hours", "safety", "other"] as const;
export const caseStatuses = ["reported", "triaged", "under_review", "action_proposed", "resolved", "rejected", "disputed"] as const;
export const createCaseInput = z.strictObject({
  workerId: id.optional(), caseType: z.enum(caseTypes), title: text(200), summary: z.string().trim().max(2000).optional(),
  payrollComparisonId: id.optional(),
});
export const updateCaseInput = z.strictObject({
  title: text(200).optional(), summary: z.string().trim().max(2000).optional(), assignedTo: id.nullable().optional(),
});
export const transitionInput = z.strictObject({ to: z.enum(caseStatuses), note: z.string().trim().max(1000).optional() });
export const evidenceInput = z.strictObject({
  kind: z.enum(["note", "attendance", "payroll", "photo", "other"]), content: text(2000),
});

export const passportInput = z.strictObject({
  workerId: id, skillId: id, level: z.enum(["beginner", "intermediate", "advanced"]), trainingRecordId: id.optional(),
});
