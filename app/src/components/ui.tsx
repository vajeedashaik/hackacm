"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { CaseStatus } from "@/lib/types";

const BADGE: Record<string, string> = {
  open: "bg-amber-100 text-warn",
  resolved: "bg-green-100 text-good",
  rejected: "bg-red-100 text-bad",
  neutral: "bg-[#efe7d4] text-ink",
};

export function Badge({ tone = "neutral", children }: { tone?: CaseStatus | "neutral"; children: ReactNode }) {
  return <span className={`pixel rounded px-2 py-0.5 text-xs font-bold ${BADGE[tone]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  return <Badge tone={status}>{status.toUpperCase()}</Badge>;
}

const NOTICE: Record<string, string> = {
  success: "border-good bg-green-50 text-good",
  error: "border-bad bg-red-50 text-bad",
  warning: "border-warn bg-amber-50 text-warn",
  info: "border-line bg-surface text-ink",
};

/** Inline notification. Errors are announced assertively, everything else politely. */
export function Notice({ tone = "info", children }: { tone?: keyof typeof NOTICE; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold ${NOTICE[tone]}`}>
      {children}
    </p>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="card flex items-center gap-3 text-muted">
      <span aria-hidden className="inline-block size-4 animate-spin rounded-full border-2 border-line border-t-brand" />
      {label}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card border-dashed text-center">
      <p className="font-semibold">{title}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card text-center">
      <p className="pixel text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

/** Modal built on the native <dialog>: focus trap, Esc to close and inert background come for free. */
export function Dialog({
  open, title, onClose, children,
}: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="dlg-title"
      className="card m-auto w-[min(92vw,28rem)] backdrop:bg-black/40">
      <h2 id="dlg-title" className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </dialog>
  );
}
