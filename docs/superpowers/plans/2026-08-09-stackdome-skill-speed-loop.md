# Stackdome Skill Speed Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut `use-stackdome` from ~35 tool calls to single digits from invocation to a verified live URL, by measuring a fresh-context agent against the local Stackdome instance and iterating on `SKILL.md` under hard correctness gates.

**Architecture:** A harness runs one iteration as a headless `claude -p` subprocess in a throwaway clone of this repo, seeded with the current `SKILL.md`. The exact tool-call count comes from the session transcript. Gates verify the deploy actually worked; a guarded-facts check verifies the skill did not lose capability. Edits are kept only when the metric improves and every check passes.

**Tech Stack:** Python 3.9 (stdlib only — no pytest, no third-party deps), bash, `stackdome` CLI v0.0.2-alpha, `claude` CLI headless mode.

## Global Constraints

- **Scope is `.claude/skills/use-stackdome/SKILL.md` only.** No CLI, server, or repo-script changes to the product.
- **Python 3.9 stdlib only.** The system Python is 3.9.6; `tarfile.extractall(filter=)` and 3.10+ syntax are unavailable.
- **Target is the local instance** `http://localhost:8000`, config at `~/.stackdome/config.local.json`, which requires `insecure: true`.
- **Never overwrite `~/.stackdome/config.json`** — that holds the `stackdome.io` credential. Every harness invocation sets `STACKDOME_CONFIG` explicitly.
- **Tests are `assert`-based `__main__` self-checks.** No test framework is installed; do not add one.
- **The metric is tool calls**, counted from the transcript — never `num_turns`, which counts assistant turns and undercounts parallel tool use.
- Baseline to beat: **35 tool calls**.

---

### Task 1: Tool-call counter

Extracts the exact tool-call count for a completed headless run. `num_turns` from the result JSON is not the metric — one assistant turn can carry several parallel `tool_use` blocks, so it undercounts.

**Files:**
- Create: `tools/skill-loop/count_calls.py`

**Interfaces:**
- Produces: `transcript_path(session_id: str, project_dir: str) -> str`, `count_tool_uses(path: str) -> int`, `tool_histogram(path: str) -> dict[str, int]`

- [ ] **Step 1: Write the failing test**

Create `tools/skill-loop/count_calls.py` containing only the test block:

```python
def _self_test():
    import tempfile, os, json
    lines = [
        {"type": "assistant", "message": {"content": [
            {"type": "text", "text": "hi"},
            {"type": "tool_use", "name": "Bash", "id": "a"},
            {"type": "tool_use", "name": "Bash", "id": "b"},
        ]}},
        {"type": "user", "message": {"content": [
            {"type": "tool_result", "tool_use_id": "a"},
        ]}},
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Write", "id": "c"},
        ]}},
        {"type": "summary", "summary": "ignored"},
    ]
    fd, path = tempfile.mkstemp(suffix=".jsonl")
    with os.fdopen(fd, "w") as f:
        for line in lines:
            f.write(json.dumps(line) + "\n")

    assert count_tool_uses(path) == 3, count_tool_uses(path)
    assert tool_histogram(path) == {"Bash": 2, "Write": 1}, tool_histogram(path)

    # A malformed trailing line must not crash the count.
    with open(path, "a") as f:
        f.write("{not json\n")
    assert count_tool_uses(path) == 3

    assert transcript_path("abc-123", "/Users/x/code/demo").endswith(
        "/.claude/projects/-Users-x-code-demo/abc-123.jsonl"
    )
    os.unlink(path)
    print("count_calls: OK")


if __name__ == "__main__":
    _self_test()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 tools/skill-loop/count_calls.py`
Expected: FAIL with `NameError: name 'count_tool_uses' is not defined`

- [ ] **Step 3: Write minimal implementation**

Insert above `_self_test`:

