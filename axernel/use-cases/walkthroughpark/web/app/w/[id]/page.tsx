import { notFound } from "next/navigation"

import { refreshWalk, toWalkthrough } from "@/lib/server/walkthroughs"

import { Walk } from "./Walk"

export const dynamic = "force-dynamic"

export default async function WalkPage({ params }: { params: Promise<{ id: string }> }) {
  const row = await refreshWalk((await params).id)
  if (!row) notFound()
  return <Walk initial={toWalkthrough(row)} />
}
