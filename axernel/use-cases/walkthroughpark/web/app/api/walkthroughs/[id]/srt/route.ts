import { serveArtifact } from "@/lib/server/serveFile"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return serveArtifact(request, (await params).id, "captions")
}
