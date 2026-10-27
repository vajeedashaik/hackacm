import { handle, industryOf, readBody } from "@/lib/api";
import { addFeedback } from "@/lib/store";
import type { FeedbackMode } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    const b = await readBody(req);
    return addFeedback({
      industry: industryOf(b.industry), mode: b.mode as FeedbackMode, category: String(b.category ?? ""),
      text: String(b.text ?? ""),
      // anonymous feedback never carries identity, even if a client sends it
      workerId: b.mode === "confidential" ? String(b.workerId ?? "") : undefined,
    });
  }, 201);
}
