#!/usr/bin/env node
// mir-measure <url> <outDir> [--selector <css> | --find "<words that appear in the section>"]
// Without --selector: screenshots the page and lists candidate sections (outline.json).
// With --selector: screenshots that element and dumps its DOM with computed styles (dom.json).
// Always: counts design values (counts.json), lists fonts (fonts.json), saves images (assets/).
// Last line is MIR_OK or MIR_ERROR: <reason>.
import { createRequire } from "node:module"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { textRects } from "/opt/mirrored/text-rects.mjs"

process.env.PLAYWRIGHT_BROWSERS_PATH ||= "/ms-playwright"
// An agent that pipes this into `head` closes the pipe early; that must not crash the tool.
process.stdout.on("error", () => {})
const require = createRequire("/opt/walkthrough/")
// @playwright/test is the copy pinned to the browsers baked into this image; bare "playwright" resolves to a newer one.
const { chromium } = require("@playwright/test")

const [url, outDir, flag, flagValue] = process.argv.slice(2)
const fail = (reason) => {
  console.log(`MIR_ERROR: ${reason}`)
  process.exit(1)
}
if (!url || !outDir) fail("usage: mir-measure <url> <outDir> [--selector <css>]")
if (flag && flag !== "--selector" && flag !== "--find") fail(`unknown flag ${flag}`)
if (flag && !flagValue) fail(`${flag} needs a value`)
const selector = flag === "--selector" ? flagValue : null
const find = flag === "--find" ? flagValue : null
mkdirSync(join(outDir, "assets"), { recursive: true })

// The model has no clock and the run has a hard limit, so every tool says how much is used.
const clock = () => {
  const stamp = "/tmp/.mirror-started"
  if (!existsSync(stamp)) writeFileSync(stamp, String(Date.now()))
  const minutes = Math.round((Date.now() - Number(readFileSync(stamp, "utf8"))) / 60000)
  return `CLOCK ${minutes} min used. Hard limit 30. First mir-reflect by minute 10, run mir-pack by minute 22 whatever the score.`
}

const MAX_NODES = 400
const MAX_ASSETS = 20
const MAX_ASSET_BYTES = 2_000_000

