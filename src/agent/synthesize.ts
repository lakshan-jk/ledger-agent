import type { DB } from '../db/db.js';
import { ContextStore } from '../context/contextStore.js';
import { writeAudit } from '../audit/audit.js';

export interface SynthesizedMapping {
  vendor: string;
  accountCode: string;
  fromCorrections: number;
}

/**
 * Close the learning loop: when the same vendor has been corrected to the same
 * account at least `minCount` times, promote that into a durable vendor mapping.
 * Future transactions for that vendor are then coded deterministically (no LLM)
 * — the business context has taught itself a new rule. Every promotion is
 * written to the audit log so the change is explainable.
 *
 * Deterministic (no model calls): it reads the corrections already recorded.
 */
export function synthesizeRules(db: DB, opts: { minCount?: number } = {}): SynthesizedMapping[] {
  const minCount = opts.minCount ?? 2;
  const ctx = new ContextStore(db);

  const rows = db
    .prepare(
      `SELECT lower(trim(vendor)) AS vendor, to_account AS account, COUNT(*) AS n
         FROM corrections
        GROUP BY lower(trim(vendor)), to_account
       HAVING n >= ?`,
    )
    .all(minCount) as { vendor: string; account: string; n: number }[];

  const created: SynthesizedMapping[] = [];
  for (const r of rows) {
    if (!ctx.accountExists(r.account)) continue; // never map to an account that no longer exists
    if (ctx.getVendorAccount(r.vendor) === r.account) continue; // already learned — skip
    ctx.setVendorAccount(r.vendor, r.account);
    writeAudit(db, 'rule-synthesized', {
      vendor: r.vendor,
      accountCode: r.account,
      fromCorrections: r.n,
    });
    created.push({ vendor: r.vendor, accountCode: r.account, fromCorrections: r.n });
  }
  return created;
}
