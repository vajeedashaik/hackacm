import { mintSessionToken, voiceStatus } from "@/lib/ai/voice";
import { handle, industryOf, readBody } from "@/lib/api";
import { DomainError } from "@/lib/errors";
import { clientKey, rateLimit } from "@/lib/http";
import { INDUSTRIES } from "@/lib/industries";

export const dynamic = "force-dynamic";

/**
 * Starts a voice session for a worker. When Vapi is not configured this says so and issues nothing,
 * so the UI shows "voice unavailable" instead of pretending a call can start.
 */
export async function POST(req: Request) {
  return handle(async () => {
    rateLimit(`voice:${clientKey(req)}`, 10, 60_000);
    const status = voiceStatus();
    if (!status.configured) return { configured: false, missing: status.missing };
    const b = await readBody(req);
    const industry = industryOf(b.industry);
    if (!INDUSTRIES[industry].workers.some((w) => w.id === b.workerId)) throw new DomainError("Unknown worker");
    return {
      configured: true,
      publicKey: process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY,
      assistantId: process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID,
      sessionToken: mintSessionToken(industry, String(b.workerId)),
    };
  });
}
