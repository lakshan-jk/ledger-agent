import type { DB } from '../db/db.js';
import type { GLAccount, CodingRule, Transaction } from '../domain/types.js';
import { embed, cosineSimilarity } from '../llm/ollama.js';

/** Text we embed/represent a transaction by, for similarity. */
export function transactionText(t: Pick<Transaction, 'vendor' | 'description'>): string {
  return `${t.vendor} — ${t.description}`;
}

/**
 * The agent's editable business context: chart of accounts, coding rules, and
 * known vendor mappings. Rules carry an embedding so we can retrieve only the
 * few relevant ones for a given transaction — and because rules are stored (not
 * hard-coded), changing one immediately changes the agent's behaviour.
 */
export class ContextStore {
  constructor(private db: DB) {}

  getAccounts(): GLAccount[] {
    return this.db
      .prepare('SELECT code, name, category FROM gl_accounts ORDER BY code')
      .all() as unknown as GLAccount[];
  }

  accountName(code: string): string {
    const row = this.db.prepare('SELECT name FROM gl_accounts WHERE code = ?').get(code) as
      | { name: string }
      | undefined;
    return row?.name ?? 'Unknown';
  }

  accountExists(code: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM gl_accounts WHERE code = ?').get(code);
  }

  /** Insert or update a coding rule and (re)compute its embedding. This is how
   *  "the business context changes" — one call and the next run sees it. */
  async upsertRule(id: string, text: string, accountCode: string): Promise<void> {
    const vector = await embed(text);
    this.db
      .prepare(
        `INSERT INTO coding_rules (id, text, account_code, embedding, updated_at)
         VALUES (@id, @text, @accountCode, @embedding, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           text = @text, account_code = @accountCode, embedding = @embedding, updated_at = @updatedAt`,
      )
      .run({
        id,
        text,
        accountCode,
        embedding: JSON.stringify(vector),
        updatedAt: new Date().toISOString(),
      });
  }

  listRules(): CodingRule[] {
    const rows = this.db
      .prepare('SELECT id, text, account_code, updated_at FROM coding_rules')
      .all() as { id: string; text: string; account_code: string; updated_at: string }[];
    return rows.map((r) => ({
      id: r.id,
      text: r.text,
      accountCode: r.account_code,
      updatedAt: r.updated_at,
    }));
  }

  /** Retrieve the top-k coding rules most relevant to a transaction, each with
   *  its similarity score (highest first). The score lets callers judge how well
   *  the business context actually supports a decision. */
  async relevantRulesScored(t: Transaction, k = 4): Promise<{ rule: CodingRule; score: number }[]> {
    const rows = this.db
      .prepare('SELECT id, text, account_code, embedding, updated_at FROM coding_rules')
      .all() as {
      id: string;
      text: string;
      account_code: string;
      embedding: string | null;
      updated_at: string;
    }[];

    const query = await embed(transactionText(t));
    return rows
      .map((r) => ({
        rule: {
          id: r.id,
          text: r.text,
          accountCode: r.account_code,
          updatedAt: r.updated_at,
        } as CodingRule,
        score: r.embedding ? cosineSimilarity(query, JSON.parse(r.embedding) as number[]) : 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  /** Retrieve the top-k coding rules most relevant to a transaction. */
  async retrieveRelevantRules(t: Transaction, k = 4): Promise<CodingRule[]> {
    return (await this.relevantRulesScored(t, k)).map((x) => x.rule);
  }

  /** A vendor the org has already mapped to an account (normalized lookup). */
  getVendorAccount(vendor: string): string | undefined {
    const row = this.db
      .prepare('SELECT account_code FROM vendor_memory WHERE vendor = ?')
      .get(vendor.trim().toLowerCase()) as { account_code: string } | undefined;
    return row?.account_code;
  }

  setVendorAccount(vendor: string, accountCode: string): void {
    this.db
      .prepare(
        `INSERT INTO vendor_memory (vendor, account_code) VALUES (?, ?)
         ON CONFLICT(vendor) DO UPDATE SET account_code = excluded.account_code`,
      )
      .run(vendor.trim().toLowerCase(), accountCode);
  }
}
