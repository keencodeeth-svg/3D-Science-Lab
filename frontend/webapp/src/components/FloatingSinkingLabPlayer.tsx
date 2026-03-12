import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';
import { FloatingSinkingThreeScene } from './FloatingSinkingThreeScene';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'basin' | 'side' | 'compare';
type MaterialId = 'water-basin' | 'wood-block' | 'metal-key' | 'plastic-ball';
type SampleId = 'wood' | 'metal' | 'plastic';
type TimelineState = 'done' | 'current' | 'todo';

interface FloatingSinkingLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别材料',
  2: '放入待测物体',
  3: '观察浮沉结果',
  4: '比较材料差异',
  5: '总结浮沉规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先认识水槽、木块、金属钥匙和塑料球。',
  2: '把三种物体依次放入同一个水槽中比较。',
  3: '观察哪些物体上浮、哪些物体下沉。',
  4: '比较不同材料在水中的表现差异。',
  5: '根据现象总结不同材料浮与沉的初步规律。',
};

const materialLabels: Record<MaterialId, string> = {
  'water-basin': '水槽',
  'wood-block': '木块',
  'metal-key': '金属钥匙',
  'plastic-ball': '塑料球',
};

const materialOrder: MaterialId[] = ['water-basin', 'wood-block', 'metal-key', 'plastic-ball'];
const sampleLabels: Record<SampleId, string> = {
  wood: '木块',
  metal: '金属钥匙',
  plastic: '塑料球',
};

const floatingStepOrder: StepId[] = [1, 2, 3, 4, 5];

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

