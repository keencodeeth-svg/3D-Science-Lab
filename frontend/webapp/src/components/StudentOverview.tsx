import { useMemo, useState } from 'react';
import type { LabAttemptRecord } from '../lib/labTelemetry';
import type { DemoStudent } from '../lib/schoolRoster';
import type { TeacherAssignmentRecord } from '../lib/teacherAssignments';
import type { EducationStage, ExperimentConfig, ExperimentIndexItem, ExperimentSubject, ProductStatus } from '../types/experiment';

interface StudentOverviewProps {
  assignments: TeacherAssignmentRecord[];
  attempts: LabAttemptRecord[];
  currentStudent: DemoStudent | null;
  experiments: ExperimentIndexItem[];
  onOpenSpecs: () => void;
  onOpenStudio: () => void;
  onPreviewExperiment: (experimentId: string) => void;
  onSelectExperiment: (experimentId: string) => void;
  onSelectStudent: (studentId: string) => void;
  playableExperimentIds: string[];
  selectedExperimentId: string;
  selectedExperiment: ExperimentConfig | null;
  students: DemoStudent[];
}

type StudentTaskStatus = 'assigned' | 'in_progress' | 'completed';
type StudentWorkspaceLayer = 'overview' | 'tasks' | 'catalog';

function getTaskStatusLabel(status: StudentTaskStatus) {
  if (status === 'completed') return '已完成';
  if (status === 'in_progress') return '进行中';
  return '待开始';
}

function getLensLabel(lens: ExperimentIndexItem['multiscaleSummary']['defaultLens']) {
  if (lens === 'micro') return '微观默认';
  if (lens === 'meso') return '中观默认';
  return '宏观默认';
}

