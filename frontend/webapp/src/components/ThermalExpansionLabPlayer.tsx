import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'hot' | 'cold';
type MaterialId = 'glass-bottle' | 'balloon' | 'hot-water' | 'cold-water';
type TemperatureMode = 'idle' | 'hot' | 'cold';
type TimelineState = 'done' | 'current' | 'todo';

interface ThermalExpansionLabPlayerProps {
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
  2: '安装气球',
  3: '改变温度条件',
  4: '记录气球变化',
  5: '总结热胀冷缩',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别玻璃瓶、气球、热水容器和冷水容器。',
  2: '把气球套在玻璃瓶口，形成完整观察装置。',
  3: '先比较热水中的变化，再比较冷水中的变化。',
  4: '根据冷热条件记录气球鼓起或回缩现象。',
  5: '把温度变化和气球状态联系起来，总结热胀冷缩。',
};

const materialLabels: Record<MaterialId, string> = {
  'glass-bottle': '玻璃瓶',
  balloon: '气球',
  'hot-water': '热水容器',
  'cold-water': '冷水容器',
};

const materialOrder: MaterialId[] = ['glass-bottle', 'balloon', 'hot-water', 'cold-water'];

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

export function ThermalExpansionLabPlayer({ experiment, onTelemetry }: ThermalExpansionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [balloonInstalled, setBalloonInstalled] = useState(false);
  const [temperatureMode, setTemperatureMode] = useState<TemperatureMode>('idle');
  const [temperatureCompared, setTemperatureCompared] = useState<TemperatureMode[]>([]);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先装好气球，再比较热水和冷水条件下的变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const balloonSize = temperatureMode === 'hot' ? 86 : temperatureMode === 'cold' ? 48 : 62;
  const balloonState = temperatureMode === 'hot' ? '鼓起更明显' : temperatureMode === 'cold' ? '明显回缩' : balloonInstalled ? '待比较温度' : '待安装';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const compareValue = clamp(42 + (balloonInstalled ? 16 : 0) + temperatureCompared.length * 18, 28, 99);
  const clarityValue = clamp(46 + (temperatureMode === 'hot' ? 16 : 0) + (temperatureMode === 'cold' ? 14 : 0), 34, 99);
  const readinessValue = clamp(progressPercent + (balloonInstalled ? 16 : 0) + temperatureCompared.length * 14, 22, 100);

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
      appendNote(`器材识别：${materialLabels[materialId]}`);
      if (next.length === materialOrder.length) {
        advanceStep(2, '器材识别完成，下一步把气球套在玻璃瓶口。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleInstall = () => {
    if (step !== 2 || completed || balloonInstalled) return;
    setBalloonInstalled(true);
    appendNote('装置准备：气球已固定在玻璃瓶口。');
    setCameraPreset('hot');
    advanceStep(3, '装置已完成，下一步依次比较热水和冷水中的变化。');
  };

  const handleTemperature = (mode: TemperatureMode) => {
    if (step !== 3 || completed || mode === 'idle') return;
    if (!balloonInstalled) {
      markError('请先把气球安装在玻璃瓶口，再改变温度条件。');
      return;
    }
    setTemperatureMode(mode);
    setCameraPreset(mode === 'hot' ? 'hot' : 'cold');
    setTemperatureCompared((current) => {
      const next = current.includes(mode) ? current : [...current, mode];
      appendNote(`条件比较：已观察${mode === 'hot' ? '热水' : '冷水'}条件下的气球变化。`);
      if (next.length === 2) {
        advanceStep(4, '冷热两种条件都已比较，下一步记录气球的变化。');
      } else {
        setPromptTone('success');
        setPrompt('已完成一种温度条件，请继续比较另一种温度条件。');
      }
      return next;
    });
  };

  const handleRecord = (choice: 'correct' | 'same' | 'reverse') => {
    if (step !== 4 || completed) return;
    if (temperatureCompared.length < 2) {
      markError('请先比较热水和冷水两种条件，再记录结果。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：热水中气球鼓起更明显，冷水中气球回缩。');
      advanceStep(5, '结果记录完成，下一步总结热胀冷缩现象。');
      return;
    }
    if (choice === 'same') {
      markError('冷热条件下气球变化并不一样，要根据对照结果记录。');
      return;
    }
    markError('结果不能记反：受热鼓起更明显，受冷则回缩。');
  };

  const handleSummary = (choice: 'correct' | 'hot-only' | 'same-size') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：空气受热膨胀、受冷收缩，所以气球会鼓起或回缩。');
      return;
    }
    if (choice === 'hot-only') {
      markError('总结不能只说热水效果，还要说明冷水条件下会回缩。');
      return;
    }
    markError('不同温度条件下气球大小会发生变化，不会始终一样。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setBalloonInstalled(false);
    setTemperatureMode('idle');
    setTemperatureCompared([]);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先装好气球，再比较热水和冷水条件下的变化。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先把气球固定好，再比较不同温度条件。',
        '热水和冷水都要比较，才能形成“热胀冷缩”的完整认识。',
        '记录结果时要同时写清“条件”和“变化”。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对冷热两组现象。',
        '建议重新比较热水和冷水两组，再记录气球变化。',
      ];

  return (
    <section className="panel playground-panel thermal-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属小学科学实验页</h2><p>把“气球套瓶口 + 冷热对照”做成更直观的动态场景，让热胀冷缩从抽象词变成可见现象。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>

      <div className="playground-grid thermal-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">小学科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'hot' ? '热水视角' : '冷水视角'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>比较度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card thermal-data-card"><span className="eyebrow">Readout</span><h3>变化读数板</h3><div className="thermal-data-grid"><div className="thermal-data-item"><span>当前条件</span><strong>{temperatureMode === 'hot' ? '热水' : temperatureMode === 'cold' ? '冷水' : '待比较'}</strong><small>冷热条件会导致气球呈现不同状态。</small></div><div className="thermal-data-item"><span>气球状态</span><strong>{balloonState}</strong><small>受热膨胀、受冷收缩是本实验的核心现象。</small></div></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '玻璃瓶装置'} · 当前重点：{step === 2 ? '装置安装' : step === 3 ? '冷热比较' : step === 4 ? '结果记录' : '现象解释'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'hot' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('hot')} type="button">热水</button><button className={cameraPreset === 'cold' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('cold')} type="button">冷水</button></div></div>

          <div className={`scene-canvas thermal-stage preset-${cameraPreset}`}>
            <div className="thermal-stage-head"><div><span className="eyebrow">Live Science</span><h3>{experiment.curriculum.theme}</h3><p>{promptTone === 'error' ? '当前冷热比较或结果判断有偏差，请回到现象重新核对。' : '把同一只气球在热水和冷水中的变化放到同一实验页里，帮助学生建立稳定的冷热对照认知。'}</p></div><div className="status-pill-row"><span className="status-pill ready">进度 {progressPercent}%</span><span className="status-pill">已比较 {temperatureCompared.length}/2</span></div></div>
            <div className="thermal-stage-grid">
              <article className={balloonInstalled ? 'thermal-card active' : 'thermal-card'}><div className="reaction-card-head"><strong>瓶口装置</strong><small>{balloonInstalled ? '已安装完成' : '等待安装'}</small></div><div className="thermal-bottle-rig"><div className="thermal-bottle-shell" /><div className={temperatureMode === 'hot' ? 'thermal-balloon hot' : temperatureMode === 'cold' ? 'thermal-balloon cold' : balloonInstalled ? 'thermal-balloon ready' : 'thermal-balloon'} style={{ width: `${balloonSize}px`, height: `${Math.max(42, balloonSize - 12)}px` }} /></div></article>
              <article className={temperatureCompared.length > 0 ? 'thermal-card active' : 'thermal-card'}><div className="reaction-card-head"><strong>冷热对照区</strong><small>{temperatureCompared.length > 0 ? '对照已刷新' : '等待比较'}</small></div><div className="thermal-bath-row"><div className={temperatureMode === 'hot' ? 'temperature-bath hot active' : 'temperature-bath hot'}><span>热水</span><strong>{temperatureCompared.includes('hot') ? '已观察' : '待比较'}</strong></div><div className={temperatureMode === 'cold' ? 'temperature-bath cold active' : 'temperature-bath cold'}><span>冷水</span><strong>{temperatureCompared.includes('cold') ? '已观察' : '待比较'}</strong></div></div></article>
            </div>
            <div className="thermal-insight-row"><article className="lab-readout-card active"><span>装置状态</span><strong>{balloonInstalled ? '气球已固定' : '待安装'}</strong><small>先固定气球，才能稳定比较冷热条件。</small></article><article className="lab-readout-card calm"><span>冷热对照</span><strong>{temperatureCompared.length === 2 ? '两组已比较' : `已比较 ${temperatureCompared.length}/2`}</strong><small>完整对照能帮助理解“热胀冷缩”而不是只记住一个现象。</small></article><article className={temperatureCompared.length === 2 ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>核心现象</span><strong>{balloonState}</strong><small>受热时气球更鼓，受冷时气球回缩。</small></article></div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <button className={balloonInstalled ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={handleInstall} type="button"><strong>把气球套在玻璃瓶口</strong><span>完成热胀冷缩观察装置。</span></button> : null}{step === 3 ? <><button className={temperatureCompared.includes('hot') ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleTemperature('hot')} type="button"><strong>观察热水条件</strong><span>看气球是否鼓起更明显。</span></button><button className={temperatureCompared.includes('cold') ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleTemperature('cold')} type="button"><strong>观察冷水条件</strong><span>看气球是否回缩。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button"><strong>记录“热水中鼓起，冷水中回缩”</strong><span>这是本实验的正确结果。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleRecord('same')} type="button"><strong>记录“冷热下都一样”</strong><span>错误演示：忽略条件差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRecord('reverse')} type="button"><strong>记录“热水回缩，冷水鼓起”</strong><span>错误演示：把结果记反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>空气受热膨胀、受冷收缩，所以气球会鼓起或回缩</strong><span>把冷热对照和现象解释完整说清楚。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('hot-only')} type="button"><strong>只要记住热水会鼓起就够了</strong><span>错误演示：忽略冷水对照。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('same-size')} type="button"><strong>温度变化不会影响气球大小</strong><span>错误演示：与实验现象相反。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{balloonInstalled ? '已安装' : '待安装'} / 已比较 {temperatureCompared.length}/2</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请先完成冷热比较'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“热胀冷缩现象”升级成冷热对照、气球动态变化和现象解释一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
