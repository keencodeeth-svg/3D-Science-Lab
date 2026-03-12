import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tube' | 'mirror';
type MaterialId = 'tube' | 'silver' | 'glucose' | 'bath' | 'clamp';
type TimelineState = 'done' | 'current' | 'todo';

interface SilverMirrorLabPlayerProps {
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
  2: '建立温热水浴',
  3: '加入葡萄糖溶液',
  4: '观察银镜形成',
  5: '总结银镜反应',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别试管、银氨溶液、葡萄糖溶液、温热水浴和试管夹。',
  2: '将盛有银氨溶液的试管放入温热水浴中，建立反应环境。',
  3: '向试管中加入少量葡萄糖溶液并轻轻振荡。',
  4: '观察试管内壁是否逐渐出现明亮银镜。',
  5: '总结银镜反应中内壁析出银层的现象与意义。',
};

const materialLabels: Record<MaterialId, string> = {
  tube: '试管',
  silver: '银氨溶液',
  glucose: '葡萄糖溶液',
  bath: '温热水浴',
  clamp: '试管夹',
};

const materialOrder: MaterialId[] = ['tube', 'silver', 'glucose', 'bath', 'clamp'];
const silvermirrorStepOrder: StepId[] = [1, 2, 3, 4, 5];

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

export function SilverMirrorLabPlayer({ experiment, onTelemetry }: SilverMirrorLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [bathReady, setBathReady] = useState(false);
  const [glucoseAdded, setGlucoseAdded] = useState(false);
  const [mirrorFormed, setMirrorFormed] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过温热水浴和葡萄糖还原观察试管内壁形成银镜。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const depositionValue = clamp(24 + (bathReady ? 18 : 0) + (glucoseAdded ? 18 : 0) + (mirrorFormed ? 26 : 0), 20, 99);
  const reflectValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 30 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (bathReady ? 10 : 0) + (glucoseAdded ? 10 : 0) + (mirrorFormed ? 14 : 0), 20, 100);

  const { reportReset } = useLabTelemetryReporter({ experiment, step, totalSteps: 5, score, errors, prompt, completed, stepLabels: stepTitles, onTelemetry });

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
        setCameraPreset('tube');
        advanceStep(2, '器材识别完成，下一步建立温热水浴。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleBath = (choice: 'correct' | 'cold') => {
    if (step !== 2 || completed) return;
    if (choice === 'cold') {
      markError('银镜反应需要适度温热环境，不能直接在冷水中期待快速成镜。');
      return;
    }
    setBathReady(true);
    appendNote('装置状态：试管已置于温热水浴中，反应环境稳定。');
    advanceStep(3, '水浴已建立，下一步加入葡萄糖溶液。');
  };

  const handleAddGlucose = (choice: 'correct' | 'skip') => {
    if (step !== 3 || completed) return;
    if (!bathReady) {
      markError('请先建立温热水浴，再加入葡萄糖溶液。');
      return;
    }
    if (choice === 'skip') {
      markError('需要加入葡萄糖溶液，才能发生还原并形成银镜。');
      return;
    }
    setGlucoseAdded(true);
    setCameraPreset('mirror');
    appendNote('加样记录：葡萄糖溶液已加入，试管内壁开始出现反光变化。');
    advanceStep(4, '反应已启动，请观察试管内壁是否形成银镜。');
  };

  const handleObserve = (choice: 'correct' | 'black' | 'none') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!glucoseAdded) {
      markError('请先加入葡萄糖溶液，再观察试管内壁变化。');
      return;
    }
    if (choice === 'correct') {
      setMirrorFormed(true);
      appendNote('观察记录：试管内壁出现均匀明亮的银色镜面。');
      advanceStep(5, '银镜现象已记录，请完成总结。');
      return;
    }
    markError(choice === 'black' ? '该实验的典型现象是内壁形成银镜，而不是整体变黑。' : '在正确加热和加样后，内壁会逐渐出现明显银镜。');
  };

  const handleSummary = (choice: 'correct' | 'just-heating' | 'no-silver') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：银氨溶液在温热条件下被还原，试管内壁析出银镜。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'just-heating' ? '银镜不是单纯加热产生的，需要还原性物质参与。' : '该实验最直观的现象就是析出银层形成镜面。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setBathReady(false);
    setGlucoseAdded(false);
    setMirrorFormed(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察银镜反应。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先建立温热水浴，再加入葡萄糖溶液。', '重点看试管内壁反光增强和银层附着。', '结论关键词是“温热条件、还原、银镜”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对加样和加热顺序。',
        '建议按“识别 → 水浴 → 加葡萄糖 → 看银镜 → 总结”的顺序重做。',
      ];

  const mirrorAppearance = observationChoice === 'correct'
    ? '均匀明亮银镜'
    : observationChoice === 'black'
      ? '误判为发黑发暗'
      : observationChoice === 'none'
        ? '误判为无变化'
        : mirrorFormed
          ? '银镜正在形成'
          : '待观察';
  const silvermirrorWorkbenchStatus = completed
    ? '银镜流程已闭环：识别、水浴、加样、观察和总结全部完成。'
    : step === 1
      ? '先识别试管、银氨溶液、葡萄糖、水浴和试管夹。'
      : step === 2
        ? '先建立温热水浴，再进入还原析银环节。'
        : step === 3
          ? '加入葡萄糖后轻轻振荡，观察内壁反光变化。'
          : step === 4
            ? '重点看试管内壁是否出现均匀明亮的银色镜面。'
            : '总结关键词：温热条件、还原、内壁析出银层。';
  const silvermirrorCompletionCopy = completed
    ? '实验已完成，当前版本支持温热水浴、葡萄糖还原、银镜观察与规范总结。'
    : '完成全部 5 个步骤后，这里会输出本次银镜反应的总结结果。';
  const latestLabNote = labNotes[0] ?? '实验已载入：通过温热水浴和葡萄糖还原观察试管内壁形成银镜。';

  return (
    <section className="panel playground-panel silvermirror-lab-panel silvermirror-stage-first-panel silvermirror-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把温热水浴、试管反光和银层析出完整留在舞台中央，操作与记录全部回收到下方工作台。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">得分 {score}</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid silvermirror-grid">
        <aside className="playground-side silvermirror-side-rail silvermirror-side-rail-left">
          <section className="info-card silvermirror-rail-card">
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
                  <span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tube' ? '试管近景' : '银镜近景'}</span>
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

          <section className="info-card silvermirror-rail-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>析银程度 {depositionValue}</span><div className="chem-meter-bar"><i style={{ width: `${depositionValue}%` }} /></div></div>
              <div className="chem-meter"><span>镜面反光 {reflectValue}</span><div className="chem-meter-bar"><i style={{ width: `${reflectValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
        </aside>

        <section className="scene-panel silvermirror-workbench-stage">
          <div className="scene-toolbar silvermirror-workbench-toolbar">
            <div className="silvermirror-toolbar-head">
              <div className="silvermirror-toolbar-kicker">银镜工作台</div>
              <strong>{experiment.title}</strong>
              <p className="silvermirror-toolbar-copy">中央舞台只保留水浴与试管镜面变化，提示、操作和复盘统一下沉，不再遮住试管内壁。</p>
            </div>
            <div className="camera-actions silvermirror-camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'tube' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tube')} type="button">试管</button>
              <button className={cameraPreset === 'mirror' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('mirror')} type="button">银镜</button>
            </div>
          </div>

          <div className="scene-meta-strip silvermirror-stage-meta">
            <div className={`silvermirror-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>步骤 {step} · {stepTitles[step]}</strong>
              <p>{prompt}</p>
            </div>
            <div className="silvermirror-step-pills" aria-label="实验步骤概览">
              {silvermirrorStepOrder.map((stepId) => (
                <span className={step === stepId ? 'silvermirror-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'silvermirror-step-pill done' : 'silvermirror-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className={`scene-canvas silvermirror-stage preset-${cameraPreset} ${bathReady ? 'bath-ready' : ''} ${glucoseAdded ? 'glucose-added' : ''} ${mirrorFormed ? 'mirror-formed' : ''}`}>
            <div className="silvermirror-rig">
              <div className="smi-bench-shadow" />
              <div className="smi-stand">
                <div className="smi-stand-base" />
                <div className="smi-stand-rod" />
                <div className="smi-stand-ring" />
                <div className={bathReady ? 'smi-clamp active' : 'smi-clamp'}>
                  <span className="smi-clamp-jaw jaw-left" />
                  <span className="smi-clamp-jaw jaw-right" />
                  <span className="smi-clamp-knob" />
                </div>
              </div>
              <div className="smi-bath">
                <div className="smi-bath-rim" />
                <div className={bathReady ? 'smi-water active' : 'smi-water'}>
                  <span className="smi-water-surface" />
                  <span className="smi-water-ripple ripple-1" />
                  <span className="smi-water-ripple ripple-2" />
                  <span className={bathReady ? 'smi-bath-caustic active' : 'smi-bath-caustic'} />
                </div>
                <div className="smi-bath-shadow" />
                <div className={bathReady ? 'smi-steam active steam-1' : 'smi-steam steam-1'} />
                <div className={bathReady ? 'smi-steam active steam-2' : 'smi-steam steam-2'} />
                <div className={bathReady ? 'smi-steam active steam-3' : 'smi-steam steam-3'} />
                <div className={bathReady ? 'smi-steam-haze active' : 'smi-steam-haze'} />
              </div>
              <div className={bathReady ? 'smi-tube active' : 'smi-tube'}>
                <div className="smi-tube-mouth" />
                <div className="smi-tube-gloss" />
                <div className={bathReady ? 'smi-condensation active' : 'smi-condensation'}>
                  <span className={bathReady ? 'smi-condensation-trails active' : 'smi-condensation-trails'} />
                </div>
                <div className={glucoseAdded ? 'smi-solution active' : bathReady ? 'smi-solution warm' : 'smi-solution'}>
                  <span className="smi-solution-surface" />
                  <span className={glucoseAdded ? 'smi-reaction-swirl active' : 'smi-reaction-swirl'} />
                  <span className={glucoseAdded ? 'smi-glucose-plume active plume-1' : 'smi-glucose-plume plume-1'} />
                  <span className={glucoseAdded ? 'smi-glucose-plume active plume-2' : 'smi-glucose-plume plume-2'} />
                </div>
                <div className={mirrorFormed ? 'smi-silver-specks active' : glucoseAdded ? 'smi-silver-specks seeding' : 'smi-silver-specks'}>
                  <span className={glucoseAdded ? 'smi-seed-front active' : 'smi-seed-front'} />
                </div>
                <div className={mirrorFormed ? 'smi-mirror active' : glucoseAdded ? 'smi-mirror seeding' : 'smi-mirror'}>
                  <span className="smi-mirror-edge" />
                  <span className="smi-mirror-band band-1" />
                  <span className="smi-mirror-band band-2" />
                  <span className={mirrorFormed ? 'smi-mirror-streak active' : 'smi-mirror-streak'} />
                  <span className={mirrorFormed ? 'smi-mirror-sheen active' : 'smi-mirror-sheen'} />
                </div>
              </div>
              <div className={glucoseAdded ? 'smi-dropper active' : 'smi-dropper'}>
                <div className="smi-dropper-bulb" />
                <div className="smi-dropper-glass" />
                <div className={glucoseAdded && !mirrorFormed ? 'smi-drop active' : 'smi-drop'} />
              </div>
            </div>
          </div>

          <div className="workbench-inline-dock silvermirror-workbench-dock">
            <div className="silvermirror-workbench-status-grid">
              <div className={`info-card silvermirror-status-card tone-${promptTone}`}>
                <span>当前进度</span>
                <strong>步骤 {step} · {stepTitles[step]}</strong>
                <p>{silvermirrorWorkbenchStatus}</p>
              </div>
              <div className={`info-card silvermirror-status-card ${bathReady ? 'tone-success' : ''}`.trim()}>
                <span>水浴与加样</span>
                <strong>{bathReady ? '温热水浴已建立' : '待建立水浴'} / {glucoseAdded ? '葡萄糖已加入' : '待加葡萄糖'}</strong>
                <p>先在温热条件下建立反应环境，再加入还原性物质。</p>
              </div>
              <div className={`info-card silvermirror-status-card ${mirrorFormed ? 'tone-success' : promptTone === 'error' && step >= 4 ? 'tone-error' : ''}`.trim()}>
                <span>银镜现象</span>
                <strong>{mirrorAppearance}</strong>
                <p>{mirrorFormed ? '试管内壁已出现均匀明亮银层。' : '重点观察内壁反光增强和银层附着。'}</p>
              </div>
              <div className={`info-card silvermirror-status-card ${completed ? 'tone-success' : ''}`.trim()}>
                <span>实验指标</span>
                <strong>得分 {score} · 完成度 {readinessValue}%</strong>
                <p>镜面反光 {reflectValue} · 最新记录：{latestLabNote}</p>
              </div>
            </div>

            <div className="silvermirror-inline-workbench">
              <section className="info-card silvermirror-inline-panel silvermirror-workbench-actions">
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
                      <button className="summary-choice generic-choice primary" onClick={() => handleBath('correct')} type="button">
                        <strong>把试管放入温热水浴中</strong>
                        <span>建立适合银镜反应的温度环境。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleBath('cold')} type="button">
                        <strong>直接放入冷水中等待成镜</strong>
                        <span>错误演示：现象不典型。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 3 ? (
                    <>
                      <button className="summary-choice generic-choice primary" onClick={() => handleAddGlucose('correct')} type="button">
                        <strong>加入葡萄糖溶液并轻轻振荡</strong>
                        <span>启动还原析银过程。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleAddGlucose('skip')} type="button">
                        <strong>不加葡萄糖直接观察</strong>
                        <span>错误演示：缺少关键反应物。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 4 ? (
                    <>
                      <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button">
                        <strong>记录“试管内壁出现均匀明亮的银镜”</strong>
                        <span>这是本实验的正确现象。</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('black')} type="button">
                        <strong>记录“试管整体会发黑发暗”</strong>
                        <span>错误演示：忽略镜面现象。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleObserve('none')} type="button">
                        <strong>记录“内壁始终没有任何变化”</strong>
                        <span>错误演示：与典型现象不符。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 5 ? (
                    <>
                      <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                        <strong>银氨溶液在温热条件下被还原，试管内壁析出银层形成银镜</strong>
                        <span>完整总结本实验结论。</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('just-heating')} type="button">
                        <strong>银镜只是因为加热后试管内壁自己发亮</strong>
                        <span>错误演示：原理错误。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-silver')} type="button">
                        <strong>该实验不会产生任何可见银层</strong>
                        <span>错误演示：忽略核心现象。</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="info-card silvermirror-inline-panel silvermirror-notebook-panel">
                <div className="generic-notebook-head">
                  <div>
                    <span className="eyebrow">Notebook</span>
                    <h3>过程记录与读数</h3>
                  </div>
                  <span className="badge">舞台下工作台</span>
                </div>
                <div className="generic-readout-grid silvermirror-readout-grid">
                  <article className={bathReady ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>水浴状态</span><strong>{bathReady ? '已温热' : '--'}</strong><small>{bathReady ? '反应环境已建立。' : '先建立温热水浴。'}</small></article>
                  <article className={mirrorFormed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>内壁现象</span><strong>{mirrorFormed ? '银镜已出现' : '--'}</strong><small>{mirrorFormed ? '内壁已形成均匀银色镜面。' : '等待出现银镜。'}</small></article>
                  <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '析出银层' : '等待总结'}</strong><small>银镜反应的关键证据是试管内壁出现反光银层。</small></article>
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

        <aside className="playground-side silvermirror-side-rail silvermirror-side-rail-right">
          <section className="info-card silvermirror-rail-card">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{bathReady ? '水浴已建立' : '水浴待建立'} / 银镜状态：{mirrorFormed ? '已形成' : '待形成'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先水浴、再加还原剂、后观察银镜'}</li>
            </ul>
          </section>

          <section className="info-card silvermirror-rail-card silvermirror-rail-prompt">
            <span className="eyebrow">Readout</span>
            <h3>银镜结果板</h3>
            <div className="generic-readout-grid silvermirror-readout-grid">
              <article className={bathReady ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>水浴</span><strong>{bathReady ? '已建立' : '--'}</strong><small>先确保温热环境。</small></article>
              <article className={glucoseAdded ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>加样</span><strong>{glucoseAdded ? '已加入' : '--'}</strong><small>葡萄糖负责还原析银。</small></article>
              <article className={observationChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>结果</span><strong>{mirrorAppearance}</strong><small>重点观察试管内壁镜面反光。</small></article>
            </div>
          </section>

          <section className="info-card silvermirror-rail-card silvermirror-rail-prompt">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`info-card silvermirror-rail-card silvermirror-rail-prompt ${completed ? 'tone-success' : promptTone === 'error' ? 'tone-error' : ''}`.trim()}>
            <span className="eyebrow">Control</span>
            <h3>实验控制</h3>
            <p>{silvermirrorCompletionCopy}</p>
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
