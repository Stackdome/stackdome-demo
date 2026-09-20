// The use cases. Each one reads as a sequence of gateway actions (axernel.ts,
// db.ts, artifactCache.ts) joined by calculations (mirrorCalc.ts).
import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"

import type { MirrorRequest } from "../mirrorRequest"
import { registryFileName } from "../registry"
import { isTerminal, type ArtifactName, type Mirror } from "../types"
import { cacheArtifact, cachedArtifact, cachedRegistryFile, isRegistryUnpacked, unpackRegistry } from "./artifactCache"
import { downloadArtifact, isRunGone, readRun, startRun, streamRunEvents } from "./axernel"
import { eventsAfter, getMirror, insertEvent, insertMirror, lastControlJson, lastSequence, listMirrorRows, updateMirror, type EventRow, type MirrorRow } from "./db"
import { ARTIFACT_FILES, availableArtifactId, isRepeatedControl, MAX_FAILURES, newMirrorRow, nextPumpStep, runFields, runInputData, sessionTitle, toMirror, type StreamedEvent } from "./mirrorCalc"

export async function startMirror(request: MirrorRequest): Promise<string> {
  const id = randomUUID()
  const run = await startRun(id, sessionTitle(request), runInputData(request))
  insertMirror(newMirrorRow(id, request, run, new Date()))
  ensurePump(id)
  return id
}

export function listMirrors(): Mirror[] {
  return listMirrorRows().map(toMirror)
}

export async function readMirror(id: string): Promise<Mirror | undefined> {
  const row = await refreshMirror(id)
  return row && toMirror(row)
}

/** The row with the run's current state. A settled run is served from
 *  SQLite; if Axernel cannot be reached the last known row stands. */
async function refreshMirror(id: string): Promise<MirrorRow | undefined> {
  const row = getMirror(id)
  if (!row || row.settled) return row
  try {
    updateMirror(id, runFields(await readRun(row.run_id)))
  } catch (error) {
    console.error(`[mir] could not refresh run ${row.run_id}:`, error)
  }
  return getMirror(id)
}

// --- Artifacts -------------------------------------------------------------
// Axernel only hands an artifact over whole, so each is cached on disk once
// and served from the file.

// In-flight downloads, so concurrent requests share one.
const downloads = new Map<string, Promise<string>>()

/** Path of the cached artifact file, or null when the run has no such artifact. */
export async function artifactFile(id: string, name: ArtifactName): Promise<string | null> {
  const row = await refreshMirror(id)
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

/** Path of one file of the mirror's shadcn registry, or null. The zip is
 *  fetched and unpacked on the first ask; after that it is all disk. */
export async function registryFile(id: string, file: string): Promise<string | null> {
  const fileName = registryFileName(file)
  if (!fileName) return null
  if (!isRegistryUnpacked(id)) {
    const zip = await artifactFile(id, "registry")
    if (!zip) return null
    await unpackRegistry(id, zip)
  }
  return cachedRegistryFile(id, fileName)
}

// --- Event pump ------------------------------------------------------------
// One pump per live mirror copies Axernel's stream into SQLite. Browser
// connections only ever tail SQLite, so a closed tab never stops the pump.
//
// A mirror is pumping exactly while it has an entry in `pumps`. The
// entry is the pump's signal: "event" after a row is written, "done" once
// the pump has stopped (see PumpStep for the reasons it stops).

const pumps = ((globalThis as unknown as { __mirPumps?: Map<string, EventEmitter> }).__mirPumps ??= new Map<string, EventEmitter>())

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
  const row = getMirror(id)
  if (!row) return undefined
  // A finished run gets no new pump, but one still draining it is listened to.
  const signal = isTerminal(row.status) ? pumps.get(id) : ensurePump(id)
  return { signal, eventsAfter: (seq) => eventsAfter(id, seq) }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Keeps one streamed event. Returns whether a row was written. */
function storeEvent(id: string, event: StreamedEvent): boolean {
  if (event.type === "stream.end") return false
  if (event.sequence === undefined && isRepeatedControl(lastControlJson(id), event)) return false
  return insertEvent(id, event.sequence ?? null, JSON.stringify(event))
}

async function pump(id: string, signal: EventEmitter): Promise<void> {
  const row = getMirror(id)
  if (!row) return
  let failures = 0
  while (true) {
    try {
      for await (const event of streamRunEvents(row.run_id, lastSequence(id))) {
        failures = 0
        if (storeEvent(id, event)) signal.emit("event")
      }
    } catch (error) {
      failures = isRunGone(error) ? MAX_FAILURES : failures + 1
      console.error(`[mir] event stream for run ${row.run_id} dropped:`, error instanceof Error ? error.message : error)
    }
    // ponytail: gives up after repeated failures; the next visit to the
    // page starts a new pump, resuming from the last stored sequence.
    const step = nextPumpStep((await refreshMirror(id))?.status, failures)
    if (step.then === "stop") return
    await sleep(step.afterMs)
  }
}
