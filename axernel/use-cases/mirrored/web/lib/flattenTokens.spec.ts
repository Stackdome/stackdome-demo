import { describe, expect, it } from "vitest"

import { cssVariable, flattenTokens, fontStackCss, tokenTotal } from "./flattenTokens"

const px = (value: number) => ({ $value: { value, unit: "px" } })

const TOKENS = {
  color: { $type: "color", primary: { $value: "#635bff" }, ink: { $value: "#0a2540" }, brand: { accent: { $value: "#00d4ff" } } },
  font: {
    family: { $type: "fontFamily", sans: { $value: ["Inter", "system-ui", "sans-serif"] } },
    size: { $type: "dimension", body: px(16), display: px(48), small: { $value: { value: 0.75, unit: "rem" } } },
    weight: { $type: "fontWeight", regular: { $value: 400 }, bold: { $value: 700 } },
  },
  radius: { $type: "dimension", pill: px(999), card: px(8) },
  spacing: { $type: "dimension", lg: px(32), sm: px(8) },
  shadow: { $type: "shadow", card: { $value: "0 2px 4px rgba(0,0,0,0.1)" } },
}

describe("flattenTokens", () => {
  describe("given the tokens.json the agent writes", () => {
    const sheet = flattenTokens(TOKENS)

    it("lists colours by role, with nested groups as dotted names and $type left out", () => {
      expect(sheet.colors).toEqual([
        { name: "primary", hex: "#635bff" },
        { name: "ink", hex: "#0a2540" },
        { name: "brand.accent", hex: "#00d4ff" },
      ])
    })

    it("keeps a font family as its stack", () => {
      expect(sheet.families).toEqual([{ name: "sans", stack: ["Inter", "system-ui", "sans-serif"] }])
    })

    it("orders the type scale largest first, counting a rem as 16px", () => {
      expect(sheet.sizes).toEqual([
        { name: "display", css: "48px", px: 48 },
        { name: "body", css: "16px", px: 16 },
        { name: "small", css: "0.75rem", px: 12 },
      ])
    })

    it("orders radii and spacing smallest first", () => {
      expect(sheet.radii.map((radius) => radius.name)).toEqual(["card", "pill"])
      expect(sheet.spacing.map((step) => step.css)).toEqual(["8px", "32px"])
    })

    it("reads weights as numbers and shadows as CSS", () => {
      expect(sheet.weights).toEqual([{ name: "regular", weight: 400 }, { name: "bold", weight: 700 }])
      expect(sheet.shadows).toEqual([{ name: "card", css: "0 2px 4px rgba(0,0,0,0.1)" }])
    })

    it("counts every token once", () => {
      expect(tokenTotal(sheet)).toBe(14)
    })
  })

  describe("given looser values than the format asks for", () => {
    it("accepts a dimension written as a string or a bare number", () => {
      expect(flattenTokens({ spacing: { a: { $value: "12px" }, b: { $value: 4 } } }).spacing).toEqual([
        { name: "b", css: "4px", px: 4 },
        { name: "a", css: "12px", px: 12 },
      ])
    })

    it("keeps a unit with no px meaning, unsized", () => {
      expect(flattenTokens({ radius: { round: { $value: { value: 50, unit: "%" } } } }).radii).toEqual([{ name: "round", css: "50%", px: null }])
    })

    it("accepts a single font family as a string", () => {
      expect(flattenTokens({ font: { family: { mono: { $value: "Menlo" } } } }).families).toEqual([{ name: "mono", stack: ["Menlo"] }])
    })

    it("puts a W3C shadow object, or layers of them, back together as CSS", () => {
      const layer = { color: "#00000022", offsetX: px(0).$value, offsetY: px(4).$value, blur: px(12).$value, spread: px(0).$value }
      const sheet = flattenTokens({ shadow: { one: { $value: layer }, two: { $value: [layer, { ...layer, inset: true }] } } })
      expect(sheet.shadows).toEqual([
        { name: "one", css: "0px 4px 12px 0px #00000022" },
        { name: "two", css: "0px 4px 12px 0px #00000022, inset 0px 4px 12px 0px #00000022" },
      ])
    })
  })

  describe("given values that fit no shape", () => {
    it("leaves them out instead of throwing", () => {
      const sheet = flattenTokens({ color: { bad: { $value: 12 }, empty: { $value: " " } }, spacing: { bad: { $value: "wide" } }, font: { weight: { bad: { $value: "heavy" } } }, shadow: { bad: { $value: 3 } } })
      expect(tokenTotal(sheet)).toBe(0)
    })

    it.each([null, undefined, "tokens", [], 12])("reads %j as no tokens at all", (tokens) => {
      expect(tokenTotal(flattenTokens(tokens))).toBe(0)
    })
  })
})

