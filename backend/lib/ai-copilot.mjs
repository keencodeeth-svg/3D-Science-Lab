import { loadExperimentConfigById } from './experiment-catalog.mjs';

const OPENAI_MODEL = process.env.OPENAI_MODEL ?? 'gpt-5-mini';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

const STUDENT_MODES = new Set(['study', 'hint', 'explain', 'review']);
const TEACHER_MODES = new Set(['insight', 'plan', 'intervene']);

function roundPercent(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function joinLines(lines) {
  return lines.filter(Boolean).join('\n');
}

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function trimStringArray(values, limit = 8) {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeSimulationSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;

  return {
    executionModel: trimText(snapshot.executionModel),
    renderRuntime: trimText(snapshot.renderRuntime),
    assetPipeline: trimStringArray(snapshot.assetPipeline),
    observables: trimStringArray(snapshot.observables),
    controlInputs: trimStringArray(snapshot.controlInputs),
    groundingChannels: trimStringArray(snapshot.groundingChannels),
    upgradeTargets: trimStringArray(snapshot.upgradeTargets),
    fidelityLayers: trimStringArray(snapshot.fidelityLayers),
    focusLens: trimText(snapshot.focusLens),
    focusStepTitle: trimText(snapshot.focusStepTitle),
    focusStepGoal: trimText(snapshot.focusStepGoal),
    focusTargetObject: trimText(snapshot.focusTargetObject),
    materialSummary: trimText(snapshot.materialSummary),
    ruleSummary: trimText(snapshot.ruleSummary),
    traceSummary: trimText(snapshot.traceSummary),
    telemetrySummary: trimText(snapshot.telemetrySummary),
    runtimeSource: trimText(snapshot.runtimeSource),
    runtimePhase: trimText(snapshot.runtimePhase),
    runtimeSummary: trimText(snapshot.runtimeSummary),
    runtimeObservables: trimStringArray(snapshot.runtimeObservables, 6),
    runtimeControls: trimStringArray(snapshot.runtimeControls, 6),
    runtimeRisks: trimStringArray(snapshot.runtimeRisks, 5),
    runtimeTraceSummary: trimText(snapshot.runtimeTraceSummary),
  };
}

function describeStepGoal(step) {
  if (!step) return '先确认当前操作目标是否满足实验要求。';
  if (typeof step.description === 'string' && step.description.trim()) return step.description.trim();
  if (typeof step.successCondition === 'string' && step.successCondition.trim()) {
    return step.successCondition.trim().replaceAll('-', ' ');
  }
  return step.title || '先确认当前操作目标是否满足实验要求。';
}

function sortByUpdatedAt(records) {
  return [...records].sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
}

function getLatestAttempt(attempts, filters = {}) {
  const { experimentId = '', studentId = '', classId = '' } = filters;

  return sortByUpdatedAt(attempts).find((attempt) => {
    if (experimentId && attempt.experimentId !== experimentId) return false;
    if (studentId && (attempt.studentId ?? '') !== studentId) return false;
    if (classId && (attempt.classId ?? '') !== classId) return false;
    return true;
  }) ?? null;
}

function getTopErrors(attempts, limit = 3) {
  const errorCounter = new Map();

  attempts.forEach((attempt) => {
    attempt.replay.forEach((event) => {
      if (event.eventType !== 'error') return;
      errorCounter.set(event.message, (errorCounter.get(event.message) ?? 0) + 1);
    });
  });

  return [...errorCounter.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([message, count]) => ({ message, count }));
}

function validateCopilotPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('copilot payload must be an object');
  }

  const optionalStringFields = ['role', 'mode', 'question', 'experimentId', 'studentId', 'classId', 'focusStepId', 'assignmentMode', 'dueDate'];
  optionalStringFields.forEach((field) => {
    if (payload[field] != null && typeof payload[field] !== 'string') {
      throw new Error(`${field} must be a string`);
    }
  });

  if (payload.simulationSnapshot != null && (typeof payload.simulationSnapshot !== 'object' || Array.isArray(payload.simulationSnapshot))) {
    throw new Error('simulationSnapshot must be an object');
  }
}

