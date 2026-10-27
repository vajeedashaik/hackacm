import { NextResponse } from "next/server";
import { handleVapiMessage, vapiAuthorised } from "@/lib/ai/voice";
import { readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * Vapi server URL for tool calls. Requests must carry the shared secret (X-Vapi-Secret); each tool
 * call must also carry a valid session token minted by /api/voice/session, which fixes the worker.
 */
export async function POST(req: Request) {
  if (!vapiAuthorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  try {
    const body = await readJson(req, 32_768);
    return NextResponse.json(await handleVapiMessage(body.message), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ results: [] }); // Vapi expects 200; an empty result is reported to the caller
  }
}
