// Runs the agent once from the command line, without the web app.
// Usage: npm run mirror -- <url> [target words...]   (no target = brand mode)
import { readFileSync } from "node:fs"
import { authenticate } from "./shared.js"

const [url, ...target] = process.argv.slice(2)
if (!url) throw new Error("usage: npm run mirror -- <url> [target words...]")
const { projectId, agentId } = JSON.parse(readFileSync(new URL("../.mirrored.json", import.meta.url), "utf8"))

const axernel = await authenticate()
const mode = target.length ? "section" : "brand"
const title = `${mode === "section" ? target.join(" ") : "Brand"} from ${new URL(url).hostname}`
const session = await axernel.sessions.create(projectId, { agentId, checkpointingEnabled: false, metadata: { axernel: { title } } })
const run = await axernel.runs.create(session.id, { input: { data: { url, mode, target: target.join(" "), framework: "html" } } })
console.log(`session ${session.id}\nrun ${run.id}\nwaiting...`)

// The event stream would hit the SDK request timeout on a run this long, so poll instead.
const finished = await axernel.runs.wait(run.id, { timeoutMs: 40 * 60_000, pollIntervalMs: 5_000 })
console.log(finished.status, JSON.stringify((finished as { response?: unknown }).response ?? finished.error, null, 2))
console.log("usage", JSON.stringify(finished.usage))
