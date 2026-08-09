#!/usr/bin/env bash
# One measured iteration of the skill-speed loop.
#
# Clones this repo to a throwaway directory, drops in the CURRENT SKILL.md,
# seeds authentication, and asks a fresh headless agent to deploy it. Counts
# the agent's tool calls, gates the result, then destroys the stack.
#
# Usage: run_iteration.sh <label>
set -uo pipefail

LABEL="${1:?usage: run_iteration.sh <label>}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# 1800s (not the brief's 900s): a real diagnostic run was killed by the 900s
# ceiling at 896s, mid-deploy, having made 29 real tool calls and reached
# `stackdome deploy`. The harness was working; the budget was too small.
TIMEOUT_SECS=1800

WORK="$(mktemp -d "/tmp/sd-loop-${LABEL}-XXXXXX")"
# Resolve symlinks (macOS: /tmp -> /private/tmp) so this matches the cwd
# Claude Code records for the session transcript path count_calls.py looks up.
WORK="$(cd "$WORK" && pwd -P)"
# STACK is derived from the resolved work-dir basename (label + mktemp's
# random suffix, lowercased), not just the label: the brief's literal
# STACK="sd-loop-${LABEL}" has no per-run suffix, so two iterations sharing a
# label would collide on the same stack name. No "." anywhere in the path
# either: Claude Code's project-slug algorithm turns every non-alphanumeric
# char (not just "/") into "-", so a literal dot (the brief's ".XXXXXX"
# mktemp suffix) desyncs count_calls.py's naive slug (which only replaces
# "/") from the real transcript directory.
STACK="$(basename "$WORK" | tr 'A-Z' 'a-z')"
RESULTS="${REPO_ROOT}/tools/skill-loop/results.jsonl"

export STACKDOME_CONFIG="${WORK}/stackdome.json"
SOURCE_CONFIG="${HOME}/.stackdome/config.local.json"

# Warm the source token. The local instance's access_token is short-lived and
# only refreshes when a command runs against the full config (it carries
# refresh_token); without this, a source file left idle between iterations
# can hand the throwaway copy below an already-dead access_token.
STACKDOME_CONFIG="$SOURCE_CONFIG" stackdome doctor -o json >/dev/null 2>&1

cleanup() {
  STACKDOME_CONFIG="${WORK}/stackdome.json" \
    stackdome destroy --stack "${STACK}" -y >/dev/null 2>&1
  rm -rf "${WORK}"
}
trap cleanup EXIT

# Seed auth: server + token, but NO project_name and NO current_stack. This is
# the just-logged-in state, and the one that exposed the cloud project bug.
python3 - "$SOURCE_CONFIG" "$STACKDOME_CONFIG" <<'PY'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
with open(src) as f:
    cfg = json.load(f)
seeded = {k: cfg[k] for k in ("server_url", "access_token", "insecure") if k in cfg}
with open(dst, "w") as f:
    json.dump(seeded, f)
PY

# Throwaway working copy.
git clone --depth 1 --quiet "file://${REPO_ROOT}" "${WORK}/${STACK}"

# Isolation: a file:// clone's "origin" points straight at REPO_ROOT — the
# user's real working copy, not a throwaway. A measured agent running with
# --dangerously-skip-permissions has already `git fetch origin`'d it (read
# -only so far, but nothing stopped a write). Strip the remote so nothing in
# the clone can resolve back out to the real repo.
git -C "${WORK}/${STACK}" remote remove origin

# Belt and braces on the stackfile, in the clone only. stackfile.yaml is
# git-tracked (name: stackdome-demo), so the brief's `rm -f` presented as a
# tracked-file deletion and the measured agent "helpfully" restored it from
# git — every iteration collided on one shared, non-throwaway stack instead
# of getting real per-iteration isolation. Fix: untrack it (so there is
# nothing to restore from) AND rewrite its name in place to this iteration's
# unique stack id. The file stays present on disk throughout — only its git
# tracking status and its name: line change. Everything else in the fixture
# (prebuilt quay.io/stackdome/hello-stack-* images, matching the design
# spec's 55s deploy) is left as committed.
git -C "${WORK}/${STACK}" rm --cached --quiet stackfile.yaml
sed -i.bak "s/^name: .*/name: ${STACK}/" "${WORK}/${STACK}/stackfile.yaml"
rm -f "${WORK}/${STACK}/stackfile.yaml.bak"

