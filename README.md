# ledger-agent

[![CI](https://github.com/lakshan-jk/ledger-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/lakshan-jk/ledger-agent/actions/workflows/ci.yml)
&nbsp;![Node](https://img.shields.io/badge/node-%E2%89%A522-5FA04E?logo=node.js&logoColor=white)
&nbsp;![License](https://img.shields.io/badge/license-MIT-blue)

An AI agent that **owns a real finance workflow** — coding expense transactions to the right
GL account — built to demonstrate the four hard problems of agents that run business workflows:
giving them **context that keeps changing**, **recovering** when a step fails mid-workflow,
**learning from a human's correction**, and **measuring** whether it's actually getting better.

It runs **100% locally** on a small open model (Ollama · `llama3.2` + `nomic-embed-text`) —
**no API keys, no cloud, no data leaving the machine.** Each capability has a runnable demo that
*shows the behaviour happening.*

```
Transaction ─▶ normalize ─▶ classify (LLM) ─▶ validate ─▶ post ─▶ ledger
                              ▲          ▲
             editable business context   corrections memory
          └──── every step checkpointed (resume, never re-run) ────┘
                     eval harness scores accuracy over time
```

---

## The four problems → how this answers them

| Problem | How it's solved | See it |
| --- | --- | --- |
| **1. Context that keeps changing** | Coding rules live in the data store, not in code, and are retrieved per-transaction by embedding similarity. Edit a rule → the next decision follows it. No redeploy, no retrain. | `npm run demo:context` |
| **2. Recover mid-workflow** | A durable pipeline checkpoints every step to SQLite. A failure after the expensive LLM step resumes from the checkpoint — the LLM is **not** called again; only the failed step re-runs. | `npm run demo:recovery` |
| **3. Learn from a correction** | A human fix is stored as an embedded memory. A later, *different* transaction retrieves it and applies the lesson — generalising from a single correction. | `npm run demo:learning` |
| **4. Measure improvement** | A labeled eval set scores accuracy. Feed the mistakes back as corrections and re-run → the number moves. The measure → correct → measure loop. | `npm run demo:eval` |

---

## Quick start

Runs fully locally in ~5 minutes. No API keys, no accounts.

**1. Prerequisites**
- **Node.js ≥ 22** (uses the built-in `node:sqlite` — verify with `node -v`).
- **[Ollama](https://ollama.com)** installed and running. Start it if needed:
  ```bash
  ollama serve        # leave running in a separate terminal (skip if already up)
  ```

**2. Pull the two local models** (≈2.3 GB total, one-time):
```bash
ollama pull llama3.2          # classification
ollama pull nomic-embed-text  # embeddings
```

**3. Install and seed**:
```bash
npm install
npm run setup        # seeds the chart of accounts + coding rules (embeds the rules)
```

**4. Run the demos** — one per problem; each prints what's happening:
```bash
npm run demo:context    # problem 1 — changing business context
npm run demo:recovery   # problem 2 — recover mid-workflow
npm run demo:learning   # problem 3 — learn from a correction
npm run demo:eval       # problem 4 — measure improvement

npm run demo:all        # setup + all four in sequence
npm test                # deterministic unit tests — classifier logic, durable engine, similarity
npm run typecheck       # strict TypeScript, no emit
```

> Tests mock the LLM client, so `npm test` and CI run **without Ollama or a model** — they
> cover the deterministic decision logic (correction/vendor/validation branches) and the
> durable checkpoint/resume engine. CI (GitHub Actions) runs typecheck + tests on every push.

> **Troubleshooting:** if a demo prints *"Could not reach Ollama"*, start the server with
> `ollama serve`. If it reports a missing model, re-run the `ollama pull` commands above.
> The first classification may be slightly slow while the model warms up.

---

## What each demo shows

**`demo:context`** — Vercel is coded `6500 R&D — Cloud Infrastructure`. Finance updates one
policy rule ("book Vercel as G&A software"). The *same* transaction immediately re-codes to
`6100` — the agent adapted to the new context with no code change.

**`demo:recovery`** — the `post` step hits a simulated outage and the run fails with
`normalize, classify, validate` checkpointed. On re-run it **resumes**:
```
• normalize cached   (replayed from checkpoint)
• classify  cached   (replayed from checkpoint — LLM NOT called again ✅)
• validate  cached   (replayed from checkpoint)
▸ post      executed (executed now)
```

**`demo:learning`** — a reviewer corrects one Vercel transaction to `6100`. A *different* Vercel
transaction then retrieves that correction (by similarity) and is coded `6100` — generalised
from a single human fix.

**`demo:eval`** — baseline accuracy on 16 labeled transactions, then the mistakes are fed back
as corrections and it re-runs → accuracy climbs (e.g. **93.8% → 100%**). Exact baseline numbers
are illustrative and depend on the local model/quantisation; the point is the *direction* —
corrections move the number up, reproducibly (the LLM runs at `temperature: 0`).

---

## Architecture

A small, layered codebase with the agent logic separated from I/O:

```
src/
  llm/        ollama.ts        local chat (JSON mode) + embeddings + cosine similarity
  db/         db.ts            node:sqlite schema (context, checkpoints, corrections, codings)
  context/    contextStore.ts  editable chart of accounts + coding rules (embedded) + vendor memory
  memory/     corrections.ts   embedded correction memory with similarity retrieval
  agent/      classify.ts      decision logic: correction → vendor → LLM(with retrieved context)
  workflow/   engine.ts        durable step runner (checkpoint / resume)
              codingWorkflow.ts  normalize → classify → validate → post
  eval/       evaluate.ts      accuracy scoring over a labeled set
  demos/      context | recovery | learning | eval
```

**Design choices**
- **Local-first.** Everything runs on a small open model via Ollama — a realistic constraint
  for enterprises that can't send financial data to a third-party API.
- **Correctness is observable.** Durable execution isn't a library call here — it's a tiny,
  readable engine you can watch replay a checkpoint instead of re-calling the LLM.
- **Memory is retrieval, not fine-tuning.** Corrections take effect immediately and are
  inspectable (you can see *which* past fix was applied and how similar it was).
- **The loop closes.** Corrections (problem 3) are exactly what the eval (problem 4) feeds on,
  so "getting better" is measurable, not hand-wavy.

---

## Limitations & what I'd build next

This is a focused prototype, not a product. With more time I'd:
- Swap the retrieval for a **vector index**. Today similarity search loads all corrections/rules
  and scores them in-process (O(n) per decision) — fine at demo scale, but at tens of thousands of
  corrections I'd move to an ANN index (sqlite-vss, pgvector, or similar) behind the same interface.
- Replace the single-decision classifier with a **planner** that handles multi-document workflows
  (e.g. match invoice → PO → receipt) with the same durable engine.
- Add **confidence-gated human handoff** (low-confidence or high-dollar items route to review).
- Promote repeated corrections into **synthesised rules** (so the context self-improves), with
  guardrails and an audit trail.
- Grow the eval into a **held-out regression suite** per account, tracking drift over time.
