import { openDb } from '../db/db.js';
import { ContextStore } from '../context/contextStore.js';
import { CorrectionsMemory } from '../memory/corrections.js';
import { EVAL_SET } from '../config/seed.js';
import { evaluate, formatReport } from '../eval/evaluate.js';
import { title, hr } from './_util.js';

/**
 * Problem 4 — "How do you measure whether it's actually getting better?"
 *
 * Run the agent over a labeled eval set → baseline accuracy. Then feed the
 * mistakes back as human corrections (problem 3) and re-run → the number moves.
 * The same loop a real system uses: measure → correct → measure.
 */
async function main(): Promise<void> {
  const db = openDb();
  const ctx = new ContextStore(db);
  const corrections = new CorrectionsMemory(db);

  // Clear any corrections from previous demos for a clean baseline.
  db.prepare('DELETE FROM corrections').run();

  title('PROBLEM 4 — Measuring improvement');
  console.log(`Evaluating the agent on ${EVAL_SET.length} labeled transactions…\n`);

  const before = await evaluate(db, EVAL_SET);
  console.log(formatReport(before, ctx));
  hr();
  console.log(
    `  BASELINE ACCURACY: ${(before.accuracy * 100).toFixed(1)}%  (${before.correct}/${before.total})`,
  );

  // Human-in-the-loop: a reviewer corrects the mistakes.
  const wrong = before.rows.filter((r) => !r.correct);
  if (wrong.length > 0) {
    console.log(`\n  A reviewer corrects the ${wrong.length} mistake(s)…`);
    for (const r of wrong) {
      const evalCase = EVAL_SET.find((c) => c.transaction.id === r.id)!;
      await corrections.add({
        transaction: evalCase.transaction,
        fromAccountCode: r.got,
        toAccountCode: r.expected,
        reason: `Reviewer: ${evalCase.transaction.vendor} should be ${r.expected} ${ctx.accountName(r.expected)}.`,
      });
    }
  }

  title('RE-EVALUATING after corrections');
  const after = await evaluate(db, EVAL_SET);
  console.log(formatReport(after, ctx));
  hr();
  console.log(
    `  NEW ACCURACY: ${(after.accuracy * 100).toFixed(1)}%  (${after.correct}/${after.total})`,
  );
  const delta = (after.accuracy - before.accuracy) * 100;
  console.log(
    `  IMPROVEMENT: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} points — the agent learned from the corrections.`,
  );
  console.log(
    '\n  (These corrections also generalize to unseen-but-similar transactions — see demo:learning.)\n',
  );

  db.close();
}

main().catch((err) => {
  console.error('Demo failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
