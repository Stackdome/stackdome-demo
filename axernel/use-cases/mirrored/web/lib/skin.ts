// skin.json -> the app's own CSS custom properties, for the "Wear it" button.
// skin.json is written by an agent from someone else's page, so nothing in it
// is trusted: every value is checked here, and a slot whose value fails keeps
// the Bauhaus look. Calculations only; applying the result is the browser's job.

export interface Skin {
  background?: unknown
  text?: unknown
  primary?: unknown
  accents?: unknown
  fontFamily?: unknown
  radius?: unknown
}

/** The custom properties a skin may set, and nothing else. */
export const SKIN_VARS = ["--ground", "--ink", "--red", "--blue", "--yellow", "--navy", "--on-navy", "--on-blue", "--font", "--pill"] as const
export type SkinVar = (typeof SKIN_VARS)[number]
export type SkinVars = Partial<Record<SkinVar, string>>

const OUR_GROUND = "#f2eee6"
const OUR_INK = "#1b1a17"
const MIN_CONTRAST = 4.5

/** The light Bauhaus set, colour slots only. A worn skin is laid over THIS, never
 *  over whatever theme is showing: see `wornVars`. */
export const BAUHAUS_LIGHT = {
  "--ground": OUR_GROUND,
  "--ink": OUR_INK,
  "--red": "#f26b43",
  "--blue": "#2b5ce6",
  "--yellow": "#f7cb45",
  "--navy": "#232a4d",
  "--on-navy": OUR_GROUND,
  "--on-blue": "#ffffff",
} as const satisfies SkinVars

/** `#rgb` or `#rrggbb`, as lower-case `#rrggbb`; anything else is null. */
export function validHex(value: unknown): string | null {
  if (typeof value !== "string") return null
  const hex = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(hex)) return hex
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(hex)
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : null
}

/** WCAG relative luminance of a valid `#rrggbb`. */
function luminance(hex: string): number {
  const channel = (at: number): number => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** WCAG contrast ratio of two valid `#rrggbb` colours, from 1 to 21. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (light + 0.05) / (dark + 0.05)
}

// Letters, digits, spaces, commas, quotes, hyphens: enough for any font stack, nothing that can end a declaration.
const FONT_STACK = /^[A-Za-z0-9 ,'"-]{1,200}$/

export function validFontFamily(value: unknown): string | null {
  if (typeof value !== "string") return null
  const stack = value.trim()
  return FONT_STACK.test(stack) && /[A-Za-z]/.test(stack) ? stack : null
}

/** A corner radius as `Npx`, from a number or a px/rem string, capped where a pill already looks like a pill. */
export function validRadius(value: unknown): string | null {
  const match = typeof value === "number" ? [String(value), String(value), "px"] : typeof value === "string" ? /^(\d{1,4}(?:\.\d{1,3})?)(px|rem)?$/.exec(value.trim()) : null
  if (!match) return null
  const px = Number(match[1]) * (match[2] === "rem" ? 16 : 1)
  return Number.isFinite(px) && px >= 0 ? `${Math.min(Math.round(px * 100) / 100, 999)}px` : null
}

/** The mapping. A slot that is missing, invalid or unreadable is left out, and the app keeps its own value there. */
export function skinVars(skin: unknown): SkinVars {
  const source = (typeof skin === "object" && skin !== null ? skin : {}) as Skin
  const vars: SkinVars = {}

  // Ground and ink go together or not at all: one without the other could be unreadable.
  const background = validHex(source.background)
  const text = validHex(source.text)
  const readable = background !== null && text !== null && contrast(background, text) >= MIN_CONTRAST
  if (readable) {
    vars["--ground"] = background
    vars["--ink"] = text
  }
  const ground = readable ? background : OUR_GROUND

  const accents = (Array.isArray(source.accents) ? source.accents : []).map(validHex).filter((hex): hex is string => hex !== null)
  const primary = validHex(source.primary)
  // Our three primaries are large flat fields, so they take the site's colours in order.
  const fields = [primary, ...accents].filter((hex): hex is string => hex !== null)
  if (fields[0]) vars["--red"] = fields[0]
  if (fields[1]) vars["--blue"] = fields[1]
  if (fields[2]) vars["--yellow"] = fields[2]

  // The panel colour carries ground-coloured text, so it is whichever of the
  // site's colours stands furthest from the ground, if that is far enough.
  const ink = readable ? text : OUR_INK
  const panel = [ink, ...accents, ...(primary ? [primary] : [])].sort((a, b) => contrast(b, ground) - contrast(a, ground))[0]
  if (panel && contrast(panel, ground) >= MIN_CONTRAST && (readable || panel !== OUR_INK)) {
    vars["--navy"] = panel
    vars["--on-navy"] = ground
  }

  // Small text sits on the blue field too: black or white, whichever reads better on it.
  if (vars["--blue"]) vars["--on-blue"] = contrast(vars["--blue"], "#ffffff") >= contrast(vars["--blue"], OUR_INK) ? "#ffffff" : OUR_INK

  const font = validFontFamily(source.fontFamily)
  // Our own face stays as the fallback: the site's font is usually not loaded here.
  if (font) vars["--font"] = `${font}, var(--font-jost), sans-serif`

  const radius = validRadius(source.radius)
  if (radius) vars["--pill"] = radius
  return vars
}

/** Which variables win while a skin is worn: the skin's, over the light Bauhaus
 *  set, over the theme. Every colour slot is filled, so nothing of a dark theme
 *  shows through a skin that was checked against light defaults; taking the skin
 *  off removes them all and the chosen theme is back. Font and radius are not
 *  the theme's business, so they are only set when the skin brings them. */
export function wornVars(skin: unknown): SkinVars {
  return { ...BAUHAUS_LIGHT, ...skinVars(skin) }
}

const FONT_VALUE = /^[A-Za-z0-9 ,'"-]{1,200}, var\(--font-jost\), sans-serif$/
const RADIUS_VALUE = /^\d{1,3}(\.\d{1,2})?px$/

/** Vars as they may be set on the document: only known names, only values of
 *  the shape `skinVars` produces. What comes back from localStorage goes through this again. */
export function safeSkinVars(vars: unknown): SkinVars {
  const source = (typeof vars === "object" && vars !== null ? vars : {}) as Record<string, unknown>
  const safe: SkinVars = {}
  for (const name of SKIN_VARS) {
    const value = source[name]
    if (typeof value !== "string") continue
    const ok = name === "--font" ? FONT_VALUE.test(value) : name === "--pill" ? RADIUS_VALUE.test(value) : validHex(value) === value
    if (ok) safe[name] = value
  }
  return safe
}
