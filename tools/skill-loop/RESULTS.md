# Stackdome skill speed loop — results so far

Plan: `docs/superpowers/plans/2026-08-09-stackdome-skill-speed-loop.md`
Design specs: `docs/superpowers/specs/2026-08-09-stackdome-skill-speed-loop-design.md`,
`docs/superpowers/specs/2026-08-09-stackdome-source-selection-design.md`
Ledger: `.superpowers/sdd/2026-08-09-stackdome-skill-speed-loop/progress.md`

## 1. What this is

The `use-stackdome` skill (`.claude/skills/use-stackdome/SKILL.md`) took roughly **35 hand-counted
tool calls** to go from invocation to a live, verified URL on a cold run — and almost all of that
was discovery and error recovery, not the platform doing work: the deploy itself took **55
seconds**. The goal of this effort is to cut that discovery cost. The approach: build a harness
that measures the real cost objectively (tool-call count from a session transcript, under hard
correctness gates), then edit `SKILL.md` against that measurement rather than by guessing.

## 2. Status — read this first

**8 of 9 tasks are complete.** The measured baseline is **43 tool calls** (not 35 — see below).

**Whether the SKILL.md edits actually reduced that number is UNMEASURED.** The plan called for a
measurement step after Direction A and again after Direction C (keep-if-improved, revert
otherwise). Both measurement steps were **skipped**, on the implementer's call, specifically to
avoid spending live measured runs (each one deploys and tears down a real stack) on edits that
hadn't been reviewed yet. Task 8 (the golden-path restructure, §7) landed after this and does not
change that picture: no post-Task-8 measurement was taken either, and this task was explicitly
scoped to not run one (see §8). So although four sets of edits have now landed in `SKILL.md`, there
is no post-edit tool-call count to compare against 43. Do not read the work done so far as "the
skill got faster" — that claim has no measurement behind it yet.

## 3. What was built

| File | What it does | Why it exists |
|---|---|---|
| `count_calls.py` | Extracts the exact tool-call count from a session's JSONL transcript (`tool_use` blocks, not `num_turns`). | `num_turns` undercounts — one assistant turn can carry several parallel tool calls, so it isn't a valid metric. |
| `gates.py` | Checks a deploy actually worked: converged release matches latest, stack health is `ok`, every resource reports `Available`/`Converged` True, and the public URL returns HTTP 200. | Without a hard pass/fail gate, the cheapest way to "improve" the tool-call count is deleting the verification steps from SKILL.md. |
| `guarded_facts.py` | Regex-checks SKILL.md for 9 facts/capabilities that must never disappear (cloud host, project workaround, ttl.sh path, platform pin, credential verify, build debugging, rollback, destructive-op confirmation, no `--follow`/`--watch`). | The loop only measures the local-instance deploy path. Anything it can't observe (cloud-only bugs, debugging, rollback) is invisible to the metric and would otherwise get silently deleted by an optimization pass. |
| `run_iteration.sh` | Runs one full measured iteration: clones the repo to a throwaway dir, seeds a scoped auth config, spawns a fresh headless `claude -p` agent against the local Stackdome instance, counts its tool calls, runs the gates and guarded-facts check, destroys the stack, and writes one JSON row to `results.jsonl`. | This is the actual experiment runner — everything else is a component it calls. |

## 4. What changed in SKILL.md

Four edits have landed, in the order the design specified (A → C, then source selection, then B):

- **Direction A — verified-state facts** (commit `19683ec`, fixed in `1b93624`): added a block of
  facts confirmed by direct observation — the real cloud host (`stackdome.io`, not the NXDOMAIN
  `cloud.stackdome.com`), the working CLI install path (the documented one 404s), the
  `STACKDOME_PROJECT=default` cloud workaround, exact `status -o json` / `open -o json` shapes, and
  which commands take `--stack`. Addresses the four largest cost centers identified in the design
  doc's breakdown of the original 35-call run.
- **Direction C — batched commands** (commit `184a7ed`, fixed in `b9b6cf8`): added composite
  one-shot recipes (probe `version`+`doctor`+stackfile check together; `validate && deploy --wait`
  together; `status`+`open`+HTTP check together) to collapse multiple round-trips into single tool
  calls. The fix round was necessary because the first version added these as an unreachable
  duplicate block — `validate && deploy` already existed elsewhere in the file, and the primary
  procedure path didn't point at the new batched blocks. `b9b6cf8` linked them in at all three
  decision points so they're actually on the path an agent follows.
