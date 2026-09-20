"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { inferStage, STAGES, type TrailStage } from "@/lib/inferStage"
import { hostOf, mirrorLabel } from "@/lib/mirrorLabel"
import { scoreDial, scoreWord } from "@/lib/scoreDial"
import { shotsOf } from "@/lib/shots"
import { isTerminal, type ArtifactName, type Mirror, type RunEvent } from "@/lib/types"

import { startMirror } from "../../GateForm"
import { ScoreDial, StepShape } from "../../shapes"
import { statusWord } from "../../status"
import { CodePanel } from "./CodePanel"
import { Compare } from "./Compare"
import { FieldNotes, foldFeed, type StoredEvent } from "./FieldNotes"
import { ShotDialog, ShotStrip } from "./Shots"
import { TokensPanel } from "./TokensPanel"
import { WearButton } from "./WearButton"

const STAGE_LABELS: Record<TrailStage, string> = {
  look: "Look",
  measure: "Measure",
  name: "Name",
  rebuild: "Rebuild",
  reflect: "Reflect",
}

function useMirror(initial: Mirror) {
  const [mirror, setMirror] = useState(initial)
  const [events, setEvents] = useState<StoredEvent[]>([])
  const [streaming, setStreaming] = useState(true)

  const refetch = useCallback(async () => {
    const response = await fetch(`/api/mirrors/${initial.id}`, { cache: "no-store" }).catch(() => null)
    if (response?.ok) setMirror((await response.json()) as Mirror)
  }, [initial.id])

  useEffect(() => {
    const source = new EventSource(`/api/mirrors/${initial.id}/events`)
    source.onmessage = (message) => {
      let event: RunEvent
      try {
        event = JSON.parse(message.data) as RunEvent
      } catch {
        return
      }
      const seq = Number(message.lastEventId)
      setEvents((current) => (current.some((stored) => stored.seq === seq) ? current : [...current, { seq, event }]))
      if (event.type === "run.status") void refetch()
    }
    source.addEventListener("end", () => {
      source.close()
      setStreaming(false)
      void refetch()
    })
    return () => source.close()
  }, [initial.id, refetch])

  // The stream says what happened; the run says how it ended. Keep asking
  // until the run is terminal and, when it completed, its bundle is ready.
  // ponytail: a completed run that never yields a bundle is polled for as
  // long as the page is open; the server stops asking Axernel once settled.
  const settled = isTerminal(mirror.status) && (mirror.status !== "completed" || mirror.artifacts.bundle)
  useEffect(() => {
    if (settled) return
    const timer = setInterval(() => void refetch(), 5000)
    return () => clearInterval(timer)
  }, [settled, refetch])

  return { mirror, events, streaming }
}

/** Five shapes that fill in. `reached` is the step the run is at, or "done";
 *  `closed` marks that step as where a failed run ended. */
