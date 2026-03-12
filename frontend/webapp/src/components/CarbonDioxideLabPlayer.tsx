import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'reaction' | 'test';
type MaterialId = 'flask' | 'delivery-tube' | 'marble' | 'dilute-acid' | 'limewater';
type TimelineState = 'done' | 'current' | 'todo';

interface CarbonDioxideLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别仪器与药品',
  2: '搭建制气装置',
  3: '加入药品开始反应',
  4: '观察检验现象',
  5: '总结制取与检验',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别锥形瓶、导气管、大理石、稀酸和澄清石灰水。',
  2: '搭好锥形瓶与导气管，确保产气路径可以通向石灰水。',
  3: '按规范先放入大理石，再加入稀酸，让装置开始产气。',
  4: '观察通入澄清石灰水后的变化，判断是否生成二氧化碳。',
  5: '总结二氧化碳的制取步骤以及石灰水检验依据。',
};

const materialLabels: Record<MaterialId, string> = {
  flask: '锥形瓶',
  'delivery-tube': '导气管',
  marble: '大理石',
  'dilute-acid': '稀酸',
  limewater: '澄清石灰水',
};

const materialOrder: MaterialId[] = ['flask', 'delivery-tube', 'marble', 'dilute-acid', 'limewater'];

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

export function CarbonDioxideLabPlayer({ experiment, onTelemetry }: CarbonDioxideLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [deviceParts, setDeviceParts] = useState<string[]>([]);
  const [marbleAdded, setMarbleAdded] = useState(false);
  const [acidAdded, setAcidAdded] = useState(false);
  const [gasFlow, setGasFlow] = useState(0);
  const [limewaterTested, setLimewaterTested] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先完成装置识别与连接，再按“大理石 → 稀酸 → 石灰水检验”的顺序操作。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const deviceReady = deviceParts.includes('flask') && deviceParts.includes('delivery-tube') && deviceParts.includes('limewater');
  const reactionReady = marbleAdded && acidAdded;
  const turbidity = limewaterTested ? 86 : reactionReady ? 48 : 16;
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const safetyValue = clamp(95 - errors * 5, 58, 99);
  const clarityValue = clamp(46 + (deviceReady ? 14 : 0) + (reactionReady ? 14 : 0) + (limewaterTested ? 16 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 36, 99);
  const readinessValue = clamp(progressPercent + (deviceReady ? 12 : 0) + gasFlow + (limewaterTested ? 16 : 0), 20, 100);
  const reactionLiquidHeight = reactionReady ? 54 : marbleAdded || acidAdded ? 28 : 12;
  const limewaterLevel = limewaterTested ? 58 : reactionReady ? 56 : 54;
  const stageMode = limewaterTested ? 'tested' : reactionReady ? 'reacting' : deviceReady ? 'primed' : 'idle';

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
        setCameraPreset('reaction');
        advanceStep(2, '识别完成，下一步搭建制取二氧化碳的装置。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 项材料，继续检查实验台。`);
      }
      return next;
    });
  };

  const handleDevice = (part: 'flask' | 'delivery-tube' | 'limewater') => {
    if (step !== 2 || completed) return;
    setDeviceParts((current) => {
      if (current.includes(part)) return current;
      const next = [...current, part];
      appendNote(`装置连接：已接入${materialLabels[part]}`);
      if (next.includes('flask') && next.includes('delivery-tube') && next.includes('limewater')) {
        setCameraPreset('reaction');
        advanceStep(3, '制气装置已搭好，按规范加入大理石和稀酸开始反应。');
      } else {
        setPromptTone('success');
        setPrompt('继续完成锥形瓶、导气管和石灰水之间的连接。');
      }
      return next;
    });
  };

  const handleReagent = (mode: 'marble' | 'acid' | 'wrong-order') => {
    if (step !== 3 || completed) return;
    if (!deviceReady) {
      markError('请先完成制气装置搭建，再开始加入药品。');
      return;
    }
    if (mode === 'wrong-order') {
      markError('药品加入顺序不清，请先加入大理石，再加入稀酸。');
      return;
    }
    if (mode === 'marble') {
      setMarbleAdded(true);
      setPromptTone('success');
      setPrompt('大理石已加入，请继续缓慢加入稀酸。');
      appendNote('反应准备：已加入大理石');
      return;
    }
    if (!marbleAdded) {
      markError('请先把大理石放入锥形瓶，再加入稀酸。');
      return;
    }
    setAcidAdded(true);
    setGasFlow(32);
    appendNote('反应启动：加入稀酸后开始稳定产气');
    setCameraPreset('test');
    advanceStep(4, '装置开始产气，下一步观察石灰水是否变浑浊。');
  };

  const handleObserve = (choice: 'correct' | 'no-change' | 'wrong-gas') => {
    if (step !== 4 || completed) return;
    if (!reactionReady) {
      markError('请先让装置开始反应，再观察石灰水现象。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'no-change' ? '请根据石灰水变化判断是否生成二氧化碳。' : '澄清石灰水变浑浊说明通入的是二氧化碳，不是氧气。');
      return;
    }
    setLimewaterTested(true);
    setGasFlow(78);
    appendNote('检验记录：澄清石灰水由清澈变浑浊');
    advanceStep(5, '检验现象已确认，最后总结二氧化碳的制取与检验依据。');
  };

  const handleSummary = (choice: 'correct' | 'missing-test' | 'wrong-basis') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (!limewaterTested) {
      markError('请先完成石灰水检验，再提交总结。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'missing-test' ? '总结不完整：需要同时说清制取流程和石灰水检验。' : '检验依据错误：判断二氧化碳需要结合石灰水变浑浊现象。');
      return;
    }
    advanceStep(null, experiment.feedback.successSummary);
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setDeviceParts([]);
    setMarbleAdded(false);
    setAcidAdded(false);
    setGasFlow(0);
    setLimewaterTested(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先完成装置识别与连接，再按“大理石 → 稀酸 → 石灰水检验”的顺序操作。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '装置必须先接通导气路径，再加入药品，否则检验链路不完整。',
        '加药顺序要先大理石后稀酸，才能稳定产生二氧化碳。',
        '澄清石灰水变浑浊是判断二氧化碳的重要依据。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对装置、顺序和检验依据。',
        '建议先确认装置连通与药品顺序，再继续观察石灰水现象。',
      ];

  return (
    <section className="panel playground-panel carbon-dioxide-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学气体实验页</h2>
          <p>围绕装置连接、产气过程和石灰水检验重做专属页，让“制取 + 检验”形成完整的化学实验体验。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid carbon-grid">
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
                <span className="badge">化学</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜头</strong>
                  <span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'reaction' ? '反应区' : '检验区'}</span>
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

          <section className="info-card carbon-data-card">
            <span className="eyebrow">Readout</span>
            <h3>反应结果板</h3>
            <div className="carbon-data-grid">
              <div className="carbon-data-item">
                <span>产气状态</span>
                <strong>{reactionReady ? '稳定产气' : '待启动'}</strong>
                <small>导气路径连通后，锥形瓶内气泡会逐渐增多。</small>
              </div>
              <div className="carbon-data-item">
                <span>石灰水浊度</span>
                <strong>{limewaterTested ? '明显浑浊' : `${turbidity}%`}</strong>
                <small>{limewaterTested ? '已形成典型检验现象。' : '等待通气后观察变化。'}</small>
              </div>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '反应装置'} · 当前重点：{step === 2 ? '导气连接' : step === 3 ? '药品顺序' : step === 4 ? '石灰水检验' : '流程总结'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'reaction' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('reaction')} type="button">反应区</button>
              <button className={cameraPreset === 'test' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('test')} type="button">检验区</button>
            </div>
          </div>

          <div className={`scene-canvas carbon-stage preset-${cameraPreset} ${stageMode}`}>
            <div className="carbon-stage-head">
              <div>
                <span className="eyebrow">Live Chemistry</span>
                <h3>{experiment.curriculum.unit}</h3>
                <p>{promptTone === 'error' ? '当前装置或操作顺序存在偏差，请先修正再继续。' : '重点关注装置连通、锥形瓶产气和石灰水浑浊变化。'}</p>
              </div>
              <div className="status-pill-row">
                <span className="status-pill ready">进度 {progressPercent}%</span>
                <span className="status-pill">产气流量 {gasFlow}%</span>
              </div>
            </div>

            <div className="carbon-stage-grid">
              <article className={deviceReady ? 'reaction-card active' : 'reaction-card'}>
                <div className="reaction-card-head">
                  <strong>制气装置</strong>
                  <small>{deviceReady ? '导气路径已连通' : '等待搭建'}</small>
                </div>
                <div className="reaction-rig">
                  <div className="carbon-stand">
                    <div className="carbon-stand-base" />
                    <div className="carbon-stand-pole" />
                    <div className="carbon-stand-clamp" />
                  </div>
                  <div className="flask-shell">
                    <div className="flask-neck" />
                    <div className="flask-gloss" />
                    <div className={deviceReady ? 'flask-stopper active' : 'flask-stopper'} />
                    <div className={reactionReady ? 'flask-liquid active' : 'flask-liquid'} style={{ height: `${reactionLiquidHeight}%` }} />
                    <div className={marbleAdded ? 'marble-bed active' : 'marble-bed'}>
                      <span className="marble-piece marble-piece-1" />
                      <span className="marble-piece marble-piece-2" />
                      <span className="marble-piece marble-piece-3" />
                      <span className="marble-piece marble-piece-4" />
                      <span className="marble-piece marble-piece-5" />
                    </div>
                    {reactionReady ? (
                      <div className="bubble-stream">
                        <span className="bubble-dot bubble-1" />
                        <span className="bubble-dot bubble-2" />
                        <span className="bubble-dot bubble-3" />
                        <span className="bubble-dot bubble-4" />
                        <span className="bubble-dot bubble-5" />
                        <span className="bubble-dot bubble-6" />
                      </div>
                    ) : null}
                    <div className={reactionReady ? 'reaction-mist active' : 'reaction-mist'} />
                  </div>
                  <div className={deviceParts.includes('delivery-tube') ? 'delivery-path active' : 'delivery-path'}>
                    <span className="delivery-joint delivery-joint-start" />
                    <span className="delivery-joint delivery-joint-end" />
                    <span className="delivery-flow-dot delivery-flow-dot-1" />
                    <span className="delivery-flow-dot delivery-flow-dot-2" />
                    <span className="delivery-flow-dot delivery-flow-dot-3" />
                  </div>
                </div>
              </article>

              <article className={limewaterTested ? 'reaction-card active' : 'reaction-card'}>
                <div className="reaction-card-head">
                  <strong>石灰水检验</strong>
                  <small>{limewaterTested ? '已完成检验' : '等待通气'}</small>
                </div>
                <div className="limewater-rig">
                  <div className="limewater-holder">
                    <div className="limewater-holder-base" />
                    <div className="limewater-holder-pole" />
                    <div className="limewater-holder-ring" />
                  </div>
                  <div className="limewater-cup">
                    <div className="limewater-rim" />
                    <div className={deviceParts.includes('limewater') ? 'limewater-inlet active' : 'limewater-inlet'} />
                    <div className="limewater-liquid" style={{ opacity: clamp(turbidity / 100, 0.16, 0.92), height: `${limewaterLevel}%` }} />
                    <div className="limewater-bubbles">
                      <span className="limewater-bubble limewater-bubble-1" />
                      <span className="limewater-bubble limewater-bubble-2" />
                      <span className="limewater-bubble limewater-bubble-3" />
                    </div>
                    <div className={limewaterTested ? 'limewater-cloud active' : 'limewater-cloud'} />
                    <div className={limewaterTested ? 'limewater-sediment active' : 'limewater-sediment'} />
                  </div>
                  <div className="limewater-readout">{limewaterTested ? '由澄清变浑浊' : '等待检验现象'}</div>
                </div>
              </article>
            </div>

            <div className="carbon-insight-row">
              <article className="lab-readout-card active">
                <span>装置连通</span>
                <strong>{deviceReady ? '锥形瓶 → 导气管 → 石灰水' : '待连通'}</strong>
                <small>只有完整连通，生成的气体才能被石灰水检验到。</small>
              </article>
              <article className="lab-readout-card calm">
                <span>药品状态</span>
                <strong>{marbleAdded ? '已加大理石' : '待加大理石'} / {acidAdded ? '已加稀酸' : '待加稀酸'}</strong>
                <small>大理石和稀酸顺序清晰，才能保证反应逻辑正确。</small>
              </article>
              <article className={limewaterTested ? 'lab-readout-card active' : 'lab-readout-card warn'}>
                <span>检验结论</span>
                <strong>{limewaterTested ? '二氧化碳已确认' : '等待检验'}</strong>
                <small>澄清石灰水变浑浊是判断二氧化碳的重要证据。</small>
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
                  <button className={deviceParts.includes('flask') ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleDevice('flask')} type="button">
                    <strong>摆好锥形瓶</strong>
                    <span>固定反应容器位置。</span>
                  </button>
                  <button className={deviceParts.includes('delivery-tube') ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleDevice('delivery-tube')} type="button">
                    <strong>接入导气管</strong>
                    <span>建立气体导出路径。</span>
                  </button>
                  <button className={deviceParts.includes('limewater') ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleDevice('limewater')} type="button">
                    <strong>接好石灰水检验瓶</strong>
                    <span>让产气能进入石灰水。</span>
                  </button>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <button className={marbleAdded ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleReagent('marble')} type="button">
                    <strong>加入大理石</strong>
                    <span>先放固体药品，再准备加酸。</span>
                  </button>
                  <button className={acidAdded ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleReagent('acid')} type="button">
                    <strong>加入稀酸</strong>
                    <span>启动反应并开始产气。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleReagent('wrong-order')} type="button">
                    <strong>顺序混乱加药</strong>
                    <span>错误演示：加入顺序不规范。</span>
                  </button>
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <button className="summary-choice generic-choice primary" onClick={() => handleObserve('correct')} type="button">
                    <strong>记录“石灰水变浑浊”</strong>
                    <span>根据典型现象判断生成了二氧化碳。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('no-change')} type="button">
                    <strong>记录“石灰水无明显变化”</strong>
                    <span>错误演示：忽略检验现象。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleObserve('wrong-gas')} type="button">
                    <strong>判断为“产生了氧气”</strong>
                    <span>错误演示：气体种类判断错误。</span>
                  </button>
                </>
              ) : null}

              {step === 5 ? (
                <>
                  <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                    <strong>先搭装置，再加大理石和稀酸制气，用澄清石灰水变浑浊检验二氧化碳</strong>
                    <span>完整概括了制取流程和检验依据。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('missing-test')} type="button">
                    <strong>只要产生气泡，就能判断是二氧化碳</strong>
                    <span>错误演示：缺少石灰水检验依据。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleSummary('wrong-basis')} type="button">
                    <strong>石灰水越清澈，说明二氧化碳越多</strong>
                    <span>错误演示：检验依据方向错误。</span>
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
              <li>反应状态：{reactionReady ? '已启动' : deviceReady ? '待加药' : '待搭建'}</li>
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
            <small>这页已把“二氧化碳的制取与检验”升级成装置、反应、检验一体化的专属化学页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
