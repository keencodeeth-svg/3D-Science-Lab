import type { EducationStage } from '../types/experiment';

export interface SchoolSummary {
  name: string;
  district: string;
  campusCount: number;
  teacherCount: number;
  studentCount: number;
}

export interface DemoClassroom {
  id: string;
  name: string;
  stage: EducationStage;
  gradeLabel: string;
  studentCount: number;
  homeroomTeacher: string;
}

export interface DemoStudent {
  id: string;
  name: string;
  stage: EducationStage;
  gradeLabel: string;
  classId: string;
  className: string;
}

export function getClassroomById(classrooms: DemoClassroom[], classId: string) {
  return classrooms.find((classroom) => classroom.id === classId) ?? null;
}

export function getStudentById(students: DemoStudent[], studentId: string) {
  return students.find((student) => student.id === studentId) ?? null;
}

export function getStudentsByClassId(students: DemoStudent[], classId: string) {
  return students.filter((student) => student.classId === classId);
}
