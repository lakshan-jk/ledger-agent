import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '../src/llm/ollama.js';

describe('cosineSimilarity', () => {
  it('is 1 for identical direction, 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('ignores magnitude (direction only)', () => {
    expect(cosineSimilarity([1, 1], [3, 3])).toBeCloseTo(1);
  });

  it('is 0 when a vector is all zeros (no divide-by-zero)', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it('ranks a closer vector higher', () => {
    const query = [1, 0.2];
    const near = cosineSimilarity(query, [1, 0.25]);
    const far = cosineSimilarity(query, [0, 1]);
    expect(near).toBeGreaterThan(far);
  });
});
