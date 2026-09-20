import { isArtifactName } from "@/lib/server/mirrorCalc"
import { serveArtifact } from "@/lib/server/serveFile"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** One artifact by its name on the run: bundle, tokens, original, rebuild, diff or page. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; name: string }> }): Promise<Response> {
  const { id, name } = await params
  if (!isArtifactName(name)) return Response.json({ error: "No such file for this mirror." }, { status: 404 })
  return serveArtifact(request, id, name)
}
