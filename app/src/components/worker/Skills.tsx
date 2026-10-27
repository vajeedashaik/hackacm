"use client";

import { useState } from "react";
import { useFair, useT } from "@/lib/client";
import { EmptyState } from "@/components/ui";
import { Msg, useAction } from "@/components/common";
import type { SkillEntry, SkillKind, SkillStatus } from "@/lib/types";

const KINDS: SkillKind[] = ["skill", "training", "experience"];
const TONE: Record<SkillStatus, string> = {
  self_reported: "bg-[#efe7d4] text-ink",
  verification_requested: "bg-amber-100 text-warn",
  verified: "bg-green-100 text-good",
  declined: "bg-red-100 text-bad",
};

export function Skills() {
  const { cfg, snap, workerId, call } = useFair();
  const t = useT();
  const [kind, setKind] = useState<SkillKind>("skill");
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [year, setYear] = useState("");
  const addAct = useAction();
  const rowAct = useAction();

  const mine = (snap?.skills ?? []).filter((s) => s.workerId === workerId);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await addAct.run(
      () => call("POST", "/api/skills", { industry: cfg.id, workerId, kind, name, detail, year }),
      t("skill_added"),
    );
    if (ok) { setName(""); setDetail(""); setYear(""); }
  };
  const act = (s: SkillEntry, action: "request" | "remove") =>
    rowAct.run(() => call("PATCH", `/api/skills/${s.id}`, { action, workerId }), action === "request" ? t("verif_requested") : t("skill_removed"));

  return (
    <>
      <section className="card space-y-2" aria-labelledby="pass-h">
        <h2 id="pass-h" className="text-lg font-bold">{t("passport")}</h2>
        <p className="text-sm text-muted">{t("passport_help")}</p>
        <Msg msg={rowAct.msg} />
        {!snap ? <p className="text-muted">{t("loading")}</p> : mine.length === 0 ? (
          <EmptyState title={t("no_skills")} hint={t("no_skills_hint")} />
        ) : (
          KINDS.map((k) => {
            const items = mine.filter((s) => s.kind === k);
            if (!items.length) return null;
            return (
              <div key={k}>
                <h3 className="mt-2 font-semibold">{t(`kind_${k}`)}</h3>
                <ul className="divide-y divide-line">
                  {items.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                      <div className="min-w-48 flex-1">
                        <p className="font-semibold">{s.name}{s.year ? ` · ${s.year}` : ""}</p>
                        {s.detail && <p className="text-sm text-muted">{s.detail}</p>}
                      </div>
                      <span className={`pill ${TONE[s.status]}`}>
                        {s.status === "verified" ? t("sk_verified_by", { who: s.verifiedBy ?? "" }) : t(`sk_${s.status}`)}
                      </span>
                      {(s.status === "self_reported" || s.status === "declined") && (
                        <button className="btn !min-h-11 text-sm" disabled={rowAct.busy} onClick={() => act(s, "request")}>{t("request_verif")}</button>
                      )}
                      {s.status !== "verified" && (
                        <button className="btn !min-h-11 text-sm" disabled={rowAct.busy} onClick={() => act(s, "remove")}
                          aria-label={`${t("remove")} ${s.name}`}>{t("remove")}</button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>

      <form onSubmit={add} className="card space-y-3" aria-labelledby="addsk-h">
        <h2 id="addsk-h" className="text-lg font-bold">{t("add_entry")}</h2>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr_7rem]">
          <div>
            <label htmlFor="sk-kind" className="block font-semibold">{t("type")}</label>
            <select id="sk-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value as SkillKind)}>
              {KINDS.map((k) => <option key={k} value={k}>{t(`kind_${k}`)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="sk-name" className="block font-semibold">{t("name")}</label>
            <input id="sk-name" className="field" required maxLength={80} list="sk-suggest" value={name} onChange={(e) => setName(e.target.value)} />
            <datalist id="sk-suggest">{cfg.skillSuggestions.map((s) => <option key={s} value={s} />)}</datalist>
          </div>
          <div>
            <label htmlFor="sk-year" className="block font-semibold">{t("year")}</label>
            <input id="sk-year" className="field" type="number" min="1970" max={new Date().getFullYear()} value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
        </div>
        <div>
          <label htmlFor="sk-detail" className="block font-semibold">{t("details_opt")}</label>
          <input id="sk-detail" className="field" maxLength={200} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={addAct.busy}>{t("add")}</button>
        <Msg msg={addAct.msg} />
      </form>
    </>
  );
}
