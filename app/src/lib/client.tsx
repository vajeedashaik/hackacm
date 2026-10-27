"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { INDUSTRIES } from "./industries";
import { S, type StrKey } from "./i18n";
import type { IndustryConfig, IndustryId, Snapshot } from "./types";

export type Lang = "en" | "ta";

interface Ctx {
  industry: IndustryId;
  setIndustry: (i: IndustryId) => void;
  cfg: IndustryConfig;
  lang: Lang;
  setLang: (l: Lang) => void;
  snap: Snapshot | null;
  /** false when the last poll of /api/state failed (server down or browser offline) */
  online: boolean;
  refresh: () => Promise<void>;
  /** the worker whose data this browser asks for (workers are not authenticated in the demo) */
  workerId: string;
  setWorkerId: (id: string) => void;
  /** employer PIN, kept for this tab only; empty when locked */
  pin: string;
  /** returns true when the PIN is accepted */
  unlock: (pin: string) => Promise<boolean>;
  lock: () => void;
  /** JSON call to the API; sends the PIN when unlocked, refreshes shared state afterwards, throws on error */
  call: <T = unknown>(method: "POST" | "PATCH", url: string, body: unknown) => Promise<T>;
}

const C = createContext<Ctx | null>(null);

export function useFair() {
  const v = useContext(C);
  if (!v) throw new Error("FairProvider missing");
  return v;
}

const store = {
  get: (s: Storage, k: string) => { try { return s.getItem(k); } catch { return null; } },
  set: (s: Storage, k: string, v: string) => { try { if (v) s.setItem(k, v); else s.removeItem(k); } catch {} },
};

export function FairProvider({ children }: { children: ReactNode }) {
  const [industry, setIndustryState] = useState<IndustryId>("construction");
  const [lang, setLangState] = useState<Lang>("en");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [online, setOnline] = useState(true);
  const [workerId, setWorkerIdState] = useState("");
  const [pin, setPin] = useState("");

  // restore preferences after mount (avoids hydration mismatch)
  useEffect(() => {
    queueMicrotask(() => {
      const i = store.get(localStorage, "fs-industry") as IndustryId | null;
      const l = store.get(localStorage, "fs-lang") as Lang | null;
      if (i && i in INDUSTRIES) setIndustryState(i);
      if (l === "en" || l === "ta") setLangState(l);
      setWorkerIdState(store.get(localStorage, "fs-worker") ?? "");
      setPin(store.get(sessionStorage, "fs-pin") ?? "");
    });
  }, []);

  // Only the latest request for the current view may update state, so a slow
  // response for the previous industry can never overwrite the new one.
  const inflight = useRef<AbortController | null>(null);
  // ETag of the last full snapshot; an unchanged state comes back as a body-less 304.
  const etag = useRef<{ key: string; tag: string; clockAt: number } | null>(null);

  const refresh = useCallback(async () => {
    inflight.current?.abort();
    const ac = new AbortController();
    inflight.current = ac;
    try {
      const q = new URLSearchParams({ industry });
      if (workerId) q.set("workerId", workerId);
      const key = `${industry}|${workerId}|${pin}`;
      const known = etag.current?.key === key ? etag.current : null;
      const headers: Record<string, string> = pin ? { "x-employer-pin": pin } : {};
      if (known) headers["If-None-Match"] = known.tag;
      const r = await fetch(`/api/state?${q}`, { cache: "no-store", signal: ac.signal, headers });
      if (r.status === 304 && known) {
        if (ac.signal.aborted) return;
        setOnline(true);
        // data is unchanged; only refresh the server clock now and then so open shifts keep counting
        const now = Number(r.headers.get("x-server-now"));
        if (now && Date.now() - known.clockAt > 15_000) {
          known.clockAt = Date.now();
          setSnap((s) => (s ? { ...s, now } : s));
        }
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const data: Snapshot = await r.json();
      if (ac.signal.aborted) return;
      if (pin && !data.employer) { // stored PIN is no longer valid
        setPin("");
        store.set(sessionStorage, "fs-pin", "");
      }
      const tag = r.headers.get("etag");
      etag.current = tag ? { key, tag, clockAt: Date.now() } : null;
      setSnap(data);
      setOnline(true);
    } catch {
      if (!ac.signal.aborted) setOnline(false);
    }
  }, [industry, workerId, pin]);

  useEffect(() => {
    // poll the shared server state so every interface stays consistent
    const tick = () => { if (document.visibilityState === "visible") void refresh(); };
    tick();
    const t = setInterval(tick, 3000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
      inflight.current?.abort();
    };
  }, [refresh]);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setIndustry = (i: IndustryId) => {
    setSnap(null);
    etag.current = null; // nothing to revalidate against once the snapshot is cleared
    setIndustryState(i);
    store.set(localStorage, "fs-industry", i);
  };
  const setLang = (l: Lang) => {
    setLangState(l);
    store.set(localStorage, "fs-lang", l);
  };
  const setWorkerId = (id: string) => {
    setSnap(null);
    etag.current = null; // nothing to revalidate against once the snapshot is cleared
    setWorkerIdState(id);
    store.set(localStorage, "fs-worker", id);
  };

  const unlock = async (candidate: string) => {
    try {
      const r = await fetch(`/api/state?industry=${industry}`, { cache: "no-store", headers: { "x-employer-pin": candidate } });
      const data: Snapshot = await r.json();
      if (!r.ok || !data.employer) return false;
      setPin(candidate);
      store.set(sessionStorage, "fs-pin", candidate);
      return true;
    } catch {
      return false;
    }
  };
  const lock = () => {
    setPin("");
    store.set(sessionStorage, "fs-pin", "");
  };

  const call: Ctx["call"] = async (method, url, body) => {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...(pin ? { "x-employer-pin": pin } : {}) },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    await refresh();
    return j;
  };

  return (
    <C.Provider value={{
      industry, setIndustry, cfg: INDUSTRIES[industry], lang, setLang, snap, online, refresh,
      workerId, setWorkerId, pin, unlock, lock, call,
    }}>
      {children}
    </C.Provider>
  );
}

/** Translate a key; `{name}` placeholders are filled from vars. Falls back to English. */
export function useT() {
  const { lang } = useFair();
  return (k: StrKey, vars?: Record<string, string | number>) => {
    const entry = S[k];
    let s: string = entry[lang] || entry.en;
    if (vars) for (const [n, v] of Object.entries(vars)) s = s.replaceAll(`{${n}}`, String(v));
    return s;
  };
}

/** Pick the right language from a bilingual config label. */
export function useLabel() {
  const { lang } = useFair();
  return (b: { en: string; ta: string }) => b[lang];
}
