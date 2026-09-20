"use client"

// The skin the app is wearing: actions only. What may be set is decided by the
// calculations in lib/skin.ts; this file sets it, remembers it and animates it.
import { useSyncExternalStore } from "react"

import { safeSkinVars, SKIN_VARS, type SkinVars } from "@/lib/skin"

export interface WornSkin {
  mirrorId: string
  host: string
  vars: SkinVars
}

const KEY = "mirrored.skin"
const CHANGED = "mirrored:skin"
const WIPE_MS = 520

/** What is stored, checked again: the stored vars are no more trusted than skin.json was. */
function readWorn(): WornSkin | null {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<WornSkin> | null
    if (!stored || typeof stored.mirrorId !== "string" || typeof stored.host !== "string") return null
    return { mirrorId: stored.mirrorId, host: stored.host.slice(0, 100), vars: safeSkinVars(stored.vars) }
  } catch {
    // No storage, or nonsense in it: the app wears nothing.
    return null
  }
}

function writeWorn(worn: WornSkin | null): void {
  try {
    if (worn) localStorage.setItem(KEY, JSON.stringify(worn))
    else localStorage.removeItem(KEY)
  } catch {
    // Without storage the skin still applies; it just will not survive a reload.
  }
}

/** Only `style.setProperty`, only known names, only checked values. */
function applyVars(vars: SkinVars): void {
  const style = document.documentElement.style
  for (const name of SKIN_VARS) {
    const value = vars[name]
    if (value) style.setProperty(name, value)
    else style.removeProperty(name)
  }
}

/** Two panels close on the vertical axis, the look changes behind them, they open again. */
function wipe(change: () => void): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return change()
  const curtain = document.createElement("div")
  curtain.className = "wipe"
  curtain.setAttribute("aria-hidden", "true")
  document.body.append(curtain)
  setTimeout(change, WIPE_MS / 2)
  setTimeout(() => curtain.remove(), WIPE_MS)
}

// useSyncExternalStore compares snapshots by identity, so the parsed value is kept until it changes.
let snapshot: WornSkin | null = null
let snapshotJson = "null"

function currentWorn(): WornSkin | null {
  const worn = readWorn()
  const json = JSON.stringify(worn)
  if (json !== snapshotJson) {
    snapshot = worn
    snapshotJson = json
  }
  return snapshot
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGED, onChange)
  // Another tab put it on or took it off.
  window.addEventListener("storage", onChange)
  return () => {
    window.removeEventListener(CHANGED, onChange)
    window.removeEventListener("storage", onChange)
  }
}

function change(worn: WornSkin | null): void {
  wipe(() => {
    applyVars(worn?.vars ?? {})
    writeWorn(worn)
    window.dispatchEvent(new Event(CHANGED))
  })
}

export const wearSkin = (worn: WornSkin): void => change({ ...worn, vars: safeSkinVars(worn.vars) })
export const takeOffSkin = (): void => change(null)

/** Puts the remembered skin back on after a load, without the wipe. */
export function restoreWornSkin(): void {
  applyVars(readWorn()?.vars ?? {})
}

/** The skin being worn, or null. Null on the server and until hydration. */
export function useWornSkin(): WornSkin | null {
  return useSyncExternalStore(subscribe, currentWorn, () => null)
}
