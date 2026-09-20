import { listMirrors } from "@/lib/server/mirrors"

import { Archive } from "./Archive"

// The cards come from the database, so this page cannot be prerendered.
export const dynamic = "force-dynamic"

export const metadata = { title: "Archive, Mirrored" }

export default function ArchivePage() {
  return <Archive initial={listMirrors()} />
}
