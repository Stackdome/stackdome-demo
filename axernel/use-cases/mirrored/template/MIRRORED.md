# Mirrored toolkit

Four commands are on PATH. Each prints `MIR_OK ...` or `MIR_ERROR: <reason>` as its last line.
Work in `/tmp/mirror`. Use this layout exactly; the tools depend on it.

```
/tmp/mirror/
  brand/                   written by mir-brand
  measure/                 written by mir-measure (and rebuild.png, diff.png by mir-reflect)
  tokens.json              you write
  registry/<name>.tsx      you write: the React component, kebab-case file name (pricing-table.tsx)
  registry/preview.tsx     you write: renders the component with the original's content
  README.md                you write: five lines on how to use it
```

## 0. mir-brand <url> /tmp/mirror

Measures the whole page's design system with Dembrandt and prints its semantic colours, font families,
text styles, components seen and breakpoints. Files land in `brand/`: `site.json`, `site.tokens.json`,
`theme.css`, `shadcn.css`, `report.html`. Run it first, in both modes. In section mode it tells you the
site-wide role of each value, so your token names (`primary`, `background`, `text`) agree with the rest
of the site; read more with `jq` from `brand/site.json` (for example `.components.links`, `.motion`,
`.breakpoints`). If it fails, carry on without it and say so in caveats.

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
- Token names are lower-case words joined by dashes (`hero-from`, not `heroFrom`), and so are file names.
- Gradients use token colours too: `bg-linear-to-b from-hero-from to-hero-to`, never hex values in a `style`.
- Responsive with Tailwind breakpoints; check against `original-390.png`.
- Images: take paths as props; in `preview.tsx` pass `../measure/assets/<file>`. Inline SVG icons from
  `dom.json` as JSX.
- Font files are licensed. The preview may load them so the score is fair, but never copy them into `registry/`;
  `mir-pack` leaves font files out of the bundle. Name the fonts and where to get them in README.md.
- Web fonts: if `fonts.json` gives a public URL, say how to load it in README.md; the preview may add a
  `<link>` or `<style>` with `@font-face`. Otherwise use the closest system font and say so in caveats.
- `preview.tsx` default-exports a component that returns the rebuilt component inside a wrapper carrying
  the attribute `data-mirror-root`, laid out as on the original page (usually `<div data-mirror-root>`
  with nothing else). That wrapper is what gets compared.

## 4. mir-reflect /tmp/mirror

Builds the theme from `tokens.json`, renders `preview.tsx` to static HTML, compiles Tailwind, saves
`rebuild.png` and `diff.png`, and prints, per width:
- `SCORE` and `SIZE original=WxH rebuild=WxH`
- `BOX x= y= w= h=: N px differ, average colour original #.. rebuild #..`: the largest mismatched areas, exactly
- `TEXT "<words>" at x= y=: dy +6px, size 15px should be 16px`: each text that sits or is set differently,
  `MISSING` / `EXTRA` for text only one side has
- `REGION <where> <n>% different` and `WARNING` lines for anything that failed to load
These lines already say where and what; do not write your own image-analysis scripts. A TypeScript or Tailwind error comes back
as `MIR_ERROR` with the message. Fix the largest region first and run again.
A `SIZE` mismatch is the first thing to fix: wrong height or width costs more than any colour.

## 5. mir-pack /tmp/mirror <artifact output directory>

Writes `tokens.css`, `theme.css` (Tailwind `@theme`), `theme.js` (`applyTheme()` for swapping looks at
runtime), builds `registry.zip` (shadcn registry items, one per component file) and `bundle.zip`, and
copies `tokens.json`, `report.html` and the screenshots into the artifact directory.
In brand mode (no `tokens.json` written by you) it packs what `mir-brand` measured instead.