```python
"""Count tool calls in a Claude Code session transcript.

The metric for the skill-speed loop is tool calls, not `num_turns` from the
headless result JSON: a single assistant turn can emit several parallel
tool_use blocks, so num_turns undercounts real work.
"""

import json
import os
import sys


def transcript_path(session_id, project_dir):
    """Locate the JSONL transcript for a session.

    Claude Code stores transcripts under ~/.claude/projects/<slug>/<id>.jsonl,
    where the slug is the absolute project path with every "/" replaced by "-".
    """
    slug = os.path.abspath(project_dir).replace("/", "-")
    return os.path.join(os.path.expanduser("~"), ".claude", "projects", slug,
                        session_id + ".jsonl")


def _tool_uses(path):
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except ValueError:
                continue  # partial or corrupt trailing write
            if entry.get("type") != "assistant":
                continue
            content = entry.get("message", {}).get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    yield block.get("name", "<unknown>")


def count_tool_uses(path):
    return sum(1 for _ in _tool_uses(path))


def tool_histogram(path):
    counts = {}
    for name in _tool_uses(path):
        counts[name] = counts.get(name, 0) + 1
    return counts
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 tools/skill-loop/count_calls.py`
Expected: `count_calls: OK`

- [ ] **Step 5: Add the CLI entry point**

Replace the `if __name__ == "__main__":` block with:

```python
if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        _self_test()
    else:
        session_id, project_dir = sys.argv[1], sys.argv[2]
        p = transcript_path(session_id, project_dir)
        print(json.dumps({"tool_calls": count_tool_uses(p),
                          "histogram": tool_histogram(p)}))
```

- [ ] **Step 6: Verify both modes**

Run: `python3 tools/skill-loop/count_calls.py --self-test`
Expected: `count_calls: OK`

- [ ] **Step 7: Commit**

```bash
git add tools/skill-loop/count_calls.py
git commit -m "Add tool-call counter for the skill speed loop"
```

---

### Task 2: Deploy gates

Decides whether an iteration's deploy actually worked. Without this the loop's cheapest possible "improvement" is deleting the verification contract from `SKILL.md`.

**Files:**
- Create: `tools/skill-loop/gates.py`

**Interfaces:**
- Consumes: nothing
- Produces: `evaluate_status(status: dict) -> list[str]` (returns failure reasons; empty list means pass), `check_url(url: str) -> list[str]`

- [ ] **Step 1: Write the failing test**

Create `tools/skill-loop/gates.py` containing only:

```python
def _self_test():
    good = {
        "stack": {
            "converged_release": {"id": "r1", "state": "Released", "health": "ok"},
            "latest_release": {"id": "r1", "state": "Released"},
        },
        "live_status": {
            "health": "ok",
            "resources": {
                "web": {"conditions": [
                    {"type": "Available", "status": "True"},
                    {"type": "Converged", "status": "True"}]},
            },
        },
    }
    assert evaluate_status(good) == [], evaluate_status(good)

    superseded = json_copy(good)
    superseded["stack"]["latest_release"]["id"] = "r2"
    assert any("latest" in r for r in evaluate_status(superseded))

    degraded = json_copy(good)
    degraded["live_status"]["health"] = "degraded"
    assert any("health" in r for r in evaluate_status(degraded))

    not_ready = json_copy(good)
    not_ready["live_status"]["resources"]["web"]["conditions"][0]["status"] = "False"
    assert any("web" in r for r in evaluate_status(not_ready))

    nothing = {"stack": {}, "live_status": {}}
    assert len(evaluate_status(nothing)) >= 1

    print("gates: OK")


if __name__ == "__main__":
    _self_test()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 tools/skill-loop/gates.py`
Expected: FAIL with `NameError: name 'evaluate_status' is not defined`

- [ ] **Step 3: Write minimal implementation**

Insert above `_self_test`:

