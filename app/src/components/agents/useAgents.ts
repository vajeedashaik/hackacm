"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useFair } from "@/lib/client";
import type { AgentEvent, CaseAgentReport, WorkloadFlag } from "@/lib/ai/types";

/** What a worker may see about their own case; employers get the full CaseAgentReport. */
export type WorkerReport = Pick<CaseAgentReport, "caseId" | "explanation" | "missingInfo" | "sources">;
export interface AgentsData {
  provider: { configured: boolean };
  voice: { configured: boolean; missing: string[] };
  employer: boolean;
  events: AgentEvent[];
  reports: (CaseAgentReport | WorkerReport)[];
  flags: WorkloadFlag[];
}

// One shared poll for every agent component on the page, ref-counted by subscribers.
let data: AgentsData | null = null;
let key = "";
let headers: Record<string, string> = {};
let url = "";
let timer: ReturnType<typeof setInterval> | undefined;
let inflight: AbortController | undefined;
const subs = new Set<() => void>();

export async function refreshAgents() {
  if (!url) return;
  inflight?.abort();
  const ac = (inflight = new AbortController());
  try {
    const r = await fetch(url, { cache: "no-store", headers, signal: ac.signal });
    if (!r.ok || ac.signal.aborted) return;
    data = await r.json();
    subs.forEach((f) => f());
  } catch { /* the main connection banner already reports being offline */ }
}

const subscribe = (f: () => void) => {
  subs.add(f);
  if (!timer) timer = setInterval(() => { if (document.visibilityState === "visible") void refreshAgents(); }, 3000);
  return () => {
    subs.delete(f);
    if (!subs.size && timer) { clearInterval(timer); timer = undefined; inflight?.abort(); }
  };
};

export function useAgents(): AgentsData | null {
  const { industry, workerId, pin } = useFair();
  useEffect(() => {
    const k = `${industry}|${workerId}|${pin}`;
    if (k === key) return;
    key = k;
    data = null;
    const q = new URLSearchParams({ industry });
    if (workerId) q.set("workerId", workerId);
    url = `/api/agents?${q}`;
    headers = pin ? { "x-employer-pin": pin } : {};
    void refreshAgents();
  }, [industry, workerId, pin]);
  return useSyncExternalStore(subscribe, () => data, () => null);
}
