import { openDb } from '../db/db.js';
import { ContextStore } from '../context/contextStore.js';
import { DEMO_TRANSACTIONS } from '../config/seed.js';
import { runCodingWorkflow, WorkflowError } from '../workflow/codingWorkflow.js';
import { insertTransaction, getCoding, codingLine, title, hr } from './_util.js';

/**
 * Problem 2 — "How do you recover when one step fails halfway through a workflow?"
 *
 * The pipeline is  normalize → classify (LLM) → validate → post.  We force the
 * `post` step to fail on the first attempt (a transient ledger outage). On
 * re-run, the workflow RESUMES from its checkpoints — crucially, the expensive
 * `classify` (LLM) step is NOT run again; its result is replayed from the
 * checkpoint, and only `post` re-executes.
 */
async function main(): Promise<void> {
  const db = openDb();
  const ctx = new ContextStore(db);
  const t = DEMO_TRANSACTIONS.aws;
  const runId = 'run-recovery-demo';

  // Fresh run for a clean demo.
  db.prepare('DELETE FROM workflow_checkpoints WHERE run_id = ?').run(runId);
  db.prepare('DELETE FROM workflow_runs WHERE id = ?').run(runId);
  db.prepare('DELETE FROM codings WHERE transaction_id = ?').run(t.id);
  insertTransaction(db, t);

  title('PROBLEM 2 — Recovering mid-workflow');
  console.log(`Coding: ${t.vendor} — "${t.description}"`);
  console.log('Pipeline: normalize → classify (LLM) → validate → post\n');

  // ---- Attempt 1: a transient outage hits the `post` step ----
  console.log('▶ Attempt 1 — a transient outage hits the "post" step:');
  try {
    await runCodingWorkflow({ db, runId, transaction: t, failSteps: new Set(['post']) });
  } catch (e) {
    if (!(e instanceof WorkflowError)) throw e;
    console.log(`  ✗ workflow failed: ${e.message}`);
    console.log(`  checkpoints saved so far: [ ${e.completedSteps.join(', ')} ]`);
    console.log('  → normalize, classify, and validate are done. classify (the LLM call) is cached.');
  }

  hr();

  // ---- Attempt 2: re-run. It resumes from checkpoints. ----
  console.log('▶ Attempt 2 — re-run (the outage is over):');
  const result = await runCodingWorkflow({ db, runId, transaction: t });
  for (const s of result.steps) {
    const note =
      s.status === 'cached'
        ? s.step === 'classify'
          ? '(replayed from checkpoint — LLM NOT called again ✅)'
          : '(replayed from checkpoint)'
        : '(executed now)';
    console.log(`  ${s.status === 'cached' ? '•' : '▸'} ${s.step.padEnd(9)} ${s.status.padEnd(8)} ${note}`);
  }
  console.log(`  ✓ run ${result.mode === 'resumed' ? 'resumed and ' : ''}completed.`);

  hr();
  const coding = getCoding(db, t.id)!;
  console.log('Final posting:');
  console.log(codingLine(ctx, coding));
  console.log(
    '\n  Takeaway: a failure after the LLM step costs one cheap retry, not a re-run of the whole agent.\n',
  );

  db.close();
}

main().catch((err) => {
  console.error('Demo failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
