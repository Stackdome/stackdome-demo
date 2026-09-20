import type { RunStatus } from "./types"

export const TABS = ["overview", "scenes", "notes"] as const
export type WalkTab = (typeof TABS)[number]

/** A finished walk opens on what it found. Anything else, still walking or
 *  stopped short, opens on the notes: they are all there is to read. */
export const defaultTab = (status: RunStatus): WalkTab => (status === "completed" ? "overview" : "notes")

/** The tab a URL hash names ("#scenes"), or null when it names none. */
export function tabFromHash(hash: string): WalkTab | null {
  const name = hash.replace(/^#/, "")
  return (TABS as readonly string[]).includes(name) ? (name as WalkTab) : null
}

/** Where Left/Right/Home/End move the selection. Arrows wrap around. */
export function nextTab(current: WalkTab, key: string): WalkTab | null {
  const at = TABS.indexOf(current)
  const last = TABS.length - 1
  const to = key === "ArrowRight" ? (at + 1) % TABS.length : key === "ArrowLeft" ? (at + last) % TABS.length : key === "Home" ? 0 : key === "End" ? last : -1
  return TABS[to] ?? null
}
