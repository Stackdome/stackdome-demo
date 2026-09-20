"use client"

import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

import { parseMirrorRequest } from "@/lib/mirrorRequest"
import { MODES, type Mode } from "@/lib/types"

export interface MirrorForm {
  url: string
  mode: Mode
  target?: string
}

const MODE_LABELS: Record<Mode, string> = { section: "One section", brand: "Whole brand" }

/** Starts a mirror and returns its id, or throws with a readable reason. */
export async function startMirror(request: MirrorForm): Promise<string> {
  const response = await fetch("/api/mirrors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
  const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string }
  if (!response.ok || !body.id) throw new Error(body.error ?? "Something went wrong. Try again.")
  return body.id
}

/** One loud thing, the address and its button. The rest is a quiet row below. */
export function GateForm() {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [mode, setMode] = useState<Mode>("section")
  const [target, setTarget] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    // The same check the server runs, so a bad link never costs a round trip.
    const request = parseMirrorRequest({ url, mode, target })
    if ("error" in request) return setError(request.error)
    setError(null)
    setBusy(true)
    try {
      router.push(`/m/${await startMirror(request)}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.")
      setBusy(false)
    }
  }

  return (
    <form className="ask" onSubmit={submit} noValidate>
      <div className="ask-url">
        <label className="sr-only" htmlFor="ask-url">
          Address of the page to mirror
        </label>
        <input
          id="ask-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://example.com/pricing"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "ask-error" : undefined}
          required
        />
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Opening…" : "Mirror it"}
          <span className="button-arrow" aria-hidden="true">
            →
          </span>
        </button>
      </div>

      <div className="ask-options">
        <fieldset className="words">
          <legend className="sr-only">How much of the page?</legend>
          {MODES.map((name) => (
            <label key={name} className="word">
              <input type="radio" name="mode" value={name} checked={mode === name} onChange={() => setMode(name)} />
              <span>{MODE_LABELS[name]}</span>
            </label>
          ))}
        </fieldset>

        {mode === "section" ? (
          <label className="ask-part">
            <span>Which part?</span>
            <input type="text" maxLength={200} placeholder="pricing table, hero, navbar…" value={target} onChange={(event) => setTarget(event.target.value)} />
          </label>
        ) : (
          <p className="ask-note">Colours, type, radii and spacing as a theme. No rebuild, so no score.</p>
        )}
      </div>

      {error ? (
        <p id="ask-error" className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