function buildStudentContext(state, payload, experiment) {
  const student = state.students.find((item) => item.id === payload.studentId) ?? null;
  const classroom = state.classrooms.find((item) => item.id === (payload.classId || student?.classId || '')) ?? null;
  const studentAttempts = state.attempts.filter((attempt) => (attempt.studentId ?? '') === (student?.id ?? ''));
  const experimentAttempts = studentAttempts.filter((attempt) => attempt.experimentId === experiment.id);
  const latestAttempt = getLatestAttempt(studentAttempts, {
    experimentId: experiment.id,
    studentId: student?.id ?? '',
    classId: classroom?.id ?? '',
  });
  const currentStep =
    experiment.steps.find((step) => step.id === payload.focusStepId) ??
    experiment.steps[Math.max((latestAttempt?.currentStep ?? 1) - 1, 0)] ??
    experiment.steps[0] ??
    null;
  const completionPercent = latestAttempt
    ? roundPercent(Math.min(latestAttempt.currentStep, latestAttempt.totalSteps), latestAttempt.totalSteps)
    : 0;
  const topErrors = getTopErrors(experimentAttempts, 2);
  const capabilities = unique([...(currentStep?.requiredCapabilities ?? []), ...experiment.capabilities]).slice(0, 4);

  return {
    role: 'student',
    student,
    classroom,
    experiment,
    latestAttempt,
    currentStep,
    completionPercent,
    topErrors,
    capabilities,
    simulationSnapshot: normalizeSimulationSnapshot(payload.simulationSnapshot),
  };
}

function buildTeacherContext(state, payload, experiment) {
  const relevantAssignments = state.assignments.filter((assignment) => {
    if (payload.classId && assignment.classId !== payload.classId) return false;
    if (experiment && assignment.experimentId !== experiment.id) return false;
    return true;
  });
  const relevantAttempts = state.attempts.filter((attempt) => {
    if (payload.classId && (attempt.classId ?? '') !== payload.classId) return false;
    if (experiment && attempt.experimentId !== experiment.id) return false;
    return true;
  });

  const classroomMap = new Map(state.classrooms.map((classroom) => [classroom.id, classroom]));
  const classroomStats = state.classrooms
    .filter((classroom) => !payload.classId || classroom.id === payload.classId)
    .map((classroom) => {
      const roster = state.students.filter((student) => student.classId === classroom.id);
      const classAssignments = relevantAssignments.filter((assignment) => assignment.classId === classroom.id);
      const classAttempts = relevantAttempts.filter((attempt) => (attempt.classId ?? '') === classroom.id);
      const completedStudents = new Set(classAttempts.filter((attempt) => attempt.status === 'completed' && attempt.studentId).map((attempt) => attempt.studentId));
      const inProgressStudents = new Set(classAttempts.filter((attempt) => attempt.status === 'in_progress' && attempt.studentId).map((attempt) => attempt.studentId));
      const uniqueStudents = new Set([...completedStudents, ...inProgressStudents]);

      return {
        classroom,
        rosterSize: roster.length,
        assignmentCount: classAssignments.length,
        attemptCount: classAttempts.length,
        completionRate: roundPercent(completedStudents.size, roster.length),
        activeRate: roundPercent(uniqueStudents.size, roster.length),
        averageScore: classAttempts.length ? Math.round(classAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / classAttempts.length) : 0,
        averageErrors: classAttempts.length ? Math.round(classAttempts.reduce((sum, attempt) => sum + attempt.errorCount, 0) / classAttempts.length) : 0,
      };
    })
    .sort((left, right) => left.completionRate - right.completionRate || right.averageErrors - left.averageErrors);

  const focusClassroom = classroomStats[0]?.classroom ?? (payload.classId ? classroomMap.get(payload.classId) ?? null : null);
  const focusClassroomAttempts = relevantAttempts.filter((attempt) => (attempt.classId ?? '') === (focusClassroom?.id ?? ''));
  const topErrors = getTopErrors(relevantAttempts, 3);
  const latestAttempt = getLatestAttempt(relevantAttempts);

  return {
    role: 'teacher',
    experiment,
    relevantAssignments,
    relevantAttempts,
    classroomStats,
    focusClassroom,
    focusClassroomAttempts,
    latestAttempt,
    topErrors,
    requestedAssignmentMode: trimText(payload.assignmentMode),
    requestedDueDate: trimText(payload.dueDate),
    simulationSnapshot: normalizeSimulationSnapshot(payload.simulationSnapshot),
  };
}

