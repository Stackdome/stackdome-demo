#!/usr/bin/env node
// mir-measure <url> <outDir> [--selector <css>]
// Without --selector: screenshots the page and lists candidate sections (outline.json).
// With --selector: screenshots that element and dumps its DOM with computed styles (dom.json).
// Always: counts design values (counts.json), lists fonts (fonts.json), saves images (assets/).
// Last line is MIR_OK or MIR_ERROR: <reason>.
import { createRequire } from "node:module"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { textRects } from "/opt/mirrored/text-rects.mjs"

process.env.PLAYWRIGHT_BROWSERS_PATH ||= "/ms-playwright"
// An agent that pipes this into `head` closes the pipe early; that must not crash the tool.
process.stdout.on("error", () => {})
const require = createRequire("/opt/walkthrough/")
// @playwright/test is the copy pinned to the browsers baked into this image; bare "playwright" resolves to a newer one.
const { chromium } = require("@playwright/test")

const [url, outDir, flag, selector] = process.argv.slice(2)
const fail = (reason) => {
  console.log(`MIR_ERROR: ${reason}`)
  process.exit(1)
}
if (!url || !outDir) fail("usage: mir-measure <url> <outDir> [--selector <css>]")
if (flag && flag !== "--selector") fail(`unknown flag ${flag}`)
mkdirSync(join(outDir, "assets"), { recursive: true })

const MAX_NODES = 400
const MAX_ASSETS = 20
const MAX_ASSET_BYTES = 2_000_000

