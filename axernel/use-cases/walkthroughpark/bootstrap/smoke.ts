// Proves the sandbox image works with the Axernel runtime on Modal, without GitHub access:
// an agent renders the bundled sample demo and submits the video. Usage: npm run smoke
import { artifacts } from "./agent.js"
import { authenticate, ensureAgent, ensureModelProvider, ensureProject, ensureTemplate, requireEnv } from "./shared.js"

const SMOKE_AGENT = "walkthrough-smoke"

const axernel = await authenticate()
const project = await ensureProject(axernel)
const provider = await ensureModelProvider(axernel)
const template = await ensureTemplate(axernel, requireEnv("WTP_IMAGE_REF"))

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

const agent = await ensureAgent(axernel, project.id, { name: SMOKE_AGENT, templateId: template.id, configuration })

// `npm run smoke -- <runId>` re-attaches to a run instead of starting one. Polling only:
// the SDK applies its request timeout to the whole event stream, which a first image pull outlasts.
let runId = process.argv[2]
if (!runId) {
  const session = await axernel.sessions.create(project.id, { agentId: agent.id, checkpointingEnabled: false, metadata: { axernel: { title: "WalkThroughPark smoke render" } } })
  runId = (await axernel.runs.create(session.id, { input: { data: {} } })).id
}
console.log(`run ${runId}`)

const finished = await axernel.runs.wait(runId, { timeoutMs: 25 * 60 * 1_000, pollIntervalMs: 5_000 })
console.log(`status ${finished.status}`)
console.log(JSON.stringify({ response: finished.response, error: finished.error, artifactOutputs: finished.artifactOutputs }, null, 2))
