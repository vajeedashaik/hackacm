import { handle, industryOf, readBody } from "@/lib/api";
import { addSkill } from "@/lib/store";
import type { SkillKind } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    return addSkill({
      industry: industryOf(b.industry), workerId: String(b.workerId), kind: b.kind as SkillKind,
      name: String(b.name ?? ""), detail: String(b.detail ?? ""),
      year: b.year === undefined || b.year === "" ? undefined : Number(b.year),
    });
  }, 201);
}
