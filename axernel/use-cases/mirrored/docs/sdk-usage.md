# How Mirrored uses the Axernel SDK

Two programs use `@axernel/sdk`. `bootstrap/` runs once and sets Axernel up. `web/` runs all the time and starts one run per mirror. They share one file, `.mirrored.json`, written by the first and read by the second.

## Layers in `web/`

```
app/api/**/route.ts, app/r/**/route.ts, app/**/page.tsx    HTTP in, HTTP out. No SDK, no SQL.
        |
lib/server/mirrors.ts                     use cases: startMirror, readMirror, listMirrors,
        |                                 artifactFile, registryFile, eventFeed, pump
        |---- calculations ----           lib/server/mirrorCalc.ts, lib/mirrorRequest.ts, lib/registry.ts
        |
axernel.ts | db.ts | artifactCache.ts | config.ts          gateways (actions)
        |
@axernel/sdk | better-sqlite3 | node:fs
```

Actions depend on when they run: the gateways, and the use cases that sequence them. Calculations take values and return values, and hold every decision (is the run settled, which artifact id, is this control frame a repeat, reconnect or stop). Data is `lib/types.ts` and the `MirrorRow` in `db.ts`.

## SDK calls in `web/` (all in `lib/server/axernel.ts`)

| SDK call | Where | Triggered by | Why |
|---|---|---|---|
| `auth.login` | `login`, `axernel.ts:87` | First SDK call after the server starts, and once more after an `AuthenticationError` | Turns the email and password in `.mirrored.json` into a token. The client is cached on `globalThis` so dev reloads share it. |
| `sessions.create` | `startRun`, `axernel.ts:35` | `POST /api/mirrors` via `startMirror` (`mirrors.ts:14`) | One session per mirror. A session pins the agent revision, so re-running setup never changes a run in flight. Idempotency key `mir-session-<id>`. The API has no session name, so the title from `sessionTitle` goes in `metadata.axernel.title`, which the Axernel UI reads. |
| `runs.create` | `startRun`, `axernel.ts:40` | same | Starts the agent with `input.data` from `runInputData`. Idempotency key `mir-run-<id>`, so the login retry cannot start a second paid run. |
| `runs.get` | `readRun`, `axernel.ts:45` | `refreshMirror` (`mirrors.ts:33`): any read of an unsettled mirror, and after every pump connection | Copies status, result, error, usage and artifact outputs into SQLite through `runFields`. A settled row never asks again. |
| `runs.events` | `streamRunEvents`, `axernel.ts:53` | `pump` (`mirrors.ts:127`) | The SDK applies its timeout to the whole stream, so the gateway passes one hour and the pump reconnects with `lastEventId` set to the last stored sequence. |
| `artifacts.download` | `downloadArtifact`, `axernel.ts:61` | First request for an artifact, via `artifactFile` (`mirrors.ts:52`) | Returns the whole file in memory. It is cached under `.data/artifacts/<id>/` and `serveFile.ts` serves it from disk. |

`isRunGone` wraps `NotFoundError` so the pump needs no SDK import. Outside the gateway only a type (`Run`, in `mirrorCalc.ts`) and an error class (`APIError`, in the POST route) are imported. `withClient` retries once after an `AuthenticationError`; the event stream does not, it drops the client and lets the pump count one failure.

## The request path

1. `GateForm.tsx` posts `{url, mode, target}` to `POST /api/mirrors`. `parseMirrorRequest` checks it and always sets `framework: "react"`.
2. `startMirror` makes an id, calls `startRun`, stores the row (`newMirrorRow`) and starts the pump.
3. Axernel starts a sandbox from the template and runs `mirror-maker` in it with `input.data`.
4. The pump copies `runs.events` into SQLite. After each connection it refreshes the run and asks `nextPumpStep`: stop, or reconnect after 1 s doubling to 15 s, giving up after 8 failures in a row.
5. The browser never talks to Axernel. `/api/mirrors/:id/events` tails SQLite as SSE; `inferStage` and `toFeedLine` turn events into the five steps and the field notes.
6. When the run is terminal and no artifact is pending, the row is settled. Artifacts are fetched on first ask and served from disk.

