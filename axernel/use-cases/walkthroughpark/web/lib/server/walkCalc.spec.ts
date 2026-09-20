import type { Run } from "@axernel/sdk"
import { describe, expect, it } from "vitest"

import { availableArtifactId, isRepeatedControl, MAX_FAILURES, newWalkRow, nextPumpStep, runFields, runInputData, sessionTitle, toWalkthrough } from "./walkCalc"

const run = (fields: Record<string, unknown>): Run => ({ id: "run-1", sessionId: "session-1", status: "running", ...fields }) as unknown as Run
const output = (name: string, status: string, artifactId: string | null = null) => ({ name, status, artifactId })

describe("runInputData", () => {
  describe("given only a source and a duration", () => {
    it("sends no empty optional keys, which the input contract would reject", () => {
      expect(runInputData({ source: "https://github.com/acme/todo", kind: "repo", maxSeconds: 60, instruction: "" })).toEqual({
        source: "https://github.com/acme/todo",
        maxSeconds: 60,
      })
    })
  })

  describe("given a ref, a subdir and an instruction", () => {
    it("passes them on and leaves kind out", () => {
      const data = runInputData({ source: "s", kind: "repo", ref: "main", subdir: "web", instruction: "show login", maxSeconds: 30 })
      expect(data).toEqual({ source: "s", ref: "main", subdir: "web", instruction: "show login", maxSeconds: 30 })
    })
  })
})

describe("sessionTitle", () => {
  const repo = { source: "https://github.com/acme/todo", kind: "repo", maxSeconds: 60 } as const

  describe("given a pull request", () => {
    it("names the repo and the PR number", () => {
      expect(sessionTitle({ source: "https://github.com/acme/todo/pull/8", kind: "pr", maxSeconds: 60 })).toBe("acme/todo PR #8")
    })
  })

  describe("given a plain repo", () => {
    it("is just owner/repo", () => {
      expect(sessionTitle(repo)).toBe("acme/todo")
    })
  })

  describe("given a ref and a subdir", () => {
    it("adds each after the repo", () => {
      expect(sessionTitle({ ...repo, ref: "feat/x", subdir: "apps/web" })).toBe("acme/todo @ feat/x / apps/web")
      expect(sessionTitle({ ...repo, subdir: "apps/web" })).toBe("acme/todo / apps/web")
    })
  })

  describe("given a short instruction over several lines", () => {
    it("appends only the first line", () => {
      expect(sessionTitle({ ...repo, instruction: "  show login  \nthen logout" })).toBe("acme/todo: show login")
    })
  })

  describe("given an instruction longer than 60 characters", () => {
    it("cuts it at 60 and marks the cut", () => {
      expect(sessionTitle({ ...repo, instruction: "x".repeat(61) })).toBe(`acme/todo: ${"x".repeat(60)}…`)
    })

    it("leaves exactly 60 characters alone", () => {
      expect(sessionTitle({ ...repo, instruction: "x".repeat(60) })).toBe(`acme/todo: ${"x".repeat(60)}`)
    })
  })

  describe("given a blank instruction", () => {
    it("appends nothing", () => {
      expect(sessionTitle({ ...repo, instruction: "  " })).toBe("acme/todo")
    })
  })
})

describe("runFields", () => {
  describe("given a run that is still going", () => {
    it("is not settled", () => {
      expect(runFields(run({ status: "running" })).settled).toBe(0)
    })
  })

  describe("given a completed run whose artifact is still pending", () => {
    it("is not settled, so the next read asks Axernel again", () => {
      expect(runFields(run({ status: "completed", artifactOutputs: [output("walkthrough", "pending")] })).settled).toBe(0)
    })
  })

  describe("given a completed run with every artifact decided", () => {
    const fields = runFields(
      run({
        status: "completed",
        response: { kind: "result", value: { title: "Todo" } },
        usage: { totalTokens: 10, costUsd: 0.5, inputTokens: 7 },
        artifactOutputs: [output("walkthrough", "available", "artifact-1"), output("clean", "missing")],
      }),
    )

    it("is settled", () => {
      expect(fields.settled).toBe(1)
    })

    it("keeps the result, and only the usage the page shows", () => {
      expect(JSON.parse(fields.result ?? "")).toEqual({ title: "Todo" })
      expect(JSON.parse(fields.usage ?? "")).toEqual({ totalTokens: 10, costUsd: 0.5 })
    })
  })

  describe("given a failed run", () => {
    it("is settled and keeps the error, with no result", () => {
      const fields = runFields(run({ status: "failed", error: { message: "boom" } }))
      expect(fields).toMatchObject({ settled: 1, result: null, error: JSON.stringify({ message: "boom" }) })
    })
  })
})