function createStudentFallback(context, mode, question) {
  const stepLabel = context.currentStep?.title ?? '当前步骤';
  const successCondition = describeStepGoal(context.currentStep);
  const commonMistake = context.topErrors[0]?.message ?? context.experiment.feedback.commonMistakes[0] ?? '先核对器材、顺序和观察记录。';
  const macroObservation = context.experiment.objectives[0] ?? context.experiment.curriculum.theme;
  const mesoObservation = context.experiment.multiscale?.materials[0]?.name
    ? `${context.experiment.multiscale.materials[0].name} 的状态与器材关系`
    : '器材与材料之间的中观关系';
  const microObservation = context.experiment.multiscale?.reactionRules[0]?.microNarrative ?? '当前实验还没有配置更细的粒子叙述。';
  const normalizedQuestion = question?.trim() || '';
  const simulationFocusLine = context.simulationSnapshot?.focusLens
    ? `当前仿真焦点：${context.simulationSnapshot.focusLens}层${context.simulationSnapshot.focusTargetObject ? ` · 目标对象 ${context.simulationSnapshot.focusTargetObject}` : ''}。`
    : '';
  const observableHint = context.simulationSnapshot?.observables?.length
    ? `优先看这些可观测量：${context.simulationSnapshot.observables.slice(0, 2).join('、')}。`
    : '';
  const runtimeLine = context.simulationSnapshot?.runtimeSummary
    ? `当前运行态：${context.simulationSnapshot.runtimeSummary}。`
    : '';
  const runtimeObservableLine = context.simulationSnapshot?.runtimeObservables?.length
    ? `当前关键读数：${context.simulationSnapshot.runtimeObservables.slice(0, 2).join('；')}。`
    : '';
  const runtimeRiskLine = context.simulationSnapshot?.runtimeRisks?.length
    ? `优先规避这些风险：${context.simulationSnapshot.runtimeRisks.slice(0, 2).join('；')}。`
    : '';

  if (mode === 'hint') {
    return {
      answer: [
        `先不给你完整答案，只给下一步提示。你现在先盯住“${stepLabel}”。`,
        simulationFocusLine,
        runtimeLine,
        `下一步只做一件事：${successCondition}。`,
        observableHint,
        runtimeObservableLine,
        runtimeRiskLine,
        `如果还是卡住，优先排查这类错误：${commonMistake}`,
      ].join('\n'),
      suggestions: [
        '把当前步骤拆成更小的两个动作',
        '只告诉我这一环节最容易忽略的检查点',
        '如果我做错了，会先出现什么现象',
      ],
    };
  }

  if (mode === 'explain') {
    return {
      answer: [
        `按“宏观-中观-微观”三层来看这个实验：`,
        simulationFocusLine,
        runtimeLine,
        `宏观：你要先看到的是 ${macroObservation}。`,
        `中观：关键是 ${mesoObservation}。`,
        `微观：可以把现象理解成 ${microObservation}`,
        runtimeObservableLine,
      ].join('\n'),
      suggestions: [
        '把上面的三层解释压缩成适合初中生的话',
        '只解释为什么会出现这个现象',
        '把微观解释改成课堂可复述版本',
      ],
    };
  }

  if (mode === 'review') {
    return {
      answer: [
        `基于当前实验配置${context.latestAttempt ? '和你的最近记录' : ''}，我建议你先做一次纠错复盘。`,
        context.simulationSnapshot?.telemetrySummary ? `仿真状态：${context.simulationSnapshot.telemetrySummary}` : '',
        runtimeRiskLine,
        `优先复盘步骤：${stepLabel}。`,
        `最可能的失误：${commonMistake}。`,
        context.latestAttempt
          ? `你最近一次进度在 ${context.latestAttempt.currentStep}/${context.latestAttempt.totalSteps}，当前得分 ${context.latestAttempt.score}，错误 ${context.latestAttempt.errorCount}。先把这一段补稳，再继续往后。`
          : '目前还没有你的操作记录，所以建议先完成一轮完整引导模式。',
      ].join('\n'),
      suggestions: [
        '给我一个 2 分钟自查清单',
        '按步骤列出最可能出错的位置',
        '如果要重新开始，先保留哪三条观察记录',
      ],
    };
  }

  return {
    answer: [
      `进入 Study Mode。我不会直接把答案塞给你，而是先帮你判断。`,
      simulationFocusLine,
      runtimeLine,
      `先回答这两个问题：1. 你这一步的目标是不是“${successCondition}”？ 2. 你已经确认过器材和顺序了吗？`,
      observableHint,
      runtimeObservableLine,
      normalizedQuestion ? `你刚才的问题是：“${normalizedQuestion}”。先尝试用自己的话回答，再让我继续追问。` : `如果你愿意，我可以围绕“${stepLabel}”继续追问你 2 到 3 个判断点。`,
    ].join('\n'),
    suggestions: [
      '继续追问我，不要直接给答案',
      '把这一步变成判断题来问我',
      '只告诉我应该先观察什么',
    ],
  };
}

