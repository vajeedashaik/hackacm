"use client";

import { useFair, useT } from "@/lib/client";

const ICON: Record<string, string> = {
  "clock-in": "🟢", "clock-out": "⚪", "case-filed": "📝",
  "case-resolved": "✅", "case-rejected": "❌", "fatigue-alert": "⚠️",
};

export function EventFeed({ className = "" }: { className?: string }) {
  const { snap } = useFair();
  const t = useT();
  return (
    <section className={`card ${className}`} aria-label={t("feed")}>
      <h2 className="pixel mb-2 text-sm font-bold uppercase">{t("feed")}</h2>
      <ul className="max-h-80 space-y-2 overflow-auto" aria-live="polite">
        {snap?.events.length ? (
          snap.events.map((e) => (
            <li key={e.id} className="text-sm">
              <span aria-hidden>{ICON[e.kind]} </span>
              {e.message}
              <span className="ml-2 text-xs text-muted">{new Date(e.ts).toLocaleTimeString()}</span>
            </li>
          ))
        ) : (
          <li className="text-sm text-muted">No events yet. Clock in a worker to begin.</li>
        )}
      </ul>
    </section>
  );
}
