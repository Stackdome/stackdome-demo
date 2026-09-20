# How WalkThroughPark uses the Axernel SDK

Two programs use `@axernel/sdk`. `bootstrap/` runs once and sets Axernel up. `web/` runs all the time and starts one run per walkthrough. They share one file, `.wtp.json`, written by the first and read by the second.

## Layers in `web/`

```
app/api/**/route.ts, app/**/page.tsx      HTTP in, HTTP out. No SDK, no SQL.
        |
lib/server/walkthroughs.ts                use cases: startWalkthrough, readWalkthrough,
        |                                 listWalkthroughs, artifactFile, eventFeed, pump
        |---- calculations ----           lib/server/walkCalc.ts, lib/walkRequest.ts, lib/parseSource.ts
        |
axernel.ts | db.ts | artifactCache.ts | github.ts | config.ts     gateways (actions)
        |
@axernel/sdk | better-sqlite3 | node:fs | fetch
```

Actions are anything that depends on when it runs: the gateways, and the use cases that sequence them. Calculations take values and return values; they hold every decision (is the run settled, which artifact id, is this control frame a repeat, reconnect or stop). Data is `lib/types.ts` and the `WalkRow` in `db.ts`.

## SDK calls in `web/` (all in `lib/server/axernel.ts`)

| SDK call | Gateway function | Triggered by | Why |
|---|---|---|---|
| `auth.login` | `login` (private) | First SDK call after the server starts, and once more after any `AuthenticationError` | Turns the email and password in `.wtp.json` into a token. The client is cached on `globalThis` so dev reloads share it. |
| `sessions.create` | `startRun` | `POST /api/walkthroughs` via `startWalkthrough` | One session per walkthrough. A session pins the agent revision, so re-running setup never changes a run in flight. Idempotency key `wtp-session-<id>`. The API has no session name, so the title from `sessionTitle` goes in `metadata.axernel.title`, which the Axernel UI reads; `metadata.walkthroughId` sits beside it. |
| `runs.create` | `startRun` | same | Starts the agent with `input.data` built by `runInputData`. Idempotency key `wtp-run-<id>`, so the auth retry cannot start a second paid run. |
| `runs.get` | `readRun` | `refreshWalk`: any read of an unsettled walkthrough (page, `GET /api/walkthroughs/:id`, artifact request) and after every pump connection | Copies status, result, error, usage and artifact outputs into SQLite through `runFields`. Once a row is settled this call is never made again for it. |
| `runs.events` | `streamRunEvents` | `pump`, started by `startWalkthrough` or by the first browser that tails an unfinished walkthrough | The SDK applies its request timeout to the whole stream, so the gateway passes one hour and the pump reconnects with `lastEventId` set to the last stored sequence. |
| `artifacts.download` | `downloadArtifact` | First `GET .../video` or `.../srt` for a walkthrough | Returns the whole file in memory, no ranges. `artifactFile` caches it under `.data/artifacts/<id>/` and `serveFile.ts` serves ranges from disk. |

`isRunGone(error)` wraps `NotFoundError` so the pump needs no SDK import. The only other SDK import outside the gateway is `APIError` in the POST route, used to word the error message, and the `Run` type in `walkCalc.ts`.

Login renewal: `withClient` retries the work once after an `AuthenticationError`. The event stream does not retry inside the gateway; it drops the cached client and throws, and the pump counts it as one failure and reconnects.

## The event pump (`walkthroughs.ts`)

A walkthrough is pumping exactly while it has an entry in the `pumps` map; `ensurePump` is the only writer. Each loop turn is: stream events into SQLite, refresh the run, then ask `nextPumpStep(status, failures)`. It answers `stop` (`walk-gone`, `run-finished`, `gave-up` after 8 failures in a row) or `reconnect` after a backoff of 1 s doubling to 15 s. Any received event resets the failure count. Browsers never talk to Axernel; they tail SQLite and listen to the pump's `event` and `done` signals.

## SDK calls in `bootstrap/`

`shared.ts` is settings, then calculations (`providerName`, `templateName`, `pricingPerMillion`, `secretCredential`, `githubMcpRemote`, `templateRequest`), then one "ensure" action per resource. `agent.ts` is the agent's data plus `directorConfiguration`. `setup.ts` and `smoke.ts` are the scripts that sequence them.

| SDK call | Function | Why |
|---|---|---|
| `auth.login`, `auth.signup` | `authenticate` | Log in; sign up the developer and org only if login fails. |
| `projects.iterate`, `projects.create` | `ensureProject` | Find project `HappyWalkthrough` by name or create it. The API has no find-by-name, so `iterate` pages through all. |
| `secrets.iterate`, `create`, `update` | `ensureGithubSecret` | Secret `github` holds `GITHUB_TOKEN`. Secret data is write-only, so a re-run always overwrites it. |
| `modelProviders.getPlatform` | `ensureModelProvider` | Without `OPENROUTER_API_KEY`, use the installation's platform provider. |
| `modelProviders.iterate`, `create`, `update` | `ensureModelProvider` | With the key, an org provider named after the model. Pricing comes from OpenRouter, converted to USD per million tokens. |
| `templates.iterate`, `templates.create` | `ensureTemplate` | Templates are immutable, so the name carries the image digest and a new digest makes a new template. |
| `agents.iterate`, `create`, `update` | `ensureAgent` | Create the agent or revise it. `update` sends `expectedRevision` as `If-Match`. |
| `sessions.create`, `runs.create`, `runs.wait` | `smoke.ts` only | Starts one run of the smoke agent and polls it. The session title is set the same way, through `metadata.axernel.title`. Polling, not `runs.events`, because a first image pull outlasts the stream timeout. |

`setup.ts` also fetches `/openapi.yaml` (`serverHasMcpAuthentication`) and passes the answer to `githubMcpRemote`, which picks the `authentication` shape or the older `headerBindings` shape for the GitHub MCP server.
