import { useEffect, useMemo, useState } from 'react';
import {
  requestAiCopilot,
  type AiCopilotArtifactType,
  type AiCopilotMode,
  type AiCopilotResponse,
  type AiCopilotRole,
  type StudentCopilotMode,
  type TeacherCopilotMode,
} from '../lib/aiCopilotApi';
import type { DemoStudent } from '../lib/schoolRoster';
import type { SimulationGroundingSnapshot } from '../lib/simulationBlueprint';
import type { ExperimentConfig } from '../types/experiment';

type AiCopilotPanelVariant = 'workspace' | 'studio' | 'teacher-assignment';
type AiCopilotSectionKey = 'context' | 'mode' | 'compose' | 'response';

interface AiCopilotPanelProps {
  role: AiCopilotRole;
  currentStudent: DemoStudent | null;
  selectedExperiment: ExperimentConfig | null;
  focusStepId?: string;
  focusStepTitle?: string;
  focusStepGoal?: string;
  classIdOverride?: string;
  classroomName?: string;
  initialMode?: AiCopilotMode;
  variant?: AiCopilotPanelVariant;
  assignmentMode?: string;
  dueDate?: string;
  simulationSnapshot?: SimulationGroundingSnapshot | null;
  onApplyArtifact?: (artifactType: AiCopilotArtifactType, value: string) => void;
  artifactActionLabels?: Partial<Record<AiCopilotArtifactType, string>>;
}

const studentModeOptions: Array<{ value: StudentCopilotMode; label: string; description: string }> = [
  { value: 'study', label: 'Study Mode', description: '像 Khanmigo 和 ChatGPT Study Mode 一样先追问，再引导。' },
  { value: 'hint', label: '下一步提示', description: '只给下一步，不直接透答案。' },
  { value: 'explain', label: '多尺度解释', description: '按宏观、中观、微观解释实验现象。' },
  { value: 'review', label: '纠错复盘', description: '根据最近记录指出风险点和补救动作。' },
];

const teacherModeOptions: Array<{ value: TeacherCopilotMode; label: string; description: string }> = [
  { value: 'insight', label: 'Teacher Insight', description: '汇总高风险班级、错因和下一步动作。' },
  { value: 'plan', label: '课堂编排', description: '基于实验步骤生成课堂组织建议。' },
  { value: 'intervene', label: '分层干预', description: '给出巡检、补位和差异化支持。' },
];

const artifactMeta: Array<{ key: AiCopilotArtifactType; label: string; description: string }> = [
  { key: 'assignmentNotes', label: '布置说明', description: '适合直接写入任务说明' },
  { key: 'lessonPlan', label: '课堂编排', description: '课内节奏与分段安排' },
  { key: 'teacherScript', label: '教师话术', description: '可直接口播或投屏使用' },
  { key: 'checklist', label: '巡检清单', description: '适合课堂巡视与纠错' },
];

function isStudentMode(mode?: AiCopilotMode): mode is StudentCopilotMode {
  return studentModeOptions.some((option) => option.value === mode);
}

function isTeacherMode(mode?: AiCopilotMode): mode is TeacherCopilotMode {
  return teacherModeOptions.some((option) => option.value === mode);
}

function getDefaultMode(role: AiCopilotRole, initialMode?: AiCopilotMode): AiCopilotMode {
  if (role === 'student') {
    return isStudentMode(initialMode) ? initialMode : 'study';
  }

  return isTeacherMode(initialMode) ? initialMode : 'insight';
}

function getProviderLabel(provider: AiCopilotResponse['provider']) {
  return provider === 'openai' ? 'OpenAI 在线' : 'Grounded 本地';
}

function getInitialStudioSections(): Record<AiCopilotSectionKey, boolean> {
  return {
    context: false,
    mode: false,
    compose: true,
    response: false,
  };
}

function getPanelCopy(role: AiCopilotRole, variant: AiCopilotPanelVariant) {
  if (role === 'teacher' && variant === 'teacher-assignment') {
    return {
      title: 'Assignment Copilot',
      description: '参考最新教师 AI 助理思路，把课堂编排、巡检清单和布置文案直接沉淀成可执行内容。',
    };
  }

  if (role === 'student' && variant === 'studio') {
    return {
      title: '实验台 Step Copilot',
      description: '参考最新 AI Lab Assistant / Study Mode 思路，严格围绕当前步骤给下一步提示、解释与纠错。',
    };
  }

  if (role === 'teacher') {
    return {
      title: '教学 Insight Copilot',
      description: '参考最新 AI 教师助理思路，优先给风险班级、错因归纳和课堂下一步动作。',
    };
  }

  return {
    title: '实验 Study Mode',
    description: '参考最新 Study Mode / Khanmigo 类思路，优先追问、提示、解释和纠错，不直接裸给答案。',
  };
}

