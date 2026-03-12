import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'balance' | 'flask';
type MaterialId = 'balance' | 'flask' | 'balloon' | 'acid-dropper' | 'powder-cup';
type TimelineState = 'done' | 'current' | 'todo';

interface MassConservationLabPlayerProps {
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
  2: '记录反应前质量',
  3: '密闭触发反应',
  4: '比较反应前后质量',
  5: '总结质量守恒',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别电子天平、锥形瓶、气球、滴管和药品杯。',
  2: '把密闭装置放在天平上，先记录反应前总质量。',
  3: '保持装置密闭后再触发反应，观察气球鼓起。',
  4: '比较反应前后天平读数是否变化。',
  5: '总结密闭体系中化学反应前后总质量的关系。',
};

const materialLabels: Record<MaterialId, string> = {
  balance: '电子天平',
  flask: '锥形瓶',
  balloon: '气球',
  'acid-dropper': '滴管',
  'powder-cup': '药品杯',
};

const materialOrder: MaterialId[] = ['balance', 'flask', 'balloon', 'acid-dropper', 'powder-cup'];

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

export function MassConservationLabPlayer({ experiment, onTelemetry }: MassConservationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [baselineMeasured, setBaselineMeasured] = useState(false);
  const [reacted, setReacted] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先记录反应前总质量，再在密闭条件下触发反应。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const beforeMass = baselineMeasured ? 126.4 : 0;
  const afterMass = reacted ? 126.4 : beforeMass;
  const massDelta = reacted ? Math.abs(afterMass - beforeMass) : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const balanceValue = clamp(42 + (baselineMeasured ? 18 : 0) + (reacted ? 18 : 0) + (observationChoice === 'correct' ? 16 : 0), 24, 99);
  const clarityValue = clamp(42 + (reacted ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (baselineMeasured ? 14 : 0) + (reacted ? 18 : 0), 20, 100);

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
        advanceStep(2, '器材识别完成，先记录反应前总质量。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleBaseline = (choice: 'correct' | 'tilted') => {
    if (step !== 2 || completed) return;
    if (choice === 'tilted') {
      markError('请先把装置平稳放在天平中央，再记录反应前质量。');
      return;
    }
    setBaselineMeasured(true);
    appendNote(`读数记录：反应前总质量约 ${beforeMass.toFixed(1)} g。`);
    advanceStep(3, '基准质量已记录，下一步在密闭条件下触发反应。');
  };

  const handleReaction = (choice: 'correct' | 'open') => {
    if (step !== 3 || completed) return;
    if (!baselineMeasured) {
      markError('请先记录反应前总质量，再触发反应。');
      return;
    }
    if (choice === 'open') {
      markError('本实验必须保持密闭，不能让生成气体逸出。');
      return;
    }
    setReacted(true);
    setCameraPreset('flask');
    appendNote('实验现象：锥形瓶内发生反应，生成气体使气球鼓起。');
    advanceStep(4, '反应已发生，请比较反应前后总质量是否变化。');
  };

  const handleObserve = (choice: 'correct' | 'larger' | 'smaller') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!reacted) {
      markError('请先触发密闭反应，再比较质量变化。');
      return;
    }
    if (choice === 'correct') {
      appendNote(`比较结果：气球鼓起但天平读数仍约 ${afterMass.toFixed(1)} g，前后差值接近 ${massDelta.toFixed(1)} g。`);
      advanceStep(5, '比较完成，最后总结质量守恒规律。');
      return;
    }
    if (choice === 'larger') {
      markError('天平读数并没有明显增大，密闭体系总质量保持不变。');
      return;
    }
    markError('天平读数也没有明显减小，生成气体仍保留在体系中。');
  };

  const handleSummary = (choice: 'correct' | 'gas-loss' | 'liquid-only') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：在密闭体系中，化学反应前后总质量保持不变。');
      return;
    }
    if (choice === 'gas-loss') {
      markError('这里生成的气体没有逸出，仍在密闭体系中，所以总质量不变。');
      return;
    }
    markError('不能只看液体或固体，应该比较整个密闭体系的总质量。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setBaselineMeasured(false);
    setReacted(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新记录反应前质量并比较密闭反应后的总质量。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先记录反应前总质量，再触发反应。',
        '整个过程中要保持装置密闭。',
        '总结时比较的是“整个体系”的质量，不是某一部分。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对质量变化。',
        '建议重新执行“称量前 → 密闭反应 → 比较前后读数”的流程。',
      ];

  return (
    <section className="panel playground-panel massconservation-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把“气球鼓起但总质量不变”做成同屏对照，让质量守恒不再停留在口头结论。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid massconservation-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'balance' ? '天平读数' : '反应瓶细节'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>守恒度 {balanceValue}</span><div className="chem-meter-bar"><i style={{ width: `${balanceValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card massconservation-data-card"><span className="eyebrow">Readout</span><h3>守恒读数板</h3><div className="generic-readout-grid massconservation-readout-grid"><article className={baselineMeasured ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>反应前质量</span><strong>{baselineMeasured ? `${beforeMass.toFixed(1)} g` : '--'}</strong><small>{baselineMeasured ? '密闭装置的基准总质量。' : '先放稳天平并记录读数。'}</small></article><article className={reacted ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>反应后质量</span><strong>{reacted ? `${afterMass.toFixed(1)} g` : '--'}</strong><small>{reacted ? '气球鼓起，但总质量仍保持稳定。' : '先在密闭条件下触发反应。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '密闭体系总质量不变' : '等待总结'}</strong><small>化学反应前后比较的是整个体系的总质量。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '质量守恒装置'} · 当前重点：{step <= 2 ? '建立基准质量' : step === 3 ? '密闭反应' : '比较前后读数'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'balance' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('balance')} type="button">天平</button><button className={cameraPreset === 'flask' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flask')} type="button">反应瓶</button></div></div>

          <div className={`scene-canvas massconservation-stage preset-${cameraPreset} ${baselineMeasured ? 'measured' : ''} ${reacted ? 'reacted' : ''}`}>
            <div className="massconservation-rig">
              <div className="mc-balance-base" />
              <div className="mc-balance-screen">{(reacted ? afterMass : beforeMass).toFixed(1)} g</div>
              <div className={reacted ? 'mc-balance-pointer stable' : baselineMeasured ? 'mc-balance-pointer stable' : 'mc-balance-pointer'} />
              <div className="mc-tray left">
                <div className="mc-flask">
                  <div className={reacted ? 'mc-liquid active' : 'mc-liquid'} />
                  <div className={reacted ? 'mc-bubble bubble-1 active' : 'mc-bubble bubble-1'} />
                  <div className={reacted ? 'mc-bubble bubble-2 active' : 'mc-bubble bubble-2'} />
                  <div className={reacted ? 'mc-balloon active' : 'mc-balloon'} />
                </div>
              </div>
              <div className="mc-tray right">
                <div className="mc-weight weight-a" />
                <div className="mc-weight weight-b" />
                <div className="mc-weight weight-c" />
              </div>
              <div className="mc-dropper" />
              <div className="mc-powder-cup" />
            </div>
          </div>

          <div className="observation-ribbon massconservation-observation-row"><article className={baselineMeasured ? 'observation-chip active' : 'observation-chip calm'}><strong>基准质量</strong><span>{baselineMeasured ? `已记录 ${beforeMass.toFixed(1)} g。` : '先记录反应前总质量。'}</span></article><article className={reacted ? 'observation-chip active' : 'observation-chip calm'}><strong>反应现象</strong><span>{reacted ? '气球鼓起，说明有气体生成。' : '密闭反应后再观察。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>质量比较</strong><span>{observationChoice === 'correct' ? '前后总质量保持不变。' : '等待完成读数比较。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleBaseline('correct')} type="button"><strong>平稳放上装置并记录反应前质量</strong><span>建立密闭体系的基准值。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleBaseline('tilted')} type="button"><strong>歪斜放置后直接读数</strong><span>错误演示：读数不可靠。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleReaction('correct')} type="button"><strong>保持密闭后触发反应</strong><span>观察气球鼓起与质量读数。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleReaction('open')} type="button"><strong>打开装置让气体逸出</strong><span>错误演示：破坏密闭体系。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“反应前后总质量不变”</strong><span>这是本实验的正确结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('larger')} type="button"><strong>记录“反应后质量更大”</strong><span>错误演示：与读数不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('smaller')} type="button"><strong>记录“反应后质量更小”</strong><span>错误演示：忽略密闭条件。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>在密闭体系中，化学反应前后总质量保持不变</strong><span>完整总结质量守恒规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('gas-loss')} type="button"><strong>生成气体后总质量一定减小</strong><span>错误演示：忽略气体仍在体系中。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('liquid-only')} type="button"><strong>只比较液体质量就能判断守恒</strong><span>错误演示：没有看整体。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{baselineMeasured ? `反应前 ${beforeMass.toFixed(1)} g` : '待称量'} / {reacted ? '已发生密闭反应' : '待反应'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意保持密闭并比较整体质量'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“质量守恒”升级成密闭反应 + 读数同步的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
