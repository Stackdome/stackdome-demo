---
name: use-stackdome
description: Use for any Stackdome operation on a project deployed on, or targeting, Stackdome — first-time setup and deploy, shipping a change, checking whether an app is up, tailing logs, debugging a failed build or a crashing resource, scaling replicas, adding a worker or a cron job, custom domains and TLS certificates, preview environments for pull requests, managing secrets and environment variables, provisioning Postgres or a volume, database backups, minting API tokens, cancelling or rolling back a release, pointing the CLI at a self-hosted instance, or tearing a stack down. Use whenever the repo targets Stackdome — a stackfile.yaml or a Stackdome URL is enough — even if the user never says "Stackdome".
allowed-tools: Bash(stackdome:*), Bash(curl:*)
---

# Use Stackdome

Stackdome is an application-delivery platform. You drive it through the `stackdome` CLI — never by editing cluster resources directly, and never by presenting Kubernetes as a user concern.

## Deploy this repo now

Zero-to-URL for the common case: a git-hosted repo, checked out locally, no persisted Stackdome auth yet, targeting Stackdome Cloud (the default target for this path). Forks to [Reference](#reference) only where the path branches (private repo, self-hosted target, no git remote, existing image).

Every step below except the version check sets `export STACKDOME_PROJECT=default` before its `stackdome` calls — Cloud needs it, or those commands exit `3` with `Resource not found` (see [Verified state](#verified-state-v002-alpha-checked-2026-08-09) for why). **Targeting self-hosted instead? Each step marks that line — drop it there. Self-hosted does not need it, and dropping it is what keeps the command matching `Bash(stackdome:*)` and pre-approved; leaving it in forces a permission prompt for nothing.**

1. **CLI + auth, one call:**

   ```bash
   stackdome version
   export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
   stackdome doctor -o json
   ```

   No CLI? The docs install URL 404s (release repo is private) — get the user's go-ahead, then install the verified way:

   ```bash
   gh release download <tag> -R Stackdome/stackdome-cli -p '*_darwin_arm64.tar.gz'
   tar -xzf *_darwin_arm64.tar.gz && install -m 755 stackdome ~/.local/bin/
   ```

   No credential? `stackdome login --url <instance-url> --token <token>`, token from `<instance-url>/settings/api-tokens`. Full flow: [Authenticate](#authenticate).

2. **Choose the source — zero questions when a GitHub remote resolves:**

   ```bash
   git remote -v 2>/dev/null | head -1
   gh repo view --json visibility -q .visibility 2>/dev/null
   ```

   `PUBLIC` → set `build.repo` to the HTTPS clone URL + `branch:`, silently. `PRIVATE` → same, plus a one-time org git-integration credential verified before deploying — still zero questions. No remote, or no Dockerfile → ask which of the four source types applies. Detail: [Choose the source](#choose-the-source).

3. **Generate and gate the stackfile:**

   ```bash
   export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
   stackdome init
   stackdome validate
   ```

   Loop step 3 until `validate` exits `0`. Fill any gaps `init` could not infer (env vars, ports) from the Dockerfile or compose file.

4. **Deploy — validate and deploy fused into one call:**

   ```bash
   export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
   stackdome validate && stackdome deploy --wait -o json
   ```

   Retain `release.id` (call it `R`) from the output — every check below needs it.

5. **Verify — one batched call**, substituting the stack name:

   ```bash
   export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
   stackdome status --stack <name> -o json > /tmp/st.json && python3 -c "
   import json; d=json.load(open('/tmp/st.json'))
   s=d['stack']; c=s.get('converged_release') or {}; l=s.get('latest_release') or {}
   print('converged', c.get('id'), c.get('state'), c.get('health'))
   print('latest   ', l.get('id'), l.get('state'))
   for n,r in (d['live_status'].get('resources') or {}).items():
       cs={x['type']:x['status'] for x in r.get('conditions',[])}
       print(n, 'Available=', cs.get('Available'), 'Converged=', cs.get('Converged'))
   " && stackdome open --stack <name> -o json
   ```

   The `&&` chain stops the sequence on a failed `status` instead of letting `python3` throw on a truncated file while `open` still prints a URL next to the traceback. `open` takes no resource argument — naming one would exit `3` on a stack without one by that name.

   Then confirm the URL actually serves, using the `target` from `open`'s output:

   ```bash
   curl -fsS -o /dev/null -w '%{http_code}\n' --max-time 10 <target>
   ```

   **Report success only when every one of these holds:** `converged_release.id == R == latest_release.id`, both state `Released`, health `ok`, every resource `Available=true`/`Converged=true`, and the curl prints `200`. Any other combination — full decision table at [Verification contract](#verification-contract); a broken resource → [Debug](#debug).

Debugging, scaling, secrets, rollback, domains, previews, and everything else not on this path: [Reference](#reference), routed by the [table](#routing) at its top.

## Reference

### Verified state (v0.0.2-alpha, checked 2026-08-09)

Facts confirmed by direct observation. Trust these over inference; they cost ~20 tool calls to rediscover.

- **Cloud is `https://stackdome.io`.** `cloud.stackdome.com` does not resolve (NXDOMAIN); `cloud.stackdome.io` and `app.stackdome.io` serve Traefik's self-signed default certificate and fail TLS verification.
- **The CLI install URL in the docs 404s** — the release repo is private. Use the verified `gh release download` steps in [Deploy this repo now](#deploy-this-repo-now) step 1.
- **On Cloud, every project-scoped command needs `export STACKDOME_PROJECT=default` set first** — everything except `stackdome version` (no server call) and `stackdome login` (runs before project context exists). Narrower than [Authenticate](#authenticate)'s "don't use env vars" guidance, which covers persisted auth state (`STACKDOME_URL` / `STACKDOME_TOKEN` / `STACKDOME_ORG`) that `stackdome login` writes once. Root cause: Cloud's `/users/current/projects` returns membership objects the CLI decodes as an empty project name (stackdome-cli#7), so without it those commands exit `3` with `Resource not found`. On a local/self-hosted instance the server still returns the old empty-list shape, the CLI's fallback fires, and the project resolves correctly — **that asymmetry is why a loop measured only against localhost would never observe this fact and would strip it as dead weight.** Until #7 ships, set it before every such Cloud command: `export STACKDOME_PROJECT=default`. Cost: forfeits the `stackdome`-prefix pre-approval under `Bash(stackdome:*)` ([Authenticate](#authenticate)) and disables persisted stack selection, so `--stack <name>` becomes mandatory — self-hosted readers should drop the line rather than pay that cost for nothing.
- **`deploy` has no `--stack` flag.** The stack name comes from `name:` in the stackfile. `status`, `open`, `logs`, and `release *` do take `--stack`.
- **`status -o json` returns `{"stack": {...}, "live_status": {...}}`.** Release state is at `.stack.converged_release` / `.stack.latest_release`; per-resource readiness is at `.live_status.resources.<name>.conditions[]`, a map keyed by resource name, not a list.
- **`open -o json` returns `{"target": "<url>", "urls": [...]}`.**
- **Plain HTTP servers need `--insecure` on `login`**, or it refuses.
- **Alpha scope: one organization, its default project, one connected cluster** — and no selector for any of them. **Do not present organization, project, or cluster as a deployment choice.** Cloud is ephemeral and capacity-limited; self-hosted uses the identical stackfile and CLI workflow.
- **Env values are literal.** `${VAR:-default}` from a compose file is not interpolated; substitute real values. Cross-resource references use `{{ <resource>.url }}` and `{{ self.public_url }}` — `stackdome init` does not generate these, and a hardcoded `redis://redis:6379` is wrong.

This file carries the procedure — what to run, in what order, and how to tell whether it worked. It does not carry reference detail. When you need a flag, a schema, a full failure explanation, or an endpoint, fetch it: https://docs.stackdome.com/llms.txt indexes every docs page and every API endpoint, each as its own `.md`. Canonical agent guide: https://docs.stackdome.com/guides/ai-agents.md. **Not everything is in the CLI** — custom domains and preview-environment enablement have no command yet. See [When the CLI has no command](#when-the-cli-has-no-command) for the API-first workaround. **Never invent a CLI command** — a plausible-looking guess exits `4` and wastes the user's time.

#### Batched commands

Each of these is one tool call; prefer them over running the parts separately. The probe, validate+deploy, and verify+open calls also appear as steps 1, 4, and 5 of [Deploy this repo now](#deploy-this-repo-now) — this section adds only what that walkthrough doesn't cover.

```bash
stackdome version
export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
stackdome doctor -o json; ls stackfile.yaml 2>/dev/null
```

`stackdome validate && stackdome deploy --wait -o json` — same call as golden-path step 4 (with its `export STACKDOME_PROJECT=default` for Cloud), also shown at [Scale](#scale). Batching the probe doesn't change what counts as success — judge it against [Verification contract](#verification-contract).

### Output contract

`-o json|yaml` (default `table`) is global. With it, **stdout carries only the structured result**; prompts, progress, and warnings go to stderr. Parse stdout, keep stderr for diagnostics. Three commands do not honour it. Assuming they do is the most common way to misreport state:

- `logs` writes raw application log lines to stdout — `-o json` does not wrap them in a schema.
- `restart` emits no structured result at all.
- `status --conditions` changes **table rendering only**. `status --conditions -o json` returns the same object as plain `status`, with no condition history. Read conditions in table mode.

**Never use `--follow` or `--watch`.** You have no way to interrupt a running command, so anything that does not return on its own hangs your session. `status --watch` never returns — it is an unbounded refresh loop. `logs -f` follows a live process, so it returns only when that process stops. `build logs -f` and `release events -f` do end on their own, but not until the build or release reaches a terminal state, which can be many minutes of a blocked session. Poll with bounded reads instead: `--since 15m --tail 200`, run again for a newer window. Exit codes: `0` success, `1` general error, `2` auth/authorization, `3` not found, `4` invalid input or usage, `5` conflict, `130` canceled — including a confirmation the user declined.

### Routing

| User wants to… | Go to |
|---|---|
| First-time setup on a fresh or unknown instance | [Authenticate](#authenticate) → [Author the stackfile](#author-the-stackfile) → [Deploy](#deploy) |
| Ship a change | [Deploy](#deploy) |
| Know whether the app is up | [Observe](#observe) |
| Read logs | [Observe](#observe) |
| Debug a failed build | [Debug](#debug) → build failed |
| Debug a crashing or unhealthy resource | [Debug](#debug) → resource unhealthy |
| Debug a release that isn't progressing | [Debug](#debug) → release stuck |
| Run more or fewer copies of a resource | [Scale](#scale) |
| Add a background worker, a one-off job, or a cron job | [Workload types](#workload-types) |
| Grow a database or a volume | [Scale](#scale) |
| Get a public URL for the app | [Public URLs, domains, and TLS](#public-urls-domains-and-tls) |
| Add a custom domain, or fix a certificate | [Public URLs, domains, and TLS](#public-urls-domains-and-tls) — API, no CLI command |
| Set up preview environments for pull requests | [Preview environments](#preview-environments) — API, no CLI command |
| Deploy a specific git branch, tag, or commit | [Author the stackfile](#author-the-stackfile) |
| Set, rotate, or read env vars and secrets | [Secrets and environment](#secrets-and-environment) |
| Add Postgres, back one up, or add storage | [Databases and volumes](#databases-and-volumes) |
| Restart a resource | [Observe](#observe) → restart |
| Cancel a deploy in flight | [Releases and builds](#releases-and-builds) |
| Roll back to an earlier release | [Releases and builds](#releases-and-builds) |
| Mint a token, or switch instances | [Context and tokens](#context-and-tokens) |
| Tear something down | [Destructive operations](#destructive-operations) — confirm first |

### When the CLI has no command

The CLI is one client of the REST API; the dashboard is another. Anything the UI can do, the API can do — a missing CLI command is a gap in the CLI, not a limit of the platform. `stackdome api` reaches any endpoint with the session you already have. Never hand-build a `curl` — it needs a token you would have to dig out of the config file, and the CLI redacts credentials from error output where a raw `curl` would not.

1. https://docs.stackdome.com/llms.txt lists every endpoint by plain-English title, each linking to its own `.md` page. Read the one you need for the path, parameters, and body schema.
2. `stackdome whoami -o json` fills the path parameters: `server_url`, `organization_id`, `project`, `current_stack`. On Cloud, set `export STACKDOME_PROJECT=default` first for it (and step 3's calls) — self-hosted doesn't need it, and skipping it there keeps the command pre-approved.
3. Send it:

   ```bash
   export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
   stackdome api /api/v1/organizations/<organization_id>/... -o json
   stackdome api /api/v1/... -X PUT --data-file body.json --yes -o json
   ```

   `PATH` is relative and must start with `/api/` — the server URL comes from your context, so passing a full URL exits `4`. Flags: `-X` method (default `GET`), `--data` or `--data-file` for the body, `-H` for extra headers (repeatable), `--yes`.

**Any mutating method needs `--yes`.** `POST`/`PUT`/`PATCH`/`DELETE` prompt for confirmation and you have no TTY — without the flag they exit `4` with `confirmation required`. That flag skips the CLI's prompt, not the user's: get the user's agreement first per [Destructive operations](#destructive-operations), then pass it. **`PUT` replaces the whole resource.** GET it, change the one field, PUT the complete object back — a partial body silently drops everything you omitted (e.g. a domains `PUT` built from just the new domain erases every existing one). Write the body to a file and use `--data-file`; `--data` on a long JSON string is where quoting goes wrong. [Destructive operations](#destructive-operations) applies to API writes exactly as it does to CLI commands. Nothing else about using the API needs announcing to the user.

### Onboarding

Run this when `stackdome doctor -o json` reports a failing check, or the CLI is not installed. **Ask one question, then work.** Do not hand the user a checklist to work through — determine what you can yourself. `doctor` is the one call that separates the cases: it reports the CLI build, whether the server is reachable, whether auth is configured, and the current stack. A failing `server` check is a wrong or unreachable URL; a failing `auth` check is a missing or dead token. Exit is non-zero if any check fails, so read the payload rather than trusting the code alone.

**1. Is the CLI there?**

```bash
stackdome version
```

Missing? The docs' piped-script install 404s (release repo is private) — get the user's go-ahead, then use the verified `gh release download` steps in [Deploy this repo now](#deploy-this-repo-now) step 1.

**2. Ask where this deploys to.** This is the only question before work starts.

| They say | Do |
|---|---|
| Stackdome Cloud, or no preference | Use `https://stackdome.io` (see [Verified state](#verified-state-v002-alpha-checked-2026-08-09) — `cloud.stackdome.com` does not resolve) → step 4 |
| They already have an instance | Take the URL → step 4 |
| Set one up on their server | Take `user@host` → step 3 |

**3. Install on their server.** One probe answers every prerequisite at once. A minimal server may not have `ss`, `nproc`, or `free`, so every optional tool is guarded and reports `unknown` rather than nothing:

```bash
ssh <target> 'uname -s; uname -m; id -u
sudo -n true 2>/dev/null && echo "sudo:ok" || echo "sudo:needs-password"
command -v ss >/dev/null && { ss -tln | grep -E ":(80|443|6443) " || echo "ports:free"; } || echo "ports:unknown"
command -v nproc >/dev/null && nproc || echo "cpu:unknown"
[ -r /proc/meminfo ] && grep MemTotal /proc/meminfo || echo "mem:unknown"
df -Pm / | tail -1'
```

Needs Linux on `amd64`/`arm64`, root or passwordless sudo, ports 80/443/6443 free, 2 CPU / 4 GB RAM / 20 GB disk, and a domain pointing at the host.

- Report only what actually fails — "the box is fine, but port 80 is held by nginx" — never the whole list back at the user.
- **`unknown` is not a pass.** Say which check could not run and let the user decide whether to go ahead. The installer's own port check treats an unavailable `ss` as "free"; do not inherit that, since the point of probing first is to avoid a failed install.
- Anything other than Linux `amd64`/`arm64` is rejected by the installer outright. Say so and stop.

`sudo -n true` is in the probe on purpose: a sudo password prompt over a non-TTY SSH hangs with no output at all. Confirm once, showing the literal command, then **detach** — a foreground install blocks the session for minutes with no way to interrupt it:

```bash
ssh <target> 'nohup sh -c "curl -fsSL https://get.stackdome.com/install | sudo sh" \
  > /tmp/stackdome-install.log 2>&1 &'
```

Then poll the health endpoint — not the log. `curl` needs no confirmation, so this stays quiet; an `ssh` poll would ask the user to approve every one of thirty attempts.

```bash
curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 http://<domain>/health
```

10-second intervals, 30 attempts. Still not up? Read the log **once** — `ssh <target> 'tail -40 /tmp/stackdome-install.log'` — report what it says, and stop. A stalled install is a finding, not a reason to keep waiting.

**4. Get a token.** Send them to `<url>/settings/api-tokens` to create one and paste it back. Do not name a minimum scope set — a guess that is too narrow produces an exit `2` they cannot diagnose. `stackdome token scopes` lists valid values if they ask.

```bash
stackdome login --url <url> --token <token>
export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
stackdome doctor -o json
```

Then go to [Author the stackfile](#author-the-stackfile), or [Deploy](#deploy) if `stackfile.yaml` already exists.

### Authenticate

**You never handle the user's password.** Interactive `login` and `signup` prompts need a real TTY, which your shell is not — `stackdome login` with neither `--token` nor both `--email` and `--password` exits `4` on non-interactive stdin.

1. **Check first** — `stackdome whoami -o json`. Returns a user, org, project, and auth method? You are done. Run this before any change, to confirm which server you are about to act on. When it fails and you need to know *why*, `stackdome doctor -o json` separates an unreachable server from a dead token. **On Cloud, set `export STACKDOME_PROJECT=default` first for both** (see [Verified state](#verified-state-v002-alpha-checked-2026-08-09)) — self-hosted doesn't need it, and skipping it keeps the command pre-approved.
2. **Log in with a token.** Ask the user for their instance URL, and for a token from `<instance-url>/settings/api-tokens`:

   ```bash
   stackdome login --url <instance-url> --token <token>
   ```

   This persists the credential, so every later command in every later shell is authenticated. Confirm with `stackdome whoami -o json`.
3. **Exit code `2` later** — the token expired or was revoked. Ask for a new one and repeat step 2.

Never ask for their password, and never offer to type it for them. `stackdome signup --url <instance-url>` is for a human at a terminal creating an account — hand it to them, do not drive it. **Why not environment variables:** `STACKDOME_URL` / `STACKDOME_TOKEN` / `STACKDOME_ORG` / `STACKDOME_PROJECT` are the documented path for CI, and they work there. They are the wrong tool for you: your shell does not persist state between commands, so an `export` in one call is gone by the next — and prefixing a command inline (`STACKDOME_TOKEN=… stackdome …`) makes it no longer start with `stackdome`, which forfeits the pre-approval that keeps `stackdome` commands from prompting. Mention them when writing a CI config; do not use them yourself.

### Choose the source

Do this before authoring the stackfile. [Golden path step 2](#deploy-this-repo-now) already runs the `git remote`/`gh repo view` probe; add `ls Dockerfile */Dockerfile 2>/dev/null` if you haven't checked yet. **Infer first, ask only when the answer is genuinely unknown** — an unconditional question costs a round-trip on every deploy.

| What you find | Take this path | Ask? |
|---|---|---|
| Remote exists, `PUBLIC` | Public repo | no |
| Remote exists, `PRIVATE` | Private repo | no — but the credential step is still required |
| No remote, or no Dockerfile | Ask the user which of the four applies | yes |

**Public repo.** Set `build.repo` to the HTTPS clone URL plus `branch:`. The `context:` is root-relative to the repository, not to your working directory — a compose `build: ./web` inside `hello-stack/` becomes `/hello-stack/web`.

**Private repo.** The build needs an org-level git integration. There is no CLI command; use `stackdome api`. Create it, then **verify it before deploying** — one call that fails in seconds, versus a build failure minutes later whose message does not name the credential.

- [Create a git integration for the organization](https://docs.stackdome.com/api-reference/create-a-git-integration-for-the-organization.md)
- [Verify a git integration against a repository](https://docs.stackdome.com/api-reference/verify-a-git-integration-against-a-repository.md)
- [List repositories visible to the GitHub App installation](https://docs.stackdome.com/api-reference/list-repositories-visible-to-the-github-app-installation.md)

**Existing image.** Public registry: reference it as `image:` and stop. Private registry: register a credential for that registry URL and verify it. Credentials resolve **implicitly by registry URL** — the stackfile needs no change and no credential reference.

- [Create a new image registry](https://docs.stackdome.com/api-reference/create-a-new-image-registry.md)
- [Verify a registry credential against a repository](https://docs.stackdome.com/api-reference/verify-a-registry-credential-against-a-repository.md)
- [List registry credentials for the organization](https://docs.stackdome.com/api-reference/list-registry-credentials-for-the-organization.md)

**Local directory, no repo.** Build and push to `ttl.sh`, an anonymous ephemeral registry needing no account or credential:

```bash
IMG="ttl.sh/$(uuidgen | tr 'A-Z' 'a-z'):24h"
docker build --platform linux/amd64 -t "$IMG" .
docker push "$IMG"
```

Then reference `$IMG` as `image:` in the stackfile. Two things to tell the user, not discover:

- **`--platform linux/amd64` is mandatory.** Apple silicon builds arm64 by default; that image pushes cleanly and then fails on pull or crashes on start in an amd64 cluster, which looks like a broken app rather than a broken build.
- **`ttl.sh` images expire — 24h is the maximum.** This is a demo and preview path. Anything meant to outlive a day needs a real registry or a git build.

Any mutating API call in this section needs `--yes` per [Destructive operations](#destructive-operations).

### Author the stackfile

Never write `stackfile.yaml` from scratch.

```bash
export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
stackdome init
```

- A `docker-compose.yaml` / `compose.yaml` is converted automatically. **Read its warnings** — the single most common first-deploy failure is a local `build:` path the conversion can't carry: it needs a git repository URL with a root-relative context (see [Choose the source](#choose-the-source)). `env_file` handling also needs checking.
- `--file/-f <path>` points at a non-default compose file; `--force` overwrites an existing stackfile.
- No compose file: you get a starter template. Fill it in from what the repo actually says — the Dockerfile, exposed ports, required env vars.

Full grammar: https://docs.stackdome.com/reference/stackfile.md; `stackdome stackfile schema` gives the JSON Schema the installed CLI actually enforces — prefer it when the two disagree. Already have a stack on the server? `stackdome stackfile export <stack>` writes back canonical stackfile content (`-o yaml` by default, `--output-file` to a path) instead of you reconstructing it by hand.

**Git sources** pin a revision per release. Use `branch:` or `tag:` (exactly one), optionally with `commit:`. Pin a commit for anything you need to redeploy identically later. **Pushing to git does not deploy** — there is no auto-deploy and no setting to enable one. Every release is one you asked for.

Gate every edit:

```bash
export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
stackdome validate
```

Loop until it passes. `validate` is the authority, not your memory of the schema — unknown keys are hard errors, so a typo fails here rather than silently doing nothing. Once you expect `validate` to pass, run it fused with the deploy step below as one call instead of two round-trips — see [Scale](#scale) for the exact composite command. A stackfile **describes and connects**. It never creates secrets or addons; those must already exist and are referenced by name. Create them first. Ask the user to commit `stackfile.yaml` once authored — it is the source of truth for the stack, including replica counts, workload types, and volume sizes.

### Deploy

No `stackfile.yaml` in the repo? [Author the stackfile](#author-the-stackfile) first — `deploy` exits `4` without one. Not authenticated? [Onboarding](#onboarding). Already validated, or expect it to pass? Fuse this with `validate` into one call instead of running them separately — see [Scale](#scale) for the exact composite command.

```bash
export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
stackdome deploy --wait -o json
```

`--wait/-w` follows the release to a terminal state and exits non-zero if it does not reach `Released`. Without it, `deploy` returns as soon as the release is created, while it is still `Pending` — a state read at that moment says nothing about the outcome. `--file/-f` (default `stackfile.yaml`) and `--name` select a non-default stackfile or stack name.

**Retain `release.id` from the output.** Every check below needs it. If `deploy --wait` exits non-zero, the id is still in its output — use it to find out why rather than redeploying blind. Release states: `Pending`, `InProgress`, `Released`, `Failed`, `Superseded`, `Cancelled`. Terminal: `Released`, `Failed`, `Superseded`, `Cancelled`.

#### Verification contract

`Released` proves the release converged at some point. It does not prove it is still serving, nor that it is the newest attempt. Run:

```bash
export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
stackdome status -o json
```

Gathering that alongside per-resource conditions and the public URL in one call? See [Batched commands](#batched-commands) for the composite form — same fields, judged against the same table below. Then read the result against this table. `R` is your retained release id.

| What you see | What it means | What to do |
|---|---|---|
| `converged_release.id` == R, state `Released`, health `ok`, **and** `latest_release.id` == R with state `Released` | Deployed, healthy, newest | Confirm the URL from `open` returns HTTP `200` (`curl -fsS -o /dev/null -w '%{http_code}\n' --max-time 10 <url>`) — release state alone does not prove the app is serving. Then report success and give the user the URL |
| `converged_release` is null or absent | First deploy, nothing converged yet | Poll — see cadence below |
| `converged_release.id` != R, `latest_release.id` == R, latest state `Pending`/`InProgress` | Still rolling out; the old release is still serving | Poll |
| `converged_release.id` == R, health `progressing` | Rolling out normally — not a failure | Poll |
| `converged_release.id` == R, health `degraded` / `unavailable` / `failed` | Converged and broken | Do **not** report success. Go to [Debug](#debug) |
| `latest_release.id` != R | Someone else deployed after you; yours is superseded | Say so plainly. Do not report your deploy as live, and do not redeploy to "win" — ask |
| `latest_release.id` == R, latest state `Failed` | Your release failed | Go to [Debug](#debug) |

`health` is an enum — `ok`, `progressing`, `degraded`, `unavailable`, `failed`. Only `ok` is success and only `progressing` is worth waiting on; treating anything non-`ok` as broken reports a healthy rollout as a failure.

**Poll cadence:** `stackdome release info <release-id> -o json` every 10 seconds, up to 30 attempts (5 minutes). Still non-terminal after that? Stop polling and report the current state and the release id — a stuck release is a finding, not a reason to keep waiting silently. Never claim a deploy succeeded on a state you did not observe yourself.

### Observe

| Command | Purpose |
|---|---|
| `stackdome status -o json` | Stack and resource status, once |
| `stackdome status <resource> -o json` | One resource |
| `stackdome status --conditions` | Condition history — **table mode only** |
| `stackdome logs [resource] --since 15m --tail 200` | Bounded log window — always bound it |
| `stackdome open [resource] -o json` | Print the public URL(s). **Always use `-o json`** — bare `open` tries to launch a browser you do not have |
| `stackdome restart <resource>` | Replace the running process |

Status proves platform health, not application correctness. A healthy release serving wrong answers is an application bug — read its logs.

#### Verifying a restart

`restart` exits once the API accepts the request. It does **not** wait for the replacement to be ready, and returns no structured output. A zero exit proves acceptance, nothing more.

The trap: `stackdome status -o json` run immediately still describes the *old* process — `Released` and `ok` — while the replacement may already be crashlooping. A single healthy read right after a restart proves nothing. Verify by observing the transition:

1. `stackdome status <resource> -o json` — wait for the resource to leave its ready state.
2. Poll until it re-enters ready (10s intervals, same 5-minute ceiling as above).
3. `stackdome logs <resource> --since 5m --tail 100` — confirm the new startup lines show what you expected.

If it never leaves ready, the restart may not have taken effect — say so rather than reporting success.

### Debug

`status -o json` carries a typed failure on each resource. Read the discriminator first — do not guess from prose.

```
resource.failure.type
├─ build_failure     → read .build          (never ran; no application logs exist)
├─ runtime_crash     → read .container
└─ readiness_failure → read .container, then the probe config
```

`.init_container` is a **separate slot** from `.container`. An init container failing looks like a resource that never starts and has no application logs — check it before concluding logging is broken.

| `failure_type` | Confirm with | Fix |
|---|---|---|
| `out_of_memory` | `reason` is `OOMKilled` | Raise the memory limit. A climbing `restart_count` means it is recurring, not a one-off |
| `port_not_listening` | app logs vs the stackfile's `ports` | The app listens on a different port, or binds `127.0.0.1` instead of `0.0.0.0` |
| `image_pull_failed` | `message` | Bad tag or digest, or a private registry with no credential |
| `create_container_error` | `message` | Bad command, missing mount, or an env reference that does not resolve |
| `crash_loop` | `restart_count`, `exit_code` | A symptom, not a cause — read the logs for what actually failed |
| `exit_error` | `exit_code` | Process exited non-zero; the logs carry why |

No `failure` on the resource? Route on release state instead:

| Evidence | Path |
|---|---|
| `latest_release.state` is `Pending` or `InProgress` | Release stuck — `stackdome release events <release-id>` (bounded, no `-f`), re-run for a newer window |
| `latest_release.state` is `Failed` | `stackdome release info <release-id> -o json`. Read **`validation_errors[]`** first: each carries `resource_name`, `field`, and a machine-readable `code` naming the exact bad stackfile field. That beats parsing `message` |
| A resource is not ready, with no typed failure | `stackdome status --conditions` (table mode), start at the newest false or failing condition, then `stackdome logs <resource> --since 15m --tail 200` and match its reason against the log lines |
| Newest release serving and healthy, app still wrong | Application logs. Platform health is not application semantics |

**Build failed** — three passes:

```bash
export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
stackdome build list --resource <name> -o json    # find the id
stackdome build info <build-id> -o json           # structured evidence
stackdome build logs <build-id> --tail 200        # the failing step
```

From `build info`: `stack_resource_name`, `source_revision`, `build_context`, `status.state` (`Pending` | `Building` | `Success` | `Failed`), `status.conditions[]`, `status.last_build_failure_detail` (the `failure_type` table above), and `status.image_url` on success. The failure detail is best-effort and may be absent — the build log is the primary evidence for what the builder reported. Runtime logs may be empty when a deploy fails before the resource ever runs — that is a build problem, not a logging problem. Full guides: https://docs.stackdome.com/guides/build-failures.md and https://docs.stackdome.com/guides/status.md

### Workload types

Set `workload_type` on a resource. Default is `Service`.

| Type | Use for |
|---|---|
| `Service` | Long-running, receives traffic |
| `StatefulService` | Long-running with stable identity — databases, queues |
| `Worker` | Long-running, no ports — background processing |
| `Job` | Run-to-completion — migrations, one-off tasks |
| `CronJob` | Scheduled run-to-completion. Requires `schedule`, a five-field cron expression |

```yaml
  nightly-report:
    image: myorg/reporter:latest
    workload_type: CronJob
    schedule: "0 3 * * *"
```

### Scale

**There is no `stackdome scale` command.** Scale is declared in the stackfile and applied by a deploy — the same path as any other change, so it is versioned, reviewable, and travels with the release.

**Replicas** — an integer `>= 0` on the resource (`0` stops it without deleting it):

```yaml
resources:
  api:
    image: myorg/api:v1.2.0
    replicas: 3
```

```bash
export STACKDOME_PROJECT=default  # Cloud only — omit on self-hosted to keep this pre-approved
stackdome validate && stackdome deploy --wait -o json
```

Verify per [Verification contract](#verification-contract).

**Postgres** — `--instances` at creation. The flag advertises `1-5`, but the supported shapes are **1 (single) or 2 (high availability)**; the product exposes no three-instance configuration. Do not set it above 2 without checking https://docs.stackdome.com/guides/postgres.md. `--storage` sets its disk. Reshaping a live addon is not a stackfile edit — check `stackdome addon postgres --help` before touching anything holding data.

**Volumes** — `size` lives in the stackfile's top-level `volumes` block. Growing storage is not always reversible; confirm with the user first.

**Alpha ceiling:** one cluster per organization, so horizontal scale is bounded by that cluster's capacity. If a resource cannot be scheduled, `status --conditions` says so — that is a capacity finding, not an application fault.

### Public URLs, domains, and TLS

To expose a resource: confirm the application's port from the repo or image, mark that port `public: true` in `stackfile.yaml`, validate, deploy, then `stackdome open <resource> -o json` for the URL. Verify release health and HTTPS afterwards. **Custom domains have no CLI command.** They live as a `domains[]` array on the organization, so both reading and changing them go through the API — see [When the CLI has no command](#when-the-cli-has-no-command).

- Read: [`GET` an organization](https://docs.stackdome.com/api-reference/get-an-organization.md)
- Change: [`PUT` an organization](https://docs.stackdome.com/api-reference/update-an-organization.md) with `domains[]` edited — whole-object rule applies (see the [PUT warning](#when-the-cli-has-no-command) above).

DNS still points at the user; you cannot create records for them. Certificate issuance follows domain setup, so a missing certificate on an org with no domain is that, not a bug. Details: https://docs.stackdome.com/guides/domains-and-tls.md

### Preview environments

Per-pull-request previews have **no CLI command**, but a full API — see [When the CLI has no command](#when-the-cli-has-no-command).

| Job | Endpoint |
|---|---|
| Enable previews for a project | [Create a preview config](https://docs.stackdome.com/api-reference/preview-configs/create-a-new-preview-config.md) |
| Check whether they are enabled | [List preview configs](https://docs.stackdome.com/api-reference/preview-configs/list-preview-configs-for-a-project.md) |
| See the previews that exist | [List preview stacks](https://docs.stackdome.com/api-reference/preview-stacks/list-preview-stacks-for-a-project.md) |

Do the repo-side work first: author or update `stackfile.yaml` with the resources and public ports, and `stackdome validate` it to exit `0`. **`stackdome validate` passing does not mean previews are enabled** — check the preview config — and a plain `stackdome deploy` is not a preview. Do not describe either as one. Details: https://docs.stackdome.com/guides/preview-environments.md

### Secrets and environment

Plain configuration goes in the stackfile's `env`. Anything sensitive is a secret object, referenced by name — a stackfile never contains a secret value.

| Command | Purpose |
|---|---|
| `stackdome secret list -o json` | List secrets — names only, never values |
| `stackdome secret info <name>` | One secret's metadata |
| `stackdome secret create <name> --from-file <path> --type <type>` | Create |
| `stackdome secret set <name> --from-file <path>` | Replace values — the previous value is unrecoverable |
| `stackdome secret delete <name>` | **Destructive** — see below |

`--type`: `Generic` (default), `DockerRegistry`, `GitCredentials`, `UsernamePassword`, `Token`, `SSHKey`. **Use `--from-file`, not `--data KEY=VALUE`.** A value on the command line lands in the shell transcript and in your context. `--data` exists for a human at their own terminal; when you are handling the value, write it to a file the user provides or creates, pass the path, and never echo the value into your response, a log line, or a commit. This is the same rule as the password one — a secret you type is a secret you have leaked. `secret set` overwrites: the previous value cannot be recovered. Confirm before rotating something in use. Rotations take effect on the next deploy of the resources that consume it.

### Databases and volumes

| Command | Purpose |
|---|---|
| `stackdome addon postgres list -o json` | List Postgres addons |
| `stackdome addon postgres info <name> -o json` | One addon's detail |
| `stackdome addon postgres create <name> --version <13-17, default 16> --storage <default 10Gi> --instances <1 or 2> --database <db> --superuser` | Provision |
| `stackdome addon postgres backup <name> --description <text>` | Trigger a backup |
| `stackdome addon postgres backups <name> -o json` | List backups |
| `stackdome addon postgres credentials <name> <database> -o json` | Live connection credentials (`--superuser` for elevated) |
| `stackdome addon postgres delete <name>` | **Destructive** — see below |
| `stackdome volume list -o json` | List volumes |
| `stackdome volume create <name> --size 5Gi` | Provision |
| `stackdome volume delete <name>` | **Destructive** — see below |

`addon postgres credentials` returns live database credentials. Treat the output as a secret: use it, never print it back. `volume create` takes `--access-mode`, but every volume Stackdome creates is `ReadWriteOnce`, and the mode **cannot be changed after creation**. Leave the default unless the user has a specific reason and knows it is fixed for the volume's life. An addon is managed by Stackdome. A database image declared as a resource in your stack is yours to operate and back up — do not describe the two as equivalent.

### Releases and builds

| Command | Purpose |
|---|---|
| `stackdome release list -o json` | Release history, newest first |
| `stackdome release info <release-id> -o json` | State, message, cause, validation errors, pins, outcome, snapshot |
| `stackdome release events <release-id>` | Event stream — bounded; do not use `-f` |
| `stackdome release cancel <release-id>` | Cancel a release — **only while `Pending`** |
| `stackdome release rollback <release-id> --wait -o json` | Redeploy a historical release |
| `stackdome build list -o json` | Build history (`--resource`, `--stack` to filter) |
| `stackdome build info <build-id> -o json` | One build's detail |
| `stackdome build logs <build-id> --tail 200` | Build log output |

`release cancel` works only while the release is `Pending`. Once it is `InProgress` the rollout has started and cancelling is no longer offered — deploy again, or roll back (see below). Cancelling is a mutation: confirm with the user first.

**Roll back with `stackdome release rollback <release-id>`.** It takes the *old* release's id and copies that release's manifest into a new one — the same thing the dashboard's **⋮ → Rollback to this** does. Pass `--wait` to follow it to a terminal state; the default timeout is 10 minutes.

A rollback is a new release, not a restored old one — it gets its own id and sequence. Retain that id and verify it through [Verification contract](#verification-contract) like any other deploy. A release pins what it deployed: a git source pins the commit, an image source pins the digest. `main` moving, or a tag being re-published, never changes an existing release — so the timeline is an honest record and a rollback is exact. Every `release` subcommand takes `--stack <name>`. Use full IDs from structured output when automating; ID prefixes are an interactive convenience.

### Context and tokens

| Command | Purpose |
|---|---|
| `stackdome whoami -o json` | Current user, org, project, auth method |
| `stackdome doctor -o json` | CLI build, server reachability, auth, current stack — one call, non-zero exit if any check fails |
| `stackdome config view` | Current CLI config |
| `stackdome config set-context <url>` | Point the CLI at a different Stackdome server |
| `stackdome config set-stack <stack>` | Default stack for this directory (name or ID) |
| `stackdome stack list -o json` | List stacks |
| `stackdome stack info <name> -o json` | One stack's detail |
| `stackdome token list -o json` | List API tokens |
| `stackdome token create <name> --scope <resource:action> --expires 720h` | Mint a scoped token (`--scope` and `--resource-id` repeatable; default lifetime is never) |
| `stackdome token scopes` | Valid `--scope` values |
| `stackdome token delete <id>` | **Destructive** — see below |

`token create` returns a live credential shown once. Hand it to the user; do not echo it into a summary or write it to a tracked file. Most commands take `--stack/-s <name>` to target a stack other than the current context.

### Destructive operations

**Never pass `-y`/`--yes` before the user has confirmed that specific action.** Exit code `130` means they declined at the prompt — that is an answer. Do not re-run with `-y`, do not rephrase and retry, do not route around it with a different shell or script. Surface the decline and stop.

`destroy`, `stack delete`, `secret delete`, `volume delete`, `addon postgres delete`, and `token delete` are **irreversible**. The stack, credential, storage, or database behind them cannot be recovered. `secret set` and `release cancel` are also unrecoverable in effect, and need the same confirmation. Before running any of them:

1. Name exactly what will be lost — which stack, secret, volume, database, or token — and say plainly that it cannot be undone.
2. Get explicit confirmation for that specific action. Not for "cleaning up", not implied by an earlier instruction.
3. Only then run it, adding `-y` so it can complete without a TTY prompt you cannot answer.

### Anything else

Read the docs rather than guessing. https://docs.stackdome.com/llms.txt lists every page; append `.md` to any docs URL for raw markdown. `stackdome <command> --help` is authoritative for flags — a flag on one command does not imply the same flag on another. When this file and the installed CLI disagree, the CLI wins.
