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
export const email = process.env.MIR_EMAIL ?? "developer@axernel.com"
export const password = process.env.MIR_PASSWORD ?? "password"
const model = process.env.MIR_MODEL ?? "deepseek/deepseek-v4.1-flash"
const openRouterToken = process.env.OPENROUTER_API_KEY
const PROJECT_NAME = "Mirror"

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required (set it in bootstrap/.env)`)
  return value
}

// --- Calculations --------------------------------------------------------------
export const providerName = (modelName: string) => `WalkThroughPark ${modelName}`

// Named after the digest, so each pushed image gets its own template.
export const templateName = (imageRef: string) => `mirrored-sandbox ${imageRef.split(":").at(-1)?.slice(0, 12)}`

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

const templateRequest = (imageRef: string) => ({
  name: templateName(imageRef),
  image_ref: imageRef,
  environmentTools: [
    { name: "mir-measure", description: "Screenshots a page or element and dumps its computed styles. Read /opt/mirrored/MIRRORED.md first." },
    { name: "mir-reflect", description: "Renders a rebuilt component and scores it against the original screenshot." },
    { name: "mir-pack", description: "Builds tokens.css, tailwind.config.js and bundle.zip, and fills the artifact directory." },
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
    (await axernel.projects.create({ name: PROJECT_NAME, description: "Mirrored: verified components and design tokens from any URL" }))
  )
}

async function openRouterPricing() {
  const response = await fetch("https://openrouter.ai/api/v1/models")
  const { data } = (await response.json()) as { data: { id: string; pricing: Record<string, string> }[] }
  const entry = data.find((candidate) => candidate.id === model)
  if (!entry) {
    const similar = data.map((candidate) => candidate.id).filter((id) => id.startsWith(model.split("/")[0]))
    throw new Error(`OpenRouter has no model "${model}". Set MIR_MODEL to one of: ${similar.join(", ")}`)
  }
  return pricingPerMillion(entry.pricing)
}

export async function ensureModelProvider(axernel: Axernel) {
  const token = openRouterToken
  const name = providerName(model)
  const existing = await find(axernel.modelProviders.iterate(), (candidate) => candidate.name === name)
  // Providers belong to the organisation, so one another app set up is reused as it is.
  // The stored token is write-only: a key in .env replaces it, no key leaves it alone.
  if (existing) return token ? axernel.modelProviders.update(existing.id, { token }) : existing
  if (!token) throw new Error(`No model provider named "${name}" exists yet. Set OPENROUTER_API_KEY in bootstrap/.env to create it.`)
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

type AgentRequest = Parameters<Axernel["agents"]["create"]>[1]

export async function ensureAgent(axernel: Axernel, projectId: string, request: AgentRequest) {
  const existing = await find(axernel.agents.iterate(projectId), (candidate) => candidate.name === request.name)
  if (!existing) return axernel.agents.create(projectId, request)
  const { name: _fixed, ...changes } = request
  return axernel.agents.update(projectId, existing.id, changes, { expectedRevision: existing.revision })
}