function createTeacherFallback(context, mode, question) {
  const focusClassroom = context.focusClassroom;
  const focusStat = context.classroomStats[0] ?? null;
  const experimentTitle = context.experiment?.title ?? '当前实验';
  const topError = context.topErrors[0]?.message ?? '目前还没有足够的错因样本';
  const topErrorCount = context.topErrors[0]?.count ?? 0;
  const normalizedQuestion = question?.trim() || '';
  const durationMinutes = context.experiment?.durationMinutes ?? 12;
  const firstStep = context.experiment?.steps[0]?.title ?? '导入实验目标';
  const midStep = context.experiment?.steps[Math.max(Math.floor((context.experiment?.steps.length ?? 1) / 2), 0)]?.title ?? '完成核心操作';
  const lastStep = context.experiment?.steps[(context.experiment?.steps.length ?? 1) - 1]?.title ?? '收尾记录';
  const simulationRouteLine = context.simulationSnapshot?.executionModel
    ? `当前仿真路线：${context.simulationSnapshot.executionModel}。`
    : '';
  const runtimeLine = context.simulationSnapshot?.runtimeSummary
    ? `当前运行态：${context.simulationSnapshot.runtimeSummary}。`
    : '';
  const runtimeRiskLine = context.simulationSnapshot?.runtimeRisks?.length
    ? `当前高风险位：${context.simulationSnapshot.runtimeRisks.slice(0, 2).join('；')}。`
    : '';

  if (mode === 'plan') {
    return {
      answer: [
        `这是一个面向 ${experimentTitle} 的 AI 备课草案，按 ${durationMinutes} 分钟课时组织：`,
        simulationRouteLine,
        runtimeLine,
        `1. 导入 2 分钟：用现象或问题引出“${firstStep}”。`,
        `2. 操作 6 分钟：围绕“${midStep}”完成核心实验动作，并要求学生边做边记录。`,
        `3. 复盘 ${Math.max(durationMinutes - 8, 3)} 分钟：对照“${lastStep}”收敛结果，讲清常见错因和正确证据。`,
        runtimeRiskLine,
        normalizedQuestion ? `你额外关心的是：“${normalizedQuestion}”。建议把它放进导入提问或复盘追问。` : '如果要更强产品化落地，下一步可以把它自动转成作业模板与课堂脚本。',
      ].join('\n'),
      suggestions: [
        '把这份备课草案改成作业布置文案',
        '给我一个分层提问脚本',
        '按优生和基础生分别给操作要求',
      ],
    };
  }

  if (mode === 'intervene') {
    return {
      answer: [
        `当前建议优先做分层干预，而不是继续堆统一讲解。`,
        simulationRouteLine,
        runtimeLine,
        focusClassroom && focusStat
          ? `优先关注 ${focusClassroom.name}：完成率 ${focusStat.completionRate}%，平均错误 ${focusStat.averageErrors}。`
          : '目前没有足够的班级样本，先按实验配置准备干预预案。',
        `首个干预点：围绕高频错因“${topError}”补一个 30 秒检查点。`,
        runtimeRiskLine,
        `教师话术建议：先让学生口头说明成功条件，再动手，不要先抢答。`,
      ].join('\n'),
      suggestions: [
        '给我一份课堂巡检清单',
        '按高低水平学生给干预建议',
        '把高频错因改成板书提示语',
      ],
    };
  }

  return {
    answer: [
      `这是 ${experimentTitle} 的 Teacher Insight 摘要。`,
      simulationRouteLine,
      runtimeLine,
      focusClassroom && focusStat
        ? `当前最值得先看的是 ${focusClassroom.name}：完成率 ${focusStat.completionRate}%，活跃率 ${focusStat.activeRate}%，平均分 ${focusStat.averageScore}。`
        : '当前还没有足够的班级进度样本，建议先用实验配置生成一版标准课堂节奏。',
      `高频错因${topErrorCount ? `（${topErrorCount} 次）` : ''}：${topError}。`,
      runtimeRiskLine,
      normalizedQuestion ? `结合你的问题“${normalizedQuestion}”，建议下一步先做“错因补位 + 分层巡检”。` : '下一步动作建议：先补错因提示，再做分层巡检，最后把表现弱的班级拉到复盘模式。',
    ].join('\n'),
    suggestions: [
      '给我一个 3 条教师行动清单',
      '把这个洞察改成校内汇报摘要',
      '只看风险最高班级的下一步动作',
    ],
  };
}

