"use client";

import { useEffect, useRef, useState } from "react";
import type Vapi from "@vapi-ai/web";
import { useFair } from "@/lib/client";
import { Notice } from "@/components/ui";

type Phase = "idle" | "connecting" | "live" | "unavailable" | "error";

/**
 * Starts a Vapi web call when the worker presses "Start voice help" (the Voice card dispatches
 * `fairshift:voice-start`). The server mints a short-lived session token that fixes which worker the
 * assistant's tools act for. NOT verified against a live Vapi account (no credentials were available).
 */
export function VoiceController() {
  const { industry, workerId, lang } = useFair();
  const [phase, setPhase] = useState<Phase>("idle");
  const [detail, setDetail] = useState("");
  const [lines, setLines] = useState<{ role: string; text: string }[]>([]);
  const vapi = useRef<Vapi | null>(null);

  useEffect(() => {
    const stop = () => { try { vapi.current?.stop(); } catch { /* already stopped */ } vapi.current = null; };
    const onStart = async () => {
      if (!workerId || vapi.current) return;
      setPhase("connecting"); setDetail(""); setLines([]);
      try {
        const r = await fetch("/api/voice/session", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ industry, workerId }),
        });
        const s = await r.json();
        if (!r.ok) throw new Error(s.error || "Could not start voice help");
        if (!s.configured) {
          setPhase("unavailable");
          setDetail(`Voice help is not set up on this server (missing: ${(s.missing as string[]).join(", ")}).`);
          return;
        }
        const { default: VapiSdk } = await import("@vapi-ai/web");
        const v = new VapiSdk(s.publicKey);
        vapi.current = v;
        v.on("call-start", () => setPhase("live"));
        v.on("call-end", () => { setPhase("idle"); vapi.current = null; });
        v.on("error", () => { setPhase("error"); setDetail("The voice call failed. Please use the forms instead."); stop(); });
        v.on("message", (m: { type?: string; transcriptType?: string; role?: string; transcript?: string }) => {
          if (m.type === "transcript" && m.transcriptType === "final" && m.transcript) {
            setLines((l) => [...l.slice(-19), { role: m.role === "assistant" ? "Assistant" : "You", text: m.transcript! }]);
          }
        });
        await v.start(s.assistantId, {
          variableValues: { sessionToken: s.sessionToken, language: lang === "ta" ? "Tamil" : "English" },
        });
      } catch (e) {
        setPhase("error");
        setDetail((e as Error).message || "Could not start voice help.");
        stop();
      }
    };
    const listener = () => void onStart();
    window.addEventListener("fairshift:voice-start", listener);
    return () => { window.removeEventListener("fairshift:voice-start", listener); stop(); };
  }, [industry, workerId, lang]);

  if (phase === "idle") return null;
  return (
    <section className="card space-y-2" aria-label="Voice call" aria-live="polite">
      {phase === "connecting" && <p>Connecting voice help…</p>}
      {phase === "live" && (
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">🎙 Voice call in progress</p>
          <button className="btn" onClick={() => { vapi.current?.stop(); }}>End call</button>
        </div>
      )}
      {(phase === "unavailable" || phase === "error") && <Notice tone={phase === "error" ? "error" : "warning"}>{detail}</Notice>}
      {(phase === "unavailable" || phase === "error") && (
        <button className="btn" onClick={() => setPhase("idle")}>Close</button>
      )}
      {lines.length > 0 && (
        <ul className="max-h-40 space-y-1 overflow-auto text-sm">
          {lines.map((l, i) => <li key={i}><strong>{l.role}:</strong> {l.text}</li>)}
        </ul>
      )}
      <p className="text-xs text-muted">Everything you can do by voice is also available in the forms and tabs on this page.</p>
    </section>
  );
}
