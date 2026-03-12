import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'bowl' | 'path';
type MaterialId = 'coin' | 'bowl' | 'water' | 'cup' | 'sightline';
type TimelineState = 'done' | 'current' | 'todo';

interface RefractionCoinLabPlayerProps {
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
  2: '放置硬币',
  3: '向碗中加水',
  4: '观察硬币再现',
  5: '总结折射现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别硬币、玻璃碗、清水、量杯和观察视线。',
  2: '把硬币放在空碗底部。',
  3: '缓慢向碗中加水。',
  4: '观察原本挡住视线的硬币是否重新出现。',
  5: '总结光从水斜射入空气时会发生折射。',
};

const materialLabels: Record<MaterialId, string> = {
  coin: '硬币',
  bowl: '玻璃碗',
  water: '清水',
  cup: '量杯',
  sightline: '观察视线',
};

const materialOrder: MaterialId[] = ['coin', 'bowl', 'water', 'cup', 'sightline'];

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

export function RefractionCoinLabPlayer({ experiment, onTelemetry }: RefractionCoinLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [coinPlaced, setCoinPlaced] = useState(false);
  const [waterAdded, setWaterAdded] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过向碗中加水观察硬币再现现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const waterValue = clamp(28 + (coinPlaced ? 18 : 0) + (waterAdded ? 24 : 0), 20, 99);
  const pathValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (coinPlaced ? 10 : 0) + (waterAdded ? 14 : 0), 20, 100);

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
        setCameraPreset('bowl');
        advanceStep(2, '器材识别完成，先把硬币放入碗底。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePlaceCoin = (choice: 'correct' | 'outside') => {
    if (step !== 2 || completed) return;
    if (choice === 'outside') {
      markError('硬币需要放在碗底，才能观察加水后的再现现象。');
      return;
    }
    setCoinPlaced(true);
    appendNote('装置状态：硬币已放在玻璃碗底部。');
    advanceStep(3, '硬币已放好，下一步向碗中缓慢加水。');
  };

  const handleAddWater = (choice: 'correct' | 'none') => {
    if (step !== 3 || completed) return;
    if (!coinPlaced) {
      markError('请先把硬币放入碗底。');
      return;
    }
    if (choice === 'none') {
      markError('需要向碗中加水，才能观察折射导致的硬币再现。');
      return;
    }
    setWaterAdded(true);
    setCameraPreset('path');
    appendNote('液体状态：清水已没过硬币，观察视线发生变化。');
    advanceStep(4, '清水已加入，请观察硬币是否重新出现。');
  };

  const handleObserve = (choice: 'correct' | 'disappear' | 'same') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!coinPlaced || !waterAdded) {
      markError('请先放置硬币并向碗中加水。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：加水后硬币重新出现在观察视线中。');
      advanceStep(5, '硬币再现现象已观察到，下一步总结折射规律。');
      return;
    }
    markError(choice === 'disappear' ? '加水后的典型现象是硬币重新出现，而不是更难看见。' : '加水前后观察结果并不会完全相同，视线会因折射而变化。');
  };

  const handleSummary = (choice: 'correct' | 'reflection' | 'straight') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：光从水进入空气时会发生折射，使硬币看起来重新出现。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'reflection' ? '本实验的关键不是镜面反射，而是光线通过水面时发生折射。' : '若始终完全直线不变，就不会出现硬币再现现象。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setCoinPlaced(false);
    setWaterAdded(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察硬币再现现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先把硬币放入碗底，再缓慢加水。', '观察时重点看硬币是否重新进入视线。', '结论关键词是“光的折射”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对硬币和水面位置。',
        '建议按“识别 → 放硬币 → 加水 → 观察再现 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel refractioncoin-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属物理实验页</h2><p>把玻璃碗、水面、硬币和折射视线做成更接近真实课堂演示的光学场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid refractioncoin-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'bowl' ? '水碗近景' : '光路近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>液体建立 {waterValue}</span><div className="chem-meter-bar"><i style={{ width: `${waterValue}%` }} /></div></div><div className="chem-meter"><span>折射清晰度 {pathValue}</span><div className="chem-meter-bar"><i style={{ width: `${pathValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card refractioncoin-data-card"><span className="eyebrow">Readout</span><h3>折射读数板</h3><div className="generic-readout-grid refractioncoin-readout-grid"><article className={coinPlaced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>硬币状态</span><strong>{coinPlaced ? '已放入碗底' : '--'}</strong><small>{coinPlaced ? '观察对象已就位。' : '先放置硬币。'}</small></article><article className={waterAdded ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>水面状态</span><strong>{waterAdded ? '已加水' : '--'}</strong><small>{waterAdded ? '折射条件已形成。' : '等待向碗中加水。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '加水后再现' : '等待总结'}</strong><small>硬币再现现象说明光线通过水面时会发生折射。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '折射观察装置'} · 当前重点：{step <= 2 ? '建立碗底硬币' : step === 3 ? '形成水面' : '观察硬币再现'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'bowl' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bowl')} type="button">水碗</button><button className={cameraPreset === 'path' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('path')} type="button">光路</button></div></div><div className={`scene-canvas refractioncoin-stage preset-${cameraPreset} ${coinPlaced ? 'coin-placed' : ''} ${waterAdded ? 'water-added' : ''}`}><div className="refractioncoin-rig"><div className="rc-bowl"><div className={waterAdded ? 'rc-water active' : 'rc-water'} /><div className={coinPlaced ? 'rc-coin active' : 'rc-coin'} /></div><div className={waterAdded ? 'rc-ray active' : 'rc-ray'} /><div className={waterAdded ? 'rc-eye active' : 'rc-eye'} /></div></div><div className="observation-ribbon refractioncoin-observation-row"><article className={coinPlaced ? 'observation-chip active' : 'observation-chip calm'}><strong>硬币</strong><span>{coinPlaced ? '硬币已放在碗底。' : '待放硬币。'}</span></article><article className={waterAdded ? 'observation-chip active' : 'observation-chip calm'}><strong>加水</strong><span>{waterAdded ? '碗中已形成水面。' : '等待加水。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>再现</strong><span>{observationChoice === 'correct' ? '已观察到硬币再现。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePlaceCoin('correct')} type="button"><strong>把硬币放到玻璃碗底部</strong><span>建立折射观察对象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePlaceCoin('outside')} type="button"><strong>把硬币放在碗外侧桌面上</strong><span>错误演示：无法形成目标现象。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAddWater('correct')} type="button"><strong>缓慢向碗中加入清水</strong><span>形成折射界面。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAddWater('none')} type="button"><strong>不加水直接判断结果</strong><span>错误演示：没有折射条件。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“加水后原本挡住视线的硬币重新出现”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“加水前后看到的情况完全一样”</strong><span>错误演示：忽略折射影响。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('disappear')} type="button"><strong>记录“加水后硬币变得更难看见”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>光从水进入空气时会发生折射，使硬币看起来重新出现</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('reflection')} type="button"><strong>硬币再现主要是因为水面像镜子一样反射</strong><span>错误演示：原理错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('straight')} type="button"><strong>加水后光线仍完全不变，所以会看到硬币</strong><span>错误演示：忽略折射。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{coinPlaced ? '硬币已放' : '硬币待放'} / {waterAdded ? '已加水' : '待加水'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先放硬币，再向碗中加水'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“硬币再现”升级成可见水面折射的专属页。</small></section></aside>
      </div>
    </section>
  );
}
