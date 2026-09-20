// Seeds ONE finished mirror, clearly marked MOCK, so the result tabs can be
// looked at without paying for a run. Nothing here talks to Axernel: the row
// is settled and its artifact files are already in the disk cache.
//
//   npm run seed:mock        (safe to run again: it replaces the mock)
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { deflateSync } from "node:zlib"

import { DATA_DIR, db, insertEvent, insertMirror } from "../lib/server/db.ts"
import { zipOf } from "../lib/server/zip.ts"

const ID = "mock-pricing-table"

// --- A tiny PNG writer: flat rectangles on an RGB canvas ----------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes) {
  let c = 0xffffffff
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), 8 + data.length)
  return out
}

const hex = (color) => [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16))

function canvas(width, height, background) {
  const pixels = Buffer.alloc(width * height * 3)
  const api = {
    width,
    height,
    pixels,
    rect(x, y, w, h, color) {
      const [r, g, b] = hex(color)
      for (let row = Math.max(0, y); row < Math.min(height, y + h); row++) {
        for (let col = Math.max(0, x); col < Math.min(width, x + w); col++) pixels.set([r, g, b], (row * width + col) * 3)
      }
      return api
    },
    png() {
      const raw = Buffer.alloc((width * 3 + 1) * height)
      for (let row = 0; row < height; row++) pixels.copy(raw, row * (width * 3 + 1) + 1, row * width * 3, (row + 1) * width * 3)
      const header = Buffer.alloc(13)
      header.writeUInt32BE(width, 0)
      header.writeUInt32BE(height, 4)
      header.set([8, 2, 0, 0, 0], 8)
      return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))])
    },
  }
  return api.rect(0, 0, width, height, background)
}

// --- The pretend pricing table, drawn twice with small differences ------------

const WIDTH = 640
const HEIGHT = 320

/** `drift` is what the rebuild gets slightly wrong: card height, button colour, a gap. */
function pricingTable({ drift }) {
  const picture = canvas(WIDTH, HEIGHT, "#f6f9fc")
  picture.rect(40, 24, 220, 18, "#0a2540").rect(40, 50, 340, 10, "#8898aa")
  for (let card = 0; card < 3; card++) {
    const x = 40 + card * (180 + (drift ? 12 : 10))
    const featured = card === 1
    picture.rect(x, 84, 180, drift && card === 2 ? 204 : 212, featured ? "#0a2540" : "#ffffff")
    picture.rect(x + 16, 102, 80, 12, featured ? "#ffffff" : "#0a2540")
    picture.rect(x + 16, 126, 110, 28, featured ? "#00d4ff" : "#635bff")
    for (let line = 0; line < 4; line++) picture.rect(x + 16, 172 + line * 18, 120 + ((line * 17) % 28), 8, featured ? "#adbdcc" : "#8898aa")
    picture.rect(x + 16, 252, 148, 28, drift && featured ? "#5a52f0" : "#635bff")
  }
  return picture
}

function diffOf(a, b) {
  const picture = canvas(a.width, a.height, "#ffffff")
  for (let at = 0; at < a.pixels.length; at += 3) {
    const same = a.pixels[at] === b.pixels[at] && a.pixels[at + 1] === b.pixels[at + 1] && a.pixels[at + 2] === b.pixels[at + 2]
    // Matching pixels fade to grey, differing ones go red: what mir-diff draws.
    const grey = 170 + Math.round(((a.pixels[at] + a.pixels[at + 1] + a.pixels[at + 2]) / 3) * 0.33)
    picture.pixels.set(same ? [grey, grey, grey] : [230, 40, 40], at)
  }
  return picture
}

const px = (value) => ({ $value: { value, unit: "px" } })

