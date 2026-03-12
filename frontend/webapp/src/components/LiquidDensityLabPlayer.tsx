import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'balance' | 'cylinder';
type MaterialId = 'balance' | 'cylinder' | 'beaker' | 'liquid' | 'dropper';
type TimelineState = 'done' | 'current' | 'todo';

interface LiquidDensityLabPlayerProps {
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
  2: '测量液体质量',
  3: '读取液体体积',
  4: '计算液体密度',
  5: '总结测量方法',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别天平、量筒、烧杯、待测液体和滴管。',
  2: '先测出待测液体的质量。',
  3: '再读取量筒中液体的体积。',
  4: '根据质量和体积计算密度。',
  5: '总结测量液体密度的基本方法。',
};

const materialLabels: Record<MaterialId, string> = {
  balance: '天平',
  cylinder: '量筒',
  beaker: '烧杯',
  liquid: '待测液体',
  dropper: '滴管',
};

const materialOrder: MaterialId[] = ['balance', 'cylinder', 'beaker', 'liquid', 'dropper'];
const liquidMass = 36.0;
const liquidVolume = 30.0;
const liquidDensity = 1.2;

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

export function LiquidDensityLabPlayer({ experiment, onTelemetry }: LiquidDensityLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [massMeasured, setMassMeasured] = useState(false);
  const [volumeMeasured, setVolumeMeasured] = useState(false);
  const [densityChoice, setDensityChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先测质量和体积，再计算液体密度。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const accuracyValue = clamp(42 + (massMeasured ? 18 : 0) + (volumeMeasured ? 18 : 0) + (densityChoice === 'correct' ? 16 : 0), 24, 99);
  const clarityValue = clamp(38 + (cameraPreset !== 'bench' ? 10 : 0) + (volumeMeasured ? 16 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (massMeasured ? 12 : 0) + (volumeMeasured ? 12 : 0), 20, 100);

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
        setCameraPreset('balance');
        advanceStep(2, '器材识别完成，下一步测量液体质量。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleMass = (choice: 'correct' | 'wrong') => {
    if (step !== 2 || completed) return;
    if (choice === 'wrong') {
      markError('质量读数应准确记录为 36.0 g，错误读数会导致密度计算出错。');
      return;
    }
    setMassMeasured(true);
    appendNote('质量测量：待测液体质量已记录为 36.0 g。');
    setCameraPreset('cylinder');
    advanceStep(3, '质量已测得，下一步读取量筒中的液体体积。');
  };

  const handleVolume = (choice: 'correct' | 'wrong') => {
    if (step !== 3 || completed) return;
    if (!massMeasured) {
      markError('请先测出液体质量，再读取体积。');
      return;
    }
    if (choice === 'wrong') {
      markError('量筒应按凹液面最低处读取，正确体积不是这个数值。');
      return;
    }
    setVolumeMeasured(true);
    appendNote('体积测量：量筒中液体体积已读取为 30.0 mL。');
    advanceStep(4, '质量和体积都已得到，下一步计算液体密度。');
  };

  const handleDensity = (choice: 'correct' | 'high' | 'low') => {
    if (step !== 4 || completed) return;
    setDensityChoice(choice);
    if (!massMeasured || !volumeMeasured) {
      markError('请先获得质量和体积，再计算密度。');
      return;
    }
    if (choice === 'correct') {
      appendNote('密度计算：根据 ρ = m / V，得到液体密度为 1.20 g/cm³。');
      advanceStep(5, '密度计算正确，最后总结液体密度测量方法。');
      return;
    }
    if (choice === 'high') {
      markError('你把密度算大了，请重新用质量除以体积。');
      return;
    }
    markError('你把密度算小了，请重新核对质量和体积。');
  };

  const handleSummary = (choice: 'correct' | 'only-mass' | 'only-volume') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：先测质量，再读体积，最后用 ρ = m / V 计算液体密度。');
      return;
    }
    if (choice === 'only-mass') {
      markError('只测质量不能求出密度，还必须知道体积。');
      return;
    }
    markError('只测体积也不能求出密度，还必须知道质量。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setMassMeasured(false);
    setVolumeMeasured(false);
    setDensityChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新测量质量和体积，计算液体密度。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先记录质量，再读取量筒体积。', '体积要看凹液面最低处对应刻度。', '密度计算公式是 ρ = m / V。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对密度测量。',
        '建议重新执行“测质量 → 读体积 → 算密度”的流程。',
      ];

  return (
    <section className="panel playground-panel liquiddensity-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把天平读数、量筒凹液面和密度计算做成连续流程，让液体密度测量更接近真实操作。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid liquiddensity-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'balance' ? '天平读数' : '量筒刻度'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>准确度 {accuracyValue}</span><div className="chem-meter-bar"><i style={{ width: `${accuracyValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card liquiddensity-data-card"><span className="eyebrow">Readout</span><h3>密度读数板</h3><div className="generic-readout-grid liquiddensity-readout-grid"><article className={massMeasured ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>液体质量</span><strong>{massMeasured ? `${liquidMass.toFixed(1)} g` : '--'}</strong><small>{massMeasured ? '质量读数已准确记录。' : '先完成质量测量。'}</small></article><article className={volumeMeasured ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>液体体积</span><strong>{volumeMeasured ? `${liquidVolume.toFixed(1)} mL` : '--'}</strong><small>{volumeMeasured ? '体积已按凹液面读取。' : '先读取量筒体积。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>计算结果</span><strong>{densityChoice === 'correct' ? `${liquidDensity.toFixed(2)} g/cm³` : '等待计算'}</strong><small>利用 ρ = m / V 求液体密度。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '液体密度测量装置'} · 当前重点：{step <= 2 ? '测质量' : step === 3 ? '读体积' : '算密度'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'balance' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('balance')} type="button">天平</button><button className={cameraPreset === 'cylinder' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('cylinder')} type="button">量筒</button></div></div>

          <div className={`scene-canvas liquiddensity-stage preset-${cameraPreset} ${massMeasured ? 'mass' : ''} ${volumeMeasured ? 'volume' : ''}`}>
            <div className="liquiddensity-rig">
              <div className="ld-balance"><div className="ld-screen">{massMeasured ? `${liquidMass.toFixed(1)} g` : '--'}</div><div className={massMeasured ? 'ld-pan active' : 'ld-pan'} /></div>
              <div className="ld-beaker"><div className={massMeasured ? 'ld-liquid active' : 'ld-liquid'} /></div>
              <div className="ld-cylinder"><div className={volumeMeasured ? 'ld-column active' : 'ld-column'} /><div className={volumeMeasured ? 'ld-meniscus active' : 'ld-meniscus'} /></div>
            </div>
          </div>

          <div className="observation-ribbon liquiddensity-observation-row"><article className={massMeasured ? 'observation-chip active' : 'observation-chip calm'}><strong>质量测量</strong><span>{massMeasured ? '液体质量已准确记录。' : '先完成质量测量。'}</span></article><article className={volumeMeasured ? 'observation-chip active' : 'observation-chip calm'}><strong>体积读取</strong><span>{volumeMeasured ? '体积已按凹液面读取。' : '等待读取量筒体积。'}</span></article><article className={densityChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>密度计算</strong><span>{densityChoice === 'correct' ? '已正确求出液体密度。' : '等待完成密度计算。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleMass('correct')} type="button"><strong>记录液体质量为 36.0 g</strong><span>这是正确质量读数。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleMass('wrong')} type="button"><strong>把质量记成 63.0 g</strong><span>错误演示：读数颠倒。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleVolume('correct')} type="button"><strong>按凹液面读取体积为 30.0 mL</strong><span>这是正确体积读数。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleVolume('wrong')} type="button"><strong>把体积读成 38.0 mL</strong><span>错误演示：读数不准确。</span></button></> : null}{step === 4 ? <><button className={densityChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleDensity('correct')} type="button"><strong>计算 ρ = 36.0 ÷ 30.0 = 1.20 g/cm³</strong><span>这是本实验的正确结果。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleDensity('high')} type="button"><strong>计算密度为 2.00 g/cm³</strong><span>错误演示：结果偏大。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleDensity('low')} type="button"><strong>计算密度为 0.80 g/cm³</strong><span>错误演示：结果偏小。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>先测质量，再读体积，最后用 ρ = m / V 计算液体密度</strong><span>完整总结测量方法。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('only-mass')} type="button"><strong>只测质量就能知道密度</strong><span>错误演示：信息不完整。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('only-volume')} type="button"><strong>只测体积就能知道密度</strong><span>错误演示：信息不完整。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{massMeasured ? '质量已测' : '待测质量'} / {volumeMeasured ? '体积已读' : '待读体积'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意按凹液面最低处读数'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“测量液体密度”升级成带天平读数和凹液面判读的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
