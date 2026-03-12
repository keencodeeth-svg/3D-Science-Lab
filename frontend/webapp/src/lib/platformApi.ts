import { requestJson } from './http';
import type { LabAttemptRecord, LabTelemetryInput } from './labTelemetry';
import type { DemoClassroom, DemoStudent, SchoolSummary } from './schoolRoster';
import type { TeacherAssignmentDraft, TeacherAssignmentRecord } from './teacherAssignments';

export interface PlatformBootstrap {
  school: SchoolSummary;
  classrooms: DemoClassroom[];
  students: DemoStudent[];
  currentStudentId: string;
  assignments: TeacherAssignmentRecord[];
  attempts: LabAttemptRecord[];
}

export function loadPlatformBootstrap() {
  return requestJson<PlatformBootstrap>('/api/v1/platform/bootstrap', {
    errorMessage: '无法加载平台引导信息',
    retries: 1,
    timeoutMs: 7000,
  });
}

export function updateCurrentStudentSelection(studentId: string) {
  return requestJson<{ currentStudentId: string }>('/api/v1/platform/current-student', {
    errorMessage: '切换学生身份失败',
    method: 'PATCH',
    body: JSON.stringify({ studentId }),
    timeoutMs: 6000,
  });
}

export async function createAssignment(draft: TeacherAssignmentDraft) {
  const response = await requestJson<{ item: TeacherAssignmentRecord }>('/api/v1/assignments', {
    errorMessage: '创建作业失败',
    method: 'POST',
    body: JSON.stringify(draft),
    timeoutMs: 8000,
  });

  return response.item;
}

export async function recordTelemetryEvent(event: LabTelemetryInput) {
  const response = await requestJson<{ items: LabAttemptRecord[] }>('/api/v1/sessions/telemetry', {
    errorMessage: '同步实验记录失败',
    method: 'POST',
    body: JSON.stringify(event),
    timeoutMs: 8000,
  });

  return response.items;
}

export function clearAttemptRecords() {
  return requestJson<void>('/api/v1/sessions', {
    errorMessage: '清空实验记录失败',
    method: 'DELETE',
    timeoutMs: 6000,
  });
}
