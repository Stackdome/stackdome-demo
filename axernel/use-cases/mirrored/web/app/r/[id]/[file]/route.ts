import { readFile } from "node:fs/promises"

import { registryFile } from "@/lib/server/mirrors"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// `npx shadcn add <url>` fetches from anywhere, and so do registry browsers.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS" }

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS })
}

/** One registry-item file of a mirror's shadcn registry: /r/<mirrorId>/<name>.json. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; file: string }> }): Promise<Response> {
  const { id, file } = await params
  let path: string | null
  try {
    path = await registryFile(id, file)
  } catch (error) {
    console.error(`[mir] could not read registry file ${file} of ${id}:`, error)
    return Response.json({ error: "Could not read the registry of this mirror." }, { status: 502, headers: CORS })
  }
  if (!path) return Response.json({ error: "No such registry file." }, { status: 404, headers: CORS })
  return new Response(await readFile(path), {
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" },
  })
}
