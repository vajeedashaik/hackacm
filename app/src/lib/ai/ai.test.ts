import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDays, dayOf } from "../calc";
import { actOnCase, addShift, createCase } from "../store";
import { adaptAgentEvents } from "../../sim/agentAdapter";
import { eventsFor, flagsFor, getReport } from "./agentStore";
import { decideFlag, investigateCase, scanWorkload } from "./orchestrator";
import { complete, setProvider } from "./provider";
import { currentReport, decideProposal, getCase, proposeAction, workerActor } from "./tools";
import { claimsDecision, moneyIsGrounded, parseJsonObject, rupeeAmounts } from "./validate";
import { handleVapiMessage, mintSessionToken, vapiAuthorised, verifySessionToken } from "./voice";
import type { ToolCtx } from "./types";

const SYSTEM = (industry: "construction" | "college" = "construction"): ToolCtx => ({ industry, actor: { role: "system" } });
const BOSS = (industry: "construction" | "college" = "construction"): ToolCtx => ({ industry, actor: { role: "employer", name: "Test boss" } });
const today = dayOf(Date.now());
let n = 0;
// every test gets its own past day so cases never collide with the shared in-memory store
const freshDay = () => addDays(today, -(++n + 1));

/** construction worker c1: ₹90/h, overtime after 8h at 2x. 11h worked, ₹720 paid => expected ₹1260, shortfall ₹540. */
function wageCase(workerId: string, date: string, hours = 11, paid = 720) {
  return createCase({ type: "wage", industry: "construction", workerId, date, hoursWorked: hours, amountPaid: paid });
}

beforeEach(() => setProvider(async () => ({ ok: false, reason: "not-configured" })));
afterEach(() => setProvider());

describe("end-to-end wage investigation (no model configured)", () => {
  it("retrieves evidence, recalculates, proposes, and only a human decision changes the case", async () => {
    const date = freshDay();
    addShift("construction", "c1", date, "07:00", "18:00", "Test");
    const c = wageCase("c1", date);

    const report = await investigateCase("construction", c.id);
    expect(report).toBeDefined();
    expect(report!.attendance).toMatchObject({ recordedHours: 11, consistent: true });
    expect(report!.proposal).toMatchObject({ action: "resolve_backpay", amount: 540, status: "pending" });
    expect(report!.sources["wage-analysis"]).toBe("rules"); // labelled as fallback, not as AI
    expect(report!.explanation).toContain("₹1260");

    // agents have NOT changed the case
    expect(getCase(SYSTEM(), c.id).status).toBe("open");

    const types = eventsFor("construction", { employer: true }, 100).filter((e) => e.recordId === c.id).map((e) => e.type);
    for (const t of ["agent-invoked", "evidence-retrieved", "calculation-completed", "issue-classified", "action-proposed", "human-review-required"]) {
      expect(types).toContain(t);
    }

    decideProposal(BOSS(), c.id, "accept", "Verified");
    const after = getCase(SYSTEM(), c.id);
    expect(after.status).toBe("resolved");
    expect(after.paidBack).toBe(540); // the deterministic amount, nothing else
    const types2 = eventsFor("construction", { employer: true }, 100).filter((e) => e.recordId === c.id).map((e) => e.type);
    expect(types2).toEqual(expect.arrayContaining(["action-accepted", "case-updated"]));
  });

  it("does not propose back-pay when claimed hours contradict attendance", async () => {
    const date = freshDay();
    addShift("construction", "c2", date, "08:00", "13:00", "Test"); // 5h recorded
    const c = wageCase("c2", date, 11, 400);
    const r = await investigateCase("construction", c.id);
    expect(r!.attendance!.consistent).toBe(false);
    expect(r!.proposal.action).toBe("request_info");
    expect(r!.attendance!.flags.join(" ")).toContain("5h");
  });

  it("does not invent attendance when none exists", async () => {
    const c = wageCase("c3", freshDay());
    const r = await investigateCase("construction", c.id);
    expect(r!.attendance!.recordedHours).toBeNull();
    expect(r!.proposal.action).toBe("request_info");
  });

  it("rejecting a proposal leaves the case untouched", async () => {
    const date = freshDay();
    addShift("construction", "c4", date, "07:00", "18:00", "Test");
    const c = wageCase("c4", date, 11, 1000);
    await investigateCase("construction", c.id);
    decideProposal(BOSS(), c.id, "reject");
    expect(getCase(SYSTEM(), c.id).status).toBe("open");
    expect(getReport(c.id)!.proposal.status).toBe("rejected");
    expect(() => decideProposal(BOSS(), c.id, "accept")).toThrow(/already rejected/);
  });
});

