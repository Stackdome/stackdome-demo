import { describe, expect, it } from "vitest"

import { zipEntries, zipOf } from "./zip"

const text = (value: string) => Buffer.from(value, "utf8")
const FILES = [
  { name: "r/index.json", data: text('{"items":[]}') },
  { name: "r/button.json", data: text(JSON.stringify({ name: "button", body: "x".repeat(500) })) },
]

describe("zipEntries", () => {
  describe("given a zip of stored files", () => {
    it("returns each file's name and bytes, in order", () => {
      const entries = zipEntries(zipOf(FILES))
      expect(entries.map((entry) => entry.name)).toEqual(["r/index.json", "r/button.json"])
      expect(entries[0]?.data.toString("utf8")).toBe('{"items":[]}')
    })
  })

  describe("given a zip of deflated files", () => {
    it("inflates them", () => {
      const entries = zipEntries(zipOf(FILES, { deflate: true }))
      expect(entries[1]?.data.equals(FILES[1]!.data)).toBe(true)
    })
  })

  describe("given directory entries", () => {
    it("leaves them out", () => {
      const entries = zipEntries(zipOf([{ name: "r/", data: Buffer.alloc(0) }, ...FILES]))
      expect(entries).toHaveLength(2)
    })
  })

  describe("given an empty archive", () => {
    it("has no entries", () => {
      expect(zipEntries(zipOf([]))).toEqual([])
    })
  })

  describe("given a zip that sits inside a larger buffer", () => {
    it("reads it by its own offset", () => {
      const padded = Buffer.concat([Buffer.alloc(7), zipOf(FILES)])
      // A view onto bytes 7.. of the larger buffer, as a download may hand one over.
      expect(zipEntries(new Uint8Array(padded.buffer, padded.byteOffset + 7, padded.length - 7))).toHaveLength(2)
    })
  })

  describe("given bytes that are no zip", () => {
    it("throws", () => {
      expect(() => zipEntries(text("not a zip at all, just some text that is long enough"))).toThrow(/Not a zip/)
    })
  })

  describe("given an entry that inflates past the limit", () => {
    it("throws instead of filling memory", () => {
      const bomb = zipOf([{ name: "r/big.json", data: Buffer.alloc(3 * 1024 * 1024) }], { deflate: true })
      expect(() => zipEntries(bomb)).toThrow()
    })
  })
})