function createTeacherArtifacts(context, mode) {
  const experimentTitle = context.experiment?.title ?? '当前实验';
  const className = context.focusClassroom?.name ?? '当前班级';
  const assignmentMode = context.requestedAssignmentMode || context.experiment?.modes?.[0] || '引导';
  const dueDateLabel = context.requestedDueDate ? `截止 ${context.requestedDueDate}` : '';
  const firstStep = context.experiment?.steps[0]?.title ?? '导入实验目标';
  const midStep = context.experiment?.steps[Math.max(Math.floor((context.experiment?.steps.length ?? 1) / 2), 0)]?.title ?? '完成核心操作';
  const lastStep = context.experiment?.steps[(context.experiment?.steps.length ?? 1) - 1]?.title ?? '收尾记录';
  const topError = context.topErrors[0]?.message ?? context.experiment?.feedback?.commonMistakes?.[0] ?? '先核对器材、顺序和观察记录';

  if (mode === 'plan') {
    return {
      assignmentNotes: joinLines([
        `任务主题：${experimentTitle}`,
        `适用班级：${className}`,
        `完成方式：优先完成“${assignmentMode}”模式，并保留关键观察记录。`,
        `任务要求：围绕“${midStep}”完成核心操作，再结合“${lastStep}”收束实验结论。`,
        dueDateLabel ? `时间要求：${dueDateLabel}。` : '',
        `重点提醒：做之前先口头确认成功条件，重点规避“${topError}”。`,
      ]),
      lessonPlan: joinLines([
        `1. 导入：用“${firstStep}”对应的现象或问题开场，让学生先说目标。`,
        `2. 操作：围绕“${midStep}”分步推进，要求学生边做边记。`,
        `3. 复盘：对照“${lastStep}”回收证据，统一讲清高频错因“${topError}”。`,
      ]),
      teacherScript: joinLines([
        '开场提问：今天这组实验要验证什么现象？',
        `巡检追问：你现在做到“${midStep}”了吗，成功条件是什么？`,
        '收束话术：请用观察到的证据解释结果，而不是只报答案。',
      ]),
      checklist: joinLines([
        '1. 先确认器材、顺序和记录方式都已说明。',
        `2. 在“${midStep}”前后各保留一次关键观察。`,
        `3. 复盘时重点点名提醒“${topError}”。`,
      ]),
    };
  }

  if (mode === 'intervene') {
    return {
      assignmentNotes: joinLines([
        `补充提醒：本次《${experimentTitle}》优先检查“${midStep}”环节。`,
        `分层要求：基础学生先完成“${assignmentMode}”模式，高水平学生再补充原因解释。`,
        `课堂纠错：一旦出现“${topError}”，先停下并口头复述成功条件后再继续。`,
        dueDateLabel ? `提交节点：${dueDateLabel}。` : '',
      ]),
      teacherScript: joinLines([
        `巡检话术：先别急着继续，先告诉我“${midStep}”这一步要看到什么。`,
        `补位话术：如果你发现异常，优先回查“${topError}”这一类问题。`,
        '收束话术：先说证据，再说结论。',
      ]),
      checklist: joinLines([
        '1. 优先盯低完成率或高错误率学生。',
        `2. 发现异常时先让学生复述“${midStep}”成功条件。`,
        `3. 把“${topError}”改成板书或投屏提醒。`,
      ]),
    };
  }

  return {
    assignmentNotes: joinLines([
      `任务摘要：${className} 当前可围绕《${experimentTitle}》进入标准任务流。`,
      `优先动作：先补“${topError}”提示，再按“${assignmentMode}”模式组织任务。`,
      dueDateLabel ? `节奏要求：${dueDateLabel}。` : '',
    ]),
    teacherScript: joinLines([
      '上课前先点名说明本次实验的观察目标。',
      `课堂中把“${topError}”当作重点提醒。`,
      `结束时回到“${lastStep}”，要求学生用证据复述结论。`,
    ]),
    checklist: joinLines([
      '1. 先看风险班级或低完成率学生。',
      '2. 统一补一次高频错因提醒。',
      '3. 把弱班级拉进复盘流程。',
    ]),
  };
}

