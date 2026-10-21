import type { DB } from '../db/db.js';
import type { EvalCase } from '../domain/types.js';
import { ContextStore } from '../context/contextStore.js';
import { CorrectionsMemory } from '../memory/corrections.js';
import { classifyTransaction } from '../agent/classify.js';

export interface EvalRow {
  id: string;
  vendor: string;
  expected: string;
  got: string;
  correct: boolean;
  source: string;
  confidence: number;
}

export interface EvalReport {
  total: number;
  correct: number;
  accuracy: number; // 0..1
  rows: EvalRow[];
}

/** Run the agent over a labeled eval set and score accuracy. Uses the current
 *  business context + corrections memory, so re-running after changes/corrections
 *  shows the effect. */
export async function evaluate(db: DB, cases: EvalCase[]): Promise<EvalReport> {
  const ctx = new ContextStore(db);
  const corrections = new CorrectionsMemory(db);
  const rows: EvalRow[] = [];

  for (const c of cases) {
    const coding = await classifyTransaction(c.transaction, ctx, corrections);
    rows.push({
      id: c.transaction.id,
      vendor: c.transaction.vendor,
      expected: c.expectedAccountCode,
      got: coding.accountCode,
      correct: coding.accountCode === c.expectedAccountCode,
      source: coding.source,
      confidence: coding.confidence,
    });
  }

  const correct = rows.filter((r) => r.correct).length;
  return { total: rows.length, correct, accuracy: correct / rows.length, rows };
}

/** Pretty one-line-per-case table for the console. */
export function formatReport(report: EvalReport, ctx: ContextStore): string {
  const lines = report.rows.map((r) => {
    const mark = r.correct ? '✓' : '✗';
    const exp = `${r.expected} ${ctx.accountName(r.expected)}`;
    const got = `${r.got} ${ctx.accountName(r.got)}`;
    return `  ${mark} ${r.vendor.padEnd(22)} expected ${exp.padEnd(34)} got ${got}`;
  });
  return lines.join('\n');
}
