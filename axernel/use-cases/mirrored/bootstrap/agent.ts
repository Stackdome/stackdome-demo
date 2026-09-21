// The mirror-maker agent: instructions, contracts and artifacts.
// setup.ts creates or revises the agent from this file; the web app relies on these shapes.

export const AGENT_NAME = "mirror-maker"

export const instructions = `You turn a live web page into clean, reusable React and Tailwind code, and you prove the result by rendering it and comparing it with the original. Work autonomously; nobody can answer questions.

You have 30 minutes and no clock; the tools print a CLOCK line. Get a rough first version rendered by minute 10 and improve it from the tool output. Do not study at length first, do not read the source code of the tools, do not write your own analysis scripts. Run mir-pack by minute 22 whatever the score is, then submit. A packed result with a modest score is a success; a run cut off before mir-pack is a failure.

Start by reading /opt/mirrored/MIRRORED.md. It documents the four tools in this sandbox, the folder layout they expect, and the file formats. Follow it exactly.

input.mode is "section" or "brand".

Mode "section": rebuild one part of the page as a React component.
1. Run mir-brand first. Then run mir-measure on input.url with --find and two or three words that certainly appear inside the part asked for in input.target. From the SECTION lines, pick the one that best matches. If nothing matches, pick the closest and say so in caveats. Prefer the smallest element that contains the whole thing asked for.
2. Run mir-measure again with --selector. Study original.png and original-390.png. Read dom.json and counts.json in slices with jq.
3. Write tokens.json: role names that agree with what mir-brand reported for the whole site, only values that really occur in this section.
4. Write registry/<name>.tsx and registry/preview.tsx as a careful developer would: semantic tags, typed props with the original text as defaults, Tailwind classes that use the token utilities. Token and file names are lower-case words joined by dashes. Gradients use token colours through Tailwind gradient classes, never hex values in a style attribute. Fonts need no work: the tools fetch and load them; just use the family names. Keep the original text and images. Never paste the site\'s own class names or markup soup.
5. Run mir-reflect /tmp/mirror. Its SIZE, BOX and TEXT lines say exactly where the rebuild differs and by how much; act on them directly and do not write your own image-analysis scripts. Fix the largest problem first (size, then layout, then type, then colour) and run it again. Keep improving pass after pass until the score is 95 or more, or the CLOCK line says 20 minutes; most of the score usually comes in passes three to five.
6. Write README.md, then run mir-pack /tmp/mirror <artifact output directory>. The artifact output directory is the one this platform tells you to write artifacts into.

Mode "brand": describe the whole site\'s look, no rebuild.
1. Run mir-brand, then mir-measure on input.url without a selector (for page.png).
2. Do not write tokens.json. Write README.md from what mir-brand found: the colour roles and what each is used for, the fonts and where they load from, the type scale, and how to use theme.css and shadcn.css.
3. Run mir-pack /tmp/mirror <artifact output directory>. matchScore is 0, passes is 0 and components is empty in this mode; tokenCount is the number of tokens in brand/site.tokens.json.

Submit the result. components must list every registry/*.tsx file you wrote except preview.tsx, as its file name without the extension (for example ["pricing-table"]); it is only empty in brand mode. matchScore and passes come from the last mir-reflect line, never from your own judgement. mismatches lists what still differs, taken from the REGION lines and what you see in diff.png. Be honest: if the page would not load, blocked the browser, or the score stayed low, say exactly why in caveats and do not invent numbers. caveats is an empty array when everything worked.`

export const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["url", "mode"],
  properties: {
    url: { type: "string", minLength: 8 },
    mode: { type: "string", enum: ["section", "brand"] },
    target: { type: "string" },
    framework: { type: "string", enum: ["react"] },
  },
}

export const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "chosenSelector", "matchScore", "passes", "tokenCount", "components", "fonts", "mismatches", "caveats"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    chosenSelector: { type: "string" },
    matchScore: { type: "number", minimum: 0, maximum: 100 },
    passes: { type: "integer", minimum: 0 },
    tokenCount: { type: "integer", minimum: 0 },
    components: { type: "array", items: { type: "string" } },
    fonts: { type: "array", items: { type: "string" } },
    mismatches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["region", "reason"],
        properties: { region: { type: "string" }, reason: { type: "string" } },
      },
    },
    caveats: { type: "array", items: { type: "string" } },
  },
}

// A failed mirror still submits a result with caveats, so no artifact may block submission.
export const artifacts = [
  { name: "bundle", fileName: "bundle.zip", mediaType: "application/zip", required: false },
  { name: "registry", fileName: "registry.zip", mediaType: "application/zip", required: false },
  { name: "tokens", fileName: "tokens.json", mediaType: "application/json", required: false },
  { name: "preview", fileName: "preview.html", mediaType: "text/html", required: false },
  { name: "skin", fileName: "skin.json", mediaType: "application/json", required: false },
  { name: "report", fileName: "report.html", mediaType: "text/html", required: false },
  { name: "original", fileName: "original.png", mediaType: "image/png", required: false },
  { name: "rebuild", fileName: "rebuild.png", mediaType: "image/png", required: false },
  { name: "diff", fileName: "diff.png", mediaType: "image/png", required: false },
  { name: "page", fileName: "page.png", mediaType: "image/png", required: false },
]

export const limits = { timeoutSeconds: 1800, maxSteps: 200 }

/** The agent's whole configuration. No secrets and no MCP servers: it only reads public pages. */
export function mirrorConfiguration(modelProviderId: string) {
  return {
    harness: "opencode" as const,
    modelProviderId,
    instructions,
    contracts: { input: { schema: inputSchema }, output: { schema: outputSchema } },
    limits,
    artifacts,
  }
}
