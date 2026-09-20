import type { Run } from "@axernel/sdk"
import { describe, expect, it } from "vitest"

import { availableArtifactId, isArtifactName, isRepeatedControl, MAX_FAILURES, newMirrorRow, nextPumpStep, runFields, runInputData, sessionTitle, toMirror } from "./mirrorCalc"

const run = (fields: Record<string, unknown>): Run => ({ id: "run-1", sessionId: "session-1", status: "running", ...fields }) as unknown as Run
const output = (name: string, status: string, artifactId: string | null = null) => ({ name, status, artifactId })

const section = { url: "https://stripe.com/pricing", mode: "section", target: "pricing table", framework: "react" } as const
const brand = { url: "https://www.stripe.com/", mode: "brand", framework: "html" } as const

describe("runInputData", () => {
  describe("given a section mirror", () => {
    it("sends exactly the keys of the agent's input contract", () => {
      expect(runInputData(section)).toEqual({ url: "https://stripe.com/pricing", mode: "section", target: "pricing table", framework: "react" })
    })
  })

  describe("given a brand mirror", () => {
    it("sends no target, even if one slipped through", () => {
      expect(runInputData({ ...brand, target: "hero" })).toEqual({ url: "https://www.stripe.com/", mode: "brand", framework: "html" })
    })
  })
})

describe("sessionTitle", () => {
  describe("given a section mirror", () => {
    it("names the site and the part", () => {
      expect(sessionTitle(section)).toBe("stripe.com: pricing table")
    })
  })

  describe("given a brand mirror", () => {
    it("names the site without www, and says it is the whole brand", () => {
      expect(sessionTitle(brand)).toBe("stripe.com: whole brand")
    })
  })

  describe("given a target longer than 60 characters", () => {
    it("cuts it at 60 and marks the cut", () => {
      expect(sessionTitle({ ...section, target: "x".repeat(61) })).toBe(`stripe.com: ${"x".repeat(60)}…`)
    })

    it("leaves exactly 60 characters alone", () => {
      expect(sessionTitle({ ...section, target: "x".repeat(60) })).toBe(`stripe.com: ${"x".repeat(60)}`)
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
      expect(runFields(run({ status: "completed", artifactOutputs: [output("bundle", "pending")] })).settled).toBe(0)
    })
  })

  describe("given a completed run with every artifact decided", () => {
    const fields = runFields(
      run({
        status: "completed",
        response: { kind: "result", value: { title: "Stripe pricing" } },
        usage: { totalTokens: 10, costUsd: 0.5, inputTokens: 7 },
        artifactOutputs: [output("bundle", "available", "artifact-1"), output("page", "missing")],
      }),
    )

    it("is settled", () => {
      expect(fields.settled).toBe(1)
    })

    it("keeps the result, and only the usage the page shows", () => {
      expect(JSON.parse(fields.result ?? "")).toEqual({ title: "Stripe pricing" })
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

describe("newMirrorRow and toMirror", () => {
  const finished = run({ status: "completed", artifactOutputs: [output("original", "available", "artifact-1"), output("rebuild", "available")] })
  const row = newMirrorRow("mirror-1", section, finished, new Date("2026-09-21T10:00:00Z"))

  describe("given a fresh run", () => {
    it("stamps the row with the ids and the injected time", () => {
      expect(row).toMatchObject({ id: "mirror-1", run_id: "run-1", session_id: "session-1", target: "pricing table", created_at: "2026-09-21T10:00:00.000Z" })
    })

    it("stores no target for a brand mirror", () => {
      expect(newMirrorRow("mirror-2", brand, finished, new Date(0)).target).toBeNull()
    })
  })

  describe("given the stored row", () => {
    it("maps back to the API shape", () => {
      expect(toMirror(row)).toMatchObject({ id: "mirror-1", mode: "section", framework: "react", status: "completed", result: null })
    })

    it("offers only artifacts that are available and have an id", () => {
      expect(toMirror(row).artifacts).toEqual({ bundle: false, registry: false, tokens: false, report: false, preview: false, skin: false, original: true, rebuild: false, diff: false, page: false })
      expect(availableArtifactId(row, "original")).toBe("artifact-1")
      expect(availableArtifactId(row, "rebuild")).toBeNull()
    })
  })

  describe("given a row whose columns are damaged", () => {
    it("reads them as absent or default instead of throwing", () => {
      expect(toMirror({ ...row, result: "{", artifacts: "nope", mode: "?", framework: "svelte" })).toMatchObject({
        result: null,
        mode: "section",
        framework: "html",
        artifacts: { original: false },
      })
    })
  })
})

describe("isArtifactName", () => {
  it("knows the agent's artifact names and nothing else", () => {
    expect(isArtifactName("diff")).toBe(true)
    expect(isArtifactName("../db")).toBe(false)
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
  describe("given the mirror row is gone", () => {
    it("stops", () => {
      expect(nextPumpStep(undefined, 0)).toEqual({ then: "stop", why: "mirror-gone" })
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
