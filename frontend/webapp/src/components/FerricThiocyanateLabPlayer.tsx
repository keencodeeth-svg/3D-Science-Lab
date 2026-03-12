import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tubes' | 'compare';
type MaterialId = 'ferric' | 'thiocyanate' | 'rack' | 'tubes' | 'dropper';
type TimelineState = 'done' | 'current' | 'todo';

interface FerricThiocyanateLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别器材',
  2: '加入铁离子溶液',
  3: '滴加硫氰酸钾',
  4: '观察血红显色',
  5: '总结显色检验',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别铁离子溶液、硫氰酸钾溶液、试管架、两支试管和滴管。',
  2: '向两支试管中加入等量铁离子溶液，建立对照基础。',
  3: '仅向右侧试管滴加硫氰酸钾溶液。',
  4: '观察右侧试管是否出现明显血红色，而左侧对照保持原色。',
  5: '总结该反应可以用于铁离子的显色检验。',
};

const materialLabels: Record<MaterialId, string> = {
  ferric: '铁离子溶液',
  thiocyanate: '硫氰酸钾溶液',
  rack: '试管架',
  tubes: '两支试管',
  dropper: '滴管',
};

const materialOrder: MaterialId[] = ['ferric', 'thiocyanate', 'rack', 'tubes', 'dropper'];
const ferricthiocyanateStepOrder: StepId[] = [1, 2, 3, 4, 5];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildTimeline(step: StepId, completed: boolean): TimelineEntry[] {
  return (Object.entries(stepTitles) as [string, string][]).map(([rawStep, title]) => {
    const current = Number(rawStep) as StepId;
    const state: TimelineState = completed || current < step ? 'done' : current === step ? 'current' : 'todo';
    const detail = state === 'done' ? '已完成' : state === 'current' ? '进行中' : '待完成';
    return { title, detail, state };
  });
}

