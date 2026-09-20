import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { Readable } from "node:stream"

import type { ArtifactName } from "../types"
import { ARTIFACT_FILES } from "./mirrorCalc"
import { artifactFile } from "./mirrors"

/** Resolves `bytes=a-b`, `bytes=a-` and `bytes=-n` against a file size.
 *  Returns null for a range that cannot be satisfied. */
function byteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (match[1] === "" && match[2] === "")) return null
  let start: number
  let end: number
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]))
    end = size - 1
  } else {
    start = Number(match[1])
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1)
  }
  return start <= end && start < size ? { start, end } : null
}

/** Serves one cached artifact of a mirror. Range is honoured, which
 *  costs nothing to keep. `?download=1` asks the browser to save it. */
export async function serveArtifact(request: Request, id: string, name: ArtifactName): Promise<Response> {
  let file: string | null
  try {
    file = await artifactFile(id, name)
  } catch (error) {
    console.error(`[mir] could not fetch artifact ${name} of ${id}:`, error)
    return Response.json({ error: "Could not fetch the file from Axernel." }, { status: 502 })
  }
  if (!file) return Response.json({ error: "No such file for this mirror." }, { status: 404 })

  const { size } = await stat(file)
  const { fileName, contentType } = ARTIFACT_FILES[name]
  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    // Artifacts are written by an agent from someone else's page. None may run script
    // on this origin, least of all report.html: the browser treats each as sandboxed.
    "Content-Security-Policy": "sandbox",
    "X-Content-Type-Options": "nosniff",
  })
  if (new URL(request.url).searchParams.has("download")) {
    headers.set("Content-Disposition", `attachment; filename="${fileName}"`)
  }

  const rangeHeader = request.headers.get("range")
  if (!rangeHeader) {
    headers.set("Content-Length", String(size))
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers })
  }
  const range = byteRange(rangeHeader, size)
  if (!range) {
    headers.set("Content-Range", `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${size}`)
  headers.set("Content-Length", String(range.end - range.start + 1))
  return new Response(Readable.toWeb(createReadStream(file, range)) as ReadableStream, { status: 206, headers })
}
