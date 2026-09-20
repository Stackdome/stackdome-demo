// One-time, re-runnable setup of everything Mirrored needs in a local Axernel:
// account, project, model provider, sandbox template and the agent.
// Settings come from bootstrap/.env (see .env.example). Usage: npm run setup
import { writeFileSync } from "node:fs"
import { AGENT_NAME, mirrorConfiguration } from "./agent.js"
import { authenticate, baseUrl, email, ensureAgent, ensureModelProvider, ensureProject, ensureTemplate, password, requireEnv } from "./shared.js"

const axernel = await authenticate()
const project = await ensureProject(axernel)
const provider = await ensureModelProvider(axernel)
const template = await ensureTemplate(axernel, requireEnv("MIR_IMAGE_REF"))
const agent = await ensureAgent(axernel, project.id, { name: AGENT_NAME, templateId: template.id, configuration: mirrorConfiguration(provider.id) })

// What the web app reads: where Axernel is, how to log in, and which agent to run.
const config = { baseUrl, email, password, projectId: project.id, agentId: agent.id }
writeFileSync(new URL("../.mirrored.json", import.meta.url), `${JSON.stringify(config, null, 2)}\n`)
console.log(`project ${project.id}\ntemplate ${template.id}\nagent ${agent.id} revision ${agent.revision}\nwrote ../.mirrored.json`)
