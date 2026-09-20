"use client"

import { useEffect, useState } from "react"

import { hostOf } from "@/lib/mirrorLabel"
import { skinVars, wornVars, type SkinVars } from "@/lib/skin"
import type { Mirror } from "@/lib/types"

import { takeOffSkin, useWornSkin, wearSkin } from "../../wornSkin"
import { artifactUrl } from "./Compare"

interface ReadSkin {
  /** What the skin itself brings; empty when nothing in it is usable. */
  own: SkinVars
  /** What wearing it sets: its own over the light Bauhaus set, so no theme shows through. */
  worn: SkinVars
}

/** skin.json as the variables it may set. Null until read, or when the run has none. */
function useSkinVars(mirror: Mirror): ReadSkin | null {
  const [vars, setVars] = useState<ReadSkin | null>(null)
  const available = mirror.artifacts.skin

  useEffect(() => {
    if (!available) return
    let stale = false
    fetch(artifactUrl(mirror.id, "skin"))
      .then((response) => (response.ok ? response.json() : null))
      .then((skin: unknown) => !stale && setVars({ own: skinVars(skin), worn: wornVars(skin) }))
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [available, mirror.id])

  return available ? vars : null
}

/** The power button: a circle split by the mirror's axis. Pressing it dresses
 *  the whole app in the mirrored site's look; pressing again takes it off. */
export function WearButton({ mirror }: { mirror: Mirror }) {
  const vars = useSkinVars(mirror)
  const worn = useWornSkin()
  // A skin with nothing usable in it would change nothing: no button.
  if (!vars || Object.keys(vars.own).length === 0) return null

  const on = worn?.mirrorId === mirror.id
  return (
    <button type="button" className="wear" aria-pressed={on} onClick={() => (on ? takeOffSkin() : wearSkin({ mirrorId: mirror.id, host: hostOf(mirror.url), vars: vars.worn }))}>
      <svg className="wear-dial" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M 30 4 A 28 28 0 0 0 30 60 Z" fill="var(--red)" />
        <path d="M 34 4 A 28 28 0 0 1 34 60 Z" fill={on ? "var(--yellow)" : "var(--blue)"} />
        <line x1={32} y1={0} x2={32} y2={64} stroke="var(--ink)" strokeWidth={1.5} />
      </svg>
      <span className="wear-words">
        <span className="heavy">{on ? "Take it off" : "Wear it"}</span>
        <span className="light">{on ? "back to Bauhaus" : `dress this app as ${hostOf(mirror.url)}`}</span>
      </span>
    </button>
  )
}