function Trail({ reached, closed }: { reached: TrailStage | "done"; closed: boolean }) {
  const at = reached === "done" ? STAGES.length : STAGES.indexOf(reached)
  return (
    <ol className="trail" aria-label="Progress">
      {STAGES.map((name, index) => {
        const state = index < at ? "done" : index > at ? "ahead" : closed ? "closed" : "current"
        return (
          <li key={name} className={`trail-stop trail-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <StepShape stage={name} className="trail-shape" />
            <span className="trail-label">{STAGE_LABELS[name]}</span>
            {state === "done" ? <span className="sr-only"> (done)</span> : null}
            {state === "closed" ? <span className="sr-only"> (stopped here)</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

function Broke({ mirror }: { mirror: Mirror }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function retry() {
    setBusy(true)
    setError(null)
    try {
      const id = await startMirror({ url: mirror.url, mode: mirror.mode, ...(mirror.target ? { target: mirror.target } : {}) })
      router.push(`/m/${id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start again.")
      setBusy(false)
    }
  }

  return (
    <div className="broke" role="alert">
      <h2 className="broke-title">
        <span className="heavy">{mirror.status === "timed_out" ? "Out of time" : "The mirror broke"}</span>
        {mirror.error?.phase ? <span className="light">during {mirror.error.phase}</span> : null}
      </h2>
      <p>{mirror.error?.message ?? (mirror.status === "timed_out" ? "The run hit its time limit before the bundle was packed." : "The run stopped before the bundle was packed.")}</p>
      <button type="button" className="button button-light" onClick={retry} disabled={busy}>
        {busy ? "Opening…" : "Mirror it again"}
        <span className="button-arrow" aria-hidden="true">
          →
        </span>
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  )
}

function Usage({ mirror }: { mirror: Mirror }) {
  const usage = mirror.usage
  if (!usage || (usage.totalTokens === null && usage.costUsd === null)) return null
  const parts = [
    usage.totalTokens !== null ? `${usage.totalTokens.toLocaleString("en")} tokens` : null,
    usage.costUsd !== null ? `$${usage.costUsd.toFixed(usage.costUsd < 1 ? 3 : 2)}` : null,
  ].filter(Boolean)
  return <p className="quiet small">This run used {parts.join(", ")}.</p>
}

/** The head of the reading pane: the score when there is one, then what was mirrored. */
function Summary({ mirror }: { mirror: Mirror }) {
  const result = mirror.result
  const scored = mirror.mode === "section" && mirror.status === "completed" && result
  const { score } = scoreDial(result?.matchScore)
  return (
    <header className="summary">
      {scored ? (
        <div className="score">
          <ScoreDial matchScore={result.matchScore} className="score-dial" />
          <p className="score-number">{score}</p>
          <p className="score-words">
            <span className="heavy">{scoreWord(score)}</span>
            <span className="light">
              {result.passes} {result.passes === 1 ? "pass" : "passes"}, pixels matching
            </span>
          </p>
        </div>
      ) : null}
      <WearButton mirror={mirror} />
      <h1 className="mirror-title">{mirrorLabel(mirror)}</h1>
      <dl className="facts">
        <div>
          <dt>Status</dt>
          <dd>{statusWord(mirror.status)}</dd>
        </div>
        <div>
          <dt>Page</dt>
          <dd>
            <a className="text-link" href={mirror.url} target="_blank" rel="noreferrer">
              {hostOf(mirror.url)}
            </a>
          </dd>
        </div>
        <div>
          <dt>Asked for</dt>
          <dd>{mirror.mode === "brand" ? "the whole brand" : (mirror.target ?? "one section")}</dd>
        </div>
        {mirror.artifacts.report && mirror.mode === "section" ? (
          <div>
            <dt>Whole site</dt>
            <dd>
              <a className="text-link" href={`/api/mirrors/${mirror.id}/artifacts/report`} target="_blank" rel="noreferrer">
                Site report
              </a>
            </dd>
          </div>
        ) : null}
        {result?.chosenSelector ? (
          <div>
            <dt>Element</dt>
            <dd>
              <code>{result.chosenSelector}</code>
            </dd>
          </div>
        ) : null}
      </dl>
      {result?.summary ? <p>{result.summary}</p> : null}
    </header>
  )
}

interface Part {
  id: string
  label: string
  body: ReactNode
}

export function MirrorView({ initial }: { initial: Mirror }) {
  const { mirror, events, streaming } = useMirror(initial)
  const running = !isTerminal(mirror.status)
  // Folded once there is a result to read; open while the notes are all there is.
  const [notesOpen, setNotesOpen] = useState(initial.status !== "completed")
  // The picture shown large, if any. The strip, the corner labels and the brand page all set it.
  const [openShot, setOpenShot] = useState<ArtifactName | null>(null)
  const shots = useMemo(() => shotsOf(mirror.artifacts), [mirror.artifacts])
  const items = useMemo(() => foldFeed(events), [events])
  const inferred = useMemo(() => inferStage(events.map((stored) => stored.event)), [events])

  // The run is the authority on how it ended; events only place it on the trail.
  const failed = mirror.status === "failed" || mirror.status === "timed_out"
  const trailEvents = useMemo(() => events.filter((stored) => stored.event.type !== "run.status").map((stored) => stored.event), [events])
  const lastStop = useMemo(() => inferStage(trailEvents) as TrailStage, [trailEvents])
  const reached = mirror.status === "completed" || (!failed && inferred === "done") ? "done" : lastStop
  const closed = failed || inferred === "failed"

  const mismatches = mirror.result?.mismatches ?? []
  const caveats = mirror.result?.caveats ?? []
  const maybeParts: (Part | false)[] = [
    shots.length > 0 && { id: "shots", label: "Screenshots", body: <ShotStrip id={mirror.id} shots={shots} onOpen={setOpenShot} /> },
    mismatches.length > 0 && {
      id: "differs",
      label: "Mismatches",
      body: (
        <ul className="mismatches">
          {mismatches.map((mismatch) => (
            <li key={`${mismatch.region}:${mismatch.reason}`}>
              <span className="heavy-label">{mismatch.region}</span>
              <span>{mismatch.reason}</span>
            </li>
          ))}
        </ul>
      ),
    },
    caveats.length > 0 && {
      id: "caveats",
      label: "Caveats",
      body: (
        <ul className="plain-list">
          {caveats.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ),
    },
    { id: "tokens", label: "Tokens", body: <TokensPanel mirror={mirror} /> },
    { id: "code", label: "Get the code", body: <CodePanel mirror={mirror} /> },
  ]
  const parts = maybeParts.filter((part): part is Part => part !== false)

  return (
    <div className="bench">
      {/* The stage: the comparison, or the trail while there is none yet. */}
      <section className={failed ? "stage stage-broke" : "stage"} aria-label={running ? "Progress" : "Comparison"}>
        {mirror.status === "completed" ? (
          <Compare mirror={mirror} onOpen={setOpenShot} />
        ) : (
          <div className="stage-wait">
            <Trail reached={reached} closed={closed} />
            {failed ? <Broke mirror={mirror} /> : <p className="stage-note">The comparison shows up here when the mirror is done. It usually takes a few minutes.</p>}
          </div>
        )}
      </section>

      <aside className="reading">
        <nav className="jump" aria-label="Sections">
          {parts.map((part) => (
            <a key={part.id} href={`#${part.id}`}>
              {part.label}
            </a>
          ))}
          <a href="#notes" onClick={() => setNotesOpen(true)}>
            Field notes
          </a>
        </nav>

        <Summary mirror={mirror} />

        {parts.map((part) => (
          <section key={part.id} id={part.id} className="part">
            <h2>{part.label}</h2>
            {part.body}
          </section>
        ))}

        <details id="notes" className="part part-notes" open={notesOpen} onToggle={(event) => setNotesOpen(event.currentTarget.open)}>
          <summary>
            <h2>Field notes</h2>
            <span className="count">{items.length}</span>
          </summary>
          <FieldNotes items={items} live={streaming && running} visible={notesOpen} />
        </details>

        <Usage mirror={mirror} />
      </aside>

      <ShotDialog id={mirror.id} shots={shots} open={openShot} onChange={setOpenShot} />
    </div>
  )
}
