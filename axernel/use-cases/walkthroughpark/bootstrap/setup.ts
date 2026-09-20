// One-time, re-runnable setup of everything WalkThroughPark needs in a local Axernel:
// account, project, GitHub secret, model provider, sandbox template and the agent.
// Usage: GITHUB_TOKEN=... OPENROUTER_API_KEY=... WTP_IMAGE_REF=user/image@sha256:... npx tsx setup.ts
import { writeFileSync } from "node:fs"
import { Axernel } from "@axernel/sdk"
import { AGENT_NAME, artifacts, inputSchema, instructions, limits, outputSchema } from "./agent.js"

const baseUrl = process.env.AXERNEL_BASE_URL ?? "http://127.0.0.1:8000"
const email = process.env.WTP_EMAIL ?? "developer@axernel.com"
const password = process.env.WTP_PASSWORD ?? "password"
const projectName = "HappyWalkthrough"
const model = process.env.WTP_MODEL ?? "anthropic/claude-sonnet-4.5"

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}
const githubToken = requireEnv("GITHUB_TOKEN")
const openRouterKey = requireEnv("OPENROUTER_API_KEY")
const imageRef = requireEnv("WTP_IMAGE_REF")

async function find<T extends { name: string }>(items: AsyncIterable<T>, matches: (item: T) => boolean) {
  for await (const item of items) if (matches(item)) return item
  return undefined
}

async function authenticate() {
  const anonymous = new Axernel({ baseUrl })
  const credentials = { email, password }
  const auth = await anonymous.auth
    .login(credentials)
    .catch(() => anonymous.auth.signup({ name: "Developer", ...credentials, org: { name: "WalkThroughPark" } }))
  return new Axernel({ baseUrl, apiKey: auth.token })
}

// OpenRouter lists per-token prices; Axernel wants USD per million tokens.
async function openRouterPricing() {
  const response = await fetch("https://openrouter.ai/api/v1/models")
  const { data } = (await response.json()) as { data: { id: string; pricing: Record<string, string> }[] }
  const entry = data.find((candidate) => candidate.id === model)
  if (!entry) {
    const similar = data.map((candidate) => candidate.id).filter((id) => id.startsWith(model.split("/")[0]))
    throw new Error(`OpenRouter has no model "${model}". Set WTP_MODEL to one of: ${similar.join(", ")}`)
  }
  const perMillion = (price?: string) => Number(price ?? 0) * 1_000_000
  return {
    inputUsdPerMillion: perMillion(entry.pricing.prompt),
    outputUsdPerMillion: perMillion(entry.pricing.completion),
    reasoningUsdPerMillion: perMillion(entry.pricing.internal_reasoning ?? entry.pricing.completion),
    cacheReadUsdPerMillion: perMillion(entry.pricing.input_cache_read),
    cacheWriteUsdPerMillion: perMillion(entry.pricing.input_cache_write),
  }
}

const axernel = await authenticate()

const project =
  (await find(axernel.projects.iterate(), (candidate) => candidate.name === projectName)) ??
  (await axernel.projects.create({ name: projectName, description: "WalkThroughPark demo videos" }))

const secretData = { name: "github", description: "Read-only GitHub token", data: { token: githubToken } }
const existingSecret = await find(axernel.secrets.iterate(project.id), (candidate) => candidate.name === "github")
const secret = existingSecret
  ? await axernel.secrets.update(project.id, existingSecret.id, { data: secretData.data })
  : await axernel.secrets.create(project.id, secretData)

const providerName = `WalkThroughPark ${model}`
const provider =
  (await find(axernel.modelProviders.iterate(), (candidate) => candidate.name === providerName)) ??
  (await axernel.modelProviders.create({
    name: providerName,
    protocol: "openai_compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    modelName: model,
    token: openRouterKey,
    pricing: await openRouterPricing(),
  }))

// Templates are immutable, so a new image digest gets a new template.
const templateName = `walkthroughpark-sandbox ${imageRef.split(":").at(-1)?.slice(0, 12)}`
const template =
  (await find(axernel.templates.iterate(), (candidate) => candidate.name === templateName)) ??
  (await axernel.templates.create({
    name: templateName,
    image_ref: imageRef,
    environmentTools: [
      { name: "wtp-render", description: "Renders a narrated, captioned demo video. Read /opt/walkthrough/WALKTHROUGH.md first." },
      { name: "playwright", description: "Playwright with Chromium, installed in /opt/walkthrough." },
      { name: "node", description: "Node.js and npm." },
      { name: "python3", description: "Python 3 with Pillow." },
      { name: "git", description: "Git client." },
      { name: "gh", description: "GitHub CLI, authenticated through GH_TOKEN." },
      { name: "ffmpeg", description: "ffmpeg and ffprobe." },
    ],
    preparationTimeoutSeconds: 900,
    sandboxMaxLifetimeSeconds: 7200,
    sandboxIdleTimeoutSeconds: 600,
  }))

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
console.log(`project ${project.id}\ntemplate ${template.id} (${imageRef})\nagent ${agent.id} revision ${agent.revision}\nwrote ../.wtp.json`)
