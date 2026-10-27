"use client";

import { useState } from "react";
import { useFair } from "@/lib/client";
import { Msg, useAction } from "@/components/common";

const KIND: Record<string, string> = {
  wage: "a pay problem (use the Payslip tab)", safety: "a safety problem (use the Safety tab)",
  attendance: "an attendance problem (use the Shifts tab)", grievance: "a grievance (use the Feedback tab, confidential)",
  unclear: "something we could not place",
};

interface Draft { kind: string; draft: string; source: "model" | "rules" }

/** Worker Persona Agent: helps put a concern into words. It files nothing; the worker chooses where to send it. */
export function WorkerAssist() {
  const { industry, workerId, call } = useFair();
  const act = useAction();
  const [text, setText] = useState("");
  const [out, setOut] = useState<Draft | null>(null);

  return (
    <details className="card">
      <summary className="cursor-pointer font-semibold">Not sure how to say it? Get help writing it</summary>
      <form className="mt-2 space-y-2" onSubmit={async (e) => {
        e.preventDefault();
        await act.run(async () => setOut(await call<Draft>("POST", "/api/agents/assist", { industry, workerId, message: text })), "");
      }}>
        <label htmlFor="assist" className="block text-sm font-semibold">Tell us what happened, in your own words</label>
        <textarea id="assist" className="field" rows={3} maxLength={600} required minLength={5} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn" disabled={act.busy}>{act.busy ? "Working…" : "Help me write it"}</button>
        {act.msg && !act.msg.ok && <Msg msg={act.msg} />}
      </form>
      {out && (
        <div className="mt-3 space-y-1 rounded-lg bg-[#f7f4ea] p-2 text-sm" aria-live="polite">
          <p>This looks like {KIND[out.kind] ?? KIND.unclear}.</p>
          <p className="italic">“{out.draft}”</p>
          <p className="text-xs text-muted">
            {out.source === "model" ? "Reworded by an AI model; check it says what you mean." : "Your own words, unchanged (no AI model is available)."} Nothing has been sent.
          </p>
          <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(out.draft)}>Copy text</button>
        </div>
      )}
    </details>
  );
}
