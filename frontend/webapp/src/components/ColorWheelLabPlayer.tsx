import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'disk' | 'spin';
type MaterialId = 'color-disk' | 'stand' | 'axle' | 'handle' | 'view-card';
type TimelineState = 'done' | 'current' | 'todo';

interface ColorWheelLabPlayerProps {
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
  2: '安装色盘',
  3: '快速转动',
  4: '观察综合色',
  5: '总结混合现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别七色盘、支架、转轴、拉线手柄和观察卡。',
  2: '把七色盘安装到转轴上。',
  3: '快速拉动手柄，让色盘持续旋转。',
  4: '观察旋转时七色是否趋于综合色。',
  5: '总结快速旋转时多种颜色在视觉上会混合。',
};

const materialLabels: Record<MaterialId, string> = {
  'color-disk': '七色盘',
  stand: '支架',
  axle: '转轴',
  handle: '拉线手柄',
  'view-card': '观察卡',
};

const materialOrder: MaterialId[] = ['color-disk', 'stand', 'axle', 'handle', 'view-card'];

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

export function ColorWheelLabPlayer({ experiment, onTelemetry }: ColorWheelLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [mounted, setMounted] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过转动七色盘观察综合色现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const rotationValue = clamp(28 + (mounted ? 20 : 0) + (spinning ? 24 : 0), 20, 99);
  const blendValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (mounted ? 10 : 0) + (spinning ? 14 : 0), 20, 100);

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
        setCameraPreset('disk');
        advanceStep(2, '器材识别完成，先安装七色盘。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleMount = (choice: 'correct' | 'loose') => {
    if (step !== 2 || completed) return;
    if (choice === 'loose') {
      markError('七色盘需要固定在转轴上，松动会导致旋转不稳。');
      return;
    }
    setMounted(true);
    appendNote('装置状态：七色盘已固定在转轴上。');
    advanceStep(3, '色盘已装好，下一步快速转动。');
  };

  const handleSpin = (choice: 'correct' | 'slow') => {
    if (step !== 3 || completed) return;
    if (!mounted) {
      markError('请先安装七色盘，再进行转动。');
      return;
    }
    if (choice === 'slow') {
      markError('转动过慢时各色仍清晰可见，不利于观察综合色。');
      return;
    }
    setSpinning(true);
    setCameraPreset('spin');
    appendNote('操作记录：七色盘已快速旋转，颜色开始融合。');
    advanceStep(4, '色盘已高速旋转，请观察综合色。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'dark') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!mounted || !spinning) {
      markError('请先安装并快速转动七色盘。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：快速旋转时七色趋于浅灰白色的综合色。');
      advanceStep(5, '综合色现象已观察到，下一步总结混合原因。');
      return;
    }
    markError(choice === 'same' ? '高速旋转时不再能清楚分辨七个独立色区。' : '综合色不是更黑，而是趋于较亮的综合色。');
  };

  const handleSummary = (choice: 'correct' | 'separate' | 'no-change') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：色盘快速旋转时，多种颜色在视觉上会混合成综合色。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'separate' ? '快速旋转时不是把颜色分得更开，而是让颜色在视觉上融合。' : '高速旋转并非完全没有变化，综合色正是关键现象。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setMounted(false);
    setSpinning(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察七色盘综合色。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先固定色盘，再快速拉动手柄。', '观察时重点看颜色是否趋于综合色。', '结论关键词是“快速旋转、视觉混合”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对色盘是否转得足够快。',
        '建议按“识别 → 装盘 → 旋转 → 观察综合色 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel colorwheel-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属科学实验页</h2><p>把七色盘、旋转转轴和综合色变化做成更接近真实教具的动态场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid colorwheel-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'disk' ? '色盘近景' : '旋转近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>旋转建立 {rotationValue}</span><div className="chem-meter-bar"><i style={{ width: `${rotationValue}%` }} /></div></div><div className="chem-meter"><span>综合色清晰度 {blendValue}</span><div className="chem-meter-bar"><i style={{ width: `${blendValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card colorwheel-data-card"><span className="eyebrow">Readout</span><h3>色盘读数板</h3><div className="generic-readout-grid colorwheel-readout-grid"><article className={mounted ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装盘状态</span><strong>{mounted ? '已固定' : '--'}</strong><small>{mounted ? '色盘已固定在转轴上。' : '先安装色盘。'}</small></article><article className={spinning ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>旋转状态</span><strong>{spinning ? '高速旋转' : '--'}</strong><small>{spinning ? '颜色开始融合。' : '等待快速转动。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '颜色会综合色' : '等待总结'}</strong><small>高速旋转时多种颜色在视觉上趋于综合色。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '七色盘装置'} · 当前重点：{step <= 2 ? '稳定安装色盘' : step === 3 ? '让色盘高速转动' : '观察综合色'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'disk' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('disk')} type="button">色盘</button><button className={cameraPreset === 'spin' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('spin')} type="button">旋转</button></div></div><div className={`scene-canvas colorwheel-stage preset-${cameraPreset} ${mounted ? 'mounted' : ''} ${spinning ? 'spinning' : ''}`}><div className="colorwheel-rig"><div className="cw-stand" /><div className={spinning ? 'cw-disk active spin' : mounted ? 'cw-disk active' : 'cw-disk'} /><div className={spinning ? 'cw-handle active' : 'cw-handle'} /><div className={spinning ? 'cw-readout active' : 'cw-readout'}>综合色</div></div></div><div className="observation-ribbon colorwheel-observation-row"><article className={mounted ? 'observation-chip active' : 'observation-chip calm'}><strong>装盘</strong><span>{mounted ? '七色盘已固定。' : '等待安装色盘。'}</span></article><article className={spinning ? 'observation-chip active' : 'observation-chip calm'}><strong>旋转</strong><span>{spinning ? '色盘已高速转动。' : '等待转动。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>综合色</strong><span>{observationChoice === 'correct' ? '已观察到综合色。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleMount('correct')} type="button"><strong>把七色盘固定到转轴上</strong><span>建立稳定旋转装置。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleMount('loose')} type="button"><strong>让色盘松松地挂在转轴上</strong><span>错误演示：旋转不稳。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleSpin('correct')} type="button"><strong>快速拉动手柄让色盘高速旋转</strong><span>形成综合色观察条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSpin('slow')} type="button"><strong>仅让色盘慢慢转动</strong><span>错误演示：综合色不明显。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“七色盘高速旋转时颜色趋于浅灰白色的综合色”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“高速旋转时仍能清楚看到七个分离色块”</strong><span>错误演示：与实际现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('dark')} type="button"><strong>记录“快速旋转后整体会变成更黑的颜色”</strong><span>错误演示：方向错误。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>七色盘快速旋转时，多种颜色会在视觉上混合成综合色</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('separate')} type="button"><strong>色盘转得越快，各种颜色就会分得越开</strong><span>错误演示：与实验相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-change')} type="button"><strong>色盘转得再快，颜色也完全不会变化</strong><span>错误演示：忽略综合色现象。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{mounted ? '色盘已装' : '色盘待装'} / {spinning ? '正在高速旋转' : '待旋转'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意色盘要固定牢并转得足够快'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“色盘综合色”升级成可视化高速旋转的专属页。</small></section></aside>
      </div>
    </section>
  );
}
