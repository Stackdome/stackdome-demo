"use client"

import { useEffect, useState } from "react"

import { nextTheme, themeLabel, themeOf, type Theme } from "@/lib/theme"

// The same key the inline script in layout.tsx reads before first paint.
const KEY = "mirrored.theme"

function remember(theme: Theme): void {
  try {
    if (theme === "system") localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // Without storage the choice still holds until the page is left.
  }
}

/** A circle that is half filled when the system decides, empty for light, full for dark. */
export function ThemeToggle() {
  // The server cannot know; the inline script has already set the attribute by the time this mounts.
  const [theme, setTheme] = useState<Theme>("system")
  useEffect(() => setTheme(themeOf(document.documentElement.dataset.theme)), [])

  function cycle() {
    const next = nextTheme(theme)
    if (next === "system") delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = next
    remember(next)
    setTheme(next)
  }

  return (
    <button type="button" className="theme-toggle" onClick={cycle} aria-label={`${themeLabel(theme)}. Change it`} title={themeLabel(theme)}>
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <circle cx={10} cy={10} r={8.25} fill={theme === "dark" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.5} />
        {theme === "system" ? <path d="M 10 1.75 A 8.25 8.25 0 0 1 10 18.25 Z" fill="currentColor" /> : null}
      </svg>
    </button>
  )
}
