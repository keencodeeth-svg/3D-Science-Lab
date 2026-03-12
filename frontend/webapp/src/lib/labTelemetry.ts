import type { ExperimentConfig } from '../types/experiment';

export const LAB_ATTEMPTS_STORAGE_KEY = 'science-lab-attempt-records-v1';

export type LabReplayEventType = 'step' | 'error' | 'completed' | 'reset';
export type LabAttemptStatus = 'in_progress' | 'completed' | 'abandoned';

export interface LabTelemetryInput {
  experimentId: string;
  experimentTitle: string;
  subject: ExperimentConfig['subject'];
  stage: ExperimentConfig['stage'];
  grade: string;
  studentId?: string;
  studentName?: string;
  classId?: string;
  className?: string;
  step: number;
  totalSteps: number;
  stepLabel: string;
  message: string;
  eventType: LabReplayEventType;
  score: number;
  errors: number;
}

export interface LabReplayEvent {
  id: string;
  step: number;
  totalSteps: number;
  stepLabel: string;
  eventType: LabReplayEventType;
  message: string;
  scoreSnapshot: number;
  errorCount: number;
  timestamp: string;
}

export interface LabAttemptRecord {
  attemptId: string;
  experimentId: string;
  experimentTitle: string;
  subject: ExperimentConfig['subject'];
  stage: ExperimentConfig['stage'];
  grade: string;
  studentId?: string;
  studentName?: string;
  classId?: string;
  className?: string;
  status: LabAttemptStatus;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  currentStep: number;
  totalSteps: number;
  currentStepLabel: string;
  latestPrompt: string;
  score: number;
  errorCount: number;
  replay: LabReplayEvent[];
}

function createId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneAttempts(records: LabAttemptRecord[]) {
  return records.map((record) => ({
    ...record,
    replay: [...record.replay],
  }));
}

function createReplayEvent(input: LabTelemetryInput, timestamp: string): LabReplayEvent {
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

function createAttemptRecord(input: LabTelemetryInput, timestamp: string): LabAttemptRecord {
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

function isDuplicateEvent(previousEvent: LabReplayEvent | undefined, nextEvent: LabReplayEvent) {
  if (!previousEvent) return false;
  if (previousEvent.eventType !== nextEvent.eventType) return false;
  if (previousEvent.step !== nextEvent.step) return false;
  if (previousEvent.message !== nextEvent.message) return false;
  if (previousEvent.scoreSnapshot !== nextEvent.scoreSnapshot) return false;
  if (previousEvent.errorCount !== nextEvent.errorCount) return false;
  return Math.abs(new Date(nextEvent.timestamp).getTime() - new Date(previousEvent.timestamp).getTime()) < 1500;
}

function matchesAttemptContext(record: LabAttemptRecord, input: LabTelemetryInput) {
  return record.experimentId === input.experimentId && (record.studentId ?? '') === (input.studentId ?? '') && (record.classId ?? '') === (input.classId ?? '');
}

export function loadLabAttemptRecords(): LabAttemptRecord[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(LAB_ATTEMPTS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LabAttemptRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLabAttemptRecords(records: LabAttemptRecord[]) {
  if (typeof window === 'undefined') return;
  if (!records.length) {
    window.localStorage.removeItem(LAB_ATTEMPTS_STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(LAB_ATTEMPTS_STORAGE_KEY, JSON.stringify(records));
}

export function recordLabTelemetry(records: LabAttemptRecord[], input: LabTelemetryInput): LabAttemptRecord[] {
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
