# Cutting `use-stackdome` from invocation to live URL

**Date:** 2026-08-09
**Status:** Approved, ready for planning
**Scope:** `.claude/skills/use-stackdome/SKILL.md` only — no CLI, server, or repo-script changes

## Problem

A cold run of the `use-stackdome` skill (fresh machine, unauthenticated, no stackfile) took roughly
**35 tool calls and 3 user round-trips** to reach a verified live URL.

The deploy itself took **55 seconds** (release created 21:11:03, converged 21:11:58). Nearly all
wall-clock and every avoidable tool call went to discovery and error recovery, not to the platform.

Measured breakdown of that run:

| Phase | ~calls | Cause |
|---|---|---|
| CLI install | 4 | Documented install URL 404s; the release repo is private, so `gh` is required |
| Finding the real server | 5 | `cloud.stackdome.com` is NXDOMAIN; `cloud.stackdome.io` serves a Traefik self-signed cert; the working host is `stackdome.io` |
| Project-resolution bug | ~10 | CLI exits `3` with `Resource not found`; root cause filed as stackdome-cli#7; workaround is `STACKDOME_PROJECT=default` |
| Stackfile authoring | ~8 | `stackdome init` emitted a hardcoded `redis://redis:6379` and local build contexts; the correct form uses `{{ redis.url }}` / `{{ self.public_url }}` and was only discovered by exporting a live stack |
| Shape and flag guessing | 5 | `deploy` has no `--stack` flag; `status -o json` returns `{stack, live_status}`, not a flat object |
| Deploy | 1 | 55s — already fast |

**This is a discovery-cost problem.** The fix belongs in the instructions, not the deploy path.

## Goal

Minimise **tool calls from skill invocation to a verified live URL**, subject to hard correctness
gates that the loop cannot trade away.

Theoretical floor for a cold start is 5–6 calls, because several steps share one Bash invocation:

1. composite probe (`version` + `doctor`)
2. auth (one user round-trip — irreducible, the user must mint a token)
3. write `stackfile.yaml`
4. `validate && deploy --wait`
5. verify (`status` + `open` + HTTP check)

Warm runs — authenticated, stackfile present — should reach 2–3 calls.

## Autoresearch loop

### Scope

`.claude/skills/use-stackdome/SKILL.md`. Nothing else is editable. The file is vendored from
`stackdome/stackdome-skills` (see `skills-lock.json`); changes land here first and upstream after.

### Metric

**Count of tool calls made by a clean-context subagent, from invocation to verified live URL.**

Chosen over wall-clock (dominated by model latency and the fixed 55s deploy, both outside the
skill's control) and over tokens (which would penalise adding the precise recipes that make runs
fast). Lower is better. Baseline: **35**.

Secondary, recorded but not optimised: user round-trips (target 1 — the token), failed calls,
wall-clock.

### One iteration

1. Snapshot the current `SKILL.md`.
2. Provision an isolated environment:
   - `STACKDOME_CONFIG=<tmp>/config-<n>.json` so auth state starts cold
   - target the **local instance** at `http://localhost:8000`
   - a unique stack name per iteration, so runs never collide
3. Spawn a **fresh-context subagent** given only the current `SKILL.md` and the task
   "deploy this repo and give me the live URL". It must not see this conversation.
4. Count its tool calls.
5. Apply the gates below.
6. Destroy the stack.
7. Keep the edit if the metric improved **and** every gate passed; otherwise revert.

### Gates (non-negotiable)

An iteration **fails** — and its edit is reverted regardless of call count — unless all hold:

- the public URL returns **HTTP 200**
- `converged_release.id == latest_release.id`
- `live_status.health == "ok"` and every resource reports `Available: True`, `Converged: True`
- the subagent asked **at most one** user question (the token)

The one-question gate assumes the loop's fixture repo is public, which `Stackdome/stackdome-demo`
is. The private-repo and no-repo branches in
`2026-08-09-stackdome-source-selection-design.md` legitimately cost an extra round-trip; they are
not exercised by this loop and must not be deleted to satisfy this gate (see Regression guard).

**Why this matters:** optimising purely for call count makes deleting the verification contract the
cheapest possible "improvement". Without these gates the loop converges on a skill that reports
success without checking — faster, and wrong. The gates are the whole reason the loop is safe to run
unattended.

### Directions, in priority order

**A. Fact injection.** Add a verified known-good block near the top of the file: the real host
(`stackdome.io`), the working install path, the project-resolution bug and its
`STACKDOME_PROJECT=default` workaround, the exact `status -o json` shape, and which flags exist on
which command. Purely additive, no restructuring, and it addresses the four largest cost centres
directly. Facts no restructuring can recover.

**B. Golden-path rewrite.** Restructure so the file opens with one linear zero-to-URL recipe —
literal commands, expected outputs — and demote the routing table and reference sections beneath it.
Attacks a subtler cost: the file is reference-shaped, so an agent reads, routes, and decides at each
step instead of executing. Largest rewrite, highest regression risk. Run only after A and C plateau.

**C. Probe batching.** Collapse discovery into composite Bash calls: `version` + `doctor` in one,
`validate` + `deploy --wait` in one, `status` + `open` + HTTP check in one. Mechanical, and it
compounds with A.

Order: **A → C → B**, as approved.

### Regression guard

`SKILL.md` also covers debugging, secrets, scaling, rollback, domains, and previews. Direction B can
easily optimise the deploy path by gutting those.

Before any B edit is kept, the file must still answer these without the loop's help:

- how to debug a failed build (`build list` → `build info` → `build logs`)
- how to roll back (`release rollback <old-id>`, and that it mints a new id)
- the destructive-operations confirmation rule
- that `--follow` / `--watch` must never be used

A B-direction edit that drops any of these is reverted even if the metric improved.

## Prerequisites

- Re-login to the local instance: logging into `stackdome.io` overwrote `~/.stackdome/config.json`,
  so the localhost token is gone.
- The loop's per-iteration config file must be separate from the user's real one.
- `STACKDOME_PROJECT=default` is required until stackdome-cli#7 ships; note that it also disables
  persisted stack selection, so `--stack <name>` becomes mandatory on commands that accept it
  (`deploy` does not).

## Out of scope

CLI patches, server fixes, and repo-local scripts. Tracked separately: stackdome-cli#7 covers the
project-resolution bug at its source. If it ships mid-loop, the workaround text becomes a
removable fact and the metric should improve on its own.
