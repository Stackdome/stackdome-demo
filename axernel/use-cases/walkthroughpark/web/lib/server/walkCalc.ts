// Calculations only: values in, values out. No SDK calls, SQLite, files or
// clock in here, which is why all of it can be pinned by walkCalc.spec.ts.
import type { Run } from "@axernel/sdk"

import { isTerminal, type MaxSeconds, type RunStatus, type Walkthrough, type WalkResult } from "../types"
import type { WalkRow } from "./db"

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
type RunFields = Pick<WalkRow, "status" | "settled" | "result" | "error" | "usage" | "artifacts">

function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

/** `input.data` of the run. The agent's input contract rejects unknown and empty keys. */
export function runInputData(input: WalkInput): Record<string, unknown> {
  return {
    source: input.source,
    ...(input.ref ? { ref: input.ref } : {}),
    ...(input.subdir ? { subdir: input.subdir } : {}),
    ...(input.instruction ? { instruction: input.instruction } : {}),
    maxSeconds: input.maxSeconds,
  }
}

const TITLE_INSTRUCTION_MAX = 60

/** Human-readable session title, shown by the Axernel UI: what is walked through, then what was asked. */
export function sessionTitle(input: WalkInput): string {
  const [repo = "", pr] = input.source.replace("https://github.com/", "").split("/pull/")
  const target = pr ? `${repo} PR #${pr}` : `${repo}${input.ref ? ` @ ${input.ref}` : ""}${input.subdir ? ` / ${input.subdir}` : ""}`
  const asked = input.instruction?.trim().split("\n")[0]?.trim() ?? ""
  if (!asked) return target
  return `${target}: ${asked.length > TITLE_INSTRUCTION_MAX ? `${asked.slice(0, TITLE_INSTRUCTION_MAX)}…` : asked}`
}

/** The columns a run decides. Settled means nothing about the run can change
 *  any more: it is terminal and no artifact is still being collected. */
export function runFields(run: Run): RunFields {
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

export function newWalkRow(id: string, input: WalkInput, run: Run, now: Date): WalkRow {
  return {
    id,
    source: input.source,
    subdir: input.subdir ?? null,
    instruction: input.instruction ?? null,
    max_seconds: input.maxSeconds,
    kind: input.kind,
    session_id: run.sessionId,
    run_id: run.id,
    created_at: now.toISOString(),
    ...runFields(run),
  }
}

/** Id of the run's artifact of that name, once Axernel has it available. */
export function availableArtifactId(row: WalkRow, name: ArtifactName): string | null {
  const artifact = parse<StoredArtifacts>(row.artifacts)?.[name]
  return artifact?.status === "available" && artifact.artifactId ? artifact.artifactId : null
}

export function toWalkthrough(row: WalkRow): Walkthrough {
  const has = (name: ArtifactName): boolean => availableArtifactId(row, name) !== null
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

// --- Event pump decisions ---------------------------------------------------

export interface StreamedEvent {
  sequence?: number | undefined
  type: string
  data?: unknown
}

/** Control frames carry no sequence and are sent again on every reconnect:
 *  one is a repeat when it equals the last control frame kept. */
export function isRepeatedControl(lastControlJson: string | undefined, event: StreamedEvent): boolean {
  const last = parse<StreamedEvent>(lastControlJson)
  return Boolean(last) && last?.type === event.type && JSON.stringify(last.data) === JSON.stringify(event.data)
}

export const MAX_FAILURES = 8

export type PumpStep = { then: "stop"; why: "walk-gone" | "run-finished" | "gave-up" } | { then: "reconnect"; afterMs: number }

/** What the pump does once a connection has ended, given the refreshed run
 *  status (undefined: the row is gone) and the failures in a row so far. */
export function nextPumpStep(status: string | undefined, failures: number): PumpStep {
  if (status === undefined) return { then: "stop", why: "walk-gone" }
  if (isTerminal(status)) return { then: "stop", why: "run-finished" }
  if (failures >= MAX_FAILURES) return { then: "stop", why: "gave-up" }
  return { then: "reconnect", afterMs: Math.min(1000 * 2 ** failures, 15_000) }
}
