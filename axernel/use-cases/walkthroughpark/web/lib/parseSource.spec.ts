import { describe, expect, it } from "vitest"

import { parseSource, splitTreePath } from "./parseSource"

describe("parseSource", () => {
  describe("given a repo link", () => {
    it("keeps the repo URL as the source", () => {
      expect(parseSource("https://github.com/acme/todo")).toEqual({ source: "https://github.com/acme/todo", kind: "repo" })
    })

    it.each([
      ["a trailing slash", "https://github.com/acme/todo/"],
      ["a .git suffix", "https://github.com/acme/todo.git"],
      ["no scheme", "github.com/acme/todo"],
      ["surrounding spaces and a query", "  https://www.github.com/acme/todo?tab=readme  "],
    ])("tidies %s away", (_label, link) => {
      expect(parseSource(link)).toEqual({ source: "https://github.com/acme/todo", kind: "repo" })
    })
  })

  describe("given a pull request link", () => {
    it("keeps the pull request URL and calls it a pr", () => {
      expect(parseSource("https://github.com/acme/todo/pull/12")).toEqual({
        source: "https://github.com/acme/todo/pull/12",
        kind: "pr",
      })
    })

    it("drops the tab after the number", () => {
      expect(parseSource("https://github.com/acme/todo/pull/12/files")).toEqual({
        source: "https://github.com/acme/todo/pull/12",
        kind: "pr",
      })
    })

    it("rejects a pull request link with no number", () => {
      expect(parseSource("https://github.com/acme/todo/pull/")).toHaveProperty("error")
    })
  })

  describe("given a link into a folder of a branch", () => {
    it("splits it into the repo and the subdir", () => {
      expect(parseSource("https://github.com/acme/mono/tree/main/apps/web")).toEqual({
        source: "https://github.com/acme/mono",
        subdir: "apps/web",
        treePath: "main/apps/web",
        kind: "repo",
      })
    })

    it("leaves subdir out when the link stops at the branch", () => {
      expect(parseSource("https://github.com/acme/mono/tree/main")).toEqual({
        source: "https://github.com/acme/mono",
        treePath: "main",
        kind: "repo",
      })
    })

    it("never hands the agent a subdir that climbs out of the repo", () => {
      const parsed = parseSource("https://github.com/acme/mono/tree/main/apps/%2E%2E/%2E%2E/%2E%2E/etc")
      expect(JSON.stringify(parsed)).not.toContain("..")
    })
  })

  describe("given something that is not a GitHub repo", () => {
    it.each([
      ["nothing", ""],
      ["another host", "https://gitlab.com/acme/todo"],
      ["a lookalike host", "https://github.com.evil.dev/acme/todo"],
      ["an owner with no repo", "https://github.com/acme"],
      ["plain words", "show me the todo app"],
    ])("rejects %s with a reason", (_label, link) => {
      const parsed = parseSource(link)
      expect(parsed).toHaveProperty("error")
      expect(parsed).not.toHaveProperty("source")
    })
  })
})

describe("splitTreePath", () => {
  describe("given a branch whose name contains a slash", () => {
    it("takes the longest matching branch and leaves the rest as the folder", () => {
      expect(splitTreePath("axernel/walkthroughpark/axernel/scratch/todo-app", ["main", "axernel", "axernel/walkthroughpark"])).toEqual({
        ref: "axernel/walkthroughpark",
        subdir: "axernel/scratch/todo-app",
      })
    })
  })

  describe("given a link that stops at the branch", () => {
    it("returns the branch with no folder", () => {
      expect(splitTreePath("feature/x", ["main", "feature/x"])).toEqual({ ref: "feature/x" })
    })
  })

  describe("given no branch matches, as with a tag or a commit", () => {
    it("falls back to the first segment as the ref", () => {
      expect(splitTreePath("v1.2.0/apps/web", ["main"])).toEqual({ ref: "v1.2.0", subdir: "apps/web" })
    })
  })
})
