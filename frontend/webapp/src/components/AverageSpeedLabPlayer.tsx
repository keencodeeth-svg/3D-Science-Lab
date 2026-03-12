import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'track' | 'timer';
type MaterialId = 'track' | 'cart' | 'timer' | 'ruler' | 'marker';
type TimelineState = 'done' | 'current' | 'todo';

interface AverageSpeedLabPlayerProps {
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
  2: '设定路程',
  3: '释放小车并记录时间',
  4: '比较路程和时间',
  5: '总结平均速度公式',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别轨道、小车、电子计时器、刻度尺和起终点标记。',
  2: '先把实验路程设定为 1.0 m，形成清晰的测量范围。',
  3: '释放小车通过全程，并记录所用时间。',
  4: '根据 1.0 m 路程和计时器示数判断平均速度。',
  5: '总结平均速度等于路程除以时间。',
};

const materialLabels: Record<MaterialId, string> = {
  track: '轨道',
  cart: '小车',
  timer: '电子计时器',
  ruler: '刻度尺',
  marker: '起终点标记',
};

const materialOrder: MaterialId[] = ['track', 'cart', 'timer', 'ruler', 'marker'];

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

export function AverageSpeedLabPlayer({ experiment, onTelemetry }: AverageSpeedLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [distanceSet, setDistanceSet] = useState(false);
  const [released, setReleased] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过小车走过固定路程所用时间来测量平均速度。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const speedValue = clamp(28 + (distanceSet ? 18 : 0) + (released ? 30 : 0), 20, 98);
  const precisionValue = clamp(34 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 18 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (distanceSet ? 10 : 0) + (released ? 14 : 0), 20, 100);

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
        setCameraPreset('track');
        advanceStep(2, '器材识别完成，下一步设定 1.0 m 测量路程。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleSetDistance = (choice: 'correct' | 'guess') => {
    if (step !== 2 || completed) return;
    if (choice === 'guess') {
      markError('测平均速度必须先明确路程，不能凭感觉估计。');
      return;
    }
    setDistanceSet(true);
    appendNote('测量准备：起终点标记已设置为 1.0 m，路程清晰可读。');
    advanceStep(3, '路程已设定，下一步释放小车并读取计时器。');
  };

  const handleRelease = (choice: 'correct' | 'push') => {
    if (step !== 3 || completed) return;
    if (!distanceSet) {
      markError('请先设定固定路程，再释放小车测时。');
      return;
    }
    if (choice === 'push') {
      markError('应让小车自然通过测量路程，不要额外猛推导致数据失真。');
      return;
    }
    setReleased(true);
    setCameraPreset('timer');
    appendNote('数据记录：小车通过 1.0 m 路程约用了 2.0 s。');
    advanceStep(4, '时间数据已记录，请根据路程和时间判断平均速度。');
  };

  const handleObserve = (choice: 'correct' | 'distance-only' | 'wrong-value') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!released) {
      markError('请先完成小车运动测时，再进行速度判断。');
      return;
    }
    if (choice === 'correct') {
      appendNote('结果分析：1.0 m ÷ 2.0 s = 0.5 m/s，小车平均速度为 0.5 m/s。');
      advanceStep(5, '现象判断正确，最后总结平均速度公式。');
      return;
    }
    if (choice === 'distance-only') {
      markError('平均速度不能只看路程，还必须结合时间。');
      return;
    }
    markError('根据当前数据计算结果应为 0.5 m/s，不是其他数值。');
  };

  const handleSummary = (choice: 'correct' | 'multiply' | 'distance-only') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：平均速度等于路程除以时间，公式 v = s / t。');
      return;
    }
    if (choice === 'multiply') {
      markError('平均速度不是路程乘时间，而是路程除以时间。');
      return;
    }
    markError('速度公式不能只用路程，必须同时考虑时间。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setDistanceSet(false);
    setReleased(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新测量小车平均速度。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先明确 1.0 m 路程，再开始测时。', '重点读数是“1.0 m 和 2.0 s”。', '总结时牢牢记住 v = s / t。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对路程与时间。',
        '建议按“设定路程 → 释放小车 → 读秒 → 计算 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel averagespeed-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属物理实验页</h2><p>把轨道刻度、小车位移和电子计时器读数做成同步场景，让测量平均速度更像真实实验课。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>

      <div className="playground-grid averagespeed-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'track' ? '轨道路程' : '计时器读数'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>速度进度 {speedValue}</span><div className="chem-meter-bar"><i style={{ width: `${speedValue}%` }} /></div></div><div className="chem-meter"><span>测量精度 {precisionValue}</span><div className="chem-meter-bar"><i style={{ width: `${precisionValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card averagespeed-data-card"><span className="eyebrow">Readout</span><h3>测量读数板</h3><div className="generic-readout-grid averagespeed-readout-grid"><article className={distanceSet ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>路程设置</span><strong>{distanceSet ? '1.0 m' : '--'}</strong><small>{distanceSet ? '起终点标记已经对齐 1.0 m。' : '先设定固定测量路程。'}</small></article><article className={released ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>时间读数</span><strong>{released ? '2.0 s' : '--'}</strong><small>{released ? '小车通过全程所用时间已记录。' : '再释放小车并读取时间。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? 'v = s / t' : '等待总结'}</strong><small>当前数据对应平均速度为 0.5 m/s。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '平均速度实验装置'} · 当前重点：{step <= 2 ? '设定固定路程' : step === 3 ? '同步读秒' : '计算平均速度'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'track' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('track')} type="button">轨道</button><button className={cameraPreset === 'timer' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('timer')} type="button">计时</button></div></div>

          <div className={`scene-canvas averagespeed-stage preset-${cameraPreset} ${distanceSet ? 'distance-set' : ''} ${released ? 'released' : ''}`}><div className="averagespeed-rig"><div className="as-track" /><div className="as-ruler" /><div className={distanceSet ? 'as-marker start active' : 'as-marker start'} /><div className={distanceSet ? 'as-marker end active' : 'as-marker end'} /><div className={released ? 'as-cart active run' : 'as-cart active'} /><div className="as-timer"><div className="as-display">{released ? '2.0 s' : '0.0 s'}</div></div></div></div>

          <div className="observation-ribbon averagespeed-observation-row"><article className={distanceSet ? 'observation-chip active' : 'observation-chip calm'}><strong>路程范围</strong><span>{distanceSet ? '固定路程已设为 1.0 m。' : '先设定测量路程。'}</span></article><article className={released ? 'observation-chip active' : 'observation-chip calm'}><strong>计时状态</strong><span>{released ? '小车通过全程时间已记录。' : '等待释放小车并读秒。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>速度判断</strong><span>{observationChoice === 'correct' ? '已计算平均速度为 0.5 m/s。' : '等待完成速度判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleSetDistance('correct')} type="button"><strong>用刻度尺和标记设定 1.0 m 路程</strong><span>形成可计算的固定测量范围。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSetDistance('guess')} type="button"><strong>不测量路程，直接凭感觉开始</strong><span>错误演示：缺少关键数据。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRelease('correct')} type="button"><strong>释放小车并读取 2.0 s</strong><span>得到完整路程-时间数据。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRelease('push')} type="button"><strong>猛推小车快速冲过轨道</strong><span>错误演示：会干扰测量结果。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“1.0 m ÷ 2.0 s = 0.5 m/s”</strong><span>这是本实验的正确结果。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('distance-only')} type="button"><strong>只根据 1.0 m 路程直接判断快慢</strong><span>错误演示：忽略时间因素。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('wrong-value')} type="button"><strong>记录“平均速度是 2.0 m/s”</strong><span>错误演示：数值计算错误。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>平均速度等于路程除以时间，公式 v = s / t</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('multiply')} type="button"><strong>速度等于路程乘时间</strong><span>错误演示：公式错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('distance-only')} type="button"><strong>速度只和路程有关，和时间无关</strong><span>错误演示：概念不完整。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{distanceSet ? '路程已设' : '待设路程'} / {released ? '已测时' : '待测时'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先固定路程，再同步读秒'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“测量小车平均速度”升级成轨道位移与电子计时同步的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
