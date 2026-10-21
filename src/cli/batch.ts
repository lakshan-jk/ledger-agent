import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { openDb } from '../db/db.js';
import { ContextStore } from '../context/contextStore.js';
import { CorrectionsMemory } from '../memory/corrections.js';
import { classifyTransaction } from '../agent/classify.js';
import { parseCsv, toCsvRow } from '../lib/csv.js';
import type { Transaction } from '../domain/types.js';

/**
 * Code a CSV of transactions in one pass:
 *   npm run batch -- transactions.csv > coded.csv
 *
 * Input columns: vendor, description, amount   (a header row is auto-detected)
 * Output adds:   account_code, account_name, confidence, source, needs_review
 */
async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npm run batch -- <path-to-csv>   (columns: vendor, description, amount)');
    process.exit(1);
  }

  const db = openDb();
  const ctx = new ContextStore(db);
  if (ctx.getAccounts().length === 0) {
    console.error('No chart of accounts found — run `npm run setup` first.');
    process.exit(1);
  }
  const corrections = new CorrectionsMemory(db);

  const rows = parseCsv(readFileSync(path, 'utf8'));
  if (rows.length === 0) {
    console.error('No rows found in CSV.');
    process.exit(1);
  }
  // Auto-detect a header row.
  const first = rows[0].map((c) => c.trim().toLowerCase());
  const hasHeader = first.includes('vendor') || first.includes('description');
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const out: string[] = [
    toCsvRow(['vendor', 'description', 'amount', 'account_code', 'account_name', 'confidence', 'source', 'needs_review']),
  ];

  for (const r of dataRows) {
    const [vendor = '', description = '', amount = '0'] = r.map((c) => c.trim());
    if (!vendor && !description) continue;
    const t: Transaction = {
      id: randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      vendor,
      description,
      amountCents: Math.round(Number(amount || 0) * 100),
    };
    const coding = await classifyTransaction(t, ctx, corrections);
    out.push(
      toCsvRow([
        vendor,
        description,
        amount,
        coding.accountCode,
        ctx.accountName(coding.accountCode),
        coding.confidence.toFixed(2),
        coding.source,
        coding.needsReview ? 'yes' : 'no',
      ]),
    );
    process.stderr.write('.'); // progress to stderr so stdout stays clean CSV
  }
  process.stderr.write('\n');
  console.log(out.join('\n'));
  db.close();
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
