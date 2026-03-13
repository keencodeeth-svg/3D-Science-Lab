import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExperimentIndex } from '../lib/experiment-catalog.mjs';
import { readState, resetState, updateState } from '../lib/state-store.mjs';

const TEST_ATTEMPT_COUNT = 20;

function createAttempt(index) {
  const timestamp = new Date(Date.UTC(2026, 2, 13, 0, 0, index)).toISOString();
  return {
    attemptId: `test-attempt-${index}`,
    experimentId: 'phy-junior-circuit-001',
    experimentTitle: '串联与并联电路',
    subject: '物理',
    stage: '初中',
    grade: '八年级',
    studentId: 'stu-701-01',
    studentName: '林语晨',
    classId: 'class-701',
    className: '七年级（1）班',
    status: 'in_progress',
    startedAt: timestamp,
    updatedAt: timestamp,
    currentStep: 1,
    totalSteps: 5,
    currentStepLabel: '步骤 1',
    latestPrompt: `test prompt ${index}`,
    score: index,
    errorCount: 0,
    replay: [],
  };
}

test('updateState serializes concurrent mutations without dropping attempts', async () => {
  await resetState();

  try {
    await Promise.all(
      Array.from({ length: TEST_ATTEMPT_COUNT }, (_, index) =>
        updateState(async (state) => ({
          ...state,
          attempts: [...state.attempts, createAttempt(index + 1)],
        })),
      ),
    );

    const state = await readState();
    assert.equal(state.attempts.length, TEST_ATTEMPT_COUNT);
    assert.deepEqual(
      new Set(state.attempts.map((attempt) => attempt.attemptId)),
      new Set(Array.from({ length: TEST_ATTEMPT_COUNT }, (_, index) => `test-attempt-${index + 1}`)),
    );
  } finally {
    await resetState();
  }
});

test('experiment catalog loads generated multiscale summaries', async () => {
  const index = await loadExperimentIndex();
  assert.equal(index.length, 100);

  const circuitExperiment = index.find((item) => item.id === 'phy-junior-circuit-001');
  assert.ok(circuitExperiment);
  assert.equal(circuitExperiment.multiscaleSummary.source === 'configured' || circuitExperiment.multiscaleSummary.source === 'derived', true);
  assert.ok(circuitExperiment.multiscaleSummary.componentCount > 0);
});
