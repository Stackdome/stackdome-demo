import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

import { AuthenticationError, Axernel } from "@axernel/sdk"

export interface WtpConfig {
  baseUrl: string
  email: string
  password: string
  projectId: string
  agentId: string
}

export class ConfigMissingError extends Error {
  constructor(readonly configPath: string, reason: string) {
    super(`${reason}: ${configPath}. Run the bootstrap first.`)
  }
}

export function configPath(): string {
  return process.env.WTP_CONFIG ?? path.resolve(process.cwd(), "../.wtp.json")
}

const REQUIRED = ["baseUrl", "email", "password", "projectId", "agentId"] as const

/** The bootstrap's output. Throws ConfigMissingError when it is not there. */
export function readConfig(): WtpConfig {
  const file = configPath()
  if (!existsSync(/*turbopackIgnore: true*/ file)) throw new ConfigMissingError(file, "No config file")
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as Record<string, unknown>
  } catch {
    throw new ConfigMissingError(file, "Config file is not valid JSON")
  }
  const missing = REQUIRED.filter((key) => typeof parsed[key] !== "string" || !parsed[key])
  if (missing.length > 0) throw new ConfigMissingError(file, `Config file lacks ${missing.join(", ")}`)
  return parsed as unknown as WtpConfig
}

export function isConfigured(): boolean {
  try {
    readConfig()
    return true
  } catch {
    return false
  }
}

// On globalThis so dev-mode module reloads share one login.
const cache = globalThis as unknown as { __wtpAxernel?: Promise<Axernel> | undefined }

/** The authenticated client, logged in once and reused. */
export function getAxernel(): Promise<Axernel> {
  cache.__wtpAxernel ??= login().catch((error: unknown) => {
    cache.__wtpAxernel = undefined
    throw error
  })
  return cache.__wtpAxernel
}

export function forgetAxernel(): void {
  cache.__wtpAxernel = undefined
}

async function login(): Promise<Axernel> {
  const config = readConfig()
  const auth = await new Axernel({ baseUrl: config.baseUrl }).auth.login({ email: config.email, password: config.password })
  return new Axernel({ baseUrl: config.baseUrl, apiKey: auth.token })
}

/** Runs `work` with the client. An expired login is renewed once and the
 *  work retried; anything else is the caller's to handle. */
export async function withAxernel<T>(work: (client: Axernel, config: WtpConfig) => Promise<T>): Promise<T> {
  const config = readConfig()
  try {
    return await work(await getAxernel(), config)
  } catch (error) {
    if (!(error instanceof AuthenticationError)) throw error
    forgetAxernel()
    return work(await getAxernel(), config)
  }
}
