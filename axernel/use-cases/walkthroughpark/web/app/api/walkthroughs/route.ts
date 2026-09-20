import { APIError } from "@axernel/sdk"

import { parseSource, splitTreePath } from "@/lib/parseSource"
import { ConfigMissingError } from "@/lib/server/axernel"
import { listWalks } from "@/lib/server/db"
import { createWalkthrough, toWalkthrough } from "@/lib/server/walkthroughs"
import { DURATIONS, type MaxSeconds } from "@/lib/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_INSTRUCTION = 2000

export function GET(): Response {
  return Response.json({ walkthroughs: listWalks().map(toWalkthrough) })
}

/** Branch names of a public repo; empty when GitHub cannot be asked, which leaves the one-segment guess. */
async function listBranches(repoUrl: string): Promise<string[]> {
  const repo = new URL(repoUrl).pathname.slice(1)
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/branches?per_page=100`, {
      headers: { accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) return []
    return ((await response.json()) as { name: string }[]).map((branch) => branch.name)
  } catch {
    return []
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { url?: unknown; instruction?: unknown; maxSeconds?: unknown } | null
  if (!body || typeof body.url !== "string") return Response.json({ error: "Paste a GitHub repo or pull request link." }, { status: 400 })

  const parsed = parseSource(body.url)
  if ("error" in parsed) return Response.json({ error: parsed.error }, { status: 400 })

  const maxSeconds = body.maxSeconds ?? 60
  if (!DURATIONS.includes(maxSeconds as MaxSeconds)) return Response.json({ error: "Pick 30, 60 or 90 seconds." }, { status: 400 })

  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : ""
  if (instruction.length > MAX_INSTRUCTION) return Response.json({ error: `Keep the instruction under ${MAX_INSTRUCTION} characters.` }, { status: 400 })

  const { treePath, ...target } = parsed
  const place = treePath ? splitTreePath(treePath, await listBranches(parsed.source)) : {}

  try {
    const id = await createWalkthrough({ ...target, subdir: undefined, ...place, maxSeconds: maxSeconds as MaxSeconds, ...(instruction ? { instruction } : {}) })
    return Response.json({ id }, { status: 201 })
  } catch (error) {
    if (error instanceof ConfigMissingError) return Response.json({ error: error.message }, { status: 503 })
    console.error("[wtp] could not start a walkthrough:", error)
    const message = error instanceof APIError ? `Axernel said no: ${error.message}` : "Could not reach Axernel. Is it running?"
    return Response.json({ error: message }, { status: 502 })
  }
}
