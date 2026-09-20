#!/usr/bin/env node
// mir-reflect <componentDir> <measureDir>
// Renders <componentDir>/index.html, screenshots the element marked data-mirror-root at the
// same two widths mir-measure used, and scores each against the original with mir-diff.py.
// Last line is MIR_OK score=<0-100> or MIR_ERROR: <reason>.
import { createRequire } from "node:module"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"

process.env.PLAYWRIGHT_BROWSERS_PATH ||= "/ms-playwright"
const require = createRequire("/opt/walkthrough/")
// @playwright/test is the copy pinned to the browsers baked into this image; bare "playwright" resolves to a newer one.
const { chromium } = require("@playwright/test")

const [componentDir, measureDir] = process.argv.slice(2)
const fail = (reason) => {
  console.log(`MIR_ERROR: ${reason}`)
  process.exit(1)
}
if (!componentDir || !measureDir) fail("usage: mir-reflect <componentDir> <measureDir>")
const index = resolve(componentDir, "index.html")
if (!existsSync(index)) fail(`${index} does not exist`)
if (!existsSync(join(measureDir, "original.png"))) fail(`${measureDir}/original.png does not exist; run mir-measure with --selector first`)

let browser
try {
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const problems = []
  page.on("requestfailed", (r) => problems.push(`failed to load ${r.url().slice(0, 120)}`))
  page.on("pageerror", (e) => problems.push(`page error: ${String(e).slice(0, 120)}`))
  await page.goto(`file://${index}`, { waitUntil: "networkidle", timeout: 30_000 })
  const root = page.locator("[data-mirror-root]").first()
  if ((await root.count()) === 0) fail("index.html has no element with the data-mirror-root attribute")

  const scores = {}
  for (const [width, suffix] of [[1280, ""], [390, "-390"]]) {
    await page.setViewportSize({ width, height: 800 })
    await page.waitForTimeout(300)
    await root.screenshot({ path: join(measureDir, `rebuild${suffix}.png`) })
    const out = execFileSync("python3", ["/usr/local/bin/mir-diff.py", join(measureDir, `original${suffix}.png`), join(measureDir, `rebuild${suffix}.png`), join(measureDir, `diff${suffix}.png`)], { encoding: "utf8" })
    console.log(`--- ${width}px wide`)
    console.log(out.trim())
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