function buildStudentEvidence(context) {
  const evidence = [
    { label: '实验', value: context.experiment.title },
    { label: '当前步骤', value: context.currentStep?.title ?? '未开始' },
    { label: '操作目标', value: describeStepGoal(context.currentStep) },
    {
      label: '进度',
      value: context.latestAttempt ? `${context.latestAttempt.currentStep}/${context.latestAttempt.totalSteps} · ${context.completionPercent}%` : '暂无操作记录',
    },
  ];

  if (context.simulationSnapshot?.executionModel) {
    evidence.push({ label: '仿真路线', value: context.simulationSnapshot.executionModel });
  }

  if (context.simulationSnapshot?.focusLens) {
    evidence.push({ label: '仿真焦点', value: `${context.simulationSnapshot.focusLens}${context.simulationSnapshot.focusTargetObject ? ` · ${context.simulationSnapshot.focusTargetObject}` : ''}` });
  }

  if (context.simulationSnapshot?.runtimeSummary) {
    evidence.push({ label: '运行态', value: context.simulationSnapshot.runtimeSummary });
  }

  return evidence;
}

function buildTeacherEvidence(context) {
  const evidence = [
    { label: '实验', value: context.experiment?.title ?? '平台总览' },
    { label: '班级覆盖', value: `${context.classroomStats.length} 个班级` },
    {
      label: '风险班级',
      value: context.focusClassroom && context.classroomStats[0]
        ? `${context.focusClassroom.name} · 完成率 ${context.classroomStats[0].completionRate}%`
        : '暂无风险班级',
    },
    {
      label: '高频错因',
      value: context.topErrors[0]?.message ?? '暂无错因样本',
    },
  ];

  if (context.requestedAssignmentMode) {
    evidence.push({ label: '布置模式', value: context.requestedAssignmentMode });
  }

  if (context.requestedDueDate) {
    evidence.push({ label: '截止日期', value: context.requestedDueDate });
  }

  if (context.simulationSnapshot?.executionModel) {
    evidence.push({ label: '仿真路线', value: context.simulationSnapshot.executionModel });
  }

  if (context.simulationSnapshot?.runtimeSummary) {
    evidence.push({ label: '运行态', value: context.simulationSnapshot.runtimeSummary });
  }

  return evidence;
}