describe("model output is untrusted", () => {
  const run = async (text: string) => {
    setProvider(async () => ({ ok: true, text }));
    const date = freshDay();
    addShift("construction", "c1", date, "07:00", "18:00", "Test");
    return (await investigateCase("construction", wageCase("c1", date).id))!;
  };

  it("uses a well-formed, grounded model explanation and labels it as model output", async () => {
    const r = await run("You worked 11 hours. Overtime counts double, so you should have received ₹1260 and received ₹720.");
    expect(r.sources["wage-analysis"]).toBe("model");
  });

  it("discards a model explanation containing an amount the calculation did not produce", async () => {
    const r = await run("You are owed ₹99999.");
    expect(r.sources["wage-analysis"]).toBe("rules");
    expect(r.explanation).not.toContain("99999");
    expect(r.proposal.amount).toBe(540);
  });

  it("discards text that claims a decision was made", async () => {
    const r = await run("Your claim has been approved and ₹540 was paid.");
    expect(r.sources["wage-analysis"]).toBe("rules");
  });

  it.each([
    ["timeout", async () => ({ ok: false as const, reason: "timeout" as const })],
    ["rate limit", async () => ({ ok: false as const, reason: "rate-limited" as const })],
    ["thrown error", async () => { throw new Error("boom"); }],
  ])("a %s does not break the investigation", async (_n, provider) => {
    setProvider(provider);
    const date = freshDay();
    addShift("construction", "c1", date, "07:00", "18:00", "Test");
    const r = await investigateCase("construction", wageCase("c1", date).id);
    expect(r!.proposal.action).toBe("resolve_backpay");
    expect(r!.sources["wage-analysis"]).toBe("rules");
  });
});

describe("safety triage", () => {
  const safety = (severity: "low" | "critical", description: string) =>
    createCase({ type: "safety", industry: "construction", workerId: "c2", category: "fall", location: "Scaffolding", severity, description });

  it("a model cannot lower urgency below the rule-based floor", async () => {
    setProvider(async () => ({ ok: true, text: '{"urgency":"low","missingInfo":["Which floor?"]}' }));
    const c = safety("critical", "Plank on the scaffolding broke this morning and a mate fell");
    const r = (await investigateCase("construction", c.id))!;
    expect(r.urgency).toBe("urgent");
    expect(r.missingInfo).toContain("Which floor?");
  });

  it("a model may raise urgency", async () => {
    setProvider(async () => ({ ok: true, text: '{"urgency":"urgent","missingInfo":[]}' }));
    const r = (await investigateCase("construction", safety("low", "Loose railing on the second floor, noticed this morning, nobody hurt").id))!;
    expect(r.urgency).toBe("urgent");
  });

  it("falls back to rules on malformed model JSON, and still escalates serious wording", async () => {
    setProvider(async () => ({ ok: true, text: "sure! urgency: low" }));
    const r = (await investigateCase("construction", safety("low", "A worker is trapped under a fallen beam near the scaffold").id))!;
    expect(r.sources["safety-triage"]).toBe("rules");
    expect(r.urgency).toBe("urgent");
    expect(r.proposal.action).toBe("start_review");
  });

  it("asks for missing information", async () => {
    const r = (await investigateCase("construction", safety("low", "ladder is bad").id))!;
    expect(r.missingInfo.length).toBeGreaterThan(0);
  });
});

