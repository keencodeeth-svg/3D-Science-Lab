import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beaker' | 'flow';
type MaterialId = 'beaker' | 'heater' | 'water' | 'dye-crystal' | 'tripod';
type TimelineState = 'done' | 'current' | 'todo';

interface ConvectionLabPlayerProps {
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
  2: '给烧杯底部加热',
  3: '观察色水流动',
  4: '比较冷热水运动',
  5: '总结对流规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别烧杯、酒精灯、三脚架、水和色水晶体。',
  2: '把热源放在烧杯底部一侧，形成局部加热。',
  3: '观察受热处色水向上、另一侧冷水向下的流动路径。',
  4: '比较热水与冷水的运动方向。',
  5: '总结液体受热对流的基本规律。',
};

const materialLabels: Record<MaterialId, string> = {
  beaker: '烧杯',
  heater: '酒精灯',
  water: '水',
  'dye-crystal': '色水晶体',
  tripod: '三脚架',
};

const materialOrder: MaterialId[] = ['beaker', 'heater', 'water', 'dye-crystal', 'tripod'];

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

export function ConvectionLabPlayer({ experiment, onTelemetry }: ConvectionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [heated, setHeated] = useState(false);
  const [observed, setObserved] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先在烧杯底部一侧加热，再观察热水和冷水的循环流动。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const flowStrength = observed ? 88 : heated ? 52 : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const flowValue = clamp(42 + (heated ? 18 : 0) + (observed ? 22 : 0) + (observationChoice === 'correct' ? 14 : 0), 24, 99);
  const clarityValue = clamp(40 + (flowStrength > 0 ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (heated ? 14 : 0) + (observed ? 16 : 0), 20, 100);

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
        setCameraPreset('beaker');
        advanceStep(2, '器材识别完成，先从烧杯底部一侧开始加热。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleHeat = (choice: 'correct' | 'top') => {
    if (step !== 2 || completed) return;
    if (choice === 'top') {
      markError('应从烧杯底部一侧加热，才能形成明显的对流。');
      return;
    }
    setHeated(true);
    appendNote('加热记录：烧杯底部一侧开始受热，色水附近温度升高。');
    advanceStep(3, '已形成局部加热，下一步观察色水在杯中的流动路径。');
  };

  const handleObserve = (choice: 'correct' | 'skip') => {
    if (step !== 3 || completed) return;
    if (!heated) {
      markError('请先进行局部加热，再观察色水流动。');
      return;
    }
    if (choice === 'skip') {
      markError('请先观察色水流动路径，再进入比较步骤。');
      return;
    }
    setObserved(true);
    setCameraPreset('flow');
    appendNote('现象记录：受热处色水上升，另一侧较冷水下沉，形成循环。');
    advanceStep(4, '流动路径已出现，请比较热水与冷水的运动方向。');
  };

  const handleCompare = (choice: 'correct' | 'reverse' | 'same') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!observed) {
      markError('请先观察对流现象，再比较冷热水运动方向。');
      return;
    }
    if (choice === 'correct') {
      appendNote('比较结果：热水密度减小向上运动，冷水向下补充，形成对流循环。');
      advanceStep(5, '比较完成，最后总结液体对流规律。');
      return;
    }
    if (choice === 'reverse') {
      markError('方向记反了：受热处水是向上运动，不是向下。');
      return;
    }
    markError('冷热水运动方向并不相同，它们共同形成循环流动。');
  };

  const handleSummary = (choice: 'correct' | 'all-up' | 'no-cycle') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：液体受热后通常会上升，较冷液体下沉补充，从而形成对流。');
      return;
    }
    if (choice === 'all-up') {
      markError('不是所有水都一起向上，而是热水上升、冷水下沉。');
      return;
    }
    markError('液体并不是只局部移动，它会形成明显的循环流动。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setHeated(false);
    setObserved(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新给烧杯底部一侧加热并观察对流。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '一定从底部一侧加热，现象更明显。',
        '观察时重点看受热色水的上升路径。',
        '总结时要把“热水上升、冷水下沉”连成循环。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对对流路径。',
        '建议重新执行“局部加热 → 观察色水 → 比较冷热水”的流程。',
      ];

  return (
    <section className="panel playground-panel convection-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属小学科学实验页</h2>
          <p>把热水上升、冷水下沉做成真实流线动画，让孩子能看懂水为什么会自己“转起来”。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid convection-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'beaker' ? '烧杯观察' : '流动路径'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>流动度 {flowValue}</span><div className="chem-meter-bar"><i style={{ width: `${flowValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card convection-data-card"><span className="eyebrow">Readout</span><h3>对流读数板</h3><div className="generic-readout-grid convection-readout-grid"><article className={heated ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>加热状态</span><strong>{heated ? '底部局部加热' : '待加热'}</strong><small>{heated ? '局部温差已经建立。' : '先从烧杯底部一侧加热。'}</small></article><article className={observed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>流动路径</span><strong>{observed ? '热水上升 / 冷水下沉' : '待观察'}</strong><small>{observed ? '受热处形成上升流，另一侧形成下沉流。' : '加热后再观察色水流动。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '形成对流循环' : '等待总结'}</strong><small>液体受热上升、遇冷下沉，从而形成循环流动。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '热水对流装置'} · 当前重点：{step <= 2 ? '建立局部加热' : step === 3 ? '观察流线' : '比较冷热水方向'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'beaker' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('beaker')} type="button">烧杯</button><button className={cameraPreset === 'flow' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flow')} type="button">流线</button></div></div>

          <div className={`scene-canvas convection-stage preset-${cameraPreset} ${heated ? 'heated' : ''} ${observed ? 'observed' : ''}`}>
            <div className="convection-rig">
              <div className="convection-tripod" />
              <div className="convection-beaker">
                <div className={heated ? 'convection-water active' : 'convection-water'} />
                <div className={observed ? 'convection-plume rise active' : 'convection-plume rise'} />
                <div className={observed ? 'convection-plume return active' : 'convection-plume return'} />
                <div className={observed ? 'convection-plume sink active' : 'convection-plume sink'} />
              </div>
              <div className={heated ? 'convection-heater active' : 'convection-heater'} />
              <div className={heated ? 'convection-flame active' : 'convection-flame'} />
            </div>
          </div>

          <div className="observation-ribbon convection-observation-row"><article className={heated ? 'observation-chip active' : 'observation-chip calm'}><strong>加热区域</strong><span>{heated ? '烧杯底部一侧正在受热。' : '先建立底部局部加热。'}</span></article><article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>色水流动</strong><span>{observed ? '受热色水明显向上运动。' : '等待观察色水路径。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>循环方向</strong><span>{observationChoice === 'correct' ? '热水上升、冷水下沉形成循环。' : '等待完成方向比较。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleHeat('correct')} type="button"><strong>从烧杯底部一侧加热</strong><span>建立明显温差，便于观察对流。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleHeat('top')} type="button"><strong>从水面上方加热</strong><span>错误演示：对流现象不明显。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleObserve('correct')} type="button"><strong>观察色水流动路径</strong><span>看受热处上升和另一侧下沉。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('skip')} type="button"><strong>不观察直接进入比较</strong><span>错误演示：缺少实验依据。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleCompare('correct')} type="button"><strong>记录“热水上升，冷水下沉”</strong><span>这是本实验的正确方向。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleCompare('reverse')} type="button"><strong>记录“热水下沉，冷水上升”</strong><span>错误演示：方向记反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCompare('same')} type="button"><strong>记录“冷热水一起同向流动”</strong><span>错误演示：忽略对流循环。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>液体受热后会上升，较冷液体下沉补充，从而形成对流</strong><span>完整总结热水对流规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('all-up')} type="button"><strong>受热后整杯水都会一起向上</strong><span>错误演示：忽略循环流动。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-cycle')} type="button"><strong>水只在受热处局部移动，不会形成循环</strong><span>错误演示：与观察不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{heated ? '已局部加热' : '待加热'} / {observed ? '已出现对流路径' : '待观察'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意从底部一侧加热并观察完整循环'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“热水对流”升级成热流路径可视化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
