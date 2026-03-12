import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'strip' | 'transfer';
type MaterialId = 'cup' | 'colored-water' | 'paper-strip' | 'tray' | 'clip';
type TimelineState = 'done' | 'current' | 'todo';

interface CapillaryActionLabPlayerProps {
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
  2: '加入有色水',
  3: '搭放纸条',
  4: '观察爬升转移',
  5: '总结毛细现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别烧杯、有色水、纸条、托盘和夹子。',
  2: '先在左侧烧杯加入有色水。',
  3: '把纸条一端浸入有色水，另一端搭向空杯。',
  4: '观察有色水沿纸条上升并逐渐转移。',
  5: '总结细小空隙中的液体会发生毛细现象。',
};

const materialLabels: Record<MaterialId, string> = {
  cup: '烧杯',
  'colored-water': '有色水',
  'paper-strip': '纸条',
  tray: '托盘',
  clip: '夹子',
};

const materialOrder: MaterialId[] = ['cup', 'colored-water', 'paper-strip', 'tray', 'clip'];

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

export function CapillaryActionLabPlayer({ experiment, onTelemetry }: CapillaryActionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [waterFilled, setWaterFilled] = useState(false);
  const [stripPlaced, setStripPlaced] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过有色水沿纸条上升与转移观察毛细现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const transferValue = clamp(28 + (waterFilled ? 18 : 0) + (stripPlaced ? 24 : 0), 20, 99);
  const capillaryValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (waterFilled ? 10 : 0) + (stripPlaced ? 14 : 0), 20, 100);

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
        setCameraPreset('strip');
        advanceStep(2, '器材识别完成，先向左侧烧杯加入有色水。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleFillWater = (choice: 'correct' | 'empty') => {
    if (step !== 2 || completed) return;
    if (choice === 'empty') {
      markError('需要先加入有色水，后续才能观察上升和转移。');
      return;
    }
    setWaterFilled(true);
    appendNote('液体状态：左侧烧杯已装入红色有色水。');
    advanceStep(3, '有色水已准备好，下一步搭放纸条。');
  };

  const handlePlaceStrip = (choice: 'correct' | 'short') => {
    if (step !== 3 || completed) return;
    if (!waterFilled) {
      markError('请先加入有色水，再搭放纸条。');
      return;
    }
    if (choice === 'short') {
      markError('纸条要同时连接有色水杯和空杯，过短无法完成转移。');
      return;
    }
    setStripPlaced(true);
    setCameraPreset('transfer');
    appendNote('装置状态：纸条已搭在两只烧杯之间，一端浸入有色水。');
    advanceStep(4, '装置已搭好，请观察有色水沿纸条爬升。');
  };

  const handleObserve = (choice: 'correct' | 'drop' | 'stop') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!waterFilled || !stripPlaced) {
      markError('请先准备有色水并搭放纸条。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：有色水沿纸条向上爬升，并逐渐向另一只烧杯转移。');
      advanceStep(5, '现象已观察到，下一步总结毛细现象。');
      return;
    }
    markError(choice === 'drop' ? '有色水不是只向下滴落，而是会沿纸条细小孔隙向上爬升。' : '纸条连接后液体不会完全停止不动，毛细作用会推动其迁移。');
  };

  const handleSummary = (choice: 'correct' | 'gravity' | 'no-gap') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：液体在细小空隙中会沿着缝隙上升，这是一种毛细现象。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'gravity' ? '本实验不仅仅是重力作用，关键在于液体沿细小孔隙上升。' : '纸条内部并不是没有空隙，正是这些细小空隙让毛细现象发生。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setWaterFilled(false);
    setStripPlaced(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察毛细现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先向左杯加入有色水，再搭放纸条。', '观察时重点看纸条中的液面上升。', '结论关键词是“细小孔隙”“液体上升”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对纸条是否跨接两只烧杯。',
        '建议按“识别 → 加有色水 → 搭纸条 → 观察爬升 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel capillary-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属科学实验页</h2><p>把双烧杯、纸条导水和彩色液面爬升做成更接近真实演示的毛细现象场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid capillary-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'strip' ? '纸条近景' : '转移近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>迁移建立 {transferValue}</span><div className="chem-meter-bar"><i style={{ width: `${transferValue}%` }} /></div></div><div className="chem-meter"><span>毛细清晰度 {capillaryValue}</span><div className="chem-meter-bar"><i style={{ width: `${capillaryValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card capillary-data-card"><span className="eyebrow">Readout</span><h3>毛细读数板</h3><div className="generic-readout-grid capillary-readout-grid"><article className={waterFilled ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>有色水</span><strong>{waterFilled ? '左杯已加液' : '--'}</strong><small>{waterFilled ? '红色液面已建立。' : '先向左杯加液。'}</small></article><article className={stripPlaced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>纸条连接</span><strong>{stripPlaced ? '已跨接双杯' : '--'}</strong><small>{stripPlaced ? '液体可沿纸条转移。' : '等待搭放纸条。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '液体沿细缝上升' : '等待总结'}</strong><small>纸条中的细小空隙可以让液体发生毛细现象。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '毛细现象装置'} · 当前重点：{step <= 2 ? '建立液体来源' : step === 3 ? '搭放导水纸条' : '观察液面上升与转移'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'strip' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('strip')} type="button">纸条</button><button className={cameraPreset === 'transfer' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('transfer')} type="button">转移</button></div></div><div className={`scene-canvas capillary-stage preset-${cameraPreset} ${waterFilled ? 'water-filled' : ''} ${stripPlaced ? 'strip-placed' : ''}`}><div className="capillary-rig"><div className="cp-tray" /><div className="cp-cup left"><div className={waterFilled ? 'cp-liquid left active' : 'cp-liquid left'} /></div><div className="cp-cup right"><div className={stripPlaced ? 'cp-liquid right active' : 'cp-liquid right'} /></div><div className={stripPlaced ? 'cp-strip active' : 'cp-strip'} /><div className={stripPlaced ? 'cp-strip-flow active' : 'cp-strip-flow'} /></div></div><div className="observation-ribbon capillary-observation-row"><article className={waterFilled ? 'observation-chip active' : 'observation-chip calm'}><strong>左杯液体</strong><span>{waterFilled ? '有色水已加入。' : '等待加入有色水。'}</span></article><article className={stripPlaced ? 'observation-chip active' : 'observation-chip calm'}><strong>纸条连接</strong><span>{stripPlaced ? '纸条已跨接两杯。' : '等待搭放纸条。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>液体爬升</strong><span>{observationChoice === 'correct' ? '已观察到沿纸条上升。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFillWater('correct')} type="button"><strong>向左侧烧杯加入有色水</strong><span>建立液体来源。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFillWater('empty')} type="button"><strong>保持两个烧杯都是空的</strong><span>错误演示：无法观察液体转移。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePlaceStrip('correct')} type="button"><strong>把纸条一端放入左杯，另一端搭向右杯</strong><span>形成导水通路。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePlaceStrip('short')} type="button"><strong>使用过短纸条，只够碰到左杯</strong><span>错误演示：不能完成转移。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“有色水沿纸条上升，并逐渐向右侧烧杯转移”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('drop')} type="button"><strong>记录“液体只会向下滴落，不会向上爬升”</strong><span>错误演示：忽略毛细作用。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('stop')} type="button"><strong>记录“纸条连接后液体仍完全不动”</strong><span>错误演示：与实验现象不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>液体在细小空隙中会沿缝隙上升，这是一种毛细现象</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('gravity')} type="button"><strong>液体转移只和重力有关，与纸条细缝无关</strong><span>错误演示：忽略毛细作用。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-gap')} type="button"><strong>纸条内部没有细小空隙，所以不会影响液体运动</strong><span>错误演示：原理错误。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{waterFilled ? '左杯已加液' : '左杯待加液'} / {stripPlaced ? '纸条已搭好' : '纸条待搭好'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意纸条需要同时接触两只烧杯'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“毛细现象”升级成双杯导水的专属页。</small></section></aside>
      </div>
    </section>
  );
}
