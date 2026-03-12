import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'hole' | 'image';
type MaterialId = 'candle' | 'pinhole-box' | 'screen' | 'track' | 'match';
type TimelineState = 'done' | 'current' | 'todo';

interface PinholeImagingLabPlayerProps {
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
  2: '点亮蜡烛',
  3: '调整小孔与屏',
  4: '观察倒像',
  5: '总结成像特点',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别蜡烛、小孔成像盒、成像屏、滑轨和火柴。',
  2: '点亮蜡烛，形成稳定光源。',
  3: '让蜡烛、小孔和成像屏大致排成一条直线。',
  4: '观察成像屏上是否出现倒立的烛焰像。',
  5: '总结小孔成像与光沿直线传播的关系。',
};

const materialLabels: Record<MaterialId, string> = {
  candle: '蜡烛',
  'pinhole-box': '小孔成像盒',
  screen: '成像屏',
  track: '滑轨',
  match: '火柴',
};

const materialOrder: MaterialId[] = ['candle', 'pinhole-box', 'screen', 'track', 'match'];

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

export function PinholeImagingLabPlayer({ experiment, onTelemetry }: PinholeImagingLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [lit, setLit] = useState(false);
  const [aligned, setAligned] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过蜡烛、小孔和成像屏观察小孔成像的倒像现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const beamValue = clamp(28 + (lit ? 20 : 0) + (aligned ? 24 : 0), 20, 99);
  const imageValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (lit ? 10 : 0) + (aligned ? 14 : 0), 20, 100);

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
        setCameraPreset('hole');
        advanceStep(2, '器材识别完成，先点亮蜡烛。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleLight = (choice: 'correct' | 'skip') => {
    if (step !== 2 || completed) return;
    if (choice === 'skip') {
      markError('请先点亮蜡烛，否则无法形成清晰光源。');
      return;
    }
    setLit(true);
    appendNote('光源状态：蜡烛已点亮，烛焰稳定。');
    advanceStep(3, '蜡烛已点亮，下一步调整小孔与成像屏。');
  };

  const handleAlign = (choice: 'correct' | 'offset') => {
    if (step !== 3 || completed) return;
    if (!lit) {
      markError('请先点亮蜡烛，再调整装置。');
      return;
    }
    if (choice === 'offset') {
      markError('小孔、蜡烛和成像屏偏离直线时，成像会不清楚或看不到。');
      return;
    }
    setAligned(true);
    setCameraPreset('image');
    appendNote('装置调整：蜡烛、小孔和成像屏已排成一线。');
    advanceStep(4, '装置已对准，请观察屏上的烛焰像。');
  };

  const handleObserve = (choice: 'correct' | 'upright' | 'none') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!lit || !aligned) {
      markError('请先点亮蜡烛并调整小孔与成像屏。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：成像屏上出现倒立的烛焰像。');
      advanceStep(5, '倒像已观察到，下一步总结小孔成像特点。');
      return;
    }
    markError(choice === 'upright' ? '小孔成像在屏上的像通常是倒立的，不是正立。' : '若已对准装置，应能看到明显像斑和倒像。');
  };

  const handleSummary = (choice: 'correct' | 'lens' | 'random') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：小孔成像说明光沿直线传播，形成倒立实像。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'lens' ? '小孔成像不是依靠透镜折射，而是依靠光沿直线传播。' : '成像不是随机出现，需满足光源、小孔和屏的相对位置条件。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setLit(false);
    setAligned(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察小孔成像。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先点亮蜡烛，再调整小孔和成像屏。', '观察时重点看“倒立的烛焰像”。', '总结时记住“光沿直线传播”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对蜡烛、小孔和屏的位置。',
        '建议按“识别 → 点蜡烛 → 对准装置 → 观察倒像 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel pinhole-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属科学实验页</h2><p>把烛焰、小孔盒、成像屏和倒像投影做成更接近真实教学演示的光学场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid pinhole-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'hole' ? '小孔近景' : '成像近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>光源稳定 {beamValue}</span><div className="chem-meter-bar"><i style={{ width: `${beamValue}%` }} /></div></div><div className="chem-meter"><span>成像清晰度 {imageValue}</span><div className="chem-meter-bar"><i style={{ width: `${imageValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card pinhole-data-card"><span className="eyebrow">Readout</span><h3>小孔成像读数板</h3><div className="generic-readout-grid pinhole-readout-grid"><article className={lit ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>烛焰状态</span><strong>{lit ? '已点亮' : '--'}</strong><small>{lit ? '稳定光源已建立。' : '先点亮蜡烛。'}</small></article><article className={aligned ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装置对准</span><strong>{aligned ? '已对准' : '--'}</strong><small>{aligned ? '小孔与成像屏已成线。' : '等待调整装置。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '倒立实像' : '等待总结'}</strong><small>小孔成像说明光沿直线传播并形成倒像。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '小孔成像装置'} · 当前重点：{step <= 2 ? '建立稳定光源' : step === 3 ? '对准小孔与屏' : '观察倒立像'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'hole' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('hole')} type="button">小孔</button><button className={cameraPreset === 'image' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('image')} type="button">成像</button></div></div><div className={`scene-canvas pinhole-stage preset-${cameraPreset} ${lit ? 'lit' : ''} ${aligned ? 'aligned' : ''}`}><div className="pinhole-rig"><div className="ph-track" /><div className="ph-candle"><div className={lit ? 'ph-flame active' : 'ph-flame'} /></div><div className="ph-box"><div className="ph-hole" /></div><div className="ph-screen"><div className={lit && aligned ? 'ph-image active' : 'ph-image'} /></div><div className={lit && aligned ? 'ph-beam active' : lit ? 'ph-beam partial' : 'ph-beam'} /></div></div><div className="observation-ribbon pinhole-observation-row"><article className={lit ? 'observation-chip active' : 'observation-chip calm'}><strong>光源</strong><span>{lit ? '烛焰已点亮。' : '待点亮蜡烛。'}</span></article><article className={aligned ? 'observation-chip active' : 'observation-chip calm'}><strong>装置</strong><span>{aligned ? '小孔和屏已对准。' : '等待对准。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>倒像</strong><span>{observationChoice === 'correct' ? '已记录倒立烛焰像。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleLight('correct')} type="button"><strong>点亮蜡烛形成烛焰光源</strong><span>建立成像所需光源。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleLight('skip')} type="button"><strong>不点蜡烛直接观察成像</strong><span>错误演示：没有稳定光源。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAlign('correct')} type="button"><strong>让蜡烛、小孔和成像屏排成一线</strong><span>便于得到清晰倒像。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAlign('offset')} type="button"><strong>让成像屏偏离小孔轴线</strong><span>错误演示：像会变弱或消失。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“成像屏上出现倒立的烛焰像”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('upright')} type="button"><strong>记录“屏上的烛焰像是正立的”</strong><span>错误演示：方向判断错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('none')} type="button"><strong>记录“已经对准但屏上仍完全没有像”</strong><span>错误演示：忽略实际现象。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>小孔成像说明光沿直线传播，并在屏上形成倒立实像</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('lens')} type="button"><strong>小孔成像主要依靠透镜折射形成像</strong><span>错误演示：原理错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('random')} type="button"><strong>小孔成像出现与否和装置位置无关</strong><span>错误演示：忽略条件。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{lit ? '蜡烛已亮' : '蜡烛待亮'} / {aligned ? '装置已对准' : '装置待对准'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意蜡烛、小孔和成像屏需要大致共线'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“小孔成像”升级成烛焰投影倒像的专属页。</small></section></aside>
      </div>
    </section>
  );
}
