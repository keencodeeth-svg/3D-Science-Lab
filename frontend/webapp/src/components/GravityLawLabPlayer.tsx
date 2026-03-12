import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'scale' | 'compare';
type MaterialId = 'stand' | 'scale' | 'hook' | 'mass-50' | 'mass-100';
type TimelineState = 'done' | 'current' | 'todo';

interface GravityLawLabPlayerProps {
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
  2: '测量 50g 物体重力',
  3: '测量 100g 物体重力',
  4: '比较质量与重力读数',
  5: '总结重力大小规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别铁架台、弹簧测力计、挂钩和不同质量钩码。',
  2: '先挂上较小质量物体，记录第一组重力读数。',
  3: '再换上较大质量物体，比较读数变化。',
  4: '根据两次测量结果比较质量与重力的关系。',
  5: '总结质量变化时重力大小规律。',
};

const materialLabels: Record<MaterialId, string> = {
  stand: '铁架台',
  scale: '弹簧测力计',
  hook: '挂钩',
  'mass-50': '50g 钩码',
  'mass-100': '100g 钩码',
};

const materialOrder: MaterialId[] = ['stand', 'scale', 'hook', 'mass-50', 'mass-100'];

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

export function GravityLawLabPlayer({ experiment, onTelemetry }: GravityLawLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [lightMeasured, setLightMeasured] = useState(false);
  const [heavyMeasured, setHeavyMeasured] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过两组不同质量钩码的读数比较重力大小规律。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const gravityValue = clamp(30 + (lightMeasured ? 18 : 0) + (heavyMeasured ? 30 : 0), 24, 99);
  const precisionValue = clamp(38 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 16 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (lightMeasured ? 10 : 0) + (heavyMeasured ? 14 : 0), 20, 100);

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
        setCameraPreset('scale');
        advanceStep(2, '器材识别完成，先测量 50g 钩码的重力。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleLightMeasure = (choice: 'correct' | 'none') => {
    if (step !== 2 || completed) return;
    if (choice === 'none') {
      markError('请先挂上 50g 钩码后再读取测力计示数。');
      return;
    }
    setLightMeasured(true);
    appendNote('第一次测量：50g 钩码对应的重力示数约为 0.5N。');
    advanceStep(3, '第一组数据已记录，下一步测量 100g 钩码的重力。');
  };

  const handleHeavyMeasure = (choice: 'correct' | 'same') => {
    if (step !== 3 || completed) return;
    if (!lightMeasured) {
      markError('请先完成 50g 钩码的测量，再更换更大质量的物体。');
      return;
    }
    if (choice === 'same') {
      markError('此步需要更换成更大质量的钩码，才能比较大小规律。');
      return;
    }
    setHeavyMeasured(true);
    setCameraPreset('compare');
    appendNote('第二次测量：100g 钩码对应的重力示数约为 1.0N。');
    advanceStep(4, '两组数据已具备，请比较质量和重力读数的关系。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'inverse') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!lightMeasured || !heavyMeasured) {
      markError('请先完成两组不同质量物体的重力测量。');
      return;
    }
    if (choice === 'correct') {
      appendNote('数据比较：质量增大时，重力读数也随之增大。');
      advanceStep(5, '现象判断正确，最后总结重力与质量的关系。');
      return;
    }
    if (choice === 'same') {
      markError('两次示数并不相同，较大质量对应更大重力。');
      return;
    }
    markError('质量增大不会让重力变小，读数方向判断反了。');
  };

  const handleSummary = (choice: 'correct' | 'no-change' | 'inverse') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：物体所受重力大小跟质量成正比，质量越大，重力越大。');
      return;
    }
    if (choice === 'no-change') {
      markError('重力并不是固定不变的，它会随质量变化。');
      return;
    }
    markError('质量越大，重力通常越大，不会反向减小。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setLightMeasured(false);
    setHeavyMeasured(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新测量不同质量物体的重力。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先测较小质量，再测较大质量。', '读数比较时抓住“质量增大，示数增大”。', '总结时使用“重力与质量成正比”。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对测力计示数。',
        '建议按“50g → 100g → 比较读数 → 总结规律”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel gravitylaw-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把弹簧测力计的指针读数和不同质量钩码的变化做成对照场景，让大小规律更直观。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid gravitylaw-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'scale' ? '测力计近景' : '读数比较'}</span></div><span className="badge">{experiment.grade}</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div>
            </div>
          </section>
          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>重力读数趋势 {gravityValue}</span><div className="chem-meter-bar"><i style={{ width: `${gravityValue}%` }} /></div></div>
              <div className="chem-meter"><span>读数精度 {precisionValue}</span><div className="chem-meter-bar"><i style={{ width: `${precisionValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
          <section className="info-card gravitylaw-data-card">
            <span className="eyebrow">Readout</span>
            <h3>测力计读数板</h3>
            <div className="generic-readout-grid gravitylaw-readout-grid">
              <article className={lightMeasured ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>50g 钩码</span>
                <strong>{lightMeasured ? '约 0.5N' : '--'}</strong>
                <small>{lightMeasured ? '较小质量对应较小重力示数。' : '先完成第一组测量。'}</small>
              </article>
              <article className={heavyMeasured ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>100g 钩码</span>
                <strong>{heavyMeasured ? '约 1.0N' : '--'}</strong>
                <small>{heavyMeasured ? '较大质量对应更大重力示数。' : '再完成第二组测量。'}</small>
              </article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>核心结论</span>
                <strong>{summaryChoice === 'correct' ? '质量越大，重力越大' : '等待总结'}</strong>
                <small>在同一地点，物体所受重力大小跟质量成正比。</small>
              </article>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '弹簧测力计'} · 当前重点：{step <= 2 ? '记录第一组读数' : step === 3 ? '更换较大质量' : '比较重力与质量'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'scale' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('scale')} type="button">测力计</button>
              <button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对比</button>
            </div>
          </div>

          <div className={`scene-canvas gravitylaw-stage preset-${cameraPreset} ${lightMeasured ? 'light-measured' : ''} ${heavyMeasured ? 'heavy-measured' : ''}`}>
            <div className="gravitylaw-rig">
              <div className="gl-stand" />
              <div className="gl-scale">
                <div className="gl-dial" />
                <div className="gl-spring" />
                <div className="gl-pointer" />
                <div className="gl-hook" />
              </div>
              <div className={lightMeasured && !heavyMeasured ? 'gl-mass light active hook' : lightMeasured ? 'gl-mass light active' : 'gl-mass light'} />
              <div className={heavyMeasured ? 'gl-mass heavy active hook' : 'gl-mass heavy'} />
              <div className="gl-readout light">0.5N</div>
              <div className="gl-readout heavy">1.0N</div>
            </div>
          </div>

          <div className="observation-ribbon gravitylaw-observation-row">
            <article className={lightMeasured ? 'observation-chip active' : 'observation-chip calm'}><strong>第一组读数</strong><span>{lightMeasured ? '50g 钩码重力已记录。' : '先完成 50g 钩码测量。'}</span></article>
            <article className={heavyMeasured ? 'observation-chip active' : 'observation-chip calm'}><strong>第二组读数</strong><span>{heavyMeasured ? '100g 钩码重力已记录。' : '等待更大质量对照。'}</span></article>
            <article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>规律比较</strong><span>{observationChoice === 'correct' ? '已判断质量增大时重力增大。' : '等待完成读数比较。'}</span></article>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}>
            <span className="eyebrow">Lab Prompt</span>
            <h3>{completed ? '实验已完成' : stepTitles[step]}</h3>
            <p>{prompt}</p>
          </div>
          <section className="info-card generic-notebook-card">
            <div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div>
            <div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div>
            <div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div>
          </section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>当前步骤操作</h3>
            <div className="summary-stack generic-choice-stack">
              {step === 1 ? materialOrder.map((materialId) => (
                <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button">
                  <strong>识别 {materialLabels[materialId]}</strong>
                  <span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span>
                </button>
              )) : null}
              {step === 2 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleLightMeasure('correct')} type="button"><strong>挂上 50g 钩码并记录约 0.5N</strong><span>形成第一组质量-重力数据。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleLightMeasure('none')} type="button"><strong>不挂物体直接判断</strong><span>错误演示：没有形成有效测量。</span></button>
              </> : null}
              {step === 3 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleHeavyMeasure('correct')} type="button"><strong>换成 100g 钩码并记录约 1.0N</strong><span>建立较大质量对照。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleHeavyMeasure('same')} type="button"><strong>继续使用同一质量钩码</strong><span>错误演示：变量没有改变。</span></button>
              </> : null}
              {step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“质量增大，重力读数也增大”</strong><span>这是本实验的正确现象。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“两次读数相同”</strong><span>错误演示：忽略差异。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleObserve('inverse')} type="button"><strong>记录“质量越大，重力越小”</strong><span>错误演示：方向相反。</span></button>
              </> : null}
              {step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>物体所受重力大小跟质量成正比，质量越大，重力越大</strong><span>完整总结本实验结论。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-change')} type="button"><strong>不同质量物体的重力几乎不变</strong><span>错误演示：与实验不符。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleSummary('inverse')} type="button"><strong>质量增加会让重力减小</strong><span>错误演示：规律判断反了。</span></button>
              </> : null}
            </div>
          </section>
          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{lightMeasured ? '50g 已测' : '50g 待测'} / {heavyMeasured ? '100g 已测' : '100g 待测'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意用不同质量的钩码形成有效对照'}</li>
            </ul>
          </section>
          <section className="info-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul>
          </section>
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>实验控制</h3>
            <div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div>
            <small>这页已把“探究重力大小规律”升级成弹簧测力计读数对比的专属页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