export function StudentOverview({
  assignments,
  attempts,
  currentStudent,
  experiments,
  onOpenSpecs,
  onOpenStudio,
  onPreviewExperiment,
  onSelectExperiment,
  onSelectStudent,
  playableExperimentIds,
  selectedExperimentId,
  selectedExperiment,
  students,
}: StudentOverviewProps) {
  const [activeLayer, setActiveLayer] = useState<StudentWorkspaceLayer>('overview');
  const [keyword, setKeyword] = useState('');
  const [stageFilter, setStageFilter] = useState<EducationStage | '全部'>('全部');
  const [subjectFilter, setSubjectFilter] = useState<ExperimentSubject | '全部'>('全部');
  const [statusFilter, setStatusFilter] = useState<ProductStatus | '全部'>('全部');

  const playableExperiments = useMemo(() => experiments.filter((experiment) => playableExperimentIds.includes(experiment.id)), [experiments, playableExperimentIds]);
  const selectedExperimentIndex = useMemo(() => experiments.find((experiment) => experiment.id === selectedExperimentId) ?? null, [experiments, selectedExperimentId]);
  const hasPlayableExperience = selectedExperimentId ? playableExperimentIds.includes(selectedExperimentId) : false;
  const productReadyCount = useMemo(() => experiments.filter((experiment) => experiment.productStatus === '产品级').length, [experiments]);

  const stageOptions = useMemo(() => ['全部', ...new Set(experiments.map((experiment) => experiment.stage))] as const, [experiments]);
  const subjectOptions = useMemo(() => ['全部', ...new Set(experiments.map((experiment) => experiment.subject))] as const, [experiments]);
  const statusOptions = useMemo(() => ['全部', ...new Set(experiments.map((experiment) => experiment.productStatus))] as const, [experiments]);

  const currentStudentAssignments = useMemo(
    () => (currentStudent ? assignments.filter((assignment) => assignment.classId === currentStudent.classId) : []),
    [assignments, currentStudent],
  );

  const currentStudentAttempts = useMemo(
    () => (currentStudent ? attempts.filter((attempt) => attempt.studentId === currentStudent.id) : attempts),
    [attempts, currentStudent],
  );

  const classmates = useMemo(
    () => (currentStudent ? students.filter((student) => student.classId === currentStudent.classId) : []),
    [currentStudent, students],
  );

  const studentTasks = useMemo(() => {
    return [...currentStudentAssignments]
      .sort((left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime())
      .map((assignment) => {
        const relatedAttempts = currentStudentAttempts.filter((attempt) => attempt.experimentId === assignment.experimentId);
        const latestAttempt = relatedAttempts[0] ?? null;
        const status: StudentTaskStatus = latestAttempt?.status === 'completed' ? 'completed' : latestAttempt ? 'in_progress' : 'assigned';
        return {
          assignment,
          latestAttempt,
          status,
        };
      });
  }, [currentStudentAssignments, currentStudentAttempts]);

  const assignedExperimentIds = useMemo(() => new Set(currentStudentAssignments.map((assignment) => assignment.experimentId)), [currentStudentAssignments]);
  const completedTaskCount = studentTasks.filter((task) => task.status === 'completed').length;
  const inProgressTaskCount = studentTasks.filter((task) => task.status === 'in_progress').length;

  const filteredExperiments = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const statusRank: Record<ProductStatus, number> = {
      产品级: 0,
      试点可用: 1,
      开发中: 2,
      规划中: 3,
    };

    return [...experiments]
      .filter((experiment) => {
        if (stageFilter !== '全部' && experiment.stage !== stageFilter) return false;
        if (subjectFilter !== '全部' && experiment.subject !== subjectFilter) return false;
        if (statusFilter !== '全部' && experiment.productStatus !== statusFilter) return false;
        if (!normalizedKeyword) return true;

        return [experiment.title, experiment.grade, experiment.subject, experiment.curriculumTheme]
          .join(' ')
          .toLowerCase()
          .includes(normalizedKeyword);
      })
      .sort((left, right) => {
        const leftAssigned = assignedExperimentIds.has(left.id) ? 0 : 1;
        const rightAssigned = assignedExperimentIds.has(right.id) ? 0 : 1;
        if (leftAssigned !== rightAssigned) return leftAssigned - rightAssigned;
        const leftPlayable = playableExperimentIds.includes(left.id) ? 0 : 1;
        const rightPlayable = playableExperimentIds.includes(right.id) ? 0 : 1;
        if (leftPlayable !== rightPlayable) return leftPlayable - rightPlayable;
        return statusRank[left.productStatus] - statusRank[right.productStatus];
      });
  }, [assignedExperimentIds, experiments, keyword, playableExperimentIds, stageFilter, statusFilter, subjectFilter]);

  const getExperimentProgress = (experimentId: string) => {
    const relatedAttempt = currentStudentAttempts.find((attempt) => attempt.experimentId === experimentId);
    if (relatedAttempt?.status === 'completed') return '已完成';
    if (relatedAttempt) return '进行中';
    if (assignedExperimentIds.has(experimentId)) return '教师任务';
    if (playableExperimentIds.includes(experimentId)) return '可操作';
    return '规划中';
  };

  const selectedExperimentProgress = selectedExperimentId ? getExperimentProgress(selectedExperimentId) : '待选择';
  const selectedExperimentHighlights = selectedExperiment?.curriculum.knowledgePoints.slice(0, 4) ?? [];
  const overviewExperiments = filteredExperiments.slice(0, 4);
  const selectedExperimentTitle = selectedExperimentIndex?.title ?? selectedExperiment?.title ?? '先从目录选择实验';
  const selectedExperimentStatus = selectedExperiment?.productization.status ?? selectedExperimentIndex?.productStatus ?? '';
  const selectedExperimentSubject = selectedExperimentIndex?.subject ?? selectedExperiment?.subject ?? '';
  const selectedExperimentStage = selectedExperimentIndex?.stage ?? selectedExperiment?.stage ?? '';
  const selectedExperimentGrade = selectedExperimentIndex?.grade ?? selectedExperiment?.grade ?? '';
  const selectedExperimentDurationMinutes = selectedExperiment?.durationMinutes ?? selectedExperimentIndex?.durationMinutes ?? 0;
  const isSelectedExperimentPending = Boolean(selectedExperimentId) && selectedExperiment?.id !== selectedExperimentId;

  const studentLayerDescriptions: Record<StudentWorkspaceLayer, string> = {
    overview: '先看身份、下一步和推荐入口。',
    tasks: '只看任务，优先完成老师布置。',
    catalog: '只看目录和筛选，找实验更快。',
  };

  return (
    <section className="view-grid student-workspace-grid">
      <article className="panel hero-panel student-hero-panel wide-panel">
        <div className="student-hero-grid">
          <div className="student-hero-main">
            <div className="workspace-hero-bar">
              <div className="workspace-hero-copy">
                <span className="eyebrow">Student Workspace</span>
                <h1>学生实验大厅</h1>
                <p className="workspace-hero-helper">先选身份，再切到任务、目录或实验室，减少长页滚动。</p>
              </div>
              <div className="workspace-hero-pills">
                <span className="status-pill ready">可操作 {playableExperiments.length}</span>
                <span className="status-pill">产品级 {productReadyCount}</span>
                <span className="status-pill">筛选 {filteredExperiments.length}</span>
                <span className="status-pill">主题 {selectedExperiment?.curriculum.theme ?? '待选择'}</span>
              </div>
            </div>

            <div className="metric-row student-metric-row">
              <div className="metric-card">
                <span>实验库</span>
                <strong>{experiments.length}</strong>
              </div>
              <div className="metric-card">
                <span>可操作</span>
                <strong>{playableExperiments.length}</strong>
              </div>
              <div className="metric-card">
                <span>完成 / 进行</span>
                <strong>{completedTaskCount} / {inProgressTaskCount}</strong>
              </div>
            </div>

            <div className="identity-grid student-identity-grid">
              <label className="field-block">
                <span>当前学生身份</span>
                <select className="form-control" onChange={(event) => onSelectStudent(event.target.value)} value={currentStudent?.id ?? ''}>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name} · {student.className}
                    </option>
                  ))}
                </select>
              </label>

              <div className="identity-card">
                <strong>{currentStudent?.name ?? '未选择学生'}</strong>
                <p>{currentStudent ? `${currentStudent.stage} · ${currentStudent.gradeLabel} · ${currentStudent.className}` : '请选择一个演示学生'}</p>
                <div className="student-pill-row">
                  {classmates.map((student) => (
                    <button
                      className={student.id === currentStudent?.id ? 'status-pill ready' : 'status-pill'}
                      key={student.id}
                      onClick={() => onSelectStudent(student.id)}
                      type="button"
                    >
                      {student.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className="student-focus-card">
            <div className="student-focus-head">
              <div>
                <span className="eyebrow">Selected Experiment</span>
                <h2>{selectedExperimentTitle}</h2>
              </div>
              <span className={hasPlayableExperience ? 'status-pill ready' : 'status-pill'}>{selectedExperimentProgress}</span>
            </div>

            {selectedExperiment ? (
              <>
                <p>
                  {isSelectedExperimentPending
                    ? `${selectedExperimentIndex?.curriculumTheme ?? '正在同步实验摘要'} · 正在切换实验详情`
                    : `${selectedExperiment.curriculum.theme} · ${selectedExperiment.curriculum.unit}`}
                </p>

                <div className="badge-row compact">
                  <span className="badge">{selectedExperimentStage}</span>
                  <span className="badge">{selectedExperimentSubject}</span>
                  <span className="badge">{selectedExperimentGrade}</span>
                  <span className="badge badge-status">{selectedExperimentStatus}</span>
                  {isSelectedExperimentPending ? <span className="badge">详情切换中</span> : null}
                  {hasPlayableExperience ? <span className="badge badge-demo">实验室已就绪</span> : <span className="badge">配置页可看</span>}
                </div>

                <div className="student-focus-metric-grid">
                  <div className="student-focus-metric">
                    <span>时长</span>
                    <strong>{selectedExperimentDurationMinutes} 分钟</strong>
                  </div>
                  <div className="student-focus-metric">
                    <span>步骤</span>
                    <strong>{isSelectedExperimentPending ? '...' : `${selectedExperiment.steps.length} 步`}</strong>
                  </div>
                  <div className="student-focus-metric">
                    <span>器材</span>
                    <strong>{isSelectedExperimentPending ? '...' : `${selectedExperiment.equipment.length} 项`}</strong>
                  </div>
                  <div className="student-focus-metric">
                    <span>模式</span>
                    <strong>{isSelectedExperimentPending ? '正在同步' : selectedExperiment.modes.join(' / ')}</strong>
                  </div>
                </div>

                <div className="badge-row compact student-focus-highlight-row">
                  {(isSelectedExperimentPending ? [] : selectedExperimentHighlights).map((point) => (
                    <span className="badge" key={point}>{point}</span>
                  ))}
                  {isSelectedExperimentPending ? <span className="badge">实验详情正在加载</span> : null}
                </div>

                <div className="student-focus-action-row">
                  <button className="action-button student-focus-cta" onClick={selectedExperiment ? (hasPlayableExperience ? onOpenStudio : onOpenSpecs) : () => setActiveLayer('catalog')} type="button">
                    {selectedExperiment ? (hasPlayableExperience ? '进入实验室' : '查看配置页') : '去选实验'}
                  </button>
                  <button className="action-button ghost student-focus-cta" onClick={hasPlayableExperience ? onOpenSpecs : () => setActiveLayer('catalog')} type="button">
                    {hasPlayableExperience ? '跳到实验说明' : '回到实验目录'}
                  </button>
                </div>

                <small>
                  {hasPlayableExperience
                    ? '当前实验可直接进入实验室，舞台和说明层已经独立，不会再和工作台挤在同一长页。'
                    : '当前实验暂未接入专属或通用实验室，可先查看配置说明，再决定是否继续。'}
                </small>
              </>
            ) : (
              <div className="empty-inline-note">
                <strong>{selectedExperimentId ? `正在准备 ${selectedExperimentTitle}` : '还没有选中实验'}</strong>
                <p>{selectedExperimentId ? '实验详情正在同步，选中态已经更新，稍后会展示完整重点信息。' : '先在目录层里选择一个实验，这里会显示当前实验的重点信息。'}</p>
              </div>
            )}
          </aside>
        </div>
      </article>

      <article className="panel wide-panel workspace-layer-panel">
        <div className="workspace-layer-bar" aria-label="学生工作台分层导航" role="tablist">
          <button className={activeLayer === 'overview' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('overview')} type="button">概览</button>
          <button className={activeLayer === 'tasks' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('tasks')} type="button">任务 {studentTasks.length ? `· ${studentTasks.length}` : ''}</button>
          <button className={activeLayer === 'catalog' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('catalog')} type="button">目录 {filteredExperiments.length ? `· ${filteredExperiments.length}` : ''}</button>
        </div>
        <div className="workspace-layer-helper">
          <strong>{activeLayer === 'overview' ? '一级概览层' : activeLayer === 'tasks' ? '二级任务层' : '二级目录层'}</strong>
          <small>{studentLayerDescriptions[activeLayer]}</small>
        </div>
      </article>

      {activeLayer === 'overview' ? (
        <article className="panel wide-panel workspace-snapshot-panel">
          <div className="panel-head compact-panel-head">
            <div>
              <span className="eyebrow">Overview</span>
              <h2>当前重点</h2>
            </div>
            <small>这一层只保留“现在做什么”和“下一步去哪”的信息。</small>
          </div>

          <div className="workspace-snapshot-grid">
            <div className="workspace-snapshot-card">
              <span className="eyebrow">Next Step</span>
              <h3>{selectedExperiment ? selectedExperiment.title : '先选择一个实验'}</h3>
              <p>
                {selectedExperiment
                  ? hasPlayableExperience
                    ? '当前已选实验可以直接进入实验室，建议先操作再回看说明。'
                    : '当前实验更适合先查看说明与配置，再决定后续是否进入实验室。'
                  : '建议先进入目录层选择一个实验，再切到实验室或说明层继续。'}
              </p>
              <div className="workspace-snapshot-actions">
                <button className="action-button" onClick={selectedExperiment ? (hasPlayableExperience ? onOpenStudio : onOpenSpecs) : () => setActiveLayer('catalog')} type="button">
                  {selectedExperiment ? (hasPlayableExperience ? '进入实验室' : '查看实验说明') : '打开实验目录'}
                </button>
                <button className="action-button ghost" onClick={() => setActiveLayer(studentTasks.length ? 'tasks' : 'catalog')} type="button">
                  {studentTasks.length ? '查看今日任务' : '浏览实验目录'}
                </button>
              </div>
            </div>

            <div className="workspace-snapshot-card">
              <span className="eyebrow">Quick Picks</span>
              <h3>{studentTasks.length ? '任务与推荐入口' : '推荐实验入口'}</h3>
              {studentTasks.length ? (
                <div className="workspace-chip-grid">
                  {studentTasks.slice(0, 3).map((task) => (
                    <button
                      className="status-pill workspace-chip-button"
                      key={task.assignment.assignmentId}
                      onFocus={() => onPreviewExperiment(task.assignment.experimentId)}
                      onMouseEnter={() => onPreviewExperiment(task.assignment.experimentId)}
                      onClick={() => onSelectExperiment(task.assignment.experimentId)}
                      type="button"
                    >
                      {task.assignment.experimentTitle}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="workspace-chip-grid">
                {overviewExperiments.length ? overviewExperiments.map((experiment) => (
                  <button
                    className={selectedExperimentId === experiment.id ? 'status-pill ready workspace-chip-button' : 'status-pill workspace-chip-button'}
                    key={experiment.id}
                    onFocus={() => onPreviewExperiment(experiment.id)}
                    onMouseEnter={() => onPreviewExperiment(experiment.id)}
                    onClick={() => onSelectExperiment(experiment.id)}
                    type="button"
                  >
                    {experiment.title}
                  </button>
                )) : <p>当前筛选条件下暂无推荐实验，可切到目录层查看完整实验库。</p>}
              </div>
            </div>
          </div>
        </article>
      ) : null}

      {activeLayer === 'tasks' ? (
        <article className="panel wide-panel list-panel">
          <div className="panel-head compact-panel-head">
            <div>
              <span className="eyebrow">My Tasks</span>
              <h2>今日任务</h2>
            </div>
            <small>{studentTasks.length ? '优先完成教师已布置任务，再进入自选实验。' : '当前暂无教师任务，可切到目录层浏览实验。'}</small>
          </div>

          {studentTasks.length ? (
            <div className="task-grid">
              {studentTasks.slice(0, 3).map((task) => (
                <button
                  className={`task-card ${task.status}`}
                  key={task.assignment.assignmentId}
                  onFocus={() => onPreviewExperiment(task.assignment.experimentId)}
                  onMouseEnter={() => onPreviewExperiment(task.assignment.experimentId)}
                  onClick={() => onSelectExperiment(task.assignment.experimentId)}
                  type="button"
                >
                  <div className="badge-row compact">
                    <span className="badge">{task.assignment.className}</span>
                    <span className="badge">{task.assignment.mode}</span>
                    <span className="badge badge-status">{getTaskStatusLabel(task.status)}</span>
                  </div>
                  <h3>{task.assignment.experimentTitle}</h3>
                  <p>截止 {task.assignment.dueDate}</p>
                  <small>{task.latestAttempt ? `得分 ${task.latestAttempt.score} · 步骤 ${task.latestAttempt.currentStep}/${task.latestAttempt.totalSteps}` : task.assignment.notes}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty-panel student-task-empty-panel">
              <div>
                <h3>当前学生还没有任务</h3>
                <p>切换到教师端布置实验后，这里会出现“今日任务”和完成状态。</p>
              </div>
            </div>
          )}
        </article>
      ) : null}

      {activeLayer === 'catalog' ? (
        <article className="panel wide-panel list-panel">
          {!hasPlayableExperience ? (
            <div className="demo-banner">
              <div>
                <strong>当前可操作实验：</strong> {playableExperiments.slice(0, 6).map((experiment) => experiment.title).join('、')}
                <p>这一层只保留实验筛选和目录卡片，选中后再进入实验室或说明层。</p>
              </div>
              <div className="demo-banner-actions">
                {playableExperiments.slice(0, 4).map((experiment) => (
                  <button
                    className="switch demo-cta"
                    key={experiment.id}
                    onFocus={() => onPreviewExperiment(experiment.id)}
                    onMouseEnter={() => onPreviewExperiment(experiment.id)}
                    onClick={() => onSelectExperiment(experiment.id)}
                    type="button"
                  >
                    进入{experiment.subject}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="panel-head">
            <div>
              <span className="eyebrow">Experiment List</span>
              <h2>实验目录</h2>
            </div>
            <small>支持课程主题、学段、学科和产品状态筛选</small>
          </div>

          <div className="filter-toolbar">
            <label className="search-field">
              <span className="sr-only">搜索实验</span>
              <input
                aria-label="搜索实验"
                className="search-input"
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索实验、主题、年级"
                type="search"
                value={keyword}
              />
            </label>

            <div className="filter-group" aria-label="按学段筛选">
              {stageOptions.map((option) => (
                <button
                  className={stageFilter === option ? 'switch active' : 'switch'}
                  key={option}
                  onClick={() => setStageFilter(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="filter-group" aria-label="按学科筛选">
              {subjectOptions.map((option) => (
                <button
                  className={subjectFilter === option ? 'switch active' : 'switch'}
                  key={option}
                  onClick={() => setSubjectFilter(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="filter-group" aria-label="按产品状态筛选">
              {statusOptions.map((option) => (
                <button
                  className={statusFilter === option ? 'switch active' : 'switch'}
                  key={option}
                  onClick={() => setStatusFilter(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {filteredExperiments.length ? (
            <div className="card-grid catalog-card-grid">
              {filteredExperiments.map((experiment) => {
                const experimentProgress = getExperimentProgress(experiment.id);
                const isCurrentSelection = selectedExperimentId === experiment.id;
                const playable = playableExperimentIds.includes(experiment.id);

                return (
                  <button
                    key={experiment.id}
                    className={isCurrentSelection ? 'experiment-card active' : 'experiment-card'}
                    onFocus={() => onPreviewExperiment(experiment.id)}
                    onMouseEnter={() => onPreviewExperiment(experiment.id)}
                    onClick={() => onSelectExperiment(experiment.id)}
                    type="button"
                  >
                    <div className="experiment-card-head">
                      <div className="experiment-card-copy">
                        <h3>{experiment.title}</h3>
                        <p>{experiment.grade} · {experiment.curriculumTheme}</p>
                      </div>
                      <span className={isCurrentSelection || playable ? 'status-pill ready' : 'status-pill'}>{experimentProgress}</span>
                    </div>

                    <div className="badge-row compact">
                      <span className="badge">{experiment.stage}</span>
                      <span className="badge">{experiment.subject}</span>
                      <span className="badge badge-status">{experiment.productStatus}</span>
                      <span className={experiment.multiscaleSummary.source === 'configured' ? 'badge badge-multiscale configured' : 'badge badge-multiscale'}>
                        {experiment.multiscaleSummary.source === 'configured' ? '显式多尺度' : '引擎多尺度'}
                      </span>
                      <span className="badge badge-multiscale">{getLensLabel(experiment.multiscaleSummary.defaultLens)}</span>
                      {assignedExperimentIds.has(experiment.id) ? <span className="badge badge-demo">教师任务</span> : null}
                      {playable ? <span className="badge badge-demo">可操作</span> : null}
                    </div>

                    <div className="experiment-card-foot">
                      <small>{experiment.durationMinutes} 分钟 · {experiment.interactionMode} · {experiment.multiscaleSummary.materialCount} 材料 / {experiment.multiscaleSummary.reactionRuleCount} 规则</small>
                      <span className="experiment-card-action">{playable ? '进入实验室' : '查看配置'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-panel catalog-empty-panel">
              <div>
                <h3>当前筛选下没有实验</h3>
                <p>可以放宽学段、学科或产品状态条件，查看完整课程库。</p>
              </div>
            </div>
          )}
        </article>
      ) : null}
    </section>
  );
}
