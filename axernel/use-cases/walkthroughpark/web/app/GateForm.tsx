"use client"

import { useRouter } from "next/navigation"
import { useState, type FormEvent } from "react"

import { parseSource } from "@/lib/parseSource"
import { DURATIONS, type MaxSeconds } from "@/lib/types"

export interface WalkRequest {
  url: string
  instruction?: string
  maxSeconds: MaxSeconds
}

/** Starts a walkthrough and returns its id, or throws with a readable reason. */
export async function startWalk(request: WalkRequest): Promise<string> {
  const response = await fetch("/api/walkthroughs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
  const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string }
  if (!response.ok || !body.id) throw new Error(body.error ?? "Something went wrong. Try again.")
  return body.id
}

export function GateForm() {
  const router = useRouter()
  const [url, setUrl] = useState("")
  const [instruction, setInstruction] = useState("")
  const [maxSeconds, setMaxSeconds] = useState<MaxSeconds>(60)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = parseSource(url)
    if ("error" in parsed) return setError(parsed.error)
    setError(null)
    setBusy(true)
    try {
      router.push(`/w/${await startWalk({ url, instruction, maxSeconds })}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong. Try again.")
      setBusy(false)
    }
  }

  return (
    <form className="card gate-form" onSubmit={submit} noValidate>
      <label className="field">
        <span className="sr-only">GitHub repo or pull request link</span>
        <input
          className="input input-big"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://github.com/owner/repo or …/pull/12"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "gate-error" : undefined}
          required
        />
      </label>

      <label className="field">
        <span className="label">What should I show? <span className="quiet">(optional)</span></span>
        <textarea
          className="input"
          rows={3}
          maxLength={2000}
          placeholder="Add a todo, mark it done, then filter by status."
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
        />
      </label>

      <div className="gate-foot">
        <fieldset className="chips">
          <legend className="label">How long?</legend>
          {DURATIONS.map((seconds) => (
            <label key={seconds} className="chip tilt">
              <input type="radio" name="maxSeconds" value={seconds} checked={maxSeconds === seconds} onChange={() => setMaxSeconds(seconds)} />
              <span>{seconds}s</span>
            </label>
          ))}
        </fieldset>
        <button className="button tilt" type="submit" disabled={busy}>
          {busy ? "Lacing up…" : "Take a walk →"}
        </button>
      </div>

      {error ? (
        <p id="gate-error" className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
