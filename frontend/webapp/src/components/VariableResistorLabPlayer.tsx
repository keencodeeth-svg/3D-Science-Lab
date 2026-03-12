import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'circuit' | 'meter';
type MaterialId = 'battery-pack' | 'bulb' | 'slider-resistor' | 'ammeter' | 'switch';
type SliderId = 'high' | 'mid' | 'low';
type TimelineState = 'done' | 'current' | 'todo';

interface VariableResistorLabPlayerProps {
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
  2: '连接电路',
  3: '移动滑片',
  4: '比较亮度和电流',
  5: '总结变阻作用',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别电池盒、小灯泡、滑动变阻器、电流表和开关。',
  2: '先连接完整电路，保证灯泡和电流表都工作。',
  3: '移动变阻器滑片，改变接入电阻大小。',
  4: '比较灯泡亮度和电流表读数的变化。',
  5: '总结滑动变阻器在电路中的作用。',
};

const materialLabels: Record<MaterialId, string> = {
  'battery-pack': '电池盒',
  bulb: '小灯泡',
  'slider-resistor': '滑动变阻器',
  ammeter: '电流表',
  switch: '开关',
};

const materialOrder: MaterialId[] = ['battery-pack', 'bulb', 'slider-resistor', 'ammeter', 'switch'];
const currentMap: Record<SliderId, number> = { high: 0.18, mid: 0.32, low: 0.48 };
const brightnessMap: Record<SliderId, string> = { high: '较暗', mid: '适中', low: '较亮' };

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

