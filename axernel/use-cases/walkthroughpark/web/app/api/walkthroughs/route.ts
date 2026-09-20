import { APIError } from "@axernel/sdk"

import { ConfigMissingError } from "@/lib/server/config"
import { listWalkthroughs, startWalkthrough } from "@/lib/server/walkthroughs"
import { parseWalkRequest } from "@/lib/walkRequest"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export function GET(): Response {
  return Response.json({ walkthroughs: listWalkthroughs() })
}

export async function POST(request: Request): Promise<Response> {
  const walkRequest = parseWalkRequest(await request.json().catch(() => null))
  if ("error" in walkRequest) return Response.json({ error: walkRequest.error }, { status: 400 })

  try {
    return Response.json({ id: await startWalkthrough(walkRequest) }, { status: 201 })
  } catch (error) {
    if (error instanceof ConfigMissingError) return Response.json({ error: error.message }, { status: 503 })
    console.error("[wtp] could not start a walkthrough:", error)
    const message = error instanceof APIError ? `Axernel said no: ${error.message}` : "Could not reach Axernel. Is it running?"
    return Response.json({ error: message }, { status: 502 })
  }
}
