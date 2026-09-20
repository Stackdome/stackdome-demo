# Mirrored toolkit

Three commands are on PATH. Each prints `MIR_OK ...` or `MIR_ERROR: <reason>` as its last line.
Work in `/tmp/mirror`. Use this layout exactly; the tools depend on it.

```
/tmp/mirror/
  measure/                 written by mir-measure (and rebuild.png, diff.png by mir-reflect)
  tokens.json              you write
  registry/<name>.tsx      you write: the React component, kebab-case file name (pricing-table.tsx)
  registry/preview.tsx     you write: renders the component with the original's content
  README.md                you write: five lines on how to use it
```

## 1. mir-measure <url> /tmp/mirror/measure [--selector <css>]

- Without `--selector`: saves `page.png`, and prints one `SECTION <selector> [WxH at y=] <text>` line per
  candidate section. Pick the one that matches the request.
- With `--selector`: saves `original.png` (1280 wide) and `original-390.png`, and writes
  - `dom.json`: the element tree with box sizes and the computed styles that matter
  - `counts.json`: colours, backgrounds, font families, sizes, weights, radii, shadows, spacing, by use count
  - `fonts.json`: fonts the page loaded and its @font-face sources
  - `assets.json` and `assets/`: images inside the element, plus favicon and share image
- The files are large. Read them with `jq` in slices (for example `jq '.children[0]' dom.json`), never whole.
- If you can view images, look at `original.png`. If you cannot, inspect it with Pillow (size, colours at
  points, bounding boxes of non-background pixels) rather than guessing.

## 2. tokens.json (W3C Design Tokens format)

Only these groups: `color`, `font.family`, `font.size`, `font.weight`, `radius`, `spacing`, `shadow`.
Name tokens by role, not by value. Only values that appear in `counts.json` or `dom.json`.
Colours as hex strings; dimensions as `{ "value": 16, "unit": "px" }`.

```json
{
  "color": { "$type": "color", "primary": { "$value": "#635bff" }, "ink": { "$value": "#0a2540" } },
  "font": { "family": { "$type": "fontFamily", "sans": { "$value": ["Inter", "system-ui", "sans-serif"] } },
            "size": { "$type": "dimension", "body": { "$value": { "value": 16, "unit": "px" } } },
            "weight": { "$type": "fontWeight", "bold": { "$value": 700 } } },
  "radius": { "$type": "dimension", "pill": { "$value": { "value": 999, "unit": "px" } } }
}
```

Each token becomes a Tailwind v4 theme variable, and so a utility class:

| token | variable | classes you can use |
|---|---|---|
| `color.primary` | `--color-primary` | `bg-primary text-primary border-primary` |
| `font.family.sans` | `--font-sans` | `font-sans` |
| `font.size.body` | `--text-body` | `text-body` |
| `font.weight.bold` | `--font-weight-bold` | `font-bold` |
| `radius.pill` | `--radius-pill` | `rounded-pill` |
| `spacing.gutter` | `--spacing-gutter` | `p-gutter gap-gutter mt-gutter` |
| `shadow.card` | `--shadow-card` | `shadow-card` |

## 3. registry/<name>.tsx and registry/preview.tsx

- React function component, TypeScript, Tailwind classes, named export, typed props with the original's
  text and links as defaults so it renders correctly with no props. No `"use client"`, no hooks, no state,
  no other imports than `react` types: it must render on the server.
- Design values come from the tokens through their utility classes (`bg-primary`, `text-body`). Tailwind's
  own scale (`flex`, `px-6`, `gap-4`, `h-60`) is fine for layout. Arbitrary values (`h-[240px]`) only when
  nothing else fits. No inline `style` except for a background image URL.
- Responsive with Tailwind breakpoints; check against `original-390.png`.
- Images: take paths as props; in `preview.tsx` pass `../measure/assets/<file>`. Inline SVG icons from
  `dom.json` as JSX.
- Web fonts: if `fonts.json` gives a public URL, say how to load it in README.md; the preview may add a
  `<link>` or `<style>` with `@font-face`. Otherwise use the closest system font and say so in caveats.
- `preview.tsx` default-exports a component that returns the rebuilt component inside a wrapper carrying
  the attribute `data-mirror-root`, laid out as on the original page (usually `<div data-mirror-root>`
  with nothing else). That wrapper is what gets compared.

## 4. mir-reflect /tmp/mirror

Builds the theme from `tokens.json`, renders `preview.tsx` to static HTML, compiles Tailwind, saves
`rebuild.png` and `diff.png`, prints a score per width, up to three `REGION <where> <n>% different`
lines, and `WARNING` lines for anything that failed to load. A TypeScript or Tailwind error comes back
as `MIR_ERROR` with the message. Fix the largest region first and run again.
A `SIZE` mismatch is the first thing to fix: wrong height or width costs more than any colour.

## 5. mir-pack /tmp/mirror <artifact output directory>

Writes `tokens.css`, `theme.css` (Tailwind `@theme`), `theme.js` (`applyTheme()` for swapping looks at
runtime), builds `registry.zip` (shadcn registry items, one per component file) and `bundle.zip`, and
copies `tokens.json` and the screenshots into the artifact directory.
