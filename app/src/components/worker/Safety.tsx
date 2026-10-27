"use client";

import { useState } from "react";
import { useFair, useLabel, useT } from "@/lib/client";
import { Notice } from "@/components/ui";
import { Msg, useAction } from "@/components/common";
import { EvidenceInput } from "@/components/EvidenceInput";
import type { UploadedFile } from "@/lib/store";
import type { Case, Severity } from "@/lib/types";

const SEVERITIES: Severity[] = ["low", "medium", "high", "critical"];

/** Shown without waiting for any AI or network response. */
export function UrgentGuidance() {
  const t = useT();
  return (
    <section className="urgent-box space-y-1" aria-labelledby="urgent-h">
      <h2 id="urgent-h" className="text-lg font-bold text-bad">{t("urgent_title")}</h2>
      <ol className="list-decimal pl-5">
        <li>{t("urgent_1")}</li>
        <li>{t("urgent_2")}</li>
        <li>{t("urgent_3")}</li>
      </ol>
      <p className="text-sm">{t("urgent_note")}</p>
    </section>
  );
}

export function Safety({ onFiled }: { onFiled: () => void }) {
  const { cfg, workerId, call } = useFair();
  const t = useT();
  const label = useLabel();
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [filed, setFiled] = useState<Case | null>(null);
  const act = useAction();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let created: Case | null = null;
    const ok = await act.run(async () => {
      created = await call<Case>("POST", "/api/cases", {
        type: "safety", industry: cfg.id, workerId, category, location, severity, description, evidence: files,
      });
    });
    if (ok) {
      setFiled(created);
      setCategory(""); setLocation(""); setSeverity(""); setDescription(""); setFiles([]);
      onFiled();
    }
  };

  return (
    <>
      <UrgentGuidance />
      <form onSubmit={submit} className="card space-y-3" aria-labelledby="safety-h">
        <h2 id="safety-h" className="text-lg font-bold">{t("safety_report")}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="s-cat" className="block font-semibold">{t("category")}</label>
            <select id="s-cat" className="field" required value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t("select")}</option>
              {cfg.safetyCategories.map((c) => <option key={c.id} value={c.id}>{label(c.label)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="s-loc" className="block font-semibold">{t("work_area")}</label>
            <select id="s-loc" className="field" required value={location} onChange={(e) => setLocation(e.target.value)}>
              <option value="">{t("select")}</option>
              {cfg.zones.map((z) => <option key={z.name} value={z.name}>{z.name}</option>)}
              <option value="Other">{t("other_area")}</option>
            </select>
          </div>
        </div>
        <fieldset>
          <legend className="font-semibold">{t("severity")}</legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {SEVERITIES.map((s) => (
              <label key={s} className="btn cursor-pointer has-[:checked]:bg-brand has-[:checked]:text-white has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-blue-600">
                <input type="radio" name="severity" className="sr-only" required value={s} checked={severity === s} onChange={() => setSeverity(s)} />
                {t(`sev_${s}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {(severity === "high" || severity === "critical") && (
          <Notice tone="error">{t("urgent_severity")}</Notice>
        )}
        <div>
          <label htmlFor="s-desc" className="block font-semibold">{t("what_happened")}</label>
          <textarea id="s-desc" className="field" required minLength={10} maxLength={1000} rows={4}
            value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <EvidenceInput files={files} onChange={setFiles} />
        <button className="btn btn-primary" disabled={act.busy}>{act.busy ? t("sending") : t("submit")}</button>
        <Msg msg={act.msg} />
        {filed && <Notice tone="success">{t("safety_filed", { id: filed.id, priority: t(`pr_${filed.priority}`) })}</Notice>}
      </form>
    </>
  );
}
