import { config } from '../config/config.js';

/**
 * Thin client over a locally-running Ollama server. Two capabilities:
 *  - chatJSON: structured generation (JSON mode) for classification
 *  - embed:    embeddings for similarity retrieval (corrections memory)
 *
 * Everything is local — no API keys, no data leaving the machine.
 */

export class LlmError extends Error {}

/** Generate a JSON object from the chat model. Uses Ollama's `format: json` so
 *  the model is constrained to valid JSON; we still validate/parse defensively. */
export async function chatJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.ollama.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.ollama.chatModel,
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
  } catch {
    throw new LlmError(
      `Could not reach Ollama at ${config.ollama.baseUrl}. Is it running? (ollama serve)`,
    );
  }
  if (!res.ok) throw new LlmError(`Ollama chat failed: ${res.status} ${await res.text()}`);

  const body = (await res.json()) as { message?: { content?: string } };
  const content = body.message?.content ?? '';
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new LlmError(`Model did not return valid JSON. Got: ${content.slice(0, 200)}`);
  }
}

/** Embed a piece of text into a vector. */
export async function embed(text: string): Promise<number[]> {
  let res: Response;
  try {
    res = await fetch(`${config.ollama.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.ollama.embedModel, prompt: text }),
    });
  } catch {
    throw new LlmError(`Could not reach Ollama at ${config.ollama.baseUrl}.`);
  }
  if (!res.ok) throw new LlmError(`Ollama embeddings failed: ${res.status}`);
  const body = (await res.json()) as { embedding?: number[] };
  if (!body.embedding) throw new LlmError('No embedding returned.');
  return body.embedding;
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
