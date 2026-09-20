# Mirrored: design

Paste a URL, get clean front-end code and design tokens from it, with proof that the rebuild
looks like the original. Inspired by MiroMiro; the difference is the proof.

## Phases

- **A, section mirror (built first).** URL + the part you want ("pricing table") + optional
  framework. Out: framework-free HTML and CSS, W3C design tokens, a match score, and
  original / rebuild / diff images.
- **B, brand kit.** Same app, `mode: "brand"`. Tokens for the whole page, fonts, no rebuild.
  A rendered style-guide PDF is planned, not built.
- Out of scope: whole-page conversion, pages behind a login, JavaScript behaviour, drift checks.

## Flow

1. **Look**: `mir-measure <url>` screenshots the page and lists candidate sections.
2. **Measure**: `mir-measure --selector` screenshots the element at 1280 and 390 wide and dumps
   its DOM with computed styles, value counts, fonts and images. No model involved.
3. **Name**: the model turns value counts into role-named tokens (`tokens.json`).
4. **Rebuild**: the model writes `component/index.html` and `component.css` using only
   `var(--...)` for design values.
5. **Reflect**: `mir-reflect` renders the rebuild in the same browser and scores it against the
   original. The model fixes the worst region and repeats, at most four passes.
6. **Pack**: `mir-pack` generates `tokens.css` and `tailwind.config.js`, zips the bundle and
   fills the artifact directory.

The score counts only pixels that carry content in either image, so empty background cannot
inflate it. Desktop weighs 70%, phone width 30%. The agent reports the tool's number, never its own.

## Output, chosen to import anywhere

`tokens.json` in the W3C Design Tokens format is the canonical output; `tokens.css` and
`tailwind.config.js` are generated from it. The component is plain HTML and CSS first, because
that is the only form every project can use. React or Vue files are adapters written after the
score is settled.

## On Axernel

- Project `Mirror`, agent `mirror-maker`, no secrets and no MCP servers: it reads public pages only.
- Model provider is the organisation's existing OpenRouter DeepSeek flash provider, reused.
- Sandbox image `akshaysasidrn/mirrored-sandbox`: the WalkThroughPark image (browser, Node,
  Pillow) plus four small scripts. Axernel's own default image has Playwright too, but it is
  not published to a registry, so Modal cannot pull it.
- Same split as before: tool mechanics in the image, guidance in `bootstrap/agent.ts`.

## Known limits

- Web fonts without a public URL fall back to a system font and cost score.
- Sites that block headless browsers fail; the agent says so in `caveats`.
- For reference and for your own sites. Logos and brand assets stay their owner's.
