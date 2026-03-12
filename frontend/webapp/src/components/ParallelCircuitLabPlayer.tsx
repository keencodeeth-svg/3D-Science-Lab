import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'wiring' | 'observe';
type MaterialId = 'battery' | 'switch' | 'bulb-a' | 'bulb-b' | 'wires';
type TimelineState = 'done' | 'current' | 'todo';
type BranchMode = 'normal' | 'independent' | 'all-off' | 'series-dim';

interface ParallelCircuitLabPlayerProps {
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
  2: '连接电源与主干线路',
  3: '完成并联支路',
  4: '观察支路独立性',
  5: '总结并联电路特点',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别电池盒、开关、小灯泡和导线。',
  2: '先连接电源和主干线路，搭建并联电路的骨架。',
  3: '再把两个灯泡分别接入不同支路，形成并联结构。',
  4: '观察断开一条支路后另一条支路是否仍然发光。',
  5: '总结并联电路中各支路相对独立的特点。',
};

const materialLabels: Record<MaterialId, string> = {
  battery: '电池盒',
  switch: '开关',
  'bulb-a': '灯泡 A',
  'bulb-b': '灯泡 B',
  wires: '导线',
};

const materialOrder: MaterialId[] = ['battery', 'switch', 'bulb-a', 'bulb-b', 'wires'];

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

