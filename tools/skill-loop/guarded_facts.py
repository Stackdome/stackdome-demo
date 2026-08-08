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
    ("project workaround", r"STACKDOME_PROJECT\s*=\s*default"),
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


def _self_test():
    present = "\n".join(pattern_example for _, pattern_example in EXAMPLES)
    assert check(present) == [], check(present)

    missing = present.replace("STACKDOME_PROJECT=default", "")
    failures = check(missing)
    assert len(failures) == 1, failures
    assert "project workaround" in failures[0], failures

    # Regression: prose that only warns users off STACKDOME_PROJECT (and its
    # siblings) as an env var must NOT satisfy the guard — it is not the
    # STACKDOME_PROJECT=default cloud project-resolution workaround.
    env_var_prose = (
        "STACKDOME_URL / STACKDOME_TOKEN / STACKDOME_ORG / STACKDOME_PROJECT "
        "are the documented path for CI... they are the wrong tool for you"
    )
    env_var_failures = check(env_var_prose)
    assert any("project workaround" in f for f in env_var_failures), env_var_failures

    assert check("") and len(check("")) == len(GUARDED)
    print("guarded_facts: OK")


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        _self_test()
        sys.exit(0)
    with open(sys.argv[1]) as f:
        missing = check(f.read())
    for line in missing:
        print(line, file=sys.stderr)
    sys.exit(1 if missing else 0)
