import { randomUUID } from 'node:crypto';
import { openDb } from '../db/db.js';
import { ContextStore } from '../context/contextStore.js';
import { runCodingWorkflow } from '../workflow/codingWorkflow.js';
import { title, hr, codingLine, insertTransaction } from './_util.js';
import type { Transaction } from '../domain/types.js';

/** Problem 6 — knowing when NOT to trust itself. The agent flags low-confidence,
 *  invalid, or weakly-supported codings for a human instead of guessing, and
 *  those land in a review queue. */
async function main(): Promise<void> {
  const db = openDb();
  const ctx = new ContextStore(db);

  if (ctx.getAccounts().length === 0) {
    console.error('No chart of accounts — run `npm run setup` first.');
    process.exit(1);
  }

  title('PROBLEM 6 — Flag for review instead of guessing');

  const mk = (vendor: string, description: string, amount: number): Transaction => ({
    id: `rev-${randomUUID().slice(0, 8)}`,
    date: '2026-10-15',
    vendor,
    description,
    amountCents: Math.round(amount * 100),
  });

  const cases = [
    mk('Amazon Web Services', 'AWS production cloud hosting — EC2, S3', 4200), // clear, well-supported
    mk('Blue Harbor Charters', 'Private yacht charter for offsite', 12000), // out-of-domain → weak support
    mk('QZX Holdings LLC', 'Monthly service charge, no description', 999), // vague → weak support
  ];

  console.log('▶ Coding three transactions through the durable workflow:\n');
  for (const t of cases) {
    insertTransaction(db, t);
    const { coding } = await runCodingWorkflow({ db, runId: randomUUID(), transaction: t });
    console.log(`  ${t.vendor} — "${t.description}"`);
    console.log(codingLine(ctx, coding) + '\n');
  }

  hr();
  console.log('  THE REVIEW QUEUE (codings where needs_review = 1):\n');
  const queue = db
    .prepare(
      `SELECT c.account_code AS code, c.confidence, t.vendor, t.description
         FROM codings c JOIN transactions t ON t.id = c.transaction_id
        WHERE c.needs_review = 1
        ORDER BY c.created_at DESC`,
    )
    .all() as { code: string; confidence: number; vendor: string; description: string }[];

  if (queue.length === 0) {
    console.log('  (empty — every coding was confident and well-supported this run)');
  } else {
    for (const q of queue) {
      console.log(`  • ${q.vendor.padEnd(22)} → ${q.code} ${ctx.accountName(q.code)}  (a human should confirm)`);
    }
  }

  hr();
  console.log(
    '  The agent routed what it could not stand behind to a human — using context support,\n' +
      '  not just the model’s self-reported confidence (which small models overstate). ✅',
  );
  db.close();
}

main().catch((err) => {
  console.error('Demo failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
