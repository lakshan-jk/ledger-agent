import { openDb } from '../db/db.js';
import { ContextStore } from '../context/contextStore.js';
import { CorrectionsMemory } from '../memory/corrections.js';
import { classifyTransaction } from '../agent/classify.js';
import { synthesizeRules } from '../agent/synthesize.js';
import { listAudit } from '../audit/audit.js';
import { title, hr, codingLine } from './_util.js';
import type { Transaction } from '../domain/types.js';

/** Problem 5 — the context teaches itself. After a vendor is corrected the same
 *  way repeatedly, the agent promotes it into a durable mapping and codes it
 *  deterministically (no LLM) from then on — with an audit record. */
async function main(): Promise<void> {
  const db = openDb();
  const ctx = new ContextStore(db);
  const corrections = new CorrectionsMemory(db);

  title('PROBLEM 5 — The context teaches itself (rule synthesis)');

  const mk = (n: number): Transaction => ({
    id: `syn-${n}`,
    date: '2026-10-15',
    vendor: 'WeWork',
    description: 'Coworking desk — monthly membership',
    amountCents: 45000,
  });

  console.log('▶ Reviewers correct "WeWork" to 6400 Office & Supplies twice:');
  for (const n of [1, 2]) {
    await corrections.add({
      transaction: mk(n),
      fromAccountCode: '6100',
      toAccountCode: '6400',
      reason: 'Coworking is an office expense, not software.',
    });
    console.log(`  ✎ correction #${n} recorded`);
  }

  hr();
  const created = synthesizeRules(db, { minCount: 2 });
  for (const c of created) {
    console.log(`  ★ synthesized a rule: "${c.vendor}" → ${c.accountCode} (from ${c.fromCorrections} corrections)`);
  }

  hr();
  console.log('▶ A new WeWork transaction is now coded deterministically (no LLM):');
  const coding = await classifyTransaction(mk(99), ctx, corrections);
  console.log(codingLine(ctx, coding));

  hr();
  console.log('  Audit trail:');
  for (const e of listAudit(db, 5).reverse()) {
    console.log(`   • ${e.kind}: ${JSON.stringify(e.detail)}`);
  }
  console.log('\n  The agent turned repeated human fixes into a standing rule — and logged why. ✅');
  db.close();
}

main().catch((err) => {
  console.error('Demo failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
