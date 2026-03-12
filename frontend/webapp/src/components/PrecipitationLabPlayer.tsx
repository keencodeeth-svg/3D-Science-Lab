import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beakers' | 'reaction';
type MaterialId = 'beaker' | 'solutionA' | 'solutionB' | 'dropper' | 'glassRod';
type TimelineState = 'done' | 'current' | 'todo';

interface PrecipitationLabPlayerProps {
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
  2: '准备两种溶液',
  3: '混合溶液',
  4: '观察沉淀生成',
  5: '总结沉淀反应',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别烧杯、两种溶液、滴管和玻璃棒。',
  2: '先准备两种待反应溶液，建立反应前状态。',
  3: '再把两种溶液混合并观察反应杯中的变化。',
  4: '重点观察是否出现浑浊、絮状物或明显沉淀。',
  5: '总结有些溶液混合后会生成难溶物而析出沉淀。',
};

const materialLabels: Record<MaterialId, string> = {
  beaker: '烧杯',
  solutionA: '硫酸铜溶液',
  solutionB: '氢氧化钠溶液',
  dropper: '滴管',
  glassRod: '玻璃棒',
};

const materialOrder: MaterialId[] = ['beaker', 'solutionA', 'solutionB', 'dropper', 'glassRod'];
const precipitationStepOrder: StepId[] = [1, 2, 3, 4, 5];

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

