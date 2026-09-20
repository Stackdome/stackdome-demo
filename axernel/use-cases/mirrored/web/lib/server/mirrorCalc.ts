// Calculations only: values in, values out. No SDK calls, SQLite, files or
// clock in here, which is why all of it can be pinned by mirrorCalc.spec.ts.
import type { Run } from "@axernel/sdk"

import type { MirrorRequest } from "../mirrorRequest"
import { ARTIFACT_NAMES, isTerminal, type ArtifactName, type Framework, type Mirror, type MirrorResult, type Mode, type RunStatus } from "../types"
import type { MirrorRow } from "./db"

/** Artifact name on the run, and the file it is cached and downloaded as. */
export const ARTIFACT_FILES: Record<ArtifactName, { fileName: string; contentType: string }> = {
  bundle: { fileName: "bundle.zip", contentType: "application/zip" },
  registry: { fileName: "registry.zip", contentType: "application/zip" },
  tokens: { fileName: "tokens.json", contentType: "application/json; charset=utf-8" },
  report: { fileName: "report.html", contentType: "text/html; charset=utf-8" },
  preview: { fileName: "preview.html", contentType: "text/html; charset=utf-8" },
  skin: { fileName: "skin.json", contentType: "application/json; charset=utf-8" },
  original: { fileName: "original.png", contentType: "image/png" },
  rebuild: { fileName: "rebuild.png", contentType: "image/png" },
  diff: { fileName: "diff.png", contentType: "image/png" },
  page: { fileName: "page.png", contentType: "image/png" },
}

export const isArtifactName = (name: string): name is ArtifactName => (ARTIFACT_NAMES as readonly string[]).includes(name)

type StoredArtifacts = Partial<Record<string, { status: string; artifactId: string | null }>>
type RunFields = Pick<MirrorRow, "status" | "settled" | "result" | "error" | "usage" | "artifacts">

function parse<T>(json: string | null | undefined): T | null {
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

/** `input.data` of the run. The agent's input contract rejects unknown keys. */
export function runInputData(request: MirrorRequest): Record<string, unknown> {
  return {
    url: request.url,
    mode: request.mode,
    ...(request.mode === "section" && request.target ? { target: request.target } : {}),
    framework: request.framework,
  }
}

const TITLE_TARGET_MAX = 60

/** Human-readable session title, shown by the Axernel UI: the site, then what of it is mirrored. */
export function sessionTitle(request: MirrorRequest): string {
  const host = new URL(request.url).hostname.replace(/^www\./, "")
  if (request.mode === "brand") return `${host}: whole brand`
  const target = request.target?.trim() ?? ""
  if (!target) return host
  return `${host}: ${target.length > TITLE_TARGET_MAX ? `${target.slice(0, TITLE_TARGET_MAX)}…` : target}`
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

export function newMirrorRow(id: string, request: MirrorRequest, run: Run, now: Date): MirrorRow {
  return {
    id,
    url: request.url,
    mode: request.mode,
    target: request.target ?? null,
    framework: request.framework,
    session_id: run.sessionId,
    run_id: run.id,
    created_at: now.toISOString(),
    ...runFields(run),
  }
}

/** Id of the run's artifact of that name, once Axernel has it available. */
export function availableArtifactId(row: MirrorRow, name: ArtifactName): string | null {
  const artifact = parse<StoredArtifacts>(row.artifacts)?.[name]
  return artifact?.status === "available" && artifact.artifactId ? artifact.artifactId : null
}

export function toMirror(row: MirrorRow): Mirror {
  const artifacts = Object.fromEntries(ARTIFACT_NAMES.map((name) => [name, availableArtifactId(row, name) !== null])) as Record<ArtifactName, boolean>
  return {
    id: row.id,
    url: row.url,
    mode: row.mode === "brand" ? "brand" : ("section" satisfies Mode),
    target: row.target,
    framework: "react" satisfies Framework,
    status: row.status as RunStatus,
    result: parse<MirrorResult>(row.result),
    error: parse(row.error),
    usage: parse(row.usage),
    artifacts,
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

export type PumpStep = { then: "stop"; why: "mirror-gone" | "run-finished" | "gave-up" } | { then: "reconnect"; afterMs: number }

/** What the pump does once a connection has ended, given the refreshed run
 *  status (undefined: the row is gone) and the failures in a row so far. */
export function nextPumpStep(status: string | undefined, failures: number): PumpStep {
  if (status === undefined) return { then: "stop", why: "mirror-gone" }
  if (isTerminal(status)) return { then: "stop", why: "run-finished" }
  if (failures >= MAX_FAILURES) return { then: "stop", why: "gave-up" }
  return { then: "reconnect", afterMs: Math.min(1000 * 2 ** failures, 15_000) }
}
