import type { ArtifactName, Mirror } from "./types"

export interface Shot {
  name: ArtifactName
  label: string
}

// The order they are worth looking at: where it came from, what was asked for, what came back, what differs.
const SHOTS: readonly Shot[] = [
  { name: "page", label: "Full page" },
  { name: "original", label: "Original" },
  { name: "rebuild", label: "Rebuild" },
  { name: "diff", label: "Diff" },
]

/** The pictures a run has, in viewing order. A section run usually has all four, a brand run only the page. */
export function shotsOf(artifacts: Mirror["artifacts"]): Shot[] {
  return SHOTS.filter((shot) => artifacts[shot.name])
}

/** The shot `step` places on from `current`, wrapping at both ends. Null when
 *  `current` is not among them or there is nothing to move through. */
export function shotAfter(shots: readonly Shot[], current: ArtifactName, step: 1 | -1): ArtifactName | null {
  const at = shots.findIndex((shot) => shot.name === current)
  if (at < 0) return null
  return shots[(at + step + shots.length) % shots.length]?.name ?? null
}
