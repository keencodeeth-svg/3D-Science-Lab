import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tube' | 'iodine';
type MaterialId = 'test-tube' | 'starch' | 'saliva' | 'dropper' | 'warm-bath';
type TimelineState = 'done' | 'current' | 'todo';

interface SalivaDigestionLabPlayerProps {
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
  2: '设置对照试管',
  3: '放入温水中保温',
  4: '滴加碘液观察',
  5: '总结消化作用',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别试管、淀粉液、唾液、滴管和温水环境。',
  2: '一支试管加入唾液，另一支作对照，保证条件可比较。',
  3: '把两支试管放到适宜温水中保温。',
  4: '滴加碘液后比较两支试管颜色变化。',
  5: '总结唾液能消化淀粉的实验结论。',
};

const materialLabels: Record<MaterialId, string> = {
  'test-tube': '试管',
  starch: '淀粉液',
  saliva: '唾液',
  dropper: '滴管',
  'warm-bath': '温水环境',
};

const materialOrder: MaterialId[] = ['test-tube', 'starch', 'saliva', 'dropper', 'warm-bath'];
const salivadigestionStepOrder: StepId[] = [1, 2, 3, 4, 5];

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

export function SalivaDigestionLabPlayer({ experiment, onTelemetry }: SalivaDigestionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [controlled, setControlled] = useState(false);
  const [warmed, setWarmed] = useState(false);
  const [iodineAdded, setIodineAdded] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先设置唾液与清水对照，再滴加碘液比较颜色。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const reactionValue = clamp(42 + (controlled ? 18 : 0) + (warmed ? 18 : 0) + (observationChoice === 'correct' ? 14 : 0), 24, 99);
  const clarityValue = clamp(38 + (cameraPreset !== 'bench' ? 10 : 0) + (iodineAdded ? 18 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (controlled ? 12 : 0) + (warmed ? 14 : 0), 20, 100);

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
        setCameraPreset('tube');
        advanceStep(2, '器材识别完成，下一步设置唾液与清水对照试管。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleControl = (choice: 'correct' | 'same') => {
    if (step !== 2 || completed) return;
    if (choice === 'same') {
      markError('两支试管不能都加同一种液体，否则无法形成有效对照。');
      return;
    }
    setControlled(true);
    appendNote('对照设置：A 管加入唾液，B 管作为清水对照。');
    advanceStep(3, '对照条件已建立，下一步将试管放入温水中保温。');
  };

  const handleWarm = (choice: 'warm' | 'cold') => {
    if (step !== 3 || completed) return;
    if (!controlled) {
      markError('请先设置对照试管，再进行保温。');
      return;
    }
    if (choice === 'cold') {
      markError('环境过冷不利于唾液淀粉酶发挥作用。');
      return;
    }
    setWarmed(true);
    appendNote('保温完成：试管已置于适宜温水环境中。');
    advanceStep(4, '保温完成，下一步滴加碘液比较颜色变化。');
  };

  const handleObserve = (choice: 'correct' | 'both-blue' | 'saliva-blue') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    setIodineAdded(true);
    if (!warmed) {
      markError('请先完成适宜温度保温，再滴加碘液比较。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：唾液试管蓝色较浅或不明显，对照试管变蓝更明显。');
      advanceStep(5, '现象判断正确，最后总结唾液对淀粉的消化作用。');
      return;
    }
    if (choice === 'both-blue') {
      markError('对照和实验组颜色变化不应完全相同。');
      return;
    }
    markError('加入唾液后的试管不会比对照试管更明显变蓝。');
  };

  const handleSummary = (choice: 'correct' | 'no-effect' | 'starch-more') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：在适宜条件下，唾液中的淀粉酶能分解淀粉。');
      return;
    }
    if (choice === 'no-effect') {
      markError('本实验表明唾液对淀粉确实有明显作用。');
      return;
    }
    markError('唾液不会让淀粉变得更多，而是会促使淀粉被分解。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setControlled(false);
    setWarmed(false);
    setIodineAdded(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新设置对照并观察碘液颜色变化。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['一支试管加唾液，另一支做对照。', '保温条件应适宜，便于酶发挥作用。', '滴加碘液后重点比较两支试管颜色深浅。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对碘液颜色变化。',
        '建议重新执行“设对照 → 保温 → 滴加碘液”的流程。',
      ];

  const salivadigestionObservationResult = observationChoice === 'correct'
    ? '对照组更明显变蓝'
    : observationChoice === 'both-blue'
      ? '误判为两组同色'
      : observationChoice === 'saliva-blue'
        ? '误判为唾液组更蓝'
        : iodineAdded
          ? '已完成碘液显色'
          : '待显色';
  const salivadigestionWorkbenchStatus = completed
    ? '对照设置、温水保温、碘液显色与结论归纳已全部完成。'
    : step === 1
      ? '先识别淀粉液、唾液、温水浴和碘液。'
      : step === 2
        ? '必须建立唾液组与清水对照组，后续显色才有比较意义。'
        : step === 3
          ? '在适宜温度中保温，帮助唾液淀粉酶发挥作用。'
          : step === 4
            ? '滴加碘液后重点比较两支试管颜色差异。'
            : '根据对照显色结果总结唾液分解淀粉。';
  const salivadigestionCompletionCopy = completed
    ? '实验已完成，当前版本支持双试管对照、温水保温与碘液显色归纳。'
    : '完成全部 5 个步骤后，这里会输出本次唾液消化实验的总结结果。';
  const latestLabNote = labNotes[0] ?? '实验已载入：通过对照试管、温水保温和碘液显色观察唾液对淀粉的消化作用。';

  return (
    <section className="panel playground-panel salivadigestion-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>把对照试管、温水保温和碘液显色做成连续变化，让唾液分解淀粉的过程更直观。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid salivadigestion-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tube' ? '试管观察' : '碘液显色'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>反应值 {reactionValue}</span><div className="chem-meter-bar"><i style={{ width: `${reactionValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card salivadigestion-data-card"><span className="eyebrow">Readout</span><h3>消化读数板</h3><div className="generic-readout-grid salivadigestion-readout-grid"><article className={controlled ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>对照状态</span><strong>{controlled ? '已建立对照' : '待建立'}</strong><small>{controlled ? '唾液组和对照组已分开。' : '先设置两支可比较的试管。'}</small></article><article className={warmed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>保温环境</span><strong>{warmed ? '37°C 左右' : '--'}</strong><small>{warmed ? '温度已适宜唾液酶作用。' : '先完成适宜温度保温。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>显色结果</span><strong>{iodineAdded ? (observationChoice === 'correct' ? '对照更蓝' : '已滴加碘液') : '待滴加'}</strong><small>加入碘液后，应重点比较两支试管颜色差异。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar stage-first-toolbar"><div className="stage-first-toolbar-head"><span className="stage-first-toolbar-kicker">Workbench</span><strong>当前步骤：{stepTitles[step]}</strong><p className="stage-first-toolbar-copy">{salivadigestionWorkbenchStatus}</p></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'tube' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tube')} type="button">试管</button><button className={cameraPreset === 'iodine' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('iodine')} type="button">显色</button></div></div>

          <div className="scene-meta-strip stage-first-meta salivadigestion-stage-meta"><div className={`stage-first-card salivadigestion-stage-card tone-${promptTone}`}><span>当前任务</span><strong>步骤 {step} · {stepTitles[step]}</strong><p>{prompt}</p></div><div className="stage-first-step-pills salivadigestion-step-pills" aria-label="实验步骤概览">{salivadigestionStepOrder.map((stepId) => (<span className={step === stepId ? 'stage-first-step-pill salivadigestion-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'stage-first-step-pill salivadigestion-step-pill done' : 'stage-first-step-pill salivadigestion-step-pill'} key={stepId}><small>步骤 {stepId}</small><strong>{stepTitles[stepId]}</strong></span>))}</div></div>

          <div className={`scene-canvas salivadigestion-stage preset-${cameraPreset} ${controlled ? 'controlled' : ''} ${warmed ? 'warmed' : ''} ${iodineAdded ? 'iodine' : ''}`}><div className="salivadigestion-rig"><div className={warmed ? 'sd-bath active' : 'sd-bath'}><div className={warmed ? 'sd-water active' : 'sd-water'} /></div><div className={controlled ? 'sd-tube saliva active' : 'sd-tube saliva'}><div className={warmed ? 'sd-liquid saliva active' : 'sd-liquid saliva'} /><div className={iodineAdded ? `sd-color-band saliva ${observationChoice === 'correct' ? 'light' : 'dark'} active` : 'sd-color-band saliva'} /></div><div className={controlled ? 'sd-tube control active' : 'sd-tube control'}><div className={warmed ? 'sd-liquid control active' : 'sd-liquid control'} /><div className={iodineAdded ? `sd-color-band control ${observationChoice === 'correct' ? 'dark' : 'light'} active` : 'sd-color-band control'} /></div><div className={warmed ? 'sd-thermometer active' : 'sd-thermometer'} /><div className={iodineAdded ? 'sd-dropper active' : 'sd-dropper'} /></div></div>

          <div className="observation-ribbon salivadigestion-observation-row"><article className={controlled ? 'observation-chip active' : 'observation-chip calm'}><strong>对照设置</strong><span>{controlled ? '唾液组和对照组已准备好。' : '先设置有效对照。'}</span></article><article className={warmed ? 'observation-chip active' : 'observation-chip calm'}><strong>温度状态</strong><span>{warmed ? '已放入适宜温水中保温。' : '待进行温水保温。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>显色比较</strong><span>{observationChoice === 'correct' ? '已观察到对照组蓝色更明显。' : '等待完成显色判断。'}</span></article></div>

          <div className="workbench-inline-dock stage-first-dock salivadigestion-workbench-dock"><div className="stage-first-status-grid salivadigestion-workbench-status-grid"><article className={`stage-first-status salivadigestion-workbench-status tone-${promptTone} ${completed ? 'is-live' : ''}`.trim()}><span>工作台状态</span><strong>{completed ? '实验完成' : '正在进行'}</strong><small>{salivadigestionWorkbenchStatus}</small></article><article className={controlled ? 'stage-first-status salivadigestion-workbench-status is-live' : 'stage-first-status salivadigestion-workbench-status'}><span>对照设置</span><strong>{controlled ? '已建立' : '待建立'}</strong><small>唾液组与清水对照组需要同时存在。</small></article><article className={warmed ? 'stage-first-status salivadigestion-workbench-status is-live' : 'stage-first-status salivadigestion-workbench-status'}><span>保温环境</span><strong>{warmed ? '37°C 左右' : '待保温'}</strong><small>{warmed ? '温度已适宜酶作用。' : '先进行适宜温度保温。'}</small></article><article className={summaryChoice === 'correct' ? 'stage-first-status salivadigestion-workbench-status is-live' : 'stage-first-status salivadigestion-workbench-status'}><span>显色结果</span><strong>{salivadigestionObservationResult}</strong><small>加入碘液后重点比较两支试管颜色差异。</small></article></div><div className="stage-first-inline-grid"><section className="info-card stage-first-inline-panel salivadigestion-actions-panel"><div className="generic-notebook-head"><div><span className="eyebrow">Actions</span><h3>当前步骤操作</h3></div><span className="badge">舞台下工作台</span></div><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleControl('correct')} type="button"><strong>一支加唾液，另一支作清水对照</strong><span>建立有效比较条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleControl('same')} type="button"><strong>两支试管都加入同一种液体</strong><span>错误演示：没有形成对照。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleWarm('warm')} type="button"><strong>放入适宜温水中保温</strong><span>有利于唾液淀粉酶发挥作用。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleWarm('cold')} type="button"><strong>放在过冷环境中</strong><span>错误演示：不利于酶作用。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => { setCameraPreset('iodine'); handleObserve('correct'); }} type="button"><strong>记录“对照试管更明显变蓝”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => { setCameraPreset('iodine'); handleObserve('both-blue'); }} type="button"><strong>记录“两支试管完全一样蓝”</strong><span>错误演示：忽略组间差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => { setCameraPreset('iodine'); handleObserve('saliva-blue'); }} type="button"><strong>记录“唾液组更深蓝”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>在适宜条件下，唾液中的淀粉酶能分解淀粉</strong><span>完整总结实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-effect')} type="button"><strong>唾液对淀粉没有作用</strong><span>错误演示：与实验不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('starch-more')} type="button"><strong>唾液会让淀粉变得更多</strong><span>错误演示：概念错误。</span></button></> : null}</div></section><section className="info-card stage-first-inline-panel salivadigestion-notebook-panel"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>过程记录与读数</h3></div><span className="badge">舞台下工作台</span></div><div className="generic-readout-grid stage-first-readout-grid"><article className={controlled ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>对照状态</span><strong>{controlled ? '已建立对照' : '待建立'}</strong><small>{controlled ? '唾液组和对照组已分开。' : '先设置两支可比较的试管。'}</small></article><article className={warmed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>保温环境</span><strong>{warmed ? '37°C 左右' : '--'}</strong><small>{warmed ? '温度已适宜唾液酶作用。' : '先完成适宜温度保温。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>显色结果</span><strong>{iodineAdded ? (observationChoice === 'correct' ? '对照更蓝' : '已滴加碘液') : '待滴加'}</strong><small>加入碘液后，应重点比较两支试管颜色差异。</small></article></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div><small>{salivadigestionCompletionCopy} · {latestLabNote}</small></section></div></div>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleControl('correct')} type="button"><strong>一支加唾液，另一支作清水对照</strong><span>建立有效比较条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleControl('same')} type="button"><strong>两支试管都加入同一种液体</strong><span>错误演示：没有形成对照。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleWarm('warm')} type="button"><strong>放入适宜温水中保温</strong><span>有利于唾液淀粉酶发挥作用。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleWarm('cold')} type="button"><strong>放在过冷环境中</strong><span>错误演示：不利于酶作用。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => { setCameraPreset('iodine'); handleObserve('correct'); }} type="button"><strong>记录“对照试管更明显变蓝”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => { setCameraPreset('iodine'); handleObserve('both-blue'); }} type="button"><strong>记录“两支试管完全一样蓝”</strong><span>错误演示：忽略组间差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => { setCameraPreset('iodine'); handleObserve('saliva-blue'); }} type="button"><strong>记录“唾液组更深蓝”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>在适宜条件下，唾液中的淀粉酶能分解淀粉</strong><span>完整总结实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-effect')} type="button"><strong>唾液对淀粉没有作用</strong><span>错误演示：与实验不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('starch-more')} type="button"><strong>唾液会让淀粉变得更多</strong><span>错误演示：概念错误。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{controlled ? '已设对照' : '待设对照'} / {warmed ? '已保温' : '待保温'} / {iodineAdded ? '已滴碘液' : '待滴碘液'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先对照，再保温，再滴碘液'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“唾液对淀粉的消化作用”升级成对照试管和碘液显色的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
