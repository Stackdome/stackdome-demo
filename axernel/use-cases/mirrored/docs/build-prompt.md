# Prompt: build Mirrored on Axernel

This is `NEW-USE-CASE-PROMPT.md` filled in for Mirrored as it was actually built
(https://github.com/Stackdome/stackdome-demo, branch `axernel/mirrored`,
folder `axernel/use-cases/mirrored`). Only the machine-specific values are left as `<...>`.
Fill those in, then paste the whole thing into a fresh Claude Code session.

---

## What I want

Product name: `Mirrored`
What the product is: Paste a URL plus either a section name ("pricing cards") or "whole brand".
Get back a React + Tailwind v4 component that was rendered and pixel-compared with the original,
the site's design tokens, and a shadcn registry you can install with one `npx shadcn add` command.
What the agent does inside the sandbox: measures the live page with Playwright (`mir-measure`),
extracts site-wide brand tokens with Dembrandt (`mir-brand`), writes W3C design tokens and a
`registry/<name>.tsx` component, renders and pixel-diffs it against the original (`mir-reflect`),
repeats until the score is 95 or more or the time budget is used, then packs a shadcn registry,
a bundle zip, a preview page, a skin file, a report and the screenshots (`mir-pack`).
Mode `brand` skips the rebuild and returns tokens and a README only.
Shape and stack: web app. Next.js 16 (App Router), React 19, TypeScript, plain CSS, `better-sqlite3`
for the local list of mirrors. Bootstrap is TypeScript run with `tsx`.
Look and feel: Bauhaus. Primary red, yellow, blue on paper white, hard black rules, circles,
squares and triangles as the only decoration, heavy geometric type. Light and dark.

Build it as a standalone app whose only AI backend is my local Axernel, called through
`@axernel/sdk`. The point of the app is to show people how little you have to build when
Axernel runs the agent. Keep that visible in the code.

## My setup (fill in; do not ask me about these again)

- Axernel API: `<your Axernel base URL, e.g. http://127.0.0.1:8000>`
- Axernel source checkout, if local: `<path, or "none: hosted">`
- Axernel login: `<email>` / `<password, or "in .env">`. Create a new project named `Mirror`.
- Sandbox provider: `Modal`
- Model: `deepseek/deepseek-v4.1-flash` via OpenRouter, declared with `inputModalities: ["text", "image"]`
- Where the code goes: `<repo>`, folder `axernel/use-cases/mirrored`
- Branch rule: one feature branch (`axernel/mirrored`), never touch main
- Image registry and namespace: `<e.g. docker.io/myuser>`; image name `mirrored-sandbox`
- Reference implementation to read first: `<path or URL to WalkThroughPark>`. Its sandbox image
  (`<namespace>/walkthroughpark-sandbox`, pinned by digest) is the `FROM` of this one: it already
  has OpenCode 1.18.29, Node, Python 3 with Pillow, Playwright and Chromium.

Rules that hold on any machine:

- Discover, do not assume. Find the SDK, the OpenAPI file, and the expected harness version
  from the Axernel checkout or the running server. Never hardcode an id or version from
  another machine: ids come from bootstrap output (`.mirrored.json`), everything else from env.
- If Axernel is local, check it is running and current before starting; ask before restarting it.
- Never pick a pricier model than the one above without asking me as its own explicit question.
- Secrets go in a gitignored `bootstrap/.env` (mode 600) with a committed `.env.example`.
  Never print, commit, or go looking for keys elsewhere on my machine. The only key is
  `OPENROUTER_API_KEY`, and only if the organisation has no provider for the model yet.
- Sandbox images must be `linux/amd64` (Modal).
- Layout: `template/`, `bootstrap/`, `web/`, `docs/`. Throwaway test targets live outside it.

## How to build it

1. Read the Axernel README and SDK, and WalkThroughPark with its `docs/sdk-usage.md`. Reuse its structure.
2. Give me a short design in chat (agent contract, image contents, screens) and wait for my yes.
   One round of questions at most. Then build; we fix things when they fail.
3. **Template image** (`template/Dockerfile`, 33 lines). `FROM` the WalkThroughPark image by digest, then:
   - Bake in Dembrandt (`dembrandt@0.35.0`) with its own browser in `/opt/dembrandt-browsers`,
     and run it once at build time so nothing downloads during a run.
   - A render harness in `/opt/mirrored/harness`: React 19, Tailwind v4 CLI, tsx, prettier.
   - Four tools on `PATH`: `mir-brand`, `mir-measure`, `mir-reflect`, `mir-pack`, each ending with
     `MIR_OK` or `MIR_ERROR: <reason>`. Cheat-sheet at `/opt/mirrored/MIRRORED.md`, complete
     enough that the agent never reads tool source.
   - Assert in the Dockerfile: `opencode --version` equals what Axernel expects, `import PIL`, `dembrandt --version`.
   - The harness sets its own `HOME` and drops image `ENV`: default every path inside the tool.
   - Heavy, stable layers first; your own scripts last; clean caches in the same `RUN`.
   - Tools fetch and load web fonts themselves. Do not ask the agent to handle fonts.
   - `mir-measure --find "<visible words>"` lists candidate sections; the agent never guesses a selector.
   - Tools print `CLOCK <minutes used>`; instructions say "first render by minute 10, pack by minute 22
     whatever the score". Without this the agent polishes until the 30 minute timeout.
   - Tools still put everything in words and numbers (score, REGION lines with boxes, colours, missing
     text). With image input declared, the agent may also open `original.png` and `diff.png` itself.
   - Pin the image by digest in `bootstrap/.env` (`MIR_IMAGE_REF`). Version-bump on every rebuild.
   - Test every tool locally against a real page before spending a run on it.
