# Prompt: build a new showcase app on Axernel

Fill in the `<...>` blocks, then paste the whole thing into a fresh Claude Code session.
It was distilled from building WalkThroughPark, the reference implementation
(https://github.com/Stackdome/stackdome-demo, branch `axernel/walkthroughpark`,
folder `axernel/use-cases/walkthroughpark`).

---

## What I want

Product name: `<Name>`
What the product is: `<one sentence: what the user gives it, and what they get back. e.g. "Drop a GitHub repo or PR link, get a short narrated demo video of it.">`
What the agent does inside the sandbox: `<the work: tools it runs, files it produces>`
Shape and stack: `<web app, CLI, Slack/Discord bot, browser extension, backend job, mobile... and the language/framework, or "you choose">`
Look and feel (if it has a UI): `<theme, e.g. "handwritten neobrutalism, like WalkThroughPark">`

Build it as a standalone app whose only AI backend is my local Axernel, called through the
Axernel SDK for the chosen language (`@axernel/sdk` for TypeScript; if no SDK exists for the
language, call the REST API from `openapi.yaml` behind the same single-file gateway).
If I wrote "you choose", pick the smallest stack that fits the product and tell me in the design.

The point of the app is to show people how little you have to build when
Axernel runs the agent. Keep that visible in the code.

## My setup (fill in; do not ask me about these again)

- Axernel API: `<base URL, e.g. http://127.0.0.1:8000 or a hosted one>`
- Axernel source checkout, if local: `<path, or "none: hosted">`
- Axernel login: `<email>` / `<password, or "in .env">`. Create a new project named after the product.
- Sandbox provider: `<Modal, Docker, ...>`
- Model: `<provider/model, e.g. deepseek/deepseek-v4.1-flash via OpenRouter>`
- Where the code goes: `<repo, or "new repo", and folder inside it>`
- Branch rule: `<e.g. one feature branch, never touch main>`
- Image registry and namespace, if a custom image is needed: `<e.g. docker.io/myuser>`
- Reference implementation to read first: `<path or URL to WalkThroughPark, or "none">`

Rules that hold on any machine:

- Discover, do not assume. Find the SDK, the OpenAPI file, and the expected harness version
  from the Axernel checkout or the running server's `/openapi.yaml` and capabilities
  endpoint. Never hardcode a path, id, or version from another machine into the code:
  ids come from bootstrap output, everything else from env.
- If Axernel is local, check it is running and current before starting; ask before restarting it.
- Never pick a pricier model than the one above without asking me as its own explicit question.
- Secrets go in a gitignored `.env` next to the bootstrap (mode 600), with a committed
  `.env.example`. Never print, commit, or go looking for keys elsewhere on my machine.
  Tell me which keys you need, up front.
- Sandbox images must match the provider's platform (Modal: `linux/amd64`).
- Suggested layout inside the product folder: `template/`, `bootstrap/`, `app/`, `docs/`
  (`app` is whatever the product is: web, cli, bot...). Throwaway test targets live outside it.

## How to build it

1. Read the Axernel README and SDK, and the reference implementation with its
   `docs/sdk-usage.md` if I gave one. Reuse its structure unless the product needs something else.
2. Give me a short design in chat (shape and stack, agent contract, image contents, screens or commands) and wait for my yes.
   One round of questions at most. Then build; we fix things when they fail.
3. **Template image** only if the agent needs tools the general image lacks. Rules learned the hard way:
   - `opencode --version` must equal the version Axernel expects; assert it in the Dockerfile.
   - The harness sets its own `HOME` and drops image `ENV`. Any path a tool needs must be
     defaulted inside the wrapper script, not in `ENV`.
   - Wrap the tool chain in ONE script on `PATH` that ends with `<PREFIX>_OK` or
     `<PREFIX>_ERROR: <reason>`, so the agent gets one clear line to act on.
   - The OpenCode bash tool blocks for its full timeout on a process that stays alive.
     The agent's cheat-sheet must say: start servers detached and give that call a 10s timeout.
   - Pin the image by digest in the bootstrap `.env`. Version-bump on every rebuild.
   - Before writing a tool, look for an open-source one that already does the job and bake it in.
   - The model cannot see images (the harness declares it text only). Tools must put everything
     in words and numbers: scores, boxes with coordinates, colours, missing or extra text.
     The cheat-sheet must be complete enough that the agent never reads tool source.
   - Anything a tool downloads at run time (a browser, a model) goes in at build time, in its
     own folder. A run-time browser install can garbage-collect the one the other tools use.
   - Order Dockerfile layers heavy-and-stable first, your own scripts last, and clean caches in
     the same `RUN`. Otherwise every script edit re-uploads a gigabyte.
   - Long-running tools print a `CLOCK <minutes used>` line and the instructions carry a time
     budget ("pack by minute N whatever the score"). Without it the agent polishes until timeout.
   - Do not make the agent guess a CSS selector. Let it find a page section by its visible words.
   - Test every tool locally against a real input before spending a run on it.