## What bootstrap creates (`npm run setup`)

`shared.ts` is settings, then calculations, then one "ensure" action per resource: find by name, else create or update. `setup.ts` sequences them and writes `.mirrored.json`.

| Resource | SDK calls | Notes |
|---|---|---|
| Account | `auth.login`, `auth.signup` (`shared.ts:78`) | Sign up only when login is rejected. |
| Project `Mirror` | `projects.iterate`, `create` (`:90`) | No find-by-name in the API, so `iterate` pages through all. |
| Model provider | `modelProviders.iterate`, `update`, `create` (`:109`) | Providers belong to the organisation, so the one WalkThroughPark made is reused by name. A key in `.env` replaces its token; no key leaves it alone. |
| Template | `templates.iterate`, `create` (`:126`) | Immutable, so the name carries the image digest. `MIR_IMAGE_REF` must be a digest reference. |
| Agent `mirror-maker` | `agents.iterate`, `create`, `update` (`:132`) | `update` sends `expectedRevision`. Configuration comes from `agent.ts`: OpenCode harness, instructions, input contract `{url, mode, target?, framework?}`, output contract (title, summary, chosenSelector, matchScore, passes, tokenCount, components, fonts, mismatches, caveats), limits of 30 minutes and 200 steps, and ten artifacts, none required, so a failed mirror can still submit its caveats. |

`mirror.ts` runs the agent once from the command line (`sessions.create`, `runs.create`, `runs.wait`; it polls because a long run outlasts the stream timeout). `fetch-artifacts.ts` saves a run's files (`runs.get`, `artifacts.download`).

## Artifacts and what the UI does with each

| Name | File | Use in `web/` |
|---|---|---|
| `bundle` | `bundle.zip` | Download link in "Get the code". |
| `registry` | `registry.zip` | Unpacked once; `GET /r/<id>/<file>.json` serves it with CORS for `npx shadcn add`. Also feeds the copy-paste code blocks and the `@theme` block. |
| `tokens` | `tokens.json` | Tokens panel. `flattenTokens` reads our shape and Dembrandt's. |
| `preview` | `preview.html` | The Live switch: an `<iframe sandbox="">` at desktop or phone width. |
| `skin` | `skin.json` | The Wear it button. Every value is validated in `lib/skin.ts` and set with `style.setProperty` only. |
| `report` | `report.html` | Brand mode: the main pane. Section mode: a "Site report" link. |
| `original`, `rebuild`, `diff` | PNG | The comparison slider and the screenshots strip. |
| `page` | `page.png` | Screenshots strip, and the fallback picture when there is no rebuild. |

Every artifact is served with `Content-Security-Policy: sandbox` and `nosniff`, because an agent wrote it from someone else's page.

## Image versus instructions

The sandbox image (`template/`) holds what must be exact and repeatable. `bootstrap/agent.ts` holds judgement. Changing a tool means a new image and template; changing guidance is only `npm run setup`.

| In the image | Does |
|---|---|
| `mir-brand` | Runs Dembrandt over the whole site: site tokens, `theme.css`, `shadcn.css`, `report.html`. |
| `mir-measure` | Screenshots the page or one element, dumps DOM with computed styles, counts, fonts, text positions. |
| `mir-reflect` | Renders `registry/preview.tsx` for real, screenshots it, scores it with `mir-diff.py`, prints SIZE, BOX, TEXT and REGION lines. |
| `mir-pack` | Builds `tokens.css`, `theme.css`, `theme.js`, the shadcn registry, `preview.html`, `skin.json` and `bundle.zip`, and fills the artifact directory. |
| `MIRRORED.md` | File formats and folder layout, read by the agent first. |

The instructions say which tool to run when, how to pick the section, how to write the component, to fix the largest difference first, to stop at four passes or a score of 95, and that `matchScore` comes from the tool, never from the agent's own judgement.