describe("newWalkRow and toWalkthrough", () => {
  const input = { source: "https://github.com/acme/todo", kind: "pr", maxSeconds: 90 } as const
  const finished = run({ status: "completed", artifactOutputs: [output("walkthrough", "available", "artifact-1"), output("captions", "available")] })
  const row = newWalkRow("walk-1", input, finished, new Date("2026-09-21T10:00:00Z"))

  describe("given a fresh run", () => {
    it("stamps the row with the ids and the injected time", () => {
      expect(row).toMatchObject({ id: "walk-1", run_id: "run-1", session_id: "session-1", subdir: null, created_at: "2026-09-21T10:00:00.000Z" })
    })
  })

  describe("given the stored row", () => {
    it("maps back to the API shape", () => {
      expect(toWalkthrough(row)).toMatchObject({ id: "walk-1", kind: "pr", maxSeconds: 90, status: "completed", result: null })
    })

    it("offers only artifacts that are available and have an id", () => {
      expect(toWalkthrough(row).artifacts).toEqual({ walkthrough: true, captions: false, clean: false })
      expect(availableArtifactId(row, "walkthrough")).toBe("artifact-1")
      expect(availableArtifactId(row, "captions")).toBeNull()
    })
  })

  describe("given a row whose JSON columns are damaged", () => {
    it("reads them as absent instead of throwing", () => {
      expect(toWalkthrough({ ...row, result: "{", artifacts: "nope" })).toMatchObject({ result: null, artifacts: { walkthrough: false } })
    })
  })
})

describe("isRepeatedControl", () => {
  const frame = { type: "run.status", data: { status: "running" } }

  describe("given no control frame stored yet", () => {
    it("is not a repeat", () => {
      expect(isRepeatedControl(undefined, frame)).toBe(false)
    })
  })

  describe("given the same frame again after a reconnect", () => {
    it("is a repeat", () => {
      expect(isRepeatedControl(JSON.stringify(frame), frame)).toBe(true)
    })
  })

  describe("given a frame with new data", () => {
    it("is not a repeat", () => {
      expect(isRepeatedControl(JSON.stringify(frame), { type: "run.status", data: { status: "finalizing" } })).toBe(false)
    })
  })
})

describe("nextPumpStep", () => {
  describe("given the walkthrough row is gone", () => {
    it("stops", () => {
      expect(nextPumpStep(undefined, 0)).toEqual({ then: "stop", why: "walk-gone" })
    })
  })

  describe("given the run reached a terminal status", () => {
    it("stops, whatever the failure count", () => {
      expect(nextPumpStep("timed_out", 3)).toEqual({ then: "stop", why: "run-finished" })
    })
  })

  describe("given a live run and a stream that ended cleanly", () => {
    it("reconnects after a second", () => {
      expect(nextPumpStep("running", 0)).toEqual({ then: "reconnect", afterMs: 1000 })
    })
  })

  describe("given a live run and failures in a row", () => {
    it("backs off exponentially, capped at 15 seconds", () => {
      expect(nextPumpStep("running", 2)).toEqual({ then: "reconnect", afterMs: 4000 })
      expect(nextPumpStep("running", 7)).toEqual({ then: "reconnect", afterMs: 15_000 })
    })

    it("gives up at the limit", () => {
      expect(nextPumpStep("running", MAX_FAILURES)).toEqual({ then: "stop", why: "gave-up" })
    })
  })
})
