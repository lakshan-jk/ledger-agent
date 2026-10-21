import { openDb } from '../db/db.js';
import { ContextStore } from '../context/contextStore.js';
import { GL_ACCOUNTS, CODING_RULES, VENDOR_MEMORY } from '../config/seed.js';

/** (Re)seed the database: chart of accounts, vendor memory, and coding rules
 *  (whose embeddings are computed via the local embed model). */
async function main(): Promise<void> {
  const db = openDb();

  // Fresh start.
  for (const table of [
    'gl_accounts',
    'coding_rules',
    'vendor_memory',
    'transactions',
    'codings',
    'corrections',
    'workflow_runs',
    'workflow_checkpoints',
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }

  const insertAccount = db.prepare('INSERT INTO gl_accounts (code, name, category) VALUES (?, ?, ?)');
  for (const a of GL_ACCOUNTS) insertAccount.run(a.code, a.name, a.category);

  const ctx = new ContextStore(db);
  for (const v of VENDOR_MEMORY) ctx.setVendorAccount(v.vendor, v.accountCode);

  process.stdout.write(`Embedding ${CODING_RULES.length} coding rules`);
  for (const r of CODING_RULES) {
    await ctx.upsertRule(r.id, r.text, r.accountCode);
    process.stdout.write('.');
  }
  process.stdout.write('\n');

  console.info(
    `✓ Seeded ${GL_ACCOUNTS.length} accounts, ${CODING_RULES.length} rules, ${VENDOR_MEMORY.length} vendor mapping(s).`,
  );
  db.close();
}

main().catch((err) => {
  console.error('Setup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
