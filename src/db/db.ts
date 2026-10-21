import type { DatabaseSync } from 'node:sqlite';
import { createRequire } from 'node:module';
import { config } from '../config/config.js';

// Load the built-in `node:sqlite` at runtime via createRequire. The static type
// import above is erased at compile time, so bundlers/test runners (Vite/Vitest)
// never try to resolve this very-new builtin — it's just Node loading a builtin.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: SqliteDatabase } = nodeRequire('node:sqlite') as typeof import('node:sqlite');

/** DB handle type used across the codebase (Node's built-in SQLite). */
export type DB = DatabaseSync;

/**
 * Opens the SQLite database and ensures the schema exists. One file holds the
 * whole agent's world: the editable business context, the durable workflow
 * checkpoints, the corrections memory, and transaction codings.
 *
 * Uses Node's built-in `node:sqlite` — no native build step, no extra deps.
 */
export function openDb(path: string = config.dbPath): DatabaseSync {
  const db = new SqliteDatabase(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

const SCHEMA = `
-- ---- Business context (editable; this is what "keeps changing") ----
CREATE TABLE IF NOT EXISTS gl_accounts (
  code     TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  category TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS coding_rules (
  id           TEXT PRIMARY KEY,
  text         TEXT NOT NULL,
  account_code TEXT NOT NULL,
  embedding    TEXT,              -- JSON array
  updated_at   TEXT NOT NULL
);

-- Known vendor -> account mappings the org has settled on.
CREATE TABLE IF NOT EXISTS vendor_memory (
  vendor       TEXT PRIMARY KEY,  -- normalized (lowercase)
  account_code TEXT NOT NULL
);

-- ---- Transactions and the agent's codings ----
CREATE TABLE IF NOT EXISTS transactions (
  id           TEXT PRIMARY KEY,
  date         TEXT NOT NULL,
  vendor       TEXT NOT NULL,
  description  TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  memo         TEXT
);

CREATE TABLE IF NOT EXISTS codings (
  transaction_id TEXT PRIMARY KEY,
  account_code   TEXT NOT NULL,
  confidence     REAL NOT NULL,
  rationale      TEXT NOT NULL,
  needs_review   INTEGER NOT NULL,
  source         TEXT NOT NULL,
  created_at     TEXT NOT NULL
);

-- ---- Corrections memory (learning from human fixes) ----
CREATE TABLE IF NOT EXISTS corrections (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL,
  vendor          TEXT NOT NULL,
  description     TEXT NOT NULL,
  from_account    TEXT NOT NULL,
  to_account      TEXT NOT NULL,
  reason          TEXT NOT NULL,
  embedding       TEXT NOT NULL,  -- JSON array
  created_at      TEXT NOT NULL
);

-- ---- Durable workflow (checkpoint / resume) ----
CREATE TABLE IF NOT EXISTS workflow_runs (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  status         TEXT NOT NULL,   -- running | failed | completed
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workflow_checkpoints (
  run_id     TEXT NOT NULL,
  step       TEXT NOT NULL,
  output     TEXT NOT NULL,       -- JSON
  created_at TEXT NOT NULL,
  PRIMARY KEY (run_id, step)
);
`;