export function FloatingSinkingLabPlayer({ experiment, onTelemetry }: FloatingSinkingLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [placedSamples, setPlacedSamples] = useState<SampleId[]>([]);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('basin');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：把三种材料放入同一个水槽中，比较它们的浮沉结果。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const allPlaced = placedSamples.length === 3;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const compareValue = clamp(42 + placedSamples.length * 16, 24, 99);
  const clarityValue = clamp(48 + (allPlaced ? 18 : 0), 34, 99);
  const readinessValue = clamp(progressPercent + placedSamples.length * 12, 22, 100);

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
        setCameraPreset('side');
        advanceStep(2, '材料识别完成，下一步把三种物体依次放入水槽。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个对象，请继续。`);
      }
      return next;
    });
  };

  const handlePlace = (sampleId: SampleId) => {
    if (step !== 2 || completed) return;
    setPlacedSamples((current) => {
      if (current.includes(sampleId)) return current;
      const next = [...current, sampleId];
      appendNote(`放置记录：已将${sampleLabels[sampleId]}放入水槽。`);
      if (next.length === 3) {
        setCameraPreset('compare');
        advanceStep(3, '三种物体均已放入，下一步观察哪些上浮、哪些下沉。');
      } else {
        setPromptTone('success');
        setPrompt(`已放入 ${next.length}/3 个物体，请继续完成比较。`);
      }
      return next;
    });
  };

  const handleObserve = (choice: 'correct' | 'same' | 'reverse') => {
    if (step !== 3 || completed) return;
    if (!allPlaced) {
      markError('请先把三种材料都放入水槽，再观察浮沉结果。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：木块和塑料球上浮，金属钥匙下沉。');
      advanceStep(4, '浮沉结果已记录，下一步比较不同材料的表现差异。');
      return;
    }
    if (choice === 'same') {
      markError('三种物体的浮沉结果并不相同，要根据现象分别记录。');
      return;
    }
    markError('结果不能写反，本实验中木块和塑料球上浮，金属钥匙下沉。');
  };

  const handleCompare = (choice: 'correct' | 'size-only') => {
    if (step !== 4 || completed) return;
    if (choice === 'correct') {
      appendNote('比较结论：不同材料在水中的表现不同，不能只凭大小判断。');
      advanceStep(5, '材料差异已比较，下一步根据现象做初步规律总结。');
      return;
    }
    markError('本实验重点是比较不同材料表现，不是只看物体大小。');
  };

  const handleSummary = (choice: 'correct' | 'all-heavy' | 'all-same') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：不同材料在水中的浮沉表现不同，要依据现象进行比较和归纳。');
      return;
    }
    if (choice === 'all-heavy') {
      markError('不能只用“重不重”简单概括，要以本次比较现象为依据。');
      return;
    }
    markError('不同材料的浮沉表现并不相同，必须根据实验现象总结。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPlacedSamples([]);
    setSummaryChoice('');
    setCameraPreset('basin');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：把三种材料放入同一个水槽中，比较它们的浮沉结果。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '三种材料要放在同一个水槽里比较，现象才直观。',
        '记录时先说现象，再做材料比较。',
        '总结时不要脱离观察结果去猜。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对浮沉现象。',
        '建议回到三种材料的对照结果，再重新完成归纳。',
      ];

  const floatingObservationResult = summaryChoice === 'correct'
    ? '不同材料浮沉不同'
    : allPlaced
      ? '已具备对照结果'
      : '待完成同槽比较';
  const floatingWorkbenchStatus = completed
    ? '同槽对照、现象记录与规律归纳已全部完成。'
    : step === 1
      ? '先识别水槽与三种材料，再进入同槽比较。'
      : step === 2
        ? '把三种材料放进同一水槽，建立可直接对照的观察面。'
        : step === 3
          ? '先记录谁上浮、谁下沉，再做材料比较。'
          : step === 4
            ? '比较材料差异，不要只看大小。'
            : '根据同槽观察结果完成规律归纳。';
  const floatingCompletionCopy = completed
    ? '实验已完成，当前版本支持同槽浮沉对照、结果记录和规律归纳。'
    : '完成全部 5 个步骤后，这里会输出本次浮沉实验的总结结果。';
  const latestLabNote = labNotes[0] ?? '实验已载入：把三种材料放入同一个水槽中，比较它们的浮沉结果。';

  return (
    <section className="panel playground-panel floating-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属小学科学实验页</h2>
          <p>把三种材料的浮沉结果放进同一个水槽里实时比较，让孩子更容易建立“先观察、再归纳”的习惯。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid floating-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">小学科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'basin' ? '水槽总览' : cameraPreset === 'side' ? '侧视浮沉' : '对照比较'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>比较度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card floating-data-card"><span className="eyebrow">Readout</span><h3>浮沉结果板</h3><div className="floating-data-grid"><div className="floating-data-item"><span>木块</span><strong>{allPlaced ? '上浮' : '待放入'}</strong><small>木块通常漂浮在水面附近。</small></div><div className="floating-data-item"><span>金属钥匙</span><strong>{allPlaced ? '下沉' : '待放入'}</strong><small>金属钥匙会沉到水槽底部。</small></div><div className="floating-data-item"><span>塑料球</span><strong>{allPlaced ? '上浮' : '待放入'}</strong><small>塑料球会漂在水面附近。</small></div></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar stage-first-toolbar">
            <div className="stage-first-toolbar-head">
              <span className="stage-first-toolbar-kicker">Workbench</span>
              <strong>当前步骤：{stepTitles[step]}</strong>
              <p className="stage-first-toolbar-copy">{floatingWorkbenchStatus}</p>
            </div>
            <div className="camera-actions"><button className={cameraPreset === 'basin' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('basin')} type="button">水槽</button><button className={cameraPreset === 'side' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('side')} type="button">侧视</button><button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">比较</button></div>
          </div>

          <div className="scene-meta-strip stage-first-meta floating-stage-meta"><div className={`stage-first-card floating-stage-card tone-${promptTone}`}><span>当前任务</span><strong>步骤 {step} · {stepTitles[step]}</strong><p>{prompt}</p></div><div className="stage-first-step-pills floating-step-pills" aria-label="实验步骤概览">{floatingStepOrder.map((stepId) => (<span className={step === stepId ? 'stage-first-step-pill floating-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'stage-first-step-pill floating-step-pill done' : 'stage-first-step-pill floating-step-pill'} key={stepId}><small>步骤 {stepId}</small><strong>{stepTitles[stepId]}</strong></span>))}</div></div>

          <div className={`scene-canvas floating-stage preset-${cameraPreset}`}>
            <div className="floating-stage-grid">
              <article className={allPlaced ? 'floating-card floating-three-card active' : 'floating-card floating-three-card'}><div className="reaction-card-head"><strong>3D 水槽观察区</strong><small>{allPlaced ? '三种材料已入水，可自由旋转观察' : '等待放样，可先查看器材位置'}</small></div><FloatingSinkingThreeScene cameraPreset={cameraPreset} placedSamples={placedSamples} /></article>
              <article className={allPlaced ? 'floating-card active' : 'floating-card'}><div className="reaction-card-head"><strong>材料对照区</strong><small>{allPlaced ? '可进行比较' : '等待全部材料入水'}</small></div><div className="floating-compare-row"><div className="compare-chip float"><strong>木块 / 塑料球</strong><small>漂浮在水面附近，位移更稳定</small><div className="compare-density density-light"><i /></div></div><div className="compare-chip sink"><strong>金属钥匙</strong><small>快速下沉并停留在槽底</small><div className="compare-density density-heavy"><i /></div></div></div></article>
            </div>
          </div>

          <div className="observation-ribbon floating-observation-row"><article className={allPlaced ? 'observation-chip active' : 'observation-chip calm'}><strong>样本放置</strong><span>{allPlaced ? '三种材料已进入同一水槽。' : `已放入 ${placedSamples.length}/3 个样本。`}</span></article><article className={step >= 3 ? 'observation-chip active' : 'observation-chip calm'}><strong>现象记录</strong><span>{step > 3 ? '已进入现象记录与比较。' : '等待完成放样后记录现象。'}</span></article><article className={summaryChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>规律归纳</strong><span>{summaryChoice === 'correct' ? '已完成基于现象的浮沉归纳。' : '等待最后完成规律总结。'}</span></article></div>

          <div className="workbench-inline-dock stage-first-dock floating-workbench-dock">
            <div className="stage-first-status-grid floating-workbench-status-grid"><article className={`stage-first-status floating-workbench-status tone-${promptTone} ${completed ? 'is-live' : ''}`.trim()}><span>工作台状态</span><strong>{completed ? '实验完成' : '正在进行'}</strong><small>{floatingWorkbenchStatus}</small></article><article className={allPlaced ? 'stage-first-status floating-workbench-status is-live' : 'stage-first-status floating-workbench-status'}><span>样本放置</span><strong>{placedSamples.length} / 3</strong><small>{allPlaced ? '三种材料已具备同槽对照条件。' : '把木块、金属钥匙和塑料球放入同一水槽。'}</small></article><article className={step >= 3 ? 'stage-first-status floating-workbench-status is-live' : 'stage-first-status floating-workbench-status'}><span>观察结果</span><strong>{allPlaced ? '上浮 / 下沉差异已显现' : '待观察'}</strong><small>木块和塑料球上浮，金属钥匙下沉。</small></article><article className={summaryChoice === 'correct' ? 'stage-first-status floating-workbench-status is-live' : 'stage-first-status floating-workbench-status'}><span>核心结论</span><strong>{floatingObservationResult}</strong><small>根据同槽观察结果完成浮沉规律归纳。</small></article></div>

            <div className="stage-first-inline-grid">
              <section className="info-card stage-first-inline-panel floating-actions-panel"><div className="generic-notebook-head"><div><span className="eyebrow">Actions</span><h3>当前步骤操作</h3></div><span className="badge">舞台下工作台</span></div><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别材料'}</span></button>)) : null}{step === 2 ? (['wood', 'metal', 'plastic'] as SampleId[]).map((sampleId) => (<button className={placedSamples.includes(sampleId) ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} key={sampleId} onClick={() => handlePlace(sampleId)} type="button"><strong>放入{sampleLabels[sampleId]}</strong><span>{placedSamples.includes(sampleId) ? '已放入水槽' : '加入同一水槽中比较'}</span></button>)) : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleObserve('correct')} type="button"><strong>记录“木块和塑料球上浮，金属钥匙下沉”</strong><span>根据观察结果完成正确记录。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“三种都一样”</strong><span>错误演示：忽略材料差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('reverse')} type="button"><strong>记录“木块和塑料球下沉”</strong><span>错误演示：把结果写反。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleCompare('correct')} type="button"><strong>比较不同材料在水中的表现差异</strong><span>把现象和材料特征联系起来。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCompare('size-only')} type="button"><strong>只比较大小，不看材料</strong><span>错误演示：偏离本实验重点。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>不同材料在水中的浮沉表现不同，要根据观察结果进行归纳</strong><span>符合小学阶段的初步规律总结。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('all-heavy')} type="button"><strong>只要重一点就一定会沉</strong><span>错误演示：脱离实验结果做绝对化判断。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('all-same')} type="button"><strong>不同材料在水里表现都一样</strong><span>错误演示：与现象不符。</span></button></> : null}</div></section>

              <section className="info-card stage-first-inline-panel floating-notebook-panel"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>过程记录与结果板</h3></div><span className="badge">舞台下工作台</span></div><div className="generic-readout-grid stage-first-readout-grid"><article className={allPlaced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>木块</span><strong>{allPlaced ? '上浮' : '待放入'}</strong><small>木块通常漂浮在水面附近。</small></article><article className={allPlaced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>金属钥匙</span><strong>{allPlaced ? '下沉' : '待放入'}</strong><small>金属钥匙会沉到水槽底部。</small></article><article className={allPlaced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>塑料球</span><strong>{allPlaced ? '上浮' : '待放入'}</strong><small>塑料球会漂在水面附近。</small></article></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div><small>{floatingCompletionCopy} · {latestLabNote}</small></section>
            </div>
          </div>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别材料'}</span></button>)) : null}{step === 2 ? (['wood', 'metal', 'plastic'] as SampleId[]).map((sampleId) => (<button className={placedSamples.includes(sampleId) ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} key={sampleId} onClick={() => handlePlace(sampleId)} type="button"><strong>放入{sampleLabels[sampleId]}</strong><span>{placedSamples.includes(sampleId) ? '已放入水槽' : '加入同一水槽中比较'}</span></button>)) : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleObserve('correct')} type="button"><strong>记录“木块和塑料球上浮，金属钥匙下沉”</strong><span>根据观察结果完成正确记录。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“三种都一样”</strong><span>错误演示：忽略材料差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('reverse')} type="button"><strong>记录“木块和塑料球下沉”</strong><span>错误演示：把结果写反。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleCompare('correct')} type="button"><strong>比较不同材料在水中的表现差异</strong><span>把现象和材料特征联系起来。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCompare('size-only')} type="button"><strong>只比较大小，不看材料</strong><span>错误演示：偏离本实验重点。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>不同材料在水中的浮沉表现不同，要根据观察结果进行归纳</strong><span>符合小学阶段的初步规律总结。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('all-heavy')} type="button"><strong>只要重一点就一定会沉</strong><span>错误演示：脱离实验结果做绝对化判断。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('all-same')} type="button"><strong>不同材料在水里表现都一样</strong><span>错误演示：与现象不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>样本状态：已放 {placedSamples.length}/3 / 记录状态：{step > 3 ? '已进入记录环节' : '待记录'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意逐个比较材料'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“浮与沉”升级成同槽对照、结果记录和规律归纳一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
