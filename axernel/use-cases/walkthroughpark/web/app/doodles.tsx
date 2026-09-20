// Hand-drawn park doodles. Strokes are always ink; fills come from the palette.

import type { SVGProps } from "react"

const stroke = {
  fill: "none",
  stroke: "var(--ink)",
  strokeWidth: 2.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const

type DoodleProps = SVGProps<SVGSVGElement>

/** A signpost. `fill` colours the board; `checked` draws a tick on it. */
export function Signpost({ fill = "var(--card)", checked = false, ...props }: DoodleProps & { fill?: string; checked?: boolean }) {
  return (
    <svg viewBox="0 0 56 64" width="56" height="64" aria-hidden="true" {...props}>
      <path d="M27 24 C27.6 36 26.4 48 27.4 61" {...stroke} />
      <path d="M21 61.5 C25 60.4 30 60.6 34 61.4" {...stroke} />
      <path d="M6.5 7.6 C18 5.8 33 6.9 43.5 6.2 L52.4 15.2 L43.8 24.6 C31 25.6 17 24.2 6.2 25.3 C5.2 19 5.6 13 6.5 7.6 Z" {...stroke} fill={fill} />
      {checked ? <path d="M16 15.5 L22.5 21 L34 10.5" {...stroke} strokeWidth={3} /> : <path d="M14 16 C21 15.2 28 16.4 35 15.6" {...stroke} strokeWidth={2} opacity={0.55} />}
    </svg>
  )
}

export function Tree(props: DoodleProps) {
  return (
    <svg viewBox="0 0 90 120" width="90" height="120" aria-hidden="true" {...props}>
      <path d="M43 70 C44.5 86 42 100 44 114" {...stroke} />
      <path d="M49 72 C48 88 50.5 100 49 114" {...stroke} />
      <path d="M30 115 C42 113 54 113.6 64 115" {...stroke} />
      <path
        d="M45 8 C58 5 70 14 69 26 C80 30 84 46 74 55 C78 68 62 78 50 72 C40 80 22 76 21 62 C8 58 6 40 17 33 C13 19 30 7 45 8 Z"
        {...stroke}
        fill="var(--grass)"
      />
      <path d="M33 34 C37 30 42 30 45 34" {...stroke} strokeWidth={2} opacity={0.6} />
      <path d="M52 50 C56 46 61 47 63 51" {...stroke} strokeWidth={2} opacity={0.6} />
    </svg>
  )
}

export function Bench(props: DoodleProps) {
  return (
    <svg viewBox="0 0 150 80" width="150" height="80" aria-hidden="true" {...props}>
      <path d="M14 14 C52 11.5 98 13 137 12 L138 24 C98 25.5 52 24 13.5 26 Z" {...stroke} fill="var(--clay)" />
      <path d="M13 31 C52 29 98 30.5 138 29.5 L138.6 40 C98 41.4 52 40 12.6 42 Z" {...stroke} fill="var(--clay)" />
      <path d="M7 50 C50 47.6 100 49 144 47.6 L145 57 C100 58.6 50 57 6.4 59 Z" {...stroke} fill="var(--sun)" />
      <path d="M24 59 C23 65 24.6 71 23.4 77" {...stroke} />
      <path d="M127 58 C128 64 126.4 71 127.6 77" {...stroke} />
      <path d="M26 26 L26 31 M125 25 L125 30 M27 42 L26.4 49 M124 41 L124.6 48" {...stroke} />
    </svg>
  )
}

export function Sun(props: DoodleProps) {
  return (
    <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true" {...props}>
      <path d="M40 22 C51 21 59 30 58 41 C57 52 48 59 38 58 C28 57 21 48 22 38 C23 29 30 23 40 22 Z" {...stroke} fill="var(--sun)" />
      <path d="M40 6 L40.6 14 M40 66 L39.4 74 M6 40 L14 40.6 M66 40 L74 39.4 M16 16 L22 21.4 M64 16 L58.4 22 M16 64 L21.6 58 M64 64 L58 58.6" {...stroke} />
    </svg>
  )
}

/** A wobbly underline that stretches to the width of what it sits under. */
export function Squiggle({ color = "var(--clay)", ...props }: DoodleProps & { color?: string }) {
  return (
    <svg viewBox="0 0 300 14" width="100%" height="14" style={{ display: "block", marginTop: "0.15em" }} preserveAspectRatio="none" aria-hidden="true" {...props}>
      <path
        d="M3 8 C28 2 44 12 70 7 C96 2 112 12 140 7 C166 2 186 12 212 7 C238 2 262 12 297 6"
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
