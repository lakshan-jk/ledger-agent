/** Core domain types for the GL-coding workflow. */

/** A ledger account in the chart of accounts (what we code transactions into). */
export interface GLAccount {
  code: string; // e.g. "6500"
  name: string; // e.g. "R&D — Cloud Infrastructure"
  category: string; // e.g. "Operating Expenses"
}

/** A natural-language coding policy. Editable — this is the "business context"
 *  that keeps changing. */
export interface CodingRule {
  id: string;
  /** Human-readable rule, e.g. "Cloud infra (AWS, GCP, Azure) → 6500". */
  text: string;
  /** Account this rule points to, for traceability. */
  accountCode: string;
  updatedAt: string;
}

/** A raw transaction to be coded. */
export interface Transaction {
  id: string;
  date: string; // yyyy-MM-dd
  vendor: string;
  description: string;
  amountCents: number;
  memo?: string;
}

/** The agent's coding decision for a transaction. */
export interface Coding {
  transactionId: string;
  accountCode: string;
  confidence: number; // 0..1
  rationale: string;
  /** True when confidence was below threshold or validation failed. */
  needsReview: boolean;
  /** Where the signal came from — useful for the demo narrative. */
  source: 'llm' | 'vendor-memory' | 'correction-memory';
}

/** A human correction: "this should have been coded to X, not Y." The agent
 *  learns from these. */
export interface Correction {
  id: string;
  transactionId: string;
  vendor: string;
  description: string;
  fromAccountCode: string;
  toAccountCode: string;
  reason: string;
  createdAt: string;
}

/** A labeled example for the eval harness. */
export interface EvalCase {
  transaction: Transaction;
  expectedAccountCode: string;
}
