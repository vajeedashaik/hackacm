"use client";

import Link from "next/link";
import { useState } from "react";
import { INDUSTRIES, industryIds } from "@/lib/industries";
import { SCENARIO_IDS, SIM_INDUSTRIES } from "@/sim/config";
import type { DisplayChar } from "@/sim/derive";
import { scenarioOf, type SimState } from "@/sim/engine";
import { CATEGORIES, CATEGORY_LABEL, SOURCE_LABEL, STATUS_META, STATUS_ORDER } from "@/sim/status";
import type { EventCategory, EventSource, IndustryId, ScenarioId, SimEvent, SimStatus, Viewer } from "@/sim/types";

const RUN_LABEL = { idle: "Ready", running: "Running", paused: "Paused", finished: "Finished" } as const;
const SEV_ICON = { info: "ℹ️", warning: "⚠️", critical: "🚨" } as const;

export function StatusChip({ status }: { status: SimStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1 rounded-full border-2 bg-surface px-2 py-0.5 text-sm font-semibold" style={{ borderColor: m.color, color: "#1f2a37" }}>
      <span aria-hidden>{m.icon}</span>{m.label}
    </span>
  );
}

function SourceTag({ source }: { source: EventSource }) {
  return (
    <span className={`pixel rounded px-1.5 py-0.5 text-[11px] font-bold ${source === "synthetic" ? "bg-amber-100 text-warn" : "bg-sky-100 text-sky-900"}`}>
      {SOURCE_LABEL[source]}
    </span>
  );
}

/* ---------------------------------------------------------------- controls */

interface ControlsProps {
  sim: SimState;
  industry: IndustryId;
  onIndustry: (i: IndustryId) => void;
  onScenario: (s: ScenarioId) => void;
  onStart: () => void; onPause: () => void; onResume: () => void; onReset: () => void;
}

