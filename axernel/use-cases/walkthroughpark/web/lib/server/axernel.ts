// Every Axernel SDK call the web app makes lives in this file.
//
//   auth.login          email + password from .wtp.json -> bearer token. Done once; the
//                       client is cached, and renewed once when a call says the token expired.
//   sessions.create     one session per walkthrough. A session pins the agent's current
//                       revision, so a later `npm run setup` never changes a run in flight.
//                       The API has no session name: the title goes in metadata.axernel.title,
//                       which the Axernel UI reads.
//   runs.create         starts the agent with `input.data`. Both creates carry an idempotency
//                       key derived from the walkthrough id, so the auth retry cannot start two runs.
//   runs.get            the run's status, response, error, usage and artifact outputs.
//   runs.events         SSE of the run. The SDK applies the request timeout to the WHOLE
//                       stream, so we pass a long one and the pump reconnects with lastEventId.
//   artifacts.download  returns the whole file in memory (no ranges), so callers cache it on disk.
//
// Nothing outside this file imports @axernel/sdk, except for types and error classes.
import { AuthenticationError, Axernel, NotFoundError, type Event, type Run } from "@axernel/sdk"

import { readConfig, type WtpConfig } from "./config"

const STREAM_TIMEOUT_MS = 60 * 60 * 1000
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000

/** Session and run for one walkthrough. `data` must satisfy the agent's input contract. */
export function startRun(walkthroughId: string, title: string, data: Record<string, unknown>): Promise<Run> {
  const metadata = { walkthroughId }
  return withClient(async (client, config) => {
    const session = await client.sessions.create(
      config.projectId,
      { agentId: config.agentId, checkpointingEnabled: false, metadata: { ...metadata, axernel: { title } } },
      { idempotencyKey: `wtp-session-${walkthroughId}` },
    )
    return client.runs.create(session.id, { input: { data }, metadata }, { idempotencyKey: `wtp-run-${walkthroughId}` })
  })
}

export function readRun(runId: string): Promise<Run> {
  return withClient((client) => client.runs.get(runId))
}

/** The run's events after `afterSequence`, until Axernel ends the stream or it drops.
 *  No retry here: reconnecting, and how often, is the pump's decision. */
export async function* streamRunEvents(runId: string, afterSequence: number | undefined): AsyncGenerator<Event> {
  try {
    const client = await getClient()
    yield* client.runs.events(runId, { lastEventId: afterSequence, timeoutMs: STREAM_TIMEOUT_MS })
  } catch (error) {
    if (error instanceof AuthenticationError) forgetClient()
    throw error
  }
}

export function downloadArtifact(artifactId: string): Promise<Uint8Array> {
  return withClient((client) => client.artifacts.download(artifactId, { timeoutMs: DOWNLOAD_TIMEOUT_MS }))
}

/** Whether the error says Axernel no longer has the run, so asking again is pointless. */
export function isRunGone(error: unknown): boolean {
  return error instanceof NotFoundError
}

// --- Login ------------------------------------------------------------------
// On globalThis so dev-mode module reloads share one login.
const cache = globalThis as unknown as { __wtpAxernel?: Promise<Axernel> | undefined }

function getClient(): Promise<Axernel> {
  cache.__wtpAxernel ??= login().catch((error: unknown) => {
    cache.__wtpAxernel = undefined
    throw error
  })
  return cache.__wtpAxernel
}

function forgetClient(): void {
  cache.__wtpAxernel = undefined
}

async function login(): Promise<Axernel> {
  const config = readConfig()
  const auth = await new Axernel({ baseUrl: config.baseUrl }).auth.login({ email: config.email, password: config.password })
  return new Axernel({ baseUrl: config.baseUrl, apiKey: auth.token })
}

/** Runs `work` with the client. An expired login is renewed once and the
 *  work retried; anything else is the caller's to handle. */
async function withClient<T>(work: (client: Axernel, config: WtpConfig) => Promise<T>): Promise<T> {
  const config = readConfig()
  try {
    return await work(await getClient(), config)
  } catch (error) {
    if (!(error instanceof AuthenticationError)) throw error
    forgetClient()
    return work(await getClient(), config)
  }
}
