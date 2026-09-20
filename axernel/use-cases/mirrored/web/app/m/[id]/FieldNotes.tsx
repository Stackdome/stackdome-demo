"use client"

import { useEffect, useRef, useState } from "react"

import { toFeedLine, type FeedLine } from "@/lib/toFeedLine"
import type { RunEvent } from "@/lib/types"

export interface StoredEvent {
  seq: number
  event: RunEvent
}

export interface FeedItem extends FeedLine {
  id: string
  raw: RunEvent
  /** Seconds into the run when the line first appeared, when the events say. */
  elapsedSec: number | null
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
export function foldFeed(events: StoredEvent[]): FeedItem[] {
  const items: FeedItem[] = []
  const byKey = new Map<string, number>()
  const startedAt = Date.parse(events.find((stored) => stored.event.timestamp)?.event.timestamp ?? "")
  for (const { seq, event } of events) {
    const line = toFeedLine(event)
    if (!line) continue
    const at = line.key === undefined ? undefined : byKey.get(line.key)
    const previous = at === undefined ? undefined : items[at]
    if (at !== undefined && previous) {
      items[at] = { ...previous, ...line, text: line.append ? previous.text + line.text : line.text, raw: event }
    } else {
      if (line.key !== undefined) byKey.set(line.key, items.length)
      const when = Date.parse(event.timestamp ?? "")
      items.push({ ...line, id: line.key ?? `seq:${seq}`, raw: event, elapsedSec: Number.isNaN(when) ? null : Math.max(0, (when - startedAt) / 1000) })
    }
  }
  return items.filter((item) => !(item.kind === "note" && isInputEcho(item.text)))
}

const formatClock = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds))
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`
}

/** A tool line reads "Ran mir-reflect": the verb stays prose, the rest is code. */
function NoteText({ item }: { item: FeedItem }) {
  const space = item.kind === "tool" ? item.text.indexOf(" ") : -1
  if (space < 0) return <span className="note-text">{item.text}</span>
  return (
    <span className="note-text">
      {item.text.slice(0, space)} <code className="note-code">{item.text.slice(space + 1)}</code>
    </span>
  )
}

export function FieldNotes({ items, live, visible }: { items: FeedItem[]; live: boolean; visible: boolean }) {
  const [showRaw, setShowRaw] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // A folded section has no height, so catch up when it is opened too.
  useEffect(() => {
    const element = box.current
    if (element && visible && pinned.current) element.scrollTop = element.scrollHeight
  }, [items, visible])

  return (
    <>
      <label className="toggle notes-raw">
        <input type="checkbox" checked={showRaw} onChange={(event) => setShowRaw(event.target.checked)} />
        <span>raw payloads</span>
      </label>
      <div
        className="notes-feed"
        ref={box}
        onScroll={(event) => {
          const element = event.currentTarget
          pinned.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48
        }}
      >
        {items.length === 0 ? <p className="quiet">{live ? "Waiting for the agent to open the page…" : "No notes were kept for this mirror."}</p> : null}
        <ol className="notes-list">
          {items.map((item) => (
            <li key={item.id} className={`note note-${item.kind}`}>
              <span className="note-time">{item.elapsedSec === null ? "" : formatClock(item.elapsedSec)}</span>
              <NoteText item={item} />
              {showRaw ? <pre className="note-payload">{JSON.stringify(item.raw, null, 2)}</pre> : null}
            </li>
          ))}
        </ol>
      </div>
    </>
  )
}
