import { describe, expect, it } from "vitest"

import { nextTheme, themeLabel, themeOf } from "./theme"

describe("themeOf", () => {
  it("knows light and dark", () => {
    expect(themeOf("light")).toBe("light")
    expect(themeOf("dark")).toBe("dark")
  })

  it.each([null, undefined, "", "system", "Dark", "sepia", 1])("follows the system for %j", (value) => {
    expect(themeOf(value)).toBe("system")
  })
})

describe("nextTheme", () => {
  it("cycles system, light, dark and round again", () => {
    expect(nextTheme("system")).toBe("light")
    expect(nextTheme("light")).toBe("dark")
    expect(nextTheme("dark")).toBe("system")
  })
})

describe("themeLabel", () => {
  it("says what the toggle is set to", () => {
    expect(themeLabel("system")).toBe("Theme: follows your system")
    expect(themeLabel("dark")).toBe("Theme: dark")
  })
})
