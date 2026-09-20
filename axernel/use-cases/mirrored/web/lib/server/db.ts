import { mkdirSync } from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"

export const DATA_DIR = path.resolve(process.cwd(), ".data")

export interface MirrorRow {
  id: string
  url: string
  mode: string
  target: string | null
  framework: string
  session_id: string
  run_id: string
  status: string
  /** 1 once the terminal run, with no artifact still pending, is cached. */
  settled: number
  result: string | null
  error: string | null
  usage: string | null
  artifacts: string | null
  created_at: string
}

export interface EventRow {
  seq: number
  json: string
}

const holder = globalThis as unknown as { __mirDb?: Database.Database }

export function db(): Database.Database {
  if (holder.__mirDb) return holder.__mirDb
  mkdirSync(DATA_DIR, { recursive: true })
  const database = new Database(path.join(DATA_DIR, "mirrored.db"))
  database.pragma("journal_mode = WAL")
  database.exec(`
    CREATE TABLE IF NOT EXISTS mirrors (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      mode TEXT NOT NULL,
      target TEXT,
      framework TEXT NOT NULL,
      session_id TEXT NOT NULL,
      run_id TEXT NOT NULL,
      status TEXT NOT NULL,
      settled INTEGER NOT NULL DEFAULT 0,
      result TEXT,
      error TEXT,
      usage TEXT,
      artifacts TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      mirror_id TEXT NOT NULL REFERENCES mirrors(id),
      sequence INTEGER,
      json TEXT NOT NULL,
      UNIQUE (mirror_id, sequence)
    );
    CREATE INDEX IF NOT EXISTS events_by_mirror ON events (mirror_id, seq);
  `)
  holder.__mirDb = database
  return database
}

export function insertMirror(row: MirrorRow): void {
  db()
    .prepare(
      `INSERT INTO mirrors (id, url, mode, target, framework, session_id, run_id, status, settled, result, error, usage, artifacts, created_at)
       VALUES (@id, @url, @mode, @target, @framework, @session_id, @run_id, @status, @settled, @result, @error, @usage, @artifacts, @created_at)`,
    )
    .run(row)
}

export function getMirror(id: string): MirrorRow | undefined {
  return db().prepare("SELECT * FROM mirrors WHERE id = ?").get(id) as MirrorRow | undefined
}

export function listMirrorRows(limit = 30): MirrorRow[] {
  return db().prepare("SELECT * FROM mirrors ORDER BY created_at DESC LIMIT ?").all(limit) as MirrorRow[]
}

export function updateMirror(id: string, fields: Pick<MirrorRow, "status" | "settled" | "result" | "error" | "usage" | "artifacts">): void {
  db()
    .prepare("UPDATE mirrors SET status = @status, settled = @settled, result = @result, error = @error, usage = @usage, artifacts = @artifacts WHERE id = @id")
    .run({ id, ...fields })
}

/** Stores one event. A harness event already stored (same sequence) is
 *  ignored. Returns whether a row was written. */
export function insertEvent(mirrorId: string, sequence: number | null, json: string): boolean {
  const info = db().prepare("INSERT OR IGNORE INTO events (mirror_id, sequence, json) VALUES (?, ?, ?)").run(mirrorId, sequence, json)
  return info.changes > 0
}

export function eventsAfter(mirrorId: string, seq: number): EventRow[] {
  return db().prepare("SELECT seq, json FROM events WHERE mirror_id = ? AND seq > ? ORDER BY seq").all(mirrorId, seq) as EventRow[]
}

export function lastSequence(mirrorId: string): number | undefined {
  const row = db().prepare("SELECT MAX(sequence) AS value FROM events WHERE mirror_id = ?").get(mirrorId) as { value: number | null }
  return row.value ?? undefined
}

/** The newest stored control frame (one with no sequence), as JSON. */
export function lastControlJson(mirrorId: string): string | undefined {
  const row = db()
    .prepare("SELECT json FROM events WHERE mirror_id = ? AND sequence IS NULL ORDER BY seq DESC LIMIT 1")
    .get(mirrorId) as { json: string } | undefined
  return row?.json
}
