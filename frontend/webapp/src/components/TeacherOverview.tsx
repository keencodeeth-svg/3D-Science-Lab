import { useEffect, useMemo, useState } from 'react';
import { AiCopilotPanel } from './AiCopilotPanel';
import type { AiCopilotArtifactType } from '../lib/aiCopilotApi';
import type { LabAttemptRecord, LabReplayEvent } from '../lib/labTelemetry';
import { getClassroomById, getStudentsByClassId, type DemoClassroom, type DemoStudent, type SchoolSummary } from '../lib/schoolRoster';
import { createSimulationGroundingSnapshot } from '../lib/simulationBlueprint';
import type { SimulationRuntimeSnapshot } from '../lib/simulationRuntime';
import { getDefaultDueDate, type TeacherAssignmentDraft, type TeacherAssignmentRecord } from '../lib/teacherAssignments';
import type { ExperimentConfig, ExperimentIndexItem, ExperimentMode, ProductStatus } from '../types/experiment';

interface TeacherOverviewProps {
  assignments: TeacherAssignmentRecord[];
  experiments: ExperimentIndexItem[];
  selectedExperiment: ExperimentConfig | null;
  attempts: LabAttemptRecord[];
  classrooms: DemoClassroom[];
  students: DemoStudent[];
  school: SchoolSummary | null;
  hasDedicatedPlayer?: boolean;
  runtimeSnapshot?: SimulationRuntimeSnapshot | null;
  onClearAttempts: () => void;
  onCreateAssignment: (draft: TeacherAssignmentDraft) => Promise<TeacherAssignmentRecord>;
}

interface ClassroomProgressRecord {
  classroom: DemoClassroom;
  rosterSize: number;
  assignmentCount: number;
  completionRate: number;
  completedStudents: number;
  pendingStudents: number;
  inProgressStudents: number;
  averageScore: number;
  averageErrors: number;
  latestExperimentTitle: string;
  latestMode: ExperimentMode | null;
}

interface StudentProgressRow {
  student: DemoStudent;
  statusLabel: string;
  completedCount: number;
  assignedCount: number;
  latestScore: number | null;
  latestExperimentTitle: string;
  latestPrompt: string;
}

const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const shortDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
});

const eventTypeLabels: Record<LabReplayEvent['eventType'], string> = {
  step: '进入步骤',
  error: '错误提醒',
  completed: '实验完成',
  reset: '重新开始',
};

const attemptStatusLabels: Record<LabAttemptRecord['status'], string> = {
  in_progress: '进行中',
  completed: '已完成',
  abandoned: '已中断',
};

const assignmentArtifactActionLabels: Record<AiCopilotArtifactType, string> = {
  assignmentNotes: '填入说明',
  lessonPlan: '追加编排',
  teacherScript: '追加话术',
  checklist: '追加清单',
};

const assignmentArtifactSectionLabels: Record<AiCopilotArtifactType, string> = {
  assignmentNotes: '任务说明',
  lessonPlan: '课堂编排',
  teacherScript: '教师话术',
  checklist: '巡检清单',
};

function formatTime(iso: string) {
  return timeFormatter.format(new Date(iso));
}

function formatShortDate(iso: string) {
  return shortDateFormatter.format(new Date(iso));
}

function calculateAverage(records: LabAttemptRecord[], selector: (record: LabAttemptRecord) => number) {
  if (!records.length) return 0;
  return Math.round(records.reduce((sum, record) => sum + selector(record), 0) / records.length);
}

function getTopErrorMessages(records: LabAttemptRecord[]) {
  const counter = new Map<string, number>();
  records.forEach((record) => {
    record.replay.forEach((event) => {
      if (event.eventType !== 'error') return;
      counter.set(event.message, (counter.get(event.message) ?? 0) + 1);
    });
  });

  return [...counter.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([message, count]) => ({ message, count }));
}

function isPassiveAttempt(attempt: LabAttemptRecord) {
  return (
    attempt.status === 'in_progress' &&
    attempt.currentStep === 1 &&
    attempt.errorCount === 0 &&
    attempt.replay.length === 1 &&
    attempt.replay[0]?.eventType === 'step' &&
    attempt.replay[0]?.step === 1
  );
}

