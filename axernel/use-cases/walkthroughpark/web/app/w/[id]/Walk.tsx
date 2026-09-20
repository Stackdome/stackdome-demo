"use client"

import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { inferStage, STAGES, type TrailStage } from "@/lib/inferStage"
import { toFeedLine, type FeedLine } from "@/lib/toFeedLine"
import { isTerminal, type RunEvent, type Walkthrough } from "@/lib/types"

import { Signpost, Squiggle } from "../../doodles"
import { startWalk } from "../../GateForm"
import { statusTone, statusWord } from "../../status"

const STAGE_LABELS: Record<TrailStage, string> = {
  reading: "Reading",
  planning: "Planning",
  booting: "Booting app",
  recording: "Recording",
  rendering: "Rendering",
}

interface StoredEvent {
  seq: number
  event: RunEvent
}

interface FeedItem extends FeedLine {
  id: string
  raw: RunEvent
}

/** The engine opens a run by echoing the run input as a text part. */
function isInputEcho(text: string): boolean {
  if (!text.trimStart().startsWith("{")) return false
  try {
    return typeof JSON.parse(text) === "object"
  } catch {
    return false
  }
}

/** Folds events into feed lines. Lines that share a key are one line, so
 *  streamed text grows in place and a tool call updates its own line. */
function foldFeed(events: StoredEvent[]): FeedItem[] {
  const items: FeedItem[] = []
  const byKey = new Map<string, number>()
  for (const { seq, event } of events) {
    const line = toFeedLine(event)
    if (!line) continue
    const at = line.key === undefined ? undefined : byKey.get(line.key)
    const previous = at === undefined ? undefined : items[at]
    if (at !== undefined && previous) {
      items[at] = { ...previous, ...line, text: line.append ? previous.text + line.text : line.text, raw: event }
    } else {
      if (line.key !== undefined) byKey.set(line.key, items.length)
      items.push({ ...line, id: line.key ?? `seq:${seq}`, raw: event })
    }
  }
  return items.filter((item) => !(item.kind === "note" && isInputEcho(item.text)))
}

