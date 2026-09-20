// One-time, re-runnable setup of everything WalkThroughPark needs in a local Axernel:
// account, project, GitHub secret, model provider, sandbox template and the agent.
// Settings come from bootstrap/.env (see .env.example). Usage: npm run setup
import { writeFileSync } from "node:fs"
import { AGENT_NAME, directorConfiguration } from "./agent.js"
import {
  authenticate,
  baseUrl,
  email,
  ensureAgent,
  ensureGithubSecret,
  ensureModelProvider,
  ensureProject,
  ensureTemplate,
  githubMcpRemote,
  password,
  requireEnv,
  secretCredential,
  serverHasMcpAuthentication,
} from "./shared.js"

const githubToken = requireEnv("GITHUB_TOKEN")

const axernel = await authenticate()
const project = await ensureProject(axernel)
const provider = await ensureModelProvider(axernel)
const template = await ensureTemplate(axernel, requireEnv("WTP_IMAGE_REF"))
const secret = await ensureGithubSecret(axernel, project.id, githubToken)

const githubCredential = secretCredential(secret.id)
const githubRemote = githubMcpRemote(githubCredential, await serverHasMcpAuthentication())
const configuration = directorConfiguration(provider.id, githubCredential, githubRemote)
const agent = await ensureAgent(axernel, project.id, { name: AGENT_NAME, templateId: template.id, configuration })

// What the web app reads: where Axernel is, how to log in, and which agent to run.
const config = { baseUrl, email, password, projectId: project.id, agentId: agent.id }
writeFileSync(new URL("../.wtp.json", import.meta.url), `${JSON.stringify(config, null, 2)}\n`)
console.log(`project ${project.id}\ntemplate ${template.id}\nagent ${agent.id} revision ${agent.revision}\nwrote ../.wtp.json`)
