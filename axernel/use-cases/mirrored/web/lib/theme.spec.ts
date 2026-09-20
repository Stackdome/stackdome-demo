import { describe, expect, it } from "vitest"

import { nextTheme, shownTheme, themeLabel, themeOf } from "./theme"

describe("themeOf", () => {
  it("knows light and dark", () => {
    expect(themeOf("light")).toBe("light")
    expect(themeOf("dark")).toBe("dark")
  })

  it.each([null, undefined, "", "system", "Dark", "sepia", 1])("follows the system for %j", (value) => {
    expect(themeOf(value)).toBe("system")
  })
})

describe("shownTheme", () => {
  it("lets the system decide until someone chooses", () => {
    expect(shownTheme("system", true)).toBe("dark")
    expect(shownTheme("system", false)).toBe("light")
  })

  it("holds a choice whatever the system prefers", () => {
    expect(shownTheme("light", true)).toBe("light")
    expect(shownTheme("dark", false)).toBe("dark")
  })
})

describe("nextTheme", () => {
  it("goes to the side that is not on screen", () => {
    expect(nextTheme("light", true)).toBe("dark")
    expect(nextTheme("dark", false)).toBe("light")
  })

  it("leaves the system's dark for light on the first press", () => {
    expect(nextTheme("system", true)).toBe("light")
    expect(nextTheme("system", false)).toBe("dark")
  })
})

describe("themeLabel", () => {
  it("says what pressing will do", () => {
    expect(themeLabel("dark")).toBe("Switch to light mode")
    expect(themeLabel("light")).toBe("Switch to dark mode")
  })
})