```python
"""Gates an iteration of the skill-speed loop must clear.

These are non-negotiable. Optimising tool-call count alone makes deleting the
verification contract the cheapest possible improvement, so a fast run that
cannot prove it deployed anything must score as a failure, not a win.
"""

import json
import sys
import urllib.error
import urllib.request


def json_copy(obj):
    return json.loads(json.dumps(obj))


def evaluate_status(status):
    """Return a list of gate failures. Empty means the deploy is good."""
    reasons = []
    stack = status.get("stack") or {}
    converged = stack.get("converged_release") or {}
    latest = stack.get("latest_release") or {}

    if not converged.get("id"):
        reasons.append("no converged_release: nothing ever rolled out")
    if not latest.get("id"):
        reasons.append("no latest_release")
    if converged.get("id") and latest.get("id") and converged["id"] != latest["id"]:
        reasons.append(
            "converged %s != latest %s: a newer release superseded this one"
            % (converged["id"], latest["id"]))
    if converged.get("state") and converged["state"] != "Released":
        reasons.append("converged state is %s, want Released" % converged["state"])

    live = status.get("live_status") or {}
    if live.get("health") != "ok":
        reasons.append("stack health is %r, want 'ok'" % live.get("health"))

    resources = live.get("resources") or {}
    if not resources:
        reasons.append("no resources reported")
    for name, res in sorted(resources.items()):
        conds = {c.get("type"): c.get("status") for c in res.get("conditions", [])}
        for want in ("Available", "Converged"):
            if conds.get(want) != "True":
                reasons.append("resource %s: %s=%s, want True"
                               % (name, want, conds.get(want)))
    return reasons


def check_url(url):
    """Return a list of failures for the public URL. Empty means HTTP 200."""
    try:
        resp = urllib.request.urlopen(url, timeout=30)
    except urllib.error.HTTPError as exc:
        return ["%s returned HTTP %s" % (url, exc.code)]
    except Exception as exc:  # DNS, TLS, connection refused
        return ["%s unreachable: %s" % (url, exc)]
    if resp.status != 200:
        return ["%s returned HTTP %s" % (url, resp.status)]
    if len(resp.read()) == 0:
        return ["%s returned an empty body" % url]
    return []
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 tools/skill-loop/gates.py`
Expected: `gates: OK`

- [ ] **Step 5: Add the CLI entry point**

Replace the `if __name__ == "__main__":` block with:

```python
if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        _self_test()
        sys.exit(0)
    status_file, url = sys.argv[1], sys.argv[2]
    with open(status_file) as f:
        failures = evaluate_status(json.load(f))
    failures += check_url(url)
    for reason in failures:
        print("GATE FAIL: " + reason, file=sys.stderr)
    print(json.dumps({"passed": not failures, "failures": failures}))
    sys.exit(1 if failures else 0)
```

- [ ] **Step 6: Verify against the real deployed stack**

```bash
export STACKDOME_CONFIG=$HOME/.stackdome/config.local.json
stackdome stack list -o json > /tmp/stacks.json
python3 tools/skill-loop/gates.py --self-test
```
Expected: `gates: OK`

- [ ] **Step 7: Commit**

```bash
git add tools/skill-loop/gates.py
git commit -m "Add deploy gates for the skill speed loop"
```

---

### Task 3: Guarded-facts regression check

`SKILL.md` covers debugging, rollback, secrets, and destructive-operation safety. The loop optimises only the deploy path, so it will happily delete everything else. This check makes that a hard failure.

It also protects one fact the loop **cannot** discover: the local instance returns `{"items":[],"total":0}` from `/users/current/projects`, so the CLI's fallback works and the project resolves. Cloud returns membership-shaped objects, the fallback misses, and `stackdome stack list` exits `3`. Running against localhost, the loop sees `STACKDOME_PROJECT=default` as pure dead weight and will strip it — silently breaking every cloud user.

**Files:**
- Create: `tools/skill-loop/guarded_facts.py`

**Interfaces:**
- Produces: `GUARDED: list[tuple[str, str]]` (label, regex), `check(text: str) -> list[str]`

- [ ] **Step 1: Write the failing test**

Create `tools/skill-loop/guarded_facts.py` containing only:

```python
def _self_test():
    present = "\n".join(pattern_example for _, pattern_example in EXAMPLES)
    assert check(present) == [], check(present)

    missing = present.replace("STACKDOME_PROJECT", "XXX")
    failures = check(missing)
    assert len(failures) == 1, failures
    assert "project" in failures[0].lower(), failures

    assert check("") and len(check("")) == len(GUARDED)
    print("guarded_facts: OK")


if __name__ == "__main__":
    _self_test()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python3 tools/skill-loop/guarded_facts.py`
Expected: FAIL with `NameError: name 'EXAMPLES' is not defined`

- [ ] **Step 3: Write minimal implementation**

Insert above `_self_test`:

