function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneAttempts(records) {
  return records.map((record) => ({
    ...record,
    replay: [...record.replay],
  }));
}

function createReplayEvent(input, timestamp) {
  return {
    id: createId('evt'),
    step: input.step,
    totalSteps: input.totalSteps,
    stepLabel: input.stepLabel,
    eventType: input.eventType,
    message: input.message,
    scoreSnapshot: input.score,
    errorCount: input.errors,
    timestamp,
  };
}

function createAttemptRecord(input, timestamp) {
  return {
    attemptId: createId('attempt'),
    experimentId: input.experimentId,
    experimentTitle: input.experimentTitle,
    subject: input.subject,
    stage: input.stage,
    grade: input.grade,
    studentId: input.studentId,
    studentName: input.studentName,
    classId: input.classId,
    className: input.className,
    status: input.eventType === 'completed' ? 'completed' : 'in_progress',
    startedAt: timestamp,
    updatedAt: timestamp,
    completedAt: input.eventType === 'completed' ? timestamp : undefined,
    currentStep: input.step,
    totalSteps: input.totalSteps,
    currentStepLabel: input.stepLabel,
    latestPrompt: input.message,
    score: input.score,
    errorCount: input.errors,
    replay: [],
  };
}

function isDuplicateEvent(previousEvent, nextEvent) {
  if (!previousEvent) return false;
  if (previousEvent.eventType !== nextEvent.eventType) return false;
  if (previousEvent.step !== nextEvent.step) return false;
  if (previousEvent.message !== nextEvent.message) return false;
  if (previousEvent.scoreSnapshot !== nextEvent.scoreSnapshot) return false;
  if (previousEvent.errorCount !== nextEvent.errorCount) return false;
  return Math.abs(new Date(nextEvent.timestamp).getTime() - new Date(previousEvent.timestamp).getTime()) < 1500;
}

function matchesAttemptContext(record, input) {
  return record.experimentId === input.experimentId && (record.studentId ?? '') === (input.studentId ?? '') && (record.classId ?? '') === (input.classId ?? '');
}

export function recordLabTelemetry(records, input) {
  const timestamp = new Date().toISOString();
  const nextRecords = cloneAttempts(records);

  let activeAttempt = [...nextRecords].reverse().find((record) => matchesAttemptContext(record, input) && record.status === 'in_progress');

  const shouldRotateAttempt =
    !!activeAttempt &&
    ((input.eventType === 'reset' && activeAttempt.replay.length > 0) ||
      (input.eventType === 'step' && input.step === 1 && activeAttempt.currentStep > 1));

  if (activeAttempt && shouldRotateAttempt) {
    activeAttempt.status = 'abandoned';
    activeAttempt.updatedAt = timestamp;
    activeAttempt = undefined;
  }

  if (!activeAttempt) {
    activeAttempt = createAttemptRecord(input, timestamp);
    nextRecords.push(activeAttempt);
  }

  const replayEvent = createReplayEvent(input, timestamp);
  const lastReplayEvent = activeAttempt.replay[activeAttempt.replay.length - 1];
  if (!isDuplicateEvent(lastReplayEvent, replayEvent)) {
    activeAttempt.replay.push(replayEvent);
  }

  activeAttempt.updatedAt = timestamp;
  activeAttempt.currentStep = input.step;
  activeAttempt.totalSteps = input.totalSteps;
  activeAttempt.currentStepLabel = input.stepLabel;
  activeAttempt.latestPrompt = input.message;
  activeAttempt.score = input.score;
  activeAttempt.errorCount = input.errors;
  activeAttempt.studentId = input.studentId;
  activeAttempt.studentName = input.studentName;
  activeAttempt.classId = input.classId;
  activeAttempt.className = input.className;

  if (input.eventType === 'completed') {
    activeAttempt.status = 'completed';
    activeAttempt.completedAt = timestamp;
  }

  return nextRecords.sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}
