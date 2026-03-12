import type { ExperimentMode, ProductStatus } from '../types/experiment';
import type { DemoClassroom } from './schoolRoster';

export interface TeacherAssignmentRecord {
  assignmentId: string;
  experimentId: string;
  experimentTitle: string;
  classId: string;
  className: string;
  stage: DemoClassroom['stage'];
  mode: ExperimentMode;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  notes: string;
  productStatus: ProductStatus;
}

export interface TeacherAssignmentDraft {
  experimentId: string;
  classId: string;
  mode: ExperimentMode;
  dueDate: string;
  notes: string;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function getDefaultDueDate() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return toDateInputValue(date);
}
