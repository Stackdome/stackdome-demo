"use client"

import { useEffect } from "react"

import { restoreWornSkin, takeOffSkin, useWornSkin } from "./wornSkin"

/** In the top bar on every page: puts a remembered skin back on, and while one
 *  is worn says whose it is, with the way out of it. */
export function Wearing() {
  const worn = useWornSkin()
  // ponytail: applied after hydration, so a reload shows Bauhaus for a moment first.
  // An inline script in <head> would avoid that; not worth it for a toy button.
  useEffect(restoreWornSkin, [])

  if (!worn) return null
  return (
    <button type="button" className="wearing" onClick={takeOffSkin} aria-label={`Wearing the look of ${worn.host}. Take it off`}>
      wearing <span className="wearing-host">{worn.host} </span>
      <span aria-hidden="true">✕</span>
    </button>
  )
}
