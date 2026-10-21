import { randomUUID } from 'node:crypto';
import { openDb } from '../db/db.js';
import { ContextStore } from '../context/contextStore.js';
import { CorrectionsMemory } from '../memory/corrections.js';
import { classifyTransaction } from '../agent/classify.js';
import type { Transaction } from '../domain/types.js';

/**
 * Code a single transaction from the command line:
 *   npm run code -- "<vendor>" "<description>" [amount]
 * Prints the agent's decision as JSON (account, confidence, source, rationale).
 */
async function main(): Promise<void> {
  const [vendor, description, amount] = process.argv.slice(2);
  if (!vendor || !description) {
    console.error('Usage: npm run code -- "<vendor>" "<description>" [amount]');
    process.exit(1);
  }

  const db = openDb();
  const ctx = new ContextStore(db);
  if (ctx.getAccounts().length === 0) {
    console.error('No chart of accounts found — run `npm run setup` first.');
    process.exit(1);
  }
  const corrections = new CorrectionsMemory(db);

  const t: Transaction = {
    id: randomUUID(),
    date: new Date().toISOString().slice(0, 10),
    vendor,
    description,
    amountCents: Math.round(Number(amount ?? 0) * 100),
  };

  const coding = await classifyTransaction(t, ctx, corrections);
  console.log(
    JSON.stringify(
      {
        vendor,
        description,
        account: { code: coding.accountCode, name: ctx.accountName(coding.accountCode) },
        confidence: Number(coding.confidence.toFixed(2)),
        source: coding.source,
        needsReview: coding.needsReview,
        rationale: coding.rationale,
      },
      null,
      2,
    ),
  );
  db.close();
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
