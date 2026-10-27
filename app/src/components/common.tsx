"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useFair, useT } from "@/lib/client";
import { fmtDateTime } from "@/lib/format";
import { Notice } from "@/components/ui";
import type { AuditEntry, Case, CaseStatus, Priority } from "@/lib/types";

export interface TabDef { id: string; label: string; badge?: number }

/** Accessible tabs: arrow keys / Home / End move between tabs, panels are linked by id. */
export function Tabs({ tabs, value, onChange, label }: {
  tabs: TabDef[]; value: string; onChange: (id: string) => void; label: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    const move = (j: number) => {
      const next = tabs[(j + tabs.length) % tabs.length].id;
      onChange(next);
      refs.current[next]?.focus();
    };
    if (e.key === "ArrowRight") { e.preventDefault(); move(i + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); move(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); move(0); }
    else if (e.key === "End") { e.preventDefault(); move(tabs.length - 1); }
  };
  return (
    <div role="tablist" aria-label={label} onKeyDown={onKey} className="tabs">
      {tabs.map((t) => (
        <button
          key={t.id} ref={(el) => { refs.current[t.id] = el; }} role="tab" id={`tab-${t.id}`}
          aria-selected={value === t.id} aria-controls={`panel-${t.id}`} tabIndex={value === t.id ? 0 : -1}
          className="tab" onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.badge ? <span className="tab-badge" aria-label={`${t.badge}`}>{t.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Panel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={0} className="space-y-4 outline-none">
      {children}
    </div>
  );
}

const STATUS_TONE: Record<CaseStatus, string> = {
  open: "bg-amber-100 text-warn",
  in_review: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-good",
  rejected: "bg-red-100 text-bad",
};
const PRIORITY_TONE: Record<Priority, string> = {
  low: "bg-[#efe7d4] text-ink",
  medium: "bg-amber-100 text-warn",
  high: "bg-orange-100 text-orange-800",
  urgent: "bg-red-100 text-bad",
};

export function StatusPill({ status }: { status: CaseStatus }) {
  const t = useT();
  return <span className={`pill ${STATUS_TONE[status]}`}>{t(`st_${status}`)}</span>;
}

export function PriorityPill({ priority }: { priority: Priority }) {
  const t = useT();
  return <span className={`pill ${PRIORITY_TONE[priority]}`}>{t(`pr_${priority}`)}</span>;
}

/** Busy / result state for a button or form, so every action reports success or failure. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, okText?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ ok: true, text: okText });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, run, setMsg };
}

export function Msg({ msg }: { msg: { ok: boolean; text: string } | null }) {
  return msg ? <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice> : null;
}

export function Timeline({ entries }: { entries: AuditEntry[] }) {
  const t = useT();
  if (!entries.length) return null;
  return (
    <ol className="space-y-2 border-l-2 border-line pl-3" aria-label={t("history")}>
      {[...entries].reverse().map((a) => (
        <li key={a.id} className="text-sm">
          <p>
            <strong>{a.actor}</strong> — {a.action}
            {a.visibility === "internal" && <span className="pill ml-2 bg-[#efe7d4] text-ink">{t("internal")}</span>}
          </p>
          {a.note && <p className="text-muted">“{a.note}”</p>}
          <p className="text-xs text-muted">{fmtDateTime(a.ts)}</p>
        </li>
      ))}
    </ol>
  );
}

/** Evidence is fetched with credentials (worker id or employer PIN) and opened as a blob. */
export function EvidenceLinks({ c }: { c: Case }) {
  const { pin, workerId } = useFair();
  const t = useT();
  const { msg, run } = useAction();
  if (!c.evidence.length) return null;
  const open = (i: number) =>
    run(async () => {
      const r = await fetch(`/api/cases/${c.id}/evidence/${i}?workerId=${encodeURIComponent(workerId)}`, {
        headers: pin ? { "x-employer-pin": pin } : {},
      });
      if (!r.ok) throw new Error(t("evidence_failed"));
      const url = URL.createObjectURL(await r.blob());
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    });
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold">{t("evidence")}</p>
      <ul className="flex flex-wrap gap-2">
        {c.evidence.map((e, i) => (
          <li key={i}>
            <button type="button" className="btn !min-h-11 text-sm" onClick={() => open(i)}>
              📎 {e.name} ({Math.max(1, Math.round(e.size / 1024))} KB)
            </button>
          </li>
        ))}
      </ul>
      <Msg msg={msg} />
    </div>
  );
}