function getPromptTemplates({
  role,
  mode,
  experimentTitle,
  variant,
  focusStepTitle,
  focusStepGoal,
  classroomName,
  assignmentMode,
  dueDate,
}: {
  role: AiCopilotRole;
  mode: AiCopilotMode;
  experimentTitle: string;
  variant: AiCopilotPanelVariant;
  focusStepTitle?: string;
  focusStepGoal?: string;
  classroomName?: string;
  assignmentMode?: string;
  dueDate?: string;
}) {
  const experimentLabel = experimentTitle || '当前实验';
  const stepLabel = focusStepTitle || '当前步骤';
  const stepGoalLabel = focusStepGoal || '先确认当前步骤的目标是否满足要求';
  const classLabel = classroomName || '当前班级';
  const modeLabel = assignmentMode || '引导';
  const dueDateLabel = dueDate ? `，截止 ${dueDate}` : '';

  if (role === 'teacher') {
    if (variant === 'teacher-assignment' && mode === 'plan') {
      return [
        `请为 ${classLabel} 的《${experimentLabel}》生成一份可直接发送的作业布置说明。`,
        `请围绕“${modeLabel}”模式生成一份 12 分钟课堂节奏${dueDateLabel}。`,
        '请给我一段适合投屏的开场导语和一段复盘收束话术。',
      ];
    }

    if (variant === 'teacher-assignment' && mode === 'intervene') {
      return [
        `请为 ${classLabel} 生成一份课堂巡检清单，只保留最关键的三项。`,
        '请把高频错因改写成可直接写进任务说明的提醒语。',
        '请为基础学生和高水平学生各给一条支持建议。',
      ];
    }

    if (mode === 'plan') {
      return [
        `请为《${experimentLabel}》生成一份 12 分钟课堂编排。`,
        '请把这个实验改写成一份作业布置文案。',
        '请给我一个适合投屏讲解的分层提问脚本。',
      ];
    }

    if (mode === 'intervene') {
      return [
        '请给我一份课堂巡检清单，只保留最关键的三项。',
        '请给高水平和基础学生各一条支持建议。',
        '请把高频错因改写成学生能听懂的提醒语。',
      ];
    }

    return [
      `请总结《${experimentTitle || '当前实验'}》当前最需要处理的班级风险。`,
      '请只看高风险班级，告诉我下一步动作。',
      '请把当前洞察压缩成一段校内汇报摘要。',
    ];
  }

  if (variant === 'studio' && mode === 'hint') {
    return [
      `请只围绕“${stepLabel}”给我下一步提示，不要跨步骤。`,
      `如果我在“${stepLabel}”做错，最先会出现什么现象？`,
      `请把“${stepLabel}”拆成两个更小的检查动作。`,
    ];
  }

  if (variant === 'studio' && mode === 'study') {
    return [
      `先围绕“${stepLabel}”连续追问我两个判断点，不要直接告诉我答案。`,
      `把“${stepLabel}”改成判断题来问我。`,
      `我应该先观察什么，才能判断是否达到“${stepGoalLabel}”？`,
    ];
  }

  if (variant === 'studio' && mode === 'review') {
    return [
      `请只根据“${stepLabel}”这一环节帮我做纠错复盘。`,
      '给我一个 90 秒内能完成的自查清单。',
      `如果我要重做“${stepLabel}”，最该先保留什么观察记录？`,
    ];
  }

  if (variant === 'studio' && mode === 'explain') {
    return [
      `请用宏观-中观-微观三层解释“${stepLabel}”为什么会出现当前现象。`,
      '只解释当前步骤，不要扩展到后续步骤。',
      '把上面的解释改成课堂上能复述的话。',
    ];
  }

  if (mode === 'hint') {
    return [
      '我卡住了，只告诉我下一步提示，不要直接给答案。',
      '如果我这一环节做错了，最先会出现什么现象？',
      '请把当前步骤拆成两个更小的检查动作。',
    ];
  }

  if (mode === 'explain') {
    return [
      `请用宏观-中观-微观三层解释《${experimentTitle || '当前实验'}》。`,
      '请只解释为什么会出现这个实验现象。',
      '请把微观解释改成课堂上能复述的话。',
    ];
  }

  if (mode === 'review') {
    return [
      '请根据我最近的实验记录指出最可能的失误。',
      '请给我一个 2 分钟自查清单。',
      '如果我要重做，这一轮最应该先保留什么观察记录？',
    ];
  }

  return [
    '先不要直接告诉我答案，请连续追问我两个关键判断点。',
    '请把这一环节改成判断题来问我。',
    '我现在应该先观察什么，再决定下一步？',
  ];
}