```python
"""Facts SKILL.md must never lose to an optimisation pass.

The loop measures only the deploy path against a local instance. Anything it
cannot observe is, to the loop, free to delete. Each entry here is either a
capability the loop never exercises, or a fact that is invisible locally and
essential on Stackdome Cloud.
"""

import re
import sys

GUARDED = [
    # Invisible locally: localhost's /users/current/projects returns an empty
    # list so the CLI's fallback fires and the project resolves. Cloud returns
    # membership objects, the fallback misses, and commands exit 3.
    ("project workaround", r"STACKDOME_PROJECT"),
    ("cloud host", r"stackdome\.io"),
    # Capabilities the deploy-path metric never exercises.
    ("build debugging", r"build\s+logs"),
    ("rollback", r"release\s+rollback"),
    ("destructive confirmation", r"irreversible|cannot be (undone|recovered)"),
    ("no blocking follow", r"--follow|--watch"),
    # Source selection (see the source-selection spec).
    ("ttl.sh path", r"ttl\.sh"),
    ("platform pin", r"--platform\s+linux/amd64"),
    ("credential verify", r"[Vv]erify a (git integration|registry credential)"),
]

EXAMPLES = [
    ("project workaround", "STACKDOME_PROJECT=default"),
    ("cloud host", "https://stackdome.io"),
    ("build debugging", "stackdome build logs <id>"),
    ("rollback", "stackdome release rollback <id>"),
    ("destructive confirmation", "this is irreversible"),
    ("no blocking follow", "never use --follow"),
    ("ttl.sh path", "push to ttl.sh"),
    ("platform pin", "docker build --platform linux/amd64"),
    ("credential verify", "Verify a registry credential"),
]


def check(text):
    """Return a list of missing guarded facts. Empty means all present."""
    missing = []
    for label, pattern in GUARDED:
        if not re.search(pattern, text):
            missing.append("SKILL.md lost guarded fact: %s (/%s/)" % (label, pattern))
    return missing
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python3 tools/skill-loop/guarded_facts.py`
Expected: `guarded_facts: OK`

- [ ] **Step 5: Add the CLI entry point**

Replace the `if __name__ == "__main__":` block with:

```python
if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        _self_test()
        sys.exit(0)
    with open(sys.argv[1]) as f:
        missing = check(f.read())
    for line in missing:
        print(line, file=sys.stderr)
    sys.exit(1 if missing else 0)
```

- [ ] **Step 6: Record the current baseline failures**

Run: `python3 tools/skill-loop/guarded_facts.py .claude/skills/use-stackdome/SKILL.md; echo "exit=$?"`
Expected: non-zero. The current file has no `ttl.sh`, no `--platform linux/amd64`, no `STACKDOME_PROJECT`, and no `stackdome.io` — Tasks 5 and 7 add them. Note which are missing; do not fix them here.

- [ ] **Step 7: Commit**

```bash
git add tools/skill-loop/guarded_facts.py
git commit -m "Add guarded-facts regression check for SKILL.md"
```

---

### Task 4: Iteration runner and baseline

Runs one measured iteration end to end and records the unmodified `SKILL.md` baseline.

A truly cold start is not automatable: minting an API token needs a human, and a headless agent that asks a question deadlocks with no TTY. The runner therefore seeds auth — server URL and token, deliberately **without** `project_name` — which is exactly the post-login state that exposed the cloud bug.

**Files:**
- Create: `tools/skill-loop/run_iteration.sh`
- Create: `tools/skill-loop/baseline.json`

**Interfaces:**
- Consumes: `count_calls.py`, `gates.py`, `guarded_facts.py`
- Produces: a JSON result line per run: `{"label", "tool_calls", "passed", "failures", "url", "session_id", "cost_usd"}`

- [ ] **Step 1: Write the runner**

Create `tools/skill-loop/run_iteration.sh`:

