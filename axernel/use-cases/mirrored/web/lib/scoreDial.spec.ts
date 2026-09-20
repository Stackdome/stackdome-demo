import { describe, expect, it } from "vitest"

import { DIAL_MAX_GAP, DIAL_RADIUS, halfCirclePath, scoreDial, scoreWord } from "./scoreDial"

describe("scoreDial", () => {
  describe("given a perfect score", () => {
    it("closes the two halves into one circle", () => {
      expect(scoreDial(100)).toEqual({ score: 100, gap: 0, width: DIAL_RADIUS * 2 })
    })
  })

  describe("given a score of zero", () => {
    it("holds the halves as far apart as they go", () => {
      expect(scoreDial(0)).toEqual({ score: 0, gap: DIAL_MAX_GAP, width: DIAL_RADIUS * 2 + DIAL_MAX_GAP })
    })
  })

  describe("given a score in between", () => {
    it("closes the gap in proportion", () => {
      expect(scoreDial(75).gap).toBe(DIAL_MAX_GAP / 4)
    })

    it("shows a whole number but keeps the gap honest", () => {
      expect(scoreDial(99.6)).toMatchObject({ score: 100, gap: 0.2 })
    })
  })

  describe("given a score outside 0 to 100, or none", () => {
    it.each([
      [140, 100],
      [-5, 0],
      [Number.NaN, 0],
      [undefined, 0],
      ["87", 0],
    ])("draws %j as %i", (input, score) => {
      expect(scoreDial(input).score).toBe(score)
    })
  })
})

describe("halfCirclePath", () => {
  it("bulges left or right of its flat edge", () => {
    expect(halfCirclePath("left", 50)).toBe("M 50 0 A 50 50 0 0 0 50 100 Z")
    expect(halfCirclePath("right", 65)).toBe("M 65 0 A 50 50 0 0 1 65 100 Z")
  })
})

describe("scoreWord", () => {
  it.each([
    [95, "A true mirror"],
    [94, "A close mirror"],
    [80, "A close mirror"],
    [50, "A rough mirror"],
    [49, "A distant mirror"],
  ])("calls %i %j", (score, word) => {
    expect(scoreWord(score)).toBe(word)
  })
})
