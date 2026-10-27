import { type Ctx, audit, canSeeWorker, requireHuman, requireStaff, requireWorker } from "../ctx";
import type { SkillPassportRow } from "../db/rows";
import { ServiceError } from "../errors";
import { publishEvent } from "./events";

/**
 * Create or update a skill passport entry. Entries are verified by staff, so workers cannot grade
 * themselves and agents cannot verify. Linking a training record requires it to match worker + skill.
 */
export function updateSkillPassport(
  ctx: Ctx,
  input: { workerId: string; skillId: string; level: SkillPassportRow["level"]; trainingRecordId?: string },
) {
  requireHuman(ctx);
  requireStaff(ctx);
  requireWorker(ctx, input.workerId);
  if (!ctx.db.skills.some((s) => s.id === input.skillId && s.org_id === ctx.actor.orgId)) {
    throw new ServiceError(404, "Skill not found");
  }
  if (input.trainingRecordId) {
    const t = ctx.db.training_records.find((r) => r.id === input.trainingRecordId);
    if (!t || t.worker_id !== input.workerId || t.skill_id !== input.skillId) {
      throw new ServiceError(422, "Training record does not match this worker and skill");
    }
  }
  const now = ctx.now().toISOString();
  let row = ctx.db.skill_passport_entries.find((e) => e.worker_id === input.workerId && e.skill_id === input.skillId);
  if (row) {
    row.level = input.level;
    row.training_record_id = input.trainingRecordId ?? row.training_record_id;
    row.verified_by = ctx.actor.userId;
    row.updated_at = now;
  } else {
    row = {
      id: ctx.id(), org_id: ctx.actor.orgId, worker_id: input.workerId, skill_id: input.skillId,
      level: input.level, training_record_id: input.trainingRecordId ?? null,
      verified_by: ctx.actor.userId, updated_at: now,
    };
    ctx.db.skill_passport_entries.push(row);
  }
  audit(ctx, "skill.update", "skill_passport_entry", row.id, { worker: input.workerId, level: input.level });
  publishEvent(ctx, { kind: "skill.updated", entityType: "skill_passport_entry", entityId: row.id, workerId: input.workerId, payload: { level: input.level } });
  return row;
}

export function getSkillPassport(ctx: Ctx, workerId: string) {
  if (!canSeeWorker(ctx, workerId)) throw new ServiceError(404, "Worker not found");
  return ctx.db.skill_passport_entries.filter((e) => e.worker_id === workerId);
}
