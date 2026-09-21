#!/usr/bin/env node
// mir-reflect <workDir>
// Renders <workDir>/registry/preview.tsx (React + Tailwind, themed by tokens.json) to a static page,
// screenshots the element marked data-mirror-root at the two widths mir-measure used, and scores
// each against the original with mir-diff.py.
// Last line is MIR_OK score=<0-100> or MIR_ERROR: <reason>.
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { compareRects, textRects } from "/opt/mirrored/text-rects.mjs"

process.env.PLAYWRIGHT_BROWSERS_PATH ||= "/ms-playwright"
// An agent that pipes this into `head` closes the pipe early; that must not crash the tool.
process.stdout.on("error", () => {})
const HARNESS = "/opt/mirrored/harness"
const require = createRequire("/opt/walkthrough/")
// @playwright/test is the copy pinned to the browsers baked into this image; bare "playwright" resolves to a newer one.
const { chromium } = require("@playwright/test")

const fail = (reason) => {
  console.log(`MIR_ERROR: ${reason}`)
  process.exit(1)
}
const run = (file, args, options = {}) => {
  try {
    return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options })
  } catch (error) {
    fail(`${file.split("/").pop()} failed: ${String(error.stderr || error.message).trim().split("\n").slice(-6).join(" | ").slice(0, 700)}`)
  }
}

const work = resolve(process.argv[2] || "")
const registry = join(work, "registry")
const measure = join(work, "measure")
const build = join(work, "build")
if (!process.argv[2]) fail("usage: mir-reflect <workDir>")
if (!existsSync(join(registry, "preview.tsx"))) fail(`${registry}/preview.tsx does not exist`)
if (!existsSync(join(measure, "original.png"))) fail(`${measure}/original.png does not exist; run mir-measure with --selector first`)

// The component folder borrows the harness's React and gets the JSX setting tsx needs.
if (!existsSync(join(registry, "node_modules"))) symlinkSync(join(HARNESS, "node_modules"), join(registry, "node_modules"))
writeFileSync(join(registry, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "react-jsx", module: "esnext", moduleResolution: "bundler", strict: true } }))
mkdirSync(build, { recursive: true })

run("python3", ["/usr/local/bin/mir-pack", work, "--theme-only"])
const markup = run(join(HARNESS, "node_modules/.bin/tsx"), [join(HARNESS, "ssr.mjs"), work], { cwd: registry })
writeFileSync(join(HARNESS, "in.css"), `@import "tailwindcss";\n@source "${registry}";\n@import "${join(work, "theme.css")}";\n`)
run(join(HARNESS, "node_modules/.bin/tailwindcss"), ["-i", "in.css", "-o", join(build, "styles.css")], { cwd: HARNESS })
const page = existsSync(join(measure, "page.json")) ? JSON.parse(readFileSync(join(measure, "page.json"), "utf8")) : {}
writeFileSync(join(build, "index.html"), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="styles.css"></head><body style="margin:0;background:${page.pageBackground || "#fff"}">${markup}</body></html>`)

let browser
try {
  browser = await chromium.launch()
  const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const problems = []
  tab.on("requestfailed", (r) => problems.push(`failed to load ${r.url().slice(0, 120)}`))
  await tab.goto(`file://${join(build, "index.html")}`, { waitUntil: "networkidle", timeout: 30_000 })
  const root = tab.locator("[data-mirror-root]").first()
  if ((await root.count()) === 0) fail("the preview renders no element with the data-mirror-root attribute")

  const scores = {}
  for (const [width, suffix] of [[1280, ""], [390, "-390"]]) {
    await tab.setViewportSize({ width, height: 800 })
    await tab.waitForTimeout(300)
    await root.screenshot({ path: join(measure, `rebuild${suffix}.png`) })
    const out = run("python3", ["/usr/local/bin/mir-diff.py", join(measure, `original${suffix}.png`), join(measure, `rebuild${suffix}.png`), join(measure, `diff${suffix}.png`)])
    console.log(`--- ${width}px wide\n${out.trim()}`)
    const rectsFile = join(measure, `rects${suffix}.json`)
    if (existsSync(rectsFile)) for (const line of compareRects(JSON.parse(readFileSync(rectsFile, "utf8")), await tab.evaluate(textRects, "[data-mirror-root]"))) console.log(line)
    scores[width] = Number(/SCORE (\S+)/.exec(out)?.[1])
  }
  for (const p of [...new Set(problems)].slice(0, 8)) console.log(`WARNING ${p}`)
  // Desktop is the headline; the phone width keeps a rebuild from passing on one layout only.
  const score = Math.round((scores[1280] * 0.7 + scores[390] * 0.3) * 10) / 10
  console.log(`MIR_OK score=${score} desktop=${scores[1280]} phone=${scores[390]}`)
} catch (error) {
  fail(String(error.message || error).split("\n")[0])
} finally {
  await browser?.close()
}
