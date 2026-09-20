// The match score as a picture: two half-circles that close into one full
// circle as the score approaches 100. Units are the dial's own SVG units.

export const DIAL_RADIUS = 50
/** How far apart the flat edges sit at a score of 0. */
export const DIAL_MAX_GAP = 60

export interface ScoreDial {
  /** The score as shown: a whole number from 0 to 100. */
  score: number
  /** Distance between the two flat edges; 0 is a closed circle. */
  gap: number
  /** Width of the whole drawing, for the viewBox. */
  width: number
}

/** A score the agent did not send, or sent as nonsense, draws as 0. */
export function scoreDial(matchScore: unknown): ScoreDial {
  const raw = typeof matchScore === "number" && Number.isFinite(matchScore) ? matchScore : 0
  const clamped = Math.min(100, Math.max(0, raw))
  // The gap follows the unrounded score, so 99.6 is visibly not yet closed.
  const gap = Math.round((1 - clamped / 100) * DIAL_MAX_GAP * 10) / 10
  return { score: Math.round(clamped), gap, width: DIAL_RADIUS * 2 + gap }
}

/** SVG path of one half-circle whose flat edge is the vertical line x = `edgeX`. */
export function halfCirclePath(side: "left" | "right", edgeX: number): string {
  const sweep = side === "left" ? 0 : 1
  return `M ${edgeX} 0 A ${DIAL_RADIUS} ${DIAL_RADIUS} 0 0 ${sweep} ${edgeX} ${DIAL_RADIUS * 2} Z`
}

/** The score in a word, by the agent's own bar: it stops iterating at 95. */
export function scoreWord(score: number): string {
  if (score >= 95) return "A true mirror"
  if (score >= 80) return "A close mirror"
  if (score >= 50) return "A rough mirror"
  return "A distant mirror"
}