function useWalk(initial: Walkthrough) {
  const [walk, setWalk] = useState(initial)
  const [events, setEvents] = useState<StoredEvent[]>([])
  const [streaming, setStreaming] = useState(true)

  const refetch = useCallback(async () => {
    const response = await fetch(`/api/walkthroughs/${initial.id}`, { cache: "no-store" }).catch(() => null)
    if (response?.ok) setWalk((await response.json()) as Walkthrough)
  }, [initial.id])

  useEffect(() => {
    const source = new EventSource(`/api/walkthroughs/${initial.id}/events`)
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
  // until the run is terminal and, when it completed, its video is ready.
  const settled = isTerminal(walk.status) && (walk.status !== "completed" || walk.artifacts.walkthrough)
  useEffect(() => {
    if (settled) return
    const timer = setInterval(() => void refetch(), 5000)
    return () => clearInterval(timer)
  }, [settled, refetch])

  return { walk, events, streaming }
}

const POST_FILL = { done: "var(--grass)", current: "var(--sun)", closed: "var(--clay)", ahead: "var(--card)" } as const

/** `reached` is the stop the walk is at, or "done". `closed` marks that stop
 *  as where a failed walk ended. */
function Trail({ reached, closed }: { reached: TrailStage | "done"; closed: boolean }) {
  const at = reached === "done" ? STAGES.length : STAGES.indexOf(reached)
  return (
    <ol className="trail" aria-label="Progress">
      {STAGES.map((name, index) => {
        const state = index < at ? "done" : index > at ? "ahead" : closed ? "closed" : "current"
        return (
          <li key={name} className={`trail-stop trail-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <Signpost className="trail-post" checked={state === "done"} fill={POST_FILL[state]} />
            <span className="trail-label">{STAGE_LABELS[name]}</span>
            {state === "done" ? <span className="sr-only"> (done)</span> : null}
            {state === "closed" ? <span className="sr-only"> (stopped here)</span> : null}
          </li>
        )
      })}
    </ol>
  )
}

function FieldNotes({ items, live }: { items: FeedItem[]; live: boolean }) {
  const [showRaw, setShowRaw] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  useEffect(() => {
    const element = box.current
    if (element && pinned.current) element.scrollTop = element.scrollHeight
  }, [items])

  return (
    <section className="card notes" aria-labelledby="notes-title">
      <div className="notes-head">
        <h2 id="notes-title">Field notes</h2>
        <label className="toggle">
          <input type="checkbox" checked={showRaw} onChange={(event) => setShowRaw(event.target.checked)} />
          <span>raw payloads</span>
        </label>
      </div>
      <div
        className="notes-feed"
        ref={box}
        onScroll={(event) => {
          const element = event.currentTarget
          pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48
        }}
      >
        {items.length === 0 ? <p className="quiet">{live ? "Waiting at the trailhead…" : "No notes were kept for this walk."}</p> : null}
        <ul className="notes-list">
          {items.map((item) => (
            <li key={item.id} className={`note note-${item.kind}`}>
              <span className="note-text">{item.text}</span>
              {showRaw ? <pre className="note-payload">{JSON.stringify(item.raw, null, 2)}</pre> : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Player({ walk }: { walk: Walkthrough }) {
  const video = useRef<HTMLVideoElement>(null)
  const [clean, setClean] = useState(false)
  const base = `/api/walkthroughs/${walk.id}`
  const src = `${base}/video${clean ? "?variant=clean" : ""}`
  const scenes = walk.result?.scenes ?? []

  function seek(seconds: number) {
    const element = video.current
    if (!element) return
    element.currentTime = seconds
    void element.play().catch(() => {})
  }

  function swap(next: boolean) {
    const at = video.current?.currentTime ?? 0
    setClean(next)
    // Keep the playhead when switching between the two cuts.
    requestAnimationFrame(() => {
      if (video.current) video.current.currentTime = at
    })
  }

  return (
    <section className="player" aria-label="Walkthrough video">
      <div className="player-frame">
        <video ref={video} key={src} src={src} controls playsInline preload="metadata" />
      </div>
      <div className="player-bar">
        {scenes.length > 0 ? (
          <ul className="scene-chips" aria-label="Jump to a scene">
            {scenes.map((scene, index) => (
              <li key={`${index}-${scene.startSec}`}>
                <button type="button" className="chip-button tilt" onClick={() => seek(scene.startSec)}>
                  <span className="chip-time">{formatClock(scene.startSec)}</span> {scene.scene}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {walk.artifacts.clean ? (
          <label className="toggle">
            <input type="checkbox" checked={clean} onChange={(event) => swap(event.target.checked)} />
            <span>without captions</span>
          </label>
        ) : null}
      </div>
    </section>
  )
}

const formatClock = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

function SceneCards({ walk }: { walk: Walkthrough }) {
  const scenes = walk.result?.scenes ?? []
  if (scenes.length === 0) return null
  return (
    <section aria-labelledby="scenes-title">
      <h2 id="scenes-title">Scenes</h2>
      <ol className="scene-cards">
        {scenes.map((scene, index) => (
          <li key={`${index}-${scene.startSec}`} className="card index-card">
            <span className="index-card-head">
              <span className="index-card-number">{index + 1}</span>
              <span className="index-card-title">{scene.scene}</span>
              <span className="quiet">{formatClock(scene.startSec)}</span>
            </span>
            <p>{scene.narration}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Findings({ walk }: { walk: Walkthrough }) {
  const result = walk.result
  const base = `/api/walkthroughs/${walk.id}`
  if (!result) return null
  return (
    <>
      <section className="card summary">
        <p>{result.summary}</p>
        {result.understoodFrom?.length > 0 ? (
          <>
            <h3>Understood from</h3>
            <ul className="plain-list">
              {result.understoodFrom.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="downloads">
          {walk.artifacts.walkthrough ? (
            <a className="button button-small tilt" href={`${base}/video?download=1`}>
              Download mp4
            </a>
          ) : null}
          {walk.artifacts.captions ? (
            <a className="button button-small button-plain tilt" href={`${base}/srt?download=1`}>
              Download srt
            </a>
          ) : null}
        </div>
      </section>
      <Caveats items={result.caveats} />
    </>
  )
}

function Caveats({ items }: { items: string[] | undefined }) {
  if (!items || items.length === 0) return null
  return (
    <section className="card card-sun caveats">
      <h3>Caveats</h3>
      <ul className="plain-list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

function TrailClosed({ walk }: { walk: Walkthrough }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function retry() {
    setBusy(true)
    setError(null)
    try {
      // HEAD stands in for the branch: parseSource drops it and keeps the path.
      const url = walk.subdir ? `${walk.source}/tree/HEAD/${walk.subdir}` : walk.source
      const id = await startWalk({ url, maxSeconds: walk.maxSeconds, ...(walk.instruction ? { instruction: walk.instruction } : {}) })
      router.push(`/w/${id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not start again.")
      setBusy(false)
    }
  }

  return (
    <section className="card card-clay closed" role="alert">
      <h2>Trail closed</h2>
      <p>{walk.error?.message ?? (walk.status === "timed_out" ? "The walk ran out of time." : "The walk could not be finished.")}</p>
      {walk.error?.phase ? <p className="quiet">It stopped during {walk.error.phase}.</p> : null}
      <button type="button" className="button tilt" onClick={retry} disabled={busy}>
        {busy ? "Lacing up…" : "Try again"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </section>
  )
}

function UsageFooter({ walk }: { walk: Walkthrough }) {
  const usage = walk.usage
  if (!usage || (usage.totalTokens === null && usage.costUsd === null)) return null
  const parts = [
    usage.totalTokens !== null ? `${usage.totalTokens.toLocaleString("en")} tokens` : null,
    usage.costUsd !== null ? `$${usage.costUsd.toFixed(usage.costUsd < 1 ? 3 : 2)}` : null,
    walk.result?.durationSec ? `${Math.round(walk.result.durationSec)}s of video` : null,
  ].filter(Boolean)
  return <footer className="usage quiet">{parts.join(" · ")}</footer>
}

export function Walk({ initial }: { initial: Walkthrough }) {
  const { walk, events, streaming } = useWalk(initial)
  const items = useMemo(() => foldFeed(events), [events])
  const inferred = useMemo(() => inferStage(events.map((stored) => stored.event)), [events])

  // The run is the authority on how it ended; events only place it on the trail.
  const failed = walk.status === "failed" || walk.status === "timed_out"
  const trailEvents = useMemo(() => events.filter((stored) => stored.event.type !== "run.status").map((stored) => stored.event), [events])
  const lastStop = useMemo(() => inferStage(trailEvents) as TrailStage, [trailEvents])
  const reached = walk.status === "completed" || (!failed && inferred === "done") ? "done" : lastStop
  const title = walk.result?.title || walk.source.replace("https://github.com/", "")

  return (
    <div className="walk">
      <div className="walk-head">
        <h1 className="walk-title">
          {title}
          <Squiggle color={`var(--${statusTone(walk.status)})`} />
        </h1>
        <p className="walk-meta">
          <span className={`stamp stamp-${statusTone(walk.status)}`}>{statusWord(walk.status)}</span>
          <a href={walk.source} target="_blank" rel="noreferrer" className="quiet">
            {walk.kind === "pr" ? "pull request" : "repo"}
            {walk.subdir ? ` · ${walk.subdir}` : ""} · {walk.maxSeconds}s
          </a>
        </p>
        {walk.instruction ? <p className="walk-ask">“{walk.instruction}”</p> : null}
      </div>

      {walk.status === "completed" && walk.artifacts.walkthrough ? <Player walk={walk} /> : null}
      {walk.status === "completed" && !walk.artifacts.walkthrough ? (
        <section className="card card-sun">
          <p>The walk finished but no video came back{walk.result?.caveats?.length ? ". The caveats below say why." : " yet."}</p>
        </section>
      ) : null}
      {failed ? <TrailClosed walk={walk} /> : null}

      <div className="walk-columns">
        <aside className="walk-trail" aria-label="Trail">
          <Trail reached={reached} closed={failed || inferred === "failed"} />
        </aside>
        <div className="walk-main">
          {failed ? <Caveats items={walk.result?.caveats} /> : <Findings walk={walk} />}
          <SceneCards walk={walk} />
          <FieldNotes items={items} live={streaming && !isTerminal(walk.status)} />
          <UsageFooter walk={walk} />
        </div>
      </div>
    </div>
  )
}
