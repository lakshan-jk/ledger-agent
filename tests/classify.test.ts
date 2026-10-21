import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openDb } from '../src/db/db.js';
import { ContextStore } from '../src/context/contextStore.js';
import { CorrectionsMemory } from '../src/memory/corrections.js';
import { classifyTransaction } from '../src/agent/classify.js';
import { chatJSON } from '../src/llm/ollama.js';
import type { Transaction } from '../src/domain/types.js';

// Mock only the network parts of the LLM client. cosineSimilarity stays real so
// the retrieval logic is genuinely exercised; embed is made deterministic so
// identical transaction text yields an identical vector (similarity 1.0).
vi.mock('../src/llm/ollama.js', async () => {
  const actual =
    await vi.importActual<typeof import('../src/llm/ollama.js')>('../src/llm/ollama.js');
  function fakeEmbed(text: string): number[] {
    const dim = 32;
    const v = new Array<number>(dim).fill(0);
    for (const tok of text.toLowerCase().split(/\W+/).filter(Boolean)) {
      let h = 0;
      for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
      v[h % dim] += 1;
    }
    if (v.every((x) => x === 0)) v[0] = 1; // never all-zero
    return v;
  }
  return {
    ...actual,
    embed: vi.fn(async (t: string) => fakeEmbed(t)),
    chatJSON: vi.fn(),
  };
});

const mockedChat = vi.mocked(chatJSON);

function seedAccounts(db: ReturnType<typeof openDb>): void {
  const ins = db.prepare('INSERT INTO gl_accounts (code, name, category) VALUES (?, ?, ?)');
  ins.run('6100', 'Software Subscriptions — G&A', 'Operating Expenses');
  ins.run('6500', 'R&D — Cloud Infrastructure', 'Operating Expenses');
}

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1',
    date: '2026-01-01',
    vendor: 'Vercel',
    description: 'Vercel Pro — frontend hosting',
    amountCents: 2000,
    ...over,
  };
}

function freshStore() {
  const db = openDb(':memory:');
  seedAccounts(db);
  return { db, ctx: new ContextStore(db), corrections: new CorrectionsMemory(db) };
}

describe('classifyTransaction — decision priority', () => {
  beforeEach(() => mockedChat.mockReset());

  it('applies a strong past correction deterministically, without calling the LLM', async () => {
    const { ctx, corrections } = freshStore();
    const t = tx();
    await corrections.add({
      transaction: t,
      fromAccountCode: '6500',
      toAccountCode: '6100',
      reason: 'All Vercel spend → G&A',
    });

    const result = await classifyTransaction(t, ctx, corrections);

    expect(result.source).toBe('correction-memory');
    expect(result.accountCode).toBe('6100');
    expect(result.needsReview).toBe(false);
    expect(mockedChat).not.toHaveBeenCalled();
  });

  it('uses a known vendor mapping before falling through to the LLM', async () => {
    const { ctx, corrections } = freshStore();
    ctx.setVendorAccount('Slack', '6100');

    const result = await classifyTransaction(
      tx({ vendor: 'Slack', description: 'Slack — team seats' }),
      ctx,
      corrections,
    );

    expect(result.source).toBe('vendor-memory');
    expect(result.accountCode).toBe('6100');
    expect(mockedChat).not.toHaveBeenCalled();
  });

  it('flags for review when the LLM returns an account outside the chart', async () => {
    const { ctx, corrections } = freshStore();
    mockedChat.mockResolvedValue({ accountCode: '9999', confidence: 0.9, rationale: 'guess' } as never);

    const result = await classifyTransaction(tx(), ctx, corrections);

    expect(result.source).toBe('llm');
    expect(result.accountCode).toBe('UNRESOLVED');
    expect(result.confidence).toBe(0);
    expect(result.needsReview).toBe(true);
  });

  it('accepts a valid, high-confidence LLM coding', async () => {
    const { ctx, corrections } = freshStore();
    mockedChat.mockResolvedValue({ accountCode: '6100', confidence: 0.95, rationale: 'ok' } as never);

    const result = await classifyTransaction(tx(), ctx, corrections);

    expect(result.source).toBe('llm');
    expect(result.accountCode).toBe('6100');
    expect(result.needsReview).toBe(false);
  });

  it('flags a valid but low-confidence LLM coding for review', async () => {
    const { ctx, corrections } = freshStore();
    mockedChat.mockResolvedValue({ accountCode: '6100', confidence: 0.3, rationale: 'unsure' } as never);

    const result = await classifyTransaction(tx(), ctx, corrections);

    expect(result.accountCode).toBe('6100');
    expect(result.confidence).toBeCloseTo(0.3);
    expect(result.needsReview).toBe(true);
  });
});