export function PrecipitationLabPlayer({ experiment, onTelemetry }: PrecipitationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [solutionsReady, setSolutionsReady] = useState(false);
  const [mixed, setMixed] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过两种溶液混合前后对比观察沉淀反应的明显现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const reactionValue = clamp(28 + (solutionsReady ? 20 : 0) + (mixed ? 24 : 0), 20, 99);
  const precipitateValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (solutionsReady ? 10 : 0) + (mixed ? 14 : 0), 20, 100);

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
        setCameraPreset('beakers');
        advanceStep(2, '器材识别完成，先准备两种待混合溶液。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePrepare = (choice: 'correct' | 'one-only') => {
    if (step !== 2 || completed) return;
    if (choice === 'one-only') {
      markError('本步需要同时准备两种溶液，才能建立混合反应条件。');
      return;
    }
    setSolutionsReady(true);
    appendNote('试剂准备：硫酸铜溶液和氢氧化钠溶液已分别就位。');
    advanceStep(3, '两种溶液已准备完成，下一步把它们混合。');
  };

  const handleMix = (choice: 'correct' | 'empty') => {
    if (step !== 3 || completed) return;
    if (!solutionsReady) {
      markError('请先准备好两种溶液，再进行混合。');
      return;
    }
    if (choice === 'empty') {
      markError('反应必须把两种溶液真正混合，空搅拌不会出现沉淀。');
      return;
    }
    setMixed(true);
    setCameraPreset('reaction');
    appendNote('反应开始：两种溶液混合后，反应杯中逐渐出现蓝色浑浊。');
    advanceStep(4, '已完成混合，请观察沉淀生成现象。');
  };

  const handleObserve = (choice: 'correct' | 'clear' | 'bubble') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!mixed) {
      markError('请先完成两种溶液混合，再观察反应现象。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：反应液出现蓝色絮状沉淀，沉降后上层液体更清。');
      advanceStep(5, '沉淀现象已识别，下一步总结沉淀反应特点。');
      return;
    }
    markError(choice === 'clear' ? '若液体始终完全澄清，就没有抓住沉淀反应的关键现象。' : '本实验重点不是持续冒气泡，而是出现难溶物沉淀。');
  };

  const handleSummary = (choice: 'correct' | 'no-change' | 'gas-only') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：有些溶液混合后会生成难溶于水的新物质，并以沉淀形式析出。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'no-change' ? '沉淀反应的特征正是“有新物质析出”，不是混合后毫无变化。' : '本实验核心现象是沉淀析出，而不是只用放气来判断。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSolutionsReady(false);
    setMixed(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新配制并观察沉淀反应。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先准备两种溶液，再进行混合。', '观察时重点看“浑浊、絮状、沉降”。', '总结时记住“生成难溶物”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对溶液是否真正混合并观察到沉淀。',
        '建议按“识别器材 → 准备溶液 → 混合 → 观察 → 总结”的顺序重做。',
      ];

  const precipitationObservationResult = observationChoice === 'correct'
    ? '蓝色絮状沉淀'
    : observationChoice === 'clear'
      ? '误判为始终澄清'
      : observationChoice === 'bubble'
        ? '误判为只有气泡'
        : mixed
          ? '待判断析出物'
          : '待混合';
  const precipitationWorkbenchStatus = completed
    ? '试剂准备、混合反应、沉淀识别与规律归纳已全部完成。'
    : step === 1
      ? '先识别两种溶液、玻璃棒和反应杯。'
      : step === 2
        ? '先把两种试剂都准备好，再进入混合。'
        : step === 3
          ? '真正混合溶液并轻轻搅拌，触发沉淀反应。'
          : step === 4
            ? '观察是否有蓝色絮状沉淀析出。'
            : '根据沉淀析出结果总结难溶物生成规律。';
  const precipitationCompletionCopy = completed
    ? '实验已完成，当前版本支持双试剂准备、混合流束、沉淀析出与规律归纳。'
    : '完成全部 5 个步骤后，这里会输出本次沉淀反应实验的总结结果。';
  const latestLabNote = labNotes[0] ?? '实验已载入：准备两种溶液并混合，观察沉淀析出现象。';

  return (
    <section className="panel playground-panel precipitation-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把烧杯、药液、混合流束和沉淀析出过程做成更接近真实课堂演示的反应场景。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid precipitation-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'beakers' ? '试剂准备' : '反应近景'}</span></div><span className="badge">{experiment.grade}</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div>
            </div>
          </section>

          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>反应准备 {reactionValue}</span><div className="chem-meter-bar"><i style={{ width: `${reactionValue}%` }} /></div></div>
              <div className="chem-meter"><span>沉淀可见度 {precipitateValue}</span><div className="chem-meter-bar"><i style={{ width: `${precipitateValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>

          <section className="info-card precipitation-data-card">
            <span className="eyebrow">Readout</span>
            <h3>沉淀反应读数板</h3>
            <div className="generic-readout-grid precipitation-readout-grid">
              <article className={solutionsReady ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>试剂准备</span>
                <strong>{solutionsReady ? '双溶液已就位' : '--'}</strong>
                <small>{solutionsReady ? '反应前条件已建立。' : '先准备两种溶液。'}</small>
              </article>
              <article className={mixed ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>混合状态</span>
                <strong>{mixed ? '反应已发生' : '--'}</strong>
                <small>{mixed ? '反应杯中已出现浑浊变化。' : '等待进行混合。'}</small>
              </article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>核心结论</span>
                <strong>{summaryChoice === 'correct' ? '生成难溶物沉淀' : '等待总结'}</strong>
                <small>沉淀反应的关键是新物质析出并可被观察到。</small>
              </article>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar stage-first-toolbar"><div className="stage-first-toolbar-head"><span className="stage-first-toolbar-kicker">Workbench</span><strong>当前步骤：{stepTitles[step]}</strong><p className="stage-first-toolbar-copy">{precipitationWorkbenchStatus}</p></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'beakers' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('beakers')} type="button">试剂</button><button className={cameraPreset === 'reaction' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('reaction')} type="button">反应</button></div></div>

          <div className="scene-meta-strip stage-first-meta precipitation-stage-meta"><div className={`stage-first-card precipitation-stage-card tone-${promptTone}`}><span>当前任务</span><strong>步骤 {step} · {stepTitles[step]}</strong><p>{prompt}</p></div><div className="stage-first-step-pills precipitation-step-pills" aria-label="实验步骤概览">{precipitationStepOrder.map((stepId) => (<span className={step === stepId ? 'stage-first-step-pill precipitation-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'stage-first-step-pill precipitation-step-pill done' : 'stage-first-step-pill precipitation-step-pill'} key={stepId}><small>步骤 {stepId}</small><strong>{stepTitles[stepId]}</strong></span>))}</div></div>

          <div className={`scene-canvas precipitation-stage preset-${cameraPreset} ${solutionsReady ? 'solutions-ready' : ''} ${mixed ? 'reaction-mixed' : ''}`}>
            <div className="precipitation-rig">
              <div className="pc-bench-shadow" />
              <div className="pc-beaker left">
                <div className="pc-beaker-rim" />
                <div className={solutionsReady ? 'pc-liquid left active' : 'pc-liquid left'}>
                  <span className="pc-liquid-surface" />
                </div>
              </div>
              <div className="pc-beaker center">
                <div className="pc-beaker-rim" />
                <div className={mixed ? 'pc-liquid mixed active' : 'pc-liquid mixed'}>
                  <span className="pc-liquid-surface" />
                  <span className={mixed ? 'pc-vortex active' : 'pc-vortex'} />
                </div>
                <div className={mixed ? 'pc-cloud active' : 'pc-cloud'} />
                <div className={mixed ? 'pc-precipitate active' : 'pc-precipitate'}>
                  <span className="pc-sediment-line" />
                  <span className="pc-sediment-specks" />
                </div>
              </div>
              <div className="pc-beaker right">
                <div className="pc-beaker-rim" />
                <div className={solutionsReady ? 'pc-liquid right active' : 'pc-liquid right'}>
                  <span className="pc-liquid-surface" />
                </div>
              </div>
              <div className={mixed ? 'pc-stream left active' : 'pc-stream left'}>
                <span className="pc-stream-drop drop-1" />
                <span className="pc-stream-drop drop-2" />
              </div>
              <div className={mixed ? 'pc-stream right active' : 'pc-stream right'}>
                <span className="pc-stream-drop drop-1" />
                <span className="pc-stream-drop drop-2" />
              </div>
              <div className={solutionsReady ? 'pc-rod active' : 'pc-rod'}>
                <span className="pc-rod-tip" />
              </div>
              <div className={mixed ? 'pc-mix-halo active' : 'pc-mix-halo'} />
            </div>
          </div>

          <div className="observation-ribbon precipitation-observation-row"><article className={solutionsReady ? 'observation-chip active' : 'observation-chip calm'}><strong>试剂准备</strong><span>{solutionsReady ? '两种溶液已就位。' : '先准备溶液。'}</span></article><article className={mixed ? 'observation-chip active' : 'observation-chip calm'}><strong>混合反应</strong><span>{mixed ? '反应杯中已出现浑浊。' : '等待进行混合。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>沉淀判断</strong><span>{observationChoice === 'correct' ? '已识别蓝色沉淀。' : '等待完成现象判断。'}</span></article></div>

          <div className="workbench-inline-dock stage-first-dock precipitation-workbench-dock"><div className="stage-first-status-grid precipitation-workbench-status-grid"><article className={`stage-first-status precipitation-workbench-status tone-${promptTone} ${completed ? 'is-live' : ''}`.trim()}><span>工作台状态</span><strong>{completed ? '实验完成' : '正在进行'}</strong><small>{precipitationWorkbenchStatus}</small></article><article className={solutionsReady ? 'stage-first-status precipitation-workbench-status is-live' : 'stage-first-status precipitation-workbench-status'}><span>试剂准备</span><strong>{solutionsReady ? '双溶液已就位' : '待准备'}</strong><small>{solutionsReady ? '反应前条件已建立。' : '先准备硫酸铜和氢氧化钠溶液。'}</small></article><article className={mixed ? 'stage-first-status precipitation-workbench-status is-live' : 'stage-first-status precipitation-workbench-status'}><span>混合状态</span><strong>{mixed ? '反应已发生' : '待混合'}</strong><small>{mixed ? '反应杯中已出现浑浊变化。' : '真正混合溶液并轻轻搅拌。'}</small></article><article className={summaryChoice === 'correct' ? 'stage-first-status precipitation-workbench-status is-live' : 'stage-first-status precipitation-workbench-status'}><span>核心结论</span><strong>{precipitationObservationResult}</strong><small>沉淀反应的关键是新物质析出并可被观察到。</small></article></div><div className="stage-first-inline-grid"><section className="info-card stage-first-inline-panel precipitation-actions-panel"><div className="generic-notebook-head"><div><span className="eyebrow">Actions</span><h3>当前步骤操作</h3></div><span className="badge">舞台下工作台</span></div><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePrepare('correct')} type="button"><strong>分别准备硫酸铜溶液和氢氧化钠溶液</strong><span>建立反应前双试剂状态。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePrepare('one-only')} type="button"><strong>只准备一种溶液就直接开始</strong><span>错误演示：无法形成沉淀反应。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleMix('correct')} type="button"><strong>把两种溶液倒入反应杯并轻轻搅拌</strong><span>触发沉淀反应。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleMix('empty')} type="button"><strong>不混合溶液只空搅拌玻璃棒</strong><span>错误演示：不会出现沉淀。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“混合后出现蓝色絮状沉淀，上层液体逐渐变清”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('clear')} type="button"><strong>记录“混合后液体始终完全澄清，没有变化”</strong><span>错误演示：忽略沉淀析出。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('bubble')} type="button"><strong>记录“只有大量气泡持续冒出，没有沉淀”</strong><span>错误演示：抓错现象重点。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>有些溶液混合后会生成难溶于水的新物质，并以沉淀形式析出</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-change')} type="button"><strong>两种溶液混合后通常不会有任何明显变化</strong><span>错误演示：与实验现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('gas-only')} type="button"><strong>沉淀反应只能通过放气来判断，不看析出物</strong><span>错误演示：概念错误。</span></button></> : null}</div></section><section className="info-card stage-first-inline-panel precipitation-notebook-panel"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>过程记录与读数</h3></div><span className="badge">舞台下工作台</span></div><div className="generic-readout-grid stage-first-readout-grid"><article className={solutionsReady ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>试剂准备</span><strong>{solutionsReady ? '双溶液已就位' : '--'}</strong><small>{solutionsReady ? '反应前条件已建立。' : '先准备两种溶液。'}</small></article><article className={mixed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>混合状态</span><strong>{mixed ? '反应已发生' : '--'}</strong><small>{mixed ? '反应杯中已出现浑浊变化。' : '等待进行混合。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '生成难溶物沉淀' : '等待总结'}</strong><small>沉淀反应的关键是新物质析出并可被观察到。</small></article></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div><small>{precipitationCompletionCopy} · {latestLabNote}</small></section></div></div>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>当前步骤操作</h3>
            <div className="summary-stack generic-choice-stack">
              {step === 1 ? materialOrder.map((materialId) => (
                <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button">
                  <strong>识别 {materialLabels[materialId]}</strong>
                  <span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span>
                </button>
              )) : null}

              {step === 2 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handlePrepare('correct')} type="button"><strong>分别准备硫酸铜溶液和氢氧化钠溶液</strong><span>建立反应前双试剂状态。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handlePrepare('one-only')} type="button"><strong>只准备一种溶液就直接开始</strong><span>错误演示：无法形成沉淀反应。</span></button>
              </> : null}

              {step === 3 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleMix('correct')} type="button"><strong>把两种溶液倒入反应杯并轻轻搅拌</strong><span>触发沉淀反应。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleMix('empty')} type="button"><strong>不混合溶液只空搅拌玻璃棒</strong><span>错误演示：不会出现沉淀。</span></button>
              </> : null}

              {step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“混合后出现蓝色絮状沉淀，上层液体逐渐变清”</strong><span>这是本实验的正确现象。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('clear')} type="button"><strong>记录“混合后液体始终完全澄清，没有变化”</strong><span>错误演示：忽略沉淀析出。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleObserve('bubble')} type="button"><strong>记录“只有大量气泡持续冒出，没有沉淀”</strong><span>错误演示：抓错现象重点。</span></button>
              </> : null}

              {step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>有些溶液混合后会生成难溶于水的新物质，并以沉淀形式析出</strong><span>完整总结本实验结论。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-change')} type="button"><strong>两种溶液混合后通常不会有任何明显变化</strong><span>错误演示：与实验现象不符。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleSummary('gas-only')} type="button"><strong>沉淀反应只能通过放气来判断，不看析出物</strong><span>错误演示：概念错误。</span></button>
              </> : null}
            </div>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{solutionsReady ? '试剂已备' : '试剂待备'} / {mixed ? '已混合' : '待混合'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意要真正混合两种溶液并观察析出物'}</li>
            </ul>
          </section>

          <section className="info-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>实验控制</h3>
            <div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div>
            <small>这页已把“观察沉淀反应”升级成带混合流束与析出层的专属页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