```bash
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
WORK="$(mktemp -d "/tmp/sd-loop-${LABEL}.XXXXXX")"
STACK="sd-loop-${LABEL}"
RESULTS="${REPO_ROOT}/tools/skill-loop/results.jsonl"

export STACKDOME_CONFIG="${WORK}/stackdome.json"
SOURCE_CONFIG="${HOME}/.stackdome/config.local.json"

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

# Throwaway working copy. The stack name derives from the directory name, so
# each iteration gets its own stack and they never collide.
git clone --depth 1 --quiet "file://${REPO_ROOT}" "${WORK}/${STACK}"
rm -f "${WORK}/${STACK}/stackfile.yaml"
mkdir -p "${WORK}/${STACK}/.claude/skills"
cp -R "${REPO_ROOT}/.claude/skills/use-stackdome" \
      "${WORK}/${STACK}/.claude/skills/use-stackdome"

cd "${WORK}/${STACK}" || exit 1

# --dangerously-skip-permissions is required: a headless agent cannot answer a
# permission prompt. It is confined to this throwaway clone.
RESULT_JSON="$(timeout 900 claude -p \
  "Use the use-stackdome skill to deploy this repository to Stackdome and give me the live URL. Do not ask questions; you are already authenticated." \
  --output-format json \
  --dangerously-skip-permissions 2>/dev/null)"

SESSION_ID="$(printf '%s' "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("session_id",""))')"
COST="$(printf '%s' "$RESULT_JSON" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("total_cost_usd",0))')"

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

python3 - "$LABEL" "$CALLS" "$GATES" "$FACTS_OK" "$URL" "$SESSION_ID" "$COST" \
  >> "$RESULTS" <<'PY'
import json, sys
label, calls, gates_json, facts_ok, url, session, cost = sys.argv[1:8]
gates = json.loads(gates_json) if gates_json else {"passed": False, "failures": ["no gate output"]}
failures = list(gates["failures"])
if facts_ok != "0":
    failures.append("guarded facts missing from SKILL.md")
print(json.dumps({
    "label": label,
    "tool_calls": int(calls) if calls.isdigit() else None,
    "passed": gates["passed"] and facts_ok == "0",
    "failures": failures,
    "url": url,
    "session_id": session,
    "cost_usd": float(cost),
}))
PY

tail -1 "$RESULTS"
```

- [ ] **Step 2: Make it executable and verify it fails cleanly with no label**

```bash
chmod +x tools/skill-loop/run_iteration.sh
tools/skill-loop/run_iteration.sh
```
Expected: `usage: run_iteration.sh <label>`, non-zero exit.

- [ ] **Step 3: Confirm the local instance is reachable**

```bash
STACKDOME_CONFIG=$HOME/.stackdome/config.local.json stackdome doctor -o json \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["server"]["status"], d["auth"]["status"])'
```
Expected: `ok ok`. If not, re-run `stackdome login --url http://localhost:8000 --email <you> --password <pw> --insecure` with `STACKDOME_CONFIG` set to the local file.

- [ ] **Step 4: Record the baseline**

```bash
tools/skill-loop/run_iteration.sh baseline
```

This runs the **unmodified** `SKILL.md`. Expect `passed: false` — the guarded-facts check fails until Tasks 5 and 7 land. Record the `tool_calls` number regardless; that is the number to beat.

- [ ] **Step 5: Freeze the baseline**

```bash
cp tools/skill-loop/results.jsonl /tmp/first-run.jsonl
python3 - <<'PY' > tools/skill-loop/baseline.json
import json
with open("/tmp/first-run.jsonl") as f:
    row = json.loads(f.readlines()[-1])
json.dump({"tool_calls": row["tool_calls"], "session_id": row["session_id"],
           "note": "unmodified SKILL.md against local instance"},
          open("/dev/stdout", "w"), indent=2)
PY
cat tools/skill-loop/baseline.json
```

- [ ] **Step 6: Commit**

```bash
echo "tools/skill-loop/results.jsonl" >> .gitignore
git add tools/skill-loop/run_iteration.sh tools/skill-loop/baseline.json .gitignore
git commit -m "Add iteration runner and record skill speed baseline"
```

---

### Task 5: Direction A — fact injection

Highest value per edit, near-zero risk. Adds the facts whose absence cost the most: the real host, the working install path, the project bug, exact output shapes, and which flags exist where.

**Files:**
- Modify: `.claude/skills/use-stackdome/SKILL.md`

**Interfaces:**
- Consumes: `run_iteration.sh` from Task 4
- Produces: a `SKILL.md` that passes `guarded_facts.py` for the four non-source-selection entries

- [ ] **Step 1: Add the verified-facts block**

Insert immediately after the opening paragraph of `.claude/skills/use-stackdome/SKILL.md`:

```markdown
## Verified state (v0.0.2-alpha, checked 2026-08-09)

Facts confirmed by direct observation. Trust these over inference; they cost
~20 tool calls to rediscover.

- **Cloud is `https://stackdome.io`.** `cloud.stackdome.com` does not resolve
  (NXDOMAIN); `cloud.stackdome.io` and `app.stackdome.io` serve Traefik's
  self-signed default certificate and fail TLS verification.
