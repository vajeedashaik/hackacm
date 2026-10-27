"use client";

import { useEffect, useRef, useState } from "react";
import { MAP_H, MAP_W } from "@/sim/config";
import type { SimGameHandle, SceneView } from "@/sim/phaser/createSimGame";

interface Props {
  view: SceneView;
  onSelect: (id: string | null) => void;
  label: string;
}

/**
 * Owns exactly one Phaser game for the lifetime of this component. The game is created once; later
 * view changes are pushed in, never rebuilt, so industry/scenario changes cannot leak a second game.
 */
export default function SimCanvas({ view, onSelect, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<SimGameHandle | null>(null);
  const latestView = useRef(view);
  const latestSelect = useRef(onSelect);
  const [failed, setFailed] = useState(false);

  useEffect(() => { latestSelect.current = onSelect; }, [onSelect]);

  useEffect(() => {
    latestView.current = view;
    handle.current?.setView(view);
  }, [view]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const ac = new AbortController();
    let cancelled = false;
    let game: SimGameHandle | null = null;
    el.replaceChildren(); // hot reload: never stack a second canvas

    import("@/sim/phaser/createSimGame")
      .then((m) => m.createSimGame(el, (id) => latestSelect.current(id), ac.signal))
      .then((g) => {
        if (cancelled) return g.destroy();
        game = g;
        handle.current = g;
        g.setView(latestView.current);
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    const ro = new ResizeObserver(() => game?.refresh());
    ro.observe(el);
    // Phaser caches the canvas position; refresh it when the page scrolls so clicks stay accurate
    const onScroll = () => game?.refresh();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelled = true;
      ac.abort();
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      handle.current = null;
      game?.destroy();
    };
  }, []);

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border-4 border-ink bg-[#1f2937]"
      style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}
    >
      <div ref={host} className="absolute inset-0" role="img" aria-label={label} data-testid="sim-canvas" />
      {failed && (
        <p role="alert" className="absolute inset-0 grid place-items-center bg-surface p-4 text-center font-semibold text-bad">
          The 2D map could not start in this browser. Use the character list below; the simulation still runs.
        </p>
      )}
    </div>
  );
}
