import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beakers' | 'compare';
type MaterialId = 'potato-strip' | 'salt-water' | 'clear-water' | 'beaker' | 'tongs';
type TimelineState = 'done' | 'current' | 'todo';

interface PotatoOsmosisLabPlayerProps {
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
  2: '放入两种液体',
  3: '观察盐水组变化',
  4: '比较清水组差异',
  5: '总结吸水失水',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别马铃薯条、盐水、清水、烧杯和镊子。',
  2: '把两条马铃薯条分别放入盐水和清水中。',
  3: '观察盐水中的马铃薯条是否变软、弯曲。',
  4: '比较清水中的马铃薯条是否更挺直饱满。',
  5: '总结植物组织在不同浓度液体中的吸水失水现象。',
};

const materialLabels: Record<MaterialId, string> = {
  'potato-strip': '马铃薯条',
  'salt-water': '盐水',
  'clear-water': '清水',
  beaker: '烧杯',
  tongs: '镊子',
};

const materialOrder: MaterialId[] = ['potato-strip', 'salt-water', 'clear-water', 'beaker', 'tongs'];

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

export function PotatoOsmosisLabPlayer({ experiment, onTelemetry }: PotatoOsmosisLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [placed, setPlaced] = useState(false);
  const [saltObserved, setSaltObserved] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过盐水组与清水组比较马铃薯条的吸水失水变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const osmosisValue = clamp(28 + (placed ? 18 : 0) + (saltObserved ? 24 : 0), 20, 99);
  const compareValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (placed ? 10 : 0) + (saltObserved ? 14 : 0), 20, 100);

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
        setCameraPreset('beakers');
        advanceStep(2, '器材识别完成，先把马铃薯条放入两种液体。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePlace = (choice: 'correct' | 'one-side') => {
    if (step !== 2 || completed) return;
    if (choice === 'one-side') {
      markError('需要分别放入盐水和清水中，才能形成对照。');
      return;
    }
    setPlaced(true);
    appendNote('装置状态：两条马铃薯条已分别置于盐水和清水中。');
    advanceStep(3, '对照组已建立，下一步观察盐水组变化。');
  };

  const handleObserveSalt = (choice: 'correct' | 'swell') => {
    if (step !== 3 || completed) return;
    if (!placed) {
      markError('请先把马铃薯条放入两种液体。');
      return;
    }
    if (choice === 'swell') {
      markError('盐水中的马铃薯条更容易失水变软，而不是先膨胀。');
      return;
    }
    setSaltObserved(true);
    setCameraPreset('compare');
    appendNote('观察记录：盐水组马铃薯条变软、弯曲更明显。');
    advanceStep(4, '盐水组已观察到，下一步比较清水组。');
  };

  const handleCompare = (choice: 'correct' | 'same' | 'salt-better') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!placed || !saltObserved) {
      markError('请先完成盐水组观察。');
      return;
    }
    if (choice === 'correct') {
      appendNote('比较结果：清水组更挺直饱满，盐水组更柔软。');
      advanceStep(5, '对照差异已完成，下一步总结吸水失水。');
      return;
    }
    markError(choice === 'same' ? '两组不会完全一样，清水和盐水会造成明显差异。' : '盐水组不是更饱满，通常更容易失水变软。');
  };

  const handleSummary = (choice: 'correct' | 'reverse' | 'no-change') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：植物组织在高浓度溶液中易失水，在清水中易吸水。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'reverse' ? '现象不是相反的：盐水更易失水，清水更易吸水。' : '不同浓度液体会带来明显变化，并非完全没有差异。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPlaced(false);
    setSaltObserved(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察马铃薯条吸水失水。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先建立盐水组和清水组。', '观察时重点看盐水组变软、清水组更挺。', '结论关键词是“高浓度失水、清水吸水”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对两组溶液是否都已建立。',
        '建议按“识别 → 放入两组液体 → 看盐水组 → 比清水组 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel potatoosmosis-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属生物实验页</h2><p>把盐水组与清水组、马铃薯条形变和对照差异做成更接近真实课堂观察的场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid potatoosmosis-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'beakers' ? '双杯近景' : '对比近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>渗透建立 {osmosisValue}</span><div className="chem-meter-bar"><i style={{ width: `${osmosisValue}%` }} /></div></div><div className="chem-meter"><span>对比清晰度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card potatoosmosis-data-card"><span className="eyebrow">Readout</span><h3>渗透读数板</h3><div className="generic-readout-grid potatoosmosis-readout-grid"><article className={placed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>对照建立</span><strong>{placed ? '双组已就位' : '--'}</strong><small>{placed ? '盐水组和清水组已建立。' : '先建立两组液体。'}</small></article><article className={saltObserved ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>盐水组</span><strong>{saltObserved ? '已变软' : '--'}</strong><small>{saltObserved ? '失水现象已可见。' : '等待观察盐水组。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '高浓度失水' : '等待总结'}</strong><small>不同浓度液体会让植物组织发生吸水或失水变化。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '马铃薯渗透装置'} · 当前重点：{step <= 2 ? '建立双组对照' : step === 3 ? '观察盐水组' : '比较两组差异'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'beakers' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('beakers')} type="button">双杯</button><button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对比</button></div></div><div className={`scene-canvas potatoosmosis-stage preset-${cameraPreset} ${placed ? 'placed' : ''} ${saltObserved ? 'salt-observed' : ''}`}><div className="potatoosmosis-rig"><div className="po-beaker salt"><div className="po-liquid salt" /><div className={saltObserved ? 'po-strip salt active soft' : placed ? 'po-strip salt active' : 'po-strip salt'} /></div><div className="po-beaker clear"><div className="po-liquid clear" /><div className={saltObserved ? 'po-strip clear active firm' : placed ? 'po-strip clear active' : 'po-strip clear'} /></div></div></div><div className="observation-ribbon potatoosmosis-observation-row"><article className={placed ? 'observation-chip active' : 'observation-chip calm'}><strong>对照组</strong><span>{placed ? '两组马铃薯条已放好。' : '等待建立双组对照。'}</span></article><article className={saltObserved ? 'observation-chip active' : 'observation-chip calm'}><strong>盐水组</strong><span>{saltObserved ? '已观察到变软弯曲。' : '等待观察盐水组。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>比较</strong><span>{observationChoice === 'correct' ? '已完成两组差异比较。' : '等待完成比较。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePlace('correct')} type="button"><strong>把两条马铃薯条分别放入盐水和清水中</strong><span>建立吸水失水对照。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePlace('one-side')} type="button"><strong>只把马铃薯条放进一个烧杯里</strong><span>错误演示：没有完整对照。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleObserveSalt('correct')} type="button"><strong>记录盐水组马铃薯条变软、弯曲</strong><span>抓住失水现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserveSalt('swell')} type="button"><strong>记录盐水组先膨胀更饱满</strong><span>错误演示：方向相反。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleCompare('correct')} type="button"><strong>记录“清水组更挺直饱满，盐水组更柔软”</strong><span>这是本实验的正确对照结果。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleCompare('same')} type="button"><strong>记录“两组几乎完全一样，没有差异”</strong><span>错误演示：忽略对照现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCompare('salt-better')} type="button"><strong>记录“盐水组更挺，清水组更软”</strong><span>错误演示：方向错误。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>植物组织在高浓度溶液中容易失水，在清水中容易吸水</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('reverse')} type="button"><strong>盐水会让植物组织吸水，清水会让它失水</strong><span>错误演示：与实验相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-change')} type="button"><strong>不同浓度液体对植物组织没有任何影响</strong><span>错误演示：忽略现象。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{placed ? '双组已建' : '双组待建'} / {saltObserved ? '盐水组已观察' : '盐水组待观察'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先建立盐水组和清水组对照'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“马铃薯条吸水失水”升级成双组对照的专属页。</small></section></aside>
      </div>
    </section>
  );
}
