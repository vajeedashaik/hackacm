"use client";

import { useState } from "react";
import { useFair, useT } from "@/lib/client";
import { Notice } from "@/components/ui";
import { Msg, useAction } from "@/components/common";
import type { FeedbackMode } from "@/lib/types";

const TOPICS = ["conditions", "pay", "safety", "management", "other"] as const;

export function Feedback() {
  const { cfg, workerId, call } = useFair();
  const t = useT();
  const [mode, setMode] = useState<FeedbackMode>("anonymous");
  const [category, setCategory] = useState("");
  const [text, setText] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const act = useAction();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let id = "";
    const ok = await act.run(async () => {
      const r = await call<{ id: string }>("POST", "/api/feedback", {
        industry: cfg.id, mode, category, text, workerId: mode === "confidential" ? workerId : undefined,
      });
      id = r.id;
    });
    if (ok) { setSent(id); setText(""); setCategory(""); }
  };

  return (
    <form onSubmit={submit} className="card space-y-3" aria-labelledby="fb-h">
      <h2 id="fb-h" className="text-lg font-bold">{t("feedback_title")}</h2>
      <p className="text-sm">{t("feedback_intro")}</p>

      <fieldset className="space-y-2">
        <legend className="font-semibold">{t("how_send")}</legend>
        {(["anonymous", "confidential"] as const).map((m) => (
          <label key={m} className={`block cursor-pointer rounded-lg border-2 p-3 ${mode === m ? "border-brand bg-teal-50" : "border-line"} has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-blue-600`}>
            <input type="radio" name="fb-mode" className="mr-2" checked={mode === m} onChange={() => setMode(m)} />
            <strong>{t(`fb_${m}`)}</strong>
            <span className="mt-1 block text-sm">{t(`fb_${m}_who`)}</span>
            <span className="mt-1 block text-sm text-muted">{t(`fb_${m}_limits`)}</span>
          </label>
        ))}
      </fieldset>

      <div>
        <label htmlFor="fb-topic" className="block font-semibold">{t("topic")}</label>
        <select id="fb-topic" className="field" required value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{t("select")}</option>
          {TOPICS.map((k) => <option key={k} value={k}>{t(`topic_${k}`)}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="fb-text" className="block font-semibold">{t("your_feedback")}</label>
        <textarea id="fb-text" className="field" required minLength={10} maxLength={1000} rows={4} value={text}
          onChange={(e) => setText(e.target.value)} aria-describedby="fb-text-h" />
        <p id="fb-text-h" className="text-sm text-muted">{t("fb_text_hint")}</p>
      </div>
      <button className="btn btn-primary" disabled={act.busy}>{act.busy ? t("sending") : t("send")}</button>
      <Msg msg={act.msg} />
      {sent && <Notice tone="success">{t(mode === "anonymous" ? "fb_sent_anon" : "fb_sent_conf", { id: sent })}</Notice>}
    </form>
  );
}
