import { notFound } from "next/navigation"

import { readMirror } from "@/lib/server/mirrors"

import { MirrorView } from "./Mirror"

export const dynamic = "force-dynamic"

export default async function MirrorPage({ params }: { params: Promise<{ id: string }> }) {
  const mirror = await readMirror((await params).id)
  if (!mirror) notFound()
  return <MirrorView initial={mirror} />
}
