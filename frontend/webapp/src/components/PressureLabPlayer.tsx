import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5 | 6;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'tank' | 'probe' | 'gauge';
type MaterialId = 'water-tank' | 'pressure-probe' | 'u-gauge' | 'depth-scale';
type DepthId = 'shallow' | 'middle' | 'deep';
type TimelineState = 'done' | 'current' | 'todo';

interface PressureLabPlayerProps {
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
  2: '放置压强探头',
  3: '改变深度',
  4: '切换读数视角',
  5: '记录读数变化',
  6: '总结液体压强规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别液体容器、压强探头、U 形压强计和深度刻度尺。',
  2: '把压强探头稳定放入液体中，准备比较不同深度。',
  3: '依次比较浅层、标准深度和深层位置的读数差异。',
  4: '切换到压强计视角，重点观察液面高度差。',
  5: '根据读数变化记录液体压强大小规律。',
  6: '把深度变化和压强大小规律联系起来完成总结。',
};

const materialLabels: Record<MaterialId, string> = {
  'water-tank': '液体容器',
  'pressure-probe': '压强探头',
  'u-gauge': 'U 形压强计',
  'depth-scale': '深度刻度尺',
};

const materialOrder: MaterialId[] = ['water-tank', 'pressure-probe', 'u-gauge', 'depth-scale'];
const depthLabels: Record<DepthId, string> = {
  shallow: '浅层',
  middle: '标准深度',
  deep: '深层',
};
const gaugeDelta: Record<DepthId, number> = {
  shallow: 16,
  middle: 34,
  deep: 58,
};

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

