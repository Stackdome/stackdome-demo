import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

import { registryFileOfEntry } from "../registry"
import { DATA_DIR } from "./db"
import { zipEntries } from "./zip"

const cachePath = (mirrorId: string, fileName: string): string => path.join(DATA_DIR, "artifacts", mirrorId, fileName)

/** Path of the cached file, or null when it has not been downloaded yet. */
export function cachedArtifact(mirrorId: string, fileName: string): string | null {
  const file = cachePath(mirrorId, fileName)
  return existsSync(file) ? file : null
}

/** Writes beside the target and renames, so a reader never sees half a file. */
export async function cacheArtifact(mirrorId: string, fileName: string, bytes: Uint8Array): Promise<string> {
  const file = cachePath(mirrorId, fileName)
  await mkdir(path.dirname(file), { recursive: true })
  const partial = `${file}.${randomUUID()}.part`
  await writeFile(partial, bytes)
  await rename(partial, file)
  return file
}

// --- The registry, unzipped ---------------------------------------------------
// registry.zip is unpacked once into registry/ beside it. The folder is built
// under another name and renamed, so it either exists whole or not at all.

const registryDir = (mirrorId: string): string => cachePath(mirrorId, "registry")

export function isRegistryUnpacked(mirrorId: string): boolean {
  return existsSync(registryDir(mirrorId))
}

/** Unpacks the cached registry.zip. Only entries whose base name passes the
 *  registry whitelist are written, flat, so no entry can name its own path. */
export async function unpackRegistry(mirrorId: string, zipFile: string): Promise<void> {
  const entries = zipEntries(await readFile(zipFile))
  const partial = `${registryDir(mirrorId)}.${randomUUID()}.part`
  await mkdir(partial, { recursive: true })
  for (const entry of entries) {
    const fileName = registryFileOfEntry(entry.name)
    if (fileName) await writeFile(path.join(partial, fileName), entry.data)
  }
  // Two requests may unpack at once; the loser's rename fails on the winner's folder.
  await rename(partial, registryDir(mirrorId)).catch(() => rm(partial, { recursive: true, force: true }))
}

/** Path of one unpacked registry file, or null. `fileName` must already be whitelisted. */
export function cachedRegistryFile(mirrorId: string, fileName: string): string | null {
  const file = path.join(registryDir(mirrorId), fileName)
  return existsSync(file) ? file : null
}