describe("tool permissions", () => {
  it("a worker cannot read another worker's case, and other organisations cannot see it either", () => {
    const c = createCase({ type: "wage", industry: "construction", workerId: "c1", date: freshDay(), hoursWorked: 9, amountPaid: 100 });
    expect(() => getCase({ industry: "construction", actor: workerActor("c2") }, c.id)).toThrow("Case not found");
    expect(() => getCase(SYSTEM("college"), c.id)).toThrow("Case not found");
    expect(getCase({ industry: "construction", actor: workerActor("c1") }, c.id).id).toBe(c.id);
  });

  it("a worker cannot propose case actions", () => {
    const c = wageCase("c1", freshDay(), 9, 100);
    expect(() => proposeAction({ industry: "construction", actor: workerActor("c1") }, c.id, { action: "start_review", reason: "x" })).toThrow(/cannot propose/);
  });

  it("rejects back-pay above the calculated shortfall and actions that do not fit the case type", () => {
    const c = wageCase("c1", freshDay(), 11, 720);
    expect(() => proposeAction(SYSTEM(), c.id, { action: "resolve_backpay", amount: 541, reason: "x" })).toThrow(/shortfall/);
    expect(() => proposeAction(SYSTEM(), c.id, { action: "resolve_backpay", reason: "x" })).toThrow();
    const s = createCase({ type: "safety", industry: "construction", workerId: "c1", category: "fall", location: "Scaffolding", severity: "low", description: "Loose plank near edge" });
    expect(() => proposeAction(SYSTEM(), s.id, { action: "resolve_backpay", amount: 10, reason: "x" })).toThrow(/not allowed/);
  });

  it("only an employer can accept a proposal", async () => {
    const date = freshDay();
    addShift("construction", "c1", date, "07:00", "18:00", "Test");
    const c = wageCase("c1", date);
    await investigateCase("construction", c.id);
    expect(() => decideProposal({ industry: "construction", actor: workerActor("c1") }, c.id, "accept")).toThrow(/authorised employer/);
    expect(() => decideProposal(SYSTEM(), c.id, "accept")).toThrow(/authorised employer/);
    expect(() => decideProposal(BOSS("college"), c.id, "accept")).toThrow("Case not found");
    expect(getCase(SYSTEM(), c.id).status).toBe("open");
  });

  it("cannot bypass the lifecycle: a proposal cannot reopen or overwrite a case the employer already closed", async () => {
    const date = freshDay();
    addShift("construction", "c1", date, "07:00", "18:00", "Test");
    const c = wageCase("c1", date);
    await investigateCase("construction", c.id);
    actOnCase(c.id, { action: "reject", reviewer: "Boss", note: "Handled manually" });
    expect(currentReport(SYSTEM(), c.id)!.proposal.status).toBe("superseded");
    expect(() => decideProposal(BOSS(), c.id, "accept")).toThrow(/closed/);
    expect(getCase(SYSTEM(), c.id).status).toBe("rejected");
  });

  it("a worker's feed contains only events about their own records", async () => {
    const c = wageCase("c3", freshDay(), 9, 100);
    await investigateCase("construction", c.id);
    expect(eventsFor("construction", { employer: false, workerId: "c3" }).some((e) => e.recordId === c.id)).toBe(true);
    expect(eventsFor("construction", { employer: false, workerId: "c4" }).some((e) => e.recordId === c.id)).toBe(false);
    expect(eventsFor("construction", { employer: false })).toEqual([]);
    // workers never receive the internal worker link; employers do (the simulation maps it to a character)
    for (const e of eventsFor("construction", { employer: false, workerId: "c3" })) expect(e).not.toHaveProperty("workerId");
    expect(eventsFor("construction", { employer: true }).some((e) => e.workerId === "c3")).toBe(true);
  });

  it("agent events reach the simulation as confidential, agent-sourced events tied to the right worker", async () => {
    const c = wageCase("c3", freshDay(), 9, 100);
    await investigateCase("construction", c.id);
    const evs = adaptAgentEvents(eventsFor("construction", { employer: true }, 200).filter((e) => e.recordId === c.id), "construction");
    expect(evs.length).toBeGreaterThan(3);
    for (const e of evs) expect(e).toMatchObject({ source: "agent", confidential: true, characterId: "c3", industry: "construction" });
    expect(evs.some((e) => e.type === "wage.review-required")).toBe(true);
    expect(adaptAgentEvents(eventsFor("construction", { employer: true }, 200), "college")).toEqual([]);
  });
});

