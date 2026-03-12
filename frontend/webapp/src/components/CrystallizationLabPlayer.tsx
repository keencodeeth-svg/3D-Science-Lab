import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'dish' | 'close';
type MaterialId = 'beaker' | 'evaporation-dish' | 'alcohol-lamp' | 'glass-rod' | 'crystal-tray';
type TimelineState = 'done' | 'current' | 'todo';

interface CrystallizationLabPlayerProps {
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
  2: '加热溶液',
  3: '浓缩溶液',
  4: '观察晶体析出',
  5: '总结结晶条件',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别烧杯、蒸发皿、酒精灯、玻璃棒和晶体托盘。',
  2: '先加热食盐溶液，让水分蒸发并提高浓度。',
  3: '继续蒸发到较浓状态，再准备冷却观察。',
  4: '观察蒸发皿边缘和底部出现晶体的过程。',
  5: '总结溶液浓缩和冷却后为什么会析出晶体。',
};

const materialLabels: Record<MaterialId, string> = {
  beaker: '烧杯',
  'evaporation-dish': '蒸发皿',
  'alcohol-lamp': '酒精灯',
  'glass-rod': '玻璃棒',
  'crystal-tray': '晶体托盘',
};

const materialOrder: MaterialId[] = ['beaker', 'evaporation-dish', 'alcohol-lamp', 'glass-rod', 'crystal-tray'];
const crystallizationStepOrder: StepId[] = [1, 2, 3, 4, 5];

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

