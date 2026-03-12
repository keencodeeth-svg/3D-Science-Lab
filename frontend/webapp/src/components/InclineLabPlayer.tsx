import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'force' | 'compare';
type MaterialId = 'ramp' | 'cart' | 'scale' | 'stand' | 'block';
type TimelineState = 'done' | 'current' | 'todo';

interface InclineLabPlayerProps {
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
  2: '在水平面上拉动物体',
  3: '改用斜面拉动物体',
  4: '比较所需拉力',
  5: '总结斜面省力特点',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别斜面板、小车、测力计、支架和重物。',
  2: '先在水平面上拉动物体，记录较大的拉力读数。',
  3: '改用斜面把物体拉到同样高度，比较读数变化。',
  4: '根据两次测力计示数比较斜面是否省力。',
  5: '总结斜面可以省力，但通常会增加运动距离。',
};

const materialLabels: Record<MaterialId, string> = {
  ramp: '斜面板',
  cart: '小车',
  scale: '弹簧测力计',
  stand: '支架',
  block: '重物',
};

const materialOrder: MaterialId[] = ['ramp', 'cart', 'scale', 'stand', 'block'];

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

export function InclineLabPlayer({ experiment, onTelemetry }: InclineLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [flatMeasured, setFlatMeasured] = useState(false);
  const [inclineMeasured, setInclineMeasured] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过水平拖动和斜面拖动比较所需拉力，判断斜面是否省力。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const effortValue = clamp(42 + (flatMeasured ? 18 : 0) - (inclineMeasured ? 8 : 0), 20, 95);
  const savingValue = clamp(26 + (inclineMeasured ? 30 : 0) + (observationChoice === 'correct' ? 14 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (flatMeasured ? 10 : 0) + (inclineMeasured ? 14 : 0), 20, 100);

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
        setCameraPreset('force');
        advanceStep(2, '器材识别完成，先在水平面上拉动物体。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleFlatMeasure = (choice: 'correct' | 'skip') => {
    if (step !== 2 || completed) return;
    if (choice === 'skip') {
      markError('请先完成水平面对照，才能比较斜面是否省力。');
      return;
    }
    setFlatMeasured(true);
    appendNote('第一组数据：水平拖动小车时测力计读数约为 3.2 N。');
    advanceStep(3, '水平面对照已完成，下一步改用斜面拉动物体。');
  };

  const handleInclineMeasure = (choice: 'correct' | 'same-flat') => {
    if (step !== 3 || completed) return;
    if (!flatMeasured) {
      markError('请先完成水平面拉力测量，再使用斜面。');
      return;
    }
    if (choice === 'same-flat') {
      markError('此步需要改用斜面装置，不能继续做同样的水平拖动。');
      return;
    }
    setInclineMeasured(true);
    setCameraPreset('compare');
    appendNote('第二组数据：改用斜面后，测力计读数约降为 1.8 N。');
    advanceStep(4, '两组拉力数据已具备，请比较斜面是否省力。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'harder') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!flatMeasured || !inclineMeasured) {
      markError('请先完成水平面和斜面两组拉力测量。');
      return;
    }
    if (choice === 'correct') {
      appendNote('结果比较：斜面拉力小于水平提升所需拉力，说明斜面可以省力。');
      advanceStep(5, '现象判断正确，最后总结斜面省力特点。');
      return;
    }
    if (choice === 'same') {
      markError('两次拉力读数并不相同，斜面所需拉力更小。');
      return;
    }
    markError('斜面通常不会更费力，关键现象是所需拉力减小。');
  };

  const handleSummary = (choice: 'correct' | 'save-distance' | 'no-effect') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：斜面可以省力，但通常会增加物体移动的距离。');
      return;
    }
    if (choice === 'save-distance') {
      markError('斜面的主要特点是省力，不是同时减少移动距离。');
      return;
    }
    markError('斜面对拉力有明显影响，并不是完全没有作用。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setFlatMeasured(false);
    setInclineMeasured(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新比较水平面和斜面所需拉力。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先做水平面对照，再用斜面。', '重点比较两次测力计读数大小。', '总结时抓住“省力但费距离”。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对两次拉力读数。',
        '建议按“水平拉动 → 斜面拉动 → 比较 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel incline-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属科学实验页</h2><p>把木质斜面、滚轮小车和弹簧测力计做成真实力学场景，让“省力但费距离”的体验更直观。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>

      <div className="playground-grid incline-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'force' ? '拉力测量' : '两组对比'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>拉力趋势 {effortValue}</span><div className="chem-meter-bar"><i style={{ width: `${effortValue}%` }} /></div></div><div className="chem-meter"><span>省力感知 {savingValue}</span><div className="chem-meter-bar"><i style={{ width: `${savingValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card incline-data-card"><span className="eyebrow">Readout</span><h3>拉力读数板</h3><div className="generic-readout-grid incline-readout-grid"><article className={flatMeasured ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>水平面拉力</span><strong>{flatMeasured ? '3.2 N' : '--'}</strong><small>{flatMeasured ? '直接平移重物需要较大拉力。' : '先完成水平面对照。'}</small></article><article className={inclineMeasured ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>斜面拉力</span><strong>{inclineMeasured ? '1.8 N' : '--'}</strong><small>{inclineMeasured ? '使用斜面后所需拉力明显减小。' : '再完成斜面拉动测量。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '斜面能省力' : '等待总结'}</strong><small>斜面通常用更长路径换取更小拉力。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '斜面装置'} · 当前重点：{step <= 2 ? '记录水平拉力' : step === 3 ? '改用斜面' : '比较两组读数'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'force' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('force')} type="button">拉力</button><button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对比</button></div></div>

          <div className={`scene-canvas incline-stage preset-${cameraPreset} ${flatMeasured ? 'flat-measured' : ''} ${inclineMeasured ? 'incline-measured' : ''}`}><div className="incline-rig"><div className="il-base" /><div className="il-ramp" /><div className={flatMeasured && !inclineMeasured ? 'il-cart flat active' : inclineMeasured ? 'il-cart incline active' : 'il-cart flat'} /><div className="il-scale"><div className="il-pointer" /></div><div className="il-readout flat">3.2N</div><div className="il-readout incline">1.8N</div></div></div>

          <div className="observation-ribbon incline-observation-row"><article className={flatMeasured ? 'observation-chip active' : 'observation-chip calm'}><strong>水平面对照</strong><span>{flatMeasured ? '水平面拉力已记录。' : '先完成水平拉力测量。'}</span></article><article className={inclineMeasured ? 'observation-chip active' : 'observation-chip calm'}><strong>斜面对照</strong><span>{inclineMeasured ? '斜面拉力已记录。' : '等待完成斜面测量。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>规律判断</strong><span>{observationChoice === 'correct' ? '已判断斜面所需拉力更小。' : '等待完成比较判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFlatMeasure('correct')} type="button"><strong>先在水平面上拖动并记录 3.2 N</strong><span>建立不使用斜面的基准。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFlatMeasure('skip')} type="button"><strong>跳过水平面对照</strong><span>错误演示：无法形成有效比较。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleInclineMeasure('correct')} type="button"><strong>改用斜面拉动并记录 1.8 N</strong><span>比较使用简单机械后的拉力变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleInclineMeasure('same-flat')} type="button"><strong>继续在水平面上做同样动作</strong><span>错误演示：变量没有改变。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“斜面拉动物体所需拉力更小”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“两次拉力一样大”</strong><span>错误演示：忽略读数差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('harder')} type="button"><strong>记录“斜面比水平面更费力”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>斜面可以省力，但通常会增加物体移动的距离</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('save-distance')} type="button"><strong>斜面既省力又能缩短距离</strong><span>错误演示：结论过度化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-effect')} type="button"><strong>斜面对拉力没有明显影响</strong><span>错误演示：与实验读数不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{flatMeasured ? '水平已测' : '水平待测'} / {inclineMeasured ? '斜面已测' : '斜面待测'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先做基准对照，再比较斜面读数'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“斜面省力”升级成拉力计读数对比的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
