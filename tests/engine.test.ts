import { describe, it, expect } from 'vitest';
import { openDb } from '../src/db/db.js';
import { WorkflowEngine } from '../src/workflow/engine.js';

describe('WorkflowEngine — durable checkpoint/resume', () => {
  it('resumes from checkpoints and never re-runs a completed step', async () => {
    const db = openDb(':memory:');
    const engine = new WorkflowEngine(db);
    const runId = 'r1';
    let step1Calls = 0;
    let step2Calls = 0;

    expect(engine.startRun(runId, 't1')).toBe('new');

    // Attempt 1: step1 completes, step2 throws (simulated outage).
    const s1 = await engine.step(runId, 'step1', async () => {
      step1Calls++;
      return { value: 1 };
    });
    expect(s1.status).toBe('executed');
    await expect(
      engine.step(runId, 'step2', async () => {
        step2Calls++;
        throw new Error('outage');
      }),
    ).rejects.toThrow('outage');
    expect(step1Calls).toBe(1);
    expect(step2Calls).toBe(1);

    // Attempt 2 (resume): step1 is replayed from checkpoint (NOT re-run), step2 runs.
    expect(engine.startRun(runId, 't1')).toBe('resumed');
    const s1b = await engine.step(runId, 'step1', async () => {
      step1Calls++; // must not happen
      return { value: 999 };
    });
    expect(s1b.status).toBe('cached');
    expect(s1b.value).toEqual({ value: 1 }); // original checkpoint, not 999
    expect(step1Calls).toBe(1); // proven: completed step not re-run

    const s2b = await engine.step(runId, 'step2', async () => {
      step2Calls++;
      return { value: 2 };
    });
    expect(s2b.status).toBe('executed');
    expect(engine.completedSteps(runId)).toEqual(['step1', 'step2']);
  });
});
