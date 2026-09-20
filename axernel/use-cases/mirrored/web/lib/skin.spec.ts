import { describe, expect, it } from "vitest"

import { BAUHAUS_LIGHT, contrast, safeSkinVars, skinVars, validFontFamily, validHex, validRadius, wornVars } from "./skin"

describe("validHex", () => {
  it("accepts six and three digits, and normalises them", () => {
    expect(validHex("#00D4FF")).toBe("#00d4ff")
    expect(validHex(" #0af ")).toBe("#00aaff")
  })

  it.each(["red", "#12345", "#1234567", "rgb(0,0,0)", "#fff; background: url(x)", "", null, 3, undefined])("refuses %j", (value) => {
    expect(validHex(value)).toBeNull()
  })
})

describe("contrast", () => {
  it("is 21 for black on white, either way round, and 1 for a colour on itself", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21)
    expect(contrast("#ffffff", "#000000")).toBeCloseTo(21)
    expect(contrast("#635bff", "#635bff")).toBe(1)
  })
})

describe("validFontFamily", () => {
  it("accepts a quoted stack", () => {
    expect(validFontFamily(`"Helvetica Neue", Inter, sans-serif`)).toBe(`"Helvetica Neue", Inter, sans-serif`)
  })

  it.each(["Inter; } body { display: none", "Inter</style>", "url(evil)", "Inter\\", "var(--x)", "  ", "'-,-'", "x".repeat(201), null, 12])("refuses %j", (value) => {
    expect(validFontFamily(value)).toBeNull()
  })
})

describe("validRadius", () => {
  it("reads numbers, px and rem, as px", () => {
    expect(validRadius(8)).toBe("8px")
    expect(validRadius("12px")).toBe("12px")
    expect(validRadius("0.5rem")).toBe("8px")
    expect(validRadius("0")).toBe("0px")
  })

  it("caps a huge pill radius", () => {
    expect(validRadius("9999px")).toBe("999px")
  })

  it.each(["50%", "calc(1px)", "-4px", "8px 4px", "", null, Number.NaN, -1])("refuses %j", (value) => {
    expect(validRadius(value)).toBeNull()
  })
})

describe("skinVars", () => {
  const DARK = { background: "#0b0f0c", text: "#e8f5e9", primary: "#00e676", accents: ["#ffd54f", "#40c4ff"], fontFamily: "Space Grotesk, sans-serif", radius: "6px" }

  describe("given a full, readable skin", () => {
    it("maps every slot onto the app's own variables", () => {
      expect(skinVars(DARK)).toEqual({
        "--ground": "#0b0f0c",
        "--ink": "#e8f5e9",
        "--red": "#00e676",
        "--blue": "#ffd54f",
        "--yellow": "#40c4ff",
        "--navy": "#e8f5e9",
        "--on-navy": "#0b0f0c",
        "--on-blue": "#1b1a17",
        "--font": "Space Grotesk, sans-serif, var(--font-jost), sans-serif",
        "--pill": "6px",
      })
    })
  })

  describe("given a light site", () => {
    it("takes the darkest of text and accents for the panels", () => {
      const vars = skinVars({ background: "#ffffff", text: "#425466", primary: "#635bff", accents: ["#0a2540", "#00d4ff"] })
      expect(vars["--navy"]).toBe("#0a2540")
    })
  })

  describe("given text that cannot be read on its background", () => {
    const vars = skinVars({ ...DARK, text: "#1a1f1b" })

    it("keeps our ground and ink, both", () => {
      expect(vars["--ground"]).toBeUndefined()
      expect(vars["--ink"]).toBeUndefined()
    })

    it("still takes the primaries, and only a panel colour that reads on OUR ground", () => {
      expect(vars["--red"]).toBe("#00e676")
      // Every accent is too pale for our off-white ground, and our own ink is no news: the panel stays ours.
      expect(vars["--navy"]).toBeUndefined()
    })
  })

  describe("given missing, null or invalid slots", () => {
    it("leaves each out and keeps the rest", () => {
      const vars = skinVars({ background: null, text: "#000000", primary: "javascript:alert(1)", accents: ["nope", "#ff0000", 7], fontFamily: "x; color: red", radius: "50%" })
      expect(vars).toEqual({ "--red": "#ff0000" })
    })

    it("moves the accents up when there is no primary", () => {
      expect(skinVars({ accents: ["#112233", "#445566"] })).toMatchObject({ "--red": "#112233", "--blue": "#445566" })
    })
  })

  describe("given something that is no skin", () => {
    it.each([null, undefined, "skin", [], 3, {}])("sets nothing for %j", (skin) => {
      expect(skinVars(skin)).toEqual({})
    })
  })
})

describe("wornVars", () => {
  it("fills every colour slot, so no theme shows through a partial skin", () => {
    expect(wornVars({ primary: "#ff0000" })).toEqual({ ...BAUHAUS_LIGHT, "--red": "#ff0000" })
  })

  it("lets the skin's own values win over the Bauhaus ones", () => {
    const vars = wornVars({ background: "#0b0f0c", text: "#e8f5e9" })
    expect(vars["--ground"]).toBe("#0b0f0c")
    expect(vars["--yellow"]).toBe(BAUHAUS_LIGHT["--yellow"])
  })

  it("sets no font or radius the skin did not bring", () => {
    expect(wornVars({})).toEqual(BAUHAUS_LIGHT)
  })

  it("keeps text on the panels and on the blue field readable", () => {
    for (const skin of [{}, { background: "#0b0f0c", text: "#e8f5e9", primary: "#00e676", accents: ["#ffd54f"] }, { accents: ["#eeeeee", "#fafafa"] }]) {
      const vars = wornVars(skin)
      expect(contrast(vars["--navy"]!, vars["--on-navy"]!)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(vars["--blue"]!, vars["--on-blue"]!)).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe("safeSkinVars", () => {
  it("passes what skinVars produced", () => {
    const vars = skinVars({ background: "#0b0f0c", text: "#e8f5e9", primary: "#00e676", fontFamily: "Inter", radius: 4 })
    expect(safeSkinVars(vars)).toEqual(vars)
  })

  it("drops unknown names and values of any other shape", () => {
    const tampered = { "--ground": "url(https://evil.example/x.png)", "--ink": "#FFFFFF", "--red": "#ff0000", "--font": "Inter; } * { display:none", "--pill": "calc(1px)", "--evil": "#000000", background: "#000000" }
    expect(safeSkinVars(tampered)).toEqual({ "--red": "#ff0000" })
  })

  it.each([null, "vars", 3, []])("is empty for %j", (vars) => {
    expect(safeSkinVars(vars)).toEqual({})
  })
})