// Runs in the page. Kept as one function so nothing outside it is referenced.
function readPage({ selector, find, maxNodes }) {
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
  // Text properties inherit, so a child only lists the ones that differ from its parent:
  // without this the same font stack is printed on every node and the file is four times the size.
  const INHERITED = new Set(["color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "textTransform"])
  const SIDES = ["Top", "Right", "Bottom", "Left"]
  const origin = root.getBoundingClientRect()
  const svgs = new Map()
  const pseudo = (el, which) => {
    const p = getComputedStyle(el, which)
    if (!p.content || p.content === "none" || p.content === "normal") return null
    const out = { content: p.content.slice(0, 40) }
    for (const k of ["position", "width", "height", "backgroundColor", "backgroundImage", "borderRadius", "opacity", "inset"]) if (p[k] && !BORING.has(p[k])) out[k] = p[k].slice(0, 160)
    return out
  }
  const dump = (el, parentStyle) => {
    if (budget-- <= 0 || !visible(el)) return null
    const s = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    const style = {}
    for (const k of STYLE_KEYS) if (!BORING.has(s[k]) && !(INHERITED.has(k) && parentStyle && parentStyle[k] === s[k])) style[k] = s[k]
    const borders = SIDES.filter((side) => s[`border${side}Width`] !== "0px").map((side) => `${side.toLowerCase()} ${s[`border${side}Width`]} ${s[`border${side}Style`]} ${s[`border${side}Color`]}`)
    delete style.borderTopWidth
    delete style.borderTopStyle
    delete style.borderTopColor
    if (borders.length) style.borders = new Set(borders.map((b) => b.split(" ").slice(1).join(" "))).size === 1 && borders.length === 4 ? `all ${borders[0].split(" ").slice(1).join(" ")}` : borders.join("; ")
    if (Number(s.opacity) === 0) style.invisible = "opacity 0: leave it out"
    const node = { tag: el.tagName.toLowerCase(), box: { x: Math.round(r.left - origin.left), y: Math.round(r.top - origin.top), w: Math.round(r.width), h: Math.round(r.height) }, style }
    for (const which of ["::before", "::after"]) { const p = pseudo(el, which); if (p) node[which] = p }
    for (const a of ["class", "href", "src", "alt", "type", "placeholder"]) if (el.getAttribute(a)) node[a] = el.getAttribute(a).slice(0, 200)
    if (node.tag === "svg") {
      const markup = el.outerHTML.replace(/\s+/g, " ").slice(0, 4000)
      if (svgs.has(markup)) return { ...node, svg: `same as svg #${svgs.get(markup)}` }
      svgs.set(markup, svgs.size + 1)
      return { ...node, svgId: svgs.size, svg: markup }
    }
    const ownText = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim()
    if (ownText) node.text = ownText.slice(0, 300)
    const children = [...el.children].map((child) => dump(child, s)).filter(Boolean)
    if (children.length) node.children = children
    return node
  }

  // Many sites have no <main> or <section>, so size and shape count as well as tag names:
  // anything wide, of a sensible height, that holds at least two things.
  const words = (find || "").toLowerCase().split(/\s+/).filter(Boolean)
  const holdsWords = (el) => words.length > 0 && words.every((w) => el.innerText.toLowerCase().includes(w))
  const semantic = new Set(document.querySelectorAll("header, nav, main > *, section, footer, [role=banner], [role=main] > *"))
  const shaped = [...document.querySelectorAll("body *")].filter((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 600 && r.height > 150 && r.height < 2500 && el.children.length >= 2
  })
  const pool = [...new Set([...semantic, ...shaped])].filter((el) => visible(el) && el.getBoundingClientRect().height > 60)
  // With --find, the smallest elements that contain every word come first.
  const ranked = words.length ? pool.filter(holdsWords).sort((a, b) => a.innerText.length - b.innerText.length) : pool.filter((el) => !pool.some((other) => other !== el && other.contains(el) && other.getBoundingClientRect().height < el.getBoundingClientRect().height * 1.15))
  const outline = ranked
    .slice(0, words.length ? 12 : 30)
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    .map((el) => {
      const r = el.getBoundingClientRect()
      return { selector: cssPath(el), tag: el.tagName.toLowerCase(), class: (el.getAttribute("class") || "").slice(0, 80), text: el.innerText.trim().replace(/\s+/g, " ").slice(0, 120), box: { y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) } }
    })

  const fontUrl = (src, base) => {
    const found = /url\(["']?([^"')]+\.woff2?[^"')]*)["']?\)/.exec(src)
    try {
      return found ? new URL(found[1], base || location.href).href : null
    } catch {
      return null
    }
  }
  const fontFaces = []
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) if (rule.type === CSSRule.FONT_FACE_RULE) fontFaces.push({ family: rule.style.fontFamily, weight: rule.style.fontWeight, style: rule.style.fontStyle, src: rule.style.src.slice(0, 400), url: fontUrl(rule.style.src, sheet.href) })
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

  const data = await page.evaluate(readPage, { selector: selector || null, find, maxNodes: MAX_NODES })
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

  // Fonts the element really uses, fetched so the rebuild is scored in the same typeface.
  // mir-reflect loads fonts.css by itself and mir-pack never ships the files: they are licensed.
  const plain = (family) => family.replace(/["']/g, "").trim().toLowerCase()
  const used = new Set(data.counts.fontFamilies.flatMap((f) => f.value.split(",").map(plain)))
  const fontRules = []
  if (selector) {
    mkdirSync(join(outDir, "fonts"), { recursive: true })
    for (const face of data.fonts.fontFaces.filter((f) => f.url && used.has(plain(f.family))).slice(0, 8)) {
      try {
        const res = await page.request.get(face.url, { timeout: 10_000 })
        const body = await res.body()
        if (!res.ok() || body.length > MAX_ASSET_BYTES) continue
        const name = `${fontRules.length}-${new URL(face.url).pathname.split("/").pop().replace(/[^\w.-]/g, "").slice(-50)}`
        writeFileSync(join(outDir, "fonts", name), body)
        fontRules.push(`@font-face { font-family: ${face.family}; font-weight: ${face.weight || "normal"}; font-style: ${face.style || "normal"}; src: url("../measure/fonts/${name}"); }`)
      } catch {
        // A font that will not download only costs score.
      }
    }
    writeFileSync(join(outDir, "fonts.css"), fontRules.join("\n"))
  }

  const write = (name, value) => writeFileSync(join(outDir, name), JSON.stringify(value, null, 2))
  write("counts.json", data.counts)
  write("fonts.json", data.fonts)
  write("assets.json", saved)
  write("page.json", { url, title: data.title, description: data.description, pageBackground: data.pageBackground, selector: selector || null, box: data.box })
  // Compact on purpose: one node per line is what jq and a reader both want, and pretty-printing quadruples it.
  if (selector) writeFileSync(join(outDir, "dom.json"), JSON.stringify(data.dom))
  else write("outline.json", data.outline)

  console.log(`title: ${data.title}`)
  console.log(`box: ${data.box.w}x${data.box.h}  page background: ${data.pageBackground}`)
  console.log(`top colours: ${data.counts.colors.slice(0, 4).map((c) => c.value).join(" | ")}`)
  console.log(`top backgrounds: ${data.counts.backgrounds.slice(0, 4).map((c) => c.value).join(" | ")}`)
  console.log(`fonts loaded: ${data.fonts.loaded.slice(0, 6).join(", ") || "none reported"}`)
  console.log(`assets saved: ${saved.length}`)
  if (selector) console.log(`web fonts fetched for scoring: ${fontRules.length} (mir-reflect loads them by itself; just use the family names)`)
  console.log(clock())
  if (!selector && find && data.outline.length === 0) console.log(`no element contains all of: ${find}. Try fewer or different words.`)
  if (!selector) for (const s of data.outline) console.log(`SECTION ${s.selector}  [${s.box.w}x${s.box.h} at y=${s.box.y}]  ${s.text.slice(0, 70)}`)
  console.log("MIR_OK")
} catch (error) {
  fail(String(error.message || error).split("\n")[0])
} finally {
  await browser?.close()
}
