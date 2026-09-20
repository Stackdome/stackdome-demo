import { serveArtifact } from "@/lib/server/serveFile"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** The captioned video, or the clean one with `?variant=clean`. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const clean = new URL(request.url).searchParams.get("variant") === "clean"
  return serveArtifact(request, (await params).id, clean ? "clean" : "walkthrough")
}
