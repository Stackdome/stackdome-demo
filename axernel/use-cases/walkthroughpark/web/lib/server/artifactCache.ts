import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { DATA_DIR } from "./db"

const cachePath = (walkthroughId: string, fileName: string): string => path.join(DATA_DIR, "artifacts", walkthroughId, fileName)

/** Path of the cached file, or null when it has not been downloaded yet. */
export function cachedArtifact(walkthroughId: string, fileName: string): string | null {
  const file = cachePath(walkthroughId, fileName)
  return existsSync(file) ? file : null
}

/** Writes beside the target and renames, so a reader never sees half a file. */
export async function cacheArtifact(walkthroughId: string, fileName: string, bytes: Uint8Array): Promise<string> {
  const file = cachePath(walkthroughId, fileName)
  await mkdir(path.dirname(file), { recursive: true })
  const partial = `${file}.${randomUUID()}.part`
  await writeFile(partial, bytes)
  await rename(partial, file)
  return file
}
