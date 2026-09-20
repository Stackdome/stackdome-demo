// Geometry as ornament: circles, halves, quarters and squares on a strict
// grid, flat fills only. Every drawing is decorative unless a caller labels it.
import type { ReactNode, SVGProps } from "react"

import type { TrailStage } from "@/lib/inferStage"
import { DIAL_RADIUS, halfCirclePath, scoreDial } from "@/lib/scoreDial"

const RED = "var(--red)"
const BLUE = "var(--blue)"
const YELLOW = "var(--yellow)"
// The poster sits on a navy field, so its pale parts are whatever reads on navy.
const PALE = "var(--on-navy)"

/** One side of the poster, drawn left of the axis at x = 300. `dome` is the
 *  quarter-circle's colour: the one thing the reflection gets to change. */
function PosterSide({ dome }: { dome: string }) {
  return (
    <>
      <circle cx={130} cy={210} r={70} fill={YELLOW} />
      <path d="M 100 520 A 200 200 0 0 1 300 320 L 300 520 Z" fill={dome} />
      <rect x={60} y={560} width={180} height={60} fill={PALE} />
    </>
  )
}

/** The product's motif: a few big shapes and their reflection across a
 *  vertical axis. The reflected dome comes back in another primary, because a
 *  rebuild is a new thing that only looks the same. Sliced to fill its panel. */
export function MirrorPoster(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" {...props}>
      <PosterSide dome={RED} />
      <g transform="translate(600 0) scale(-1 1)">
        <PosterSide dome={BLUE} />
      </g>
      <line x1={300} y1={0} x2={300} y2={800} stroke={PALE} strokeWidth={2} />
    </svg>
  )
}

/** The wordmark's sign: one circle cut down the middle, the halves a hair apart. */
export function MirrorMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 108 100" aria-hidden="true" focusable="false" {...props}>
      <path d={halfCirclePath("left", 50)} fill={RED} />
      <path d={halfCirclePath("right", 58)} fill={BLUE} />
    </svg>
  )
}

/** The match score as two half-circles that meet at 100. `mono` draws both in
 *  the text colour, for use on a coloured field. */
export function ScoreDial({ matchScore, mono = false, ...props }: { matchScore: unknown; mono?: boolean } & SVGProps<SVGSVGElement>) {
  const dial = scoreDial(matchScore)
  // The box hugs the drawing; CSS fixes its height, so the halves keep their size.
  return (
    <svg viewBox={`0 0 ${dial.width} ${DIAL_RADIUS * 2}`} role="img" aria-label={`Match score ${dial.score} out of 100`} {...props}>
      <path d={halfCirclePath("left", DIAL_RADIUS)} fill={mono ? "currentColor" : RED} />
      <path d={halfCirclePath("right", DIAL_RADIUS + dial.gap)} fill={mono ? "currentColor" : BLUE} />
    </svg>
  )
}

const STEP_SHAPES: Record<TrailStage, ReactNode> = {
  look: <circle cx={24} cy={24} r={22} />,
  measure: <rect x={2} y={2} width={44} height={44} />,
  name: <path d="M 2 46 A 44 44 0 0 1 46 2 L 46 46 Z" />,
  rebuild: <path d="M 2 35 A 22 22 0 0 1 46 35 Z" />,
  reflect: (
    <>
      <path d="M 22 2 A 22 22 0 0 0 22 46 Z" />
      <path d="M 26 2 A 22 22 0 0 1 26 46 Z" />
    </>
  ),
}

/** One step of the progress trail. The fill comes from CSS, by the step's state. */
export function StepShape({ stage, ...props }: { stage: TrailStage } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" {...props}>
      {STEP_SHAPES[stage]}
    </svg>
  )
}
