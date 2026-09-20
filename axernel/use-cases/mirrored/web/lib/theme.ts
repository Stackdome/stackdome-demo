// The colour theme: light or dark. Until someone chooses, the system decides. Calculations only.

export type Theme = "system" | "light" | "dark"
export type ShownTheme = "light" | "dark"

/** What is stored, or sits in `data-theme`, as a theme. Anything unknown means "follow the system". */
export function themeOf(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : "system"
}

/** The theme on screen right now. */
export function shownTheme(theme: Theme, systemPrefersDark: boolean): ShownTheme {
  return theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme
}

/** The toggle has two sides: pressing it always goes to the one not on screen. */
export function nextTheme(theme: Theme, systemPrefersDark: boolean): ShownTheme {
  return shownTheme(theme, systemPrefersDark) === "dark" ? "light" : "dark"
}

/** Says what pressing will do, which is what a button label is for. */
export const themeLabel = (shown: ShownTheme): string => (shown === "dark" ? "Switch to light mode" : "Switch to dark mode")