const TOKENS = {
  color: {
    $type: "color",
    primary: { $value: "#635bff" },
    accent: { $value: "#00d4ff" },
    ink: { $value: "#0a2540" },
    "ink-soft": { $value: "#425466" },
    muted: { $value: "#8898aa" },
    surface: { $value: "#ffffff" },
    ground: { $value: "#f6f9fc" },
    line: { $value: "#e3e8ee" },
  },
  font: {
    family: { $type: "fontFamily", sans: { $value: ["Inter", "system-ui", "sans-serif"] }, mono: { $value: ["Source Code Pro", "Menlo", "monospace"] } },
    size: { $type: "dimension", display: px(48), heading: px(28), price: px(36), body: px(16), small: px(13) },
    weight: { $type: "fontWeight", regular: { $value: 400 }, medium: { $value: 500 }, bold: { $value: 700 } },
  },
  radius: { $type: "dimension", card: px(8), button: px(999), chip: px(4) },
  spacing: { $type: "dimension", xs: px(4), sm: px(8), md: px(16), lg: px(24), xl: px(48), section: px(96) },
  shadow: {
    $type: "shadow",
    card: { $value: "0 13px 27px -5px rgba(50, 50, 93, 0.25), 0 8px 16px -8px rgba(0, 0, 0, 0.3)" },
    button: { $value: "0 2px 5px rgba(50, 50, 93, 0.2)" },
  },
}

const RESULT = {
  title: "MOCK: pricing table (no real run)",
  summary: "Seeded sample data, not a real mirror. A three-card pricing table rebuilt as a React + Tailwind component themed by design tokens.",
  chosenSelector: "section#pricing > div.plans",
  matchScore: 91.4,
  passes: 3,
  tokenCount: 29,
  fonts: ["Inter (Google Fonts)", "Source Code Pro (Google Fonts)"],
  mismatches: [
    { region: "right card", reason: "8px shorter than the original: the last feature line wraps differently." },
    { region: "featured button", reason: "Background is a shade darker; the original uses a hover-state colour at rest." },
    { region: "card gutter", reason: "Gap between cards is 12px where the original measures 10px." },
  ],
  components: ["plan-button"],
  caveats: ["This is mock data seeded by scripts/seed-mock.mjs. bundle.zip is an empty archive."],
}

// The feed needs a few events too; shaped like the OpenCode parts Axernel relays.
const at = (seconds) => new Date(Date.parse("2026-09-21T09:00:00Z") + seconds * 1000).toISOString()
const tool = (n, seconds, toolName, input) => ({
  sequence: n,
  timestamp: at(seconds),
  type: "tool.activity",
  data: { type: "message.part.updated", properties: { part: { type: "tool", tool: toolName, callID: `call_${n}`, messageID: "msg_mock", state: { status: "completed", input, output: "MIR_OK" } } } },
})
const EVENTS = [
  tool(1, 4, "read", { filePath: "/opt/mirrored/MIRRORED.md" }),
  tool(2, 12, "bash", { command: "mir-measure https://example.com/pricing /tmp/mirror/measure" }),
  tool(3, 41, "bash", { command: "mir-measure https://example.com/pricing /tmp/mirror/measure --selector 'section#pricing > div.plans'" }),
  tool(4, 66, "bash", { command: "jq '.colors[:12]' /tmp/mirror/measure/counts.json" }),
  tool(5, 95, "write", { filePath: "/tmp/mirror/tokens.json" }),
  tool(6, 140, "write", { filePath: "/tmp/mirror/component/index.html" }),
  tool(7, 171, "write", { filePath: "/tmp/mirror/component/component.css" }),
  tool(8, 188, "bash", { command: "mir-reflect /tmp/mirror/component /tmp/mirror/measure" }),
  tool(9, 230, "edit", { filePath: "/tmp/mirror/component/component.css" }),
  tool(10, 246, "bash", { command: "mir-reflect /tmp/mirror/component /tmp/mirror/measure" }),
  tool(11, 290, "bash", { command: "mir-pack /tmp/mirror /artifacts" }),
]

// --- A small shadcn registry: the index and one component ---------------------
// As the agent's packer does it, the theme rides inside the component item; there is no theme item.

const SCHEMA = "https://ui.shadcn.com/schema/registry-item.json"
const PLAN_BUTTON = `import * as React from "react"

export function PlanButton({ className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={\`rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground \${className}\`} {...props} />
}
`
const REGISTRY = {
  "r/index.json": { items: [{ name: "plan-button", type: "registry:ui" }] },
  "r/plan-button.json": {
    $schema: SCHEMA,
    name: "plan-button",
    type: "registry:ui",
    title: "MOCK plan button",
    files: [{ path: "ui/plan-button.tsx", type: "registry:ui", content: PLAN_BUTTON }],
    cssVars: { theme: { "color-primary": "#635bff", "color-primary-foreground": "#ffffff", "radius-button": "999px" } },
  },
}
const registryZip = zipOf(Object.entries(REGISTRY).map(([name, json]) => ({ name, data: Buffer.from(JSON.stringify(json, null, 2)) })))

