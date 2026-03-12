import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tube' | 'thermo';
type MaterialId = 'test-tube' | 'beaker' | 'thermometer' | 'tripod' | 'heater';
type HeatMode = 'warm' | 'melt' | null;
type TimelineState = 'done' | 'current' | 'todo';

interface MeltingLabPlayerProps {
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
  2: '组装水浴装置',
  3: '加热接近熔点',
  4: '观察熔化现象',
  5: '总结熔化规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别试管、烧杯、温度计、三脚架和酒精灯。',
  2: '把烧杯水浴、试管和温度计按规范装好。',
  3: '缓慢加热，让晶体逐渐接近熔点。',
  4: '观察晶体开始熔化时的状态和温度变化。',
  5: '总结晶体熔化时继续吸热但温度基本不变。',
};

const materialLabels: Record<MaterialId, string> = {
  'test-tube': '试管',
  beaker: '烧杯',
  thermometer: '温度计',
  tripod: '三脚架',
  heater: '酒精灯',
};

const materialOrder: MaterialId[] = ['test-tube', 'beaker', 'thermometer', 'tripod', 'heater'];

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

export function MeltingLabPlayer({ experiment, onTelemetry }: MeltingLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [assembled, setAssembled] = useState(false);
  const [heatMode, setHeatMode] = useState<HeatMode>(null);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先搭建水浴装置，再观察晶体熔化时的温度特点。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const temperature = heatMode === 'warm' ? 44 : heatMode === 'melt' ? 48 : 24;
  const phaseText = heatMode === 'melt' ? '固液共存' : heatMode === 'warm' ? '接近熔化' : '固态晶体';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const phaseValue = clamp(42 + (assembled ? 16 : 0) + (heatMode === 'warm' ? 10 : 0) + (heatMode === 'melt' ? 24 : 0) + (observationChoice === 'correct' ? 10 : 0), 24, 99);
  const clarityValue = clamp(40 + (cameraPreset !== 'bench' ? 10 : 0) + (heatMode ? 18 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (assembled ? 12 : 0) + (heatMode === 'melt' ? 18 : 0), 20, 100);

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
        advanceStep(2, '器材识别完成，下一步组装水浴加热装置。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleAssemble = (choice: 'correct' | 'direct-flame') => {
    if (step !== 2 || completed) return;
    if (choice === 'direct-flame') {
      markError('晶体熔化宜采用水浴加热，不能直接用火焰猛烧试管。');
      return;
    }
    setAssembled(true);
    appendNote('装置搭建：烧杯水浴、试管和温度计已规范就位。');
    advanceStep(3, '水浴装置已搭好，下一步缓慢加热并接近熔点。');
  };

  const handleHeat = (choice: 'warm' | 'melt') => {
    if (step !== 3 || completed) return;
    if (!assembled) {
      markError('请先完成水浴装置搭建，再开始加热。');
      return;
    }
    setHeatMode(choice);
    if (choice === 'warm') {
      setPromptTone('success');
      setPrompt('温度已接近熔点，继续缓慢加热，观察晶体开始熔化的瞬间。');
      appendNote('加热过程：晶体温度升高到接近熔点。');
      setCameraPreset('thermo');
      return;
    }
    appendNote('相态变化：晶体开始熔化，试管内出现固液共存。');
    setCameraPreset('tube');
    advanceStep(4, '晶体已开始熔化，请观察温度和相态变化。');
  };

  const handleObserve = (choice: 'correct' | 'all-rise' | 'sudden') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (heatMode !== 'melt') {
      markError('请先把晶体加热到开始熔化，再记录现象。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：晶体熔化时继续吸热，温度基本保持在熔点附近。');
      advanceStep(5, '现象判断正确，最后总结晶体熔化规律。');
      return;
    }
    if (choice === 'all-rise') {
      markError('晶体熔化过程中，温度不是一直明显升高。');
      return;
    }
    markError('晶体熔化通常会经历固液共存过程，不是瞬间全部消失。');
  };

  const handleSummary = (choice: 'correct' | 'no-heat' | 'random') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：晶体熔化时持续吸热，温度在熔点附近基本保持不变。');
      return;
    }
    if (choice === 'no-heat') {
      markError('晶体熔化需要继续吸热，不是停止吸热。');
      return;
    }
    markError('晶体熔化规律不是随机变化，应围绕熔点和相态变化来总结。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setAssembled(false);
    setHeatMode(null);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新搭建水浴装置并观察晶体熔化。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先搭建规范水浴装置，再开始缓慢加热。',
        '关注“开始熔化”这一瞬间的温度和相态。',
        '总结时记住“持续吸热、温度基本不变”。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对晶体熔化现象。',
        '建议重新执行“水浴装置 → 缓慢加热 → 观察熔点”的流程。',
      ];

  return (
    <section className="panel playground-panel melting-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把水浴、熔点平台和固液共存做成连续可视变化，让“晶体熔化”真正看得见。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid melting-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tube' ? '试管观察' : '温度读数'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>相态值 {phaseValue}</span><div className="chem-meter-bar"><i style={{ width: `${phaseValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card melting-data-card"><span className="eyebrow">Readout</span><h3>熔化读数板</h3><div className="generic-readout-grid melting-readout-grid"><article className={assembled ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装置状态</span><strong>{assembled ? '水浴已搭好' : '待组装'}</strong><small>{assembled ? '烧杯、试管和温度计已规范就位。' : '先完成规范搭建。'}</small></article><article className={heatMode ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>当前温度</span><strong>{heatMode ? `${temperature} °C` : '--'}</strong><small>{heatMode === 'melt' ? '已到熔点附近。' : heatMode === 'warm' ? '仍在接近熔点。' : '加热后再观察。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>相态状态</span><strong>{summaryChoice === 'correct' ? '持续吸热，温度平台' : phaseText}</strong><small>晶体熔化时会经历固液共存过程。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '晶体熔化装置'} · 当前重点：{step <= 2 ? '规范搭建水浴' : step === 3 ? '缓慢加热' : '观察熔点平台'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'tube' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tube')} type="button">试管</button><button className={cameraPreset === 'thermo' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('thermo')} type="button">温度计</button></div></div>

          <div className={`scene-canvas melting-stage preset-${cameraPreset} ${assembled ? 'assembled' : ''} ${heatMode ?? 'none'}`}>
            <div className="melting-rig">
              <div className="melting-tripod" />
              <div className="melting-mesh" />
              <div className="melting-beaker">
                <div className={heatMode ? 'melting-bath active' : 'melting-bath'} />
                <div className={assembled ? 'melting-tube active' : 'melting-tube'}>
                  <div className={heatMode === 'melt' ? 'melting-solid melt' : heatMode === 'warm' ? 'melting-solid warm' : 'melting-solid'} />
                </div>
              </div>
              <div className={assembled ? 'melting-thermometer active' : 'melting-thermometer'} />
              <div className={heatMode ? 'melting-heater active' : 'melting-heater'} />
              <div className={heatMode ? 'melting-flame active' : 'melting-flame'} />
              <div className={heatMode === 'melt' ? 'melting-vapor active' : 'melting-vapor'} />
            </div>
          </div>

          <div className="observation-ribbon melting-observation-row"><article className={assembled ? 'observation-chip active' : 'observation-chip calm'}><strong>装置搭建</strong><span>{assembled ? '水浴装置已稳定搭好。' : '先规范搭建装置。'}</span></article><article className={heatMode === 'melt' ? 'observation-chip active' : 'observation-chip calm'}><strong>熔化状态</strong><span>{heatMode === 'melt' ? '晶体已进入固液共存阶段。' : heatMode === 'warm' ? '已接近熔点。' : '等待加热。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>温度特征</strong><span>{observationChoice === 'correct' ? '熔化时温度基本保持不变。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAssemble('correct')} type="button"><strong>按水浴方式规范搭建</strong><span>保证受热更均匀，便于观察熔点。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAssemble('direct-flame')} type="button"><strong>直接用火焰猛烧试管</strong><span>错误演示：不符合规范。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice secondary" onClick={() => handleHeat('warm')} type="button"><strong>缓慢加热到接近熔点</strong><span>先看到温度逐步升高。</span></button><button className="summary-choice generic-choice primary" onClick={() => handleHeat('melt')} type="button"><strong>继续加热到开始熔化</strong><span>进入固液共存状态。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“熔化时继续吸热，温度基本保持不变”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('all-rise')} type="button"><strong>记录“熔化时温度一直明显升高”</strong><span>错误演示：忽略熔点平台。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('sudden')} type="button"><strong>记录“晶体瞬间全部消失”</strong><span>错误演示：忽略固液共存。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>晶体熔化时持续吸热，温度在熔点附近基本保持不变</strong><span>完整总结晶体熔化规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-heat')} type="button"><strong>晶体熔化时不再需要吸热</strong><span>错误演示：与现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('random')} type="button"><strong>熔化时温度和相态随机变化</strong><span>错误演示：结论混乱。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{assembled ? '水浴已搭好' : '待搭建'} / {heatMode ? '已加热' : '待加热'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意用水浴并关注熔点附近温度'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“晶体熔化”升级成带熔点平台和固液共存表现的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
