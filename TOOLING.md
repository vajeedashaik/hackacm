# Tooling manifest

Environment: Windows 11, Git 2.52, Node 24.12, npm 11.6, Docker 29.3, gcloud 563.0, Claude Code 2.1.251. No pnpm.

| Tool | Purpose | Method | Status |
|---|---|---|---|
| addyosmani/agent-skills (MIT) | Engineering workflow | `npx skills add … -a claude-code --copy` → `.claude/skills/` | Trimmed to 5 skills |
| vercel-labs/skills `find-skills` (MIT) | Skill discovery | same CLI | Installed, listed |
| Playwright MCP | Browser automation | Pre-existing user MCP (`--extension`) | Connected per `claude mcp list`; not used (needs the browser extension) |
| Chrome DevTools MCP | Real-browser check | Pre-existing MCP | Used to screenshot `/simulation`: rendered, no console errors |
| shadcn MCP | UI components | Pre-existing | Connected, unused |
| phaser (npm, local) | Simulation | `npm i phaser` | Installed, working |

## Skipped / deferred
- **SkillUI** — no license, 1 star, unclear provenance. **Hallmark / UI UX Pro Max** — would compete with Impeccable.
- **Context7** — not configured (`urgebt.md`: skip optional setup). Phaser/Next APIs were used from existing knowledge and verified by build + browser run.
- **Supabase MCP / backend** — no project or credentials provided; in-memory store used instead.
- **Codex plugin, Strix, Claude Security** — not installed (optional, need login/consent; not needed for the MVP).
- **@playwright/test suites** — not added yet. Verification so far: lint, `tsc`, build, API walkthrough via curl, one browser screenshot.
- **Vapi voice** — not implemented (needs API key).
- FreeLLMAPI/OmniRoute, Expo, Three.js, Composio, Favstash, Apify, Google Workspace CLI, HyperFrames — not needed.

## Manual steps remaining
- `npx vercel login` and owner approval for the first public Vercel deploy (set `EMPLOYER_PIN` in Vercel env vars).
- Replace the in-memory store with a durable backend (Supabase) before relying on the Vercel deployment.
- `magic` (21st.dev) MCP is failing authentication — unused; ignore or fix its key.
