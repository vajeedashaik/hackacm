import { handle, industryOf, readBody, requireEmployer, reviewerOf } from "@/lib/api";
import { confirmPayroll } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handle(async () => {
    requireEmployer(req);
    const b = await readBody(req);
    return confirmPayroll(industryOf(b.industry), String(b.workerId), String(b.period), reviewerOf(b));
  }, 201);
}
