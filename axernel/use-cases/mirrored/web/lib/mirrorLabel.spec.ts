import { describe, expect, it } from "vitest"

import { archiveScore, cardTone, hostOf, mirrorLabel } from "./mirrorLabel"
import type { MirrorResult } from "./types"

const result = (fields: Partial<MirrorResult>): MirrorResult => ({ title: "", summary: "", chosenSelector: "", matchScore: 0, passes: 0, tokenCount: 0, fonts: [], mismatches: [], caveats: [], ...fields })

describe("hostOf", () => {
  it("drops the scheme, the path and www", () => {
    expect(hostOf("https://www.stripe.com/pricing?x=1")).toBe("stripe.com")
  })

  it("gives text that is no URL back as it is", () => {
    expect(hostOf("not a url")).toBe("not a url")
  })
})

describe("mirrorLabel", () => {
  const section = { url: "https://www.stripe.com/pricing", mode: "section", target: "pricing table", result: null } as const

  describe("given a mirror the agent has titled", () => {
    it("uses the title", () => {
      expect(mirrorLabel({ ...section, result: result({ title: " Stripe pricing table " }) })).toBe("Stripe pricing table")
    })
  })

  describe("given a section mirror with no title yet", () => {
    it("names the site and the part", () => {
      expect(mirrorLabel(section)).toBe("stripe.com, pricing table")
    })

    it("is just the site when no part is stored", () => {
      expect(mirrorLabel({ ...section, target: null })).toBe("stripe.com")
    })
  })

  describe("given a brand mirror with a blank title", () => {
    it("names the site and says whole brand", () => {
      expect(mirrorLabel({ ...section, mode: "brand", target: null, result: result({ title: " " }) })).toBe("stripe.com, whole brand")
    })
  })
})

describe("archiveScore", () => {
  describe("given a finished section mirror", () => {
    it("is the rounded score", () => {
      expect(archiveScore({ mode: "section", status: "completed", result: result({ matchScore: 91.6 }) })).toBe(92)
    })
  })

  describe("given anything with no score worth showing", () => {
    it.each([
      ["a brand mirror, which has no rebuild", { mode: "brand", status: "completed", result: result({ matchScore: 0 }) }],
      ["a run still going", { mode: "section", status: "running", result: null }],
      ["a failed run", { mode: "section", status: "failed", result: result({ matchScore: 40 }) }],
      ["a finished run with no result", { mode: "section", status: "completed", result: null }],
    ] as const)("is null for %s", (_label, mirror) => {
      expect(archiveScore(mirror)).toBeNull()
    })
  })
})

describe("cardTone", () => {
  it("cycles through the three primaries and the two darks", () => {
    expect([0, 1, 2, 3, 4, 5].map(cardTone)).toEqual(["red", "blue", "yellow", "navy", "ink", "red"])
  })

  it("never runs off the palette", () => {
    expect(cardTone(-1)).toBe("blue")
    expect(cardTone(2.9)).toBe("yellow")
    expect(cardTone(Number.NaN)).toBe("red")
  })
})
