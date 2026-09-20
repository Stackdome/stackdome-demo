const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
]

/** "3 hours ago", "yesterday", or "just now" for anything under a minute
 *  (clocks that disagree can put `iso` slightly in the future). */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const seconds = (now - new Date(iso).getTime()) / 1000
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return format.format(-Math.floor(seconds / size), unit)
  }
  return "just now"
}
