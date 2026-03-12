import { requestJson } from './http';
import type { SimulationGroundingSnapshot } from './simulationBlueprint';

export type AiCopilotRole = 'student' | 'teacher';
export type StudentCopilotMode = 'study' | 'hint' | 'explain' | 'review';
export type TeacherCopilotMode = 'insight' | 'plan' | 'intervene';
export type AiCopilotMode = StudentCopilotMode | TeacherCopilotMode;
export type AiCopilotArtifactType = 'assignmentNotes' | 'lessonPlan' | 'teacherScript' | 'checklist';

export interface AiCopilotArtifacts {
  assignmentNotes?: string;
  lessonPlan?: string;
  teacherScript?: string;
  checklist?: string;
}

export interface AiCopilotRequest {
  role: AiCopilotRole;
  mode: AiCopilotMode;
  question?: string;
  experimentId?: string;
  studentId?: string;
  classId?: string;
  focusStepId?: string;
  assignmentMode?: string;
  dueDate?: string;
  simulationSnapshot?: SimulationGroundingSnapshot;
}

export interface AiCopilotResponse {
  provider: 'openai' | 'grounded-fallback';
  role: AiCopilotRole;
  mode: AiCopilotMode;
  answer: string;
  suggestions: string[];
  evidence: Array<{ label: string; value: string }>;
  citations: string[];
  contextLabel: string;
  grounded: boolean;
  generatedAt: string;
  artifacts?: AiCopilotArtifacts;
}

export function requestAiCopilot(payload: AiCopilotRequest) {
  return requestJson<AiCopilotResponse>('/api/v1/ai/copilot', {
    errorMessage: 'AI Copilot 暂时不可用',
    method: 'POST',
    body: JSON.stringify(payload),
    timeoutMs: 18000,
  });
}
