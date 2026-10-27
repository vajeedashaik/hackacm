// Phaser renderer. It knows nothing about React, the API or the engine: it draws a SceneView and
// reports clicks through one callback. React owns the game's lifetime via createSimGame()/destroy().
import { MAP_H, MAP_W, TILE, areaRect } from "../config.ts";
import type { Area, SimIndustry } from "../config.ts";
import { STATUS_META } from "../status.ts";
import type { SimStatus } from "../types.ts";
import { SPRITES, characterRects } from "./sprites.ts";

export interface SceneChar {
  id: string; name: string; kind: "worker" | "supervisor" | "admin"; color: string;
  status: SimStatus; x: number; y: number;
}
export interface SceneView {
  industry: SimIndustry;
  chars: SceneChar[];
  selectedId: string | null;
  running: boolean;
}
export interface SimGameHandle {
  setView(view: SceneView): void;
  /** call after the container's size changed */
  refresh(): void;
  destroy(): void;
}

const KIND_ICON: Record<Area["kind"], string> = { work: "", safety: "⚠ ", break: "☕ ", admin: "📋 ", gate: "🚪 " };
const MONO = "ui-monospace, Consolas, monospace";

/** Rejects with an AbortError, without creating a game, if `signal` aborts while Phaser is loading. */
export async function createSimGame(host: HTMLElement, onSelect: (id: string | null) => void, signal?: AbortSignal): Promise<SimGameHandle> {
  const Phaser = (await import("phaser")).default;
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");

  interface CharSprite {
    box: Phaser.GameObjects.Container;
    body: Phaser.GameObjects.Graphics;
    badgeBg: Phaser.GameObjects.Graphics;
    badge: Phaser.GameObjects.Text;
    label: Phaser.GameObjects.Text;
    sel: Phaser.GameObjects.Container;
    status: SimStatus | null;
    pulse?: Phaser.Tweens.Tween;
    tx: number; ty: number;
  }

  class SimScene extends Phaser.Scene {
    private ready = false;
    private pending: SceneView | null = null;
    private mapId: string | null = null;
    private mapObjs: Phaser.GameObjects.GameObject[] = [];
    private sprites = new Map<string, CharSprite>();
    private tip!: Phaser.GameObjects.Text;
    private running = false;
    private phase = 0;

    constructor() { super("sim"); }

    create() {
      this.ready = true;
      this.tip = this.add.text(6, MAP_H - 6, "", {
        fontFamily: MONO, fontSize: "11px", color: "#ffffff", backgroundColor: "#1f2937", padding: { x: 4, y: 2 },
      }).setOrigin(0, 1).setDepth(100).setVisible(false);
      this.input.on("pointerdown", (_p: unknown, over: unknown[]) => { if (!over.length) onSelect(null); });
      this.time.addEvent({ delay: 450, loop: true, callback: () => this.idle() });
      if (this.pending) this.apply(this.pending);
    }

    setView(v: SceneView) {
      this.pending = v;
      if (this.ready) this.apply(v);
    }

    private apply(v: SceneView) {
      this.running = v.running;
      if (this.mapId !== v.industry.id) this.buildMap(v.industry);
      this.syncChars(v);
    }

    private clearMap() {
      this.mapObjs.forEach((o) => o.destroy());
      this.mapObjs = [];
      this.sprites.forEach((s) => { s.pulse?.stop(); s.box.destroy(); });
      this.sprites.clear();
    }

    private buildMap(ind: SimIndustry) {
      this.clearMap();
      this.mapId = ind.id;
      const g = this.add.graphics().setDepth(0);
      this.mapObjs.push(g);

      for (let r = 0; r < MAP_H / TILE; r++) {
        for (let c = 0; c < MAP_W / TILE; c++) {
          g.fillStyle(ind.ground[(r + c) % 2], 1).fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }

      for (const a of ind.areas) {
        const { x, y, w, h } = areaRect(a);
        g.fillStyle(a.color, 1).fillRect(x, y, w, h);
        g.fillStyle(0x000000, 0.05);
        for (let ty = 0; ty < h / TILE; ty++) for (let tx = 0; tx < w / TILE; tx++) {
          if ((tx + ty) % 2) g.fillRect(x + tx * TILE, y + ty * TILE, TILE, TILE);
        }
        if (a.kind === "safety") {
          // hazard stripes: a pattern, not only a colour
          for (let i = 0; i < w; i += 12) {
            const col = (i / 12) % 2 ? 0x111827 : 0xfacc15;
            g.fillStyle(col, 1).fillRect(x + i, y, Math.min(12, w - i), 4).fillRect(x + i, y + h - 4, Math.min(12, w - i), 4);
          }
          for (let j = 0; j < h; j += 12) {
            const col = (j / 12) % 2 ? 0x111827 : 0xfacc15;
            g.fillStyle(col, 1).fillRect(x, y + j, 4, Math.min(12, h - j)).fillRect(x + w - 4, y + j, 4, Math.min(12, h - j));
          }
        } else {
          g.lineStyle(3, 0x3b2f2f, 1).strokeRect(x + 1, y + 1, w - 2, h - 2);
        }

        for (const e of a.equipment) {
          const sprite = SPRITES[e.kind];
          const ew = e.w ?? 1, eh = e.h ?? 1;
          for (let i = 0; i < ew; i++) for (let j = 0; j < eh; j++) {
            const ox = x + (e.dx + i) * TILE, oy = y + (e.dy + j) * TILE;
            for (const [rx, ry, rw, rh, color] of sprite ?? []) g.fillStyle(color, 1).fillRect(ox + rx, oy + ry, rw, rh);
          }
          const hit = this.add.zone(x + e.dx * TILE, y + e.dy * TILE, ew * TILE, eh * TILE).setOrigin(0, 0)
            .setInteractive({ useHandCursor: false });
          hit.on("pointerover", () => this.tip.setText(`${e.label} · ${a.label}`).setVisible(true));
          hit.on("pointerout", () => this.tip.setVisible(false));
          this.mapObjs.push(hit);
        }

        const label = this.add.text(x + 5, y + 5, `${KIND_ICON[a.kind]}${a.label}`, {
          fontFamily: MONO, fontSize: "11px", fontStyle: "bold", color: "#1f2937", backgroundColor: "#fffdf8", padding: { x: 3, y: 1 },
        }).setDepth(2);
        this.mapObjs.push(label);
      }

      const title = this.add.text(MAP_W - 6, MAP_H - 6, "FairShift · pixel map", {
        fontFamily: MONO, fontSize: "9px", color: "#fffdf8", backgroundColor: "#1f2937", padding: { x: 3, y: 1 },
      }).setOrigin(1, 1).setDepth(100);
      this.mapObjs.push(title);
    }

    private makeSprite(c: SceneChar): CharSprite {
      const hex = Phaser.Display.Color.HexStringToColor(c.color).color;
      const body = this.add.graphics();
      for (const [x, y, w, h, color] of characterRects(hex, c.kind)) body.fillStyle(color, color === 0 && h === 2 ? 0.25 : 1).fillRect(x - 7, y - 22, w, h);
      const badgeBg = this.add.graphics();
      const badge = this.add.text(0, -33, "", { fontFamily: "Segoe UI Emoji, Apple Color Emoji, sans-serif", fontSize: "11px" }).setOrigin(0.5);
      const label = this.add.text(0, 3, c.name, {
        fontFamily: MONO, fontSize: "10px", color: "#ffffff", backgroundColor: "#1f2937", padding: { x: 2, y: 1 },
      }).setOrigin(0.5, 0);
      const outer = this.add.rectangle(0, -11, 28, 38).setStrokeStyle(3, 0x111827);
      const inner = this.add.rectangle(0, -11, 28, 38).setStrokeStyle(1, 0xffffff);
      const sel = this.add.container(0, 0, [outer, inner]).setVisible(false);
      const box = this.add.container(c.x, c.y, [sel, body, badgeBg, badge, label]).setDepth(10);
      box.setSize(28, 46);
      // hit areas are measured from the top-left of the container's size box (28x46 centred on the feet);
      // this rectangle covers badge to name label, i.e. y -40..+16 around the feet
      box.setInteractive(new Phaser.Geom.Rectangle(0, -17, 28, 56), Phaser.Geom.Rectangle.Contains);
      if (box.input) box.input.cursor = "pointer";
      box.on("pointerdown", () => onSelect(c.id));
      box.on("pointerover", () => this.tip.setText(`${c.name} — click to inspect`).setVisible(true));
      box.on("pointerout", () => this.tip.setVisible(false));
      return { box, body, badgeBg, badge, label, sel, status: null, tx: c.x, ty: c.y };
    }

    private syncChars(v: SceneView) {
      for (const c of v.chars) {
        let s = this.sprites.get(c.id);
        if (!s) { s = this.makeSprite(c); this.sprites.set(c.id, s); }
        s.sel.setVisible(v.selectedId === c.id);

        if (s.status !== c.status) {
          const m = STATUS_META[c.status];
          s.status = c.status;
          s.badge.setText(m.icon);
          s.badgeBg.clear().fillStyle(0x111827, 1).fillRect(-9, -42, 18, 18).fillStyle(m.hex, 1).fillRect(-8, -41, 16, 16);
          s.box.setAlpha(c.status === "offshift" ? 0.55 : 1);
          s.pulse?.stop();
          s.badge.setScale(1); s.badgeBg.setScale(1);
          if (c.status === "safety" || c.status === "review") {
            s.pulse = this.tweens.add({ targets: [s.badge, s.badgeBg], alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });
          } else {
            s.badge.setAlpha(1); s.badgeBg.setAlpha(1); s.pulse = undefined;
          }
        }

        if (s.tx !== c.x || s.ty !== c.y) {
          s.tx = c.x; s.ty = c.y;
          const dist = Math.hypot(c.x - s.box.x, c.y - s.box.y);
          this.tweens.killTweensOf(s.box);
          this.tweens.add({ targets: s.box, x: c.x, y: c.y, duration: Phaser.Math.Clamp(dist * 9, 250, 1800), ease: "Linear" });
          this.tweens.add({ targets: s.body, y: -2, duration: 130, yoyo: true, repeat: Math.max(1, Math.round(dist / 14)), onComplete: () => s.body.setY(0) });
        }
      }
    }

    /** Subtle "alive" motion; stops while the simulation is paused. */
    private idle() {
      if (!this.running) return;
      this.phase = 1 - this.phase;
      this.sprites.forEach((s) => {
        if (s.status === "working" || s.status === "overtime") s.body.setY(this.phase ? -1 : 0);
      });
    }
  }

  const scene = new SimScene();
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width: MAP_W, height: MAP_H,
    backgroundColor: "#1f2937",
    pixelArt: true,
    banner: false,
    audio: { noAudio: true },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [scene],
  });

  let destroyed = false;
  return {
    setView: (v) => { if (!destroyed) scene.setView(v); },
    refresh: () => { if (!destroyed) game.scale.refresh(); },
    destroy: () => { destroyed = true; game.destroy(true); host.replaceChildren(); },
  };
}