function countByStatus(experiments: ExperimentIndexItem[], status: ProductStatus) {
  return experiments.filter((experiment) => experiment.productStatus === status).length;
}

function getUniqueExperimentIds(assignments: TeacherAssignmentRecord[]) {
  return [...new Set(assignments.map((assignment) => assignment.experimentId))];
}

function getStudentProgressRows(classId: string, assignments: TeacherAssignmentRecord[], attempts: LabAttemptRecord[], students: DemoStudent[]): StudentProgressRow[] {
  const classStudents = getStudentsByClassId(students, classId);
  const experimentIds = getUniqueExperimentIds(assignments);

  return classStudents.map((student) => {
    const studentAttempts = attempts
      .filter((attempt) => attempt.classId === classId && attempt.studentId === student.id && (experimentIds.length ? experimentIds.includes(attempt.experimentId) : false))
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());

    const completedIds = new Set(studentAttempts.filter((attempt) => attempt.status === 'completed').map((attempt) => attempt.experimentId));
    const latestAttempt = studentAttempts[0] ?? null;
    const assignedCount = experimentIds.length;

    let statusLabel = '暂无任务';
    if (assignedCount) {
      statusLabel = completedIds.size >= assignedCount ? '已完成' : latestAttempt ? '进行中' : '未开始';
    }

    return {
      student,
      statusLabel,
      completedCount: completedIds.size,
      assignedCount,
      latestScore: latestAttempt?.score ?? null,
      latestExperimentTitle: latestAttempt?.experimentTitle ?? (assignments[0]?.experimentTitle ?? '暂无任务'),
      latestPrompt: latestAttempt?.latestPrompt ?? '当前还没有实验操作记录。',
    };
  });
}

function buildClassroomProgress(classroom: DemoClassroom, classAssignments: TeacherAssignmentRecord[], attempts: LabAttemptRecord[], students: DemoStudent[]): ClassroomProgressRecord {
  const roster = getStudentsByClassId(students, classroom.id);
  const rosterSize = roster.length;
  const experimentIds = getUniqueExperimentIds(classAssignments);
  const relatedAttempts = attempts.filter((attempt) => attempt.classId === classroom.id && (experimentIds.length ? experimentIds.includes(attempt.experimentId) : false));
  const completedStudentIds = new Set(relatedAttempts.filter((attempt) => attempt.status === 'completed' && attempt.studentId).map((attempt) => attempt.studentId));
  const inProgressStudentIds = new Set(relatedAttempts.filter((attempt) => attempt.status === 'in_progress' && attempt.studentId).map((attempt) => attempt.studentId));
  const completedStudents = completedStudentIds.size;
  const inProgressStudents = [...inProgressStudentIds].filter((studentId) => !completedStudentIds.has(studentId)).length;
  const pendingStudents = Math.max(rosterSize - completedStudents - inProgressStudents, 0);
  const completionRate = rosterSize ? Math.round((completedStudents / rosterSize) * 100) : 0;
  const latestAssignment = [...classAssignments].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ?? null;

  return {
    classroom,
    rosterSize,
    assignmentCount: classAssignments.length,
    completionRate,
    completedStudents,
    pendingStudents,
    inProgressStudents,
    averageScore: relatedAttempts.length ? calculateAverage(relatedAttempts, (attempt) => attempt.score) : 0,
    averageErrors: relatedAttempts.length ? calculateAverage(relatedAttempts, (attempt) => attempt.errorCount) : 0,
    latestExperimentTitle: latestAssignment?.experimentTitle ?? '暂无任务',
    latestMode: latestAssignment?.mode ?? null,
  };
}

type TeacherWorkspaceLayer = 'overview' | 'assignment' | 'progress' | 'records' | 'roadmap';

