import { describe, expect, it } from "vitest"

import { relativeTime } from "./relativeTime"

const NOW = Date.parse("2026-01-10T12:00:00Z")

describe("relativeTime", () => {
  describe("given a moment under a minute ago, or slightly ahead", () => {
    it.each(["2026-01-10T11:59:30Z", "2026-01-10T12:00:05Z"])("says just now (%s)", (iso) => {
      expect(relativeTime(iso, NOW)).toBe("just now")
    })
  })

  describe("given minutes, hours or days ago", () => {
    it("uses the largest unit that fits, rounded down", () => {
      expect(relativeTime("2026-01-10T11:48:10Z", NOW)).toBe("11 minutes ago")
      expect(relativeTime("2026-01-10T08:30:00Z", NOW)).toBe("3 hours ago")
      expect(relativeTime("2026-01-09T11:00:00Z", NOW)).toBe("yesterday")
      expect(relativeTime("2026-01-05T12:00:00Z", NOW)).toBe("5 days ago")
    })
  })
})
