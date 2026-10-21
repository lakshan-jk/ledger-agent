/** Central configuration. Everything runs locally against Ollama — no API keys. */
export const config = {
  ollama: {
    baseUrl: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    chatModel: process.env.CHAT_MODEL ?? 'llama3.2',
    embedModel: process.env.EMBED_MODEL ?? 'nomic-embed-text',
  },
  dbPath: process.env.DB_PATH ?? 'ledger.db',
  /** Below this classifier confidence, a coding is flagged for human review. */
  reviewConfidenceThreshold: 0.55,
  /** If the best-matching coding rule scores below this (and there's no prior
   *  correction to lean on), the LLM pick is treated as weakly-supported and
   *  flagged for review — a signal independent of the model's self-reported
   *  confidence, which small local models tend to overstate. */
  ruleSupportFloor: 0.58,
  /** How many similar past corrections to retrieve as few-shot guidance. */
  correctionRetrievalK: 3,
} as const;