export function PressureLabPlayer({ experiment, onTelemetry }: PressureLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [probePlaced, setProbePlaced] = useState(false);
  const [selectedDepth, setSelectedDepth] = useState<DepthId>('middle');
  const [comparedDepths, setComparedDepths] = useState<DepthId[]>([]);
  const [gaugeView, setGaugeView] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('tank');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先放稳探头，再比较不同深度的压强计读数。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const comparedCount = comparedDepths.length;
  const deltaValue = gaugeDelta[selectedDepth];
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 6) * 100);
  const stabilityValue = clamp(94 - errors * 6 + (probePlaced ? 6 : 0), 48, 99);
  const compareValue = clamp(42 + comparedCount * 16 + (gaugeView ? 14 : 0), 28, 99);
  const readinessValue = clamp(progressPercent + comparedCount * 10 + (gaugeView ? 10 : 0), 20, 100);

  const { reportReset } = useLabTelemetryReporter({
    experiment,
    step,
    totalSteps: 6,
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
      appendNote(`器材识别：${materialLabels[materialId]}`);
      if (next.length === materialOrder.length) {
        setCameraPreset('probe');
        advanceStep(2, '器材识别完成，下一步把压强探头稳定放入液体中。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleProbe = (choice: 'stable' | 'tilted') => {
    if (step !== 2 || completed) return;
    if (choice === 'tilted') {
      markError('探头要保持稳定，才能获得可靠读数。');
      return;
    }
    setProbePlaced(true);
    appendNote('装置准备：压强探头已稳定放入液体中。');
    advanceStep(3, '探头放置完成，下一步比较不同深度的读数。');
  };

  const handleDepth = (depth: DepthId) => {
    if (step !== 3 || completed) return;
    if (!probePlaced) {
      markError('请先稳定放置压强探头，再改变深度。');
      return;
    }
    setSelectedDepth(depth);
    setComparedDepths((current) => {
      const next = current.includes(depth) ? current : [...current, depth];
      appendNote(`深度比较：已观察${depthLabels[depth]}的压强计变化。`);
      if (next.length === 3) {
        setCameraPreset('gauge');
        advanceStep(4, '三种深度已比较完成，下一步切到压强计读数视角。');
      } else {
        setPromptTone('success');
        setPrompt(`已比较 ${next.length}/3 个深度，请继续。`);
      }
      return next;
    });
  };

  const handleGaugeView = (choice: 'switch' | 'skip') => {
    if (step !== 4 || completed) return;
    if (comparedCount < 3) {
      markError('请先比较多个深度，再切换到读数视角。');
      return;
    }
    if (choice === 'skip') {
      markError('需要先切换到便于读数的视角，再观察液面高度差。');
      return;
    }
    setGaugeView(true);
    appendNote('读数观察：已切换到 U 形压强计视角。');
    advanceStep(5, '视角切换完成，下一步记录不同深度下的读数变化。');
  };

  const handleRecord = (choice: 'correct' | 'same' | 'reverse') => {
    if (step !== 5 || completed) return;
    if (!gaugeView) {
      markError('请先切换到压强计读数视角。');
      return;
    }
    if (choice === 'correct') {
      appendNote('结果记录：深度越大，液面高度差越明显。');
      advanceStep(6, '记录完成，下一步总结液体压强与深度的关系。');
      return;
    }
    if (choice === 'same') {
      markError('不同深度的读数并不相同，深层位置的液面高度差更大。');
      return;
    }
    markError('读数趋势不能记反，液体压强会随深度增大而增大。');
  };

  const handleSummary = (choice: 'correct' | 'surface' | 'direction') => {
    if (step !== 6 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：在同种液体中，深度越大，液体压强越大。');
      return;
    }
    if (choice === 'surface') {
      markError('液体压强不是越靠近液面越大，而是深度越大越大。');
      return;
    }
    markError('此实验核心是比较深度与压强大小关系，不是探头朝向决定大小规律。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setProbePlaced(false);
    setSelectedDepth('middle');
    setComparedDepths([]);
    setGaugeView(false);
    setSummaryChoice('');
    setCameraPreset('tank');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先放稳探头，再比较不同深度的压强计读数。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '压强探头要放稳，避免读数波动。',
        '至少比较浅层、标准深度和深层三组数据。',
        '先看压强计液面高度差，再总结大小规律。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对读数趋势。',
        '建议重新完成深度比较，再记录液面高度差变化。',
      ];

  return (
    <section className="panel playground-panel pressure-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把“探头位置—深度比较—U 形压强计读数”串成完整链路，让压强规律更直观、更可验证。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 6</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid pressure-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'tank' ? '水槽总览' : cameraPreset === 'probe' ? '探头视角' : '压强计视角'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>稳定值 {stabilityValue}</span><div className="chem-meter-bar"><i style={{ width: `${stabilityValue}%` }} /></div></div><div className="chem-meter"><span>比较度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card pressure-data-card"><span className="eyebrow">Readout</span><h3>读数结果板</h3><div className="pressure-data-grid"><div className="pressure-data-item"><span>当前深度</span><strong>{depthLabels[selectedDepth]}</strong><small>已比较 {comparedCount}/3 个深度。</small></div><div className="pressure-data-item"><span>液面高度差</span><strong>{deltaValue} mm</strong><small>{selectedDepth === 'deep' ? '深层位置差值更大。' : '继续比较更深位置。'}</small></div></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '压强装置'} · 当前重点：{step === 2 ? '探头稳定' : step === 3 ? '深度对比' : step === 4 ? '读数视角' : step >= 5 ? '读数规律' : '器材识别'}</small></div><div className="camera-actions"><button className={cameraPreset === 'tank' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tank')} type="button">水槽</button><button className={cameraPreset === 'probe' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('probe')} type="button">探头</button><button className={cameraPreset === 'gauge' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('gauge')} type="button">压强计</button></div></div>

          <div className={`scene-canvas pressure-stage preset-${cameraPreset}`}>
            <div className="pressure-stage-head"><div><span className="eyebrow">Live Physics</span><h3>{experiment.curriculum.theme}</h3><p>{promptTone === 'error' ? '当前装置或读数判断有偏差，请先回到现象重新核对。' : '重现液体压强实验的关键观察点：深度变化越明显，压强计液面高度差越明显。'}</p></div><div className="status-pill-row"><span className="status-pill ready">进度 {progressPercent}%</span><span className="status-pill">视角 {gaugeView ? '已切到读数位' : '待切换'}</span></div></div>
            <div className="pressure-stage-grid">
              <article className={probePlaced ? 'pressure-card active' : 'pressure-card'}><div className="reaction-card-head"><strong>液体容器</strong><small>{probePlaced ? '探头已放稳' : '等待放置'}</small></div><div className="pressure-tank"><div className="pressure-water" /><div className={`pressure-probe ${selectedDepth} ${probePlaced ? 'active' : ''}`} /><div className="pressure-scale"><span>浅</span><span>中</span><span>深</span></div></div></article>
              <article className={gaugeView ? 'pressure-card active' : 'pressure-card'}><div className="reaction-card-head"><strong>U 形压强计</strong><small>{gaugeView ? '读数视角已打开' : '等待切换'}</small></div><div className="gauge-rig"><div className="gauge-column left"><i style={{ height: `${48 + deltaValue / 2}%` }} /></div><div className="gauge-column right"><i style={{ height: `${48 - deltaValue / 3}%` }} /></div><div className="gauge-bridge" /></div></article>
            </div>
            <div className="pressure-insight-row"><article className="lab-readout-card active"><span>装置状态</span><strong>{probePlaced ? '探头稳定' : '待放置'}</strong><small>探头不稳定会导致读数不可靠。</small></article><article className="lab-readout-card calm"><span>深度比较</span><strong>{comparedCount === 3 ? '三组深度已比较' : `已比较 ${comparedCount}/3`}</strong><small>需要多个深度数据，才能看出大小规律。</small></article><article className={gaugeView ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>核心规律</span><strong>{selectedDepth === 'deep' ? '深度越大，读数差越大' : '继续向更深处比较'}</strong><small>同种液体中，深度越大，液体压强越大。</small></article></div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleProbe('stable')} type="button"><strong>稳定放置压强探头</strong><span>为后续读数比较做好准备。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleProbe('tilted')} type="button"><strong>倾斜插入探头</strong><span>错误演示：读数不稳定。</span></button></> : null}{step === 3 ? (['shallow', 'middle', 'deep'] as DepthId[]).map((depth) => (<button className={selectedDepth === depth ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} key={depth} onClick={() => handleDepth(depth)} type="button"><strong>比较{depthLabels[depth]}</strong><span>{comparedDepths.includes(depth) ? '已完成该深度比较' : '观察液面高度差变化'}</span></button>)) : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleGaugeView('switch')} type="button"><strong>切换到压强计读数视角</strong><span>更清楚观察液面高度差。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleGaugeView('skip')} type="button"><strong>不看读数直接记录</strong><span>错误演示：缺少关键观察。</span></button></> : null}{step === 5 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button"><strong>记录“深度越大，液面高度差越大”</strong><span>这是本实验的正确读数规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleRecord('same')} type="button"><strong>记录“各深度都一样”</strong><span>错误演示：忽略比较结果。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRecord('reverse')} type="button"><strong>记录“越深读数越小”</strong><span>错误演示：把趋势写反。</span></button></> : null}{step === 6 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>在同种液体中，深度越大，液体压强越大</strong><span>把读数变化和规律准确对应起来。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('surface')} type="button"><strong>越靠近液面，液体压强越大</strong><span>错误演示：与读数结果不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('direction')} type="button"><strong>液体压强主要由探头朝向决定</strong><span>错误演示：偏离本实验变量。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{probePlaced ? '探头已放稳' : '待放置'} / 已比较 {comparedCount}/3</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意读数观察'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“液体压强大小规律”升级成探头放置、深度比较和读数分析一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
