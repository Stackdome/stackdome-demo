// Account, project, model provider and template setup shared by setup.ts and smoke.ts.
import { Axernel } from "@axernel/sdk"

export const baseUrl = process.env.AXERNEL_BASE_URL ?? "http://127.0.0.1:8000"
export const email = process.env.WTP_EMAIL ?? "developer@axernel.com"
export const password = process.env.WTP_PASSWORD ?? "password"
const projectName = "HappyWalkthrough"
const model = process.env.WTP_MODEL ?? "deepseek/deepseek-v4.1-flash"

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required (set it in bootstrap/.env)`)
  return value
}

export async function find<T>(items: AsyncIterable<T>, matches: (item: T) => boolean) {
  for await (const item of items) if (matches(item)) return item
  return undefined
}

export async function authenticate() {
  const anonymous = new Axernel({ baseUrl })
  const credentials = { email, password }
  const auth = await anonymous.auth
    .login(credentials)
    .catch(() => anonymous.auth.signup({ name: "Developer", ...credentials, org: { name: "WalkThroughPark" } }))
  return new Axernel({ baseUrl, apiKey: auth.token })
}

export async function ensureProject(axernel: Axernel) {
  return (
    (await find(axernel.projects.iterate(), (candidate) => candidate.name === projectName)) ??
    (await axernel.projects.create({ name: projectName, description: "WalkThroughPark demo videos" }))
  )
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

// With OPENROUTER_API_KEY the org gets its own provider for a strong coding model.
// Without it, fall back to the platform provider the installation already configured.
export async function ensureModelProvider(axernel: Axernel) {
  const token = process.env.OPENROUTER_API_KEY
  if (!token) {
    const platform = await axernel.modelProviders.getPlatform("openrouter-deepseek")
    console.warn(`OPENROUTER_API_KEY is not set; using platform provider "${platform.name}"`)
    return platform
  }
  const name = `WalkThroughPark ${model}`
  return (
    (await find(axernel.modelProviders.iterate(), (candidate) => candidate.name === name)) ??
    (await axernel.modelProviders.create({
      name,
      protocol: "openai_compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      modelName: model,
      token,
      pricing: await openRouterPricing(),
    }))
  )
}

// Templates are immutable, so a new image digest gets a new template.
export async function ensureTemplate(axernel: Axernel) {
  const imageRef = requireEnv("WTP_IMAGE_REF")
  const name = `walkthroughpark-sandbox ${imageRef.split(":").at(-1)?.slice(0, 12)}`
  return (
    (await find(axernel.templates.iterate(), (candidate) => candidate.name === name)) ??
    (await axernel.templates.create({
      name,
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
  )
}
