import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'track' | 'close';
type MaterialId = 'cart' | 'ramp' | 'smooth-board' | 'rough-board' | 'ruler';
type SurfaceId = 'none' | 'smooth' | 'rough';
type TimelineState = 'done' | 'current' | 'todo';

interface FrictionLabPlayerProps {
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
  2: '测试光滑面',
  3: '测试粗糙面',
  4: '比较滑行距离',
  5: '总结摩擦规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别小车、斜面、光滑板、粗糙板和刻度尺。',
  2: '先让小车从光滑面滑下，记录更长的滑行距离。',
  3: '再换成粗糙面，观察小车更快停下。',
  4: '根据两次滑行结果比较不同表面对摩擦力的影响。',
  5: '总结表面粗糙程度与摩擦力大小的关系。',
};

const materialLabels: Record<MaterialId, string> = {
  cart: '小车',
  ramp: '斜面',
  'smooth-board': '光滑板',
  'rough-board': '粗糙板',
  ruler: '刻度尺',
};

const materialOrder: MaterialId[] = ['cart', 'ramp', 'smooth-board', 'rough-board', 'ruler'];
const frictionStepOrder: StepId[] = [1, 2, 3, 4, 5];
const smoothDistance = 56;
const roughDistance = 24;

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

export function FrictionLabPlayer({ experiment, onTelemetry }: FrictionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [smoothTested, setSmoothTested] = useState(false);
  const [roughTested, setRoughTested] = useState(false);
  const [surface, setSurface] = useState<SurfaceId>('none');
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先在光滑面测试，再换到粗糙面做对照。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const distanceValue = surface === 'smooth' ? smoothDistance : surface === 'rough' ? roughDistance : 0;
  const frictionState = !smoothTested && !roughTested ? '待比较' : roughTested ? '粗糙面摩擦更大' : '等待粗糙面对照';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const compareValue = clamp(40 + (smoothTested ? 16 : 0) + (roughTested ? 22 : 0), 24, 99);
  const clarityValue = clamp(42 + (surface !== 'none' ? 12 : 0) + (observationChoice === 'correct' ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (smoothTested ? 14 : 0) + (roughTested ? 16 : 0), 20, 100);

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
        setCameraPreset('track');
        advanceStep(2, '器材识别完成，先在光滑面测试小车滑行。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleSmooth = (choice: 'smooth' | 'rough') => {
    if (step !== 2 || completed) return;
    if (choice === 'rough') {
      markError('请先完成光滑面测试，再切换到粗糙面形成对照。');
      return;
    }
    setSmoothTested(true);
    setSurface('smooth');
    appendNote(`实验记录：光滑面上小车滑行约 ${smoothDistance} cm。`);
    advanceStep(3, '光滑面测试完成，下一步换到粗糙面继续比较。');
  };

  const handleRough = (choice: 'rough' | 'smooth') => {
    if (step !== 3 || completed) return;
    if (!smoothTested) {
      markError('请先完成光滑面测试，再进行粗糙面对照。');
      return;
    }
    if (choice === 'smooth') {
      markError('现在需要换到粗糙面，才能比较摩擦力是否变大。');
      return;
    }
    setRoughTested(true);
    setSurface('rough');
    setCameraPreset('close');
    appendNote(`实验记录：粗糙面上小车滑行约 ${roughDistance} cm，很快停下。`);
    advanceStep(4, '两次测试已完成，开始比较滑行距离差异。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'reverse') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!roughTested) {
      markError('请先完成粗糙面测试，再比较结果。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：光滑面滑得更远，粗糙面更容易阻碍小车运动。');
      advanceStep(5, '距离比较完成，最后总结摩擦力大小规律。');
      return;
    }
    if (choice === 'same') {
      markError('两次滑行距离并不相同，粗糙面明显更短。');
      return;
    }
    markError('结果不能记反，小车不是在粗糙面滑得更远。');
  };

  const handleSummary = (choice: 'correct' | 'smooth-more' | 'rough-less') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：表面越粗糙，摩擦力通常越大，物体越容易停下。');
      return;
    }
    if (choice === 'smooth-more') {
      markError('光滑面并不是摩擦力更大，实验中它让小车滑得更远。');
      return;
    }
    markError('粗糙面不会让摩擦力更小，实验结果正好相反。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSmoothTested(false);
    setRoughTested(false);
    setSurface('none');
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新比较光滑面和粗糙面对小车滑行的影响。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '一定先测光滑面，再换粗糙面做对照。',
        '重点看小车滑行距离，不是只看车速瞬间快慢。',
        '总结时要把“表面粗糙程度”和“摩擦力大小”对应起来。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对现象。',
        '建议重新执行“光滑面 → 粗糙面 → 比较距离”的流程。',
      ];

  const frictionObservationResult = observationChoice === 'correct'
    ? '光滑更远 / 粗糙更短'
    : observationChoice === 'same'
      ? '误判为距离相同'
      : observationChoice === 'reverse'
        ? '误判为粗糙更远'
        : roughTested
          ? '两组数据已具备，待比较'
          : '待观察';
  const frictionWorkbenchStatus = completed
    ? '摩擦比较流程已闭环：识别、光滑面对照、粗糙面对照、比较和总结全部完成。'
    : step === 1
      ? '先识别小车、斜面、两种表面板和尺子。'
      : step === 2
        ? '一定先测光滑面，再切换粗糙面做对照。'
        : step === 3
          ? '现在需要换到粗糙面，形成完整比较。'
          : step === 4
            ? '重点比较两种表面的滑行距离差异。'
            : '总结时把“粗糙程度”和“摩擦力大小”对应起来。';
  const frictionCompletionCopy = completed
    ? '实验已完成，当前版本支持光滑面对照、粗糙面对照、距离比较与规律总结。'
    : '完成全部 5 个步骤后，这里会输出本次摩擦力比较实验的总结结果。';
  const latestLabNote = labNotes[0] ?? '实验已载入：先在光滑面测试，再换到粗糙面做对照。';

  return (
    <section className="panel playground-panel friction-lab-panel friction-stage-first-panel friction-lab-player">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属科学实验页</h2><p>把斜面、小车和两种表面完整放回中央舞台，提示与记录统一下沉，让距离对照更直观。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">得分 {score}</span><span className="badge">{experiment.productization.status}</span></div></div>

      <div className="playground-grid friction-grid">
        <aside className="playground-side friction-side-rail friction-side-rail-left"><section className="info-card friction-rail-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台' : cameraPreset === 'track' ? '轨道总览' : '距离近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card friction-rail-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>对照清晰度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>读数清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section></aside>

        <section className="scene-panel friction-workbench-stage">
          <div className="scene-toolbar friction-workbench-toolbar"><div className="friction-toolbar-head"><div className="friction-toolbar-kicker">摩擦工作台</div><strong>{experiment.title}</strong><p className="friction-toolbar-copy">中央舞台只保留斜面与滑行轨道，操作、记录和比较结果统一收回下方工作台。</p></div><div className="camera-actions friction-camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'track' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('track')} type="button">轨道</button><button className={cameraPreset === 'close' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('close')} type="button">读数</button></div></div>

          <div className="scene-meta-strip friction-stage-meta"><div className={`friction-stage-card tone-${promptTone}`}><span>当前任务</span><strong>步骤 {step} · {stepTitles[step]}</strong><p>{prompt}</p></div><div className="friction-step-pills" aria-label="实验步骤概览">{frictionStepOrder.map((stepId) => (<span className={step === stepId ? 'friction-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'friction-step-pill done' : 'friction-step-pill'} key={stepId}><small>步骤 {stepId}</small><strong>{stepTitles[stepId]}</strong></span>))}</div></div>

          <div className={`scene-canvas friction-stage preset-${cameraPreset}`}><div className="friction-rig" /></div>

          <div className="workbench-inline-dock friction-workbench-dock">
            <div className="friction-workbench-status-grid"><div className={`info-card friction-status-card tone-${promptTone}`}><span>当前进度</span><strong>步骤 {step} · {stepTitles[step]}</strong><p>{frictionWorkbenchStatus}</p></div><div className={`info-card friction-status-card ${smoothTested ? 'tone-success' : ''}`.trim()}><span>表面对照</span><strong>{smoothTested ? '光滑面已测' : '待测光滑面'} / {roughTested ? '粗糙面已测' : '待测粗糙面'}</strong><p>只有两组数据都完成，才能比较摩擦差异。</p></div><div className={`info-card friction-status-card ${observationChoice === 'correct' ? 'tone-success' : promptTone === 'error' && step >= 4 ? 'tone-error' : ''}`.trim()}><span>距离比较</span><strong>{frictionObservationResult}</strong><p>当前表面 {surface === 'smooth' ? '光滑面' : surface === 'rough' ? '粗糙面' : '待测试'} · 当前读数 {distanceValue} cm</p></div><div className={`info-card friction-status-card ${completed ? 'tone-success' : ''}`.trim()}><span>实验指标</span><strong>得分 {score} · 完成度 {readinessValue}%</strong><p>清晰度 {clarityValue} · 最新记录：{latestLabNote}</p></div></div>

            <div className="friction-inline-workbench">
              <section className="info-card friction-inline-panel friction-workbench-actions"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleSmooth('smooth')} type="button"><strong>先测试光滑面</strong><span>记录小车滑行更远的现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSmooth('rough')} type="button"><strong>直接换粗糙面</strong><span>错误演示：没有形成顺序对照。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRough('rough')} type="button"><strong>换到粗糙面测试</strong><span>比较小车更快停下的结果。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRough('smooth')} type="button"><strong>继续只测光滑面</strong><span>错误演示：无法比较摩擦差异。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“光滑面滑得更远，粗糙面更快停下”</strong><span>这是本实验的正确比较结果。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“两种表面滑行距离一样”</strong><span>错误演示：忽略表面差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('reverse')} type="button"><strong>记录“粗糙面滑得更远”</strong><span>错误演示：结论方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>表面越粗糙，摩擦力通常越大</strong><span>完整总结本实验规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('smooth-more')} type="button"><strong>光滑面摩擦力更大</strong><span>错误演示：与实验现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('rough-less')} type="button"><strong>粗糙面摩擦力更小</strong><span>错误演示：与实验现象相反。</span></button></> : null}</div></section>
              <section className="info-card friction-inline-panel friction-notebook-panel"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>过程记录与读数</h3></div><span className="badge">舞台下工作台</span></div><div className="generic-readout-grid friction-readout-grid"><article className={surface !== 'none' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>当前表面</span><strong>{surface === 'smooth' ? '光滑面' : surface === 'rough' ? '粗糙面' : '待测试'}</strong><small>{surface === 'smooth' ? '小车阻碍较小，滑行更远。' : surface === 'rough' ? '表面粗糙，小车更快停下。' : '先开始表面对照测试。'}</small></article><article className={surface !== 'none' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>滑行距离</span><strong>{distanceValue} cm</strong><small>{surface === 'rough' ? `比光滑面短 ${smoothDistance - roughDistance} cm。` : '完成两组测试后再比较差异。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心规律</span><strong>{frictionState}</strong><small>表面越粗糙，摩擦力通常越大，运动物体越容易停下。</small></article></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
            </div>
          </div>
        </section>

        <aside className="playground-side friction-side-rail friction-side-rail-right"><section className="info-card friction-rail-card"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{smoothTested ? '光滑面已完成' : '待测光滑面'} / {roughTested ? '粗糙面已完成' : '待测粗糙面'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先对照再总结'}</li></ul></section><section className="info-card friction-rail-card friction-rail-prompt"><span className="eyebrow">Readout</span><h3>摩擦结果板</h3><div className="generic-readout-grid friction-readout-grid"><article className={smoothTested ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>光滑面</span><strong>{smoothTested ? `${smoothDistance} cm` : '--'}</strong><small>滑行更远，阻碍较小。</small></article><article className={roughTested ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>粗糙面</span><strong>{roughTested ? `${roughDistance} cm` : '--'}</strong><small>滑行更短，更快停下。</small></article><article className={observationChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>结果</span><strong>{frictionObservationResult}</strong><small>对照后再形成规律。</small></article></div></section><section className="info-card friction-rail-card friction-rail-prompt"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className={`info-card friction-rail-card friction-rail-prompt ${completed ? 'tone-success' : promptTone === 'error' ? 'tone-error' : ''}`.trim()}><span className="eyebrow">Control</span><h3>实验控制</h3><p>{frictionCompletionCopy}</p><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>{latestLabNote}</small></section></aside>
      </div>
    </section>
  );
}
