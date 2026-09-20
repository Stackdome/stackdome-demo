import { readMirror } from "@/lib/server/mirrors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const mirror = await readMirror((await params).id)
  if (!mirror) return Response.json({ error: "No such mirror." }, { status: 404 })
  return Response.json(mirror)
}
