import { APIError } from "@axernel/sdk"

import { parseMirrorRequest } from "@/lib/mirrorRequest"
import { ConfigMissingError } from "@/lib/server/config"
import { listMirrors, startMirror } from "@/lib/server/mirrors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(): Response {
  return Response.json({ mirrors: listMirrors() })
}

export async function POST(request: Request): Promise<Response> {
  const mirrorRequest = parseMirrorRequest(await request.json().catch(() => null))
  if ("error" in mirrorRequest) return Response.json({ error: mirrorRequest.error }, { status: 400 })

  try {
    return Response.json({ id: await startMirror(mirrorRequest) }, { status: 201 })
  } catch (error) {
    if (error instanceof ConfigMissingError) return Response.json({ error: error.message }, { status: 503 })
    console.error("[mir] could not start a mirror:", error)
    const message = error instanceof APIError ? `Axernel said no: ${error.message}` : "Could not reach Axernel. Is it running?"
    return Response.json({ error: message }, { status: 502 })
  }
}
