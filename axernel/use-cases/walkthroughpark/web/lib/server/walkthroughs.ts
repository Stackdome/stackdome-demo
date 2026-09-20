// The use cases. Each one reads as a sequence of gateway actions (axernel.ts,
// db.ts, artifactCache.ts, github.ts) joined by calculations (walkCalc.ts).
import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"

import { isTerminal, type Walkthrough } from "../types"
import { placeInRepo, type WalkRequest } from "../walkRequest"
import { cacheArtifact, cachedArtifact } from "./artifactCache"
import { downloadArtifact, isRunGone, readRun, startRun, streamRunEvents } from "./axernel"
import { eventsAfter, getWalk, insertEvent, insertWalk, lastControlJson, lastSequence, listWalks, updateWalk, type EventRow, type WalkRow } from "./db"
import { listBranches } from "./github"
import { ARTIFACT_FILES, availableArtifactId, isRepeatedControl, MAX_FAILURES, newWalkRow, nextPumpStep, runFields, runInputData, sessionTitle, toWalkthrough, type ArtifactName, type StreamedEvent, type WalkInput } from "./walkCalc"

export async function startWalkthrough(request: WalkRequest): Promise<string> {
  const id = randomUUID()
  const place = placeInRepo(request, request.treePath ? await listBranches(request.source) : [])
  const { treePath: _unsplit, ...target } = request
  const input: WalkInput = { ...target, ...place }
  const run = await startRun(id, sessionTitle(input), runInputData(input))
  insertWalk(newWalkRow(id, input, run, new Date()))
  ensurePump(id)
  return id
}

export function listWalkthroughs(): Walkthrough[] {
  return listWalks().map(toWalkthrough)
}

export async function readWalkthrough(id: string): Promise<Walkthrough | undefined> {
  const row = await refreshWalk(id)
  return row && toWalkthrough(row)
}

/** The row with the run's current state. A settled run is served from
 *  SQLite; if Axernel cannot be reached the last known row stands. */
async function refreshWalk(id: string): Promise<WalkRow | undefined> {
  const row = getWalk(id)
  if (!row || row.settled) return row
  try {
    updateWalk(id, runFields(await readRun(row.run_id)))
  } catch (error) {
    console.error(`[wtp] could not refresh run ${row.run_id}:`, error)
  }
  return getWalk(id)
}

// --- Artifacts -------------------------------------------------------------
// Axernel only hands an artifact over whole, so each is cached on disk once
// and ranges are served from the file.

// In-flight downloads, so concurrent range requests share one.
const downloads = new Map<string, Promise<string>>()

/** Path of the cached artifact file, or null when the run has no such artifact. */
export async function artifactFile(id: string, name: ArtifactName): Promise<string | null> {
  const row = await refreshWalk(id)
  const artifactId = row && availableArtifactId(row, name)
  if (!artifactId) return null

  const { fileName } = ARTIFACT_FILES[name]
  const cached = cachedArtifact(id, fileName)
  if (cached) return cached

  const key = `${id}:${name}`
  let download = downloads.get(key)
  if (!download) {
    download = downloadArtifact(artifactId)
      .then((bytes) => cacheArtifact(id, fileName, bytes))
      .finally(() => downloads.delete(key))
    downloads.set(key, download)
  }
  return download
}

// --- Event pump ------------------------------------------------------------
// One pump per live walkthrough copies Axernel's stream into SQLite. Browser
// connections only ever tail SQLite, so a closed tab never stops the pump.
//
// A walkthrough is pumping exactly while it has an entry in `pumps`. The
// entry is the pump's signal: "event" after a row is written, "done" once
// the pump has stopped (see PumpStep for the reasons it stops).

const pumps = ((globalThis as unknown as { __wtpRelays?: Map<string, EventEmitter> }).__wtpRelays ??= new Map<string, EventEmitter>())

function ensurePump(id: string): EventEmitter {
  const existing = pumps.get(id)
  if (existing) return existing
  const signal = new EventEmitter()
  signal.setMaxListeners(0)
  pumps.set(id, signal)
  void pump(id, signal).finally(() => {
    pumps.delete(id)
    signal.emit("done")
  })
  return signal
}

/** What a browser connection tails: stored events, and the pump's signal. With
 *  no signal there is nothing more to come: replay what is stored and end. */
export function eventFeed(id: string): { signal: EventEmitter | undefined; eventsAfter: (seq: number) => EventRow[] } | undefined {
  const row = getWalk(id)
  if (!row) return undefined
  // A finished run gets no new pump, but one still draining it is listened to.
  const signal = isTerminal(row.status) ? pumps.get(id) : ensurePump(id)
  return { signal, eventsAfter: (seq) => eventsAfter(id, seq) }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Returns whether a row was written. */
function store(id: string, event: StreamedEvent): boolean {
  if (event.type === "stream.end") return false
  if (event.sequence === undefined && isRepeatedControl(lastControlJson(id), event)) return false
  return insertEvent(id, event.sequence ?? null, JSON.stringify(event))
}

async function pump(id: string, signal: EventEmitter): Promise<void> {
  const row = getWalk(id)
  if (!row) return
  let failures = 0
  while (true) {
    try {
      for await (const event of streamRunEvents(row.run_id, lastSequence(id))) {
        failures = 0
        if (store(id, event)) signal.emit("event")
      }
    } catch (error) {
      failures = isRunGone(error) ? MAX_FAILURES : failures + 1
      console.error(`[wtp] event stream for run ${row.run_id} dropped:`, error instanceof Error ? error.message : error)
    }
    // ponytail: gives up after repeated failures; the next visit to the
    // page starts a new pump, resuming from the last stored sequence.
    const step = nextPumpStep((await refreshWalk(id))?.status, failures)
    if (step.then === "stop") return
    await sleep(step.afterMs)
  }
}
