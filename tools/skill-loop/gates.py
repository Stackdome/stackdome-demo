"""Gates an iteration of the skill-speed loop must clear.

These are non-negotiable. Optimising tool-call count alone makes deleting the
verification contract the cheapest possible improvement, so a fast run that
cannot prove it deployed anything must score as a failure, not a win.
"""

import http.server
import json
import socket
import sys
import threading
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

    wrong_state = json_copy(good)
    wrong_state["stack"]["converged_release"]["state"] = "Failed"
    assert any("Released" in r for r in evaluate_status(wrong_state))

    no_converged = json_copy(good)
    del no_converged["stack"]["converged_release"]
    assert any("no converged_release" in r for r in evaluate_status(no_converged))

    no_latest = json_copy(good)
    del no_latest["stack"]["latest_release"]
    assert any("no latest_release" in r for r in evaluate_status(no_latest))

    class _Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            if self.path == "/ok":
                body = b"hello"
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif self.path == "/empty":
                self.send_response(200)
                self.send_header("Content-Length", "0")
                self.end_headers()
            else:
                self.send_response(500)
                self.send_header("Content-Length", "0")
                self.end_headers()

    server = http.server.HTTPServer(("127.0.0.1", 0), _Handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        base = "http://127.0.0.1:%d" % port
        assert check_url(base + "/ok") == []
        assert len(check_url(base + "/missing")) >= 1
        assert len(check_url(base + "/empty")) >= 1
    finally:
        server.shutdown()
        thread.join()

    closed = socket.socket()
    closed.bind(("127.0.0.1", 0))
    closed_port = closed.getsockname()[1]
    closed.close()
    assert len(check_url("http://127.0.0.1:%d/x" % closed_port)) >= 1

    print("gates: OK")


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
