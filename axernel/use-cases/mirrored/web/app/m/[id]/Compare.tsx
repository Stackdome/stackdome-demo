"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"

import type { ArtifactName, Mirror } from "@/lib/types"

export const artifactUrl = (id: string, name: string): string => `/api/mirrors/${id}/artifacts/${name}`

type OpenShot = (name: ArtifactName) => void

/** Width over height of a picture once it has loaded. The frame takes this
 *  shape, so the pane can fit it whole without ever scrolling. */
function useRatio(): [React.RefObject<HTMLImageElement | null>, number, () => void] {
  const image = useRef<HTMLImageElement>(null)
  const [ratio, setRatio] = useState(16 / 9)
  const measure = () => {
    const element = image.current
    if (element?.naturalWidth && element.naturalHeight) setRatio(element.naturalWidth / element.naturalHeight)
  }
  // A picture served from cache can finish loading before React attaches onLoad.
  useEffect(measure, [])
  return [image, ratio, measure]
}

/** A frame in the shape of its picture, as large as the pane allows. */
function Frame({ ratio, split, children }: { ratio: number; split?: number; children: ReactNode }) {
  const style = { "--ratio": ratio, ...(split === undefined ? {} : { "--split": `${split}%` }) } as CSSProperties
  return (
    <div className="compare-fit">
      <div className="compare" style={style}>
        {children}
      </div>
    </div>
  )
}

/** Original under, rebuild over, and a vertical line to drag between them.
 *  The drag is a native range input laid over the picture, so keys work too. */
function Slider({ id }: { id: string }) {
  const [split, setSplit] = useState(50)
  const [image, ratio, measure] = useRatio()
  return (
    <Frame ratio={ratio} split={split}>
      <img ref={image} onLoad={measure} className="compare-base" src={artifactUrl(id, "original")} alt="The original section, as the agent's browser saw it" />
      <img className="compare-top" src={artifactUrl(id, "rebuild")} alt="The rebuilt section, rendered from the bundle" />
      <span className="compare-handle" aria-hidden="true" />
      <input
        className="compare-range"
        type="range"
        min={0}
        max={100}
        step={0.5}
        value={split}
        onChange={(event) => setSplit(Number(event.target.value))}
        aria-label="Drag to uncover the original on the left and the rebuild on the right"
      />
    </Frame>
  )
}

function Picture({ id, name, alt }: { id: string; name: ArtifactName; alt: string }) {
  const [image, ratio, measure] = useRatio()
  return (
    <Frame ratio={ratio}>
      <img ref={image} onLoad={measure} className="compare-base" src={artifactUrl(id, name)} alt={alt} />
    </Frame>
  )
}

const VIEWS = { compare: "Compare", live: "Live" } as const
const WIDTHS = { desktop: "Desktop", phone: "Phone" } as const

/** Text toggles, as on the home page: a radio group, the chosen word heavy. */
function Words<T extends string>({ legend, options, value, onChange }: { legend: string; options: Record<T, string>; value: T; onChange: (value: T) => void }) {
  return (
    <fieldset className="words">
      <legend className="sr-only">{legend}</legend>
      {(Object.keys(options) as T[]).map((name) => (
        <label key={name} className="word">
          <input type="radio" name={legend} value={name} checked={value === name} onChange={() => onChange(name)} />
          <span>{options[name]}</span>
        </label>
      ))}
    </fieldset>
  )
}

/** The rebuilt component itself, not a picture of it: preview.html in an empty
 *  sandbox, at the pane's width or a phone's, so it can be seen to respond. */
function Live({ id, width }: { id: string; width: keyof typeof WIDTHS }) {
  return (
    <div className="live-fit">
      <iframe className={`live-frame live-${width}`} src={artifactUrl(id, "preview")} sandbox="" title="The rebuilt component, live" />
    </div>
  )
}