mkdir -p "${WORK}/${STACK}/.claude/skills"
cp -R "${REPO_ROOT}/.claude/skills/use-stackdome" \
      "${WORK}/${STACK}/.claude/skills/use-stackdome"

cd "${WORK}/${STACK}" || exit 1

# --dangerously-skip-permissions is required: a headless agent cannot answer a
# permission prompt, and a stalled run produces no tool-call count at all —
# that is the failure being avoided, not one being risked. It is confined to
# this throwaway clone: its own STACKDOME_CONFIG, localhost only, no origin
# remote (see above).
RESULT_JSON="$(timeout "${TIMEOUT_SECS}" claude -p \
  "Use the use-stackdome skill to deploy this repository to Stackdome and give me the live URL. Do not ask questions; you are already authenticated." \
  --output-format json \
  --dangerously-skip-permissions 2>/dev/null)"

SESSION_ID="$(printf '%s' "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("session_id",""))')"
COST="$(printf '%s' "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("total_cost_usd",0))')"
SUBTYPE="$(printf '%s' "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("subtype",""))' 2>/dev/null)"
DURATION_MS="$(printf '%s' "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("duration_ms",0))' 2>/dev/null)"

CALLS="$(python3 "${REPO_ROOT}/tools/skill-loop/count_calls.py" \
  "$SESSION_ID" "${WORK}/${STACK}" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["tool_calls"])')"

stackdome status --stack "${STACK}" -o json > "${WORK}/status.json" 2>/dev/null
URL="$(stackdome open web --stack "${STACK}" -o json 2>/dev/null \
  | python3 -c 'import sys,json; print(json.load(sys.stdin).get("target",""))' 2>/dev/null)"

GATES="$(python3 "${REPO_ROOT}/tools/skill-loop/gates.py" "${WORK}/status.json" "${URL}" 2>/dev/null)"
python3 "${REPO_ROOT}/tools/skill-loop/guarded_facts.py" \
  "${REPO_ROOT}/.claude/skills/use-stackdome/SKILL.md" 2>/dev/null
FACTS_OK=$?

# Record a row on every outcome, not just success: a timed-out or otherwise
# non-success run still has a real, diagnosable transcript and tool-call
# count (a run killed at the timeout ceiling made 29 real tool calls before
# dying) — throwing that away as a bare `tool_calls: null` is what made the
# first baseline failure take a live re-run to even understand.
python3 - "$LABEL" "$CALLS" "$GATES" "$FACTS_OK" "$URL" "$SESSION_ID" "$COST" \
  "$SUBTYPE" "$DURATION_MS" "$((TIMEOUT_SECS * 1000))" \
  >> "$RESULTS" <<'PY'
import json, sys
label, calls, gates_json, facts_ok, url, session, cost, subtype, duration_ms, timeout_ms = sys.argv[1:11]
gates = json.loads(gates_json) if gates_json else {"passed": False, "failures": ["no gate output"]}
failures = list(gates["failures"])
if facts_ok != "0":
    failures.append("guarded facts missing from SKILL.md")
passed = gates["passed"] and facts_ok == "0"

duration_ms = int(duration_ms) if duration_ms.isdigit() else 0
timeout_ms = int(timeout_ms)
if passed:
    outcome = "ok"
elif subtype != "success":
    # Killed at (or within 5s of) the timeout ceiling vs some other failure
    # mode (e.g. auth) that ends the subprocess quickly instead.
    outcome = "timeout" if duration_ms >= timeout_ms - 5000 else "error"
else:
    outcome = "gate_fail"

print(json.dumps({
    "label": label,
    "tool_calls": int(calls) if calls.isdigit() else None,
    "passed": passed,
    "outcome": outcome,
    "failures": failures,
    "url": url,
    "session_id": session,
    "cost_usd": float(cost),
}))
PY

tail -1 "$RESULTS"
