import type { DB } from '../db/db.js';

export type StepStatus = 'executed' | 'cached';
export interface StepLog {
  step: string;
  status: StepStatus;
}

/**
 * A tiny durable workflow engine. Each step's result is checkpointed to SQLite,
 * so if the workflow fails partway through, re-running it **resumes from the last
 * completed step** instead of restarting — crucially, it never re-runs an
 * expensive/irreversible step (like an LLM call) that already succeeded.
 */
export class WorkflowEngine {
  constructor(private db: DB) {}

  /** Ensure a run row exists; returns whether this is a fresh run or a resume. */
  startRun(runId: string, transactionId: string): 'new' | 'resumed' {
    const existing = this.db.prepare('SELECT 1 FROM workflow_runs WHERE id = ?').get(runId);
    if (existing) {
      this.db.prepare("UPDATE workflow_runs SET status = 'running' WHERE id = ?").run(runId);
      return 'resumed';
    }
    this.db
      .prepare('INSERT INTO workflow_runs (id, transaction_id, status, created_at) VALUES (?, ?, ?, ?)')
      .run(runId, transactionId, 'running', new Date().toISOString());
    return 'new';
  }

  /** Run a step, or return its checkpointed result if it already completed. */
  async step<T>(runId: string, name: string, fn: () => Promise<T>): Promise<{ value: T; status: StepStatus }> {
    const row = this.db
      .prepare('SELECT output FROM workflow_checkpoints WHERE run_id = ? AND step = ?')
      .get(runId, name) as { output: string } | undefined;
    if (row) {
      return { value: JSON.parse(row.output) as T, status: 'cached' };
    }
    const value = await fn();
    this.db
      .prepare('INSERT INTO workflow_checkpoints (run_id, step, output, created_at) VALUES (?, ?, ?, ?)')
      .run(runId, name, JSON.stringify(value ?? null), new Date().toISOString());
    return { value, status: 'executed' };
  }

  setStatus(runId: string, status: 'failed' | 'completed'): void {
    this.db.prepare('UPDATE workflow_runs SET status = ? WHERE id = ?').run(status, runId);
  }

  completedSteps(runId: string): string[] {
    const rows = this.db
      .prepare('SELECT step FROM workflow_checkpoints WHERE run_id = ? ORDER BY created_at')
      .all(runId) as { step: string }[];
    return rows.map((r) => r.step);
  }
}
