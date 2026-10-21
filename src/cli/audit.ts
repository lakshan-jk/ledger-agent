import { openDb } from '../db/db.js';
import { listAudit } from '../audit/audit.js';

/** Print the audit trail of learning events (corrections + synthesized rules):
 *   npm run audit
 */
function main(): void {
  const db = openDb();
  const entries = listAudit(db, 100);
  if (entries.length === 0) {
    console.log('No audit entries yet. Corrections and synthesized rules will appear here.');
    db.close();
    return;
  }
  console.log(`Audit trail — ${entries.length} event(s), newest first:\n`);
  for (const e of entries) {
    console.log(`  [${e.at}]  ${e.kind}`);
    console.log(`     ${JSON.stringify(e.detail)}`);
  }
  db.close();
}

main();
