import { describe, expect, it } from "vitest"

import { parseMirrorRequest, parsePageUrl } from "./mirrorRequest"

describe("parsePageUrl", () => {
  describe("given an http or https address", () => {
    it("trims it and returns it normalised", () => {
      expect(parsePageUrl("  https://stripe.com/pricing ")).toEqual({ url: "https://stripe.com/pricing" })
      expect(parsePageUrl("http://example.com")).toEqual({ url: "http://example.com/" })
    })

    it("accepts localhost, which has no dot", () => {
      expect(parsePageUrl("http://localhost:3000/")).toEqual({ url: "http://localhost:3000/" })
    })
  })

  describe("given nothing", () => {
    it("asks for an address", () => {
      expect(parsePageUrl("   ")).toEqual({ error: "Paste the address of a web page." })
    })
  })

  describe("given text that is no URL", () => {
    it.each(["stripe.com", "not a link"])("says how to fix %j", (text) => {
      expect(parsePageUrl(text)).toEqual({ error: "That is not a full web address. Start it with https://" })
    })
  })

  describe("given another scheme", () => {
    it.each(["ftp://example.com", "javascript:alert(1)", "file:///etc/passwd"])("refuses %s", (text) => {
      expect(parsePageUrl(text)).toEqual({ error: "Only http and https pages can be mirrored." })
    })
  })

  describe("given a host that is no site name", () => {
    it("refuses it", () => {
      expect(parsePageUrl("https://pricing")).toEqual({ error: "That address has no site name in it." })
    })
  })
})

describe("parseMirrorRequest", () => {
  describe("given a body with no link", () => {
    it.each([null, {}, { url: 12 }])("asks for one: %j", (body) => {
      expect(parseMirrorRequest(body)).toEqual({ error: "Paste the address of a web page." })
    })
  })

  describe("given a link and a target", () => {
    it("defaults to one section, as React, and trims the target", () => {
      expect(parseMirrorRequest({ url: "https://stripe.com", target: "  pricing table " })).toEqual({
        url: "https://stripe.com/",
        mode: "section",
        target: "pricing table",
        framework: "react",
      })
    })
  })

  describe("given a section mirror with no target", () => {
    it("asks which part", () => {
      expect(parseMirrorRequest({ url: "https://stripe.com", mode: "section", target: " " })).toEqual({ error: "Say which part of the page to mirror." })
    })
  })

  describe("given a brand mirror", () => {
    it("needs no target and drops one that was sent", () => {
      expect(parseMirrorRequest({ url: "https://stripe.com", mode: "brand", target: "hero" })).toEqual({
        url: "https://stripe.com/",
        mode: "brand",
        framework: "react",
      })
    })
  })

  describe("given a mode that is not offered", () => {
    it("says which ones are", () => {
      expect(parseMirrorRequest({ url: "https://stripe.com", mode: "page" })).toEqual({ error: "Pick one section or the whole brand." })
    })
  })

  describe("given a framework in the body", () => {
    it("ignores it: the output is always React", () => {
      expect(parseMirrorRequest({ url: "https://stripe.com", target: "hero", framework: "vue" })).toMatchObject({ framework: "react" })
    })
  })

  describe("given a target over the limit", () => {
    it("refuses it", () => {
      expect(parseMirrorRequest({ url: "https://stripe.com", target: "x".repeat(201) })).toEqual({ error: "Keep the section name under 200 characters." })
    })
  })
})
