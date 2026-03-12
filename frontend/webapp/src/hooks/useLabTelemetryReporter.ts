import { useCallback, useEffect, useRef } from 'react';
import type { ExperimentConfig } from '../types/experiment';
import type { LabReplayEventType, LabTelemetryInput } from '../lib/labTelemetry';

interface UseLabTelemetryReporterOptions {
  experiment: ExperimentConfig;
  step: number;
  totalSteps: number;
  score: number;
  errors: number;
  prompt: string;
  completed: boolean;
  stepLabels: Record<number, string>;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

export function useLabTelemetryReporter({
  experiment,
  step,
  totalSteps,
  score,
  errors,
  prompt,
  completed,
  stepLabels,
  onTelemetry,
}: UseLabTelemetryReporterOptions) {
  const previousStepRef = useRef<number | null>(null);
  const previousErrorsRef = useRef(errors);
  const previousCompletedRef = useRef(completed);

  const emitTelemetry = useCallback(
    (eventType: LabReplayEventType, message = prompt, stepOverride = step) => {
      onTelemetry?.({
        experimentId: experiment.id,
        experimentTitle: experiment.title,
        subject: experiment.subject,
        stage: experiment.stage,
        grade: experiment.grade,
        step: stepOverride,
        totalSteps,
        stepLabel: stepLabels[stepOverride] ?? `步骤 ${stepOverride}`,
        message,
        eventType,
        score,
        errors,
      });
    },
    [errors, experiment.grade, experiment.id, experiment.stage, experiment.subject, experiment.title, onTelemetry, prompt, score, step, stepLabels, totalSteps],
  );

  useEffect(() => {
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    emitTelemetry('step');
  }, [emitTelemetry, step]);

  useEffect(() => {
    if (errors > previousErrorsRef.current) {
      emitTelemetry('error');
    }
    previousErrorsRef.current = errors;
  }, [emitTelemetry, errors]);

  useEffect(() => {
    if (completed && !previousCompletedRef.current) {
      emitTelemetry('completed');
    }
    previousCompletedRef.current = completed;
  }, [completed, emitTelemetry]);

  const reportReset = useCallback(
    (message = '实验已重置，开始新的尝试记录。') => {
      emitTelemetry('reset', message, 1);
      previousStepRef.current = 1;
      previousErrorsRef.current = 0;
      previousCompletedRef.current = false;
    },
    [emitTelemetry],
  );

  return {
    reportReset,
    emitTelemetry,
  };
}