// --- Write it ----------------------------------------------------------------

const original = pricingTable({ drift: false })
const rebuild = pricingTable({ drift: true })
// An empty zip archive is just its 22-byte end-of-central-directory record.
const emptyZip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)])

// The whole page is far taller than the section: bands of content with the pricing table part-way down.
function wholePage() {
  const picture = canvas(WIDTH, 2400, "#ffffff")
  picture.rect(0, 0, WIDTH, 56, "#0a2540").rect(40, 20, 90, 16, "#ffffff")
  picture.rect(0, 56, WIDTH, 420, "#635bff").rect(40, 160, 360, 36, "#ffffff").rect(40, 214, 280, 14, "#c9c6ff").rect(40, 270, 130, 40, "#0a2540")
  picture.pixels.set(original.pixels, 620 * WIDTH * 3)
  for (let band = 0; band < 4; band++) {
    const y = 1060 + band * 300
    picture.rect(40, y, 200, 20, "#0a2540").rect(40, y + 36, 420, 10, "#8898aa").rect(40, y + 56, 380, 10, "#8898aa").rect(40, y + 96, 560, 150, band % 2 ? "#f6f9fc" : "#e3e8ee")
  }
  return picture.rect(0, 2300, WIDTH, 100, "#0a2540")
}

const REPORT = `<!doctype html><meta charset="utf-8"><title>MOCK site report</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:40px;color:#0a2540;background:#f6f9fc}h1{font-size:40px;margin:0 0 8px}
.row{display:flex;gap:0;margin:24px 0}.row i{flex:1;height:96px}section{margin-top:40px}p{max-width:60ch}</style>
<h1>MOCK site report</h1><p>Seeded sample, not a real report. A real one describes the whole site's design system: colour roles, type, spacing, components.</p>
<div class="row"><i style="background:#635bff"></i><i style="background:#00d4ff"></i><i style="background:#0a2540"></i><i style="background:#8898aa"></i><i style="background:#e3e8ee"></i></div>
<section><h2 style="font-size:28px">Type</h2><p style="font-size:48px;margin:0">Display 48</p><p style="font-size:28px;margin:0">Heading 28</p><p>Body 16. Scripts cannot run in here.</p></section>
<script>document.body.innerHTML = "SCRIPT RAN: the sandbox is broken"</script>`

const files = {
  "report.html": Buffer.from(REPORT),
  "page.png": wholePage().png(),
  "original.png": original.png(),
  "rebuild.png": rebuild.png(),
  "diff.png": diffOf(original, rebuild).png(),
  "tokens.json": Buffer.from(JSON.stringify(TOKENS, null, 2)),
  "bundle.zip": emptyZip,
  "registry.zip": registryZip,
}
const folder = path.join(DATA_DIR, "artifacts", ID)
// A registry unpacked from an earlier seed would shadow the new zip.
rmSync(path.join(folder, "registry"), { recursive: true, force: true })
mkdirSync(folder, { recursive: true })
for (const [name, bytes] of Object.entries(files)) writeFileSync(path.join(folder, name), bytes)

const available = (name) => [name, { status: "available", artifactId: `mock-${name}` }]
db().prepare("DELETE FROM events WHERE mirror_id = ?").run(ID)
db().prepare("DELETE FROM mirrors WHERE id = ?").run(ID)
insertMirror({
  id: ID,
  url: "https://example.com/pricing",
  mode: "section",
  target: "pricing table",
  framework: "react",
  session_id: "mock-session",
  run_id: "mock-run",
  status: "completed",
  settled: 1,
  result: JSON.stringify(RESULT),
  error: null,
  usage: null,
  artifacts: JSON.stringify(Object.fromEntries(["bundle", "registry", "tokens", "report", "original", "rebuild", "diff", "page"].map(available))),
  created_at: new Date().toISOString(),
})
for (const event of EVENTS) insertEvent(ID, event.sequence, JSON.stringify(event))

console.log(`Seeded mock mirror: /m/${ID} (${Object.keys(files).length} files in ${folder})`)
