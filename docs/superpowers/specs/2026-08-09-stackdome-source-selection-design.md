# Source selection during `use-stackdome` onboarding

**Date:** 2026-08-09
**Status:** Approved, ready for planning
**Scope:** `.claude/skills/use-stackdome/SKILL.md` — the onboarding path, before the stackfile is authored

## Problem

`SKILL.md` currently assumes the deployable source is a public git repository. `stackdome init`
warns `resource "web" has a local build (no git repo) — set build.repo to a git URL` and stops there,
with no guidance for the three other cases users actually have:

- a **private** repository, which needs an org-level git integration
- a **local directory** with no repository at all
- an **existing image**, which may sit in a private registry

Each currently fails at build time, minutes after the deploy starts, with an error that does not
name the missing credential.

## Design

One question at onboarding, before the stackfile is authored, with four branches.

| Answer | Path | Extra cost |
|---|---|---|
| **Public repo** | `build.repo` + `branch`. Nothing else. | 0 calls |
| **Private repo** | Create git integration → verify against the repo → then build | 2 calls + 1 user round-trip |
| **Local dir, no repo** | `docker build --platform linux/amd64` → push to `ttl.sh/<uuid>:24h` → stackfile uses `image:` | 2 local calls, no credentials |
| **Existing image** | Public: `image:` directly. Private: register a registry credential for the registry URL → verify → `image:` | 0 or 2 calls |

### Infer, then ask

The question is only asked when the answer cannot be determined. Detection order:

1. `git remote -v` resolves **and** `gh repo view --json visibility` reports `PUBLIC` → public path,
   silently.
2. A remote exists but is private → private-repo path; the question is skipped, the credential
   step is not.
3. No remote, or no Dockerfile → ask.

**Why this rule exists:** the speed loop
(`2026-08-09-stackdome-skill-speed-loop-design.md`) minimises tool calls, and an unconditional
question costs a round-trip on every run. Without inference the loop learns to stop asking and
assume public — which silently breaks every private-repo user. Inference keeps the common path at
zero questions while the other three branches stay correct.

### Verify before deploy

Both credential types have verification endpoints:

- [Verify a git integration against a repository](https://docs.stackdome.com/api-reference/verify-a-git-integration-against-a-repository.md)
- [Verify a registry credential against a repository](https://docs.stackdome.com/api-reference/verify-a-registry-credential-against-a-repository.md)

One call, fails in seconds. Skipping it turns a bad credential into a build failure minutes later
whose message does not name the credential — the single most expensive failure shape observed.

### Credentials resolve implicitly

A private image needs **no stackfile change**. Registry credentials are matched by registry URL:
[Delete a registry credential](https://docs.stackdome.com/api-reference/delete-a-registry-credential.md)
notes that its response "lists stacks that were implicitly resolving against this credential".

So the instruction is: register the credential against the registry URL, verify it, then reference
the image normally.

Relevant endpoints — all API-only, no CLI command exists, so they go through `stackdome api`:

- [Create a git integration for the organization](https://docs.stackdome.com/api-reference/create-a-git-integration-for-the-organization.md)
- [Create a new image registry](https://docs.stackdome.com/api-reference/create-a-new-image-registry.md)
- [List registry credentials for the organization](https://docs.stackdome.com/api-reference/list-registry-credentials-for-the-organization.md)
- [List repositories visible to the GitHub App installation](https://docs.stackdome.com/api-reference/list-repositories-visible-to-the-github-app-installation.md)

Mutating methods need `--yes`, and the user's agreement comes first.

### `ttl.sh` for the no-repo case

`ttl.sh` is an anonymous ephemeral registry — no login, no credential, no account. Push
`ttl.sh/<uuid>:24h` and reference that image.

Two constraints the skill must state, not discover:

- **`--platform linux/amd64` is mandatory.** A developer on Apple silicon builds arm64 by default.
  That image pushes cleanly and then fails on pull or crashes on start in an amd64 cluster — a
  failure that looks like a broken app, not a broken build.
- **24h is the maximum lifetime.** This is a demo and preview path. The skill must say so plainly
  and point at a real registry or a git build for anything intended to outlive a day.

### Documentation links

Every instruction that sends the user somewhere — install the GitHub App, add a registry credential,
mint an API token — carries the specific docs `.md` URL alongside it. Any docs page can be fetched
raw by appending `.md`; https://docs.stackdome.com/llms.txt indexes them all.

## Interaction with the speed loop

These two specs pull against each other by design, and the tension is resolved by the inference
rule above. When the speed loop runs, the source-selection branches must survive it:

- the public-repo path must stay at **zero** questions
- the other three branches must still be reachable and correct

A loop edit that deletes a branch to save a call is a regression, and is reverted under the same
guard that protects the debugging and rollback sections.
