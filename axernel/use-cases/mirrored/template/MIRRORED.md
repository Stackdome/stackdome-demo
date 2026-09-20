# Mirrored toolkit

Three commands are on PATH. Each prints `MIR_OK ...` or `MIR_ERROR: <reason>` as its last line.
Work in `/tmp/mirror`. Use this layout exactly; `mir-pack` depends on it.

```
/tmp/mirror/
  measure/          written by mir-measure (and rebuild.png, diff.png by mir-reflect)
  component/        you write: index.html, component.css, optional component.tsx / component.vue
  tokens.json       you write
  README.md         you write: five lines on how to use the bundle
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
- LOOK at `original.png` with your image-reading tool before writing anything.

## 2. tokens.json (W3C Design Tokens format)

Top-level groups, exactly these names: `color`, `font` (with `family`, `size`, `weight`), `radius`, `spacing`, `shadow`.
Name tokens by role, not by value: `color.primary`, `color.ink`, `color.surface`, `radius.pill`.
Only values that appear in `counts.json`. Colours as hex strings; dimensions as `{ "value": 16, "unit": "px" }`.

```json
{
  "color": { "$type": "color", "primary": { "$value": "#635bff" }, "ink": { "$value": "#0a2540" } },
  "font": { "family": { "$type": "fontFamily", "sans": { "$value": ["Inter", "system-ui", "sans-serif"] } },
            "size": { "$type": "dimension", "body": { "$value": { "value": 16, "unit": "px" } } } },
  "radius": { "$type": "dimension", "pill": { "$value": { "value": 999, "unit": "px" } } }
}
```

CSS variable names come from the path: `color.primary` becomes `--color-primary`, `font.size.body` becomes `--font-size-body`.

## 3. component/

- `index.html`: a complete page. `<link>` `../tokens.css` then `component.css`. Exactly one element carries
  the attribute `data-mirror-root`; that element is what gets compared. Give `body` margin 0 and the
  original's page background.
- `component.css`: class names you would write by hand. Every colour, font, radius and shadow through
  `var(--...)`. No inline styles, no copied class soup, no framework.
- Images: reference `../measure/assets/<file>` . Inline SVG icons from `dom.json` as they are.
- Fonts: if `fonts.json` names a web font with a public URL, load it with `@font-face` or a Google Fonts
  link. If not, use the closest system font and say so in caveats.
- Must work at 1280 and at 390 wide. Look at `original-390.png` and write the media query.

Run `mir-pack /tmp/mirror /tmp/mirror/out-check` once before the first reflect, so `tokens.css` exists.

## 4. mir-reflect /tmp/mirror/component /tmp/mirror/measure

Renders your `index.html`, saves `rebuild.png` and `diff.png`, prints a score per width, up to three
`REGION <where> <n>% different` lines, and `WARNING` lines for anything that failed to load.
Look at `diff.png` (red = wrong) and `rebuild.png` next to `original.png`, fix the biggest region, run again.
A `SIZE` mismatch is the first thing to fix: wrong height or width costs more than any colour.

## 5. mir-pack /tmp/mirror <artifact output directory>

Regenerates `tokens.css` and `tailwind.config.js`, writes `bundle.zip`, and copies `tokens.json`,
`original.png`, `rebuild.png`, `diff.png` (or `page.png`) into the artifact directory.
