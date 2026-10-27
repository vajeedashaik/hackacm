import { createHmac, randomBytes } from "node:crypto";
import { DomainError } from "../errors";
import { safeEqual } from "../http";
import { INDUSTRIES } from "../industries";
import { addFeedback, createCase } from "../store";
import type { IndustryId } from "../types";
import { investigateCase } from "./orchestrator";
import { explainPayslip, getShiftRecords, listCasesFor, workerActor } from "./tools";
import type { ToolCtx } from "./types";

// Vapi voice workflows. The browser starts a call with a short-lived, server-signed session token;
// Vapi's tool calls come back to /api/vapi/tools carrying that token, and every tool runs as THAT
// worker through the same scoped tools as the text UI. Nothing here is verified against a live Vapi
// account (no credentials in this environment) - see AGENTS.md.

export const VOICE_TOOLS = ["get_shift_records", "explain_payslip", "report_safety_issue", "raise_grievance", "get_case_status"] as const;
type VoiceTool = (typeof VOICE_TOOLS)[number];

const TOKEN_TTL_MS = 30 * 60_000;
const g = globalThis as unknown as { __fairshiftVoiceKey?: string };
const key = () => process.env.VOICE_SESSION_SECRET || (g.__fairshiftVoiceKey ??= randomBytes(32).toString("hex"));
const sign = (body: string) => createHmac("sha256", key()).update(body).digest("base64url");

export function mintSessionToken(industry: IndustryId, workerId: string, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ i: industry, w: workerId, e: now + TOKEN_TTL_MS })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: unknown, now = Date.now()): ToolCtx | null {
  if (typeof token !== "string") return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, sign(body))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as { i: IndustryId; w: string; e: number };
    if (!(p.e > now) || !INDUSTRIES[p.i]?.workers.some((w) => w.id === p.w)) return null;
    return { industry: p.i, actor: workerActor(p.w) };
  } catch {
    return null;
  }
}

/** What is missing for voice to work. Voice is only offered as available when this is empty. */
export function voiceStatus() {
  const missing = [
    ["NEXT_PUBLIC_VAPI_PUBLIC_KEY", process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY],
    ["NEXT_PUBLIC_VAPI_ASSISTANT_ID", process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID],
    ["VAPI_WEBHOOK_SECRET", process.env.VAPI_WEBHOOK_SECRET],
  ].filter(([, v]) => !v).map(([k]) => k as string);
  return { configured: missing.length === 0, missing };
}

/** Vapi's server authentication: the shared secret arrives in a header configured on the Vapi side. */
export function vapiAuthorised(req: Request) {
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  const given = req.headers.get("x-vapi-secret");
  return !!secret && !!given && safeEqual(given, secret);
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function run(tool: VoiceTool, ctx: ToolCtx, args: Record<string, unknown>): Promise<string> {
  const workerId = ctx.actor.role === "worker" ? ctx.actor.workerId : "";
  switch (tool) {
    case "get_shift_records": {
      const rows = getShiftRecords(ctx, undefined, Number(args.days) || 7);
      return rows.length ? rows.map((r) => `${r.date}: ${r.hours} hours`).join("; ") : "There are no shift records in that period.";
    }
    case "explain_payslip": {
      const { slip } = explainPayslip(ctx, undefined, str(args.period, 10) || undefined);
      if (!slip.days.length) return "There is no attendance for this pay week, so there is nothing to calculate yet.";
      return `Week of ${slip.period}: ${slip.hours} hours (${slip.regularHours} regular, ${slip.overtimeHours} overtime). ` +
        `Regular pay ₹${slip.regularPay}, overtime pay ₹${slip.overtimePay}, allowances ₹${slip.allowances}, deductions ₹${slip.deductions}. ` +
        `Net ₹${slip.net}.${slip.inProgress ? " A shift is still open, so this will change." : ""}`;
    }
    case "report_safety_issue": {
      const c = createCase({
        type: "safety", industry: ctx.industry, workerId,
        category: str(args.category, 30), location: str(args.location, 60),
        severity: str(args.severity, 10) as "low", description: str(args.description, 1000),
      });
      void investigateCase(ctx.industry, c.id);
      return `Your safety report was recorded as ${c.id} with ${c.priority} priority. A reviewer will look at it.`;
    }
    case "raise_grievance": {
      // confidential: the employer view can see who raised it; nothing is repeated back or exposed to others
      const f = addFeedback({
        industry: ctx.industry, mode: "confidential", category: str(args.category, 20) || "other",
        text: str(args.description, 1000), workerId,
      });
      return `Your confidential grievance was recorded with reference ${f.id}.`;
    }
    case "get_case_status": {
      const cases = listCasesFor(ctx).slice(0, 5);
      if (!cases.length) return "You have no reports yet.";
      return cases.map((c) => `${c.id} (${c.type}): ${c.status.replace("_", " ")}${c.resolutionNote ? `. Note from reviewer: ${c.resolutionNote}` : ""}`).join("; ");
    }
  }
}

export interface VapiToolResult { toolCallId: string; result?: string; error?: string }

/** Handles Vapi's `tool-calls` message. Vapi expects HTTP 200 with one result or error per call. */
export async function handleVapiMessage(message: unknown): Promise<{ results: VapiToolResult[] }> {
  const m = (message ?? {}) as { type?: string; toolCallList?: unknown };
  if (m.type !== "tool-calls" || !Array.isArray(m.toolCallList)) return { results: [] };
  const results: VapiToolResult[] = [];
  for (const raw of m.toolCallList.slice(0, 5)) {
    const call = raw as { id?: unknown; function?: { name?: unknown; arguments?: unknown }; name?: unknown; arguments?: unknown };
    const toolCallId = String(call.id ?? "");
    const name = String(call.function?.name ?? call.name ?? "");
    let args = call.function?.arguments ?? call.arguments ?? {};
    if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
    const a = (typeof args === "object" && args !== null ? args : {}) as Record<string, unknown>;
    try {
      if (!(VOICE_TOOLS as readonly string[]).includes(name)) throw new DomainError("Unknown tool");
      const ctx = verifySessionToken(a.sessionToken);
      if (!ctx) throw new DomainError("This voice session has expired. Please use the text form or restart the call.");
      results.push({ toolCallId, result: (await run(name as VoiceTool, ctx, a)) ?? "" });
    } catch (e) {
      results.push({ toolCallId, error: e instanceof DomainError ? e.message : "Sorry, that did not work. Please try the text form." });
    }
  }
  return { results };
}
