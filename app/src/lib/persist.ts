import { exportState, importState } from "./store";

// Optional durable backing for the in-memory store, so state survives restarts and is shared across
// serverless instances. Enabled only when SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and
// SUPABASE_SERVICE_ROLE_KEY are set; otherwise every function here is a no-op and the store stays in memory.
// The service role key is server-only: this module is imported by API routes, never by client code.
//
// Model: one jsonb row (table fairshift_state, migration 0003). `hydrate` runs before a request and loads
// the row only when its version differs from what this instance last saw; `persist` runs after a request
// that changed state and writes version + 1. Concurrent writers on different instances are last-write-wins;
// that is acceptable for a demo and is the reason a per-record schema (0001) is the production path.

const ROW = "main";
const TIMEOUT_MS = 4_000;

interface Link { url: string; key: string }
const link = (): Link | null => {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
};

const g = globalThis as unknown as { __fairshiftPersist?: { version: number; last: string; ready: boolean } };
const mem = (g.__fairshiftPersist ??= { version: -1, last: "", ready: false });

export const persistenceEnabled = () => link() !== null;

async function rest(l: Link, path: string, init: RequestInit = {}) {
  const r = await fetch(`${l.url}/rest/v1/fairshift_state${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { apikey: l.key, Authorization: `Bearer ${l.key}`, "content-type": "application/json", ...init.headers },
  });
  if (!r.ok) throw new Error(`persistence ${r.status}`);
  return r;
}

/** Load the shared row when another instance (or a restart) changed it. Never throws: on failure the local state is used. */
export async function hydrate(): Promise<void> {
  const l = link();
  if (!l) return;
  try {
    const head = (await (await rest(l, `?id=eq.${ROW}&select=version`)).json()) as { version: number }[];
    if (!head.length) { mem.ready = true; return; } // nothing stored yet; the first persist creates the row
    const version = Number(head[0].version);
    if (mem.ready && version === mem.version) return;
    const full = (await (await rest(l, `?id=eq.${ROW}&select=version,data`)).json()) as { version: number; data: unknown }[];
    if (!full.length) return;
    importState(full[0].data);
    mem.version = Number(full[0].version);
    mem.last = exportState();
    mem.ready = true;
  } catch (e) {
    console.warn("persistence: hydrate failed, using in-memory state", e instanceof Error ? e.message : e);
  }
}

/** Save the state if it changed since the last load or save. Never throws. */
export async function persist(): Promise<void> {
  const l = link();
  if (!l) return;
  const body = exportState();
  if (body === mem.last) return;
  try {
    const version = Math.max(mem.version, 0) + 1;
    await rest(l, "?on_conflict=id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ id: ROW, version, data: JSON.parse(body), updated_at: new Date().toISOString() }),
    });
    mem.version = version;
    mem.last = body;
    mem.ready = true;
  } catch (e) {
    console.warn("persistence: save failed, change is kept in memory only", e instanceof Error ? e.message : e);
  }
}

/** Test hook: forget what this process knows about the remote row. */
export function resetPersistenceCache() {
  mem.version = -1; mem.last = ""; mem.ready = false;
}
