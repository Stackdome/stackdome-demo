import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export interface MirroredConfig {
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

const REQUIRED = ["baseUrl", "email", "password", "projectId", "agentId"] as const

/** Calculation: the required keys a parsed config file does not fill in. */
export function missingConfigKeys(parsed: Record<string, unknown>): string[] {
  return REQUIRED.filter((key) => typeof parsed[key] !== "string" || !parsed[key])
}

export function configPath(): string {
  return process.env.MIRRORED_CONFIG ?? path.resolve(process.cwd(), "../.mirrored.json")
}

/** The bootstrap's output. Throws ConfigMissingError when it is not there. */
export function readConfig(): MirroredConfig {
  const file = configPath()
  if (!existsSync(/*turbopackIgnore: true*/ file)) throw new ConfigMissingError(file, "No config file")
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as Record<string, unknown>
  } catch {
    throw new ConfigMissingError(file, "Config file is not valid JSON")
  }
  const missing = missingConfigKeys(parsed)
  if (missing.length > 0) throw new ConfigMissingError(file, `Config file lacks ${missing.join(", ")}`)
  return parsed as unknown as MirroredConfig
}

export function isConfigured(): boolean {
  try {
    readConfig()
    return true
  } catch {
    return false
  }
}
