# WalkThroughPark design

Drop a public GitHub repo or PR link, optionally say what to show, and get back a short narrated, captioned demo video. An Axernel agent reads the repo, boots the app inside a Modal sandbox, scripts the demo, records it with Argo, and returns the video as an artifact.

Priority is a working product fast. Tests are BDD-style specs on pure logic only. No e2e suite. Failures found in live runs get fixed as they appear.

## Parts

```
axernel/
  use-cases/walkthroughpark/
    template/    sandbox image: Dockerfile, /opt/walkthrough skeleton, wtp-render
    bootstrap/   setup.ts: account, project, secret, model provider, template, agent → .wtp.json
    web/         Next.js UI
    docs/        this file
  scratch/todo-app/   test target
```

Axernel API runs locally on `http://127.0.0.1:8000`. Sandboxes run on Modal (linux/amd64), so the image must be public in a registry.

## 1. Sandbox image `akshaysasidrn/walkthroughpark-sandbox`

Runtime contract (from Axernel source): `opencode` on PATH with `opencode --version` exactly `1.18.29`; linux/amd64; coreutils; root. The `agent-runtime` binary is static and uploaded per run.

- Base `mcr.microsoft.com/playwright:v<pinned>-noble` (Chromium, browser deps, Node).
- apt: `ffmpeg git gh python3 python3-pil fonts-noto-core jq curl ca-certificates tini`.
- `npm i -g opencode-ai@1.18.29`; build asserts the version string.
- `/opt/walkthrough`: pinned `@argo-video/cli`, `@playwright/test`, `kokoro-js`; `argo.config.mjs` (`captureMode: 'jpeg-stitch'`, 1280x720, loudnorm, `baseURL` from `WTP_BASE_URL`); Kokoro q8 weights downloaded at build; `pregen-tts.mjs`; `burn-subs.py`; `WALKTHROUGH.md`; `demos/sample.*` for smoke tests.
- `wtp-render <name>`: pregen-tts → `argo validate` → `argo pipeline` → burn subs → verify (audio stream present, mean volume not silent, duration <= 120 s, size <= 25 MB, re-encode once at higher CRF if too big) → copy `walkthrough.mp4`, `walkthrough-clean.mp4`, `walkthrough.srt` to `$WTP_OUT` (default `/workspace/artifacts/$RUN_ID`). Non-zero exit prints one line: `WTP_ERROR: <reason>`.

Smoke test: build for amd64, `docker run … wtp-render sample` locally, check the mp4. Then push, pin by digest.

## 2. Bootstrap `bootstrap/setup.ts`

Idempotent. Reads `AXERNEL_BASE_URL`, `GITHUB_TOKEN`, `OPENROUTER_API_KEY`, `WTP_IMAGE_REF`.

1. Login `developer@axernel.com` / `password`; on failure sign up (name `Developer`, org `WalkThroughPark`).
2. Get or create project `HappyWalkthrough`.
3. Secret `github` = `{ token }`.
4. Org model provider via OpenRouter, strong coding model; model id is one constant.
5. Org template from the image digest.
6. Create or update agent `walkthrough-director`.
7. Write `.wtp.json` (ids) next to `web/` and print a long-lived API token hint.

## 3. Agent `walkthrough-director`

- MCP: remote GitHub MCP `https://api.githubcopilot.com/mcp/`, bearer from secret `github.token`. Env `GH_TOKEN` from the same secret.
- Limits: `timeoutSeconds` 2700, `maxSteps` 300.
- Artifacts: `walkthrough.mp4` (required), `walkthrough.srt` (required), `walkthrough-clean.mp4` (optional).

Input:
```json
{ "source": "https://github.com/o/r or .../pull/12", "subdir": "optional/path", "instruction": "optional", "maxSeconds": 60 }
```
Output:
```json
{ "title": "", "summary": "", "understoodFrom": [""], "scenes": [{ "scene": "", "narration": "", "startSec": 0 }],
  "app": { "startCommand": "", "port": 0 }, "durationSec": 0, "caveats": [""] }
```

Instructions, in order: read `/opt/walkthrough/WALKTHROUGH.md`; decide what to demo from explicit instruction, then PR title/body/diff via MCP, then repo agent context (`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.cursor/rules`), then README/docs, then code; pick the shortest path that shows it (3-6 scenes, within `maxSeconds`); clone (PR head when a PR), install, start the app in the background, wait for the port; write `demos/walk.scenes.json` and `demos/walk.demo.ts` with role/text selectors; run `wtp-render walk`; on `WTP_ERROR` fix and retry, at most 3 times; submit. If the app cannot boot or the feature is unreachable, report it in `caveats` instead of faking a video.

One session per walkthrough, checkpointing off.

## 4. Web `web/`

Next.js App Router, TypeScript, `@axernel/sdk` from local path, `better-sqlite3`, hand-written CSS. No auth. Token stays server side.

Routes:
- `POST /api/walkthroughs` → create session + run, insert row.
- `GET /api/walkthroughs/:id/events` → relay run SSE, persist each event, replay from SQLite when the run is terminal.
- `GET /api/walkthroughs/:id` → status + result.
- `GET /api/walkthroughs/:id/video|srt` → artifact proxy with Range.

Screens:
- `/` Gate: link input, optional "what should I show?", duration chips 30/60/90, shelf of past walkthroughs.
- `/w/:id` Walk: left trail of five signposts (Reading, Planning, Booting, Recording, Rendering) inferred from tool activity; right field-notes feed with raw payload toggle; on completion the player with scene chips seeking to `startSec`, understood-from, caveats, downloads, cost. Failure shows a "trail closed" card with retry.

Look: handwritten neobrutalism. Paper background, 2.5px ink borders, hard 4px offset shadows, flat park palette (grass, sky, sun, clay), marker display font plus clean body font, inline SVG doodles, dotted trail line. Single column under 800px.

Pure functions with BDD specs (vitest): `parseSource(url)`, `inferStage(events)`, `toFeedLine(event)`.

## 5. Test target `scratch/todo-app`

Vite + React, localStorage, `npm i && npm run dev`. Short `AGENTS.md` with run steps and main flows. A PR adds "filter by status + clear completed" with a descriptive body. Two acceptance runs: repo URL + instruction, PR URL with no instruction.

## Build order

1. Template image, local smoke test, push.
2. Todo app + PR (parallel with 1).
3. Web UI against the SDK types (parallel with 1).
4. Bootstrap against local Axernel.
5. Live run one: trivial "render sample" to prove the runtime contract on Modal.
6. Live acceptance runs; fix what breaks.

## Accepted gaps

No cancel, no plan approval, no scene redo, one shared GitHub token, apps needing databases or Docker yield a caveat rather than a video.