4. **Split rule:** tool mechanics go in the image (minutes to rebuild and push). Guidance that needs
   iterating goes in the agent instructions, published with `npm run setup` (seconds).
   Templates are immutable: a new digest makes a new template, named after the digest.
5. **Bootstrap** (`bootstrap/`): `shared.ts` has idempotent `ensureProject`, `ensureModelProvider`,
   `ensureTemplate`, `ensureAgent`; `agent.ts` holds instructions, schemas, artifacts, limits;
   `setup.ts` writes ids to gitignored `.mirrored.json`. `npm run mirror -- <url> <mode> <target>` runs the
   agent once and polls with `runs.wait`; `npm run artifacts -- <runId>` downloads a run's files.
   - Agent `mirror-maker`, harness `opencode`, limits `timeoutSeconds: 1800`, `maxSteps: 200`, no secrets, no MCP.
   - Input `{ url, mode: "section" | "brand", target?, framework?: "react" }`.
     Output `{ title, summary, chosenSelector, matchScore, passes, tokenCount, components, fonts, mismatches, caveats }`.
   - Ten artifacts, all `required: false`: bundle.zip, registry.zip, tokens.json, preview.html, skin.json,
     report.html, original.png, rebuild.png, diff.png, page.png. A failed mirror still submits honest `caveats`.
   - Contract schemas may only use keywords in `capabilities.schemaProfile` (no `description`).
   - The model provider belongs to the organisation. Reuse the one WalkThroughPark created; on reuse call
     `modelProviders.update(id, { inputModalities: ["text", "image"] })`. The stored token is write-only.
   - Sign up only on `AuthenticationError`, never on any error.
6. **The app** (`web/`): every Axernel call lives in ONE gateway file, `web/lib/server/axernel.ts`
   (start run, read run, stream events, download artifact). Everything else is actions, calculations,
   data, Grokking Simplicity style. Credentials stay server-side.
   - Name every session: `metadata: { axernel: { title } }`. One session per mirror.
   - Idempotency keys on session and run creation (`mir-session-<id>`, `mir-run-<id>`).
   - Pass a long timeout to `runs.events` and reconnect from the last sequence.
   - Runs take 13 to 25 minutes. Show progress from the event stream and let the user leave and come back.
   - Install the SDK with `file:` plus `.npmrc install-links=true` and `serverExternalPackages`.
7. **Interface.** Use the frontend taste skill through a subagent. What Mirrored has:
   - Bauhaus design system in one `globals.css`; light/dark toggle in the top bar.
   - Top bar on every page: wordmark, Archive link, theme toggle, a subtle "powered by Axernel".
   - Home is a split poster: the pitch and shapes on one half, the form (URL, section or whole brand) on the other. No scroll on a laptop.
   - `/archive` is a grid of past mirrors with score and status.
   - `/m/<id>` is a two-pane workbench. Left: a compare slider (original against rebuild, diff overlay) and a
     screenshots modal. Right: code panel with the `npx shadcn add <registry url>` command and the component
     source, tokens panel, and field notes (score, passes, mismatches, caveats). While running it shows the live feed.
   - WEAR IT button: re-skins the whole app from the mirror's `skin.json` until you take it off.
   - `/r/<id>/<file>` serves the registry JSON so the shadcn command works against the local app.
8. **Tests:** BDD-style specs on calculations only. No e2e suite. `npm run typecheck` runs clean.
9. **Prove it** with real runs against local Axernel and look at the result yourself (open preview.html,
   look at diff.png). Report duration, tokens, and cost per run. Every POST that starts a run costs money: do not loop on them.
10. When it works: refactor pass with a subagent for readability of the SDK usage, write
    `docs/sdk-usage.md`, commit, push, close finished subagents.

## The sales artifact (do this last)

Publish an artifact titled "Mirrored on Axernel" that lets us sell Axernel with this app.
Pictures over prose. Use Axernel brand tokens (orange `#FF6007`, Fraunces, Geist, JetBrains Mono).
Source goes in `docs/architecture-artifact.src.html`. It must contain:

- the request path as one diagram, with Axernel's part tinted and labelled as not built by us
- "what we wrote" against "what Axernel ran", with line counts from `wc -l`
- the agent as a contract: real input, output, and artifact JSON
- how the template was used: Dockerfile to digest to template to agent revision to session,
  and the image-versus-instructions rule
- a table of every SDK call, each linked to its exact line on GitHub, pinned to a commit
- the run lifecycle and a table of the real runs with duration, tokens, cost, including the failed ones
- links to the Axernel console pages (on the base URL above) for this agent, template, a session, usage, model providers
- what Axernel gave us for free, each point backed by something that actually happened
- any platform change the app caused (here: `inputModalities` on model providers)
- a collapsed list of rough edges for the platform team

## How to work with me

- Keep replies short. Plain English. Say what is verified and what is not.
- Use subagents for independent pieces; close them when done.
- If something fails, diagnose and fix; do not stop to ask unless it needs my key, my money,
  or a restart of my server.
- Save anything non-obvious you learn about Axernel to memory.