- **Source selection** (commit `046de5d`): added a "Choose the source" section covering the four
  cases SKILL.md previously didn't handle (public repo, private repo, existing image, local
  directory with no repo) — with infer-then-ask logic so the common public-repo case costs zero
  questions, and mandatory credential-verification and `ttl.sh`/platform-pin guidance for the other
  three. Addresses `docs/superpowers/specs/2026-08-09-stackdome-source-selection-design.md`.
- **Direction B — golden-path restructure** (six commits, Task 8): front-loaded a single linear
  zero-to-URL recipe and compressed the reference sections. Landed with a review failure and two
  fix rounds — see §7 for the full account, and §8 for the caveat that matters most to anyone
  running the loop next.

## 5. Evidence that specific costs were real

The measured baseline run (session `eed0d682`, unmodified SKILL.md, local instance) independently
reinvented two of the fixes above, live, at real tool-call cost:

- The fixture's prebuilt images (`quay.io/stackdome/hello-stack-web`/`-worker`) are `amd64`; the
  local Docker is `arm64`. The agent ran `docker build --platform linux/arm64` to work around it.
- It then pushed that local image to `ttl.sh/<name>:24h` so the server could pull it — a path
  invented on the spot, not documented anywhere at the time.
- Both changes were made by editing the clone's `stackfile.yaml`'s `image:` value **4 times**
  (2 resources × 2 edits each), never switching to a git-build form.

Both of these are now stated facts in SKILL.md (the platform pin and the ttl.sh path, added by the
source-selection edit). **This is indirect evidence, not a measured improvement**: it shows the
specific costs were real and that the fix targets them, but it does not show the fix actually
reduces the tool-call count on a live run — that requires the measurement in §6, which hasn't been
run.

## 6. How to measure it yourself

Run one iteration:

```bash
tools/skill-loop/run_iteration.sh <label>
```

This clones the repo, deploys the current `SKILL.md` against the local Stackdome instance with a
fresh headless agent, and appends one row to `tools/skill-loop/results.jsonl` (gitignored):

```json
{"label": "...", "tool_calls": 43, "passed": false, "failures": [...], "url": "...", "session_id": "...", "cost_usd": 0.0}
```

- `outcome` values (added by the fix-round hardening in `609b404`): `"ran"` for a run that reached
  the measured `claude -p` call, `"setup_fail"` for an early exit before that (clone/mkdir/cp
  failure — writes a row with `tool_calls: null`), `"gate_fail"` for a run that deployed but failed
  `gates.py` or `guarded_facts.py`.
- `passed: true` requires both the deploy gates and all 9 guarded facts to pass.

**Accept/reject rule agreed for Task 9** (still not exercised — see §8): run each candidate
`SKILL.md` **3 times**, compare medians, and accept the edit only if it beats the previous median
by more than one run's observed spread (i.e., more than the range/IQR across those 3 runs). A
single sample cannot tell a real improvement from noise: `run_iteration.sh` takes exactly one
sample per invocation, and the harness has no built-in way to distinguish signal from run-to-run
variance.

**43 is the sole headline baseline.** There are, in fact, three data points on the *unmodified*
SKILL.md, and it's worth being precise about why only one of them counts:

- **43** (session `eed0d682`) — clean and isolated: ran after the stack-name-collision bug (§10)
  was fixed, against a fresh throwaway `sd-loop-*` stack with nothing pre-existing. The only
  methodologically sound run of the three; this is the number quoted everywhere else in this
  document.
- **25** (session `f8d7bc4d`, recovered by re-counting its transcript — see §10) — **confounded,
  not a clean comparison point.** This run happened while the stack-collision bug was still live:
  it deployed onto the pre-existing `stackdome-demo` stack, which already had converged releases,
  so it had genuinely less work to do. The gap to 43 mixes real run-to-run variance with a
  methodological difference (fresh stack vs. pre-existing stack) — it does not, by itself, tell you
  the spread of the configuration the loop actually measures against.
- **29** (session `397711d6`) — **a floor, not a total.** This run was aborted mid-deploy by the
  harness's original 900s timeout (since raised to 1800s), so 29 is where it got to before being
  killed, not a completed measurement.

Three data points on the same unmodified file, and **not one clean repeated pair** — each of the
three differs from the others by more than run-to-run noise alone (a bug fix, an early abort). That
absence of even one apples-to-apples pair is exactly why the accept/reject rule requires 3 runs of
the *same* configuration before judging an edit, and why 43 — not 25, not 29, and not an average of
the three — is the only number treated as the baseline in this document.

## 7. Task 8 — golden-path restructure and compression

