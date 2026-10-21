import type { Coding, Transaction } from '../domain/types.js';
import type { ContextStore } from '../context/contextStore.js';
import type { CorrectionsMemory } from '../memory/corrections.js';
import { chatJSON } from '../llm/ollama.js';
import { config } from '../config/config.js';

/** If a past correction is this similar, apply it directly (deterministic). */
const STRONG_CORRECTION = 0.9;
/** Corrections at least this similar are shown to the model as guidance. */
const HINT_CORRECTION = 0.6;

interface LlmCoding {
  accountCode: string;
  confidence: number;
  rationale: string;
}

/**
 * Decide the GL account for a transaction, in priority order:
 *  1. A near-identical past correction  → apply it (the agent "learned").
 *  2. A known vendor mapping            → use it.
 *  3. The LLM, given the relevant rules + any similar corrections as guidance.
 */
export async function classifyTransaction(
  t: Transaction,
  ctx: ContextStore,
  corrections: CorrectionsMemory,
): Promise<Coding> {
  // 1. Learned correction for a (near-)identical transaction.
  const similar = await corrections.retrieveSimilar(t, config.correctionRetrievalK);
  const top = similar[0];
  if (top && top.score >= STRONG_CORRECTION && ctx.accountExists(top.correction.toAccountCode)) {
    return {
      transactionId: t.id,
      accountCode: top.correction.toAccountCode,
      confidence: 0.98,
      rationale: `Applied a prior human correction for a very similar transaction ("${top.correction.vendor}"): ${top.correction.reason}`,
      needsReview: false,
      source: 'correction-memory',
    };
  }

  // 2. Known vendor mapping.
  const vendorAccount = ctx.getVendorAccount(t.vendor);
  if (vendorAccount && ctx.accountExists(vendorAccount)) {
    return {
      transactionId: t.id,
      accountCode: vendorAccount,
      confidence: 0.95,
      rationale: `Vendor "${t.vendor}" is mapped to ${vendorAccount} ${ctx.accountName(vendorAccount)}.`,
      needsReview: false,
      source: 'vendor-memory',
    };
  }

  // 3. LLM with retrieved context + weaker corrections as hints.
  const scoredRules = await ctx.relevantRulesScored(t, 4);
  const rules = scoredRules.map((s) => s.rule);
  const topRuleScore = scoredRules[0]?.score ?? 0;
  const hints = similar.filter((s) => s.score >= HINT_CORRECTION);
  const accounts = ctx.getAccounts();

  const system =
    'You are a meticulous accounting assistant. You code a company expense transaction to exactly one GL account from the provided chart of accounts. ' +
    'Prefer the coding rules and any prior human corrections. Respond with JSON only.';

  const user = [
    'TRANSACTION:',
    `  vendor: ${t.vendor}`,
    `  description: ${t.description}`,
    `  amount: $${(t.amountCents / 100).toFixed(2)}`,
    '',
    'CHART OF ACCOUNTS (choose exactly one code):',
    ...accounts.map((a) => `  ${a.code} — ${a.name}`),
    '',
    'RELEVANT CODING RULES:',
    ...rules.map((r) => `  - ${r.text}`),
    hints.length
      ? '\nPRIOR HUMAN CORRECTIONS for similar transactions (strong guidance):\n' +
        hints
          .map(
            (h) =>
              `  - "${h.correction.vendor}" → ${h.correction.toAccountCode} (${h.correction.reason})`,
          )
          .join('\n')
      : '',
    '',
    'Respond with JSON: {"accountCode": "<code from the list>", "confidence": <0..1>, "rationale": "<one sentence>"}',
  ].join('\n');

  const out = await chatJSON<LlmCoding>(system, user);

  const valid = typeof out.accountCode === 'string' && ctx.accountExists(out.accountCode);
  const confidence = valid ? clamp01(Number(out.confidence) || 0.5) : 0;

  // Decide whether a human should look. Independent signals, so we don't rely on
  // the model's self-reported confidence (small local models overstate it):
  //   (a) the model returned an account that isn't in the chart,
  //   (b) the model's own confidence is below threshold,
  //   (c) weak support — no close coding rule AND no prior correction, or
  //   (d) disagreement — a rule clearly applies but points somewhere else.
  const topRuleAccount = scoredRules[0]?.rule.accountCode;
  const hasSupportingRule = topRuleScore >= config.ruleSupportFloor;
  const lowConfidence = confidence < config.reviewConfidenceThreshold;
  const weakSupport = hints.length === 0 && !hasSupportingRule;
  const disagreesWithRule =
    hints.length === 0 && hasSupportingRule && valid && topRuleAccount !== out.accountCode;
  const needsReview = !valid || lowConfidence || weakSupport || disagreesWithRule;

  let reviewReason: string | undefined;
  if (!valid) {
    reviewReason = `model returned an unknown account (${out.accountCode})`;
  } else if (lowConfidence) {
    reviewReason = `low model confidence (${(confidence * 100).toFixed(0)}%)`;
  } else if (weakSupport) {
    reviewReason = `weak context support (best rule match ${(topRuleScore * 100).toFixed(0)}%, no prior correction)`;
  } else if (disagreesWithRule) {
    reviewReason = `model chose ${out.accountCode} but the closest rule points to ${topRuleAccount}`;
  }

  return {
    transactionId: t.id,
    accountCode: valid ? out.accountCode : 'UNRESOLVED',
    confidence,
    rationale: valid ? String(out.rationale ?? '') : `Model returned an invalid account (${out.accountCode}).`,
    needsReview,
    reviewReason,
    source: 'llm',
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
