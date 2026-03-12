import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'thermo' | 'boil';
type MaterialId = 'beaker' | 'thermometer' | 'tripod' | 'heater' | 'mesh';
type HeatMode = 'warm' | 'boil' | null;
type TimelineState = 'done' | 'current' | 'todo';

interface BoilingLabPlayerProps {
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
  2: '组装加热装置',
  3: '加热并读取温度',
  4: '观察沸腾现象',
  5: '总结沸腾规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别烧杯、温度计、石棉网、三脚架和酒精灯。',
  2: '把烧杯、石棉网和酒精灯按规范组装成加热装置。',
  3: '持续加热并读取水温变化，直到接近沸腾。',
  4: '观察气泡、液面和温度读数在沸腾时的变化。',
  5: '总结水沸腾时的温度和现象特点。',
};

const materialLabels: Record<MaterialId, string> = {
  beaker: '烧杯',
  thermometer: '温度计',
  tripod: '三脚架',
  heater: '酒精灯',
  mesh: '石棉网',
};

const materialOrder: MaterialId[] = ['beaker', 'thermometer', 'tripod', 'heater', 'mesh'];

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

export function BoilingLabPlayer({ experiment, onTelemetry }: BoilingLabPlayerProps) {
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
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先组装加热装置，再加热水直到沸腾。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const temperature = heatMode === 'warm' ? 86 : heatMode === 'boil' ? 100 : 24;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const thermalValue = clamp(42 + (assembled ? 18 : 0) + (heatMode === 'boil' ? 22 : heatMode ? 10 : 0) + (observationChoice === 'correct' ? 14 : 0), 24, 99);
  const clarityValue = clamp(40 + (heatMode ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (assembled ? 14 : 0) + (heatMode === 'boil' ? 18 : 0), 20, 100);

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
        setCameraPreset('bench');
        advanceStep(2, '器材识别完成，下一步规范组装加热装置。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleAssemble = (choice: 'correct' | 'no-mesh') => {
    if (step !== 2 || completed) return;
    if (choice === 'no-mesh') {
      markError('烧杯下方需要石棉网，规范装置更安全也更稳定。');
      return;
    }
    setAssembled(true);
    appendNote('装置搭建：三脚架、石棉网、烧杯和酒精灯已规范就位。');
    advanceStep(3, '加热装置已搭好，下一步开始加热并读取温度。');
  };

  const handleHeat = (choice: HeatMode) => {
    if (step !== 3 || completed) return;
    if (!assembled) {
      markError('请先组装好加热装置，再开始加热。');
      return;
    }
    setHeatMode(choice);
    if (choice === 'boil') {
      setCameraPreset('thermo');
      appendNote('读数记录：水温升到 100°C 左右，已达到沸腾条件。');
      advanceStep(4, '水已沸腾，请观察气泡和温度变化。');
      return;
    }
    markError('当前只升温到接近沸腾，还需要继续加热到沸腾状态。');
  };

  const handleObserve = (choice: 'correct' | 'temp-rises' | 'bubble-smaller') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (heatMode !== 'boil') {
      markError('请先把水加热到沸腾，再观察沸腾现象。');
      return;
    }
    if (choice === 'correct') {
      setCameraPreset('boil');
      appendNote('现象记录：沸腾时大量气泡上升变大，温度保持在沸点附近。');
      advanceStep(5, '现象判断完成，最后总结水沸腾的规律。');
      return;
    }
    if (choice === 'temp-rises') {
      markError('在标准条件下，水沸腾时温度会在沸点附近保持稳定，不会持续升高。');
      return;
    }
    markError('沸腾时气泡在上升过程中通常会变大，不是越往上越小。');
  };

  const handleSummary = (choice: 'correct' | 'all-rise' | 'no-bubbles') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：水沸腾时气泡上升变大，温度在沸点附近保持稳定，并持续吸热。');
      return;
    }
    if (choice === 'all-rise') {
      markError('沸腾不是温度无限升高，而是在沸点附近保持稳定并持续吸热。');
      return;
    }
    markError('沸腾时会出现明显气泡，不是只有液面轻微晃动。');
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
    setLabNotes(['实验已重置：重新组装加热装置并观察水的沸腾现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先规范搭好三脚架和石棉网，再加热烧杯。',
        '温度计读数要配合气泡变化一起看。',
        '总结时记住“温度稳定、持续吸热、气泡变大”。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对沸腾现象。',
        '建议重新执行“组装 → 加热到沸腾 → 观察现象”的流程。',
      ];

  return (
    <section className="panel playground-panel boiling-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把温度读数、气泡变化和持续加热放到同一视野里，让“水为什么算沸腾”一眼就能看懂。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid boiling-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'thermo' ? '温度读数' : '沸腾细节'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>热态值 {thermalValue}</span><div className="chem-meter-bar"><i style={{ width: `${thermalValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card boiling-data-card"><span className="eyebrow">Readout</span><h3>沸腾读数板</h3><div className="generic-readout-grid boiling-readout-grid"><article className={assembled ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装置状态</span><strong>{assembled ? '已规范组装' : '待组装'}</strong><small>{assembled ? '烧杯、石棉网和酒精灯已就位。' : '先搭好完整加热装置。'}</small></article><article className={heatMode ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>当前水温</span><strong>{heatMode ? `${temperature} °C` : '--'}</strong><small>{heatMode === 'boil' ? '已达沸点附近。' : heatMode === 'warm' ? '仍在升温阶段。' : '加热后再观察读数。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '温度稳定，持续吸热' : '等待总结'}</strong><small>水沸腾时大量气泡上升变大，温度在沸点附近保持稳定。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '水沸腾实验装置'} · 当前重点：{step <= 2 ? '规范组装' : step === 3 ? '加热读温' : '观察沸腾'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'thermo' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('thermo')} type="button">温度计</button><button className={cameraPreset === 'boil' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('boil')} type="button">沸腾</button></div></div>

          <div className={`scene-canvas boiling-stage preset-${cameraPreset} ${assembled ? 'assembled' : ''} ${heatMode ?? 'none'}`}>
            <div className="boiling-rig">
              <div className="boiling-tripod" />
              <div className="boiling-mesh" />
              <div className="boiling-beaker">
                <div className={heatMode ? 'boiling-water active' : 'boiling-water'} />
                <div className={heatMode === 'boil' ? 'boiling-bubble bubble-a active' : 'boiling-bubble bubble-a'} />
                <div className={heatMode === 'boil' ? 'boiling-bubble bubble-b active' : 'boiling-bubble bubble-b'} />
                <div className={heatMode === 'boil' ? 'boiling-bubble bubble-c active' : 'boiling-bubble bubble-c'} />
                <div className={heatMode === 'boil' ? 'boiling-steam active' : 'boiling-steam'} />
              </div>
              <div className={assembled ? 'boiling-thermometer active' : 'boiling-thermometer'}>
                <span>{temperature}°C</span>
              </div>
              <div className={heatMode ? 'boiling-heater active' : 'boiling-heater'} />
              <div className={heatMode ? 'boiling-flame active' : 'boiling-flame'} />
            </div>
          </div>

          <div className="observation-ribbon boiling-observation-row"><article className={assembled ? 'observation-chip active' : 'observation-chip calm'}><strong>装置搭建</strong><span>{assembled ? '加热装置已完整搭好。' : '先规范组装装置。'}</span></article><article className={heatMode === 'boil' ? 'observation-chip active' : 'observation-chip calm'}><strong>温度状态</strong><span>{heatMode === 'boil' ? '水温已达沸点附近。' : heatMode === 'warm' ? '仍在继续升温。' : '等待加热。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>沸腾现象</strong><span>{observationChoice === 'correct' ? '气泡上升变大，温度基本稳定。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAssemble('correct')} type="button"><strong>按规范组装加热装置</strong><span>烧杯放在石棉网上进行加热。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAssemble('no-mesh')} type="button"><strong>不放石棉网直接加热</strong><span>错误演示：装置不规范。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice secondary" onClick={() => handleHeat('warm')} type="button"><strong>先加热到 86°C 左右</strong><span>还未达到沸腾状态。</span></button><button className="summary-choice generic-choice primary" onClick={() => handleHeat('boil')} type="button"><strong>继续加热到 100°C 左右</strong><span>进入沸腾观察阶段。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“气泡上升变大，温度保持在沸点附近”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('temp-rises')} type="button"><strong>记录“沸腾后温度还不断升高”</strong><span>错误演示：与沸腾规律不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('bubble-smaller')} type="button"><strong>记录“气泡越往上越小”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>水沸腾时气泡上升变大，温度在沸点附近保持稳定，并持续吸热</strong><span>完整总结沸腾规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('all-rise')} type="button"><strong>水沸腾时温度会一直升高</strong><span>错误演示：忽略温度稳定。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-bubbles')} type="button"><strong>水沸腾时不会有明显气泡</strong><span>错误演示：与现象不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{assembled ? '已规范组装' : '待组装'} / {heatMode === 'boil' ? '已沸腾' : heatMode === 'warm' ? '升温中' : '待加热'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意温度计读数和气泡现象同步观察'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“水的沸腾”升级成温度与气泡联动的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