describe("workload (excessive hours) flow", () => {
  it("flags a breach once, proposes a policy response, and needs an employer decision", () => {
    const d = freshDay();
    addShift("construction", "c4", d, "05:00", "20:00", "Test"); // 15h
    const made = scanWorkload("construction", "c4");
    const flag = made.find((f) => f.rule === "daily")!;
    expect(flag).toBeDefined();
    expect(flag.status).toBe("pending");
    expect(flag.proposedResponse).toMatch(/Release the worker/); // from the persona's fixed policy list
    expect(scanWorkload("construction", "c4")).toEqual([]); // idempotent
    expect(() => decideFlag({ industry: "construction", actor: workerActor("c4") }, flag.id, "accept")).toThrow(/authorised employer/);
    expect(decideFlag(BOSS(), flag.id, "accept").status).toBe("accepted");
    expect(() => decideFlag(BOSS(), flag.id, "reject")).toThrow(/already/);
    expect(flagsFor("construction").some((f) => f.id === flag.id)).toBe(true);
  });
});

describe("voice (Vapi) tool webhook", () => {
  const call = (name: string, args: Record<string, unknown>) =>
    handleVapiMessage({ type: "tool-calls", toolCallList: [{ id: "t1", type: "function", function: { name, arguments: args } }] });

  it("session tokens are signed, expire, and cannot be forged", () => {
    const t = mintSessionToken("construction", "c1");
    expect(verifySessionToken(t)?.actor).toEqual({ role: "worker", workerId: "c1" });
    expect(verifySessionToken(t, Date.now() + 31 * 60_000)).toBeNull();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ i: "construction", w: "c2", e: Date.now() + 1e6 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`)).toBeNull();
    expect(verifySessionToken(`${body}.x${sig}`)).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
  });

  it("webhook auth needs the shared secret", () => {
    const prev = process.env.VAPI_WEBHOOK_SECRET;
    delete process.env.VAPI_WEBHOOK_SECRET;
    expect(vapiAuthorised(new Request("http://x", { headers: { "x-vapi-secret": "s" } }))).toBe(false);
    process.env.VAPI_WEBHOOK_SECRET = "s3cret";
    expect(vapiAuthorised(new Request("http://x", { headers: { "x-vapi-secret": "s3cret" } }))).toBe(true);
    expect(vapiAuthorised(new Request("http://x", { headers: { "x-vapi-secret": "nope" } }))).toBe(false);
    expect(vapiAuthorised(new Request("http://x"))).toBe(false);
    if (prev === undefined) delete process.env.VAPI_WEBHOOK_SECRET; else process.env.VAPI_WEBHOOK_SECRET = prev;
  });

  it("rejects calls without a valid session and unknown tools", async () => {
    expect((await call("get_case_status", {})).results[0].error).toMatch(/expired/);
    expect((await call("get_case_status", { sessionToken: "junk" })).results[0].error).toMatch(/expired/);
    expect((await call("delete_everything", { sessionToken: mintSessionToken("construction", "c1") })).results[0].error).toBe("Unknown tool");
  });

  it("case status is limited to the session's own worker", async () => {
    const mine = wageCase("c1", freshDay(), 9, 100);
    const other = wageCase("c2", freshDay(), 9, 100);
    const out = (await call("get_case_status", { sessionToken: mintSessionToken("construction", "c1") })).results[0].result!;
    expect(out).toContain(mine.id);
    expect(out).not.toContain(other.id);
  });

  it("files a safety report through the normal case lifecycle and validates the arguments", async () => {
    const sessionToken = mintSessionToken("construction", "c3");
    const bad = await call("report_safety_issue", { sessionToken, category: "nonsense", location: "Scaffolding", severity: "high", description: "Loose plank on the edge" });
    expect(bad.results[0].error).toMatch(/category/i);
    const ok = await call("report_safety_issue", { sessionToken, category: "fall", location: "Scaffolding", severity: "high", description: "Loose plank on the edge of level two" });
    const id = /FS-\d+/.exec(ok.results[0].result!)![0];
    expect(getCase(SYSTEM(), id)).toMatchObject({ type: "safety", workerId: "c3", status: "open" });
  });

  it("explains a payslip from deterministic data and records a confidential grievance", async () => {
    const sessionToken = mintSessionToken("construction", "c1");
    expect((await call("explain_payslip", { sessionToken })).results[0].result).toMatch(/Net ₹|nothing to calculate/);
    const g = await call("raise_grievance", { sessionToken, category: "management", description: "My supervisor keeps shouting at me in front of others" });
    expect(g.results[0].result).toMatch(/reference fb/);
    expect(g.results[0].result).not.toMatch(/Murugan/);
  });
});

describe("validation helpers", () => {
  it("parses fenced JSON and rejects non-objects", () => {
    expect(parseJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseJsonObject("[1]")).toBeNull();
    expect(parseJsonObject("nope")).toBeNull();
  });
  it("money guard allows only known amounts", () => {
    expect(moneyIsGrounded("Paid ₹720 of ₹1,260", [720, 1260])).toBe(true);
    expect(moneyIsGrounded("You get ₹5000", [720])).toBe(false);
    expect(moneyIsGrounded("No amounts here", [])).toBe(true);
  });
  it("does not mistake words ending in \"rs\" or \"inr\" for a currency symbol", () => {
    expect(rupeeAmounts("You worked 11 hours, so expected pay is ₹1,260.")).toEqual([1260]);
    expect(rupeeAmounts("Rs 500 and Rs.250.50 and INR 10 and ₹7")).toEqual([500, 250.5, 10, 7]);
    expect(rupeeAmounts("workers, 3 hours, 5 days")).toEqual([]);
  });
  it("detects decision claims", () => {
    expect(claimsDecision("Your claim has been approved")).toBe(true);
    expect(claimsDecision("A reviewer will decide")).toBe(false);
  });
});

describe("HTTP model provider (against a local OpenAI-compatible server)", () => {
  type Handler = (req: IncomingMessage, res: ServerResponse) => void;
  async function withServer(handler: Handler, fn: (base: string) => Promise<void>) {
    const srv = createServer(handler);
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}/v1`;
    const saved = { b: process.env.AI_BASE_URL, k: process.env.AI_API_KEY, m: process.env.AI_MODEL };
    Object.assign(process.env, { AI_BASE_URL: base, AI_API_KEY: "test-key", AI_MODEL: "test-model" });
    setProvider(); // the real HTTP provider
    try { await fn(base); } finally {
      for (const [k, v] of [["AI_BASE_URL", saved.b], ["AI_API_KEY", saved.k], ["AI_MODEL", saved.m]] as const) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
      }
      await new Promise((r) => srv.close(r));
    }
  }
  const ok = (content: string): Handler => (req, res) => {
    let body = "";
    req.on("data", (d) => (body += d)).on("end", () => {
      expect(req.headers.authorization).toBe("Bearer test-key");
      expect(JSON.parse(body).model).toBe("test-model");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  };

  it("returns the model text and sends the key only in the Authorization header", async () => {
    await withServer(ok("hello"), async () => {
      expect(await complete({ system: "s", user: "u" })).toEqual({ ok: true, text: "hello" });
    });
  });

  it("maps 429, 500, timeouts and malformed bodies to a failure instead of throwing", async () => {
    await withServer((_q, r) => { r.statusCode = 429; r.end(); }, async () => {
      expect(await complete({ system: "s", user: "u" })).toEqual({ ok: false, reason: "rate-limited" });
    });
    await withServer((_q, r) => { r.statusCode = 500; r.end("x"); }, async () => {
      expect(await complete({ system: "s", user: "u" })).toEqual({ ok: false, reason: "http-error" });
    });
    await withServer(() => { /* never answers */ }, async () => {
      expect(await complete({ system: "s", user: "u", timeoutMs: 100 })).toEqual({ ok: false, reason: "timeout" });
    });
    await withServer((_q, r) => { r.end("not json"); }, async () => {
      expect((await complete({ system: "s", user: "u" })).ok).toBe(false);
    });
  });

  it("an investigation through the real provider uses the validated model text and labels it", async () => {
    const date = freshDay();
    addShift("construction", "c1", date, "07:00", "18:00", "Test");
    await withServer(ok("You worked 11 hours, so expected pay is ₹1260 and you received ₹720."), async () => {
      const r = await investigateCase("construction", wageCase("c1", date).id);
      expect(r!.sources["wage-analysis"]).toBe("model");
      expect(r!.proposal.amount).toBe(540);
    });
  });

  it("no configuration means not-configured, never a network call", async () => {
    setProvider();
    const saved = process.env.AI_BASE_URL; delete process.env.AI_BASE_URL;
    expect(await complete({ system: "s", user: "u" })).toEqual({ ok: false, reason: "not-configured" });
    if (saved !== undefined) process.env.AI_BASE_URL = saved;
  });
});
