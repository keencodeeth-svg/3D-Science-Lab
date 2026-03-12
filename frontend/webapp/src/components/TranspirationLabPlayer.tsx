import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'experiment' | 'control';
type MaterialId = 'plant-a' | 'plant-b' | 'transparent-bag' | 'string';
type ViewMode = 'experiment' | 'control';
type TimelineState = 'done' | 'current' | 'todo';

interface TranspirationLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别材料',
  2: '完成套袋装置',
  3: '查看对照组',
  4: '记录水珠现象',
  5: '总结蒸腾作用',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别实验植物、对照植物、透明塑料袋和扎绳。',
  2: '把透明塑料袋套在实验植物叶片外，并用扎绳固定。',
  3: '切换到对照植物视角，比较实验组和对照组的差异。',
  4: '观察塑料袋内壁是否出现水珠，并完成现象记录。',
  5: '根据实验组和对照组的差异，总结植物蒸腾作用。',
};

const materialLabels: Record<MaterialId, string> = {
  'plant-a': '实验植物',
  'plant-b': '对照植物',
  'transparent-bag': '透明塑料袋',
  string: '扎绳',
};

const materialOrder: MaterialId[] = ['plant-a', 'plant-b', 'transparent-bag', 'string'];

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

export function TranspirationLabPlayer({ experiment, onTelemetry }: TranspirationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [bagPlaced, setBagPlaced] = useState(false);
  const [stringTied, setStringTied] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('experiment');
  const [controlCompared, setControlCompared] = useState(false);
  const [timeLapseReady, setTimeLapseReady] = useState(false);
  const [dropletsRecorded, setDropletsRecorded] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先搭好套袋装置，再通过实验组 / 对照组比较判断蒸腾作用。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const assemblyReady = bagPlaced && stringTied;
  const experimentHumidity = timeLapseReady ? 92 : assemblyReady ? 76 : 58;
  const controlHumidity = timeLapseReady ? 48 : 44;
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const safetyValue = clamp(96 - errors * 4, 66, 99);
  const clarityValue = clamp(48 + (assemblyReady ? 16 : 0) + (controlCompared ? 12 : 0) + (timeLapseReady ? 14 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 36, 99);
  const readinessValue = clamp(progressPercent + (assemblyReady ? 14 : 0) + (controlCompared ? 12 : 0) + (dropletsRecorded ? 18 : 0), 20, 100);

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

  const appendNote = (note: string) => {
    setLabNotes((current) => [note, ...current].slice(0, 6));
  };

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
        setCameraPreset('experiment');
        advanceStep(2, '识别完成，下一步给实验植物套袋并扎紧。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 项材料，继续检查实验台。`);
      }
      return next;
    });
  };

  const handleBag = (mode: 'place' | 'tie' | 'loose') => {
    if (step !== 2 || completed) return;
    if (mode === 'loose') {
      markError('套袋不严会影响实验现象，请确保塑料袋紧贴并扎好。');
      return;
    }
    if (mode === 'place') {
      setBagPlaced(true);
      setPromptTone('success');
      setPrompt('透明塑料袋已套好，请继续用扎绳固定。');
      appendNote('装置搭建：实验植物已完成套袋');
      return;
    }
    if (!bagPlaced) {
      markError('请先把透明塑料袋套在实验植物上，再扎紧。');
      return;
    }
    setStringTied(true);
    appendNote('装置搭建：塑料袋已扎紧固定');
    setCameraPreset('control');
    advanceStep(3, '套袋装置完成，下一步切换到对照组视角进行比较。');
  };

  const handleView = (mode: ViewMode, compare = false) => {
    if (step !== 3 || completed) return;
    if (!assemblyReady) {
      markError('请先完成实验植物的套袋装置，再比较对照组。');
      return;
    }
    setViewMode(mode);
    setCameraPreset(mode === 'experiment' ? 'experiment' : 'control');
    if (compare && mode === 'control') {
      setControlCompared(true);
      appendNote('对照比较：已查看对照植物并完成实验组 / 对照组对照');
      advanceStep(4, '对照组已查看，现在观察实验植物塑料袋内壁是否出现水珠。');
    } else {
      setPromptTone('info');
      setPrompt(mode === 'experiment' ? '当前查看实验组，请再切换到对照组比较差异。' : '当前查看对照组，请留意其与实验组的差异。');
    }
  };

  const handleTimeLapse = () => {
    if (step !== 4 || completed) return;
    if (!controlCompared) {
      markError('请先完成实验组和对照组的对照比较，再记录水珠现象。');
      return;
    }
    setTimeLapseReady(true);
    setPromptTone('success');
    setPrompt('时间推移后，实验植物袋内湿度升高并出现水珠，请完成记录。');
    appendNote('现象形成：实验植物袋内壁已出现明显水珠');
  };

  const handleRecord = (choice: 'correct' | 'no-control' | 'wrong-group') => {
    if (step !== 4 || completed) return;
    if (!timeLapseReady) {
      markError('请先观察一段时间后的现象，再记录水珠变化。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'no-control' ? '记录时不能忽略对照组，要说明实验组和对照组差异。' : '水珠主要出现在实验组套袋内壁，对照组没有同样现象。');
      return;
    }
    setDropletsRecorded(true);
    appendNote('现象记录：实验组袋内有水珠，对照组无明显水珠');
    advanceStep(5, '现象记录完成，最后总结蒸腾作用和对照实验的意义。');
  };

  const handleSummary = (choice: 'correct' | 'ignore-control' | 'wrong-cause') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (!dropletsRecorded) {
      markError('请先完成水珠现象记录，再提交结论。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'ignore-control' ? '总结时必须体现实验组与对照组的差异。' : '袋内水珠来自叶片散失水分，不是袋子本身产生的水。');
      return;
    }
    advanceStep(null, experiment.feedback.successSummary);
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setBagPlaced(false);
    setStringTied(false);
    setViewMode('experiment');
    setControlCompared(false);
    setTimeLapseReady(false);
    setDropletsRecorded(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先搭好套袋装置，再通过实验组 / 对照组比较判断蒸腾作用。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '实验组要完成套袋并扎紧，对照组保持自然状态，才能形成有效对照。',
        '记录现象时必须比较实验组和对照组，而不是只看一盆植物。',
        '袋内水珠来自叶片散失的水分，是蒸腾作用的重要证据。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请先重新核对实验组与对照组差异。',
        '建议先明确实验组和对照组各自状态，再继续记录现象或提交结论。',
      ];

  return (
    <section className="panel playground-panel transpiration-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>围绕对照实验、套袋装置和水珠现象做专属升级，让生物实验的“过程观察”和“因果判断”更清晰。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid transpiration-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>环境</strong>
                  <span>{experiment.scene.environment}</span>
                </div>
                <span className="badge">生物</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜头</strong>
                  <span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'experiment' ? '实验组视角' : '对照组视角'}</span>
                </div>
                <span className="badge">{experiment.grade}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>主题</strong>
                  <span>{experiment.curriculum.theme}</span>
                </div>
                <span className="badge">{experiment.durationMinutes} 分钟</span>
              </div>
            </div>
          </section>

          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>安全值 {safetyValue}</span><div className="chem-meter-bar"><i style={{ width: `${safetyValue}%` }} /></div></div>
              <div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>

          <section className="info-card transpiration-data-card">
            <span className="eyebrow">Readout</span>
            <h3>对照数据板</h3>
            <div className="transpiration-data-grid">
              <div className="transpiration-data-item">
                <span>实验组湿度</span>
                <strong>{experimentHumidity}%</strong>
                <small>{timeLapseReady ? '塑料袋内壁出现水珠' : assemblyReady ? '湿度逐步上升' : '等待套袋完成'}</small>
              </div>
              <div className="transpiration-data-item">
                <span>对照组湿度</span>
                <strong>{controlHumidity}%</strong>
                <small>未套袋，对照组无明显水珠积累。</small>
              </div>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '植物样本'} · 当前重点：{step === 2 ? '装置密封' : step === 3 ? '对照比较' : step === 4 ? '水珠现象' : '蒸腾作用'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'experiment' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('experiment')} type="button">实验组</button>
              <button className={cameraPreset === 'control' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('control')} type="button">对照组</button>
            </div>
          </div>

          <div className={`scene-canvas transpiration-stage preset-${cameraPreset}`}>
            <div className="transpiration-stage-head">
              <div>
                <span className="eyebrow">Live Biology</span>
                <h3>{experiment.curriculum.unit}</h3>
                <p>{promptTone === 'error' ? '当前装置或比较方式存在偏差，请先修正再继续。' : '重点比较实验组和对照组差异，不要只看单一现象。'}</p>
              </div>
              <div className="status-pill-row">
                <span className="status-pill ready">进度 {progressPercent}%</span>
                <span className="status-pill">当前视角 {viewMode === 'experiment' ? '实验组' : '对照组'}</span>
              </div>
            </div>

            <div className="plant-compare-grid">
              <article className={viewMode === 'experiment' ? 'plant-card active' : 'plant-card'}>
                <div className="plant-card-head">
                  <strong>实验植物</strong>
                  <small>{assemblyReady ? '套袋装置已完成' : '等待套袋'}</small>
                </div>
                <div className="plant-visual">
                  <div className="plant-pot" />
                  <div className="plant-stem" />
                  <div className="leaf-group">
                    <span className="leaf leaf-a" />
                    <span className="leaf leaf-b" />
                    <span className="leaf leaf-c" />
                  </div>
                  <div className={bagPlaced ? 'plant-bag active' : 'plant-bag'}>
                    {timeLapseReady ? (
                      <div className="droplet-cluster">
                        <span className="droplet-dot dot-1" />
                        <span className="droplet-dot dot-2" />
                        <span className="droplet-dot dot-3" />
                        <span className="droplet-dot dot-4" />
                      </div>
                    ) : null}
                  </div>
                  <div className={stringTied ? 'bag-string active' : 'bag-string'} />
                </div>
                <div className="plant-meta-row">
                  <span>{bagPlaced ? '已套袋' : '未套袋'}</span>
                  <span>{stringTied ? '已扎紧' : '未固定'}</span>
                </div>
              </article>

              <article className={viewMode === 'control' ? 'plant-card active' : 'plant-card'}>
                <div className="plant-card-head">
                  <strong>对照植物</strong>
                  <small>保持自然状态</small>
                </div>
                <div className="plant-visual control">
                  <div className="plant-pot" />
                  <div className="plant-stem" />
                  <div className="leaf-group">
                    <span className="leaf leaf-a" />
                    <span className="leaf leaf-b" />
                    <span className="leaf leaf-c" />
                  </div>
                </div>
                <div className="plant-meta-row">
                  <span>无塑料袋</span>
                  <span>无明显水珠</span>
                </div>
              </article>
            </div>

            <div className="transpiration-insight-row">
              <article className="lab-readout-card active">
                <span>装置状态</span>
                <strong>{assemblyReady ? '实验组已密封' : '等待完成套袋和扎紧'}</strong>
                <small>对照组不做同样处理，才能体现对照实验价值。</small>
              </article>
              <article className="lab-readout-card calm">
                <span>对照比较</span>
                <strong>{controlCompared ? '实验组 / 对照组已比较' : '等待切换对照组'}</strong>
                <small>比较重点是是否出现袋内水珠以及湿度差异。</small>
              </article>
              <article className={dropletsRecorded ? 'lab-readout-card active' : 'lab-readout-card warn'}>
                <span>现象记录</span>
                <strong>{dropletsRecorded ? '实验组有水珠 / 对照组无明显水珠' : '等待现象记录'}</strong>
                <small>水珠是叶片散失水分后冷凝形成的重要证据。</small>
              </article>
            </div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}>
            <span className="eyebrow">Lab Prompt</span>
            <h3>{completed ? '实验已完成' : stepTitles[step]}</h3>
            <p>{prompt}</p>
          </div>

          <section className="info-card generic-notebook-card">
            <div className="generic-notebook-head">
              <div>
                <span className="eyebrow">Notebook</span>
                <h3>实验记录</h3>
              </div>
              <span className="badge">过程留痕</span>
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
        </section>

        <aside className="playground-side">
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>当前步骤操作</h3>
            <div className="summary-stack generic-choice-stack">
              {step === 1 ? materialOrder.map((materialId) => (
                <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button">
                  <strong>识别 {materialLabels[materialId]}</strong>
                  <span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别材料'}</span>
                </button>
              )) : null}

              {step === 2 ? (
                <>
                  <button className={bagPlaced ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleBag('place')} type="button">
                    <strong>为实验植物套袋</strong>
                    <span>让叶片散失的水分留在袋内。</span>
                  </button>
                  <button className={stringTied ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleBag('tie')} type="button">
                    <strong>用扎绳固定</strong>
                    <span>保证装置密封，便于观察水珠。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleBag('loose')} type="button">
                    <strong>松散套袋</strong>
                    <span>错误演示：袋口不严会影响现象。</span>
                  </button>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <button className={viewMode === 'experiment' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleView('experiment')} type="button">
                    <strong>查看实验组</strong>
                    <span>确认套袋后的实验植物状态。</span>
                  </button>
                  <button className={viewMode === 'control' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleView('control', true)} type="button">
                    <strong>切到对照组并完成比较</strong>
                    <span>完成实验组 / 对照组差异对照。</span>
                  </button>
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <button className={timeLapseReady ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={handleTimeLapse} type="button">
                    <strong>等待一段时间</strong>
                    <span>模拟一段时间后出现袋内水珠。</span>
                  </button>
                  <button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button">
                    <strong>记录“实验组有水珠，对照组无明显水珠”</strong>
                    <span>完成现象和对照关系记录。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleRecord('no-control')} type="button">
                    <strong>只记录“有水珠”</strong>
                    <span>错误演示：没有体现对照组差异。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleRecord('wrong-group')} type="button">
                    <strong>记录“对照组有水珠”</strong>
                    <span>错误演示：把现象归到错误组别。</span>
                  </button>
                </>
              ) : null}

              {step === 5 ? (
                <>
                  <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                    <strong>实验组套袋后出现水珠，对照组没有同样现象，说明叶片会散失水分</strong>
                    <span>完整体现了对照关系和蒸腾作用依据。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('ignore-control')} type="button">
                    <strong>植物袋内有水珠，所以肯定是蒸腾作用</strong>
                    <span>错误演示：没有体现对照实验意义。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleSummary('wrong-cause')} type="button">
                    <strong>袋内水珠是塑料袋自己产生的</strong>
                    <span>错误演示：现象成因判断错误。</span>
                  </button>
                </>
              ) : null}
            </div>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>实验组状态：{assemblyReady ? '已套袋并扎紧' : bagPlaced ? '已套袋，待固定' : '待搭建'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意实验规范'}</li>
            </ul>
          </section>

          <section className="info-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>实验控制</h3>
            <div className="button-stack">
              <button className="action-button ghost" onClick={handleReset} type="button">重新开始</button>
            </div>
            <small>这页已把“植物蒸腾作用现象”升级成可对照、可观察、可解释的专属生物页，后续还能继续拓展到光合作用、萌发等探究实验。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
