import { describe, expect, it } from "vitest"

import { parseWalkRequest, placeInRepo } from "./walkRequest"

describe("parseWalkRequest", () => {
  describe("given a body with no link", () => {
    it.each([null, "text", {}, { url: 5 }])("asks for a link (%j)", (body) => {
      expect(parseWalkRequest(body)).toEqual({ error: "Paste a GitHub repo or pull request link." })
    })
  })

  describe("given just a repo link", () => {
    it("defaults to 60 seconds and no instruction", () => {
      expect(parseWalkRequest({ url: "github.com/acme/todo" })).toEqual({ source: "https://github.com/acme/todo", kind: "repo", maxSeconds: 60 })
    })
  })

  describe("given a tree link, an instruction and a duration", () => {
    it("keeps the unsplit tree path and trims the instruction", () => {
      expect(parseWalkRequest({ url: "https://github.com/acme/todo/tree/feat/x/web", instruction: "  show login ", maxSeconds: 30 })).toEqual({
        source: "https://github.com/acme/todo",
        kind: "repo",
        treePath: "feat/x/web",
        instruction: "show login",
        maxSeconds: 30,
      })
    })
  })

  describe("given a duration that is not offered", () => {
    it("says which ones are", () => {
      expect(parseWalkRequest({ url: "github.com/acme/todo", maxSeconds: 45 })).toEqual({ error: "Pick 30, 60 or 90 seconds." })
    })
  })

  describe("given an instruction over the limit", () => {
    it("refuses it", () => {
      expect(parseWalkRequest({ url: "github.com/acme/todo", instruction: "x".repeat(2001) })).toEqual({ error: "Keep the instruction under 2000 characters." })
    })
  })
})

describe("placeInRepo", () => {
  const request = { source: "https://github.com/acme/todo", kind: "repo", maxSeconds: 60 } as const

  describe("given a plain repo link", () => {
    it("adds nothing", () => {
      expect(placeInRepo(request, ["main"])).toEqual({})
    })
  })

  describe("given a tree path and the repo's branches", () => {
    it("splits at the longest matching branch", () => {
      expect(placeInRepo({ ...request, treePath: "feat/x/web" }, ["feat", "feat/x"])).toEqual({ ref: "feat/x", subdir: "web" })
    })
  })
})
