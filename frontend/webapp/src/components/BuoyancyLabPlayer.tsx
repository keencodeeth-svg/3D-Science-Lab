import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beaker' | 'meter';
type MaterialId = 'spring-scale' | 'metal-block' | 'beaker' | 'water' | 'support-stand';
type TimelineState = 'done' | 'current' | 'todo';

interface BuoyancyLabPlayerProps {
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
  2: '测量空气中示数',
  3: '将物块浸入水中',
  4: '比较两次示数',
  5: '总结浮力规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别弹簧测力计、金属块、烧杯、水和支架。',
  2: '先在空气中测出金属块的重力示数。',
  3: '缓慢把金属块浸入水中，再观察测力计读数变化。',
  4: '比较空气中和水中的示数差异。',
  5: '总结浸入液体后示数减小与浮力的关系。',
};

const materialLabels: Record<MaterialId, string> = {
  'spring-scale': '弹簧测力计',
  'metal-block': '金属块',
  beaker: '烧杯',
  water: '水',
  'support-stand': '铁架台',
};

const materialOrder: MaterialId[] = ['spring-scale', 'metal-block', 'beaker', 'water', 'support-stand'];

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

export function BuoyancyLabPlayer({ experiment, onTelemetry }: BuoyancyLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [measuredInAir, setMeasuredInAir] = useState(false);
  const [immersed, setImmersed] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先读空气中示数，再把物块浸入水中比较变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const airReading = measuredInAir ? 2.4 : 0;
  const waterReading = immersed ? 1.6 : airReading;
  const buoyancy = immersed ? Number((airReading - waterReading).toFixed(1)) : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const forceValue = clamp(42 + (measuredInAir ? 18 : 0) + (immersed ? 20 : 0) + (observationChoice === 'correct' ? 14 : 0), 24, 99);
  const clarityValue = clamp(42 + (immersed ? 14 : 0) + (cameraPreset !== 'bench' ? 8 : 0) + (summaryChoice === 'correct' ? 12 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (measuredInAir ? 14 : 0) + (immersed ? 16 : 0), 20, 100);

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
        setCameraPreset('meter');
        advanceStep(2, '器材识别完成，先记录空气中的测力计示数。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleAirMeasure = (choice: 'correct' | 'immerse-first') => {
    if (step !== 2 || completed) return;
    if (choice === 'immerse-first') {
      markError('要先记录空气中示数，建立对照后再浸入水中。');
      return;
    }
    setMeasuredInAir(true);
    appendNote(`读数记录：空气中示数约 ${airReading.toFixed(1)} N。`);
    advanceStep(3, '空气中示数已记录，下一步把金属块缓慢浸入水中。');
  };

  const handleImmerse = (choice: 'correct' | 'drop') => {
    if (step !== 3 || completed) return;
    if (!measuredInAir) {
      markError('请先记录空气中示数，再进行浸水比较。');
      return;
    }
    if (choice === 'drop') {
      markError('应缓慢浸入水中并保持悬挂，不能直接松手掉入烧杯。');
      return;
    }
    setImmersed(true);
    setCameraPreset('beaker');
    appendNote(`读数记录：浸入水中后示数降到 ${waterReading.toFixed(1)} N。`);
    advanceStep(4, '浸水后示数已变化，请比较两次读数差异。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'larger') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!immersed) {
      markError('请先把金属块浸入水中，再比较读数变化。');
      return;
    }
    if (choice === 'correct') {
      appendNote(`现象记录：浸入水中后示数减小 ${buoyancy.toFixed(1)} N，说明受到浮力作用。`);
      advanceStep(5, '现象比较完成，最后总结浮力与示数变化的关系。');
      return;
    }
    if (choice === 'same') {
      markError('两次示数并不相同，浸入水中后测力计示数明显减小。');
      return;
    }
    markError('结果不能记反，浸入水中后示数不会更大。');
  };

  const handleSummary = (choice: 'correct' | 'no-force' | 'heavier') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：物体浸入液体后会受到向上的浮力，测力计示数减小。');
      return;
    }
    if (choice === 'no-force') {
      markError('液体并不是没有作用力，示数减小正说明存在向上的浮力。');
      return;
    }
    markError('浸入液体后并不会更重，示数变小说明视重减小。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setMeasuredInAir(false);
    setImmersed(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新测量空气中和水中的示数变化。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先测空气中示数，再浸入水中做对照。',
        '重点看测力计读数减小了多少。',
        '总结时记住“液体对物体有向上的浮力”。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对示数变化。',
        '建议重新执行“空气中读数 → 浸水 → 比较差值”的流程。',
      ];

  return (
    <section className="panel playground-panel buoyancy-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把空气中和液体中的示数变化做成可视对照，让“浮力让示数减小”直观可见。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid buoyancy-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'beaker' ? '烧杯观察' : '测力计读数'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>受力对比 {forceValue}</span><div className="chem-meter-bar"><i style={{ width: `${forceValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card buoyancy-data-card"><span className="eyebrow">Readout</span><h3>浮力读数板</h3><div className="generic-readout-grid buoyancy-readout-grid"><article className={measuredInAir ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>空气中示数</span><strong>{measuredInAir ? `${airReading.toFixed(1)} N` : '--'}</strong><small>{measuredInAir ? '作为浸水前的重力对照。' : '先在空气中读数。'}</small></article><article className={immersed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>水中示数</span><strong>{immersed ? `${waterReading.toFixed(1)} N` : '--'}</strong><small>{immersed ? `比空气中小 ${buoyancy.toFixed(1)} N。` : '浸入水中后再观察。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '浮力向上，示数减小' : '等待总结'}</strong><small>物体浸入液体后会受到向上的浮力，测力计示数减小。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '浮力实验装置'} · 当前重点：{step <= 2 ? '建立基准读数' : step === 3 ? '浸入液体' : '比较示数'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'beaker' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('beaker')} type="button">烧杯</button><button className={cameraPreset === 'meter' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('meter')} type="button">读数</button></div></div>

          <div className={`scene-canvas buoyancy-stage preset-${cameraPreset} ${measuredInAir ? 'measured' : ''} ${immersed ? 'immersed' : ''}`}>
            <div className="buoyancy-rig">
              <div className="buoyancy-stand" />
              <div className="buoyancy-scale">
                <div className="buoyancy-scale-window">{(immersed ? waterReading : airReading).toFixed(1)} N</div>
                <div className="buoyancy-pointer" style={{ transform: `translateX(-50%) rotate(${immersed ? 16 : measuredInAir ? 32 : 0}deg)` }} />
              </div>
              <div className={immersed ? 'buoyancy-string immersed' : 'buoyancy-string'} />
              <div className="buoyancy-beaker">
                <div className={immersed ? 'buoyancy-water active ripple' : 'buoyancy-water'} />
              </div>
              <div className={immersed ? 'buoyancy-block immersed' : measuredInAir ? 'buoyancy-block measured' : 'buoyancy-block'} />
            </div>
          </div>

          <div className="observation-ribbon buoyancy-observation-row"><article className={measuredInAir ? 'observation-chip active' : 'observation-chip calm'}><strong>空气中读数</strong><span>{measuredInAir ? `已记录 ${airReading.toFixed(1)} N。` : '先记录空气中示数。'}</span></article><article className={immersed ? 'observation-chip active' : 'observation-chip calm'}><strong>浸水变化</strong><span>{immersed ? `浸水后变为 ${waterReading.toFixed(1)} N。` : '等待将物块浸入水中。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>现象判断</strong><span>{observationChoice === 'correct' ? `示数减小 ${buoyancy.toFixed(1)} N。` : '等待完成读数比较。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAirMeasure('correct')} type="button"><strong>记录空气中示数</strong><span>建立重力基准值。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAirMeasure('immerse-first')} type="button"><strong>直接浸入水中</strong><span>错误演示：失去对照基准。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleImmerse('correct')} type="button"><strong>缓慢浸入水中</strong><span>保持悬挂状态观察示数变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleImmerse('drop')} type="button"><strong>直接松手掉入烧杯</strong><span>错误演示：无法正确读数。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“浸入水中后示数减小”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“两次示数相同”</strong><span>错误演示：忽略了浮力影响。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('larger')} type="button"><strong>记录“浸水后示数更大”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>物体浸入液体后受到向上的浮力，测力计示数减小</strong><span>完整总结浮力规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-force')} type="button"><strong>液体对物体没有作用力</strong><span>错误演示：与读数变化不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('heavier')} type="button"><strong>浸入液体后物体更重</strong><span>错误演示：与实验相反。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{measuredInAir ? `空气中 ${airReading.toFixed(1)} N` : '待读数'} / {immersed ? `水中 ${waterReading.toFixed(1)} N` : '待浸入'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先建立空气中基准值'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“浮力规律”升级成读数对照更清晰的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
