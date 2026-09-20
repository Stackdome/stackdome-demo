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
const bash = (command: string, state?: { status?: string; output?: string }) => toolEvent("bash", { command }, state)
const runStatus = (status: string): RunEvent => ({ type: "run.status", data: { status } })

describe("inferStage", () => {
  describe("given a run that has only just begun", () => {
    it("starts at reading with no events at all", () => {
      expect(inferStage([])).toBe("reading")
    })

    it.each([
      ["a GitHub MCP call", toolEvent("github_get_pull_request", { owner: "acme", repo: "todo", pullNumber: 12 })],
      ["a file read", toolEvent("read", { filePath: "/workspace/todo/README.md" })],
      ["a clone", bash("git clone https://github.com/acme/todo")],
    ])("stays at reading after %s", (_label, event) => {
      expect(inferStage([event])).toBe("reading")
    })
  })

  describe("when the agent writes the demo script", () => {
    it.each(["/opt/walkthrough/demos/walk.scenes.json", "/opt/walkthrough/demos/walk.demo.ts"])(
      "moves to planning on a write to %s",
      (filePath) => {
        expect(inferStage([toolEvent("write", { filePath, content: "{}" })])).toBe("planning")
      },
    )

    it("does not count a write to any other file", () => {
      expect(inferStage([toolEvent("write", { filePath: "/workspace/todo/.env", content: "" })])).toBe("reading")
    })
  })

  describe("when the agent gets the app running", () => {
    it.each(["npm install", "cd todo && pnpm install --frozen-lockfile", "pip install -r requirements.txt", "npm run dev &", "yarn start"])(
      "moves to booting on `%s`",
      (command) => {
        expect(inferStage([bash(command)])).toBe("booting")
      },
    )
  })

  describe("when wtp-render is called", () => {
    it("is recording while the command is still running", () => {
      expect(inferStage([bash("wtp-render walk", { status: "running" })])).toBe("recording")
    })

    it("is rendering once its output reaches the burn and verify steps", () => {
      expect(inferStage([bash("wtp-render walk", { status: "running", output: "argo pipeline ok\nburning subtitles with ffmpeg" })])).toBe(
        "rendering",
      )
    })

    it("is rendering once the command has returned", () => {
      expect(inferStage([bash("wtp-render walk", { status: "completed", output: "done" })])).toBe("rendering")
    })
  })

  describe("given events that arrive out of trail order", () => {
    it("never moves backwards", () => {
      const events = [bash("npm install"), toolEvent("read", { filePath: "src/App.tsx" }), toolEvent("write", { filePath: "demos/walk.scenes.json" })]
      expect(inferStage(events)).toBe("booting")
    })

    it("stays put on events it cannot read", () => {
      const noise = [{ type: "tool.activity", data: null }, { type: "message.delta", data: { properties: {} } }, null] as unknown as RunEvent[]
      expect(inferStage([toolEvent("write", { filePath: "demos/walk.demo.ts" }), ...noise, bash("ls -la")])).toBe("planning")
    })
  })

  describe("when the run reaches a terminal status", () => {
    it("is done once the run completed", () => {
      expect(inferStage([bash("wtp-render walk"), runStatus("completed")])).toBe("done")
    })

    it.each(["failed", "timed_out"])("is failed once the run %s", (status) => {
      expect(inferStage([bash("npm install"), runStatus(status)])).toBe("failed")
    })

    it("ignores a status that is not terminal", () => {
      expect(inferStage([runStatus("running"), bash("npm install")])).toBe("booting")
    })
  })
})
