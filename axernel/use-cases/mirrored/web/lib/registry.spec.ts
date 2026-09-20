import { describe, expect, it } from "vitest"

import { byInstallOrder, firstLines, installNames, isTheme, itemCode, themeCss, registryFileName, registryFileOfEntry, registryItems, shadcnCommand } from "./registry"

describe("registryFileName", () => {
  describe("given a lower-case, dashed .json name", () => {
    it.each(["index.json", "pricing-table.json", "button2.json"])("allows %s", (file) => {
      expect(registryFileName(file)).toBe(file)
    })
  })

  describe("given anything that could leave the registry folder, or is not JSON", () => {
    it.each(["../mirrored.db", "..%2Fsecret.json", "r/button.json", "Button.json", "button.json.bak", ".json", "button", "but ton.json", "button.JSON", ""])("refuses %j", (file) => {
      expect(registryFileName(file)).toBeNull()
    })
  })
})

describe("registryFileOfEntry", () => {
  it("keeps only the base name of an entry under r/", () => {
    expect(registryFileOfEntry("r/button.json")).toBe("button.json")
    expect(registryFileOfEntry("registry/r/theme.json")).toBe("theme.json")
  })

  it("flattens a path that tries to climb, so it cannot", () => {
    expect(registryFileOfEntry("../../etc/cron.json")).toBe("cron.json")
  })

  it.each(["r/README.md", "r/", "r/Button.json", "r/..json"])("is null for %j", (entry) => {
    expect(registryFileOfEntry(entry)).toBeNull()
  })
})

describe("registryItems", () => {
  describe("given the index the agent writes", () => {
    it("lists name and type", () => {
      const index = { items: [{ name: "pricing-table", type: "registry:block" }, { name: "theme", type: "registry:theme" }] }
      expect(registryItems(index)).toEqual([
        { name: "pricing-table", type: "registry:block" },
        { name: "theme", type: "registry:theme" },
      ])
    })
  })

  describe("given items that could not be served or have no name", () => {
    it("leaves them out, and reads a missing type as none", () => {
      const index = { items: [{ name: "../x" }, { name: 3 }, null, { type: "registry:ui" }, { name: "button" }] }
      expect(registryItems(index)).toEqual([{ name: "button", type: "" }])
    })
  })

  describe("given something that is no index", () => {
    it.each([null, undefined, "items", {}, { items: "button" }])("is empty for %j", (index) => {
      expect(registryItems(index)).toEqual([])
    })
  })
})

describe("byInstallOrder", () => {
  it("puts components before themes and keeps each group's order", () => {
    const items = [
      { name: "theme", type: "registry:theme" },
      { name: "card", type: "registry:ui" },
      { name: "style", type: "registry:style" },
      { name: "button", type: "registry:ui" },
    ]
    expect(byInstallOrder(items).map((item) => item.name)).toEqual(["card", "button", "theme", "style"])
    expect(items.filter(isTheme)).toHaveLength(2)
  })
})

describe("installNames", () => {
  const items = [{ name: "theme", type: "registry:theme" }, { name: "pricing-table", type: "registry:block" }]

  it("lists the result's components first, then the rest of the index, each once", () => {
    expect(installNames(["pricing-table", "plan-card"], items)).toEqual(["pricing-table", "plan-card", "theme"])
  })

  it("falls back to the index when the result names none", () => {
    expect(installNames(undefined, items)).toEqual(["pricing-table", "theme"])
  })

  it("drops names the route would refuse", () => {
    expect(installNames(["PlanCard", "../x", 3, "ok-name"], [])).toEqual(["ok-name"])
  })
})

describe("shadcnCommand", () => {
  it("points shadcn at this mirror's registry file", () => {
    expect(shadcnCommand("https://mirrored.dev", "abc-123", "button")).toBe("npx shadcn@latest add https://mirrored.dev/r/abc-123/button.json")
  })

  it("does not double the slash of an origin that ends in one", () => {
    expect(shadcnCommand("http://localhost:3220/", "m1", "theme")).toBe("npx shadcn@latest add http://localhost:3220/r/m1/theme.json")
  })
})

describe("itemCode", () => {
  it("is the first file's content, named by the base name of its path", () => {
    const item = { files: [{ path: "components/ui/pricing-cards.tsx", content: "export function PricingCards() {}\n" }, { path: "x.ts", content: "second" }] }
    expect(itemCode(item)).toEqual({ fileName: "pricing-cards.tsx", content: "export function PricingCards() {}\n" })
  })

  it("names a file with no path", () => {
    expect(itemCode({ files: [{ content: "x" }] })?.fileName).toBe("component.tsx")
  })

  it.each([null, {}, { files: [] }, { files: [{ path: "a.tsx" }] }, { files: [{ path: "a.tsx", content: "  " }] }, { files: "a.tsx" }])("is null for %j", (item) => {
    expect(itemCode(item)).toBeNull()
  })
})

describe("themeCss", () => {
  it("writes cssVars.theme as a Tailwind v4 @theme block", () => {
    const item = { cssVars: { theme: { "color-primary": "#635bff", "--radius-card": "8px", "font-sans": "Inter, sans-serif" } } }
    expect(themeCss([item])).toBe("@theme {\n  --color-primary: #635bff;\n  --radius-card: 8px;\n  --font-sans: Inter, sans-serif;\n}")
  })

  it("merges several items, the first to name a variable winning", () => {
    const css = themeCss([{ cssVars: { theme: { "color-primary": "#111111" } } }, { cssVars: { theme: { "color-primary": "#222222", "color-ink": "#333333" } } }])
    expect(css).toBe("@theme {\n  --color-primary: #111111;\n  --color-ink: #333333;\n}")
  })

  it("drops a name or value that could break out of the block", () => {
    const item = { cssVars: { theme: { "ok": "1px", "bad name": "1px", "x": "red; } body { display: none", "y": "a\nb", "z": 4 } } }
    expect(themeCss([item])).toBe("@theme {\n  --ok: 1px;\n}")
  })

  it.each([[[]], [[null]], [[{ cssVars: {} }]], [[{ cssVars: { theme: "x" } }]], [[{ cssVars: { theme: {} } }]]])("is null when there is no theme: %j", (items) => {
    expect(themeCss(items)).toBeNull()
  })
})

describe("firstLines", () => {
  it("cuts a long text and says so", () => {
    expect(firstLines("a\nb\nc\nd", 2)).toEqual({ text: "a\nb", cut: true })
  })

  it("leaves a short text whole, without its trailing blank lines", () => {
    expect(firstLines("a\nb\n\n", 2)).toEqual({ text: "a\nb", cut: false })
  })
})
