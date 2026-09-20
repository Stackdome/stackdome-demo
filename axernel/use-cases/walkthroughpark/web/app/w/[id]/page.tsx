import { notFound } from "next/navigation"

import { readWalkthrough } from "@/lib/server/walkthroughs"

import { Walk } from "./Walk"

export const dynamic = "force-dynamic"

export default async function WalkPage({ params }: { params: Promise<{ id: string }> }) {
  const walkthrough = await readWalkthrough((await params).id)
  if (!walkthrough) notFound()
  return <Walk initial={walkthrough} />
}
