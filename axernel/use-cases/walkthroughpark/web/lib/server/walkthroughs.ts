import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { existsSync, mkdirSync } from "node:fs"
import { rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { AuthenticationError, NotFoundError, type Run } from "@axernel/sdk"

import { isTerminal, type MaxSeconds, type RunStatus, type Walkthrough, type WalkResult } from "../types"
import { forgetAxernel, getAxernel, withAxernel } from "./axernel"
import { DATA_DIR, getWalk, insertEvent, insertWalk, lastControlJson, lastSequence, updateWalk, type WalkRow } from "./db"

export interface WalkInput {
  source: string
  ref?: string
  subdir?: string
  instruction?: string
  maxSeconds: MaxSeconds
  kind: "repo" | "pr"
}

/** Artifact name on the run, and the file it is cached and downloaded as. */
export const ARTIFACT_FILES = {
  walkthrough: { fileName: "walkthrough.mp4", contentType: "video/mp4" },
  clean: { fileName: "walkthrough-clean.mp4", contentType: "video/mp4" },
  captions: { fileName: "walkthrough.srt", contentType: "application/x-subrip; charset=utf-8" },
} as const
export type ArtifactName = keyof typeof ARTIFACT_FILES

type StoredArtifacts = Partial<Record<string, { status: string; artifactId: string | null }>>

function parse<T>(json: string | null): T | null {
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

export function toWalkthrough(row: WalkRow): Walkthrough {
  const artifacts = parse<StoredArtifacts>(row.artifacts) ?? {}
  const has = (name: ArtifactName): boolean => artifacts[name]?.status === "available" && Boolean(artifacts[name]?.artifactId)
  return {
    id: row.id,
    source: row.source,
    subdir: row.subdir,
    instruction: row.instruction,
    maxSeconds: row.max_seconds as MaxSeconds,
    kind: row.kind === "pr" ? "pr" : "repo",
    status: row.status as RunStatus,
    result: parse<WalkResult>(row.result),
    error: parse(row.error),
    usage: parse(row.usage),
    artifacts: { walkthrough: has("walkthrough"), captions: has("captions"), clean: has("clean") },
    createdAt: row.created_at,
  }
}

function runFields(run: Run): Parameters<typeof updateWalk>[1] {
  const artifacts: StoredArtifacts = {}
  for (const output of run.artifactOutputs ?? []) artifacts[output.name] = { status: output.status, artifactId: output.artifactId }
  const pending = Object.values(artifacts).some((artifact) => artifact?.status === "pending")
  const usage = run.usage ? { totalTokens: run.usage.totalTokens, costUsd: run.usage.costUsd } : null
  return {
    status: run.status,
    settled: isTerminal(run.status) && !pending ? 1 : 0,
    result: run.response?.kind === "result" ? JSON.stringify(run.response.value) : null,
    error: run.error ? JSON.stringify(run.error) : null,
    usage: usage ? JSON.stringify(usage) : null,
    artifacts: JSON.stringify(artifacts),
  }
}

export async function createWalkthrough(input: WalkInput): Promise<string> {
  const id = randomUUID()
  const data = {
    source: input.source,
    ...(input.ref ? { ref: input.ref } : {}),
    ...(input.subdir ? { subdir: input.subdir } : {}),
    ...(input.instruction ? { instruction: input.instruction } : {}),
    maxSeconds: input.maxSeconds,
  }
  const run = await withAxernel(async (client, config) => {
    const session = await client.sessions.create(
      config.projectId,
      { agentId: config.agentId, checkpointingEnabled: false, metadata: { walkthroughId: id } },
      { idempotencyKey: `wtp-session-${id}` },
    )
    return client.runs.create(session.id, { input: { data }, metadata: { walkthroughId: id } }, { idempotencyKey: `wtp-run-${id}` })
  })
  insertWalk({
    id,
    source: input.source,
    subdir: input.subdir ?? null,
    instruction: input.instruction ?? null,
    max_seconds: input.maxSeconds,
    kind: input.kind,
    session_id: run.sessionId,
    run_id: run.id,
    created_at: new Date().toISOString(),
    ...runFields(run),
  })
  ensureRelay(id)
  return id
}

/** The row with the run's current state. A settled run is served from
 *  SQLite; if Axernel cannot be reached the last known row stands. */
export async function refreshWalk(id: string): Promise<WalkRow | undefined> {
  const row = getWalk(id)
  if (!row || row.settled) return row
  try {
    const run = await withAxernel((client) => client.runs.get(row.run_id))
    updateWalk(id, runFields(run))
  } catch (error) {
    console.error(`[wtp] could not refresh run ${row.run_id}:`, error)
  }
  return getWalk(id)
}

// --- Event relay -----------------------------------------------------------
// One pump per live walkthrough copies Axernel's stream into SQLite. Browser
// connections only ever tail SQLite, so a closed tab never stops the pump.

const STREAM_TIMEOUT_MS = 60 * 60 * 1000
const MAX_FAILURES = 8

const relays = ((globalThis as unknown as { __wtpRelays?: Map<string, EventEmitter> }).__wtpRelays ??= new Map<string, EventEmitter>())

export function activeRelay(id: string): EventEmitter | undefined {
  return relays.get(id)
}

export function ensureRelay(id: string): EventEmitter {
  const existing = relays.get(id)
  if (existing) return existing
  const relay = new EventEmitter()
  relay.setMaxListeners(0)
  relays.set(id, relay)
  void pump(id, relay).finally(() => {
    relays.delete(id)
    relay.emit("done")
  })
  return relay
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function store(id: string, event: { sequence?: number; type: string; data: unknown }): boolean {
  if (event.type === "stream.end") return false
  if (event.sequence === undefined) {
    // Control frames carry no sequence and are sent again on every
    // reconnect: keep one only when it differs from the last one kept.
    const last = parse<{ type: string; data: unknown }>(lastControlJson(id) ?? null)
    if (last && last.type === event.type && JSON.stringify(last.data) === JSON.stringify(event.data)) return false
  }
  return insertEvent(id, event.sequence ?? null, JSON.stringify(event))
}

async function pump(id: string, relay: EventEmitter): Promise<void> {
  const row = getWalk(id)
  if (!row) return
  let failures = 0
  while (true) {
    try {
      const client = await getAxernel()
      const stream = client.runs.events(row.run_id, { lastEventId: lastSequence(id), timeoutMs: STREAM_TIMEOUT_MS })
      for await (const event of stream) {
        failures = 0
        if (store(id, event)) relay.emit("event")
      }
    } catch (error) {
      failures += 1
      if (error instanceof AuthenticationError) forgetAxernel()
      if (error instanceof NotFoundError) failures = MAX_FAILURES
      console.error(`[wtp] event stream for run ${row.run_id} dropped:`, error instanceof Error ? error.message : error)
    }
    const fresh = await refreshWalk(id)
    if (!fresh || isTerminal(fresh.status)) return
    // ponytail: gives up after repeated failures; the next visit to the
    // page starts a new pump, resuming from the last stored sequence.
    if (failures >= MAX_FAILURES) return
    await sleep(Math.min(1000 * 2 ** failures, 15_000))
  }
}

// --- Artifacts -------------------------------------------------------------
// The SDK only downloads an artifact whole, so each is cached on disk once
// and ranges are served from the file.

const downloads = new Map<string, Promise<string>>()

/** Path of the cached artifact file, or null when the run has no such artifact. */
export async function artifactFile(id: string, name: ArtifactName): Promise<string | null> {
  const row = await refreshWalk(id)
  const artifactId = parse<StoredArtifacts>(row?.artifacts ?? null)?.[name]?.artifactId
  if (!row || !artifactId || !toWalkthrough(row).artifacts[name]) return null

  const dir = path.join(DATA_DIR, "artifacts", id)
  const file = path.join(dir, ARTIFACT_FILES[name].fileName)
  if (existsSync(file)) return file

  const key = `${id}:${name}`
  let download = downloads.get(key)
  if (!download) {
    download = (async () => {
      mkdirSync(dir, { recursive: true })
      const bytes = await withAxernel((client) => client.artifacts.download(artifactId, { timeoutMs: 5 * 60 * 1000 }))
      const partial = `${file}.${randomUUID()}.part`
      await writeFile(partial, bytes)
      await rename(partial, file)
      return file
    })().finally(() => downloads.delete(key))
    downloads.set(key, download)
  }
  return download
}
