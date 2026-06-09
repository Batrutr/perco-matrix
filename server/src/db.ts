// Инициализация SQLite и схема кэша (см. SPEC.md, раздел 4).
// Используем встроенный node:sqlite (Node 26) — без нативной сборки.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type DB = DatabaseSync;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rooms (
  id          INTEGER PRIMARY KEY,
  parent_id   INTEGER,
  name        TEXT,
  room_id     INTEGER,
  node_type   TEXT,
  is_const    INTEGER,
  with_rights INTEGER,
  depth       INTEGER,
  sort_order  INTEGER
);

CREATE TABLE IF NOT EXISTS templates (
  id         INTEGER PRIMARY KEY,
  name       TEXT,
  comment    TEXT,
  is_removed INTEGER,
  fetched_at TEXT
);

CREATE TABLE IF NOT EXISTS template_access (
  template_id        INTEGER NOT NULL,
  access_zone_id     INTEGER NOT NULL,
  template_type      INTEGER,
  is_guard           INTEGER,
  is_antipass        INTEGER,
  is_verify          INTEGER,
  schedule_type_id   INTEGER,
  schedule_type_name TEXT,
  schedule_id        INTEGER,
  schedule_name      TEXT,
  raw_json           TEXT,
  PRIMARY KEY (template_id, access_zone_id)
);

CREATE INDEX IF NOT EXISTS idx_access_zone ON template_access (access_zone_id);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
`;

export function openDb(dbPath: string): DB {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

export function getMeta(db: DB, key: string): string | null {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setMeta(db: DB, key: string, value: string): void {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}