export function AiCopilotPanel({
  role,
  currentStudent,
  selectedExperiment,
  focusStepId = '',
  focusStepTitle = '',
  focusStepGoal = '',
  classIdOverride = '',
  classroomName = '',
  initialMode,
  variant = 'workspace',
  assignmentMode = '',
  dueDate = '',
  simulationSnapshot = null,
  onApplyArtifact,
  artifactActionLabels,
}: AiCopilotPanelProps) {
  const [mode, setMode] = useState<AiCopilotMode>(getDefaultMode(role, initialMode));
  const [question, setQuestion] = useState('');
  const [response, setResponse] = useState<AiCopilotResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [openSections, setOpenSections] = useState<Record<AiCopilotSectionKey, boolean>>(getInitialStudioSections);

  const modeOptions = role === 'student' ? studentModeOptions : teacherModeOptions;
  const panelCopy = useMemo(() => getPanelCopy(role, variant), [role, variant]);
  const promptTemplates = useMemo(
    () =>
      getPromptTemplates({
        role,
        mode,
        experimentTitle: selectedExperiment?.title ?? '',
        variant,
        focusStepTitle,
        focusStepGoal,
        classroomName,
        assignmentMode,
        dueDate,
      }),
    [assignmentMode, classroomName, dueDate, focusStepGoal, focusStepTitle, mode, role, selectedExperiment?.title, variant],
  );
  const canAsk = role === 'teacher' || Boolean(selectedExperiment?.id);
  const contextCards = useMemo(() => {
    const cards: Array<{ label: string; value: string; description: string }> = [];

    if (selectedExperiment?.title) {
      cards.push({
        label: '实验',
        value: selectedExperiment.title,
        description: `${selectedExperiment.stage} · ${selectedExperiment.subject} · ${selectedExperiment.grade}`,
      });
    }

    if (variant === 'studio' && focusStepTitle) {
      cards.push({
        label: '焦点步骤',
        value: focusStepTitle,
        description: focusStepGoal || '当前步骤已锁定，AI 会优先围绕这一环节回答。',
      });
    }

    if (role === 'teacher' && classroomName) {
      cards.push({
        label: '目标班级',
        value: classroomName,
        description: assignmentMode ? `当前任务模式：${assignmentMode}` : '已绑定当前班级上下文',
      });
    }

    if (role === 'teacher' && dueDate) {
      cards.push({
        label: '截止日期',
        value: dueDate,
        description: 'AI 生成的布置说明会带入当前时间要求。',
      });
    }

    if (simulationSnapshot?.executionModel) {
      cards.push({
        label: '仿真路线',
        value: simulationSnapshot.executionModel,
        description: simulationSnapshot.renderRuntime,
      });
    }

    if (simulationSnapshot?.runtimeSummary) {
      cards.push({
        label: '运行态',
        value: simulationSnapshot.runtimePhase || '实时接入',
        description: simulationSnapshot.runtimeSummary,
      });
    }

    return cards;
  }, [assignmentMode, classroomName, dueDate, focusStepGoal, focusStepTitle, role, selectedExperiment, simulationSnapshot, variant]);
  const artifactEntries = useMemo(() => {
    if (!response?.artifacts) return [];

    return artifactMeta
      .map((item) => ({
        ...item,
        value: response.artifacts?.[item.key]?.trim() ?? '',
      }))
      .filter((item) => item.value);
  }, [response]);
  const panelClassName = ['panel', 'wide-panel', 'ai-copilot-panel', `ai-copilot-panel-${variant}`].join(' ');
  const studioSectionSummaries = useMemo(
    () => ({
      context: contextCards.length ? `${contextCards.length} 个 grounded 上下文` : '当前没有额外上下文卡片',
      mode: modeOptions.find((option) => option.value === mode)?.description ?? '当前模式已锁定',
      compose: question.trim() ? '已写入当前问题，可继续追问或发送' : promptTemplates[0] ?? '从快捷问题开始',
      response: response ? '已有 grounded 回答与建议，可继续追问' : error ? '当前回答失败，可检查后重试' : '等待生成当前步骤回答',
    }),
    [contextCards.length, error, mode, modeOptions, promptTemplates, question, response],
  );
  const isStudioPane = variant === 'studio';

  useEffect(() => {
    setMode(getDefaultMode(role, initialMode));
    setQuestion('');
    setResponse(null);
    setError('');
    setOpenSections(getInitialStudioSections());
  }, [classIdOverride, focusStepId, initialMode, role, selectedExperiment?.id]);

  useEffect(() => {
    if (!response && !error) return;
    setOpenSections({
      context: false,
      mode: false,
      compose: false,
      response: true,
    });
  }, [error, response]);

  function toggleSection(section: AiCopilotSectionKey) {
    setOpenSections((current) =>
      current[section]
        ? { ...current, [section]: false }
        : {
            context: false,
            mode: false,
            compose: false,
            response: false,
            [section]: true,
          },
    );
  }

  async function submit(nextQuestion?: string) {
    if (!canAsk) return;

    const normalizedQuestion = (nextQuestion ?? question).trim();
    setLoading(true);
    setError('');

    try {
      const result = await requestAiCopilot({
        role,
        mode,
        question: normalizedQuestion,
        experimentId: selectedExperiment?.id,
        studentId: currentStudent?.id,
        classId: classIdOverride || currentStudent?.classId,
        focusStepId: focusStepId || undefined,
        assignmentMode: assignmentMode || undefined,
        dueDate: dueDate || undefined,
        simulationSnapshot: simulationSnapshot ?? undefined,
      });
      setResponse(result);
      setQuestion(normalizedQuestion);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'AI Copilot 暂时不可用');
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className={panelClassName}>
      <div className="ai-copilot-head">
        <div className="ai-copilot-copy">
          <span className="eyebrow">AI Copilot</span>
          <h3>{panelCopy.title}</h3>
          <p>{panelCopy.description}</p>
        </div>
        <div className="badge-row ai-copilot-badges">
          <span className="badge">Grounded 到当前实验 / 班级</span>
          {selectedExperiment ? <span className="badge badge-status">{selectedExperiment.title}</span> : null}
          {variant === 'studio' && focusStepTitle ? <span className="badge">步骤 {focusStepTitle}</span> : null}
          {role === 'teacher' && classroomName ? <span className="badge">班级 {classroomName}</span> : null}
          {role === 'teacher' && assignmentMode ? <span className="badge">模式 {assignmentMode}</span> : null}
          {response ? <span className="badge syncing">{getProviderLabel(response.provider)}</span> : null}
        </div>
      </div>

      {isStudioPane ? (
        <div className="ai-copilot-section-stack">
          <section className={openSections.context ? 'ai-copilot-section open' : 'ai-copilot-section'}>
            <button
              aria-expanded={openSections.context}
              className="ai-copilot-section-toggle"
              onClick={() => toggleSection('context')}
              type="button"
            >
              <div>
                <span>Grounding</span>
                <strong>上下文</strong>
                <small>{studioSectionSummaries.context}</small>
              </div>
              <i aria-hidden="true">{openSections.context ? '−' : '+'}</i>
            </button>
            {openSections.context ? (
              <div className="ai-copilot-section-body">
                {contextCards.length ? (
                  <div className="ai-copilot-context-grid" aria-label="AI 上下文摘要">
                    {contextCards.map((card) => (
                      <div className="ai-copilot-context-card" key={`${card.label}-${card.value}`}>
                        <span>{card.label}</span>
                        <strong>{card.value}</strong>
                        <small>{card.description}</small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="ai-copilot-empty compact">
                    <small>当前没有额外上下文卡片，Copilot 会优先使用当前实验和步骤信息。</small>
                  </div>
                )}
              </div>
            ) : null}
          </section>

          <section className={openSections.mode ? 'ai-copilot-section open' : 'ai-copilot-section'}>
            <button
              aria-expanded={openSections.mode}
              className="ai-copilot-section-toggle"
              onClick={() => toggleSection('mode')}
              type="button"
            >
              <div>
                <span>Behavior</span>
                <strong>模式</strong>
                <small>{studioSectionSummaries.mode}</small>
              </div>
              <i aria-hidden="true">{openSections.mode ? '−' : '+'}</i>
            </button>
            {openSections.mode ? (
              <div className="ai-copilot-section-body">
                <div className="ai-copilot-mode-bar" aria-label="AI 模式切换" role="tablist">
                  {modeOptions.map((option) => (
                    <button
                      aria-pressed={mode === option.value}
                      className={mode === option.value ? 'ai-copilot-mode-button active' : 'ai-copilot-mode-button'}
                      key={option.value}
                      onClick={() => setMode(option.value)}
                      type="button"
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          <section className={openSections.compose ? 'ai-copilot-section open' : 'ai-copilot-section'}>
            <button
              aria-expanded={openSections.compose}
              className="ai-copilot-section-toggle"
              onClick={() => toggleSection('compose')}
              type="button"
            >
              <div>
                <span>Compose</span>
                <strong>提问</strong>
                <small>{studioSectionSummaries.compose}</small>
              </div>
              <i aria-hidden="true">{openSections.compose ? '−' : '+'}</i>
            </button>
            {openSections.compose ? (
              <div className="ai-copilot-section-body">
                {!canAsk ? (
                  <div className="ai-copilot-empty">
                    <strong>先选择实验，再启用 AI Copilot</strong>
                    <small>学生侧需要先锁定实验，才能把提示和解释严格绑定到当前实验配置。</small>
                  </div>
                ) : (
                  <>
                    <div className="ai-copilot-compose">
                      <label className="field-block">
                        <span>提问或直接点下面的快捷问题</span>
                        <textarea
                          className="form-control ai-copilot-textarea"
                          onChange={(event) => setQuestion(event.target.value)}
                          placeholder={promptTemplates[0]}
                          rows={4}
                          value={question}
                        />
                      </label>
                      <div className="ai-copilot-action-row">
                        <button className="action-button" disabled={loading} onClick={() => void submit()} type="button">
                          {loading ? 'AI 分析中...' : '发送给 Copilot'}
                        </button>
                        <button
                          className="action-button ghost"
                          disabled={loading}
                          onClick={() => {
                            setQuestion('');
                            setResponse(null);
                            setError('');
                          }}
                          type="button"
                        >
                          清空
                        </button>
                      </div>
                    </div>

                    <div className="ai-copilot-quick-row" aria-label="快捷问题">
                      {promptTemplates.map((template) => (
                        <button
                          className="ai-copilot-quick"
                          disabled={loading}
                          key={template}
                          onClick={() => void submit(template)}
                          type="button"
                        >
                          {template}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </section>

          <section className={openSections.response ? 'ai-copilot-section open' : 'ai-copilot-section'}>
            <button
              aria-expanded={openSections.response}
              className="ai-copilot-section-toggle"
              onClick={() => toggleSection('response')}
              type="button"
            >
              <div>
                <span>Response</span>
                <strong>回答</strong>
                <small>{studioSectionSummaries.response}</small>
              </div>
              <i aria-hidden="true">{openSections.response ? '−' : '+'}</i>
            </button>
            {openSections.response ? (
              <div className="ai-copilot-section-body">
                {error ? <div className="ai-copilot-error">{error}</div> : null}

                {response ? (
                  <div className="ai-copilot-response">
                    <div className="ai-copilot-response-head">
                      <strong>{response.contextLabel}</strong>
                      <small>{response.grounded ? '仅基于当前实验 / 班级事实生成' : '未开启 grounded 模式'}</small>
                    </div>

                    <div className="ai-copilot-answer">{response.answer}</div>

                    {artifactEntries.length ? (
                      <div className="ai-copilot-artifact-grid">
                        {artifactEntries.map((item) => (
                          <div className="ai-copilot-artifact" key={item.key}>
                            <div className="ai-copilot-artifact-head">
                              <div>
                                <span>{item.label}</span>
                                <strong>{item.description}</strong>
                              </div>
                              {onApplyArtifact ? (
                                <button
                                  className="action-button ghost"
                                  onClick={() => onApplyArtifact(item.key, item.value)}
                                  type="button"
                                >
                                  {artifactActionLabels?.[item.key] ?? '应用'}
                                </button>
                              ) : null}
                            </div>
                            <div className="ai-copilot-artifact-body">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    <div className="ai-copilot-evidence-grid">
                      {response.evidence.map((item) => (
                        <div className="ai-copilot-evidence" key={item.label}>
                          <span>{item.label}</span>
                          <strong>{item.value}</strong>
                        </div>
                      ))}
                    </div>

                    <div className="ai-copilot-citation-row">
                      {response.citations.map((citation) => (
                        <span className="status-pill" key={citation}>{citation}</span>
                      ))}
                    </div>

                    <div className="ai-copilot-suggestion-row">
                      {response.suggestions.map((suggestion) => (
                        <button
                          className="ai-copilot-suggestion"
                          key={suggestion}
                          onClick={() => void submit(suggestion)}
                          type="button"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="ai-copilot-empty compact">
                    <small>{loading ? '正在生成当前步骤回答...' : '发送一个围绕当前步骤的问题后，这里会展示 grounded 回答与下一步建议。'}</small>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>
      ) : (
        <>
          {contextCards.length ? (
            <div className="ai-copilot-context-grid" aria-label="AI 上下文摘要">
              {contextCards.map((card) => (
                <div className="ai-copilot-context-card" key={`${card.label}-${card.value}`}>
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.description}</small>
                </div>
              ))}
            </div>
          ) : null}

          <div className="ai-copilot-mode-bar" aria-label="AI 模式切换" role="tablist">
            {modeOptions.map((option) => (
              <button
                aria-pressed={mode === option.value}
                className={mode === option.value ? 'ai-copilot-mode-button active' : 'ai-copilot-mode-button'}
                key={option.value}
                onClick={() => setMode(option.value)}
                type="button"
              >
                <strong>{option.label}</strong>
                <span>{option.description}</span>
              </button>
            ))}
          </div>

          {!canAsk ? (
            <div className="ai-copilot-empty">
              <strong>先选择实验，再启用 AI Copilot</strong>
              <small>学生侧需要先锁定实验，才能把提示和解释严格绑定到当前实验配置。</small>
            </div>
          ) : (
            <>
              <div className="ai-copilot-compose">
                <label className="field-block">
                  <span>提问或直接点下面的快捷问题</span>
                  <textarea
                    className="form-control ai-copilot-textarea"
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder={promptTemplates[0]}
                    rows={4}
                    value={question}
                  />
                </label>
                <div className="ai-copilot-action-row">
                  <button className="action-button" disabled={loading} onClick={() => void submit()} type="button">
                    {loading ? 'AI 分析中...' : '发送给 Copilot'}
                  </button>
                  <button
                    className="action-button ghost"
                    disabled={loading}
                    onClick={() => {
                      setQuestion('');
                      setResponse(null);
                      setError('');
                    }}
                    type="button"
                  >
                    清空
                  </button>
                </div>
              </div>

              <div className="ai-copilot-quick-row" aria-label="快捷问题">
                {promptTemplates.map((template) => (
                  <button
                    className="ai-copilot-quick"
                    disabled={loading}
                    key={template}
                    onClick={() => void submit(template)}
                    type="button"
                  >
                    {template}
                  </button>
                ))}
              </div>
            </>
          )}

          {error ? <div className="ai-copilot-error">{error}</div> : null}

          {response ? (
            <div className="ai-copilot-response">
              <div className="ai-copilot-response-head">
                <strong>{response.contextLabel}</strong>
                <small>{response.grounded ? '仅基于当前实验 / 班级事实生成' : '未开启 grounded 模式'}</small>
              </div>

              <div className="ai-copilot-answer">{response.answer}</div>

              {artifactEntries.length ? (
                <div className="ai-copilot-artifact-grid">
                  {artifactEntries.map((item) => (
                    <div className="ai-copilot-artifact" key={item.key}>
                      <div className="ai-copilot-artifact-head">
                        <div>
                          <span>{item.label}</span>
                          <strong>{item.description}</strong>
                        </div>
                        {onApplyArtifact ? (
                          <button
                            className="action-button ghost"
                            onClick={() => onApplyArtifact(item.key, item.value)}
                            type="button"
                          >
                            {artifactActionLabels?.[item.key] ?? '应用'}
                          </button>
                        ) : null}
                      </div>
                      <div className="ai-copilot-artifact-body">{item.value}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="ai-copilot-evidence-grid">
                {response.evidence.map((item) => (
                  <div className="ai-copilot-evidence" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>

              <div className="ai-copilot-citation-row">
                {response.citations.map((citation) => (
                  <span className="status-pill" key={citation}>{citation}</span>
                ))}
              </div>

              <div className="ai-copilot-suggestion-row">
                {response.suggestions.map((suggestion) => (
                  <button
                    className="ai-copilot-suggestion"
                    key={suggestion}
                    onClick={() => void submit(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}
