// Original procedural pixel-art: every sprite is a list of coloured rectangles in a 20x20 cell.
// Nothing is loaded from a file or URL, so there is no third-party asset licence to track.
export type PixelRect = [x: number, y: number, w: number, h: number, color: number];

const STEEL = 0x6b7280, DARK = 0x374151, WOOD = 0xb98b5e, DWOOD = 0x92400e;

export const SPRITES: Record<string, PixelRect[]> = {
  scaffold: [[2, 2, 2, 16, STEEL], [16, 2, 2, 16, STEEL], [2, 2, 16, 2, WOOD], [2, 9, 16, 2, WOOD], [2, 16, 16, 2, WOOD]],
  toolbox: [[3, 8, 14, 8, 0xdc2626], [7, 6, 6, 2, DARK], [3, 11, 14, 1, 0x991b1b]],
  mixer: [[3, 3, 14, 10, 0x9aa5ad], [3, 7, 14, 2, 0x4b5563], [5, 13, 10, 4, DARK], [4, 17, 3, 3, 0x111827], [13, 17, 3, 3, 0x111827]],
  sand: [[2, 11, 16, 7, 0xe7c98f], [5, 7, 10, 5, 0xe7c98f], [8, 4, 4, 4, 0xd9b673]],
  rebar: [[2, 4, 16, 2, 0x7c2d12], [2, 8, 16, 2, 0x9a3412], [2, 12, 16, 2, 0x7c2d12], [3, 14, 2, 4, DARK], [15, 14, 2, 4, DARK]],
  barrier: [[1, 8, 18, 3, 0xef4444], [1, 8, 4, 3, 0xffffff], [9, 8, 4, 3, 0xffffff], [3, 11, 2, 5, DARK], [15, 11, 2, 5, DARK]],
  pit: [[0, 0, 20, 20, 0x5b4636], [2, 2, 16, 16, 0x3b2d22]],
  crane: [[4, 14, 12, 4, 0xfacc15], [9, 2, 3, 12, 0xeab308], [0, 2, 20, 2, 0xeab308], [16, 4, 1, 6, 0x111827]],
  crates: [[2, 6, 9, 9, WOOD], [11, 10, 7, 7, 0xa16207], [4, 8, 5, 1, 0x78350f], [13, 12, 3, 1, 0x78350f]],
  bench: [[1, 8, 18, 4, DWOOD], [3, 12, 2, 5, 0x78350f], [15, 12, 2, 5, 0x78350f]],
  water: [[6, 3, 8, 14, 0x60a5fa], [8, 1, 4, 3, 0xe5e7eb], [8, 9, 4, 2, 0x1d4ed8]],
  panel: [[3, 2, 14, 16, STEEL], [5, 4, 10, 12, DARK], [6, 6, 3, 3, 0xef4444], [11, 6, 3, 3, 0x22c55e], [6, 11, 8, 2, 0xfacc15]],
  hvpanel: [[3, 2, 14, 16, 0xfde047], [5, 4, 10, 12, DARK], [8, 6, 4, 8, 0xfacc15], [9, 7, 2, 6, 0x111827]],
  desk: [[1, 7, 18, 8, DWOOD], [3, 15, 2, 4, 0x78350f], [15, 15, 2, 4, 0x78350f]],
  computer: [[6, 1, 8, 6, 0x1f2937], [7, 2, 6, 4, 0x38bdf8], [8, 7, 4, 2, STEEL]],
  gate: [[1, 2, 3, 16, DARK], [16, 2, 3, 16, DARK], [4, 6, 12, 3, 0xfacc15], [8, 6, 4, 3, 0x111827]],
  bunk: [[2, 3, 16, 14, 0x7c5a3a], [3, 4, 14, 12, 0xe5e7eb], [3, 4, 14, 4, 0x93c5fd]],
  labbench: [[1, 6, 18, 8, 0x4b5563], [3, 3, 4, 5, 0x34d399], [9, 3, 3, 5, 0xf472b6], [14, 4, 3, 4, 0x60a5fa]],
  table: [[2, 5, 16, 10, 0xd6a76b], [4, 3, 4, 3, 0xe5e7eb], [12, 3, 4, 3, 0xe5e7eb]],
  counter: [[1, 4, 18, 8, 0x9ca3af], [1, 4, 18, 2, 0xe5e7eb], [4, 1, 4, 3, 0xf97316]],
  pump: [[3, 8, 10, 8, 0x2563eb], [13, 9, 5, 3, STEEL], [5, 5, 4, 3, 0x1d4ed8]],
  tank: [[3, 2, 14, 15, 0x93c5fd], [3, 2, 14, 3, 0x60a5fa], [8, 17, 4, 2, STEEL]],
  sofa: [[1, 7, 18, 8, 0x7c3aed], [1, 4, 18, 4, 0x6d28d9]],
  trolley: [[3, 8, 14, 6, 0x9ca3af], [4, 14, 3, 3, 0x111827], [13, 14, 3, 3, 0x111827], [14, 3, 2, 6, STEEL]],
  toolbench: [[1, 7, 18, 8, 0x57534e], [3, 4, 3, 4, 0xdc2626], [9, 4, 6, 3, 0xfacc15]],
};

/** Pixel-art character, drawn relative to the character's feet-centre. Returns rects in a 14x22 box. */
export function characterRects(color: number, kind: "worker" | "supervisor" | "admin"): PixelRect[] {
  const hat = kind === "supervisor" ? 0xffffff : kind === "admin" ? 0x1e3a8a : 0xfacc15;
  return [
    [3, 20, 8, 2, 0x000000],          // shadow
    [4, 15, 3, 5, 0x1f2937], [8, 15, 3, 5, 0x1f2937], // legs
    [3, 8, 9, 8, color],              // torso
    [1, 9, 2, 6, color], [12, 9, 2, 6, color],        // arms
    [4, 2, 7, 6, 0xf1c9a5],           // head
    [3, 0, 9, 3, hat],                // hard hat / cap
    [5, 4, 1, 1, 0x1f2937], [9, 4, 1, 1, 0x1f2937],   // eyes
  ];
}
