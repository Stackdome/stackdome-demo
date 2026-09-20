// A zip reader just big enough for the agent's registry.zip: bytes in, entries
// out, so it is a calculation. Stored and deflated entries only, no zip64, no
// encryption. Anything else throws and the caller treats the zip as unusable.
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib"

export interface ZipEntry {
  name: string
  data: Buffer
}

const END_OF_DIRECTORY = 0x06054b50
const DIRECTORY_ENTRY = 0x02014b50
// The registry is a few small JSON files; these bounds only exist to stop a zip bomb.
const MAX_ENTRIES = 200
const MAX_ENTRY_BYTES = 2 * 1024 * 1024

function endOfDirectoryAt(zip: Buffer): number {
  // The record is 22 bytes plus a comment of at most 65535, at the very end.
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 0xffff); at--) {
    if (zip.readUInt32LE(at) === END_OF_DIRECTORY) return at
  }
  throw new Error("Not a zip file: no end-of-directory record.")
}

/** The files in a zip, directories left out, in directory order. */
export function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const zip = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = endOfDirectoryAt(zip)
  const count = zip.readUInt16LE(end + 10)
  if (count > MAX_ENTRIES) throw new Error(`Zip has ${count} entries; at most ${MAX_ENTRIES} are read.`)

  const entries: ZipEntry[] = []
  let at = zip.readUInt32LE(end + 16)
  for (let index = 0; index < count; index++) {
    if (zip.readUInt32LE(at) !== DIRECTORY_ENTRY) throw new Error("Zip directory is damaged.")
    const method = zip.readUInt16LE(at + 10)
    const packedSize = zip.readUInt32LE(at + 20)
    const nameLength = zip.readUInt16LE(at + 28)
    const local = zip.readUInt32LE(at + 42)
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength)
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32)
    if (name.endsWith("/")) continue

    // The local header repeats the name and has its own extra field; the data follows both.
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28)
    const packed = zip.subarray(start, start + packedSize)
    if (method === 0) {
      if (packed.length > MAX_ENTRY_BYTES) throw new Error(`Zip entry ${name} is too large.`)
      entries.push({ name, data: Buffer.from(packed) })
    } else if (method === 8) {
      entries.push({ name, data: inflateRawSync(packed, { maxOutputLength: MAX_ENTRY_BYTES }) })
    } else {
      throw new Error(`Zip entry ${name} uses compression method ${method}, which is not read.`)
    }
  }
  return entries
}

/** The writer the specs and the mock seed use: enough of a zip for `zipEntries`
 *  and for any unzip tool to read back. */
export function zipOf(files: { name: string; data: Uint8Array }[], { deflate = false } = {}): Buffer {
  const locals: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8")
    const packed = deflate ? deflateRawSync(file.data) : Buffer.from(file.data)
    // Shared by both headers: version, flags, method, time, date, crc, sizes, name and extra lengths.
    const fields = Buffer.alloc(26)
    fields.writeUInt16LE(20, 0)
    fields.writeUInt16LE(deflate ? 8 : 0, 4)
    fields.writeUInt32LE(crc32(file.data), 10)
    fields.writeUInt32LE(packed.length, 14)
    fields.writeUInt32LE(file.data.length, 18)
    fields.writeUInt16LE(name.length, 22)

    const localSignature = Buffer.from([0x50, 0x4b, 0x03, 0x04])
    locals.push(localSignature, fields, name, packed)

    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(DIRECTORY_ENTRY, 0)
    entry.writeUInt16LE(20, 4)
    fields.copy(entry, 6)
    entry.writeUInt32LE(offset, 42)
    directory.push(entry, name)
    offset += 4 + fields.length + name.length + packed.length
  }
  const directoryBytes = Buffer.concat(directory)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(END_OF_DIRECTORY, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(directoryBytes.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, directoryBytes, end])
}
