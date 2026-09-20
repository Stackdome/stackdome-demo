"use client"

import { useEffect, useRef } from "react"

import { shotAfter, type Shot } from "@/lib/shots"
import type { ArtifactName } from "@/lib/types"

import { artifactUrl } from "./Compare"

/** Small pictures of whatever the run has. A full page is very tall, so every thumbnail shows its picture's top. */
export function ShotStrip({ id, shots, onOpen }: { id: string; shots: Shot[]; onOpen: (name: ArtifactName) => void }) {
  return (
    <ul className="shots">
      {shots.map((shot) => (
        <li key={shot.name}>
          <button type="button" className="shot" onClick={() => onOpen(shot.name)} aria-label={`Open ${shot.label.toLowerCase()} large`}>
            <img src={artifactUrl(id, shot.name)} alt="" loading="lazy" />
            <span>{shot.label}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

interface ShotDialogProps {
  id: string
  shots: Shot[]
  open: ArtifactName | null
  onChange: (name: ArtifactName | null) => void
}

/** One picture, large. A native <dialog>, so the focus trap and Esc come with
 *  it; left and right move through the run's pictures, a click beside the picture closes. */
export function ShotDialog({ id, shots, open, onChange }: ShotDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const shot = shots.find((candidate) => candidate.name === open)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (shot && !element.open) {
      element.showModal()
      // showModal focuses the first focusable thing, a link; the way out is the better start.
      close.current?.focus()
    }
    if (!shot && element.open) element.close()
  }, [shot])

  // Every picture starts at its top, however far down the last one was scrolled.
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0
  }, [open])

  const move = (step: 1 | -1) => shot && onChange(shotAfter(shots, shot.name, step))
  const at = shot ? shots.indexOf(shot) + 1 : 0

  return (
    <dialog
      ref={dialog}
      className="viewer"
      aria-label={shot ? `${shot.label}, large` : undefined}
      onClose={() => onChange(null)}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") move(1)
        if (event.key === "ArrowLeft") move(-1)
      }}
    >
      {shot ? (
        <>
          <header className="viewer-bar">
            <h2 className="viewer-title">
              {shot.label}
              <span className="count">
                {" "}
                {at} of {shots.length}
              </span>
            </h2>
            <a className="text-link" href={artifactUrl(id, shot.name)} target="_blank" rel="noreferrer">
              Open original file
            </a>
            <button ref={close} type="button" className="button button-light button-small" onClick={() => onChange(null)}>
              Close
            </button>
          </header>

          {/* The space beside the picture is the backdrop: a click there closes. */}
          <div
            ref={body}
            className="viewer-body"
            onClick={(event) => {
              if (event.target === event.currentTarget) onChange(null)
            }}
          >
            <img key={shot.name} src={artifactUrl(id, shot.name)} alt={`${shot.label} screenshot`} />
          </div>

          {shots.length > 1 ? (
            <>
              <button type="button" className="viewer-step viewer-prev" onClick={() => move(-1)} aria-label="Previous picture">
                ←
              </button>
              <button type="button" className="viewer-step viewer-next" onClick={() => move(1)} aria-label="Next picture">
                →
              </button>
            </>
          ) : null}
        </>
      ) : null}
    </dialog>
  )
}