// Runs in the page. Kept as one function so nothing outside it is referenced.
function readPage({ selector, maxNodes }) {
  const STYLE_KEYS = [
    "display", "position", "flexDirection", "flexWrap", "justifyContent", "alignItems", "gap", "gridTemplateColumns",
    "marginTop", "marginRight", "marginBottom", "marginLeft", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "color", "backgroundColor", "backgroundImage", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing",
    "textAlign", "textTransform", "textDecorationLine", "borderTopWidth", "borderTopStyle", "borderTopColor",
    "borderRadius", "boxShadow", "opacity", "maxWidth",
  ]
  const BORING = new Set(["none", "normal", "auto", "0px", "rgba(0, 0, 0, 0)", "static", "start", "row", "nowrap", "1", "visible"])
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"
  }
  const cssPath = (el) => {
    if (el.id) return `#${CSS.escape(el.id)}`
    const parts = []
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const siblings = [...node.parentElement.children].filter((c) => c.tagName === node.tagName)
      parts.unshift(node.tagName.toLowerCase() + (siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ""))
    }
    return `body > ${parts.join(" > ")}`
  }
  const bump = (map, key) => key && map.set(key, (map.get(key) || 0) + 1)
  const top = (map, n = 12) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }))

  const root = selector ? document.querySelector(selector) : document.body
  if (!root) return { error: `selector matched nothing: ${selector}` }

  const counts = { colors: new Map(), backgrounds: new Map(), fontFamilies: new Map(), fontSizes: new Map(), fontWeights: new Map(), radii: new Map(), shadows: new Map(), spacing: new Map() }
  for (const el of [root, ...root.querySelectorAll("*")]) {
    if (!visible(el)) continue
    const s = getComputedStyle(el)
    if (el.innerText?.trim()) {
      bump(counts.colors, s.color)
      bump(counts.fontFamilies, s.fontFamily)
      bump(counts.fontSizes, s.fontSize)
      bump(counts.fontWeights, s.fontWeight)
    }
    if (s.backgroundColor !== "rgba(0, 0, 0, 0)") bump(counts.backgrounds, s.backgroundColor)
    if (s.borderRadius !== "0px") bump(counts.radii, s.borderRadius)
    if (s.boxShadow !== "none") bump(counts.shadows, s.boxShadow)
    for (const k of ["paddingTop", "paddingLeft", "marginTop", "gap"]) if (!BORING.has(s[k])) bump(counts.spacing, s[k])
  }

  let budget = maxNodes
  const dump = (el) => {
    if (budget-- <= 0 || !visible(el)) return null
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const style = {}
    for (const k of STYLE_KEYS) if (!BORING.has(s[k])) style[k] = s[k]
    const node = { tag: el.tagName.toLowerCase(), box: { w: Math.round(r.width), h: Math.round(r.height) }, style }
    for (const a of ["class", "href", "src", "alt", "type", "placeholder"]) if (el.getAttribute(a)) node[a] = el.getAttribute(a).slice(0, 200)
    if (node.tag === "svg") return { ...node, svg: el.outerHTML.slice(0, 4000) }
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim()
    if (ownText) node.text = ownText.slice(0, 300)
    const children = [...el.children].map(dump).filter(Boolean)
    if (children.length) node.children = children
    return node
  }

  const outline = [...document.querySelectorAll("header, nav, main > *, section, footer, [role=banner], [role=main] > *")]
    .filter((el) => visible(el) && el.getBoundingClientRect().height > 60)
    .slice(0, 30)
    .map((el) => {
      const r = el.getBoundingClientRect()
      return { selector: cssPath(el), tag: el.tagName.toLowerCase(), class: (el.getAttribute("class") || "").slice(0, 80), text: el.innerText.trim().replace(/\s+/g, " ").slice(0, 120), box: { y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) } }
    })

  const fontFaces = []
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) if (rule.type === CSSRule.FONT_FACE_RULE) fontFaces.push({ family: rule.style.fontFamily, weight: rule.style.fontWeight, src: rule.style.src.slice(0, 400) })
    } catch {
      // Cross-origin sheets refuse cssRules; their fonts still show up in `loaded`.
    }
  }
  const images = [...root.querySelectorAll("img")].filter(visible).map((img) => img.currentSrc || img.src).filter((s) => s.startsWith("http"))
  const icon = document.querySelector('link[rel~="icon"]')?.href
  const ogImage = document.querySelector('meta[property="og:image"]')?.content

  return {
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || "",
    box: (({ width, height }) => ({ w: Math.round(width), h: Math.round(height) }))(root.getBoundingClientRect()),
    pageBackground: getComputedStyle(document.body).backgroundColor,
    dom: selector ? dump(root) : null,
    outline,
    counts: Object.fromEntries(Object.entries(counts).map(([k, m]) => [k, top(m)])),
    fonts: { loaded: [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`))], fontFaces: fontFaces.slice(0, 40) },
    images: [...new Set(images)],
    brandImages: [icon, ogImage].filter(Boolean),
  }
}

let browser
try {
  browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 }).catch(() => page.goto(url, { waitUntil: "load", timeout: 45_000 }))
  await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" })
  await page.waitForTimeout(500)

  const data = await page.evaluate(readPage, { selector: selector || null, maxNodes: MAX_NODES })
  if (data.error) fail(data.error)

  const shoot = async (suffix) => {
    if (selector) await page.locator(selector).first().screenshot({ path: join(outDir, `original${suffix}.png`) })
    else await page.screenshot({ path: join(outDir, `page${suffix}.png`), fullPage: true })
  }
  const rects = async (suffix) => selector && writeFileSync(join(outDir, `rects${suffix}.json`), JSON.stringify(await page.evaluate(textRects, selector)))
  await shoot("")
  await rects("")
  await page.setViewportSize({ width: 390, height: 800 })
  await page.waitForTimeout(300)
  await shoot("-390")
  await rects("-390")

  const saved = []
  for (const src of [...data.brandImages, ...data.images].slice(0, MAX_ASSETS)) {
    try {
      const res = await page.request.get(src, { timeout: 10_000 })
      const body = await res.body()
      if (!res.ok() || body.length > MAX_ASSET_BYTES) continue
      const name = `${saved.length}-${new URL(src).pathname.split("/").pop().replace(/[^\w.-]/g, "").slice(-60) || "image"}`
      writeFileSync(join(outDir, "assets", name), body)
      saved.push({ src, file: `assets/${name}` })
    } catch {
      // A missing image must not fail the measurement.
    }
  }

  const write = (name, value) => writeFileSync(join(outDir, name), JSON.stringify(value, null, 2))
  write("counts.json", data.counts)
  write("fonts.json", data.fonts)
  write("assets.json", saved)
  write("page.json", { url, title: data.title, description: data.description, pageBackground: data.pageBackground, selector: selector || null, box: data.box })
  if (selector) write("dom.json", data.dom)
  else write("outline.json", data.outline)

  console.log(`title: ${data.title}`)
  console.log(`box: ${data.box.w}x${data.box.h}  page background: ${data.pageBackground}`)
  console.log(`top colours: ${data.counts.colors.slice(0, 4).map((c) => c.value).join(" | ")}`)
  console.log(`top backgrounds: ${data.counts.backgrounds.slice(0, 4).map((c) => c.value).join(" | ")}`)
  console.log(`fonts loaded: ${data.fonts.loaded.slice(0, 6).join(", ") || "none reported"}`)
  console.log(`assets saved: ${saved.length}`)
  if (!selector) for (const s of data.outline) console.log(`SECTION ${s.selector}  [${s.box.w}x${s.box.h} at y=${s.box.y}]  ${s.text.slice(0, 70)}`)
  console.log("MIR_OK")
} catch (error) {
  fail(String(error.message || error).split("\n")[0])
} finally {
  await browser?.close()
}
