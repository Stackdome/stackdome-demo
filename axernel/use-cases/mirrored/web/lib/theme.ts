// The colour theme: follow the system, or hold one. Calculations only.

export const THEMES = ["system", "light", "dark"] as const
export type Theme = (typeof THEMES)[number]

/** What is stored, or sits in `data-theme`, as a theme. Anything unknown means "follow the system". */
export function themeOf(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : "system"
}

/** The toggle cycles system -> light -> dark -> system. */
export function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length] ?? "system"
}

const LABELS: Record<Theme, string> = { system: "Theme: follows your system", light: "Theme: light", dark: "Theme: dark" }

export const themeLabel = (theme: Theme): string => LABELS[theme]
