"use client";

import { useState } from "react";
import { useFair, useT } from "@/lib/client";
import { fatigueAlerts } from "@/lib/calc";
import { Panel, Tabs } from "@/components/common";
import { EventFeed } from "@/components/EventFeed";
import { AgentFeed } from "@/components/agents/AgentFeed";
import { VoiceController } from "@/components/agents/VoiceController";
import { WorkerAssist } from "@/components/agents/WorkerAssist";
import { Shifts } from "@/components/worker/Shifts";
import { Payslip } from "@/components/worker/Payslip";
import { Safety, UrgentGuidance } from "@/components/worker/Safety";
import { Cases } from "@/components/worker/Cases";
import { Feedback } from "@/components/worker/Feedback";
import { Skills } from "@/components/worker/Skills";
import { Fatigue } from "@/components/worker/Fatigue";
import { Voice } from "@/components/worker/Voice";

type TabId = "shifts" | "payslip" | "safety" | "cases" | "feedback" | "skills" | "rest";

export default function WorkerPage() {
  const { cfg, snap, workerId, setWorkerId } = useFair();
  const t = useT();
  const [tab, setTab] = useState<TabId>("shifts");

  const wid = cfg.workers.some((w) => w.id === workerId) ? workerId : "";
  const worker = cfg.workers.find((w) => w.id === wid);
  const alerts = wid ? fatigueAlerts(cfg, snap?.attendance ?? [], wid, snap?.now ?? 0).length : 0;
  const active = (snap?.cases ?? []).filter((c) => c.workerId === wid && (c.status === "open" || c.status === "in_review")).length;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <h1 className="text-2xl font-bold">{t("worker")} — {cfg.site}</h1>

        <section className="card">
          <label htmlFor="who" className="mb-1 block font-semibold">{t("who")}</label>
          <select id="who" className="field" value={wid} onChange={(e) => setWorkerId(e.target.value)}>
            <option value="">{t("select")}</option>
            {cfg.workers.map((w) => (
              <option key={w.id} value={w.id}>{w.name} · {w.role} · ₹{w.hourlyRate}/h</option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted">{t("demo_identity")}</p>
        </section>

        {!worker ? (
          <>
            <p className="card text-muted">{t("pick_worker")}</p>
            <UrgentGuidance />
          </>
        ) : (
          <>
            <Voice />
            <VoiceController />
            <WorkerAssist />
            <Tabs
              label={t("worker")} value={tab} onChange={(id) => setTab(id as TabId)}
              tabs={[
                { id: "shifts", label: t("tab_shifts") },
                { id: "payslip", label: t("tab_payslip") },
                { id: "safety", label: t("tab_safety") },
                { id: "cases", label: t("tab_cases"), badge: active },
                { id: "feedback", label: t("tab_feedback") },
                { id: "skills", label: t("tab_skills") },
                { id: "rest", label: t("tab_rest"), badge: alerts },
              ]}
            />
            <Panel id={tab}>
              {tab === "shifts" && <Shifts />}
              {tab === "payslip" && <Payslip onFiled={() => undefined} />}
              {tab === "safety" && <Safety onFiled={() => undefined} />}
              {tab === "cases" && <Cases />}
              {tab === "feedback" && <Feedback />}
              {tab === "skills" && <Skills />}
              {tab === "rest" && <Fatigue />}
            </Panel>
          </>
        )}
      </div>
      <div className="h-fit space-y-4">
        <EventFeed />
        <AgentFeed />
      </div>
    </div>
  );
}