function buildStudentCitations(context) {
  return unique([
    `实验主题：${context.experiment.curriculum.theme}`,
    context.currentStep ? `步骤：${context.currentStep.title}` : '',
    context.experiment.feedback.commonMistakes[0] ? `常见失误：${context.experiment.feedback.commonMistakes[0]}` : '',
    context.simulationSnapshot?.traceSummary ? `仿真链路：${context.simulationSnapshot.traceSummary}` : '',
    context.simulationSnapshot?.runtimeTraceSummary ? `运行轨迹：${context.simulationSnapshot.runtimeTraceSummary}` : '',
  ]);
}

function buildTeacherCitations(context) {
  return unique([
    context.experiment ? `实验：${context.experiment.title}` : '范围：平台总览',
    context.focusClassroom ? `班级：${context.focusClassroom.name}` : '',
    context.topErrors[0]?.message ? `错因：${context.topErrors[0].message}` : '',
    context.simulationSnapshot?.renderRuntime ? `渲染：${context.simulationSnapshot.renderRuntime}` : '',
    context.simulationSnapshot?.runtimeTraceSummary ? `运行轨迹：${context.simulationSnapshot.runtimeTraceSummary}` : '',
  ]);
}

function buildSystemPrompt(role, mode) {
  if (role === 'student') {
    return [
      '你是中小学科学实验平台的 AI Study Mode 助教。',
      '必须只基于给定实验配置、步骤、学生记录回答，不能编造。',
      'study 和 hint 模式禁止直接把最终答案完整告诉学生，要采用苏格拉底式引导。',
      'explain 模式优先按宏观/中观/微观解释。',
      'review 模式优先指出最可能失误和下一步修正。',
      '如果提供仿真运行态，优先引用运行阶段、关键读数、控制量和失败风险。',
      '输出中文，简洁、具体、可执行。',
      `当前模式：${mode}`,
    ].join('\n');
  }

  return [
    '你是科学实验教学平台的 AI Teacher Copilot。',
    '必须只基于给定实验配置、班级作业、尝试记录回答，不能编造。',
    '优先输出教师下一步动作、风险判断和课堂组织建议，不要空泛。',
    '如果数据不足，要明确说明“基于当前已有数据/配置”。',
    '如果提供仿真运行态，优先使用运行阶段、关键读数和风险点组织建议。',
    '输出中文，简洁、结构清楚、可执行。',
    `当前模式：${mode}`,
  ].join('\n');
}

function buildOpenAIInput(role, mode, context, question) {
  const basePayload = role === 'student'
    ? {
        student: context.student ? `${context.student.name} / ${context.student.className}` : '未指定学生',
        experiment: context.experiment.title,
        theme: context.experiment.curriculum.theme,
        objectives: context.experiment.objectives,
        currentStep: context.currentStep ? {
          title: context.currentStep.title,
          description: context.currentStep.description ?? '',
          successCondition: context.currentStep.successCondition,
          failureHints: context.currentStep.failureHints,
        } : null,
        latestAttempt: context.latestAttempt ? {
          currentStep: context.latestAttempt.currentStep,
          totalSteps: context.latestAttempt.totalSteps,
          score: context.latestAttempt.score,
          errorCount: context.latestAttempt.errorCount,
          latestPrompt: context.latestAttempt.latestPrompt,
        } : null,
        feedback: context.experiment.feedback,
        multiscale: context.experiment.multiscale ?? null,
        simulationSnapshot: context.simulationSnapshot,
      }
    : {
        experiment: context.experiment ? {
          title: context.experiment.title,
          stage: context.experiment.stage,
          grade: context.experiment.grade,
          durationMinutes: context.experiment.durationMinutes,
          steps: context.experiment.steps.map((step) => ({
            order: step.order,
            title: step.title,
            successCondition: step.successCondition,
          })),
        } : null,
        classStats: context.classroomStats.map((item) => ({
          className: item.classroom.name,
          completionRate: item.completionRate,
          activeRate: item.activeRate,
          averageScore: item.averageScore,
          averageErrors: item.averageErrors,
          assignmentCount: item.assignmentCount,
        })),
        topErrors: context.topErrors,
        latestAttempt: context.latestAttempt ? {
          className: context.latestAttempt.className ?? '',
          currentStepLabel: context.latestAttempt.currentStepLabel,
          score: context.latestAttempt.score,
          errorCount: context.latestAttempt.errorCount,
        } : null,
        requestedAssignmentMode: context.requestedAssignmentMode || '',
        requestedDueDate: context.requestedDueDate || '',
        simulationSnapshot: context.simulationSnapshot,
      };

  return JSON.stringify({
    question: question?.trim() || '',
    context: basePayload,
  }, null, 2);
}

