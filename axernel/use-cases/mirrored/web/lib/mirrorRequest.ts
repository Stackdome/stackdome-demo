import { MODES, type Framework, type Mode } from "./types"

const MAX_TARGET = 200

/** A valid POST body. `target` names the section, and only a section mirror has one.
 *  Mirrored delivers React only; `framework` stays because the agent's contract still asks for it. */
export interface MirrorRequest {
  url: string
  mode: Mode
  target?: string
  framework: Framework
}

/** The page address as the agent gets it, or a sentence for the user. */
export function parsePageUrl(text: string): { url: string } | { error: string } {
  const trimmed = text.trim()
  if (!trimmed) return { error: "Paste the address of a web page." }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { error: "That is not a full web address. Start it with https://" }
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { error: "Only http and https pages can be mirrored." }
  if (!parsed.hostname.includes(".") && parsed.hostname !== "localhost") return { error: "That address has no site name in it." }
  return { url: parsed.href }
}

/** Validates the form's POST body; the error is a sentence for the user. */
export function parseMirrorRequest(body: unknown): MirrorRequest | { error: string } {
  const fields = (body ?? {}) as { url?: unknown; mode?: unknown; target?: unknown }
  if (typeof fields.url !== "string") return { error: "Paste the address of a web page." }

  const page = parsePageUrl(fields.url)
  if ("error" in page) return page

  const mode = fields.mode ?? "section"
  if (!MODES.includes(mode as Mode)) return { error: "Pick one section or the whole brand." }

  const target = typeof fields.target === "string" ? fields.target.trim() : ""
  if (target.length > MAX_TARGET) return { error: `Keep the section name under ${MAX_TARGET} characters.` }
  if (mode === "section" && !target) return { error: "Say which part of the page to mirror." }

  return {
    url: page.url,
    mode: mode as Mode,
    ...(mode === "section" ? { target } : {}),
    framework: "react" satisfies Framework,
  }
}