export function CrystallizationLabPlayer({ experiment, onTelemetry }: CrystallizationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [heated, setHeated] = useState(false);
  const [concentrated, setConcentrated] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先加热蒸发，再浓缩溶液后观察晶体析出。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const solutionState = !heated ? '未加热' : concentrated ? '已浓缩' : '正在蒸发';
  const crystalState = observationChoice === 'correct' ? '晶体析出' : concentrated ? '等待冷却观察' : '待形成';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const crystallizeValue = clamp(42 + (heated ? 16 : 0) + (concentrated ? 18 : 0) + (observationChoice === 'correct' ? 18 : 0), 24, 99);
  const clarityValue = clamp(42 + (heated ? 10 : 0) + (observationChoice === 'correct' ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (heated ? 14 : 0) + (concentrated ? 16 : 0), 20, 100);

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
        setCameraPreset('dish');
        advanceStep(2, '器材识别完成，先加热溶液开始蒸发。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleHeat = (choice: 'heat' | 'cool') => {
    if (step !== 2 || completed) return;
    if (choice === 'cool') {
      markError('请先加热蒸发掉一部分水分，再谈结晶观察。');
      return;
    }
    setHeated(true);
    appendNote('操作记录：溶液已在酒精灯上加热，水分开始蒸发。');
    advanceStep(3, '加热蒸发已开始，下一步把溶液继续浓缩。');
  };

  const handleConcentrate = (choice: 'continue' | 'stop') => {
    if (step !== 3 || completed) return;
    if (!heated) {
      markError('请先完成加热蒸发，再继续浓缩溶液。');
      return;
    }
    if (choice === 'stop') {
      markError('现在还不能太早停止，需要把溶液浓缩到更明显状态。');
      return;
    }
    setConcentrated(true);
    setCameraPreset('close');
    appendNote('操作记录：蒸发皿中的溶液已较浓，边缘开始出现结晶条件。');
    advanceStep(4, '溶液已浓缩，开始观察晶体析出。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'no-crystal') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!concentrated) {
      markError('请先把溶液浓缩后再观察是否出现晶体。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：蒸发皿边缘和底部逐渐析出明显晶体。');
      advanceStep(5, '晶体现象已观察到，最后总结结晶形成条件。');
      return;
    }
    if (choice === 'same') {
      markError('浓缩并冷却后，溶液状态不会一直完全不变。');
      return;
    }
    markError('本实验中会出现晶体，不是一直没有结晶。');
  };

  const handleSummary = (choice: 'correct' | 'only-heat' | 'more-water') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：溶液浓缩到一定程度并继续冷却或蒸发时，溶质会析出形成晶体。');
      return;
    }
    if (choice === 'only-heat') {
      markError('不是单纯加热就够了，关键是溶液变浓并达到析晶条件。');
      return;
    }
    markError('加更多水不会更容易结晶，通常会让溶液更稀。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setHeated(false);
    setConcentrated(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新通过蒸发浓缩观察晶体析出。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先加热，再浓缩，最后观察晶体，步骤不要跳。',
        '重点看蒸发皿边缘和底部的晶体出现过程。',
        '总结时要把“溶液变浓”和“析出晶体”联系起来。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对结晶条件。',
        '建议重新执行“加热 → 浓缩 → 观察晶体”的流程。',
      ];

  const crystallizationObservationResult = observationChoice === 'correct'
    ? '边缘与底部析晶'
    : observationChoice === 'same'
      ? '误判为没有变化'
      : observationChoice === 'no-crystal'
        ? '误判为不会析晶'
        : crystalState;
  const crystallizationWorkbenchStatus = completed
    ? '加热蒸发、浓缩析晶与结晶条件归纳已全部完成。'
    : step === 1
      ? '先识别蒸发皿、酒精灯、三脚架和待结晶溶液。'
      : step === 2
        ? '先加热蒸发，推动溶液逐步失水。'
        : step === 3
          ? '继续蒸发到较浓，为析晶创造条件。'
          : step === 4
            ? '观察边缘和底部是否开始出现晶体。'
            : '根据蒸发与浓缩结果总结结晶条件。';
  const crystallizationCompletionCopy = completed
    ? '实验已完成，当前版本支持加热蒸发、浓缩、析晶观察与结晶规律归纳。'
    : '完成全部 5 个步骤后，这里会输出本次结晶实验的总结结果。';
  const latestLabNote = labNotes[0] ?? '实验已载入：通过加热蒸发和浓缩观察晶体析出。';

  return (
    <section className="panel playground-panel crystallization-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把蒸发、浓缩、析晶过程做成连续可视化场景，让结晶不再只是图片记忆，而是完整实验链路。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid crystallization-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'dish' ? '蒸发皿观察' : '晶体近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>结晶值 {crystallizeValue}</span><div className="chem-meter-bar"><i style={{ width: `${crystallizeValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card crystallization-data-card"><span className="eyebrow">Readout</span><h3>结晶读数板</h3><div className="generic-readout-grid crystallization-readout-grid"><article className={heated ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>溶液状态</span><strong>{solutionState}</strong><small>{heated ? '加热蒸发会让溶液浓度逐步增大。' : '先开始加热蒸发。'}</small></article><article className={concentrated ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>浓缩程度</span><strong>{concentrated ? '较浓' : '待浓缩'}</strong><small>{concentrated ? '浓度升高后更容易出现析晶现象。' : '需要继续蒸发掉部分水分。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>晶体现象</span><strong>{crystalState}</strong><small>溶液达到一定浓度并继续冷却或蒸发时，会析出晶体。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar stage-first-toolbar"><div className="stage-first-toolbar-head"><span className="stage-first-toolbar-kicker">Workbench</span><strong>当前步骤：{stepTitles[step]}</strong><p className="stage-first-toolbar-copy">{crystallizationWorkbenchStatus}</p></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'dish' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('dish')} type="button">蒸发皿</button><button className={cameraPreset === 'close' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('close')} type="button">晶体</button></div></div>

          <div className="scene-meta-strip stage-first-meta crystallization-stage-meta"><div className={`stage-first-card crystallization-stage-card tone-${promptTone}`}><span>当前任务</span><strong>步骤 {step} · {stepTitles[step]}</strong><p>{prompt}</p></div><div className="stage-first-step-pills crystallization-step-pills" aria-label="实验步骤概览">{crystallizationStepOrder.map((stepId) => (<span className={step === stepId ? 'stage-first-step-pill crystallization-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'stage-first-step-pill crystallization-step-pill done' : 'stage-first-step-pill crystallization-step-pill'} key={stepId}><small>步骤 {stepId}</small><strong>{stepTitles[stepId]}</strong></span>))}</div></div>

          <div className={`scene-canvas crystallization-stage preset-${cameraPreset} ${heated ? 'heated' : ''} ${concentrated ? 'concentrated' : ''}`}><div className="crystallization-rig"><div className="crystal-lamp" /><div className={`crystal-flame ${heated ? 'active' : ''}`} /><div className="crystal-tripod" /><div className="crystal-dish"><div className={`crystal-liquid ${concentrated ? 'low' : heated ? 'active' : ''}`} /><div className={`crystal-cluster ${observationChoice === 'correct' ? 'active' : ''}`}><span className="crystal-piece piece-1" /><span className="crystal-piece piece-2" /><span className="crystal-piece piece-3" /><span className="crystal-piece piece-4" /></div></div><div className={heated ? 'crystal-steam active' : 'crystal-steam'}><span className="steam-wisp steam-1" /><span className="steam-wisp steam-2" /><span className="steam-wisp steam-3" /></div></div></div>

          <div className="observation-ribbon crystallization-observation-row"><article className={heated ? 'observation-chip active' : 'observation-chip calm'}><strong>加热蒸发</strong><span>{heated ? '酒精灯加热后，溶液中的水分持续蒸发。' : '先开始加热。'}</span></article><article className={concentrated ? 'observation-chip active' : 'observation-chip calm'}><strong>溶液浓缩</strong><span>{concentrated ? '蒸发皿中溶液已较浓，析晶条件更充分。' : '继续蒸发提高浓度。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>晶体析出</strong><span>{observationChoice === 'correct' ? '边缘和底部已出现明显晶体。' : '等待完成析晶观察。'}</span></article></div>

          <div className="workbench-inline-dock stage-first-dock crystallization-workbench-dock"><div className="stage-first-status-grid crystallization-workbench-status-grid"><article className={`stage-first-status crystallization-workbench-status tone-${promptTone} ${completed ? 'is-live' : ''}`.trim()}><span>工作台状态</span><strong>{completed ? '实验完成' : '正在进行'}</strong><small>{crystallizationWorkbenchStatus}</small></article><article className={heated ? 'stage-first-status crystallization-workbench-status is-live' : 'stage-first-status crystallization-workbench-status'}><span>溶液状态</span><strong>{solutionState}</strong><small>{heated ? '加热蒸发会让溶液浓度逐步增大。' : '先开始加热蒸发。'}</small></article><article className={concentrated ? 'stage-first-status crystallization-workbench-status is-live' : 'stage-first-status crystallization-workbench-status'}><span>浓缩程度</span><strong>{concentrated ? '较浓' : '待浓缩'}</strong><small>{concentrated ? '浓度升高后更容易出现析晶现象。' : '需要继续蒸发掉部分水分。'}</small></article><article className={summaryChoice === 'correct' ? 'stage-first-status crystallization-workbench-status is-live' : 'stage-first-status crystallization-workbench-status'}><span>晶体现象</span><strong>{crystallizationObservationResult}</strong><small>溶液达到一定浓度并继续冷却或蒸发时，会析出晶体。</small></article></div><div className="stage-first-inline-grid"><section className="info-card stage-first-inline-panel crystallization-actions-panel"><div className="generic-notebook-head"><div><span className="eyebrow">Actions</span><h3>当前步骤操作</h3></div><span className="badge">舞台下工作台</span></div><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleHeat('heat')} type="button"><strong>加热蒸发溶液</strong><span>先让部分水分蒸发掉。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleHeat('cool')} type="button"><strong>先直接冷却</strong><span>错误演示：没有先浓缩溶液。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleConcentrate('continue')} type="button"><strong>继续蒸发至较浓</strong><span>为晶体析出创造条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleConcentrate('stop')} type="button"><strong>太早停止蒸发</strong><span>错误演示：浓度还不够明显。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“边缘和底部逐渐出现晶体”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“溶液始终没有变化”</strong><span>错误演示：忽略浓缩结果。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('no-crystal')} type="button"><strong>记录“不会析出晶体”</strong><span>错误演示：与实验现象不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>溶液浓缩并继续冷却或蒸发时，溶质会析出形成晶体</strong><span>完整总结结晶条件。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('only-heat')} type="button"><strong>只要加热就一定会结晶</strong><span>错误演示：忽略浓度条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('more-water')} type="button"><strong>加更多水会更容易结晶</strong><span>错误演示：会让溶液更稀。</span></button></> : null}</div></section><section className="info-card stage-first-inline-panel crystallization-notebook-panel"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>过程记录与读数</h3></div><span className="badge">舞台下工作台</span></div><div className="generic-readout-grid stage-first-readout-grid"><article className={heated ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>溶液状态</span><strong>{solutionState}</strong><small>{heated ? '加热蒸发会让溶液浓度逐步增大。' : '先开始加热蒸发。'}</small></article><article className={concentrated ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>浓缩程度</span><strong>{concentrated ? '较浓' : '待浓缩'}</strong><small>{concentrated ? '浓度升高后更容易出现析晶现象。' : '需要继续蒸发掉部分水分。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>晶体现象</span><strong>{crystalState}</strong><small>溶液达到一定浓度并继续冷却或蒸发时，会析出晶体。</small></article></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div><small>{crystallizationCompletionCopy} · {latestLabNote}</small></section></div></div>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleHeat('heat')} type="button"><strong>加热蒸发溶液</strong><span>先让部分水分蒸发掉。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleHeat('cool')} type="button"><strong>先直接冷却</strong><span>错误演示：没有先浓缩溶液。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleConcentrate('continue')} type="button"><strong>继续蒸发至较浓</strong><span>为晶体析出创造条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleConcentrate('stop')} type="button"><strong>太早停止蒸发</strong><span>错误演示：浓度还不够明显。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“边缘和底部逐渐出现晶体”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“溶液始终没有变化”</strong><span>错误演示：忽略浓缩结果。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('no-crystal')} type="button"><strong>记录“不会析出晶体”</strong><span>错误演示：与实验现象不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>溶液浓缩并继续冷却或蒸发时，溶质会析出形成晶体</strong><span>完整总结结晶条件。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('only-heat')} type="button"><strong>只要加热就一定会结晶</strong><span>错误演示：忽略浓度条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('more-water')} type="button"><strong>加更多水会更容易结晶</strong><span>错误演示：会让溶液更稀。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{heated ? '已加热' : '待加热'} / {concentrated ? '已浓缩' : '待浓缩'} / {observationChoice === 'correct' ? '已见晶体' : '待观察晶体'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先蒸发再总结'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“结晶析出”升级成蒸发浓缩、晶体观察和规律总结一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
