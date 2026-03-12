import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'stem' | 'leaf';
type MaterialId = 'beaker' | 'red-water' | 'stem' | 'leaf-vein' | 'blade';
type TimelineState = 'done' | 'current' | 'todo';

interface StemTransportLabPlayerProps {
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
  2: '插入有色水',
  3: '观察茎叶染色',
  4: '判断运输路径',
  5: '总结运输作用',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别烧杯、红色有色水、植物茎段、叶脉和刀片。',
  2: '把植物茎段插入红色有色水中。',
  3: '观察茎和叶脉中是否逐渐出现红色运输痕迹。',
  4: '根据染色位置判断水分沿植物茎中的导管运输。',
  5: '总结茎能够把水和无机盐向上运输到叶等器官。',
};

const materialLabels: Record<MaterialId, string> = {
  beaker: '烧杯',
  'red-water': '红色有色水',
  stem: '植物茎段',
  'leaf-vein': '叶脉',
  blade: '刀片',
};

const materialOrder: MaterialId[] = ['beaker', 'red-water', 'stem', 'leaf-vein', 'blade'];

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

export function StemTransportLabPlayer({ experiment, onTelemetry }: StemTransportLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [stemPlaced, setStemPlaced] = useState(false);
  const [dyed, setDyed] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过红色有色水观察植物茎和叶脉的运输现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const transportValue = clamp(28 + (stemPlaced ? 18 : 0) + (dyed ? 24 : 0), 20, 99);
  const veinValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (stemPlaced ? 10 : 0) + (dyed ? 14 : 0), 20, 100);

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
        setCameraPreset('stem');
        advanceStep(2, '器材识别完成，先把茎段插入红色有色水中。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePlaceStem = (choice: 'correct' | 'dry') => {
    if (step !== 2 || completed) return;
    if (choice === 'dry') {
      markError('茎段需要插入有色水中，才能观察运输现象。');
      return;
    }
    setStemPlaced(true);
    appendNote('装置状态：植物茎段已插入红色有色水。');
    advanceStep(3, '茎段已插好，下一步观察茎叶染色。');
  };

  const handleObserveDye = (choice: 'correct' | 'root-only') => {
    if (step !== 3 || completed) return;
    if (!stemPlaced) {
      markError('请先把植物茎段插入有色水。');
      return;
    }
    if (choice === 'root-only') {
      markError('本实验重点是茎和叶脉逐渐染色，而不是只有底部变化。');
      return;
    }
    setDyed(true);
    setCameraPreset('leaf');
    appendNote('观察记录：茎内和叶脉逐渐出现红色运输痕迹。');
    advanceStep(4, '染色现象已出现，请判断水分运输路径。');
  };

  const handleJudge = (choice: 'correct' | 'surface' | 'leaf-only') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!stemPlaced || !dyed) {
      markError('请先完成插入有色水并观察染色。');
      return;
    }
    if (choice === 'correct') {
      appendNote('判断结果：有色水沿茎中的导管向上运输到叶。');
      advanceStep(5, '运输路径已判断，下一步总结茎的运输作用。');
      return;
    }
    markError(choice === 'surface' ? '红色痕迹不是只停留在表面，而是沿植物内部导管分布。' : '水分不是只在叶片内部出现，而是通过茎向上运输后到达叶。');
  };

  const handleSummary = (choice: 'correct' | 'downward' | 'none') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：茎能把根吸收的水和无机盐向上运输到叶等器官。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'downward' ? '本实验显示的是水分沿茎向上运输，而不是只向下运动。' : '茎并非没有运输作用，红色痕迹正说明其内部存在运输通路。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setStemPlaced(false);
    setDyed(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察植物茎运输。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先把茎段插入有色水，再看叶脉染色。', '观察时重点看红色痕迹沿茎和叶脉出现。', '结论关键词是“茎中的导管”“向上运输”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对茎段是否浸入了有色水。',
        '建议按“识别 → 插入有色水 → 观察染色 → 判断路径 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel stemtransport-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属生物实验页</h2><p>把茎段、有色水和叶脉染色通路做成更接近真实植物运输演示的观察场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid stemtransport-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'stem' ? '茎段近景' : '叶脉近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>运输建立 {transportValue}</span><div className="chem-meter-bar"><i style={{ width: `${transportValue}%` }} /></div></div><div className="chem-meter"><span>叶脉显色 {veinValue}</span><div className="chem-meter-bar"><i style={{ width: `${veinValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card stemtransport-data-card"><span className="eyebrow">Readout</span><h3>运输读数板</h3><div className="generic-readout-grid stemtransport-readout-grid"><article className={stemPlaced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>茎段状态</span><strong>{stemPlaced ? '已插入有色水' : '--'}</strong><small>{stemPlaced ? '运输条件已建立。' : '先把茎段插入有色水。'}</small></article><article className={dyed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>染色状态</span><strong>{dyed ? '茎叶已显色' : '--'}</strong><small>{dyed ? '可见红色运输痕迹。' : '等待观察染色。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '导管向上运输' : '等待总结'}</strong><small>茎能把水和无机盐运输到叶等器官。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '植物运输装置'} · 当前重点：{step <= 2 ? '建立有色水运输条件' : step === 3 ? '观察茎叶染色' : '判断导管运输'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'stem' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('stem')} type="button">茎段</button><button className={cameraPreset === 'leaf' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('leaf')} type="button">叶脉</button></div></div><div className={`scene-canvas stemtransport-stage preset-${cameraPreset} ${stemPlaced ? 'stem-placed' : ''} ${dyed ? 'dyed' : ''}`}><div className="stemtransport-rig"><div className="sm-beaker"><div className={stemPlaced ? 'sm-liquid active' : 'sm-liquid'} /></div><div className={stemPlaced ? 'sm-stem active' : 'sm-stem'}><div className={dyed ? 'sm-vein active' : 'sm-vein'} /></div><div className={dyed ? 'sm-leaf active' : 'sm-leaf'} /></div></div><div className="observation-ribbon stemtransport-observation-row"><article className={stemPlaced ? 'observation-chip active' : 'observation-chip calm'}><strong>插入状态</strong><span>{stemPlaced ? '茎段已插入有色水。' : '等待插入有色水。'}</span></article><article className={dyed ? 'observation-chip active' : 'observation-chip calm'}><strong>染色现象</strong><span>{dyed ? '茎叶已出现红色痕迹。' : '等待出现染色。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>路径判断</strong><span>{observationChoice === 'correct' ? '已判断为导管向上运输。' : '等待完成判断。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePlaceStem('correct')} type="button"><strong>把植物茎段插入红色有色水中</strong><span>建立运输条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePlaceStem('dry')} type="button"><strong>让茎段保持干放在桌面</strong><span>错误演示：无法出现运输现象。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleObserveDye('correct')} type="button"><strong>记录茎和叶脉逐渐出现红色痕迹</strong><span>形成运输证据。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserveDye('root-only')} type="button"><strong>只记录茎底部有变化，叶脉完全不变</strong><span>错误演示：忽略上部染色。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleJudge('correct')} type="button"><strong>记录“有色水沿茎中的导管向上运输到叶”</strong><span>这是本实验的正确判断。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleJudge('surface')} type="button"><strong>记录“红色只停留在茎的表面，不进入内部”</strong><span>错误演示：忽略内部运输。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleJudge('leaf-only')} type="button"><strong>记录“水分只在叶里产生，与茎无关”</strong><span>错误演示：路径判断错误。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>植物茎能够把水和无机盐沿导管向上运输到叶等器官</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('downward')} type="button"><strong>茎的主要作用是把水分只向下运输</strong><span>错误演示：与实验相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('none')} type="button"><strong>茎在植物体内没有运输作用</strong><span>错误演示：概念错误。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{stemPlaced ? '茎段已插入' : '茎段待插入'} / {dyed ? '茎叶已染色' : '待染色'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意观察茎和叶脉中的红色痕迹'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“茎运输作用”升级成可见红色运输通路的专属页。</small></section></aside>
      </div>
    </section>
  );
}
