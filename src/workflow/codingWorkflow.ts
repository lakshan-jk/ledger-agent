import type { DB } from '../db/db.js';
import type { Coding, Transaction } from '../domain/types.js';
import { ContextStore } from '../context/contextStore.js';
import { CorrectionsMemory } from '../memory/corrections.js';
import { classifyTransaction } from '../agent/classify.js';
import { WorkflowEngine, type StepLog } from './engine.js';

export class WorkflowError extends Error {
  constructor(message: string, public readonly runId: string, public readonly completedSteps: string[]) {
    super(message);
  }
}

export interface WorkflowResult {
  runId: string;
  mode: 'new' | 'resumed';
  coding: Coding;
  steps: StepLog[];
}

/**
 * The GL-coding pipeline, run durably:
 *   normalize → classify (LLM) → validate → post
 *
 * `failSteps` lets a demo simulate a transient failure at a given step; the
 * checkpoints already written survive, so a later re-run resumes without
 * re-doing the completed (expensive) steps.
 */
export async function runCodingWorkflow(opts: {
  db: DB;
  runId: string;
  transaction: Transaction;
  failSteps?: Set<string>;
}): Promise<WorkflowResult> {
  const { db, runId, transaction, failSteps = new Set() } = opts;
  const engine = new WorkflowEngine(db);
  const ctx = new ContextStore(db);
  const corrections = new CorrectionsMemory(db);
  const steps: StepLog[] = [];

  const mode = engine.startRun(runId, transaction.id);

  const run = async <T>(name: string, fn: () => Promise<T>): Promise<T> => {
    if (failSteps.has(name)) {
      engine.setStatus(runId, 'failed');
      throw new WorkflowError(`Injected failure at step "${name}"`, runId, engine.completedSteps(runId));
    }
    const { value, status } = await engine.step(runId, name, fn);
    steps.push({ step: name, status });
    return value;
  };

  // 1. Normalize the raw transaction.
  const normalized = await run('normalize', async () => ({
    ...transaction,
    vendor: transaction.vendor.trim().replace(/\s+/g, ' '),
    description: transaction.description.trim().replace(/\s+/g, ' '),
  }));

  // 2. Classify — the expensive LLM step. Never re-run once checkpointed.
  const coding = await run('classify', () => classifyTransaction(normalized, ctx, corrections));

  // 3. Validate the coding against the chart of accounts.
  await run('validate', async () => ({
    valid: ctx.accountExists(coding.accountCode),
    needsReview: coding.needsReview,
  }));

  // 4. Post to the ledger (the step a transient outage might hit).
  await run('post', async () => {
    db.prepare(
      `INSERT INTO codings (transaction_id, account_code, confidence, rationale, needs_review, source, created_at)
       VALUES (@transactionId, @accountCode, @confidence, @rationale, @needsReview, @source, @createdAt)
       ON CONFLICT(transaction_id) DO UPDATE SET
         account_code=@accountCode, confidence=@confidence, rationale=@rationale,
         needs_review=@needsReview, source=@source, created_at=@createdAt`,
    ).run({
      transactionId: coding.transactionId,
      accountCode: coding.accountCode,
      confidence: coding.confidence,
      rationale: coding.rationale,
      needsReview: coding.needsReview ? 1 : 0,
      source: coding.source,
      createdAt: new Date().toISOString(),
    });
    return { posted: true };
  });

  engine.setStatus(runId, 'completed');
  return { runId, mode, coding, steps };
}
