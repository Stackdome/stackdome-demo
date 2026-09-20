// tokens.json flattened into the lists the Tokens section draws. It comes in
// two shapes, both W3C Design Tokens, and both are read into the one sheet:
//   section mode (ours, see MIRRORED.md): color.*, font.family|size|weight.*,
//     radius.*, spacing.*, shadow.*; a colour is a hex string.
//   brand mode (Dembrandt's output): color.semantic.* and color.palette.* whose
//     value is { colorSpace, components, hex }, typography["font-family"].*,
//     typography.style.* (composite text styles), spacing.*, radius.*. The file is written by an agent, so every
// shape is checked and whatever does not fit is left out, never thrown on.

export interface ColorToken {
  name: string
  hex: string
}
export interface FamilyToken {
  name: string
  stack: string[]
}
export interface SizeToken {
  name: string
  css: string
  /** The size in px, for sorting and for bar widths; null when the unit has no px meaning. */
  px: number | null
}
export interface WeightToken {
  name: string
  weight: number
}
export interface ShadowToken {
  name: string
  css: string
}
/** A composite text style; every part but the name is optional, as CSS. */
export interface TextStyleToken {
  name: string
  fontFamily: string | null
  fontSize: string | null
  fontWeight: number | null
  lineHeight: string | null
}

export interface TokenSheet {
  colors: ColorToken[]
  families: FamilyToken[]
  /** Largest first, the way a type scale is read. */
  sizes: SizeToken[]
  weights: WeightToken[]
  radii: SizeToken[]
  /** Smallest first. */
  spacing: SizeToken[]
  shadows: ShadowToken[]
  /** Brand mode only. Largest first. */
  styles: TextStyleToken[]
}

type Bag = Record<string, unknown>
const isBag = (value: unknown): value is Bag => typeof value === "object" && value !== null && !Array.isArray(value)

/** Every `$value` under a group, named by its dotted path inside the group. */
function leaves(group: unknown, path: string[] = []): { name: string; value: unknown }[] {
  if (!isBag(group)) return []
  if ("$value" in group) return [{ name: path.join("."), value: group.$value }]
  return Object.entries(group)
    .filter(([key]) => !key.startsWith("$"))
    .flatMap(([key, child]) => leaves(child, [...path, key]))
}

const PX_PER: Record<string, number> = { px: 1, rem: 16, em: 16 }

/** `{ value: 16, unit: "px" }`, and the looser `"16px"` and `16` an agent may write. */
function dimension(value: unknown): { css: string; px: number | null } | null {
  if (typeof value === "number" && Number.isFinite(value)) return { css: `${value}px`, px: value }
  if (typeof value === "string") {
    const match = /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(value.trim())
    return match ? dimension({ value: Number(match[1]), unit: match[2] || "px" }) : null
  }
  if (!isBag(value) || typeof value.value !== "number" || !Number.isFinite(value.value)) return null
  const unit = typeof value.unit === "string" && value.unit ? value.unit : "px"
  const perUnit = PX_PER[unit]
  return { css: `${value.value}${unit}`, px: perUnit === undefined ? null : value.value * perUnit }
}

function sizesOf(group: unknown): SizeToken[] {
  return leaves(group).flatMap(({ name, value }) => {
    const size = dimension(value)
    return size ? [{ name, ...size }] : []
  })
}

/** One shadow layer: a CSS string as is, or the W3C object put back together. */
function shadowLayer(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null
  if (!isBag(value)) return null
  const lengths = [value.offsetX, value.offsetY, value.blur, value.spread].map((part) => dimension(part ?? 0)?.css ?? "0px")
  const color = typeof value.color === "string" ? value.color : "currentColor"
  return `${value.inset === true ? "inset " : ""}${lengths.join(" ")} ${color}`
}

function shadowCss(value: unknown): string | null {
  const layers = (Array.isArray(value) ? value : [value]).map(shadowLayer)
  return layers.length > 0 && layers.every((layer): layer is string => layer !== null) ? layers.join(", ") : null
}

/** A hex string, or the brand shape's `{ colorSpace, components, hex }`. */
function colorHex(value: unknown): string | null {
  const hex = isBag(value) ? value.hex : value
  return typeof hex === "string" && hex.trim() ? hex.trim() : null
}

/** Semantic roles before the raw palette; within each, the file's own order. */
const colorRank = (name: string): number => (name.startsWith("semantic.") ? 0 : name.startsWith("palette.") ? 2 : 1)

function fontStack(value: unknown): string[] {
  return (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string" && item.trim() !== "")
}

function textStyle(name: string, value: unknown): TextStyleToken[] {
  if (!isBag(value)) return []
  const stack = fontStack(value.fontFamily)
  const weight = Number(value.fontWeight)
  // A bare number is a multiple of the font size; anything else is a length.
  const lineHeight = typeof value.lineHeight === "number" ? String(value.lineHeight) : (dimension(value.lineHeight)?.css ?? null)
  const style = {
    name,
    fontFamily: stack.length > 0 ? fontStackCss(stack) : null,
    fontSize: dimension(value.fontSize)?.css ?? null,
    fontWeight: Number.isFinite(weight) && weight > 0 ? weight : null,
    lineHeight,
  }
  return style.fontFamily || style.fontSize || style.fontWeight ? [style] : []
}

const stylePx = (style: TextStyleToken): number => (style.fontSize ? (dimension(style.fontSize)?.px ?? 0) : 0)

const bySize = (direction: 1 | -1) => (a: SizeToken, b: SizeToken) => direction * ((a.px ?? 0) - (b.px ?? 0))

export function flattenTokens(tokens: unknown): TokenSheet {
  const root = isBag(tokens) ? tokens : {}
  const font = isBag(root.font) ? root.font : {}
  const typography = isBag(root.typography) ? root.typography : {}
  return {
    colors: leaves(root.color)
      .flatMap(({ name, value }) => {
        const hex = colorHex(value)
        return hex ? [{ name, hex }] : []
      })
      // Array.prototype.sort is stable, so equal ranks keep the file's order.
      .sort((a, b) => colorRank(a.name) - colorRank(b.name)),
    families: [...leaves(font.family), ...leaves(typography["font-family"])].flatMap(({ name, value }) => {
      const stack = fontStack(value)
      return stack.length > 0 ? [{ name, stack }] : []
    }),
    sizes: sizesOf(font.size).sort(bySize(-1)),
    weights: leaves(font.weight).flatMap(({ name, value }) => {
      const weight = Number(value)
      return Number.isFinite(weight) && weight > 0 ? [{ name, weight }] : []
    }),
    radii: sizesOf(root.radius).sort(bySize(1)),
    spacing: sizesOf(root.spacing).sort(bySize(1)),
    shadows: leaves(root.shadow).flatMap(({ name, value }) => {
      const css = shadowCss(value)
      return css ? [{ name, css }] : []
    }),
    styles: leaves(typography.style)
      .flatMap(({ name, value }) => textStyle(name, value))
      .sort((a, b) => stylePx(b) - stylePx(a)),
  }
}

export const tokenTotal = (sheet: TokenSheet): number => Object.values(sheet).reduce((sum, list) => sum + list.length, 0)

/** `color` + `primary` -> `--color-primary`, the variable name mir-pack writes into tokens.css. */
export const cssVariable = (group: string, name: string): string => `--${[group, ...name.split(".")].join("-")}`

/** A font stack as CSS: names with spaces are quoted, generic keywords never are. */
export function fontStackCss(stack: readonly string[]): string {
  return stack.map((name) => (/^[a-z-]+$/i.test(name) ? name : `"${name.replace(/["\\]/g, "")}"`)).join(", ")
}