- **The CLI install URL in the docs 404s** — the release repo is private. Use
  `gh release download <tag> -R Stackdome/stackdome-cli -p '*_darwin_arm64.tar.gz'`,
  then `install -m 755 stackdome ~/.local/bin/`.
- **On Cloud, every command needs `STACKDOME_PROJECT=default`.** Without it the
  CLI exits `3` with `Resource not found`, because `/users/current/projects`
  returns membership objects the CLI decodes as empty projects
  (stackdome-cli#7). Self-hosted instances are unaffected. Setting it also
  disables persisted stack selection, so `--stack <name>` becomes mandatory on
  commands that take it.
- **`deploy` has no `--stack` flag.** The stack name comes from `name:` in the
  stackfile. `status`, `open`, `logs`, and `release *` do take `--stack`.
- **`status -o json` returns `{"stack": {...}, "live_status": {...}}`.** Release
  state is at `.stack.converged_release` / `.stack.latest_release`; per-resource
  readiness is at `.live_status.resources.<name>.conditions[]`, a map keyed by
  resource name, not a list.
- **`open -o json` returns `{"target": "<url>", "urls": [...]}`.**
- **Plain HTTP servers need `--insecure` on `login`**, or it refuses.
- **Env values are literal.** `${VAR:-default}` from a compose file is not
  interpolated; substitute real values. Cross-resource references use
  `{{ <resource>.url }}` and `{{ self.public_url }}` — `stackdome init` does not
  generate these, and a hardcoded `redis://redis:6379` is wrong.
```

- [ ] **Step 2: Verify the guarded facts it should now satisfy**

```bash
python3 tools/skill-loop/guarded_facts.py .claude/skills/use-stackdome/SKILL.md
```
Expected: only the three source-selection entries (`ttl.sh`, `--platform linux/amd64`, credential verify) remain — Task 7 adds those.

- [ ] **Step 3: Measure**

```bash
tools/skill-loop/run_iteration.sh direction-a
```

- [ ] **Step 4: Keep or revert**

Compare `tool_calls` against `tools/skill-loop/baseline.json`. Keep if it dropped. If it rose, revert with `git checkout .claude/skills/use-stackdome/SKILL.md` and record why in `results.jsonl` — a fact block that makes runs slower means the file got harder to read, and the fix is to shorten it, not to delete the facts.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/use-stackdome/SKILL.md
git commit -m "Skill: add verified-state facts (direction A)"
```

---

### Task 6: Direction C — probe batching

Mechanical, and it compounds with Task 5. Collapses round-trips without changing what the agent knows.

**Files:**
- Modify: `.claude/skills/use-stackdome/SKILL.md`

**Interfaces:**
- Consumes: the verified-facts block from Task 5

- [ ] **Step 1: Add the batched recipes**

Append to the `## Verified state` section:

```markdown
### Batched commands

Each of these is one tool call. Prefer them over running the parts separately.

Probe everything at once:

```bash
stackdome version; stackdome doctor -o json; ls stackfile.yaml 2>/dev/null
```

Validate and deploy together — `deploy` takes no `--stack`:

```bash
stackdome validate && stackdome deploy --wait -o json
```

Verify a deploy in one call (substitute the stack name):

```bash
stackdome status --stack <name> -o json > /tmp/st.json
python3 -c "
import json; d=json.load(open('/tmp/st.json'))
s=d['stack']; c=s.get('converged_release') or {}; l=s.get('latest_release') or {}
print('converged', c.get('id'), c.get('state'), c.get('health'))
print('latest   ', l.get('id'), l.get('state'))
for n,r in (d['live_status'].get('resources') or {}).items():
    cs={x['type']:x['status'] for x in r.get('conditions',[])}
    print(n, 'Available=', cs.get('Available'), 'Converged=', cs.get('Converged'))
"
stackdome open web --stack <name> -o json
```
```

- [ ] **Step 2: Measure**

```bash
tools/skill-loop/run_iteration.sh direction-c
```

- [ ] **Step 3: Keep or revert**

Keep if `tool_calls` dropped versus the Task 5 result. Otherwise `git checkout .claude/skills/use-stackdome/SKILL.md`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/use-stackdome/SKILL.md
git commit -m "Skill: batch discovery and verification commands (direction C)"
```

---

### Task 7: Source selection

Implements `2026-08-09-stackdome-source-selection-design.md`. Ordered after A and C so the guarded-facts check protects these branches before Direction B's rewrite can touch them.

**Files:**
- Modify: `.claude/skills/use-stackdome/SKILL.md`

**Interfaces:**
- Consumes: `guarded_facts.py` entries `ttl.sh path`, `platform pin`, `credential verify`

- [ ] **Step 1: Add the source-selection section**

Insert immediately before the existing `## Author the stackfile` section:

```markdown
## Choose the source

Do this before authoring the stackfile. **Infer first, ask only when the answer
is genuinely unknown** — an unconditional question costs a round-trip on every
deploy.

```bash
git remote -v 2>/dev/null | head -1
gh repo view --json visibility -q .visibility 2>/dev/null
ls Dockerfile */Dockerfile 2>/dev/null
```

| What you find | Take this path | Ask? |
|---|---|---|
| Remote exists, `PUBLIC` | Public repo | no |
| Remote exists, `PRIVATE` | Private repo | no — but the credential step is still required |
| No remote, or no Dockerfile | Ask the user which of the four applies | yes |

**Public repo.** Set `build.repo` to the HTTPS clone URL plus `branch:`. The
`context:` is root-relative to the repository, not to your working directory —
a compose `build: ./web` inside `hello-stack/` becomes `/hello-stack/web`.

**Private repo.** The build needs an org-level git integration. There is no CLI
command; use `stackdome api`. Create it, then **verify it before deploying** —
one call that fails in seconds, versus a build failure minutes later whose
message does not name the credential.

- https://docs.stackdome.com/api-reference/create-a-git-integration-for-the-organization.md
- https://docs.stackdome.com/api-reference/verify-a-git-integration-against-a-repository.md
- https://docs.stackdome.com/api-reference/list-repositories-visible-to-the-github-app-installation.md

**Existing image.** Public registry: reference it as `image:` and stop. Private
registry: register a credential for that registry URL and verify it. Credentials
resolve **implicitly by registry URL** — the stackfile needs no change and no
credential reference.

- https://docs.stackdome.com/api-reference/create-a-new-image-registry.md
- https://docs.stackdome.com/api-reference/verify-a-registry-credential-against-a-repository.md
- https://docs.stackdome.com/api-reference/list-registry-credentials-for-the-organization.md

**Local directory, no repo.** Build and push to `ttl.sh`, an anonymous ephemeral
registry needing no account or credential:

```bash
IMG="ttl.sh/$(uuidgen | tr 'A-Z' 'a-z'):24h"
docker build --platform linux/amd64 -t "$IMG" .
docker push "$IMG"
```

Then reference `$IMG` as `image:` in the stackfile.

Two things to tell the user, not discover:

- **`--platform linux/amd64` is mandatory.** Apple silicon builds arm64 by
  default; that image pushes cleanly and then fails on pull or crashes on start
  in an amd64 cluster, which looks like a broken app rather than a broken build.
- **`ttl.sh` images expire — 24h is the maximum.** This is a demo and preview
  path. Anything meant to outlive a day needs a real registry or a git build.

Any mutating API call needs `--yes`, and the user's agreement comes first.
```

- [ ] **Step 2: Verify all guarded facts now pass**

```bash
python3 tools/skill-loop/guarded_facts.py .claude/skills/use-stackdome/SKILL.md; echo "exit=$?"
```
Expected: `exit=0`, no output.

- [ ] **Step 3: Measure**

```bash
tools/skill-loop/run_iteration.sh source-selection
```

Expected: `passed: true`, and `tool_calls` no worse than the Task 6 result. The fixture repo is public with a remote, so inference should take the public path with zero questions. **If `tool_calls` rises, the inference rule is not firing** — check whether the agent asked anyway rather than reverting the section.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/use-stackdome/SKILL.md
git commit -m "Skill: add source selection with inference and credential verification"
```

---

### Task 8: Direction B — golden-path rewrite

The largest rewrite and the highest regression risk. Run only after A, C, and 7 have landed and the metric has plateaued.

The current file is reference-shaped: an agent reads, routes, and decides at each step instead of executing. This front-loads one linear recipe and demotes the rest.

**Files:**
- Modify: `.claude/skills/use-stackdome/SKILL.md`

**Interfaces:**
- Consumes: everything from Tasks 5–7; all guarded facts must survive

- [ ] **Step 1: Confirm the metric has plateaued**

```bash
tail -4 tools/skill-loop/results.jsonl \
  | python3 -c 'import sys,json; [print(json.loads(l)["label"], json.loads(l)["tool_calls"]) for l in sys.stdin]'
```

If the last two iterations improved by more than 2 calls, keep iterating on A and C instead — B is not worth its risk yet.

- [ ] **Step 2: Restructure**

Move a `## Deploy this repo now` section to the very top, directly after the intro, containing the numbered zero-to-URL sequence built from the Task 6 batched commands. Demote the existing `## Routing` table and every reference section beneath it under a `## Reference` heading. Change no wording inside the reference sections — this task is ordering only, so that a regression is unambiguously attributable.

- [ ] **Step 3: Verify nothing was lost**

```bash
python3 tools/skill-loop/guarded_facts.py .claude/skills/use-stackdome/SKILL.md; echo "exit=$?"
```
Expected: `exit=0`. A non-zero exit means the rewrite dropped a capability; restore it before measuring.

- [ ] **Step 4: Measure**

```bash
tools/skill-loop/run_iteration.sh direction-b
```

- [ ] **Step 5: Keep or revert**

Keep only if `tool_calls` improved **and** `passed: true`. A rewrite that ties the previous score is a revert — it carries regression risk without a payoff.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/use-stackdome/SKILL.md
git commit -m "Skill: front-load the golden path (direction B)"
```

---

### Task 9: Upstream and record

The skill is vendored from `stackdome/stackdome-skills` (see `skills-lock.json`). Local edits do not reach other users.

**Files:**
- Create: `tools/skill-loop/RESULTS.md`

- [ ] **Step 1: Summarise the run**

Write `tools/skill-loop/RESULTS.md` with a table of every label from `results.jsonl` — tool calls, passed, cost — plus the baseline, the final number, and which directions were kept or reverted.

- [ ] **Step 2: Note the vendoring gap**

Add a closing section stating that `.claude/skills/use-stackdome/SKILL.md` is vendored, that `skills-lock.json` records `computedHash`, and that these edits must be raised as a PR against `stackdome/stackdome-skills` at `plugins/stackdome/skills/use-stackdome/SKILL.md` to reach anyone else.

- [ ] **Step 3: Commit**

```bash
git add tools/skill-loop/RESULTS.md
git commit -m "Record skill speed loop results"
```

---

## Self-Review

**Spec coverage.** Speed-loop spec: metric (Task 1), gates (Task 2), regression guard (Task 3), iteration harness and baseline (Task 4), directions A/C/B (Tasks 5, 6, 8). Source-selection spec: all four branches, infer-then-ask, verify-before-deploy, ttl.sh with the platform pin and 24h ceiling, docs links (Task 7).

**Two deliberate deviations from the specs, both recorded in-plan:**

1. The spec called for a cold `STACKDOME_CONFIG`. Fully cold is not automatable — minting a token needs a human and a headless agent cannot ask. Task 4 seeds server and token but omits `project_name`, which is the exact post-login state that exposed the cloud bug.
2. The spec's "at most one user question" gate is unenforceable headlessly, since the agent cannot ask at all. It is replaced by the stronger condition that the run must complete unattended.

**One fact discovered after the specs were written**, now guarded in Task 3: the local instance returns `{"items":[],"total":0}` from `/users/current/projects`, so the CLI fallback fires and the project resolves correctly. The bug is cloud-only. A loop running locally therefore sees `STACKDOME_PROJECT` as dead weight and would strip it, breaking every cloud user — invisible to the metric, which is precisely why it is guarded rather than measured.

**Placeholder scan.** No TBDs. Every code step carries runnable code; Task 8 Step 2 is deliberately structural rather than literal, since it reorders existing prose whose final content depends on Tasks 5–7.

**Type consistency.** `evaluate_status`, `check_url`, `check`, `count_tool_uses`, `tool_histogram`, and `transcript_path` are used with the same signatures everywhere they appear.
