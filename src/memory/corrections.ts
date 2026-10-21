import { randomUUID } from 'node:crypto';
import type { DB } from '../db/db.js';
import type { Correction, Transaction } from '../domain/types.js';
import { embed, cosineSimilarity } from '../llm/ollama.js';
import { transactionText } from '../context/contextStore.js';
import { writeAudit } from '../audit/audit.js';

export interface ScoredCorrection {
  correction: Correction;
  score: number;
}

/** Raw DB row shape (snake_case columns). */
interface CorrectionRow {
  id: string;
  transaction_id: string;
  vendor: string;
  description: string;
  from_account: string;
  to_account: string;
  reason: string;
  embedding: string;
  created_at: string;
}

/**
 * Memory of human corrections. When a person fixes the agent's coding, we store
 * the transaction's "shape" (vendor + description) as an embedding alongside the
 * right answer. On future transactions we retrieve the most similar corrections
 * so the agent applies what it was taught — even to vendors it hasn't seen in
 * exactly the same form.
 */
export class CorrectionsMemory {
  constructor(private db: DB) {}

  async add(input: {
    transaction: Transaction;
    fromAccountCode: string;
    toAccountCode: string;
    reason: string;
  }): Promise<Correction> {
    const { transaction, fromAccountCode, toAccountCode, reason } = input;
    const vector = await embed(transactionText(transaction));
    const correction: Correction = {
      id: randomUUID(),
      transactionId: transaction.id,
      vendor: transaction.vendor,
      description: transaction.description,
      fromAccountCode,
      toAccountCode,
      reason,
      createdAt: new Date().toISOString(),
    };
    this.db
      .prepare(
        `INSERT INTO corrections
           (id, transaction_id, vendor, description, from_account, to_account, reason, embedding, created_at)
         VALUES (@id, @transactionId, @vendor, @description, @fromAccountCode, @toAccountCode, @reason, @embedding, @createdAt)`,
      )
      .run({ ...correction, embedding: JSON.stringify(vector) });
    writeAudit(this.db, 'correction', {
      vendor: correction.vendor,
      fromAccountCode: correction.fromAccountCode,
      toAccountCode: correction.toAccountCode,
      reason: correction.reason,
    });
    return correction;
  }

  /** Most similar past corrections to a transaction, highest score first. */
  async retrieveSimilar(t: Transaction, k = 3): Promise<ScoredCorrection[]> {
    const rows = this.db.prepare('SELECT * FROM corrections').all() as unknown as CorrectionRow[];
    if (rows.length === 0) return [];

    const query = await embed(transactionText(t));
    return rows
      .map((r) => ({
        correction: {
          id: r.id,
          transactionId: r.transaction_id,
          vendor: r.vendor,
          description: r.description,
          fromAccountCode: r.from_account,
          toAccountCode: r.to_account,
          reason: r.reason,
          createdAt: r.created_at,
        } as Correction,
        score: cosineSimilarity(query, JSON.parse(r.embedding) as number[]),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM corrections').get() as { n: number }).n;
  }
}
