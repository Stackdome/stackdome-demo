// One-time, re-runnable setup of everything WalkThroughPark needs in a local Axernel:
// account, project, GitHub secret, model provider, sandbox template and the agent.
// Settings come from bootstrap/.env (see .env.example). Usage: npm run setup
import { writeFileSync } from "node:fs"
import { AGENT_NAME, artifacts, inputSchema, instructions, limits, outputSchema } from "./agent.js"
import { authenticate, baseUrl, email, ensureModelProvider, ensureProject, ensureTemplate, find, password, requireEnv } from "./shared.js"

const githubToken = requireEnv("GITHUB_TOKEN")

const axernel = await authenticate()
const project = await ensureProject(axernel)
const provider = await ensureModelProvider(axernel)
const template = await ensureTemplate(axernel)

const secretRequest = { name: "github", description: "Read-only GitHub token", data: { token: githubToken } }
const existingSecret = await find(axernel.secrets.iterate(project.id), (candidate) => candidate.name === "github")
const secret = existingSecret
  ? await axernel.secrets.update(project.id, existingSecret.id, { data: secretRequest.data })
  : await axernel.secrets.create(project.id, secretRequest)

const githubCredential = { secret: { secretId: secret.id, key: "token" } }
const configuration = {
  harness: "opencode" as const,
  modelProviderId: provider.id,
  instructions,
  contracts: { input: { schema: inputSchema }, output: { schema: outputSchema } },
  limits,
  environmentCredentialBindings: { GH_TOKEN: githubCredential },
  mcpServers: {
    github: {
      remote: {
        url: "https://api.githubcopilot.com/mcp/",
        authentication: { type: "bearer" as const, credential: githubCredential },
      },
    },
  },
  artifacts,
}

const existingAgent = await find(axernel.agents.iterate(project.id), (candidate) => candidate.name === AGENT_NAME)
const agent = existingAgent
  ? await axernel.agents.update(
      project.id,
      existingAgent.id,
      { templateId: template.id, configuration },
      { expectedRevision: existingAgent.revision },
    )
  : await axernel.agents.create(project.id, { name: AGENT_NAME, templateId: template.id, configuration })

const config = { baseUrl, email, password, projectId: project.id, agentId: agent.id }
writeFileSync(new URL("../.wtp.json", import.meta.url), `${JSON.stringify(config, null, 2)}\n`)
console.log(`project ${project.id}\ntemplate ${template.id}\nagent ${agent.id} revision ${agent.revision}\nwrote ../.wtp.json`)
