import { refreshWalk, toWalkthrough } from "@/lib/server/walkthroughs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const row = await refreshWalk((await params).id)
  if (!row) return Response.json({ error: "No such walkthrough." }, { status: 404 })
  return Response.json(toWalkthrough(row))
}
