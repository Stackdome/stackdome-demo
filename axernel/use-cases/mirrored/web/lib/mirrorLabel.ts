import type { Mirror } from "./types"

/** The site's name as people say it: no scheme, no www. The text itself when it is no URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

type Labelled = Pick<Mirror, "url" | "mode" | "target" | "result">

/** What a mirror is called in the archive and as the page title: the agent's
 *  title once there is one, until then the site and what of it was asked for. */
export function mirrorLabel(mirror: Labelled): string {
  const title = mirror.result?.title?.trim()
  if (title) return title
  const host = hostOf(mirror.url)
  if (mirror.mode === "brand") return `${host}, whole brand`
  return mirror.target ? `${host}, ${mirror.target}` : host
}

/** The score an archive card shows for a finished section mirror, or null when there is none to show. */
export function archiveScore(mirror: Pick<Mirror, "mode" | "status" | "result">): number | null {
  if (mirror.status !== "completed" || mirror.mode !== "section") return null
  const score = mirror.result?.matchScore
  return typeof score === "number" && Number.isFinite(score) ? Math.round(Math.min(100, Math.max(0, score))) : null
}

// Five tones, so neither a four- nor a three-column grid stacks one colour into a stripe.
export const CARD_TONES = ["red", "blue", "yellow", "navy", "ink"] as const
export type CardTone = (typeof CARD_TONES)[number]

/** The flat colour of the nth archive card: the primaries in turn, then the two darks, then round again. */
export const cardTone = (index: number): CardTone => CARD_TONES[Math.abs(Math.trunc(index)) % CARD_TONES.length] ?? "red"
