import { openDb } from '../db/db.js';
import { ContextStore } from '../context/contextStore.js';
import { CorrectionsMemory } from '../memory/corrections.js';
import { classifyTransaction } from '../agent/classify.js';
import { DEMO_TRANSACTIONS } from '../config/seed.js';
import { codingLine, label, title, hr } from './_util.js';

/**
 * Problem 3 — "How do you turn a person's correction into something the agent
 * gets right next time?"
 *
 * A reviewer corrects one Vercel transaction. The fix is stored as an embedded
 * memory. On a DIFFERENT Vercel transaction (same vendor, different wording) the
 * agent retrieves that correction and applies it — it generalised from one fix.
 */
async function main(): Promise<void> {
  const db = openDb();
  const ctx = new ContextStore(db);
  const corrections = new CorrectionsMemory(db);
  db.prepare('DELETE FROM corrections').run();

  const first = DEMO_TRANSACTIONS.vercelA; // "Vercel Pro — frontend hosting"
  const next = DEMO_TRANSACTIONS.vercelB; //  "Vercel usage overage — edge functions"
  const POLICY_ACCOUNT = '6100';

  title('PROBLEM 3 — Learning from a correction');

  // 1. Agent codes the first transaction.
  console.log(`▶ Transaction A: ${first.vendor} — "${first.description}"`);
  const a = await classifyTransaction(first, ctx, corrections);
  console.log(codingLine(ctx, a));

  // 2. A reviewer corrects it to the company's policy account.
  hr();
  console.log(
    `✎ Reviewer: "At our company, all Vercel spend goes to ${label(ctx, POLICY_ACCOUNT)}." → recorded as a correction.`,
  );
  await corrections.add({
    transaction: first,
    fromAccountCode: a.accountCode,
    toAccountCode: POLICY_ACCOUNT,
    reason: 'Company policy: all Vercel spend is booked to G&A software (6100).',
  });

  // 3. A DIFFERENT Vercel transaction arrives.
  hr();
  console.log(`▶ Transaction B (new, unseen): ${next.vendor} — "${next.description}"`);
  const matches = await corrections.retrieveSimilar(next, 1);
  if (matches[0]) {
    console.log(
      `  (retrieved a past correction for "${matches[0].correction.vendor}", similarity ${(matches[0].score * 100).toFixed(0)}%)`,
    );
  }
  const b = await classifyTransaction(next, ctx, corrections);
  console.log(codingLine(ctx, b));

  hr();
  console.log(
    b.accountCode === POLICY_ACCOUNT
      ? `  The agent applied the correction to a transaction it had never seen — generalised from one human fix. ✅\n`
      : `  (Model coded ${b.accountCode}; the retrieved correction is the signal — re-run, local models vary.)\n`,
  );

  db.close();
}

main().catch((err) => {
  console.error('Demo failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
