import { describe, it, expect } from 'vitest';
import { parseCsv, toCsvRow } from '../src/lib/csv.js';

describe('CSV parse/serialize', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles quoted fields with embedded commas', () => {
    expect(parseCsv('vendor,amount\n"Doe, Smith & Co.",2800')).toEqual([
      ['vendor', 'amount'],
      ['Doe, Smith & Co.', '2800'],
    ]);
  });

  it('handles escaped double-quotes', () => {
    expect(parseCsv('"she said ""hi""",x')).toEqual([['she said "hi"', 'x']]);
  });

  it('tolerates a trailing newline and blank lines', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('round-trips through toCsvRow with quoting', () => {
    const row = toCsvRow(['Doe, Smith', 'line\nbreak', 42]);
    expect(parseCsv(row)[0]).toEqual(['Doe, Smith', 'line\nbreak', '42']);
  });
});
