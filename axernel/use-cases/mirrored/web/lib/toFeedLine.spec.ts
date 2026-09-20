import { describe, expect, it } from "vitest"

import { toFeedLine } from "./toFeedLine"
import type { RunEvent } from "./types"

const partEvent = (type: RunEvent["type"], part: Record<string, unknown>): RunEvent => ({
  type,
  data: { type: "message.part.updated", properties: { part } },
})

describe("toFeedLine", () => {
  describe("given streamed assistant text", () => {
    it("gives the whole text of a part snapshot, keyed by message and part", () => {
      const line = toFeedLine(partEvent("message.delta", { id: "prt_1", messageID: "msg_1", type: "text", text: "The app is a todo list." }))
      expect(line).toEqual({ kind: "note", key: "text:msg_1:prt_1", text: "The app is a todo list." })
    })

    it("gives two snapshots of one part the same key, so the note grows in place", () => {
      const first = toFeedLine(partEvent("message.delta", { id: "prt_1", messageID: "msg_1", type: "text", text: "The app" }))
      const second = toFeedLine(partEvent("message.delta", { id: "prt_1", messageID: "msg_1", type: "text", text: "The app is a todo list." }))
      expect(second?.key).toBe(first?.key)
    })

    it("marks an increment as text to append to its part", () => {
      const event: RunEvent = {
        type: "message.delta",
        data: { type: "message.part.delta", properties: { messageID: "msg_1", partID: "prt_1", field: "text", delta: " list." } },
      }
      expect(toFeedLine(event)).toEqual({ kind: "note", key: "text:msg_1:prt_1", text: " list.", append: true })
    })

    it("calls reasoning a thought", () => {
      expect(toFeedLine(partEvent("message.delta", { id: "prt_2", messageID: "msg_1", type: "reasoning", text: "Check the README first." }))?.kind).toBe(
        "thought",
      )
    })

    it("says nothing for an empty part", () => {
      expect(toFeedLine(partEvent("message.delta", { id: "prt_3", messageID: "msg_1", type: "text", text: "  " }))).toBeNull()
    })
  })

  describe("given tool activity", () => {
    const tool = (name: string, status: string, input: Record<string, unknown>) =>
      partEvent("tool.activity", { type: "tool", tool: name, callID: "call_1", messageID: "msg_1", state: { status, input } })

    it("says what a finished shell command ran", () => {
      expect(toFeedLine(tool("bash", "completed", { command: "npm install", description: "Install deps" }))).toEqual({
        kind: "tool",
        key: "tool:msg_1:call_1",
        text: "Ran npm install",
      })
    })

    it("shows that a call is still going", () => {
      expect(toFeedLine(tool("read", "running", { filePath: "README.md" }))?.text).toBe("Read README.md …")
    })

    it("shows that a call failed", () => {
      expect(toFeedLine(tool("bash", "error", { command: "mir-reflect component" }))?.text).toBe("Ran mir-reflect component (failed)")
    })

    it("names a tool it has no verb for in plain words, with its first text argument", () => {
      expect(toFeedLine(tool("page_get_outline", "completed", { site: "acme", depth: "2" }))?.text).toBe("page get outline acme")
    })

    it("keeps a long command to one short line", () => {
      const text = toFeedLine(tool("bash", "completed", { command: `echo ${"x".repeat(400)}\n&& ls` }))?.text ?? ""
      expect(text.length).toBeLessThanOrEqual(140)
      expect(text).not.toContain("\n")
    })
  })

  describe("given control events", () => {
    it("reports a run status in words", () => {
      expect(toFeedLine({ type: "run.status", data: { status: "timed_out" } })).toEqual({ kind: "status", text: "Run is timed out" })
    })

    it("reports a retry and stays quiet about busy and idle", () => {
      const harness = (status: unknown): RunEvent => ({ type: "harness.status", data: { properties: { status } } })
      expect(toFeedLine(harness({ type: "retry", message: "rate limited" }))?.text).toBe("Retrying: rate limited")
      expect(toFeedLine(harness({ type: "busy" }))).toBeNull()
    })

    it("reports a stream error as an error line", () => {
      expect(toFeedLine({ type: "stream.error", data: { message: "supervisor unreachable" } })).toEqual({ kind: "error", text: "supervisor unreachable" })
    })

    it("says nothing when the stream ends", () => {
      expect(toFeedLine({ type: "stream.end", data: {} })).toBeNull()
    })
  })

  describe("given a payload it does not understand", () => {
    it.each([
      ["a tool event with no part", { type: "tool.activity", data: {} }],
      ["a tool event with null data", { type: "tool.activity", data: null }],
      ["an event type from the future", { type: "plan.updated", data: { a: 1 } }],
      ["no event at all", null],
    ])("falls back to a generic line for %s and never throws", (_label, event) => {
      expect(toFeedLine(event as unknown as RunEvent)?.kind).toBe("raw")
    })
  })
})
