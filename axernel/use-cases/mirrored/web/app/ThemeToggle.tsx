"use client"

import { useEffect, useState } from "react"

import { nextTheme, shownTheme, themeLabel, themeOf, type ShownTheme } from "@/lib/theme"

// The same key the inline script in layout.tsx reads before first paint.
const KEY = "mirrored.theme"

function remember(theme: ShownTheme): void {
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Without storage the choice still holds until the page is left.
  }
}

const systemPrefersDark = (): boolean => window.matchMedia("(prefers-color-scheme: dark)").matches

/** Sun when the page is light, moon when it is dark. Pressing it goes to the other. */
export function ThemeToggle() {
  // The server cannot know; the inline script has already set the attribute by the time this mounts.
  const [shown, setShown] = useState<ShownTheme>("light")
  useEffect(() => setShown(shownTheme(themeOf(document.documentElement.dataset.theme), systemPrefersDark())), [])

  function flip() {
    const next = nextTheme(shown, systemPrefersDark())
    document.documentElement.dataset.theme = next
    remember(next)
    setShown(next)
  }

  return (
    <button type="button" className="theme-toggle" onClick={flip} aria-label={themeLabel(shown)} title={themeLabel(shown)}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
        {shown === "dark" ? (
          <path d="M 20 14.5 A 8.5 8.5 0 1 1 9.5 4 A 6.6 6.6 0 0 0 20 14.5 Z" fill="currentColor" stroke="none" />
        ) : (
          <>
            <circle cx={12} cy={12} r={4.25} fill="currentColor" stroke="none" />
            <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
          </>
        )}
      </svg>
    </button>
  )
}
