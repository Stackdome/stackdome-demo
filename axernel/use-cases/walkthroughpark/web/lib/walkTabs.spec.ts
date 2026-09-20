import { describe, expect, it } from "vitest"

import { defaultTab, nextTab, tabFromHash } from "./walkTabs"

describe("defaultTab", () => {
  describe("given a completed walk", () => {
    it("opens on the overview", () => {
      expect(defaultTab("completed")).toBe("overview")
    })
  })

  describe("given a walk that is still going or stopped short", () => {
    it.each(["queued", "preparing", "running", "finalizing", "failed", "timed_out"] as const)("opens on the notes (%s)", (status) => {
      expect(defaultTab(status)).toBe("notes")
    })
  })
})

describe("tabFromHash", () => {
  describe("given a hash that names a tab", () => {
    it("returns that tab", () => {
      expect(tabFromHash("#scenes")).toBe("scenes")
      expect(tabFromHash("notes")).toBe("notes")
    })
  })

  describe("given an empty or unknown hash", () => {
    it.each(["", "#", "#videos"])("returns null (%j)", (hash) => {
      expect(tabFromHash(hash)).toBeNull()
    })
  })
})

describe("nextTab", () => {
  describe("given an arrow key", () => {
    it("moves one tab over and wraps at the ends", () => {
      expect(nextTab("overview", "ArrowRight")).toBe("scenes")
      expect(nextTab("notes", "ArrowRight")).toBe("overview")
      expect(nextTab("overview", "ArrowLeft")).toBe("notes")
    })
  })

  describe("given Home or End", () => {
    it("jumps to the first or last tab", () => {
      expect(nextTab("scenes", "Home")).toBe("overview")
      expect(nextTab("scenes", "End")).toBe("notes")
    })
  })

  describe("given any other key", () => {
    it("moves nowhere", () => {
      expect(nextTab("scenes", "Enter")).toBeNull()
    })
  })
})
