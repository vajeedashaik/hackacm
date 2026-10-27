"use client";

import { useEffect, useRef, useState } from "react";
import { useFair, useT } from "@/lib/client";
import { Notice } from "@/components/ui";
import { Panel, Tabs } from "@/components/common";
import { EventFeed } from "@/components/EventFeed";
import { AgentFeed } from "@/components/agents/AgentFeed";
import { WorkloadSuggestions } from "@/components/agents/WorkloadSuggestions";
import { Overview, useAttention, type EmployerTab } from "@/components/employer/Overview";
import { CaseQueue } from "@/components/employer/CaseQueue";
import { AttendancePanel } from "@/components/employer/AttendancePanel";
import { AlertsPanel, AuditPanel, ConfigPanel, FeedbackPanel, SkillsPanel } from "@/components/employer/Panels";

export default function EmployerPage() {
  const { cfg, snap, pin, unlock, lock } = useFair();
  const t = useT();
  const [tab, setTab] = useState<EmployerTab>("overview");
  const [reviewer, setReviewer] = useState("");
  const [input, setInput] = useState("");
  const [bad, setBad] = useState(false);
  const [checking, setChecking] = useState(false);
  const [toast, setToast] = useState("");
  const att = useAttention();
  const seen = useRef<Set<string> | null>(null);

  const unlocked = Boolean(pin) && snap?.employer === true;
  const who = cfg.reviewers.includes(reviewer) ? reviewer : cfg.reviewers[0];

  // announce cases that arrive while this dashboard is open (screen-reader friendly live region)
  useEffect(() => {
    if (!snap?.employer) return;
    const ids = new Set(snap.cases.map((c) => c.id));
    if (seen.current) {
      const fresh = snap.cases.filter((c) => !seen.current!.has(c.id));
      if (fresh.length) {
        const c = fresh[0];
        queueMicrotask(() => setToast(t("new_case_toast", { id: c.id, type: t(`ty_${c.type}`), priority: t(`pr_${c.priority}`) })));
      }
    }
    seen.current = ids;
  }, [snap, t]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setBad(!(await unlock(input)));
    setChecking(false);
    setInput("");
  }

  if (!unlocked) {
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">{t("employer")} — {cfg.site}</h1>
        <form onSubmit={submit} className="card space-y-3">
          <label htmlFor="pin" className="block font-semibold">{t("pin_label")}</label>
          <input id="pin" type="password" className="field" autoComplete="off" required value={input} onChange={(e) => setInput(e.target.value)} />
          <p className="text-sm text-muted">{t("pin_hint")}</p>
          <button className="btn btn-primary" disabled={checking}>{checking ? t("checking") : t("unlock")}</button>
          {bad && <Notice tone="error">{t("pin_bad")}</Notice>}
        </form>
      </div>
    );
  }

  const tabs: { id: EmployerTab; label: string; badge?: number }[] = [
    { id: "overview", label: t("tab_overview") },
    { id: "cases", label: t("cases"), badge: att.active.length },
    { id: "attendance", label: t("tab_attendance") },
    { id: "alerts", label: t("tab_alerts"), badge: att.alerts.length },
    { id: "feedback", label: t("tab_feedback"), badge: att.newFeedback.length },
    { id: "skills", label: t("tab_skills"), badge: att.skillQueue.length },
    { id: "config", label: t("tab_config") },
    { id: "audit", label: t("tab_audit") },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-2xl font-bold">{t("employer")} — {cfg.site}</h1>
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="reviewer" className="block text-sm font-semibold">{t("acting_as")}</label>
              <select id="reviewer" className="field" value={who} onChange={(e) => setReviewer(e.target.value)}>
                {cfg.reviewers.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <button className="btn" onClick={lock}>{t("lock")}</button>
          </div>
        </div>
        <p role="status" className="sr-only">{toast}</p>
        {toast && <Notice tone="info">🔔 {toast}</Notice>}

        <Tabs label={t("employer")} value={tab} onChange={(id) => setTab(id as EmployerTab)} tabs={tabs} />
        <Panel id={tab}>
          {tab === "overview" && <Overview go={setTab} />}
          {tab === "cases" && <CaseQueue reviewer={who} />}
          {tab === "attendance" && <AttendancePanel reviewer={who} />}
          {tab === "alerts" && <><AlertsPanel /><WorkloadSuggestions reviewer={who} /></>}
          {tab === "feedback" && <FeedbackPanel reviewer={who} />}
          {tab === "skills" && <SkillsPanel reviewer={who} />}
          {tab === "config" && <ConfigPanel />}
          {tab === "audit" && <AuditPanel />}
        </Panel>
      </div>
      <div className="h-fit space-y-4">
        <EventFeed />
        <AgentFeed />
      </div>
    </div>
  );
}