4. **Split rule:** tool mechanics go in the image (minutes to rebuild). Guidance that needs
   iterating goes in the agent instructions, published with `npm run setup` (seconds).
5. **Bootstrap** (`bootstrap/`): idempotent `ensure*` actions for project, secret, model
   provider, template, agent; writes ids to a gitignored config file the app reads.
   Bootstrap may stay TypeScript even when the app is not; it is a setup script, not the product.
   Plus one `smoke` script that runs the agent once and polls with `runs.wait`.
   - Contract schemas may only use keywords in `capabilities.schemaProfile` (no `description`).
   - Make artifacts `required: false` and have the agent report honest `caveats`.
   - Sign up only on `AuthenticationError`, never on any error.
6. **The app**, in whatever stack was chosen: every Axernel call lives in ONE gateway file
   (in WalkThroughPark it is `web/lib/server/axernel.ts`: start run, read run, stream events,
   download artifact). Everything else is plain calculations and use cases, Grokking
   Simplicity style: actions, calculations, data. Credentials stay server-side or on the
   user's machine; never ship the Axernel login to a browser or a public client.
   - Name every session: `metadata: { axernel: { title } }`.
   - Use idempotency keys on session and run creation.
   - The SDK's default request timeout kills long event streams: pass a long timeout and
     reconnect from the last sequence.
   - Runs take minutes. Whatever the surface, show progress from the event stream and let
     the user leave and come back to a finished result.
   - TypeScript only: install the SDK with `file:` plus `.npmrc install-links=true`
     (and `serverExternalPackages` under Next.js).
7. **Interface.** If it has a visual UI, use the frontend taste skill through a subagent.
   If it is a CLI or bot, design the commands, progress output, and error messages with the
   same care, and keep "powered by Axernel" in help text or the bot's footer.
   Web defaults that I asked for last time:
   product name centred at the top with a subtle "powered by Axernel" under it; past items in
   a side rail where only the list scrolls and the scrollbar is hidden; detail views tabbed,
   not one long page; home page fits one laptop screen with no scroll in either direction;
   a few themed doodles.
8. **Tests:** BDD-style specs on calculations only. No e2e suite. The stack's typecheck or linter runs clean.
9. **Prove it** with real runs against local Axernel, and look at the result yourself
   (watch the video, open the file). Report duration, tokens, and cost per run.
   Every POST that starts a run costs money: do not loop on them.
10. When it works: refactor pass with a subagent for readability of the SDK usage, write
    `docs/sdk-usage.md`, commit, push, close finished subagents.

## The sales artifact (do this last)

Publish an artifact titled "`<Name>` on Axernel" that lets us sell Axernel with this app.
Pictures over prose. Use Axernel brand tokens (orange `#FF6007`, Fraunces, Geist, JetBrains Mono).
It must contain:

- the request path as one diagram, with Axernel's part tinted and labelled as not built by us
- "what we wrote" against "what Axernel ran", with line counts
- the agent as a contract: real input, output, and artifact JSON
- how the template was used: Dockerfile to digest to template to agent revision to session,
  and the image-versus-instructions rule
- a table of every SDK call, each linked to its exact line on GitHub, pinned to a commit
- the run lifecycle and a table of the real runs with duration, tokens, cost
- links to the Axernel console pages (on the base URL above) for this agent, template, a session, usage, secrets
- what Axernel gave us for free, each point backed by something that actually happened
- a collapsed list of rough edges for the platform team

## How to work with me

- Keep replies short. Say what is verified and what is not.
- Use subagents for independent pieces; close them when done.
- If something fails, diagnose and fix; do not stop to ask unless it needs my key, my money,
  or a restart of my server.
- Save anything non-obvious you learn about Axernel to memory.
