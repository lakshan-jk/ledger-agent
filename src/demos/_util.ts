import type { DB } from '../db/db.js';
import type { Transaction, Coding } from '../domain/types.js';
import type { ContextStore } from '../context/contextStore.js';

export function insertTransaction(db: DB, t: Transaction): void {
  db.prepare(
    `INSERT INTO transactions (id, date, vendor, description, amount_cents, memo)
     VALUES (@id, @date, @vendor, @description, @amountCents, @memo)
     ON CONFLICT(id) DO UPDATE SET vendor=@vendor, description=@description, amount_cents=@amountCents`,
  ).run({ ...t, memo: t.memo ?? null });
}

export function getCoding(db: DB, transactionId: string): Coding | undefined {
  const r = db.prepare('SELECT * FROM codings WHERE transaction_id = ?').get(transactionId) as
    | {
        transaction_id: string;
        account_code: string;
        confidence: number;
        rationale: string;
        needs_review: number;
        source: string;
      }
    | undefined;
  if (!r) return undefined;
  return {
    transactionId: r.transaction_id,
    accountCode: r.account_code,
    confidence: r.confidence,
    rationale: r.rationale,
    needsReview: !!r.needs_review,
    source: r.source as Coding['source'],
  };
}

export function label(ctx: ContextStore, code: string): string {
  return `${code} ${ctx.accountName(code)}`;
}

export function hr(): void {
  console.log('─'.repeat(74));
}

export function title(s: string): void {
  console.log('\n' + '═'.repeat(74));
  console.log('  ' + s);
  console.log('═'.repeat(74));
}

export function codingLine(ctx: ContextStore, c: Coding): string {
  return (
    `  → ${label(ctx, c.accountCode)}  ` +
    `(confidence ${(c.confidence * 100).toFixed(0)}%, via ${c.source}${c.needsReview ? ', NEEDS REVIEW' : ''})\n` +
    `    ${c.rationale}`
  );
}