function extractOpenAIText(payload) {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload.output)) return '';

  return payload.output
    .flatMap((item) => Array.isArray(item.content) ? item.content : [])
    .map((part) => {
      if (typeof part.text === 'string') return part.text;
      if (typeof part.output_text === 'string') return part.output_text;
      if (typeof part?.content?.[0]?.text === 'string') return part.content[0].text;
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function callOpenAI({ role, mode, context, question }) {
  if (!process.env.OPENAI_API_KEY) return null;

  const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.3,
      max_output_tokens: 700,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: buildSystemPrompt(role, mode),
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: buildOpenAIInput(role, mode, context, question),
            },
          ],
        },
      ],
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || 'OpenAI 请求失败');
  }

  const text = extractOpenAIText(payload);
  if (!text) {
    throw new Error('OpenAI 未返回可用内容');
  }

  return text;
}

export async function generateCopilotReply(state, payload) {
  validateCopilotPayload(payload);

  const role = payload.role === 'teacher' ? 'teacher' : 'student';
  const mode = typeof payload.mode === 'string' ? payload.mode.trim() : '';

  if (role === 'student' && !STUDENT_MODES.has(mode)) {
    throw new Error('Unsupported student copilot mode');
  }

  if (role === 'teacher' && !TEACHER_MODES.has(mode)) {
    throw new Error('Unsupported teacher copilot mode');
  }

  const experiment = payload.experimentId ? await loadExperimentConfigById(payload.experimentId) : null;
  if (role === 'student' && !experiment) {
    throw new Error('student copilot requires experimentId');
  }

  const context = role === 'student'
    ? buildStudentContext(state, payload, experiment)
    : buildTeacherContext(state, payload, experiment);
  const fallback = role === 'student'
    ? createStudentFallback(context, mode, payload.question)
    : createTeacherFallback(context, mode, payload.question);
  const artifacts = role === 'teacher' ? createTeacherArtifacts(context, mode) : undefined;

  let provider = 'grounded-fallback';
  let answer = fallback.answer;

  try {
    const modelAnswer = await callOpenAI({
      role,
      mode,
      context,
      question: payload.question,
    });

    if (modelAnswer) {
      answer = modelAnswer;
      provider = 'openai';
    }
  } catch {
    provider = 'grounded-fallback';
  }

  return {
    provider,
    role,
    mode,
    answer,
    suggestions: fallback.suggestions,
    evidence: role === 'student' ? buildStudentEvidence(context) : buildTeacherEvidence(context),
    citations: role === 'student' ? buildStudentCitations(context) : buildTeacherCitations(context),
    contextLabel: role === 'student'
      ? `${context.experiment.title}${context.student ? ` · ${context.student.name}` : ''}`
      : `${context.experiment?.title ?? '平台总览'}${context.focusClassroom ? ` · ${context.focusClassroom.name}` : ''}`,
    grounded: true,
    generatedAt: new Date().toISOString(),
    artifacts,
  };
}
