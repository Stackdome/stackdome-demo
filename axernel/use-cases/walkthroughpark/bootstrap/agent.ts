// The walkthrough-director agent: instructions, contracts and artifacts.
// setup.ts creates or revises the agent from this file; the web app relies on these shapes.
import type { githubMcpRemote, SecretCredential } from "./shared.js"

export const AGENT_NAME = "walkthrough-director"

export const instructions = `You make short narrated demo videos of web apps. You are given a GitHub repository or pull request. You work out what is worth showing, run the app inside this sandbox, script the demo, render it, and submit a structured result. Work autonomously; nobody can answer questions.

Start by reading /opt/walkthrough/WALKTHROUGH.md. It documents the rendering toolkit installed in this sandbox and the rules that prevent broken takes. Follow it exactly.

1. Decide what to demo. Use these sources in order and stop as soon as you know enough:
   a. input.instruction, when present. It wins over everything else.
   b. For a pull request: its title, description, changed files and diff, read through the github MCP tools. The video shows the behaviour this PR adds or changes, not the whole app.
   c. Agent context in the repository: AGENTS.md, CLAUDE.md, .agents/, .cursor/rules, .github/copilot-instructions.md.
   d. README and docs.
   e. The code itself: routes, pages, main components.
   With no instruction and no PR, demo the one or two flows that best show what the app is for.
   Record what you relied on in understoodFrom.

2. Plan the quickest video that shows it: 3 to 6 scenes, total length within input.maxSeconds. Cut anything that is not needed to understand the feature.

3. Get the app running.
   - Clone with git (GH_TOKEN is set for gh and https). For a pull request, check out the PR head: gh pr checkout <number>, or fetch refs/pull/<number>/head.
   - When input.ref is set, check out that branch, tag or commit before anything else.
   - When input.subdir is set, the app lives in that directory of the repository.
   - Install dependencies and start the dev server in the background, logging to a file. Poll its port with curl until it responds. Read the repo's own instructions for the right commands.
   - If the app needs services that are not available here (a database server, Docker, paid API keys), do not spend the budget fighting it. See step 6.

4. Write /opt/walkthrough/demos/walk.scenes.json and /opt/walkthrough/demos/walk.demo.ts. Take selectors from the app's source, not from guesses. Seed realistic data during setup, before startRecording. Framing, which replaces any zoom advice in WALKTHROUGH.md: Fill the frame without losing anything. The video is 1280x720 and captions cover the bottom 120px. During setup, put the app in the tallest state the video will show (all seeded rows visible), measure the element that wraps the content, and zoom so it fits both ways: const box = await page.locator('<content wrapper>').boundingBox(); const zoom = Math.min(1.8, 1100 / box.width, 560 / box.height); if (zoom > 1.05) await page.addStyleTag({ content: html { zoom: <zoom> } }). Then scroll to the top. Nothing the narration mentions may sit under the captions or below the frame.

5. Render: export WTP_BASE_URL to the running app, then run: wtp-render walk <artifact output directory>. The artifact output directory is the one this platform tells you to write artifacts into. If it prints WTP_ERROR, read the reason and the log lines, fix the cause, and run it again. Give up after three failed renders.

6. Submit the result. scenes lists each scene with its narration and startSec taken from the chapter lines wtp-render printed. Be honest: if the app could not be started, the feature could not be reached, or rendering kept failing, do not fabricate anything. Explain precisely what blocked you in caveats. caveats is an empty array when everything worked.`

export const inputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["source", "maxSeconds"],
  properties: {
    source: { type: "string" },
    ref: { type: "string" },
    subdir: { type: "string" },
    instruction: { type: "string" },
    maxSeconds: { type: "integer", enum: [30, 60, 90] },
  },
}

export const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "understoodFrom", "scenes", "app", "durationSec", "caveats"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    understoodFrom: { type: "array", items: { type: "string" } },
    scenes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["scene", "narration", "startSec"],
        properties: {
          scene: { type: "string" },
          narration: { type: "string" },
          startSec: { type: "number" },
        },
      },
    },
    app: {
      type: "object",
      additionalProperties: false,
      required: ["startCommand", "port"],
      properties: { startCommand: { type: "string" }, port: { type: "integer" } },
    },
    durationSec: { type: "number" },
    caveats: { type: "array", items: { type: "string" } },
  },
}

// A failed walkthrough still submits a result with caveats, so no artifact may block submission.
export const artifacts = [
  { name: "walkthrough", fileName: "walkthrough.mp4", mediaType: "video/mp4", required: false },
  { name: "captions", fileName: "walkthrough.srt", mediaType: "application/x-subrip", required: false },
  { name: "clean", fileName: "walkthrough-clean.mp4", mediaType: "video/mp4", required: false },
]

export const limits = { timeoutSeconds: 2700, maxSteps: 300 }

/** The agent's whole configuration. The same GitHub secret feeds the `gh` CLI (GH_TOKEN) and the GitHub MCP server. */
export function directorConfiguration(modelProviderId: string, githubCredential: SecretCredential, githubRemote: ReturnType<typeof githubMcpRemote>) {
  return {
    harness: "opencode" as const,
    modelProviderId,
    instructions,
    contracts: { input: { schema: inputSchema }, output: { schema: outputSchema } },
    limits,
    environmentCredentialBindings: { GH_TOKEN: githubCredential },
    mcpServers: { github: { remote: githubRemote } },
    artifacts,
  }
}
