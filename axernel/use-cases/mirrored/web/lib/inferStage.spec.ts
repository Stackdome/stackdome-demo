import { describe, expect, it } from "vitest"

import { inferStage } from "./inferStage"
import type { RunEvent } from "./types"

let calls = 0
function toolEvent(tool: string, input: Record<string, unknown>, state: { status?: string; output?: string } = {}): RunEvent {
  calls += 1
  return {
    type: "tool.activity",
    data: {
      type: "message.part.updated",
      properties: {
        part: { type: "tool", tool, callID: `call_${calls}`, messageID: "msg_1", state: { status: "completed", input, ...state } },
      },
    },
  }
}
const bash = (command: string) => toolEvent("bash", { command })
const write = (filePath: string) => toolEvent("write", { filePath })
const runStatus = (status: string): RunEvent => ({ type: "run.status", data: { status } })

const LOOK = bash("mir-measure https://example.com /tmp/mirror/measure")
const MEASURE = bash("mir-measure https://example.com /tmp/mirror/measure --selector 'section.pricing'")

describe("inferStage", () => {
  describe("given a run that has only just begun", () => {
    it("starts at look with no events at all", () => {
      expect(inferStage([])).toBe("look")
    })

    it.each([
      ["reading the toolkit manual", toolEvent("read", { filePath: "/opt/mirrored/MIRRORED.md" })],
      ["the first mir-measure, which lists sections", LOOK],
    ])("stays at look after %s", (_label, event) => {
      expect(inferStage([event])).toBe("look")
    })
  })

  describe("when the agent measures the chosen section", () => {
    it("moves to measure on mir-measure with a selector", () => {
      expect(inferStage([LOOK, MEASURE])).toBe("measure")
    })

    it.each(["jq '.children[0]' /tmp/mirror/measure/dom.json", "jq '.colors[:10]' counts.json"])("moves to measure on %s", (command) => {
      expect(inferStage([bash(command)])).toBe("measure")
    })
  })

  describe("when the agent writes tokens.json", () => {
    it("moves to name", () => {
      expect(inferStage([LOOK, MEASURE, write("/tmp/mirror/tokens.json")])).toBe("name")
    })
  })

  describe("when the agent writes the component", () => {
    it.each(["/tmp/mirror/component/index.html", "/tmp/mirror/component/component.css"])("moves to rebuild on a write to %s", (filePath) => {
      expect(inferStage([write(filePath)])).toBe("rebuild")
    })

    it("counts an edit the same as a write", () => {
      expect(inferStage([toolEvent("edit", { filePath: "/tmp/mirror/component/component.css" })])).toBe("rebuild")
    })
  })

  describe("when mir-reflect runs", () => {
    it("moves to reflect", () => {
      expect(inferStage([write("/tmp/mirror/component/index.html"), bash("mir-reflect /tmp/mirror/component /tmp/mirror/measure")])).toBe("reflect")
    })

    it("stays at reflect while the component is fixed between passes", () => {
      const events = [bash("mir-reflect /tmp/mirror/component /tmp/mirror/measure"), toolEvent("edit", { filePath: "/tmp/mirror/component/component.css" })]
      expect(inferStage(events)).toBe("reflect")
    })
  })

  describe("given events that say nothing clear", () => {
    it.each([
      ["mir-pack, which runs both mid-way and at the end", bash("mir-pack /tmp/mirror /tmp/mirror/out-check")],
      ["a write outside the mirror layout", write("/tmp/mirror/README.md")],
      ["streamed text", { type: "message.delta", data: { text: "Looking at the page" } } as RunEvent],
    ])("leaves the stage alone after %s", (_label, event) => {
      expect(inferStage([MEASURE, event])).toBe("measure")
    })

    it("survives an event with no data", () => {
      expect(inferStage([{ type: "tool.activity" }, { type: "tool.activity", data: null }])).toBe("look")
    })
  })

  describe("when the run ends", () => {
    it("is done once it completed", () => {
      expect(inferStage([LOOK, runStatus("completed")])).toBe("done")
    })

    it.each(["failed", "timed_out"])("is failed once it %s", (status) => {
      expect(inferStage([LOOK, runStatus(status)])).toBe("failed")
    })

    it("ignores a status that is not terminal", () => {
      expect(inferStage([runStatus("running"), MEASURE])).toBe("measure")
    })
  })
})
