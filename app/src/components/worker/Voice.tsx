"use client";

import { useFair, useT } from "@/lib/client";

// Entry point for Vapi voice help. The live call itself is wired by the AI/voice phase: it listens
// for the "fairshift:voice-start" event below. Until the public key and assistant id are
// configured, this card says so and every task stays available as text.
const CONFIGURED = Boolean(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY && process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID);

export function Voice() {
  const { workerId, lang } = useFair();
  const t = useT();
  return (
    <section className="card flex flex-wrap items-center gap-3" aria-labelledby="voice-h">
      <div className="min-w-56 flex-1">
        <h2 id="voice-h" className="font-bold">🎙 {t("voice_title")}</h2>
        <p className="text-sm text-muted">{CONFIGURED ? t("voice_ready") : t("voice_off")}</p>
      </div>
      <button className="btn" disabled={!CONFIGURED}
        onClick={() => window.dispatchEvent(new CustomEvent("fairshift:voice-start", { detail: { workerId, lang } }))}>
        {t("voice_start")}
      </button>
    </section>
  );
}
