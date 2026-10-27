import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { INDUSTRIES } from "./industries";
import { hydrate, persist, persistenceEnabled, resetPersistenceCache } from "./persist";
import { createCase, exportState, importState, snapshot } from "./store";

// A tiny stand-in for Supabase's PostgREST endpoint: one table, one row, upsert and select.
let server: Server;
let row: { id: string; version: number; data: unknown } | null = null;
let calls: string[] = [];
let failing = false;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push(`${req.method} ${req.url}`);
      const ok = req.headers.apikey === "test-key" && req.headers.authorization === "Bearer test-key";
      if (failing || !ok) { res.writeHead(failing ? 500 : 401).end("{}"); return; }
      res.setHeader("content-type", "application/json");
      if (req.method === "POST") { row = JSON.parse(body); res.writeHead(201).end(); return; }
      const wantsData = String(req.url).includes("data");
      res.writeHead(200).end(JSON.stringify(row ? [wantsData ? row : { version: row.version }] : []));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
});
afterAll(() => {
  server.close();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});
beforeEach(() => { calls = []; failing = false; resetPersistenceCache(); });

const w = INDUSTRIES.construction.workers[0];
const wage = (date: string) => createCase({ type: "wage", industry: "construction", workerId: w.id, date, hoursWorked: 10, amountPaid: 500 });

describe("durable state layer", () => {
  it("is off without credentials", () => {
    const keep = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(persistenceEnabled()).toBe(false);
    process.env.SUPABASE_SERVICE_ROLE_KEY = keep;
    expect(persistenceEnabled()).toBe(true);
  });

  it("saves a change, and a fresh process loads it back", async () => {
    const c = wage("2025-04-01");
    await persist();
    expect(row?.version).toBe(1);
    const saved = exportState();

    // simulate a cold instance: empty local state, then hydrate from the stored row
    importState({ attendance: [], cases: [], audit: [], events: [], feedback: [], skills: [], payroll: [], evidence: {}, alertKeys: [], seq: 0, caseSeq: 0 });
    expect(snapshot("construction", { employer: true }).cases.some((x) => x.id === c.id)).toBe(false);
    resetPersistenceCache();
    await hydrate();
    expect(snapshot("construction", { employer: true }).cases.some((x) => x.id === c.id)).toBe(true);
    expect(exportState()).toBe(saved);
  });

  it("skips the write when nothing changed and the read when the version is unchanged", async () => {
    wage("2025-04-02");
    await persist();
    calls = [];
    await persist();
    expect(calls).toEqual([]);
    await hydrate(); // first hydrate after a reset reads the version, then the row
    calls = [];
    await hydrate();
    expect(calls).toHaveLength(1); // version probe only
  });

  it("keeps working in memory when the backend fails", async () => {
    failing = true;
    wage("2025-04-03");
    await expect(persist()).resolves.toBeUndefined();
    await expect(hydrate()).resolves.toBeUndefined();
  });

  it("does not send the key to a backend that rejects it", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "wrong";
    wage("2025-04-04");
    await expect(persist()).resolves.toBeUndefined();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
  });

  it("rejects a stored row with the wrong shape instead of corrupting the store", () => {
    const before = exportState();
    expect(() => importState({ cases: "nope" })).toThrow(/unexpected shape/);
    expect(() => importState(null)).toThrow();
    expect(exportState()).toBe(before);
  });
});
