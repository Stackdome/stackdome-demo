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
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        _self_test()
    else:
        session_id, project_dir = sys.argv[1], sys.argv[2]
        p = transcript_path(session_id, project_dir)
        print(json.dumps({"tool_calls": count_tool_uses(p),
                          "histogram": tool_histogram(p)}))
