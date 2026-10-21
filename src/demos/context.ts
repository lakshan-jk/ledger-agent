import { openDb } from '../db/db.js';
import { ContextStore } from '../context/contextStore.js';
import { CorrectionsMemory } from '../memory/corrections.js';
import { classifyTransaction } from '../agent/classify.js';
import { DEMO_TRANSACTIONS, CODING_RULES } from '../config/seed.js';
import { codingLine, title, hr } from './_util.js';

/**
 * Problem 1 — "How do you give an agent useful business context as that context
 * keeps changing?"
 *
 * The coding rules live in the data store, not in code. Finance changes a policy
 * (Vercel: R&D cloud → G&A software). We update one rule, and the agent's very
 * next decision follows the new policy — no code change, no redeploy, no retrain.
 */
async function main(): Promise<void> {
  const db = openDb();
  const ctx = new ContextStore(db);
  const corrections = new CorrectionsMemory(db);
  db.prepare('DELETE FROM corrections').run(); // isolate the context effect

  const t = DEMO_TRANSACTIONS.vercelA;

  title('PROBLEM 1 — Business context that keeps changing');
  console.log(`Transaction: ${t.vendor} — "${t.description}"\n`);

  console.log('▶ With the current policy (Vercel = cloud infra):');
  const before = await classifyTransaction(t, ctx, corrections);
  console.log(codingLine(ctx, before));

  hr();
  console.log('✎ Finance updates the policy: "Book all Vercel spend as G&A software, not R&D cloud."');
  console.log('  (two rules edited in the context store — no code change)\n');

  await ctx.upsertRule(
    'r-cloud',
    'Cloud infrastructure and hosting used to run the product (AWS, Google Cloud, Azure, Cloudflare, Snowflake, Datadog) → 6500 R&D — Cloud Infrastructure',
    '6500',
  );
  await ctx.upsertRule(
    'r-software',
    'General business/productivity software and SaaS tools (Slack, Notion, Google Workspace, Zoom, Figma, Linear, Retool, Vercel hosting) → 6100 Software Subscriptions — G&A',
    '6100',
  );

  console.log('▶ Same transaction, immediately after the policy change:');
  const after = await classifyTransaction(t, ctx, corrections);
  console.log(codingLine(ctx, after));

  hr();
  const changed = before.accountCode !== after.accountCode;
  console.log(
    changed
      ? `  Coding moved ${before.accountCode} → ${after.accountCode}. The agent adapted to the new context instantly.\n`
      : `  (Model kept ${after.accountCode}; re-run — local models can vary. The context mechanism is what updates.)\n`,
  );

  // Restore the seed policy so the other demos run against the original rules.
  for (const id of ['r-cloud', 'r-software']) {
    const r = CODING_RULES.find((x) => x.id === id)!;
    await ctx.upsertRule(r.id, r.text, r.accountCode);
  }

  db.close();
}

main().catch((err) => {
  console.error('Demo failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
