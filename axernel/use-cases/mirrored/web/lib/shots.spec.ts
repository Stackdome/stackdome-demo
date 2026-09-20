import { describe, expect, it } from "vitest"

import { shotAfter, shotsOf } from "./shots"
import type { Mirror } from "./types"

const artifacts = (...names: string[]): Mirror["artifacts"] =>
  ({ bundle: true, registry: true, tokens: true, report: true, original: false, rebuild: false, diff: false, page: false, ...Object.fromEntries(names.map((name) => [name, true])) }) as Mirror["artifacts"]

describe("shotsOf", () => {
  describe("given a section run with every picture", () => {
    it("lists them in viewing order, with their labels", () => {
      expect(shotsOf(artifacts("diff", "rebuild", "page", "original"))).toEqual([
        { name: "page", label: "Full page" },
        { name: "original", label: "Original" },
        { name: "rebuild", label: "Rebuild" },
        { name: "diff", label: "Diff" },
      ])
    })
  })

  describe("given a brand run", () => {
    it("has only the full page", () => {
      expect(shotsOf(artifacts("page")).map((shot) => shot.name)).toEqual(["page"])
    })
  })

  describe("given a run with no pictures", () => {
    it("is empty, and never lists the files that are not pictures", () => {
      expect(shotsOf(artifacts())).toEqual([])
    })
  })
})

describe("shotAfter", () => {
  const shots = shotsOf(artifacts("original", "rebuild", "diff"))

  it("moves one on, or one back", () => {
    expect(shotAfter(shots, "original", 1)).toBe("rebuild")
    expect(shotAfter(shots, "diff", -1)).toBe("rebuild")
  })

  it("wraps at both ends", () => {
    expect(shotAfter(shots, "diff", 1)).toBe("original")
    expect(shotAfter(shots, "original", -1)).toBe("diff")
  })

  it("stays put when there is only one", () => {
    expect(shotAfter(shotsOf(artifacts("page")), "page", 1)).toBe("page")
  })

  it("is null for a picture the run does not have", () => {
    expect(shotAfter(shots, "page", 1)).toBeNull()
    expect(shotAfter([], "page", 1)).toBeNull()
  })
})
