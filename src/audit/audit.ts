import { randomUUID } from 'node:crypto';
import type { DB } from '../db/db.js';

/** An audit record of a learning event (a correction, or a synthesized rule). */
export interface AuditEntry {
  id: string;
  at: string;
  kind: string;
  detail: unknown;
}

/** Append an immutable audit record. Every event that changes the agent's future
 *  behaviour (a human correction, a synthesized rule) is logged here so decisions
 *  stay explainable after the fact. */
export function writeAudit(db: DB, kind: string, detail: unknown): void {
  db.prepare('INSERT INTO audit_log (id, at, kind, detail) VALUES (?, ?, ?, ?)').run(
    randomUUID(),
    new Date().toISOString(),
    kind,
    JSON.stringify(detail),
  );
}

/** Most recent audit entries, newest first. */
export function listAudit(db: DB, limit = 50): AuditEntry[] {
  const rows = db
    .prepare('SELECT id, at, kind, detail FROM audit_log ORDER BY at DESC LIMIT ?')
    .all(limit) as { id: string; at: string; kind: string; detail: string }[];
  return rows.map((r) => ({ id: r.id, at: r.at, kind: r.kind, detail: JSON.parse(r.detail) }));
}