Task 8 (Direction B) was deliberately blocked until after A and C, since it's the largest rewrite
and the highest regression risk of the three directions: restructure SKILL.md so a single linear
zero-to-URL recipe leads the file, with the routing table and reference sections demoted beneath
it. It landed across **six commits**: `3972d0a` (golden path + HTTP-200 check), `02a0b77`
(compression), `2771d7a` (Cloud-host fix), `91e77aa` (fix round 1), `dee484f` (Cloud sweep),
`9743442` (fix round 2). The review that finally passed was clean; it did not pass on the first
attempt.

**Size history, stated plainly** — this was not a clean 20% reduction, even though one step of it
was:

| Point | Lines | Change |
|---|---|---|
| Pre-Task-8 | 637 | — |
| After golden path added (`3972d0a`) | 687 | **+50** — the file *grew* first |
| After compression (`02a0b77`) | 548 | −139 (−20% off the 687 figure) |
| After correctness fixes (`91e77aa`, `dee484f`, `9743442`) | 567 | +19 |

Net change vs. pre-Task-8: **−70 lines**. The 20% figure describes only the compression step; the
net result of the whole task is a 70-line reduction (~11%), not 20%. The user asked for a
reduction; the first pass grew the file instead, and was sent back before compression.

**The review failed on first pass, Critical severity.** The new golden path defaulted to Cloud but
issued every command bare, while the same file states (then at L88) that Cloud commands exit 3
without `STACKDOME_PROJECT=default`. The linear recipe — the thing Task 8 exists to make an agent
follow instead of discovering the workaround by trial and error — failed at its own step 3 against
its own default target, reintroducing the ~10-call cost center the whole project exists to remove.
Fixed in `91e77aa` by adding the export to every step past the version check, with an explicit
self-hosted opt-out.

**A Cloud-host self-contradiction that had survived four prior reviews was found and fixed.**
Onboarding step 2 routed to `https://cloud.stackdome.com`, while the facts block elsewhere in the
same file states that host does not resolve (NXDOMAIN). Onboarding sits upstream of the facts
block in reading order, so an agent following the file top-to-bottom hit the dead host before ever
reaching the fact that would have told it otherwise. Fixed in `2771d7a` by routing to
`https://stackdome.io` instead, cross-referenced to the verified-state fact so the two can't drift
apart again.

**The compression pass deleted the loop-safety sentence — the most instructive failure in this
task.** The sentence read: "a loop measured only against localhost would never observe this fact
and would strip it as dead weight." `02a0b77`'s compression reduced it to "Self-hosted is
unaffected," losing the reasoning. That sentence is this file's own defense against exactly the
loop this project runs — a compression pass, judged purely on line count and redundancy, deleted
the one sentence explaining why a Cloud-only fact must survive a localhost-only measurement. (It
was in fact already gone one commit earlier, at `3972d0a`, before compression touched it — so two
independent edits dropped it before anyone caught it.) Restored verbatim in `91e77aa` via
`git show 1b93624`, alongside the literal `STACKDOME_PROJECT=default` usage example that had been
dropped with it.

**A sweep found 9 further bare Cloud-executable commands** beyond the golden path: Scale, Author
the stackfile (×2), Deploy, the verification contract, Debug's build three-pass, `stackdome api` +
`whoami`, Onboarding step 4, and Authenticate step 1. A reader who reached any of these via the
routing table without going through the golden path first would hit the identical exit-3 failure.
All nine were prefixed in `dee484f`. Two commands were deliberately left unprefixed and verified
against the baseline run instead: `stackdome version` (makes no server call) and `stackdome login`
(runs before project context exists).

**The verification contract now includes an HTTP-200 check**, closing a real gap: `gates.py` has
always required the deployed URL to return HTTP 200, but nothing in SKILL.md told the agent to
check for one — so the gate and the instructions were checking different things. Added in `3972d0a`
alongside the golden path.

## 8. Critical caveat for the next measurement

**This is the single fact most likely to invalidate the next number anyone reports, so read it
before running the loop.**

The loop fixture targets `localhost:8000` — i.e. every measured run is against the **self-hosted**
instance. Per §7, the golden path now exports `STACKDOME_PROJECT=default` on every Cloud step, with
an explicit note that self-hosted runs should *omit* it. That means the subagent this loop measures
is exactly the reader who must NOT add that export line.

