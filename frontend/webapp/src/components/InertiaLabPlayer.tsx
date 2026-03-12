import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'track' | 'motion';
type MaterialId = 'cart' | 'wood-block' | 'track' | 'ruler' | 'stopper';
type PullMode = 'quick' | 'slow' | null;
type TimelineState = 'done' | 'current' | 'todo';

interface InertiaLabPlayerProps {
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
  2: '在小车上放木块',
  3: '快速拉动小车',
  4: '观察木块状态',
  5: '总结惯性现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别小车、木块、轨道、刻度尺和挡块。',
  2: '把木块稳定放在小车上，建立惯性实验装置。',
  3: '迅速拉动小车，比较木块和小车的相对运动。',
  4: '观察木块是否保持原来静止状态。',
  5: '总结惯性现象与物体原有运动状态的关系。',
};

const materialLabels: Record<MaterialId, string> = {
  cart: '小车',
  'wood-block': '木块',
  track: '轨道',
  ruler: '刻度尺',
  stopper: '挡块',
};

const materialOrder: MaterialId[] = ['cart', 'wood-block', 'track', 'ruler', 'stopper'];

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

export function InertiaLabPlayer({ experiment, onTelemetry }: InertiaLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [prepared, setPrepared] = useState(false);
  const [pullMode, setPullMode] = useState<PullMode>(null);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先在小车上放木块，再快速拉动小车观察惯性现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const cartOffset = pullMode === 'quick' ? 116 : pullMode === 'slow' ? 54 : 0;
  const blockOffset = pullMode === 'quick' ? 0 : pullMode === 'slow' ? 28 : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const motionValue = clamp(42 + (prepared ? 18 : 0) + (pullMode === 'quick' ? 22 : pullMode ? 10 : 0) + (observationChoice === 'correct' ? 14 : 0), 24, 99);
  const clarityValue = clamp(40 + (pullMode ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 14 : 0) + (pullMode === 'quick' ? 18 : 0), 20, 100);

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
        advanceStep(2, '器材识别完成，先把木块平稳放在小车上。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePrepare = (choice: 'correct' | 'edge') => {
    if (step !== 2 || completed) return;
    if (choice === 'edge') {
      markError('木块应放稳在小车中央，避免还没实验就滑落。');
      return;
    }
    setPrepared(true);
    appendNote('装置准备：木块已稳定放在小车中央。');
    advanceStep(3, '装置准备完成，下一步快速拉动小车。');
  };

  const handlePull = (choice: PullMode) => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError('请先把木块稳稳放在小车上，再拉动小车。');
      return;
    }
    setPullMode(choice);
    if (choice === 'quick') {
      setCameraPreset('motion');
      appendNote('操作记录：小车被快速拉出，木块相对地面仍接近原位。');
      advanceStep(4, '快速拉动已完成，请观察木块和小车的相对状态。');
      return;
    }
    markError('拉动过慢时，木块会跟着小车一起移动，不利于突出惯性现象。');
  };

  const handleObserve = (choice: 'correct' | 'cart-drag' | 'forward-run') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (pullMode !== 'quick') {
      markError('请先快速拉动小车，再判断木块状态。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：木块因惯性保持原来的静止状态，相对小车表现为留在后方。');
      advanceStep(5, '现象判断完成，最后总结什么是惯性。');
      return;
    }
    if (choice === 'cart-drag') {
      markError('木块并不是被小车完全带走，快速拉动时它更倾向保持原来静止状态。');
      return;
    }
    markError('木块不会无缘无故向前“自己跑”，关键是它保持了原有静止状态。');
  };

  const handleSummary = (choice: 'correct' | 'only-fast' | 'change-by-self') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：物体具有保持原来运动状态不变的性质，这种性质叫惯性。');
      return;
    }
    if (choice === 'only-fast') {
      markError('惯性不是“只在快速运动时才有”，所有物体都具有惯性。');
      return;
    }
    markError('没有外力作用时，物体不会自己改变原来的运动状态。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPrepared(false);
    setPullMode(null);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新在小车上放木块并快速拉动车体观察惯性。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '木块要放稳在小车中央，再进行拉动。',
        '要“快速”拉动车体，惯性现象才更明显。',
        '总结时把“保持原来运动状态”这句话记牢。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对惯性现象。',
        '建议重新执行“放稳木块 → 快速拉车 → 观察木块”的流程。',
      ];

  return (
    <section className="panel playground-panel inertia-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把小车和木块的相对运动做成慢中有快的对照，让“惯性”不再只是文字概念。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid inertia-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'track' ? '轨道观察' : '运动对比'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>运动对比 {motionValue}</span><div className="chem-meter-bar"><i style={{ width: `${motionValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card inertia-data-card"><span className="eyebrow">Readout</span><h3>惯性读数板</h3><div className="generic-readout-grid inertia-readout-grid"><article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装置状态</span><strong>{prepared ? '木块已放稳' : '待放稳'}</strong><small>{prepared ? '木块和小车已准备好。' : '先把木块平稳放在车上。'}</small></article><article className={pullMode ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>拉动方式</span><strong>{pullMode === 'quick' ? '快速拉动' : pullMode === 'slow' ? '缓慢拉动' : '--'}</strong><small>{pullMode === 'quick' ? `小车位移约 ${cartOffset}px，木块几乎留在原位。` : pullMode === 'slow' ? '木块随小车一起明显移动。' : '拉动后再观察。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '保持原来运动状态' : '等待总结'}</strong><small>物体保持原来运动状态不变的性质叫惯性。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '惯性实验装置'} · 当前重点：{step <= 2 ? '搭建小车装置' : step === 3 ? '快速拉车' : '比较木块与小车状态'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'track' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('track')} type="button">轨道</button><button className={cameraPreset === 'motion' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('motion')} type="button">运动</button></div></div>

          <div className={`scene-canvas inertia-stage preset-${cameraPreset} ${prepared ? 'prepared' : ''} ${pullMode ?? 'none'}`}>
            <div className="inertia-rig">
              <div className="inertia-track" />
              <div className="inertia-cart" style={{ transform: `translateX(${cartOffset}px)` }} />
              <div className="inertia-block" style={{ transform: `translateX(${blockOffset}px)` }} />
              <div className={pullMode ? 'inertia-string active' : 'inertia-string'} />
              <div className={pullMode === 'quick' ? 'inertia-motion-line line-a active' : 'inertia-motion-line line-a'} />
              <div className={pullMode === 'quick' ? 'inertia-motion-line line-b active' : 'inertia-motion-line line-b'} />
            </div>
          </div>

          <div className="observation-ribbon inertia-observation-row"><article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>装置准备</strong><span>{prepared ? '木块已平稳放在小车上。' : '先完成装置搭建。'}</span></article><article className={pullMode === 'quick' ? 'observation-chip active' : 'observation-chip calm'}><strong>拉动方式</strong><span>{pullMode === 'quick' ? '已快速拉动车体。' : pullMode === 'slow' ? '当前拉动过慢。' : '等待拉动车体。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>木块状态</strong><span>{observationChoice === 'correct' ? '木块保持原来静止状态，相对小车留在后方。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePrepare('correct')} type="button"><strong>把木块稳稳放在车中央</strong><span>准备进行惯性实验。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePrepare('edge')} type="button"><strong>把木块放在边缘</strong><span>错误演示：装置不稳定。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePull('quick')} type="button"><strong>快速拉动小车</strong><span>突出木块保持原来静止状态的现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePull('slow')} type="button"><strong>缓慢拉动车体</strong><span>错误演示：惯性现象不明显。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“木块保持原来静止状态”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('cart-drag')} type="button"><strong>记录“木块完全被小车带着走”</strong><span>错误演示：忽略惯性。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('forward-run')} type="button"><strong>记录“木块自己向前跑”</strong><span>错误演示：与实际不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>物体具有保持原来运动状态不变的性质，这种性质叫惯性</strong><span>完整总结惯性现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('only-fast')} type="button"><strong>只有快速运动的物体才有惯性</strong><span>错误演示：理解片面。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('change-by-self')} type="button"><strong>物体会自己改变原来的运动状态</strong><span>错误演示：与惯性相反。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? '木块已放稳' : '待放稳'} / {pullMode === 'quick' ? '已快速拉车' : pullMode === 'slow' ? '当前拉动过慢' : '待拉动'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意快速拉车并观察木块原有状态'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“惯性现象”升级成小车与木块分离更明显的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