export function ParallelCircuitLabPlayer({ experiment, onTelemetry }: ParallelCircuitLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [mainConnected, setMainConnected] = useState(false);
  const [parallelReady, setParallelReady] = useState(false);
  const [branchMode, setBranchMode] = useState<BranchMode>('normal');
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过两灯并联和支路开断观察并联电路的独立性。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const powerValue = clamp(30 + (mainConnected ? 18 : 0) + (parallelReady ? 28 : 0), 20, 99);
  const branchValue = clamp(24 + (parallelReady ? 22 : 0) + (observationChoice === 'correct' ? 22 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (mainConnected ? 10 : 0) + (parallelReady ? 14 : 0), 20, 100);

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
        setCameraPreset('wiring');
        advanceStep(2, '器材识别完成，先连接主干线路。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleMainConnect = (choice: 'correct' | 'loose') => {
    if (step !== 2 || completed) return;
    if (choice === 'loose') {
      markError('主干线路必须闭合稳定，松散接触会导致电路无法正常工作。');
      return;
    }
    setMainConnected(true);
    appendNote('线路骨架：电池盒、开关和主干导线已连通。');
    advanceStep(3, '主干线路已搭好，下一步完成两个并联支路。');
  };

  const handleBranchConnect = (choice: 'correct' | 'series') => {
    if (step !== 3 || completed) return;
    if (!mainConnected) {
      markError('请先完成主干线路连接，再接支路。');
      return;
    }
    if (choice === 'series') {
      markError('此步需要把两个灯泡分别接入不同支路，而不是串在同一路径上。');
      return;
    }
    setParallelReady(true);
    setBranchMode('normal');
    setCameraPreset('observe');
    appendNote('并联完成：两个灯泡分别位于不同支路，通电后都能正常发光。');
    advanceStep(4, '并联结构已形成，请观察支路是否相互独立。');
  };

  const handleObserve = (choice: 'correct' | 'all-off' | 'series-dim') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!parallelReady) {
      markError('请先完成并联支路连接，再观察支路现象。');
      return;
    }
    if (choice === 'correct') {
      setBranchMode('independent');
      appendNote('实验观察：断开一条支路后，另一条支路上的灯泡仍能继续发光。');
      advanceStep(5, '现象判断正确，最后总结并联电路的特点。');
      return;
    }
    if (choice === 'all-off') {
      setBranchMode('all-off');
      markError('在并联电路中，一条支路断开并不会让另一条支路同时熄灭。');
      return;
    }
    setBranchMode('series-dim');
    markError('“两个灯同时变暗”更像错误连线或串联误判，不符合并联支路独立现象。');
  };

  const handleSummary = (choice: 'correct' | 'must-all-off' | 'single-path') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：并联电路各支路相对独立，一条支路断开时其他支路仍可工作。');
      return;
    }
    if (choice === 'must-all-off') {
      markError('并联电路并不要求一条支路断开时全部都熄灭。');
      return;
    }
    markError('并联电路有多条电流路径，不是只有单一路径。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setMainConnected(false);
    setParallelReady(false);
    setBranchMode('normal');
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新连接并联电路并观察支路现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先连主干，再完成两个支路。', '观察重点是“断开一支路，另一支路仍亮”。', '总结时抓住“多条路径、支路独立”。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对并联线路现象。',
        '建议按“主干连接 → 并联支路 → 观察独立性 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel parallelcircuit-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属物理实验页</h2><p>把电池盒、支路导线、开关和灯丝发光做成更接近实物电学教具的仿真场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>

      <div className="playground-grid parallelcircuit-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'wiring' ? '导线连接' : '发光观察'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>通电完整度 {powerValue}</span><div className="chem-meter-bar"><i style={{ width: `${powerValue}%` }} /></div></div><div className="chem-meter"><span>支路独立性 {branchValue}</span><div className="chem-meter-bar"><i style={{ width: `${branchValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card parallelcircuit-data-card"><span className="eyebrow">Readout</span><h3>电路读数板</h3><div className="generic-readout-grid parallelcircuit-readout-grid"><article className={mainConnected ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>主干线路</span><strong>{mainConnected ? '已连通' : '--'}</strong><small>{mainConnected ? '电池盒与开关主线路已闭合。' : '先完成主干线路连接。'}</small></article><article className={parallelReady ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>并联支路</span><strong>{parallelReady ? '双支路发光' : '--'}</strong><small>{parallelReady ? '两个灯泡位于不同支路并可正常发光。' : '再完成并联支路连接。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '支路相对独立' : '等待总结'}</strong><small>并联电路具有多条电流路径。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '并联电路装置'} · 当前重点：{step <= 2 ? '搭建电路骨架' : step === 3 ? '形成双支路' : '观察支路独立性'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'wiring' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('wiring')} type="button">接线</button><button className={cameraPreset === 'observe' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('observe')} type="button">观察</button></div></div>

          <div className={`scene-canvas parallelcircuit-stage preset-${cameraPreset} ${mainConnected ? 'main-connected' : ''} ${parallelReady ? 'parallel-ready' : ''} mode-${branchMode}`}><div className="parallelcircuit-rig"><div className="pc-board" /><div className={mainConnected ? 'pc-battery active' : 'pc-battery'} /><div className={mainConnected ? 'pc-switch main active' : 'pc-switch main'} /><div className={mainConnected ? 'pc-wire top active' : 'pc-wire top'} /><div className={mainConnected ? 'pc-wire bottom active' : 'pc-wire bottom'} /><div className={parallelReady ? 'pc-wire left active' : 'pc-wire left'} /><div className={parallelReady ? 'pc-wire right active' : 'pc-wire right'} /><div className={branchMode === 'independent' ? 'pc-switch left off' : parallelReady ? 'pc-switch left active' : 'pc-switch left'} /><div className={parallelReady ? 'pc-switch right active' : 'pc-switch right'} /><div className={parallelReady ? 'pc-bulb left active' : 'pc-bulb left'} /><div className={parallelReady ? 'pc-bulb right active' : 'pc-bulb right'} /></div></div>

          <div className="observation-ribbon parallelcircuit-observation-row"><article className={mainConnected ? 'observation-chip active' : 'observation-chip calm'}><strong>主干状态</strong><span>{mainConnected ? '主干线路已闭合。' : '先完成主干线路连接。'}</span></article><article className={parallelReady ? 'observation-chip active' : 'observation-chip calm'}><strong>支路状态</strong><span>{parallelReady ? '双支路都已通电。' : '等待完成并联支路。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>独立性判断</strong><span>{observationChoice === 'correct' ? '已判断一支路断开时另一支路仍亮。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleMainConnect('correct')} type="button"><strong>连接电池盒、开关和主干线路</strong><span>搭建并联电路骨架。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleMainConnect('loose')} type="button"><strong>让主干线路接触松散</strong><span>错误演示：会导致无法稳定通电。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleBranchConnect('correct')} type="button"><strong>把两个灯泡分别接入不同支路</strong><span>形成标准并联结构。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleBranchConnect('series')} type="button"><strong>把两个灯泡串在同一路径上</strong><span>错误演示：这不是并联。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“断开一条支路后，另一条支路上的灯泡仍能发光”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('all-off')} type="button"><strong>记录“断开一条支路后，两灯都会熄灭”</strong><span>错误演示：把并联当成串联。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('series-dim')} type="button"><strong>记录“断开一条支路后，两灯都会一起变暗”</strong><span>错误演示：与并联支路独立性不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>并联电路各支路相对独立，一条支路断开时其他支路仍可工作</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('must-all-off')} type="button"><strong>并联电路中一条支路断开时全电路必须同时熄灭</strong><span>错误演示：与实验现象矛盾。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('single-path')} type="button"><strong>并联电路只有一条电流路径</strong><span>错误演示：概念错误。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{mainConnected ? '主干已连' : '主干待连'} / {parallelReady ? '并联已成' : '并联待成'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意把灯泡分别接入不同支路'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“并联电路特点”升级成双支路发光和断路观察的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