If a measured run adds it anyway (e.g. by copying the golden path literally without noticing the
self-hosted opt-out), every `stackdome` invocation in that run still matches `Bash(stackdome:*)` and
stays pre-approved — the export itself doesn't break anything functionally on self-hosted — but it
adds a spurious extra step (and, on some CLI paths, an extra question) to a run that didn't need it,
inflating the tool-call count or tripping the one-question gate. That would read as "the skill got
slower," when it is actually a copy-paste artifact of running the Cloud-oriented step against a
self-hosted target.

**Before trusting any post-Task-8 tool-call number, inspect that run's call log** and confirm
whether the extra export appears. This was not an issue prior to Task 8, because prior to Task 8
there was no golden path defaulting to Cloud for the measured subagent to over-apply.

## 9. What is left

- **Task 9's own remaining piece — the real measurement.** The accept/reject rule in §6 (3 runs,
  compare medians) has still not been exercised against the current `SKILL.md`. This RESULTS.md
  update was explicitly scoped to not run a live measurement iteration, so the number that would
  settle §2's open question does not exist yet.
- **Upstreaming.** SKILL.md's local edits do not reach any other user of the skill until raised as
  a PR against the upstream repo — see §11.

## 10. Known gaps and deferred items

Pulled directly from the ledger (`progress.md`):

- **Vacuous-regex guards.** Three of the 9 `guarded_facts.py` checks (`--follow|--watch`,
  `stackdome\.io`, `ttl\.sh`) are bare substring matches. A rewrite could keep the literal token
  while inverting its meaning (e.g., "never use `stackdome.io`") and still pass the guard. Ruled
  plan-governs (accepted as-is), not fixed. A related regex, `STACKDOME_PROJECT`, was caught as
  genuinely vacuous during Task 3's review (it matched the *opposite* passage warning against env
  vars) and was tightened to `STACKDOME_PROJECT\s*=\s*default` — the other three were not.
- **Stack-name collision (fixed, referenced in §6).** Early runs deleted the clone's tracked
  `stackfile.yaml` with `rm -f`, which the measured agent then restored from git — landing every
  run on the same pre-existing `stackdome-demo` stack instead of a unique throwaway. Fixed in Task
  4 (`git rm --cached` to untrack it, then rewrite `name:` in place) before the 43-call baseline was
  taken. The earlier 25-call run (below) predates this fix.
- **The 25-call run was never recorded in the ledger or a task report.** It reached the implementer
  as a conversational aside, not a committed artifact, and had to be recovered after the fact by
  re-counting `tool_use` entries in its raw transcript
  (`session f8d7bc4d-f6e2-49a4-b8ca-5cc3be7f41b6`). Worth avoiding in future runs — a measurement
  that only exists in conversation is one transcript-deletion away from being unrecoverable.
- **Three pre-trap exits in `run_iteration.sh` write no results row.** The `EXIT` trap that writes
  a row is registered after the `mktemp` / `pwd -P` / stack-name guards, so a failure in any of
  those three specific early checks still exits silently with no row, unlike every other failure
  path (which was hardened in the Task 4 fix round to always write a row).
- **`validate && stackdome deploy` appears twice** — once as the canonical fenced block in the
  batched-commands section, once as an inline citation in the pointer prose that links to it.
  Reviewer accepted this (self-flagged as a duplication risk) but nothing enforces the two stay in
  sync if one is edited later.
- **Source selection's "ask" fallback has an unhandled branch.** The 3-way inference rule (public
  repo → no question; private repo → skip the question, keep the credential step; else → ask)
  has no explicit row for "remote exists but `gh repo view` errors or returns empty" (non-GitHub
  remote, or `gh` unauthenticated). It falls through to "ask", the safe default, so it's not a live
  bug — flagged as a spec-level gap worth a follow-up, not an implementation bug.
- **`stackdome-cli#7` is stale.** The issue tracking the cloud project-resolution bug does not yet
  carry the more precise diagnosis a reviewer later confirmed empirically against the real Cloud
  instance: `stack list -o json` exits `3` ("Resource not found") without `STACKDOME_PROJECT`, and
  returns full data with it; the config persists `server_url`/`access_token`/`organization_id` but
  never `project_name`. Confirmed cloud-only, self-hosted unaffected. The issue itself hasn't been
  updated with this.
- **Reviewer reliability note** (Task 4): a first review pass marked all 7 documented deviations
  "verified present" by trusting the implementer's framing rather than reading the code — one
  deviation wasn't actually in the script yet at that point. Caught and corrected on re-review.
  Recorded as a reason to treat round-1 review conclusions as needing line citations, not just
  agreement.
- **Task 5's review used a live Cloud credential** (read-only `stack list`) to verify the env-var
  fact — valuable, but reaching production from a review wasn't explicitly scoped for that
  dispatch. Flagged to scope explicitly in future reviews.
