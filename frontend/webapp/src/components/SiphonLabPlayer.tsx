import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tube' | 'flow';
type MaterialId = 'cup' | 'water' | 'tube' | 'support' | 'clip';
type TimelineState = 'done' | 'current' | 'todo';

interface SiphonLabPlayerProps {
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
  2: '准备高位液体',
  3: '排尽导管空气',
  4: '观察虹吸流动',
  5: '总结虹吸条件',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别高位杯、低位杯、有色水、导管和支架夹。',
  2: '向高位杯加入有色水，并让高低位置形成差异。',
  3: '让导管内充满液体并排尽空气。',
  4: '观察有色水是否从高位杯持续流向低位杯。',
  5: '总结虹吸启动需要液体充满导管且形成高低液面差。',
};

const materialLabels: Record<MaterialId, string> = {
  cup: '高低位杯',
  water: '有色水',
  tube: '导管',
  support: '支架',
  clip: '夹子',
};

const materialOrder: MaterialId[] = ['cup', 'water', 'tube', 'support', 'clip'];

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

export function SiphonLabPlayer({ experiment, onTelemetry }: SiphonLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [sourceReady, setSourceReady] = useState(false);
  const [siphonStarted, setSiphonStarted] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过高低位容器和导管观察虹吸现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const flowValue = clamp(28 + (sourceReady ? 18 : 0) + (siphonStarted ? 24 : 0), 20, 99);
  const siphonValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (sourceReady ? 10 : 0) + (siphonStarted ? 14 : 0), 20, 100);

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
        setCameraPreset('tube');
        advanceStep(2, '器材识别完成，先建立高位液体。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePrepare = (choice: 'correct' | 'flat') => {
    if (step !== 2 || completed) return;
    if (choice === 'flat') {
      markError('需要形成高位和低位的明显差异，才能出现虹吸流动。');
      return;
    }
    setSourceReady(true);
    appendNote('装置状态：高位杯已加有色水，低位杯位置较低。');
    advanceStep(3, '高低位已建立，下一步排尽导管空气。');
  };

  const handlePrimeTube = (choice: 'correct' | 'air-left') => {
    if (step !== 3 || completed) return;
    if (!sourceReady) {
      markError('请先准备高位液体，再处理导管。');
      return;
    }
    if (choice === 'air-left') {
      markError('导管内若残留较多空气，虹吸难以持续启动。');
      return;
    }
    setSiphonStarted(true);
    setCameraPreset('flow');
    appendNote('导管状态：导管已充满液体，虹吸开始流动。');
    advanceStep(4, '虹吸已启动，请观察液体流向。');
  };

  const handleObserve = (choice: 'correct' | 'backward' | 'stop') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!sourceReady || !siphonStarted) {
      markError('请先准备高位液体并让导管充满液体。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：有色水沿导管从高位杯持续流向低位杯。');
      advanceStep(5, '流动现象已观察到，下一步总结虹吸条件。');
      return;
    }
    markError(choice === 'backward' ? '液体不会逆着高低差从低位自动流回高位。' : '导管条件满足后会持续流动，不会立刻停止。');
  };

  const handleSummary = (choice: 'correct' | 'air-ok' | 'no-height') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：虹吸启动需要导管充满液体并存在高低液面差。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'air-ok' ? '导管中保留大量空气不利于虹吸持续。' : '若没有高低液面差，也难以形成明显虹吸流动。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSourceReady(false);
    setSiphonStarted(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察虹吸现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先建立高位液体，再排尽导管空气。', '观察时重点看液体从高位流向低位。', '结论关键词是“导管充满液体”“高低差”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对导管内是否留有较多空气。',
        '建议按“识别 → 准备高位杯 → 排气充液 → 观察流动 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel siphon-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属科学实验页</h2><p>把高低位容器、透明导管和液体连续流动做成更接近真实演示器的虹吸场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid siphon-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tube' ? '导管近景' : '流动近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>流动建立 {flowValue}</span><div className="chem-meter-bar"><i style={{ width: `${flowValue}%` }} /></div></div><div className="chem-meter"><span>虹吸清晰度 {siphonValue}</span><div className="chem-meter-bar"><i style={{ width: `${siphonValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card siphon-data-card"><span className="eyebrow">Readout</span><h3>虹吸读数板</h3><div className="generic-readout-grid siphon-readout-grid"><article className={sourceReady ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>高低位</span><strong>{sourceReady ? '已建立' : '--'}</strong><small>{sourceReady ? '高位杯与低位杯已形成落差。' : '先建立高低位。'}</small></article><article className={siphonStarted ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>导管状态</span><strong>{siphonStarted ? '已启动虹吸' : '--'}</strong><small>{siphonStarted ? '导管内液体连续流动。' : '等待导管充液排气。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '充液 + 高低差' : '等待总结'}</strong><small>虹吸现象依赖导管充满液体且有高低液面差。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '虹吸装置'} · 当前重点：{step <= 2 ? '建立高低位' : step === 3 ? '让导管充液' : '观察连续流动'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'tube' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tube')} type="button">导管</button><button className={cameraPreset === 'flow' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flow')} type="button">流动</button></div></div><div className={`scene-canvas siphon-stage preset-${cameraPreset} ${sourceReady ? 'source-ready' : ''} ${siphonStarted ? 'siphon-started' : ''}`}><div className="siphon-rig"><div className="si-cup high"><div className={sourceReady ? 'si-liquid high active' : 'si-liquid high'} /></div><div className="si-cup low"><div className={siphonStarted ? 'si-liquid low active' : 'si-liquid low'} /></div><div className={sourceReady ? 'si-tube active' : 'si-tube'} /><div className={siphonStarted ? 'si-flow active' : 'si-flow'} /></div></div><div className="observation-ribbon siphon-observation-row"><article className={sourceReady ? 'observation-chip active' : 'observation-chip calm'}><strong>高低位</strong><span>{sourceReady ? '高位杯和低位杯已建立。' : '等待建立高低位。'}</span></article><article className={siphonStarted ? 'observation-chip active' : 'observation-chip calm'}><strong>导管</strong><span>{siphonStarted ? '导管已充液并开始虹吸。' : '等待导管充液。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>流向</strong><span>{observationChoice === 'correct' ? '已观察到高位流向低位。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePrepare('correct')} type="button"><strong>向高位杯加入有色水并保持低位杯更低</strong><span>建立虹吸条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePrepare('flat')} type="button"><strong>让两个杯子处于完全同一高度</strong><span>错误演示：高低差不明显。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePrimeTube('correct')} type="button"><strong>让导管内充满液体并排尽空气</strong><span>启动虹吸流动。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePrimeTube('air-left')} type="button"><strong>让导管内保留明显空气空段</strong><span>错误演示：难以持续流动。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“有色水沿导管从高位杯持续流向低位杯”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('stop')} type="button"><strong>记录“导管充液后水立刻停止不动”</strong><span>错误演示：忽略连续流动。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('backward')} type="button"><strong>记录“液体会从低位杯自动流回高位杯”</strong><span>错误演示：方向错误。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>虹吸启动需要导管充满液体，并且高位杯与低位杯之间存在液面差</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('air-ok')} type="button"><strong>导管里保留大量空气也能轻松形成虹吸</strong><span>错误演示：条件错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-height')} type="button"><strong>不需要高低差，只要有导管就一定会持续流动</strong><span>错误演示：忽略条件。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{sourceReady ? '高低位已建立' : '高低位待建立'} / {siphonStarted ? '虹吸已启动' : '虹吸待启动'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意导管要先充满液体并排尽空气'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“虹吸现象”升级成可见连续流动的专属页。</small></section></aside>
      </div>
    </section>
  );
}
