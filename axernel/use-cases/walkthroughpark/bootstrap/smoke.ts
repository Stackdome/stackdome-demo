// Proves the sandbox image works with the Axernel runtime on Modal, without GitHub access:
// an agent renders the bundled sample demo and submits the video. Usage: npm run smoke
import { artifacts } from "./agent.js"
import { authenticate, ensureModelProvider, ensureProject, ensureTemplate, find } from "./shared.js"

const SMOKE_AGENT = "walkthrough-smoke"

const axernel = await authenticate()
const project = await ensureProject(axernel)
const provider = await ensureModelProvider(axernel)
const template = await ensureTemplate(axernel)

const configuration = {
  harness: "opencode" as const,
  modelProviderId: provider.id,
  instructions:
    "Run exactly: wtp-render sample <artifact output directory>, where the directory is the one this platform tells you to write artifacts into. Do not change any files. Submit ok=true when the last output line starts with WTP_OK, otherwise ok=false. Put the last 20 lines of output in log.",
  contracts: {
    input: { schema: { type: "object", additionalProperties: false, properties: {} } },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["ok", "log"],
        properties: { ok: { type: "boolean" }, log: { type: "string" } },
      },
    },
  },
  limits: { timeoutSeconds: 900, maxSteps: 30 },
  artifacts,
}

const existing = await find(axernel.agents.iterate(project.id), (candidate) => candidate.name === SMOKE_AGENT)
const agent = existing
  ? await axernel.agents.update(project.id, existing.id, { templateId: template.id, configuration }, { expectedRevision: existing.revision })
  : await axernel.agents.create(project.id, { name: SMOKE_AGENT, templateId: template.id, configuration })

const session = await axernel.sessions.create(project.id, { agentId: agent.id, checkpointingEnabled: false })
const run = await axernel.runs.create(session.id, { input: { data: {} } })
console.log(`run ${run.id}`)

for await (const event of axernel.runs.events(run.id)) {
  if (event.type === "run.status" || event.type === "stream.error") console.log(event.type, JSON.stringify(event.data).slice(0, 300))
  else process.stdout.write(".")
}

const finished = await axernel.runs.wait(run.id, { timeoutMs: 20 * 60 * 1_000 })
console.log(`\nstatus ${finished.status}`)
console.log(JSON.stringify({ response: finished.response, error: finished.error, artifactOutputs: finished.artifactOutputs }, null, 2))
await axernel.sessions.close(project.id, session.id)
