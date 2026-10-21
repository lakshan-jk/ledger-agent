import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { openDb } from '../src/db/db.js';
import { ContextStore } from '../src/context/contextStore.js';
import { synthesizeRules } from '../src/agent/synthesize.js';
import { listAudit } from '../src/audit/audit.js';

// Insert a correction row directly (bypasses the embedding model — this logic
// is deterministic and shouldn't need Ollama).
function addCorrection(db: ReturnType<typeof openDb>, vendor: string, toAccount: string): void {
  db.prepare(
    `INSERT INTO corrections
       (id, transaction_id, vendor, description, from_account, to_account, reason, embedding, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), randomUUID(), vendor, 'desc', '6100', toAccount, 'fix', '[]', new Date().toISOString());
}

function seedAccounts(db: ReturnType<typeof openDb>): void {
  const ins = db.prepare('INSERT INTO gl_accounts (code, name, category) VALUES (?, ?, ?)');
  ins.run('6100', 'Software Subscriptions — G&A', 'Operating Expenses');
  ins.run('6400', 'Office & Supplies', 'Operating Expenses');
}

describe('synthesizeRules — self-improving context', () => {
  it('promotes a vendor to a mapping after enough repeated corrections, and audits it', () => {
    const db = openDb(':memory:');
    seedAccounts(db);
    const ctx = new ContextStore(db);

    addCorrection(db, 'WeWork', '6400');
    addCorrection(db, 'WeWork', '6400');

    const created = synthesizeRules(db, { minCount: 2 });

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ vendor: 'wework', accountCode: '6400', fromCorrections: 2 });
    expect(ctx.getVendorAccount('WeWork')).toBe('6400');
    expect(listAudit(db).some((e) => e.kind === 'rule-synthesized')).toBe(true);
  });

  it('does not promote below the threshold', () => {
    const db = openDb(':memory:');
    seedAccounts(db);
    addCorrection(db, 'WeWork', '6400'); // only one

    const created = synthesizeRules(db, { minCount: 2 });

    expect(created).toHaveLength(0);
    expect(new ContextStore(db).getVendorAccount('WeWork')).toBeUndefined();
  });

  it('is idempotent — re-running creates no duplicate mapping', () => {
    const db = openDb(':memory:');
    seedAccounts(db);
    addCorrection(db, 'WeWork', '6400');
    addCorrection(db, 'WeWork', '6400');

    expect(synthesizeRules(db, { minCount: 2 })).toHaveLength(1);
    expect(synthesizeRules(db, { minCount: 2 })).toHaveLength(0); // already learned
  });
});
