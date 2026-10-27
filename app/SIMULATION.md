# Workplace simulation (`/simulation`)

Phaser renders a pixel-art map; React owns the UI; a pure engine owns scenario state. Nothing here is deployed
or persisted: scripted events live in the browser only and never write to application records.

## Layers (`src/sim/`)
| File | Role |
|---|---|
| `types.ts` | Stable contract: `SimEvent`, `SimEventType`, `SimStatus`, `EventSource` (`synthetic` / `app` / `agent`) |
| `config.ts` | Per-industry map, characters, equipment and the 4 scenarios (add an industry = add one entry) |
| `engine.ts` | Pure reducer: `start / pause / resume / reset / tick / set-scenario / set-industry`. Deterministic; illegal transitions return the same state object |
| `adapter.ts` | **Backend -> map.** `adaptSnapshot(snap)` turns the `/api/state` snapshot into per-worker live states and `app` events |
| `agentAdapter.ts` | Same contract for AI agent activity (`source: "agent"`) |
| `derive.ts` | Merges baseline + scenario + live into display characters; builds the filtered, redacted feed |
| `privacy.ts` | Redacts confidential synthetic events for non-employer viewers |
| `phaser/` | `createSimGame()` returns `{ setView, refresh, destroy }`; no React, API or engine imports |
| `useSimulation.ts` | React binding; owns the single tick interval |

UI: `src/components/sim/` (canvas wrapper + panels), page `src/app/simulation/page.tsx`.

## State precedence per character
scenario (touched, visible to viewer) > live app data > baseline. Each character panel states which one is shown.
Synthetic events are tagged **DEMO**, real records **LIVE**, agent activity **AGENT**. The scenario "playback" is a
fixed script (one step per 1.5 s); no AI is involved in it.

## Privacy
- The server filters `/api/state`: cases only reach requests with the employer PIN (`snap.employer`); the shared
  event feed never names a case reporter. `adaptSnapshot` ignores cases unless `snap.employer` is true.
- Scripted confidential steps (wage query, grievance) are hidden from the public view (events redacted, states shown
  as baseline). The grievance scenario never involves a worker character, so a complainant cannot be identified.

## Integration interface for the AI-agent phase
Produce `SimEvent`s with `source: "agent"` (see `agentAdapter.ts`) and pass them to `buildFeed` next to the app events.
To move a character on the map, expose a `LiveState` for the worker id in `adaptSnapshot`'s `workers` map
(`status`, `anchor`, `activity`); `deriveCharacters` and Phaser need no change. Event `type` values are stable strings
in `SimEventType`; add new ones there. Agents must only emit what really happened in the backend: never scripted output.

## Tests and checks
- `npm run test:sim` — 19 `node:test` tests (state transitions, determinism, reset, adapter, privacy, feed filters).
  The vitest config excludes `src/sim`, so `npm test` does not run them.
- `npx tsc --noEmit`, `npx eslint src/sim src/components/sim src/app/simulation`.
- Browser-verified on `next dev`: single canvas after load, Start/Pause/Resume/Reset, scenario + industry switching,
  canvas click selects a character, employer unlock shows case summaries, live backend events appear in the feed.

## Known limits
- Phaser caches canvas bounds; `SimCanvas` refreshes them on resize and scroll.
- Equipment is described by hover tooltip and the legend (no screen-reader description of the canvas itself; the
  character list is the keyboard/screen-reader path).
- `useFair` polls only while the tab is visible, so a background tab shows stale live data.