export function Controls({ sim, industry, onIndustry, onScenario, onStart, onPause, onResume, onReset }: ControlsProps) {
  const sc = scenarioOf(sim);
  const canStart = sim.run === "idle" || sim.run === "finished";
  return (
    <section className="card space-y-3" aria-label="Simulation controls">
      <div className="flex flex-wrap items-end gap-4">
        <div role="group" aria-label="Industry">
          <p className="mb-1 text-sm font-semibold">Industry</p>
          <div className="flex gap-2">
            {industryIds.map((id) => (
              <button key={id} className={`btn ${industry === id ? "btn-primary" : ""}`} aria-pressed={industry === id} onClick={() => onIndustry(id)}>
                {INDUSTRIES[id].label.en}
              </button>
            ))}
          </div>
        </div>
        <div className="min-w-56 flex-1">
          <label htmlFor="scenario" className="mb-1 block text-sm font-semibold">Scenario</label>
          <select id="scenario" className="field" value={sim.scenarioId} onChange={(e) => onScenario(e.target.value as ScenarioId)}>
            {SCENARIO_IDS.map((id) => (
              <option key={id} value={id}>{SIM_INDUSTRIES[industry].scenarios[id].title}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-sm text-muted">{sc.description}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={onStart} disabled={!canStart}>▶ Start</button>
        <button className="btn" onClick={onPause} disabled={sim.run !== "running"}>⏸ Pause</button>
        <button className="btn" onClick={onResume} disabled={sim.run !== "paused"}>⏯ Resume</button>
        <button className="btn" onClick={onReset} disabled={sim.run === "idle"}>↺ Reset</button>
        <p className="pixel ml-2 text-sm" role="status" aria-live="polite" data-testid="run-state">
          {RUN_LABEL[sim.run]} · step {sim.tick}/{sc.duration}
        </p>
      </div>
      <progress className="h-2 w-full" max={sc.duration} value={sim.tick} aria-label="Scenario progress" />
    </section>
  );
}

/* ------------------------------------------------------------------ legend */

const AREA_SWATCH: Record<string, { label: string; style: React.CSSProperties }> = {
  work: { label: "Work area", style: { background: "#d9c49a", border: "2px solid #3b2f2f" } },
  safety: { label: "⚠ Safety zone (striped border)", style: { background: "repeating-linear-gradient(45deg,#facc15 0 5px,#111827 5px 10px)", border: "2px solid #111827" } },
  break: { label: "☕ Break area", style: { background: "#bfe0c3", border: "2px solid #3b2f2f" } },
  admin: { label: "📋 Reporting / administration station", style: { background: "#b9d3ee", border: "2px solid #3b2f2f" } },
  gate: { label: "🚪 Gate (off-shift staff wait here)", style: { background: "#cfcfcf", border: "2px solid #3b2f2f" } },
};

export function Legend({ industry }: { industry: IndustryId }) {
  const ind = SIM_INDUSTRIES[industry];
  const equipment = [...new Set(ind.areas.flatMap((a) => a.equipment.map((e) => e.label)))];
  return (
    <section className="card" aria-label="Map legend">
      <h2 className="pixel mb-2 text-sm font-bold uppercase">Map legend</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <h3 className="mb-1 text-sm font-bold">Character states</h3>
          <ul className="space-y-1 text-sm">
            {STATUS_ORDER.map((s) => (
              <li key={s}><span aria-hidden>{STATUS_META[s].icon}</span> <b>{STATUS_META[s].label}</b><span className="text-muted"> — {STATUS_META[s].hint}</span></li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-bold">Places</h3>
          <ul className="space-y-1 text-sm">
            {Object.entries(AREA_SWATCH).map(([k, v]) => (
              <li key={k} className="flex items-center gap-2"><span aria-hidden className="inline-block size-4 shrink-0" style={v.style} />{v.label}</li>
            ))}
          </ul>
          <h3 className="mb-1 mt-3 text-sm font-bold">Roles</h3>
          <p className="text-sm text-muted">Yellow hard hat = worker · white hard hat = supervisor · navy cap = administrator.</p>
        </div>
        <div>
          <h3 className="mb-1 text-sm font-bold">Equipment (hover on the map)</h3>
          <p className="text-sm text-muted">{equipment.join(" · ")}</p>
          <h3 className="mb-1 mt-3 text-sm font-bold">Event sources</h3>
          <p className="text-sm"><SourceTag source="synthetic" /> scripted demo, deterministic, no AI</p>
          <p className="mt-1 text-sm"><SourceTag source="app" /> real record from the FairShift app</p>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- characters */

export function CharacterList({ chars, selectedId, onSelect }: { chars: DisplayChar[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Characters (keyboard-accessible alternative to clicking the map)">
      {chars.map((c) => (
        <li key={c.id}>
          <button className="btn" aria-pressed={selectedId === c.id} onClick={() => onSelect(c.id)}>
            <span aria-hidden className="mr-1">{STATUS_META[c.status].icon}</span>{c.name}
            <span className="sr-only"> — {c.role}, {STATUS_META[c.status].label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const SOURCE_NOTE = {
  scenario: "Demo scenario (scripted, not real data)",
  live: "Live data from the FairShift app",
  baseline: "Demo baseline (not real data)",
} as const;

export function CharacterPanel({ ch, events, viewer, industry }: { ch: DisplayChar | null; events: SimEvent[]; viewer: Viewer; industry: IndustryId }) {
  if (!ch) {
    return (
      <section className="card" aria-label="Character details">
        <h2 className="pixel text-sm font-bold uppercase">Details</h2>
        <p className="mt-2 text-sm text-muted">Click a character on the map, or pick one from the list, to inspect them.</p>
      </section>
    );
  }
  const recent = events.filter((e) => e.characterId === ch.id).slice(0, 4);
  const emp = viewer === "employer";
  return (
    <section className="card space-y-2" aria-label="Character details" aria-live="polite">
      <h2 className="text-lg font-bold">{ch.name} · {ch.role}</h2>
      <p><StatusChip status={ch.status} /></p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="font-semibold">ID</dt><dd className="pixel">{ch.id}</dd>
        <dt className="font-semibold">Industry</dt><dd>{INDUSTRIES[industry].label.en}</dd>
        <dt className="font-semibold">Work area</dt><dd>{ch.areaLabel}</dd>
        <dt className="font-semibold">Activity</dt><dd>{ch.activity}</dd>
        {ch.appWorker && <><dt className="font-semibold">Hours today</dt><dd>{ch.hoursToday ?? 0} h (from attendance)</dd></>}
        <dt className="font-semibold">State source</dt><dd>{SOURCE_NOTE[ch.source]}</dd>
      </dl>
      <div>
        <h3 className="text-sm font-bold">Case summaries</h3>
        {emp ? (
          ch.caseNotes.length ? <ul className="list-disc pl-5 text-sm">{ch.caseNotes.map((n) => <li key={n}>{n}</li>)}</ul>
            : <p className="text-sm text-muted">No active cases.</p>
        ) : (
          <p className="text-sm text-muted">Case details are restricted to the employer.</p>
        )}
      </div>
      <div>
        <h3 className="text-sm font-bold">Recent events</h3>
        {recent.length ? (
          <ul className="space-y-1 text-sm">
            {recent.map((e) => <li key={e.id}><SourceTag source={e.source} /> {e.title}</li>)}
          </ul>
        ) : <p className="text-sm text-muted">None yet.</p>}
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {ch.appWorker ? (
          <>
            <Link href="/worker" className="underline">Open Worker Dashboard</Link>
            {emp && <Link href="/employer" className="underline">Open Employer Dashboard</Link>}
          </>
        ) : <span className="text-muted">No application record for this role.</span>}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- access */

export function ViewerBar({ viewer, onUnlock, onLock }: { viewer: Viewer; onUnlock: (pin: string) => Promise<boolean>; onLock: () => void }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  if (viewer === "employer") {
    return (
      <p className="flex flex-wrap items-center gap-3 text-sm">
        <b>Employer view:</b> confidential case details are visible.
        <button className="btn" onClick={onLock}>Switch to public view</button>
      </p>
    );
  }
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await onUnlock(pin);
        setErr(ok ? "" : "Wrong PIN."); setPin("");
      }}
    >
      <div>
        <label htmlFor="sim-pin" className="block font-semibold">Public view: complaint details are hidden. Employer PIN (demo: 1234)</label>
        <input id="sim-pin" type="password" autoComplete="off" className="field max-w-48" value={pin} onChange={(e) => setPin(e.target.value)} />
      </div>
      <button className="btn" type="submit" disabled={!pin}>Unlock employer view</button>
      {err && <span role="alert" className="font-semibold text-bad">{err}</span>}
    </form>
  );
}

/* -------------------------------------------------------------------- feed */

interface FeedProps {
  events: SimEvent[];
  sources: ReadonlySet<EventSource>;
  categories: ReadonlySet<EventCategory>;
  onToggleSource: (s: EventSource) => void;
  onToggleCategory: (c: EventCategory) => void;
  onPickCharacter: (id: string) => void;
  charName: (id: string) => string | undefined;
}

export function FeedPanel({ events, sources, categories, onToggleSource, onToggleCategory, onPickCharacter, charName }: FeedProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = events.find((e) => e.id === openId) ?? null;
  return (
    <section className="card space-y-3" aria-label="Event feed">
      <h2 className="pixel text-sm font-bold uppercase">Event feed <span className="font-normal normal-case text-muted">(newest first)</span></h2>
      <fieldset className="space-y-1">
        <legend className="text-xs font-semibold uppercase text-muted">Filter</legend>
        <div className="flex flex-wrap gap-1">
          {(["synthetic", "app"] as const).map((s) => (
            <button key={s} className="btn !min-h-9 !px-2 text-sm" aria-pressed={sources.has(s)} onClick={() => onToggleSource(s)}>
              {sources.has(s) ? "✔ " : ""}{SOURCE_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <button key={c} className="btn !min-h-9 !px-2 text-sm" aria-pressed={categories.has(c)} onClick={() => onToggleCategory(c)}>
              {categories.has(c) ? "✔ " : ""}{CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </fieldset>
      <ul className="max-h-72 space-y-1 overflow-auto" aria-live="polite" data-testid="feed">
        {events.length ? events.map((e) => (
          <li key={e.id}>
            <button
              className={`w-full rounded-lg border-2 px-2 py-1 text-left text-sm hover:bg-[#efe7d4] ${openId === e.id ? "border-ink bg-[#efe7d4]" : "border-transparent"}`}
              aria-expanded={openId === e.id}
              onClick={() => setOpenId(openId === e.id ? null : e.id)}
            >
              <span aria-hidden>{SEV_ICON[e.severity]} </span>
              <SourceTag source={e.source} /> {e.title}
              <span className="ml-2 text-xs text-muted">{new Date(e.ts).toLocaleTimeString()}</span>
            </button>
          </li>
        )) : <li className="text-sm text-muted">No events match. Start a scenario, or adjust the filters.</li>}
      </ul>
      {open && (
        <div className="rounded-lg border-2 border-line bg-white p-3 text-sm" aria-label="Event details" data-testid="event-details">
          <h3 className="font-bold">{open.title}</h3>
          <p className="mt-1">{open.detail}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="font-semibold">Source</dt>
            <dd>{open.source === "synthetic" ? "Synthetic demo event: a deterministic script, no AI" : "Real application record"}</dd>
            <dt className="font-semibold">Type</dt><dd className="pixel">{open.type}</dd>
            <dt className="font-semibold">Severity</dt><dd>{open.severity}</dd>
            <dt className="font-semibold">Time</dt><dd>{new Date(open.ts).toLocaleString()}{open.tick !== undefined ? ` · step ${open.tick}` : ""}</dd>
            {open.confidential && <><dt className="font-semibold">Access</dt><dd>Confidential case record</dd></>}
          </dl>
          {open.characterId && charName(open.characterId) && (
            <button className="btn mt-2 !min-h-9 text-sm" onClick={() => onPickCharacter(open.characterId!)}>Inspect {charName(open.characterId)}</button>
          )}
        </div>
      )}
    </section>
  );
}