- **`count_calls.py`'s `_tool_uses`**: a transcript line that's valid JSON but not a JSON object
  (e.g. a bare string or number) would raise `AttributeError`, not caught by the existing
  `except ValueError`. Inherited verbatim from the original brief; real transcripts are always
  objects, so this is a latent gap rather than an observed failure.
- **(Task 8) The `version`-only exception is stated incompletely.** The line naming which commands
  don't need the Cloud workaround names only the `version` exception, though the golden path's
  step 1 fallback prose also carries an unprefixed `login`. Minor, deferred.
- **(Task 8) `Bash(stackdome:*)` now appears in four places** — the frontmatter `allowed-tools`
  entry plus three separate prose spots that explain it. Editing the allowed-tools value would
  leave the prose stale in three places with nothing to catch the drift. Minor, deferred.

## 11. Upstreaming

`.claude/skills/use-stackdome/SKILL.md` is vendored, not authored in this repo. Per
`skills-lock.json`:

- **Upstream repo:** `stackdome/stackdome-skills` (GitHub)
- **Path in that repo:** `plugins/stackdome/skills/use-stackdome/SKILL.md`
- **Pin mechanism:** a content hash (`computedHash`), not a branch/tag ref — the lockfile has no
  separate ref field, so the porter's job is to make the upstream file's contents match this repo's
  file and let the hash be recomputed on landing.

All local edits described in §4 need to be raised as a PR against that path upstream. **Commits to
port, in order** (later commits in each group fix earlier ones in the same group — port and apply
in this sequence, not squashed, so the fix-round history stays legible):

1. `19683ec` — Direction A: verified-state facts
2. `1b93624` — fix round for Direction A
3. `184a7ed` — Direction C: batched commands
4. `b9b6cf8` — fix round for Direction C (links batched blocks into the decision points)
5. `046de5d` — source selection section
6. `3972d0a` — Direction B: golden path + HTTP-200 check (grew the file 637→687)
7. `02a0b77` — compression of reference sections (687→548; dropped the loop-safety sentence, see §7)
8. `2771d7a` — Cloud-host self-contradiction fix (Onboarding → `stackdome.io`)
9. `91e77aa` — fix round 1: `STACKDOME_PROJECT=default` on the golden path + restore loop-safety
   sentence
10. `dee484f` — Cloud sweep: prefix the remaining 9 bare Cloud-executable commands
11. `9743442` — fix round 2: keep self-hosted commands pre-approved, align prefix wording

**What a porter must know:**

- **`tools/skill-loop/` is measurement harness local to this repo — it is NOT part of the skill and
  must not be upstreamed.** It exists to measure `SKILL.md` against a local Stackdome instance
  specific to this demo repo's setup; it has no meaning in the context of the upstream skills repo.
- The accept/reject measurement (§6, §9) has not been run against the current file. There is no
  tool-call-count evidence to cite in the PR description — the PR should be framed on correctness
  and the qualitative reasoning in §5 and §7, not on a speed claim.
- §8's caveat (Cloud-vs-self-hosted export line) is specific to how *this repo's* loop measures the
  skill, not a property of the skill itself — it doesn't need to travel upstream, but the underlying
  fix it depends on (§7's `91e77aa`) does.
- `guarded_facts.py`'s regex checks (§10, vacuous-regex item) encode assumptions about exact
  phrasing in specific sections of SKILL.md. They aren't upstreamed either, but a porter reordering
  or rewording sections during the PR should know those checks exist here so future local edits
  don't silently break them.

## 12. Safety notes

Measured iterations run `claude -p --dangerously-skip-permissions` — required because a headless
agent has no way to answer a permission prompt. This is scoped as tightly as the harness can manage:

- Each run happens in a **throwaway clone** of this repo under `/private/tmp` (macOS resolves
  `/tmp` there), created fresh per invocation and deleted by the `EXIT` trap.
- The clone's `git remote` is stripped (`git remote remove origin`) so it can't push anywhere.
- `STACKDOME_CONFIG` is set explicitly for every invocation to a **per-run scoped config file**
  seeded only with `server_url`/`access_token`/`insecure` for the **local** instance
  (`http://localhost:8000`) — never `~/.stackdome/config.json`, which holds the real
  `stackdome.io` credential. That file is never read or written by the harness.
- `--dangerously-skip-permissions` was approved by the user with the reasoning that a stalled run
  (waiting on a permission prompt that can never be answered) yields no measurement at all, which
  defeats the point of running it.