export function FerricThiocyanateLabPlayer({ experiment, onTelemetry }: FerricThiocyanateLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [ferricReady, setFerricReady] = useState(false);
  const [reactionDone, setReactionDone] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过对照试管观察铁离子与硫氰酸根形成血红色配合物。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const colorValue = clamp(24 + (ferricReady ? 18 : 0) + (reactionDone ? 28 : 0), 20, 99);
  const compareValue = clamp(22 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 30 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (ferricReady ? 10 : 0) + (reactionDone ? 14 : 0), 20, 100);

  const { reportReset } = useLabTelemetryReporter({
    experiment,
    step,
    totalSteps: 5,
    score,
    errors,
    prompt,
    completed,
    stepLabels: stepTitles,
    onTelemetry,
  });

  const appendNote = (note: string) => setLabNotes((current) => [note, ...current].slice(0, 6));
  const markError = (message: string) => {
    setErrors((current) => current + 1);
    setPromptTone('error');
    setPrompt(message);
    appendNote(`错误修正：${message}`);
  };
  const advanceStep = (nextStep: StepId | null, message: string) => {
    setPromptTone('success');
    setPrompt(message);
    if (nextStep === null) {
      setCompleted(true);
      appendNote(`实验完成：${experiment.feedback.successSummary}`);
      return;
    }
    setStep(nextStep);
    appendNote(`步骤推进：进入「${stepTitles[nextStep]}」`);
  };

  const handleIdentify = (materialId: MaterialId) => {
    if (step !== 1 || completed) return;
    setIdentifiedMaterials((current) => {
      if (current.includes(materialId)) return current;
      const next = [...current, materialId];
      appendNote(`材料识别：${materialLabels[materialId]}`);
      if (next.length === materialOrder.length) {
        setCameraPreset('tubes');
        advanceStep(2, '器材识别完成，下一步给两支试管都加入铁离子溶液。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleAddFerric = (choice: 'correct' | 'one-tube') => {
    if (step !== 2 || completed) return;
    if (choice === 'one-tube') {
      markError('需要在两支试管中都加入铁离子溶液，才能建立清晰对照。');
      return;
    }
    setFerricReady(true);
    appendNote('对照建立：两支试管均已加入浅黄色铁离子溶液。');
    advanceStep(3, '对照基础已建立，下一步只向右侧试管滴加硫氰酸钾。');
  };

  const handleAddThiocyanate = (choice: 'correct' | 'both') => {
    if (step !== 3 || completed) return;
    if (!ferricReady) {
      markError('请先给两支试管都加入铁离子溶液。');
      return;
    }
    if (choice === 'both') {
      markError('本步应只处理右侧试管，保留左侧试管作为对照。');
      return;
    }
    setReactionDone(true);
    setCameraPreset('compare');
    appendNote('显色启动：右侧试管迅速转为血红色，左侧保持原色。');
    advanceStep(4, '血红显色已出现，请记录观察结果。');
  };

  const handleObserve = (choice: 'correct' | 'both-red' | 'blue') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!reactionDone) {
      markError('请先向右侧试管滴加硫氰酸钾，再观察显色。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：右侧试管出现明显血红色，左侧对照保持浅黄色。');
      advanceStep(5, '显色结果已记录，请完成总结。');
      return;
    }
    markError(choice === 'both-red' ? '只有加入硫氰酸钾的右侧试管会显血红色，对照管不会同样变红。' : '该反应的典型显色不是蓝色，而是血红色。');
  };

  const handleSummary = (choice: 'correct' | 'no-control' | 'reverse') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：铁离子遇硫氰酸根可形成血红色显色反应，可用于检验铁离子。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'no-control' ? '该实验中对照试管很重要，能帮助突出显色差异。' : '不能把“显血红色”和“没有显色”的关系说反。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setFerricReady(false);
    setReactionDone(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察铁离子血红显色。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先建立两支试管的对照基础。', '只在右侧试管中滴加硫氰酸钾。', '重点比较“左侧原色、右侧血红色”的差异。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对是否保留了对照。',
        '建议按“识别 → 建对照 → 右侧滴加 → 比较显色 → 总结”的顺序重做。',
      ];

  const ferricDisplayResult = observationChoice === 'correct'
    ? '右侧血红 / 左侧原色'
    : observationChoice === 'both-red'
      ? '误判为双管同红'
      : observationChoice === 'blue'
        ? '误判为蓝色'
        : reactionDone
          ? '显色已出现，待记录'
          : '待观察';
  const ferricthiocyanateWorkbenchStatus = completed
    ? '显色流程已闭环：识别、建对照、右侧滴加、显色比较和总结全部完成。'
    : step === 1
      ? '先识别铁离子溶液、硫氰酸钾、试管架、试管和滴管。'
      : step === 2
        ? '先给两支试管都加入铁离子溶液，建立对照基础。'
        : step === 3
          ? '只处理右侧试管，保留左侧作为对照。'
          : step === 4
            ? '重点比较“右侧血红、左侧原色”的差异。'
            : '总结关键词：铁离子、硫氰酸根、血红显色、可用于检验。';
  const ferricthiocyanateCompletionCopy = completed
    ? '实验已完成，当前版本支持双试管对照、右侧滴加、血红显色比较与规范总结。'
    : '完成全部 5 个步骤后，这里会输出本次铁离子显色实验的总结结果。';
  const latestLabNote = labNotes[0] ?? '实验已载入：通过对照试管观察铁离子与硫氰酸根形成血红色配合物。';

  return (
    <section className="panel playground-panel ferricthiocyanate-lab-panel ferricthiocyanate-stage-first-panel ferricthiocyanate-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把双试管对照与血红显色完整留在中央舞台，所有提示和操作统一回收到下方工作台，突出颜色差异。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">得分 {score}</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid ferricthiocyanate-grid">
        <aside className="playground-side ferricthiocyanate-side-rail ferricthiocyanate-side-rail-left">
          <section className="info-card ferricthiocyanate-rail-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>环境</strong>
                  <span>{experiment.scene.environment}</span>
                </div>
                <span className="badge">化学</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜头</strong>
                  <span>{cameraPreset === 'bench' ? '实验台' : cameraPreset === 'tubes' ? '试管近景' : '对照视角'}</span>
                </div>
                <span className="badge">{experiment.grade}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>主题</strong>
                  <span>{experiment.curriculum.unit}</span>
                </div>
                <span className="badge">{experiment.durationMinutes} 分钟</span>
              </div>
            </div>
          </section>

          <section className="info-card ferricthiocyanate-rail-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>显色强度 {colorValue}</span><div className="chem-meter-bar"><i style={{ width: `${colorValue}%` }} /></div></div>
              <div className="chem-meter"><span>对照清晰度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
        </aside>

        <section className="scene-panel ferricthiocyanate-workbench-stage">
          <div className="scene-toolbar ferricthiocyanate-workbench-toolbar">
            <div className="ferricthiocyanate-toolbar-head">
              <div className="ferricthiocyanate-toolbar-kicker">显色工作台</div>
              <strong>{experiment.title}</strong>
              <p className="ferricthiocyanate-toolbar-copy">舞台中央只保留双试管对照与显色差异，提示、记录和结论统一下沉，避免遮住关键颜色变化。</p>
            </div>
            <div className="camera-actions ferricthiocyanate-camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'tubes' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tubes')} type="button">试管</button>
              <button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对比</button>
            </div>
          </div>

          <div className="scene-meta-strip ferricthiocyanate-stage-meta">
            <div className={`ferricthiocyanate-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>步骤 {step} · {stepTitles[step]}</strong>
              <p>{prompt}</p>
            </div>
            <div className="ferricthiocyanate-step-pills" aria-label="实验步骤概览">
              {ferricthiocyanateStepOrder.map((stepId) => (
                <span className={step === stepId ? 'ferricthiocyanate-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'ferricthiocyanate-step-pill done' : 'ferricthiocyanate-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className={`scene-canvas ferricthiocyanate-stage preset-${cameraPreset} ${ferricReady ? 'ferric-ready' : ''} ${reactionDone ? 'reaction-done' : ''}`}>
            <div className="ferricthiocyanate-rig">
              <div className="fth-bench-shadow" />
              <div className="fth-rack-shadow" />
              <div className="fth-rack">
                <span className="fth-rack-grain" />
                <span className="fth-rack-hole hole-1" />
                <span className="fth-rack-hole hole-2" />
              </div>
              <div className={ferricReady ? 'fth-tube left active' : 'fth-tube left'}>
                <div className="fth-tube-rim" />
                <div className="fth-tube-mouth" />
                <div className="fth-inner-glass" />
                <div className="fth-tube-gloss" />
                <div className={ferricReady ? 'fth-meniscus active' : 'fth-meniscus'} />
                <div className={ferricReady ? 'fth-liquid left active' : 'fth-liquid left'}>
                  <span className="fth-liquid-surface" />
                  <span className={ferricReady ? 'fth-reference-glow active' : 'fth-reference-glow'} />
                </div>
                <div className="fth-base-shadow" />
              </div>
              <div className={reactionDone ? 'fth-tube right active reaction' : ferricReady ? 'fth-tube right active' : 'fth-tube right'}>
                <div className="fth-tube-rim" />
                <div className="fth-tube-mouth" />
                <div className="fth-inner-glass" />
                <div className="fth-tube-gloss" />
                <div className={ferricReady ? 'fth-meniscus active' : 'fth-meniscus'} />
                <div className={reactionDone ? 'fth-reaction-front active' : 'fth-reaction-front'} />
                <div className={reactionDone ? 'fth-liquid right active blood' : ferricReady ? 'fth-liquid right active' : 'fth-liquid right'}>
                  <span className="fth-liquid-surface" />
                  <span className={reactionDone ? 'fth-reaction-plume active' : 'fth-reaction-plume'} />
                  <span className={reactionDone ? 'fth-liquid-front active' : 'fth-liquid-front'} />
                </div>
                <div className={reactionDone ? 'fth-crimson-specks active' : 'fth-crimson-specks'} />
                <div className={reactionDone ? 'fth-crimson-halo active' : 'fth-crimson-halo'} />
                <div className="fth-base-shadow" />
              </div>
              <div className={step >= 3 ? 'fth-dropper active' : 'fth-dropper'}>
                <span className="fth-dropper-bulb" />
                <span className="fth-dropper-glass" />
                <span className="fth-dropper-meniscus" />
                <span className={step >= 3 && !reactionDone ? 'fth-drop active' : 'fth-drop'} />
              </div>
              <div className={reactionDone ? 'fth-highlight active' : 'fth-highlight'} />
              <div className={reactionDone ? 'fth-compare-beam active' : 'fth-compare-beam'} />
            </div>
          </div>

          <div className="workbench-inline-dock ferricthiocyanate-workbench-dock">
            <div className="ferricthiocyanate-workbench-status-grid">
              <div className={`info-card ferricthiocyanate-status-card tone-${promptTone}`}>
                <span>当前进度</span>
                <strong>步骤 {step} · {stepTitles[step]}</strong>
                <p>{ferricthiocyanateWorkbenchStatus}</p>
              </div>
              <div className={`info-card ferricthiocyanate-status-card ${ferricReady ? 'tone-success' : ''}`.trim()}>
                <span>对照基础</span>
                <strong>{ferricReady ? '双试管已建立' : '待建立双试管对照'}</strong>
                <p>两支试管都要先加入铁离子溶液，再进行差异处理。</p>
              </div>
              <div className={`info-card ferricthiocyanate-status-card ${reactionDone ? 'tone-success' : promptTone === 'error' && step >= 3 ? 'tone-error' : ''}`.trim()}>
                <span>显色结果</span>
                <strong>{ferricDisplayResult}</strong>
                <p>{reactionDone ? '右侧滴加后显血红色，左侧保留为对照原色。' : '只处理右侧试管，保留左侧作为对照。'}</p>
              </div>
              <div className={`info-card ferricthiocyanate-status-card ${completed ? 'tone-success' : ''}`.trim()}>
                <span>实验指标</span>
                <strong>得分 {score} · 完成度 {readinessValue}%</strong>
                <p>对照清晰度 {compareValue} · 最新记录：{latestLabNote}</p>
              </div>
            </div>

            <div className="ferricthiocyanate-inline-workbench">
              <section className="info-card ferricthiocyanate-inline-panel ferricthiocyanate-workbench-actions">
                <span className="eyebrow">Actions</span>
                <h3>当前步骤操作</h3>
                <div className="summary-stack generic-choice-stack">
                  {step === 1 ? materialOrder.map((materialId) => (
                    <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button">
                      <strong>识别 {materialLabels[materialId]}</strong>
                      <span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span>
                    </button>
                  )) : null}

                  {step === 2 ? (
                    <>
                      <button className="summary-choice generic-choice primary" onClick={() => handleAddFerric('correct')} type="button">
                        <strong>向两支试管都加入铁离子溶液</strong>
                        <span>先建立完整对照基础。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleAddFerric('one-tube')} type="button">
                        <strong>只给一支试管加铁离子溶液</strong>
                        <span>错误演示：缺少完整对照。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 3 ? (
                    <>
                      <button className="summary-choice generic-choice primary" onClick={() => handleAddThiocyanate('correct')} type="button">
                        <strong>只向右侧试管滴加硫氰酸钾</strong>
                        <span>保留左侧试管作为对照。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleAddThiocyanate('both')} type="button">
                        <strong>向两支试管都滴加硫氰酸钾</strong>
                        <span>错误演示：破坏对照。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 4 ? (
                    <>
                      <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button">
                        <strong>记录“右侧显血红色，左侧保持原色”</strong>
                        <span>这是本实验的正确现象。</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('both-red')} type="button">
                        <strong>记录“两支试管都会同样变成血红色”</strong>
                        <span>错误演示：忽略对照差异。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleObserve('blue')} type="button">
                        <strong>记录“右侧会变成蓝色”</strong>
                        <span>错误演示：颜色判断错误。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 5 ? (
                    <>
                      <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                        <strong>铁离子遇硫氰酸根会显血红色，可用于检验铁离子</strong>
                        <span>完整总结本实验结论。</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-control')} type="button">
                        <strong>做不做对照都无所谓，结果不会受影响</strong>
                        <span>错误演示：忽略对照价值。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleSummary('reverse')} type="button">
                        <strong>加入硫氰酸钾后显色会消失，对照管更红</strong>
                        <span>错误演示：把关系完全说反了。</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="info-card ferricthiocyanate-inline-panel ferricthiocyanate-notebook-panel">
                <div className="generic-notebook-head">
                  <div>
                    <span className="eyebrow">Notebook</span>
                    <h3>过程记录与读数</h3>
                  </div>
                  <span className="badge">舞台下工作台</span>
                </div>
                <div className="generic-readout-grid ferricthiocyanate-readout-grid">
                  <article className={ferricReady ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>对照基础</span><strong>{ferricReady ? '已建立' : '--'}</strong><small>{ferricReady ? '两支试管都已加入铁离子溶液。' : '先建立双试管对照。'}</small></article>
                  <article className={reactionDone ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>血红显色</span><strong>{reactionDone ? '已出现' : '--'}</strong><small>{reactionDone ? '右侧试管已出现明显血红色。' : '等待滴加硫氰酸钾。'}</small></article>
                  <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '可检验铁离子' : '等待总结'}</strong><small>血红显色是铁离子与硫氰酸根的特征反应。</small></article>
                </div>
                <div className="timeline-list">
                  {timeline.map((entry) => (
                    <div className={`timeline-item ${entry.state}`} key={entry.title}>
                      <span className="timeline-marker" />
                      <div className="timeline-copy">
                        <strong>{entry.title}</strong>
                        <small>{entry.detail}</small>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="lab-note-stack">
                  {labNotes.map((note, index) => (
                    <div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>
                      {note}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>

        <aside className="playground-side ferricthiocyanate-side-rail ferricthiocyanate-side-rail-right">
          <section className="info-card ferricthiocyanate-rail-card">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{ferricReady ? '双试管已建' : '双试管待建'} / 显色状态：{reactionDone ? '已出现' : '待出现'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意保留左侧试管作为对照'}</li>
            </ul>
          </section>

          <section className="info-card ferricthiocyanate-rail-card ferricthiocyanate-rail-prompt">
            <span className="eyebrow">Readout</span>
            <h3>显色结果板</h3>
            <div className="generic-readout-grid ferricthiocyanate-readout-grid">
              <article className={ferricReady ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>对照</span><strong>{ferricReady ? '已建立' : '--'}</strong><small>先建完整双试管基础。</small></article>
              <article className={reactionDone ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>显色</span><strong>{reactionDone ? '已出现' : '--'}</strong><small>只处理右侧试管。</small></article>
              <article className={observationChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>结果</span><strong>{ferricDisplayResult}</strong><small>重点比较左右差异。</small></article>
            </div>
          </section>

          <section className="info-card ferricthiocyanate-rail-card ferricthiocyanate-rail-prompt">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`info-card ferricthiocyanate-rail-card ferricthiocyanate-rail-prompt ${completed ? 'tone-success' : promptTone === 'error' ? 'tone-error' : ''}`.trim()}>
            <span className="eyebrow">Control</span>
            <h3>实验控制</h3>
            <p>{ferricthiocyanateCompletionCopy}</p>
            <div className="button-stack">
              <button className="action-button ghost" onClick={handleReset} type="button">重新开始</button>
            </div>
            <small>{latestLabNote}</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