/** A corner label that opens its picture large. */
function Corner({ name, onOpen, children }: { name: ArtifactName; onOpen: OpenShot; children: ReactNode }) {
  return (
    <button type="button" className="corner" onClick={() => onOpen(name)} aria-label={`Open ${String(children).toLowerCase()} large`}>
      {children}
    </button>
  )
}

/** The pictures of a finished mirror, captioned at the corners: a slider when
 *  both sides exist, one picture when only one does, the pixel diff on request. */
export function Compare({ mirror, onOpen }: { mirror: Mirror; onOpen: OpenShot }) {
  const [showDiff, setShowDiff] = useState(false)
  const [view, setView] = useState<keyof typeof VIEWS>("compare")
  const [width, setWidth] = useState<keyof typeof WIDTHS>("desktop")
  const { original, rebuild, diff, page, preview } = mirror.artifacts
  const id = mirror.id

  if (mirror.mode === "brand" && mirror.artifacts.report) {
    return (
      <figure className="compare-figure">
        <figcaption className="compare-caption">
          <span>Site report</span>
          <span />
          {page ? (
            <Corner name="page" onOpen={onOpen}>
              Full page
            </Corner>
          ) : (
            <span />
          )}
        </figcaption>
        {/* An empty sandbox: no scripts, no forms, no same-origin. The route sends the same as a header. */}
        <iframe className="report-frame" src={artifactUrl(id, "report")} sandbox="" title="Design-system report for the whole site" />
      </figure>
    )
  }

  if (mirror.mode === "brand") {
    if (!page) return <p className="stage-note">No picture of the page came back.</p>
    return (
      <figure className="compare-figure">
        <figcaption className="compare-caption">
          <Corner name="page" onOpen={onOpen}>
            Full page
          </Corner>
        </figcaption>
        {/* A whole page is far too tall to fit: the pane shows its top, the modal the rest. */}
        <button type="button" className="compare-crop" onClick={() => onOpen("page")} aria-label="Open the full page large">
          <img src={artifactUrl(id, "page")} alt="The top of the page, as the agent's browser saw it" />
        </button>
      </figure>
    )
  }

  if (!original && !rebuild && !preview) return <p className="stage-note">No pictures came back, so there is nothing to compare.</p>
  const both = original && rebuild
  const only: ArtifactName = original ? "original" : "rebuild"
  // With no pictures at all, the live component is the one thing there is to show.
  const live = preview && (view === "live" || (!original && !rebuild))

  // The switch only exists when there is something to switch to.
  const bar = preview ? (
    <div className="stage-bar">
      {original || rebuild ? <Words legend="View" options={VIEWS} value={view} onChange={setView} /> : <span />}
      {live ? <Words legend="Width" options={WIDTHS} value={width} onChange={setWidth} /> : null}
    </div>
  ) : null

  if (live) {
    return (
      <figure className="compare-figure">
        {bar}
        <Live id={id} width={width} />
      </figure>
    )
  }

  return (
    <figure className="compare-figure">
      {bar}
      <figcaption className="compare-caption">
        {showDiff ? (
          <Corner name="diff" onOpen={onOpen}>
            Difference
          </Corner>
        ) : (
          <Corner name={only} onOpen={onOpen}>
            {original ? "Original" : "Rebuild only"}
          </Corner>
        )}
        {diff ? (
          <label className="toggle">
            <input type="checkbox" checked={showDiff} onChange={(event) => setShowDiff(event.target.checked)} />
            <span>Diff</span>
          </label>
        ) : (
          <span />
        )}
        {showDiff ? (
          <span>red is wrong</span>
        ) : both ? (
          <Corner name="rebuild" onOpen={onOpen}>
            Rebuild
          </Corner>
        ) : (
          <span />
        )}
      </figcaption>
      {showDiff ? (
        <Picture id={id} name="diff" alt="Pixel difference between original and rebuild; red marks what differs" />
      ) : both ? (
        <Slider id={id} />
      ) : (
        <Picture id={id} name={only} alt={original ? "The original section" : "The rebuilt section"} />
      )}
    </figure>
  )
}
