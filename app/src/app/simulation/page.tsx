"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useFair, useT } from "@/lib/client";
import { useAgents } from "@/components/agents/useAgents";
import { adaptSnapshot } from "@/sim/adapter";
import { adaptAgentEvents } from "@/sim/agentAdapter";
import { SIM_INDUSTRIES } from "@/sim/config";
import { buildFeed, deriveCharacters } from "@/sim/derive";
import { useSimulation } from "@/sim/useSimulation";
import { CATEGORIES } from "@/sim/status";
import type { EventCategory, EventSource, Viewer } from "@/sim/types";
import type { SceneView } from "@/sim/phaser/createSimGame";
import { CharacterList, CharacterPanel, Controls, FeedPanel, Legend, ViewerBar } from "@/components/sim/SimPanels";

const SimCanvas = dynamic(() => import("@/components/sim/SimCanvas"), {
  ssr: false,
  loading: () => <div className="card grid aspect-[40/26] place-items-center">Loading workplace…</div>,
});

const toggle = <T,>(set: ReadonlySet<T>, v: T) => {
  const next = new Set(set);
  if (!next.delete(v)) next.add(v);
  return next;
};

export default function SimulationPage() {
  const { industry, setIndustry, cfg, snap, unlock, lock } = useFair();
  const t = useT();
  const { sim, start, pause, resume, reset, setScenario } = useSimulation(industry);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sources, setSources] = useState<ReadonlySet<EventSource>>(new Set(["synthetic", "app", "agent"]));
  const [categories, setCategories] = useState<ReadonlySet<EventCategory>>(new Set(CATEGORIES));

  // The server decides: only requests carrying the employer PIN receive case data (snap.employer).
  const viewer: Viewer = snap?.employer ? "employer" : "public";

  // Backend -> simulation: the adapter is the only entry point for real application data.
  const live = useMemo(() => adaptSnapshot(snap && snap.industry === sim.industry ? snap : null), [snap, sim.industry]);
  // AI agent activity is real, persisted backend data too: it joins the feed as source "agent" (employer view only)
  const agents = useAgents();
  const liveEvents = useMemo(
    () => [...live.events, ...adaptAgentEvents(agents?.events ?? [], sim.industry)],
    [live.events, agents, sim.industry],
  );
  const chars = useMemo(() => deriveCharacters(sim, live, viewer), [sim, live, viewer]);
  const feed = useMemo(() => buildFeed(sim.events, liveEvents, viewer, { sources, categories }), [sim.events, liveEvents, viewer, sources, categories]);
  const allEvents = useMemo(
    () => buildFeed(sim.events, liveEvents, viewer, { sources: new Set<EventSource>(["synthetic", "app", "agent"]), categories: new Set(CATEGORIES) }),
    [sim.events, liveEvents, viewer],
  );

  const selected = chars.find((c) => c.id === selectedId) ?? null;
  const view: SceneView = useMemo(() => ({
    industry: SIM_INDUSTRIES[sim.industry],
    chars: chars.map((c) => ({ id: c.id, name: c.name, kind: c.kind, color: c.color, status: c.status, x: c.x, y: c.y })),
    selectedId: selected?.id ?? null,
    running: sim.run === "running",
  }), [chars, sim.industry, sim.run, selected?.id]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t("sim")} — {cfg.site}</h1>
        <p className="mt-1 text-sm text-muted">
          Events tagged <b>DEMO</b> come from a deterministic, scripted scenario: no AI is involved and no real records are changed.
          Events tagged <b>LIVE</b> are real records from the FairShift app, polled every 2 seconds.
        </p>
      </div>
      <Controls
        sim={sim} industry={industry}
        onIndustry={(i) => { setIndustry(i); setSelectedId(null); }}
        onScenario={setScenario}
        onStart={start} onPause={pause} onResume={resume} onReset={reset}
      />
      <div className="card"><ViewerBar viewer={viewer} onUnlock={unlock} onLock={lock} /></div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <SimCanvas view={view} onSelect={setSelectedId} label={`Top-down map of ${cfg.site}. Use the character list below to inspect people without the mouse.`} />
          <CharacterList chars={chars} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          <Legend industry={industry} />
        </div>
        <div className="min-w-0 space-y-4">
          <CharacterPanel ch={selected} events={allEvents} viewer={viewer} industry={industry} />
          <FeedPanel
            events={feed} sources={sources} categories={categories}
            onToggleSource={(s) => setSources((p) => toggle(p, s))}
            onToggleCategory={(c) => setCategories((p) => toggle(p, c))}
            onPickCharacter={setSelectedId}
            charName={(id) => chars.find((c) => c.id === id)?.name}
          />
        </div>
      </div>
    </div>
  );
}
