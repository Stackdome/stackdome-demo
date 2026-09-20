import { mkdirSync } from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"

export const DATA_DIR = path.resolve(process.cwd(), ".data")

export interface WalkRow {
  id: string
  source: string
  subdir: string | null
  instruction: string | null
  max_seconds: number
  kind: string
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

const holder = globalThis as unknown as { __wtpDb?: Database.Database }

export function db(): Database.Database {
  if (holder.__wtpDb) return holder.__wtpDb
  mkdirSync(DATA_DIR, { recursive: true })
  const database = new Database(path.join(DATA_DIR, "wtp.db"))
  database.pragma("journal_mode = WAL")
  database.exec(`
    CREATE TABLE IF NOT EXISTS walkthroughs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      subdir TEXT,
      instruction TEXT,
      max_seconds INTEGER NOT NULL,
      kind TEXT NOT NULL,
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
      walkthrough_id TEXT NOT NULL REFERENCES walkthroughs(id),
      sequence INTEGER,
      json TEXT NOT NULL,
      UNIQUE (walkthrough_id, sequence)
    );
    CREATE INDEX IF NOT EXISTS events_by_walkthrough ON events (walkthrough_id, seq);
  `)
  holder.__wtpDb = database
  return database
}

export function insertWalk(row: WalkRow): void {
  db()
    .prepare(
      `INSERT INTO walkthroughs (id, source, subdir, instruction, max_seconds, kind, session_id, run_id, status, settled, result, error, usage, artifacts, created_at)
       VALUES (@id, @source, @subdir, @instruction, @max_seconds, @kind, @session_id, @run_id, @status, @settled, @result, @error, @usage, @artifacts, @created_at)`,
    )
    .run(row)
}

export function getWalk(id: string): WalkRow | undefined {
  return db().prepare("SELECT * FROM walkthroughs WHERE id = ?").get(id) as WalkRow | undefined
}

export function listWalks(limit = 30): WalkRow[] {
  return db().prepare("SELECT * FROM walkthroughs ORDER BY created_at DESC LIMIT ?").all(limit) as WalkRow[]
}

export function updateWalk(id: string, fields: Pick<WalkRow, "status" | "settled" | "result" | "error" | "usage" | "artifacts">): void {
  db()
    .prepare("UPDATE walkthroughs SET status = @status, settled = @settled, result = @result, error = @error, usage = @usage, artifacts = @artifacts WHERE id = @id")
    .run({ id, ...fields })
}

/** Stores one event. A harness event already stored (same sequence) is
 *  ignored. Returns whether a row was written. */
export function insertEvent(walkthroughId: string, sequence: number | null, json: string): boolean {
  const info = db().prepare("INSERT OR IGNORE INTO events (walkthrough_id, sequence, json) VALUES (?, ?, ?)").run(walkthroughId, sequence, json)
  return info.changes > 0
}

export function eventsAfter(walkthroughId: string, seq: number): EventRow[] {
  return db().prepare("SELECT seq, json FROM events WHERE walkthrough_id = ? AND seq > ? ORDER BY seq").all(walkthroughId, seq) as EventRow[]
}

export function lastSequence(walkthroughId: string): number | undefined {
  const row = db().prepare("SELECT MAX(sequence) AS value FROM events WHERE walkthrough_id = ?").get(walkthroughId) as { value: number | null }
  return row.value ?? undefined
}

/** The newest stored control frame (one with no sequence), as JSON. */
export function lastControlJson(walkthroughId: string): string | undefined {
  const row = db()
    .prepare("SELECT json FROM events WHERE walkthrough_id = ? AND sequence IS NULL ORDER BY seq DESC LIMIT 1")
    .get(walkthroughId) as { json: string } | undefined
  return row?.json
}