export function TeacherOverview({
  assignments,
  experiments,
  selectedExperiment,
  attempts,
  classrooms,
  students,
  school,
  hasDedicatedPlayer = false,
  runtimeSnapshot = null,
  onClearAttempts,
  onCreateAssignment,
}: TeacherOverviewProps) {
  const scopedAttempts = useMemo(() => {
    const filtered = selectedExperiment ? attempts.filter((attempt) => attempt.experimentId === selectedExperiment.id) : attempts;
    return filtered.filter((attempt) => !isPassiveAttempt(attempt));
  }, [attempts, selectedExperiment]);

  const [selectedAttemptId, setSelectedAttemptId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedMode, setSelectedMode] = useState<ExperimentMode>('引导');
  const [dueDate, setDueDate] = useState(getDefaultDueDate());
  const [assignmentNotes, setAssignmentNotes] = useState('建议先完成引导模式，再进入练习模式；课堂上可先用演示模式投屏讲解。');
  const [assignmentMessage, setAssignmentMessage] = useState('');
  const [isCreatingAssignment, setIsCreatingAssignment] = useState(false);
  const [activeLayer, setActiveLayer] = useState<TeacherWorkspaceLayer>('overview');

  useEffect(() => {
    if (!scopedAttempts.length) {
      setSelectedAttemptId('');
      return;
    }

    if (!scopedAttempts.some((attempt) => attempt.attemptId === selectedAttemptId)) {
      setSelectedAttemptId(scopedAttempts[0].attemptId);
    }
  }, [scopedAttempts, selectedAttemptId]);

  const availableClasses = useMemo(
    () => (selectedExperiment ? classrooms.filter((classroom) => classroom.stage === selectedExperiment.stage) : classrooms),
    [classrooms, selectedExperiment],
  );

  useEffect(() => {
    if (!availableClasses.length) {
      setSelectedClassId('');
      return;
    }

    if (!availableClasses.some((classroom) => classroom.id === selectedClassId)) {
      setSelectedClassId(availableClasses[0].id);
    }
  }, [availableClasses, selectedClassId]);

  useEffect(() => {
    if (!selectedExperiment) return;
    setSelectedMode((current) => (selectedExperiment.modes.includes(current) ? current : selectedExperiment.modes[0]));
  }, [selectedExperiment]);

  const selectedAttempt = scopedAttempts.find((attempt) => attempt.attemptId === selectedAttemptId) ?? scopedAttempts[0] ?? null;
  const completedCount = scopedAttempts.filter((attempt) => attempt.status === 'completed').length;
  const inProgressCount = scopedAttempts.filter((attempt) => attempt.status === 'in_progress').length;
  const averageScore = calculateAverage(scopedAttempts, (attempt) => attempt.score);
  const averageErrors = calculateAverage(scopedAttempts, (attempt) => attempt.errorCount);
  const topErrorMessages = getTopErrorMessages(scopedAttempts);
  const productReadyCount = countByStatus(experiments, '产品级');
  const pilotReadyCount = countByStatus(experiments, '试点可用');
  const inBuildCount = countByStatus(experiments, '开发中');
  const plannedCount = countByStatus(experiments, '规划中');

  const relevantAssignments = useMemo(
    () => (selectedExperiment ? assignments.filter((assignment) => assignment.experimentId === selectedExperiment.id) : assignments),
    [assignments, selectedExperiment],
  );

  const stageCoverage = useMemo(
    () => [...new Set(experiments.map((experiment) => experiment.stage))].map((stage) => ({ stage, count: experiments.filter((experiment) => experiment.stage === stage).length })),
    [experiments],
  );

  const subjectCoverage = useMemo(
    () => [...new Set(experiments.map((experiment) => experiment.subject))].map((subject) => ({ subject, count: experiments.filter((experiment) => experiment.subject === subject).length })),
    [experiments],
  );

  const buildQueue = useMemo(
    () => experiments.filter((experiment) => experiment.productStatus !== '产品级').slice(0, 6),
    [experiments],
  );

  const classroomProgress = useMemo(
    () => availableClasses.map((classroom) => buildClassroomProgress(classroom, relevantAssignments.filter((assignment) => assignment.classId === classroom.id), attempts, students)),
    [attempts, availableClasses, relevantAssignments, students],
  );

  const activeClassrooms = classroomProgress.filter((item) => item.assignmentCount > 0);
  const schoolAverageCompletion = activeClassrooms.length ? Math.round(activeClassrooms.reduce((sum, item) => sum + item.completionRate, 0) / activeClassrooms.length) : 0;
  const schoolAverageScore = activeClassrooms.length ? Math.round(activeClassrooms.reduce((sum, item) => sum + item.averageScore, 0) / activeClassrooms.length) : 0;
  const assignmentsThisWeek = assignments.filter((assignment) => Date.now() - new Date(assignment.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000).length;
  const pilotCoverageRate = experiments.length ? Math.round(((productReadyCount + pilotReadyCount) / experiments.length) * 100) : 0;
  const teacherReadyCoverage = experiments.length ? Math.round((experiments.filter((experiment) => experiment.teacherReady).length / experiments.length) * 100) : 0;
  const selectedClassAssignments = relevantAssignments.filter((assignment) => assignment.classId === selectedClassId);
  const studentProgressRows = useMemo(() => getStudentProgressRows(selectedClassId, selectedClassAssignments, attempts, students), [attempts, selectedClassAssignments, selectedClassId, students]);
  const selectedClassroom = getClassroomById(classrooms, selectedClassId);
  const assignmentSimulationSnapshot = useMemo(
    () =>
      selectedExperiment
        ? createSimulationGroundingSnapshot(selectedExperiment, {
            hasDedicatedPlayer,
            focusStep: selectedExperiment.steps[0] ?? null,
            focusTargetObject: selectedExperiment.steps[0]?.targetObject,
            runtimeSnapshot,
          })
        : null,
    [hasDedicatedPlayer, runtimeSnapshot, selectedExperiment],
  );

  const teacherLayerDescriptions: Record<TeacherWorkspaceLayer, string> = {
    overview: '先看学校、实验摘要和当前工作流。',
    assignment: '只处理布置动作和最近任务。',
    progress: '只看覆盖率、班级推进和学生状态。',
    records: '只看实验记录、步骤回放和错误。',
    roadmap: '只看产品化推进建议。',
  };

  const handleCreateAssignment = async () => {
    if (!selectedExperiment) return;
    const classroom = getClassroomById(classrooms, selectedClassId);
    if (!classroom) return;

    try {
      setIsCreatingAssignment(true);
      await onCreateAssignment({
        experimentId: selectedExperiment.id,
        classId: classroom.id,
        mode: selectedExperiment.modes.includes(selectedMode) ? selectedMode : selectedExperiment.modes[0],
        dueDate,
        notes: assignmentNotes.trim(),
      });
      setAssignmentMessage(`已将「${selectedExperiment.title}」布置给 ${classroom.name}，截止 ${dueDate}。`);
    } catch (error) {
      setAssignmentMessage(error instanceof Error ? error.message : '布置实验失败');
    } finally {
      setIsCreatingAssignment(false);
    }
  };

  const handleApplyAssignmentArtifact = (artifactType: AiCopilotArtifactType, value: string) => {
    const normalizedValue = value.trim();
    if (!normalizedValue) return;

    setAssignmentNotes((current) => {
      if (artifactType === 'assignmentNotes') {
        return normalizedValue;
      }

      const currentValue = current.trim();
      const sectionTitle = assignmentArtifactSectionLabels[artifactType];
      return currentValue ? `${currentValue}\n\n【${sectionTitle}】\n${normalizedValue}` : `【${sectionTitle}】\n${normalizedValue}`;
    });
    setAssignmentMessage(
      artifactType === 'assignmentNotes'
        ? '已将 AI 生成的任务说明填入编辑框，可继续微调后布置。'
        : `已将 AI 生成的${assignmentArtifactSectionLabels[artifactType]}追加到任务说明。`,
    );
  };

  return (
    <section className="detail-grid teacher-grid teacher-workspace-grid">
      <article className="panel hero-panel wide-panel teacher-hero-panel">
        <div className="panel-head compact-panel-head teacher-hero-head">
          <div className="workspace-hero-copy">
            <span className="eyebrow">Teacher Workspace</span>
            <h1>教师工作台</h1>
            <p className="workspace-hero-helper">按总览、布置、进度、记录、推进分层处理，教师更快进入任务。</p>
          </div>
          <div className="teacher-hero-side">
            <div className="workspace-hero-pills">
              <span className="status-pill ready">本周 {assignmentsThisWeek}</span>
              <span className="status-pill">产品级 {productReadyCount}</span>
              <span className="status-pill">平均分 {averageScore || '--'}</span>
            </div>
            <button className="switch" onClick={onClearAttempts} type="button" disabled={!attempts.length}>
              清空实验记录
            </button>
          </div>
        </div>

        <div className="metric-row teacher-metric-row">
          <div className="metric-card">
            <span>可布置</span>
            <strong>{experiments.length}</strong>
          </div>
          <div className="metric-card">
            <span>产品级 / 试点</span>
            <strong>{productReadyCount} / {pilotReadyCount}</strong>
          </div>
          <div className="metric-card">
            <span>本周任务</span>
            <strong>{assignmentsThisWeek}</strong>
          </div>
          <div className="metric-card">
            <span>平均得分</span>
            <strong>{averageScore || '--'}</strong>
          </div>
        </div>
      </article>

      <article className="panel wide-panel workspace-layer-panel">
        <div className="workspace-layer-bar" aria-label="教师工作台分层导航" role="tablist">
          <button className={activeLayer === 'overview' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('overview')} type="button">总览</button>
          <button className={activeLayer === 'assignment' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('assignment')} type="button">布置</button>
          <button className={activeLayer === 'progress' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('progress')} type="button">进度</button>
          <button className={activeLayer === 'records' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('records')} type="button">记录</button>
          <button className={activeLayer === 'roadmap' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('roadmap')} type="button">推进</button>
        </div>
        <div className="workspace-layer-helper">
          <strong>{activeLayer === 'overview' ? '一级总览层' : activeLayer === 'assignment' ? '二级布置层' : activeLayer === 'progress' ? '二级进度层' : activeLayer === 'records' ? '二级记录层' : '二级推进层'}</strong>
          <small>{teacherLayerDescriptions[activeLayer]}</small>
        </div>
      </article>

      {activeLayer === 'overview' ? (
        <>
          <article className="panel">
            <span className="eyebrow">School</span>
            <h2>学校概览</h2>
            <div className="teacher-summary school-summary-grid">
              <div>
                <strong>{school?.name ?? '实验学校'}</strong>
                <p>{school?.district ?? '待接入学校信息'}</p>
              </div>
              <div>
                <strong>{school?.campusCount ?? 0} 个校区</strong>
                <p>{school?.teacherCount ?? 0} 位教师 · {school?.studentCount ?? students.length} 名学生</p>
              </div>
              <div>
                <strong>班级激活率</strong>
                <p>{activeClassrooms.length}/{availableClasses.length} 个班级已进入任务流</p>
              </div>
              <div>
                <strong>产品覆盖率</strong>
                <p>试点及以上 {pilotCoverageRate}% · 教师闭环 {teacherReadyCoverage}%</p>
              </div>
            </div>
            <div className="status-pill-row">
              <span className="status-pill ready">平均完成率 {schoolAverageCompletion}%</span>
              <span className="status-pill ready">平均班级得分 {schoolAverageScore || '--'}</span>
              <span className="status-pill">演示班级 {availableClasses.length}</span>
              <span className="status-pill">实验记录 {attempts.length}</span>
            </div>
          </article>

          <article className="panel">
            <span className="eyebrow">Selected Experiment</span>
            <h2>教师视角摘要</h2>
            {selectedExperiment ? (
              <div className="teacher-summary">
                <div>
                  <strong>实验标题</strong>
                  <p>{selectedExperiment.title}</p>
                </div>
                <div>
                  <strong>适用范围</strong>
                  <p>{selectedExperiment.stage} · {selectedExperiment.subject} · {selectedExperiment.grade}</p>
                </div>
                <div>
                  <strong>课程主题</strong>
                  <p>{selectedExperiment.curriculum.theme} · {selectedExperiment.curriculum.unit}</p>
                </div>
                <div>
                  <strong>产品状态</strong>
                  <p>{selectedExperiment.productization.status} · {selectedExperiment.productization.interactionMode}</p>
                </div>
              </div>
            ) : (
              <p>请先在学生端列表选择一个实验。</p>
            )}
          </article>

          <article className="panel wide-panel">
            <span className="eyebrow">Teacher Actions</span>
            <h2>当前工作流</h2>
            <ul className="bullet-list">
              <li>教师先选实验、班级和模式，再创建实验任务</li>
              <li>学生端切换到具体学生身份后，可以看到属于自己的任务</li>
              <li>教师端默认展示班级汇总与学生名单，不要求老师自己拼数据</li>
              <li>后续只要补真实账号和班级关系，就能把这套演示流升级为正式产品流</li>
            </ul>
          </article>
        </>
      ) : null}

      {activeLayer === 'assignment' ? (
        <>
          <article className="panel wide-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Assignment</span>
                <h2>实验布置</h2>
              </div>
              <small>{selectedExperiment ? `当前实验：${selectedExperiment.title}` : '先在学生端选择一个实验后再布置'}</small>
            </div>

            <div className="assignment-builder-grid">
              <label className="field-block">
                <span>目标班级</span>
                <select className="form-control" onChange={(event) => setSelectedClassId(event.target.value)} value={selectedClassId}>
                  {availableClasses.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name} · 演示名单 {getStudentsByClassId(students, classroom.id).length} 人
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-block">
                <span>任务模式</span>
                <select className="form-control" onChange={(event) => setSelectedMode(event.target.value as ExperimentMode)} value={selectedMode}>
                  {(selectedExperiment?.modes ?? ['引导', '练习', '考核']).map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-block">
                <span>截止日期</span>
                <input className="form-control" onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} />
              </label>
            </div>

            <label className="field-block field-block-wide">
              <span>任务说明</span>
              <textarea className="form-control form-textarea" onChange={(event) => setAssignmentNotes(event.target.value)} rows={3} value={assignmentNotes} />
            </label>

            <div className="teacher-assignment-copilot-shell">
              <AiCopilotPanel
                artifactActionLabels={assignmentArtifactActionLabels}
                assignmentMode={selectedMode}
                classIdOverride={selectedClassId}
                classroomName={selectedClassroom?.name ?? ''}
                currentStudent={null}
                dueDate={dueDate}
                initialMode="plan"
                onApplyArtifact={handleApplyAssignmentArtifact}
                role="teacher"
                selectedExperiment={selectedExperiment}
                simulationSnapshot={assignmentSimulationSnapshot}
                variant="teacher-assignment"
              />
            </div>

            <div className="panel-head assignment-footer">
              <small>建议流程：教师先投屏演示 → 学生完成引导模式 → 再布置练习或考核。</small>
              <button className="action-button" disabled={!selectedExperiment || !selectedClassId || isCreatingAssignment} onClick={() => void handleCreateAssignment()} type="button">
                {isCreatingAssignment ? '布置中...' : '布置给班级'}
              </button>
            </div>

            <div className={assignmentMessage ? 'scene-note valid' : 'scene-note'}>
              {assignmentMessage || '这里会保存到后端任务记录。接入真实账号和班级后，可直接升级为正式任务中心。'}
            </div>
          </article>

          <article className="panel wide-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Assignments</span>
                <h2>最近布置</h2>
              </div>
              <small>{selectedExperiment ? '已按当前实验过滤' : '展示全部布置记录'}</small>
            </div>

            {relevantAssignments.length ? (
              <div className="assignment-grid">
                {relevantAssignments.slice(0, 8).map((assignment) => (
                  <div className="assignment-card" key={assignment.assignmentId}>
                    <div className="badge-row compact">
                      <span className="badge">{assignment.className}</span>
                      <span className="badge">{assignment.mode}</span>
                      <span className="badge badge-status">{assignment.productStatus}</span>
                    </div>
                    <h3>{assignment.experimentTitle}</h3>
                    <p>截止 {assignment.dueDate} · 创建于 {formatShortDate(assignment.createdAt)}</p>
                    <small>{assignment.notes || '暂无补充说明'}</small>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-panel teacher-empty-panel">
                <div>
                  <h3>还没有布置记录</h3>
                  <p>先选一个实验并布置给班级，这里就会沉淀任务流数据。</p>
                </div>
              </div>
            )}
          </article>
        </>
      ) : null}

      {activeLayer === 'progress' ? (
        <>
          <article className="panel wide-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Coverage</span>
                <h2>课程覆盖与产品进度</h2>
              </div>
              <small>按实验配置自动汇总</small>
            </div>

            <div className="coverage-grid">
              <div className="coverage-card">
                <strong>学段覆盖</strong>
                <div className="coverage-chip-row">
                  {stageCoverage.map((item) => (
                    <span className="badge" key={item.stage}>{item.stage} {item.count}</span>
                  ))}
                </div>
              </div>

              <div className="coverage-card">
                <strong>学科覆盖</strong>
                <div className="coverage-chip-row">
                  {subjectCoverage.map((item) => (
                    <span className="badge" key={item.subject}>{item.subject} {item.count}</span>
                  ))}
                </div>
              </div>

              <div className="coverage-card">
                <strong>产品状态</strong>
                <div className="coverage-chip-row">
                  <span className="badge badge-status">产品级 {productReadyCount}</span>
                  <span className="badge badge-status">试点可用 {pilotReadyCount}</span>
                  <span className="badge badge-status">开发中 {inBuildCount}</span>
                  <span className="badge badge-status">规划中 {plannedCount}</span>
                </div>
              </div>
            </div>
          </article>

          <article className="panel wide-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Class Progress</span>
                <h2>班级实验进度</h2>
              </div>
              <small>基于布置记录与学生身份绑定后的实验操作计算</small>
            </div>

            <div className="class-progress-grid">
              {classroomProgress.map((item) => (
                <div className="progress-card" key={item.classroom.id}>
                  <div className="panel-head compact-panel-head">
                    <div>
                      <h3>{item.classroom.name}</h3>
                      <small>{item.classroom.gradeLabel} · 班主任 {item.classroom.homeroomTeacher}</small>
                    </div>
                    <span className="badge">{item.assignmentCount} 个任务</span>
                  </div>

                  <div className="result-row progress-row">
                    <span>完成率</span>
                    <div className="result-bar"><i style={{ width: `${item.completionRate}%` }} /></div>
                  </div>

                  <div className="teacher-summary compact-teacher-summary">
                    <div>
                      <strong>{item.completedStudents}/{item.rosterSize}</strong>
                      <p>已完成</p>
                    </div>
                    <div>
                      <strong>{item.inProgressStudents}</strong>
                      <p>进行中</p>
                    </div>
                    <div>
                      <strong>{item.pendingStudents}</strong>
                      <p>未开始</p>
                    </div>
                    <div>
                      <strong>{item.averageScore || '--'}</strong>
                      <p>平均分</p>
                    </div>
                  </div>

                  <small>最近任务：{item.latestExperimentTitle}{item.latestMode ? ` · ${item.latestMode}` : ''}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Student Status</span>
                <h2>学生完成状态</h2>
              </div>
              <small>{selectedClassroom ? `${selectedClassroom.name} · 演示名单 ${studentProgressRows.length} 人` : '请选择班级'}</small>
            </div>

            {studentProgressRows.length ? (
              <div className="student-status-grid">
                {studentProgressRows.map((row) => (
                  <div className="student-status-card" key={row.student.id}>
                    <div className="panel-head compact-panel-head">
                      <div>
                        <h3>{row.student.name}</h3>
                        <small>{row.student.className}</small>
                      </div>
                      <span className={row.statusLabel === '已完成' ? 'status-pill ready' : 'status-pill'}>{row.statusLabel}</span>
                    </div>
                    <div className="teacher-summary compact-teacher-summary two-column-summary">
                      <div>
                        <strong>{row.completedCount}/{row.assignedCount}</strong>
                        <p>任务完成</p>
                      </div>
                      <div>
                        <strong>{row.latestScore ?? '--'}</strong>
                        <p>最近得分</p>
                      </div>
                    </div>
                    <p>{row.latestExperimentTitle}</p>
                    <small>{row.latestPrompt}</small>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-panel teacher-empty-panel">
                <div>
                  <h3>当前班级还没有学生状态</h3>
                  <p>先布置实验，再切换学生身份去完成实验，这里就会形成真实的完成状态。</p>
                </div>
              </div>
            )}
          </article>
        </>
      ) : null}

      {activeLayer === 'records' ? (
        <>
          <article className="panel wide-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Attempt Records</span>
                <h2>最近实验记录</h2>
              </div>
              <small>{selectedExperiment ? '已按当前实验过滤' : '展示全部实验记录'}</small>
            </div>

            {scopedAttempts.length ? (
              <div className="attempt-grid">
                {scopedAttempts.map((attempt) => (
                  <button
                    className={selectedAttempt?.attemptId === attempt.attemptId ? 'attempt-card active' : 'attempt-card'}
                    key={attempt.attemptId}
                    onClick={() => setSelectedAttemptId(attempt.attemptId)}
                    type="button"
                  >
                    <div className="badge-row compact">
                      <span className="badge">{attempt.className ?? attempt.subject}</span>
                      <span className="badge">{attempt.studentName ?? '匿名学生'}</span>
                      <span className="badge">得分 {attempt.score}</span>
                    </div>
                    <h3>{attempt.experimentTitle}</h3>
                    <p>步骤 {attempt.currentStep}/{attempt.totalSteps} · 错误 {attempt.errorCount} 次</p>
                    <small>开始 {formatTime(attempt.startedAt)} · 更新 {formatTime(attempt.updatedAt)}</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-panel teacher-empty-panel">
                <div>
                  <h3>还没有实验记录</h3>
                  <p>先去学生端切换一个学生身份并做一次实验，这里就会出现成绩和步骤回放。</p>
                </div>
              </div>
            )}
          </article>

          <article className="panel wide-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Step Replay</span>
                <h2>步骤回放</h2>
              </div>
              <small>{selectedAttempt ? `${selectedAttempt.experimentTitle} · ${attemptStatusLabels[selectedAttempt.status]}` : '暂无回放'}</small>
            </div>

            {selectedAttempt ? (
              <div className="timeline-list">
                {selectedAttempt.replay.map((event) => (
                  <div className={`timeline-item ${event.eventType}`} key={event.id}>
                    <div className="timeline-meta">
                      <span className="timeline-time">{formatTime(event.timestamp)}</span>
                      <span className="timeline-pill">{eventTypeLabels[event.eventType]}</span>
                    </div>
                    <div className="timeline-body">
                      <strong>{event.stepLabel} · Step {event.step}/{event.totalSteps}</strong>
                      <p>{event.message}</p>
                      <small>当时得分 {event.scoreSnapshot} · 累计错误 {event.errorCount}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-panel teacher-empty-panel">
                <div>
                  <h3>暂无可回放步骤</h3>
                  <p>请先完成一次实验交互或切换到有记录的实验。</p>
                </div>
              </div>
            )}
          </article>

          <article className="panel">
            <span className="eyebrow">Insights</span>
            <h2>错误统计</h2>
            {topErrorMessages.length ? (
              <div className="insight-list">
                {topErrorMessages.map((item) => (
                  <div className="insight-card" key={item.message}>
                    <strong>{item.count} 次</strong>
                    <p>{item.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p>当前还没有错误日志。学生端出现误操作后，这里会自动汇总。</p>
            )}
          </article>

          <article className="panel">
            <span className="eyebrow">Health</span>
            <h2>实验健康度</h2>
            <div className="teacher-summary">
              <div>
                <strong>平均错误数</strong>
                <p>{scopedAttempts.length ? `${averageErrors} 次 / 尝试` : '暂无数据'}</p>
              </div>
              <div>
                <strong>最新尝试</strong>
                <p>{selectedAttempt ? formatTime(selectedAttempt.updatedAt) : '暂无记录'}</p>
              </div>
              <div>
                <strong>完成 / 进行中</strong>
                <p>{completedCount} / {inProgressCount}</p>
              </div>
              <div>
                <strong>验证目标</strong>
                <p>布置任务 → 学生完成 → 班级推进 → 学校概览 → 教师复盘</p>
              </div>
            </div>
          </article>
        </>
      ) : null}

      {activeLayer === 'roadmap' ? (
        <article className="panel wide-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Build Queue</span>
              <h2>建议优先推进</h2>
            </div>
            <small>从试点到产品级的推荐顺序</small>
          </div>

          <div className="attempt-grid">
            {buildQueue.map((experiment) => (
              <div className="attempt-card" key={experiment.id}>
                <div className="badge-row compact">
                  <span className="badge">{experiment.stage}</span>
                  <span className="badge">{experiment.subject}</span>
                  <span className="badge badge-status">{experiment.productStatus}</span>
                </div>
                <h3>{experiment.title}</h3>
                <p>{experiment.grade} · {experiment.curriculumTheme}</p>
                <small>{experiment.interactionMode} · 教师闭环 {experiment.teacherReady ? '已接入' : '待接入'}</small>
              </div>
            ))}
          </div>
        </article>
      ) : null}
    </section>
  );
}