export function VariableResistorLabPlayer({ experiment, onTelemetry }: VariableResistorLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [connected, setConnected] = useState(false);
  const [slider, setSlider] = useState<SliderId | null>(null);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先接好电路，再通过滑片调节灯泡亮度。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const currentValue = slider ? currentMap[slider] : 0;
  const brightness = slider ? brightnessMap[slider] : '待调节';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const circuitValue = clamp(42 + (connected ? 18 : 0) + (slider ? 18 : 0) + (observationChoice === 'correct' ? 16 : 0), 24, 99);
  const clarityValue = clamp(42 + (connected ? 10 : 0) + (slider ? 14 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (connected ? 14 : 0) + (slider ? 16 : 0), 20, 100);

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
        setCameraPreset('circuit');
        advanceStep(2, '器材识别完成，先连接电路。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleConnect = (choice: 'correct' | 'broken') => {
    if (step !== 2 || completed) return;
    if (choice === 'broken') {
      markError('电路必须完整闭合，灯泡和电流表才能正常工作。');
      return;
    }
    setConnected(true);
    appendNote('连接记录：电池、灯泡、电流表和滑动变阻器已形成完整电路。');
    advanceStep(3, '电路已接通，下一步移动滑片调节电阻。');
  };

  const handleSlider = (choice: SliderId) => {
    if (step !== 3 || completed) return;
    if (!connected) {
      markError('请先连接完整电路。');
      return;
    }
    setSlider(choice);
    setCameraPreset('meter');
    appendNote(`滑片调节：当前接入电阻为${choice === 'high' ? '较大' : choice === 'mid' ? '中等' : '较小'}，灯泡${brightnessMap[choice]}。`);
    advanceStep(4, '滑片已调节，开始比较亮度和电流变化。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'reverse') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!slider) {
      markError('请先移动滑片，再比较结果。');
      return;
    }
    if (choice === 'correct') {
      appendNote(`结果记录：接入电阻减小时，电流约 ${currentValue.toFixed(2)} A，灯泡会更亮。`);
      advanceStep(5, '现象比较完成，最后总结滑动变阻器的作用。');
      return;
    }
    if (choice === 'same') {
      markError('滑片位置变化后，亮度和电流不会完全不变。');
      return;
    }
    markError('结果不能记反，接入电阻减小时，灯泡通常更亮。');
  };

  const handleSummary = (choice: 'correct' | 'fixed-only' | 'no-current-change') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：滑动变阻器可通过改变接入电阻来调节电流大小和灯泡亮度。');
      return;
    }
    if (choice === 'fixed-only') {
      markError('滑动变阻器不是固定电阻，它的关键就是可调。');
      return;
    }
    markError('滑片位置变化会改变接入电阻，从而影响电流和亮度。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setConnected(false);
    setSlider(null);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新连接电路并调节滑片比较亮度。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先接完整电路，再移动滑片。',
        '重点比较灯泡亮度和电流表读数同步变化。',
        '总结时记住变阻器的核心作用是“改变接入电阻”。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对电流变化。',
        '建议重新执行“连接电路 → 移动滑片 → 比较亮度”的流程。',
      ];

  return (
    <section className="panel playground-panel variableresistor-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把滑片位置、灯泡亮度和电流读数联动起来，让“滑动变阻器怎么调、为什么变亮”一眼就能看懂。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid variableresistor-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'circuit' ? '电路观察' : '读数观察'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>电路值 {circuitValue}</span><div className="chem-meter-bar"><i style={{ width: `${circuitValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card variableresistor-data-card"><span className="eyebrow">Readout</span><h3>变阻读数板</h3><div className="generic-readout-grid variableresistor-readout-grid"><article className={connected ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>电路状态</span><strong>{connected ? '已闭合' : '待连接'}</strong><small>{connected ? '灯泡和电流表已经可工作。' : '先连接完整电路。'}</small></article><article className={slider ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>当前电流</span><strong>{slider ? `${currentValue.toFixed(2)} A` : '--'}</strong><small>{slider ? `滑片调节后灯泡${brightness}。` : '移动滑片后再观察读数。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心作用</span><strong>{summaryChoice === 'correct' ? '调节电流与亮度' : '等待总结'}</strong><small>改变接入电阻大小，会同步影响电流表读数和灯泡亮度。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '变阻电路'} · 当前重点：{step <= 2 ? '连接电路' : step === 3 ? '移动滑片' : '比较亮度和电流'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'circuit' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('circuit')} type="button">电路</button><button className={cameraPreset === 'meter' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('meter')} type="button">读数</button></div></div>

          <div className={`scene-canvas variableresistor-stage preset-${cameraPreset} ${connected ? 'connected' : ''} ${slider ?? 'none'}`}>
            <div className="variableresistor-rig">
              <div className="vr-battery" />
              <div className={`vr-bulb ${slider ? slider : ''} ${connected ? 'active' : ''}`}>
                <div className="bulb-glass" />
                <div className="bulb-base" />
                <div className="bulb-filament" />
                <div className="bulb-glow" />
              </div>
              <div className="vr-ammeter">
                <div className="meter-dial" />
                <div className="vr-needle" style={{ transform: `translateX(-50%) rotate(${slider ? 12 + currentValue * 90 : 0}deg)` }} />
                <div className="meter-pivot" />
              </div>
              <div className={`vr-resistor ${slider ?? 'high'}`}>
                <div className="vr-track" />
                <div className={`vr-slider ${slider ?? 'high'}`} />
              </div>
              <div className="vr-wire left" />
              <div className="vr-wire right" />
            </div>
          </div>

          <div className="observation-ribbon variableresistor-observation-row"><article className={connected ? 'observation-chip active' : 'observation-chip calm'}><strong>电路连接</strong><span>{connected ? '完整电路已建立。' : '先连接电路。'}</span></article><article className={slider ? 'observation-chip active' : 'observation-chip calm'}><strong>滑片位置</strong><span>{slider ? `当前接入电阻${slider === 'high' ? '较大' : slider === 'mid' ? '中等' : '较小'}。` : '等待调节滑片。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>联动变化</strong><span>{observationChoice === 'correct' ? '亮度和电流已随滑片同步变化。' : '等待完成正确比较。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleConnect('correct')} type="button"><strong>连接完整电路</strong><span>让灯泡和电流表都参与工作。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleConnect('broken')} type="button"><strong>保留一处断路</strong><span>错误演示：电路不会正常工作。</span></button></> : null}{step === 3 ? (['high', 'mid', 'low'] as SliderId[]).map((item) => (<button className={slider === item ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} key={item} onClick={() => handleSlider(item)} type="button"><strong>调到{item === 'high' ? '大电阻' : item === 'mid' ? '中电阻' : '小电阻'}</strong><span>{item === 'high' ? '灯泡较暗，适合保护起始电路。' : item === 'mid' ? '亮度和电流适中。' : '灯泡更亮，电流更大。'}</span></button>)) : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“接入电阻减小时，电流增大，灯泡更亮”</strong><span>这是本实验的正确联动关系。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“滑片位置变化但亮度不变”</strong><span>错误演示：忽略读数变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('reverse')} type="button"><strong>记录“电阻减小时灯泡更暗”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>滑动变阻器通过改变接入电阻来调节电流和灯泡亮度</strong><span>完整总结本实验作用。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('fixed-only')} type="button"><strong>滑动变阻器只是一个固定电阻</strong><span>错误演示：忽略其可调特性。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-current-change')} type="button"><strong>移动滑片不会影响电流</strong><span>错误演示：与实验现象不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{connected ? '电路已连接' : '待连接电路'} / {slider ? `当前 ${brightness}` : '待调滑片'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先连接再调节'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“滑动变阻器”升级成滑片、亮度和电流联动的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