describe("flattenTokens, brand shape", () => {
  const hex = (value: string) => ({ $type: "color", $value: { colorSpace: "srgb", components: [0, 0, 0], hex: value } })
  const BRAND = {
    $extensions: { "com.dembrandt": { url: "https://stripe.com" } },
    color: {
      palette: { "blue-500": hex("#635bff"), "slate-900": hex("#0a2540") },
      semantic: { primary: hex("#635bff"), background: hex("#ffffff") },
    },
    typography: {
      "font-family": { sans: { $type: "fontFamily", $value: ["Sohne", "sans-serif"] }, mono: { $value: "Menlo" } },
      style: {
        body: { $type: "typography", $value: { fontFamily: ["Sohne", "sans-serif"], fontSize: { value: 16, unit: "px" }, fontWeight: 400, lineHeight: 1.5 } },
        h1: { $type: "typography", $value: { fontFamily: "Sohne", fontSize: "3rem", fontWeight: "700", lineHeight: { value: 56, unit: "px" } } },
        broken: { $value: { lineHeight: 2 } },
      },
    },
    spacing: { "2": { $value: { value: 8, unit: "px" } } },
    radius: { md: { $value: { value: 6, unit: "px" } } },
  }
  const sheet = flattenTokens(BRAND)

  it("reads a colour's hex, and lists semantic roles before the palette", () => {
    expect(sheet.colors).toEqual([
      { name: "semantic.primary", hex: "#635bff" },
      { name: "semantic.background", hex: "#ffffff" },
      { name: "palette.blue-500", hex: "#635bff" },
      { name: "palette.slate-900", hex: "#0a2540" },
    ])
  })

  it("finds the families under typography", () => {
    expect(sheet.families).toEqual([
      { name: "sans", stack: ["Sohne", "sans-serif"] },
      { name: "mono", stack: ["Menlo"] },
    ])
  })

  it("reads each text style as CSS, largest first, and drops one with nothing to show", () => {
    expect(sheet.styles).toEqual([
      { name: "h1", fontFamily: "Sohne", fontSize: "3rem", fontWeight: 700, lineHeight: "56px" },
      { name: "body", fontFamily: "Sohne, sans-serif", fontSize: "16px", fontWeight: 400, lineHeight: "1.5" },
    ])
  })

  it("reads spacing and radius as in our own shape, and ignores $extensions", () => {
    expect(sheet.spacing).toEqual([{ name: "2", css: "8px", px: 8 }])
    expect(sheet.radii).toEqual([{ name: "md", css: "6px", px: 6 }])
    expect(tokenTotal(sheet)).toBe(10)
  })

  it("has no text styles in our own shape", () => {
    expect(flattenTokens(TOKENS).styles).toEqual([])
  })
})

describe("cssVariable", () => {
  it("joins the group and the dotted name the way mir-pack does", () => {
    expect(cssVariable("color", "primary")).toBe("--color-primary")
    expect(cssVariable("font-size", "body")).toBe("--font-size-body")
    expect(cssVariable("color", "brand.accent")).toBe("--color-brand-accent")
  })
})

describe("fontStackCss", () => {
  it("quotes names with spaces and leaves keywords bare", () => {
    expect(fontStackCss(["Helvetica Neue", "Inter", "sans-serif"])).toBe('"Helvetica Neue", Inter, sans-serif')
  })

  it("drops quotes that would break out of the value", () => {
    expect(fontStackCss(['Evil"; color: red'])).toBe('"Evil; color: red"')
  })
})
