// Shared by setup.ts and smoke.ts. Three parts, top to bottom:
//   settings      the only reads of process.env
//   calculations  names and request bodies, values in and values out
//   actions       one "ensure X exists" per Axernel resource. Each is find-by-name, then
//                 create or update, so a re-run converges instead of duplicating.
//
// SDK calls used, and the one thing to know about each:
//   auth.login / auth.signup        signup only when login fails; the token goes into a second client.
//   projects.iterate / create       iterate() pages through every project; the API has no find-by-name.
//   secrets.iterate / create / update   secret data is write-only, so a re-run always overwrites it.
//   modelProviders.getPlatform      the installation's own provider, used when there is no OpenRouter key.
//   modelProviders.iterate / create / update   org-owned provider; the token is write-only too.
//   templates.iterate / create      templates are immutable: a new image digest means a new template.
//   agents.iterate / create / update    update needs expectedRevision (If-Match) and makes a new
//                                   revision. Sessions pin the revision they were created with.
import { AuthenticationError, Axernel } from "@axernel/sdk"

// --- Settings ----------------------------------------------------------------
export const baseUrl = process.env.AXERNEL_BASE_URL ?? "http://127.0.0.1:8000"
export const email = process.env.WTP_EMAIL ?? "developer@axernel.com"
export const password = process.env.WTP_PASSWORD ?? "password"
const model = process.env.WTP_MODEL ?? "deepseek/deepseek-v4.1-flash"
const openRouterToken = process.env.OPENROUTER_API_KEY
const PROJECT_NAME = "HappyWalkthrough"
const GITHUB_MCP_URL = "https://api.githubcopilot.com/mcp/"

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required (set it in bootstrap/.env)`)
  return value
}

// --- Calculations --------------------------------------------------------------
export const providerName = (modelName: string) => `WalkThroughPark ${modelName}`

// Named after the digest, so each pushed image gets its own template.
export const templateName = (imageRef: string) => `walkthroughpark-sandbox ${imageRef.split(":").at(-1)?.slice(0, 12)}`

// OpenRouter lists per-token prices; Axernel wants USD per million tokens.
export function pricingPerMillion(pricing: Record<string, string | undefined>) {
  const perMillion = (price?: string) => Number(price ?? 0) * 1_000_000
  return {
    inputUsdPerMillion: perMillion(pricing.prompt),
    outputUsdPerMillion: perMillion(pricing.completion),
    reasoningUsdPerMillion: perMillion(pricing.internal_reasoning ?? pricing.completion),
    cacheReadUsdPerMillion: perMillion(pricing.input_cache_read),
    cacheWriteUsdPerMillion: perMillion(pricing.input_cache_write),
  }
}

export const secretCredential = (secretId: string) => ({ secret: { secretId, key: "token" } })
export type SecretCredential = ReturnType<typeof secretCredential>

// Axernel builds before the MCPAuthentication contract take a prefixed Authorization header binding.
// Drop the old shape once no local server runs it.
export function githubMcpRemote(credential: SecretCredential, serverHasMcpAuthentication: boolean) {
  return serverHasMcpAuthentication
    ? { url: GITHUB_MCP_URL, authentication: { type: "bearer" as const, credential } }
    : ({ url: GITHUB_MCP_URL, headerBindings: { Authorization: { ...credential, prefix: "Bearer " } } } as never)
}

const templateRequest = (imageRef: string) => ({
  name: templateName(imageRef),
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
})

// --- Actions -------------------------------------------------------------------
async function find<T>(items: AsyncIterable<T>, matches: (item: T) => boolean) {
  for await (const item of items) if (matches(item)) return item
  return undefined
}

export async function authenticate() {
  const anonymous = new Axernel({ baseUrl })
  const credentials = { email, password }
  const auth = await anonymous.auth
    .login(credentials)
    // Only a rejected login means "no such account yet". A network error must surface as itself.
    .catch((error: unknown) => {
      if (!(error instanceof AuthenticationError)) throw error
      return anonymous.auth.signup({ name: "Developer", ...credentials, org: { name: "WalkThroughPark" } })
    })
  return new Axernel({ baseUrl, apiKey: auth.token })
}

export async function ensureProject(axernel: Axernel) {
  return (
    (await find(axernel.projects.iterate(), (candidate) => candidate.name === PROJECT_NAME)) ??
    (await axernel.projects.create({ name: PROJECT_NAME, description: "WalkThroughPark demo videos" }))
  )
}

export async function ensureGithubSecret(axernel: Axernel, projectId: string, token: string) {
  const existing = await find(axernel.secrets.iterate(projectId), (candidate) => candidate.name === "github")
  return existing
    ? axernel.secrets.update(projectId, existing.id, { data: { token } })
    : axernel.secrets.create(projectId, { name: "github", description: "Read-only GitHub token", data: { token } })
}

async function openRouterPricing() {
  const response = await fetch("https://openrouter.ai/api/v1/models")
  const { data } = (await response.json()) as { data: { id: string; pricing: Record<string, string> }[] }
  const entry = data.find((candidate) => candidate.id === model)
  if (!entry) {
    const similar = data.map((candidate) => candidate.id).filter((id) => id.startsWith(model.split("/")[0]))
    throw new Error(`OpenRouter has no model "${model}". Set WTP_MODEL to one of: ${similar.join(", ")}`)
  }
  return pricingPerMillion(entry.pricing)
}

// With OPENROUTER_API_KEY the org gets its own provider for a strong coding model.
// Without it, fall back to the platform provider the installation already configured.
export async function ensureModelProvider(axernel: Axernel) {
  const token = openRouterToken
  if (!token) {
    const platform = await axernel.modelProviders.getPlatform("openrouter-deepseek")
    console.warn(`OPENROUTER_API_KEY is not set; using platform provider "${platform.name}"`)
    return platform
  }
  const name = providerName(model)
  const existing = await find(axernel.modelProviders.iterate(), (candidate) => candidate.name === name)
  // The stored token is write-only, so a re-run always replaces it with the one in .env.
  if (existing) return axernel.modelProviders.update(existing.id, { token })
  return axernel.modelProviders.create({
    name,
    protocol: "openai_compatible",
    baseUrl: "https://openrouter.ai/api/v1",
    modelName: model,
    token,
    pricing: await openRouterPricing(),
  })
}

export async function ensureTemplate(axernel: Axernel, imageRef: string) {
  const request = templateRequest(imageRef)
  return (await find(axernel.templates.iterate(), (candidate) => candidate.name === request.name)) ?? (await axernel.templates.create(request))
}

// The served schema says which MCP authentication shape this server accepts.
export async function serverHasMcpAuthentication(): Promise<boolean> {
  return (await (await fetch(`${baseUrl}/openapi.yaml`)).text()).includes("MCPAuthentication:")
}

type AgentRequest = Parameters<Axernel["agents"]["create"]>[1]

export async function ensureAgent(axernel: Axernel, projectId: string, request: AgentRequest) {
  const existing = await find(axernel.agents.iterate(projectId), (candidate) => candidate.name === request.name)
  if (!existing) return axernel.agents.create(projectId, request)
  const { name: _fixed, ...changes } = request
  return axernel.agents.update(projectId, existing.id, changes, { expectedRevision: existing.revision })
}
