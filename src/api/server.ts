import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { openDb } from '../db/db.js';
import { ContextStore } from '../context/contextStore.js';
import { CorrectionsMemory } from '../memory/corrections.js';
import { runCodingWorkflow } from '../workflow/codingWorkflow.js';
import type { Transaction } from '../domain/types.js';

/**
 * A tiny HTTP surface over the agent — built on Node's built-in `http`, no
 * framework, no dependencies. Endpoints:
 *   GET  /health            → liveness + account count
 *   POST /code    {vendor, description, amount?}            → coded result
 *   GET  /review            → codings flagged needsReview (human queue)
 *   POST /correct {vendor, description, toAccountCode, ...}  → record a correction
 */
const db = openDb();
const ctx = new ContextStore(db);
const corrections = new CorrectionsMemory(db);
const port = Number(process.env.API_PORT ?? 8787);

function send(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(data ? (JSON.parse(data) as Record<string, unknown>) : {});
      } catch {
        reject(new Error('invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const { method } = req;

    if (method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, accounts: ctx.getAccounts().length });
    }

    if (method === 'POST' && url.pathname === '/code') {
      const b = await readJson(req);
      if (!b.vendor || !b.description) return send(res, 400, { error: 'vendor and description are required' });
      const t: Transaction = {
        id: (b.id as string) ?? randomUUID(),
        date: today(),
        vendor: String(b.vendor),
        description: String(b.description),
        amountCents: Math.round(Number(b.amount ?? 0) * 100),
      };
      db.prepare(
        `INSERT INTO transactions (id, date, vendor, description, amount_cents, memo)
         VALUES (@id, @date, @vendor, @description, @amountCents, NULL)
         ON CONFLICT(id) DO UPDATE SET vendor=@vendor, description=@description, amount_cents=@amountCents`,
      ).run({
        id: t.id,
        date: t.date,
        vendor: t.vendor,
        description: t.description,
        amountCents: t.amountCents,
      });
      const { coding } = await runCodingWorkflow({ db, runId: randomUUID(), transaction: t });
      return send(res, 200, {
        transactionId: t.id,
        account: { code: coding.accountCode, name: ctx.accountName(coding.accountCode) },
        confidence: Number(coding.confidence.toFixed(2)),
        source: coding.source,
        needsReview: coding.needsReview,
        rationale: coding.rationale,
      });
    }

    if (method === 'GET' && url.pathname === '/review') {
      const items = db
        .prepare(
          `SELECT c.transaction_id AS transactionId, c.account_code AS accountCode,
                  c.confidence, c.source, t.vendor, t.description
             FROM codings c JOIN transactions t ON t.id = c.transaction_id
            WHERE c.needs_review = 1
            ORDER BY c.created_at DESC`,
        )
        .all();
      return send(res, 200, { count: items.length, items });
    }

    if (method === 'POST' && url.pathname === '/correct') {
      const b = await readJson(req);
      if (!b.vendor || !b.description || !b.toAccountCode) {
        return send(res, 400, { error: 'vendor, description and toAccountCode are required' });
      }
      if (!ctx.accountExists(String(b.toAccountCode))) {
        return send(res, 400, { error: `unknown account ${String(b.toAccountCode)}` });
      }
      const t: Transaction = {
        id: (b.transactionId as string) ?? randomUUID(),
        date: today(),
        vendor: String(b.vendor),
        description: String(b.description),
        amountCents: 0,
      };
      const corr = await corrections.add({
        transaction: t,
        fromAccountCode: (b.fromAccountCode as string) ?? 'UNKNOWN',
        toAccountCode: String(b.toAccountCode),
        reason: (b.reason as string) ?? 'manual correction via API',
      });
      return send(res, 200, { ok: true, correctionId: corr.id });
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(port, () => {
  console.log(
    `ledger-agent API on http://localhost:${port}  —  GET /health · POST /code · GET /review · POST /correct`,
  );
});
