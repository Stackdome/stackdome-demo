import { eventsAfter, getWalk } from "@/lib/server/db"
import { activeRelay, ensureRelay } from "@/lib/server/walkthroughs"
import { isTerminal } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const HEARTBEAT_MS = 15_000

/** SSE for the browser. Every frame comes out of SQLite, numbered by our own
 *  row id, so a reconnect with Last-Event-ID resumes exactly where it left.
 *  A final `end` event tells the page to stop listening. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  const row = getWalk(id)
  if (!row) return Response.json({ error: "No such walkthrough." }, { status: 404 })

  let cursor = Number(request.headers.get("last-event-id")) || 0
  const encoder = new TextEncoder()
  let cleanup = (): void => {}

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true
      const send = (text: string): void => {
        if (!open) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          cleanup()
        }
      }
      const flush = (): void => {
        for (const event of eventsAfter(id, cursor)) {
          send(`id: ${event.seq}\ndata: ${event.json}\n\n`)
          cursor = event.seq
        }
      }
      const finish = (): void => {
        flush()
        send("event: end\ndata: {}\n\n")
        cleanup()
        try {
          controller.close()
        } catch {
          // Already closed by the client.
        }
      }

      // A finished run with no pump still draining it: replay and end.
      const relay = isTerminal(row.status) ? activeRelay(id) : ensureRelay(id)
      const heartbeat = setInterval(() => send(": keep-alive\n\n"), HEARTBEAT_MS)
      cleanup = (): void => {
        // Only this connection's listeners go; the pump keeps running.
        open = false
        clearInterval(heartbeat)
        relay?.off("event", flush)
        relay?.off("done", finish)
        request.signal.removeEventListener("abort", cleanup)
      }
      request.signal.addEventListener("abort", cleanup)

      send("retry: 3000\n\n")
      if (!relay) return finish()
      relay.on("event", flush)
      relay.on("done", finish)
      flush()
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
