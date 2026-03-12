import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'surface' | 'ripple';
type MaterialId = 'bowl' | 'water' | 'clip' | 'dropper' | 'detergent';
type TimelineState = 'done' | 'current' | 'todo';

interface SurfaceTensionLabPlayerProps {
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
  2: '让回形针轻放在水面',
  3: '滴入洗洁精',
  4: '观察回形针变化',
  5: '总结表面张力现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别水槽、清水、回形针、滴管和洗洁精。',
  2: '让回形针轻轻停留在水面，建立表面张力现象。',
  3: '再滴入少量洗洁精，观察水面状态变化。',
  4: '根据回形针是否下沉完成现象判断。',
  5: '总结表面张力及洗洁精对它的影响。',
};

const materialLabels: Record<MaterialId, string> = {
  bowl: '水槽',
  water: '清水',
  clip: '回形针',
  dropper: '滴管',
  detergent: '洗洁精',
};

const materialOrder: MaterialId[] = ['bowl', 'water', 'clip', 'dropper', 'detergent'];

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

export function SurfaceTensionLabPlayer({ experiment, onTelemetry }: SurfaceTensionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [clipFloated, setClipFloated] = useState(false);
  const [detergentDropped, setDetergentDropped] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过回形针漂浮和洗洁精破坏表面张力来观察水面现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const tensionValue = clamp(40 + (clipFloated ? 18 : 0) - (detergentDropped ? 16 : 0), 20, 98);
  const rippleValue = clamp(26 + (cameraPreset !== 'bench' ? 18 : 0) + (detergentDropped ? 28 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (clipFloated ? 10 : 0) + (detergentDropped ? 12 : 0), 20, 100);

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
        setCameraPreset('surface');
        advanceStep(2, '器材识别完成，先让回形针平稳停留在水面。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleFloatClip = (choice: 'correct' | 'throw') => {
    if (step !== 2 || completed) return;
    if (choice === 'throw') {
      markError('回形针需要轻放在水面，直接丢入会立刻下沉。');
      return;
    }
    setClipFloated(true);
    appendNote('表面建立：回形针已轻放在水面上，暂时保持漂浮。');
    advanceStep(3, '回形针已漂浮，下一步滴入洗洁精。');
  };

  const handleDropDetergent = (choice: 'correct' | 'water') => {
    if (step !== 3 || completed) return;
    if (!clipFloated) {
      markError('请先让回形针稳定漂浮，再滴加液体。');
      return;
    }
    if (choice === 'water') {
      markError('继续加清水不会明显破坏表面张力，请滴入洗洁精。');
      return;
    }
    setDetergentDropped(true);
    setCameraPreset('ripple');
    appendNote('变量改变：洗洁精滴入后，水面张力开始被削弱。');
    advanceStep(4, '液滴已加入，请观察回形针的变化。');
  };

  const handleObserve = (choice: 'correct' | 'still-float' | 'water-level') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!clipFloated || !detergentDropped) {
      markError('请先完成回形针漂浮和滴加洗洁精两个步骤。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：洗洁精削弱表面张力后，回形针下沉。');
      advanceStep(5, '现象判断正确，最后总结水的表面张力现象。');
      return;
    }
    if (choice === 'still-float') {
      markError('滴入洗洁精后，回形针通常会失去支撑而下沉。');
      return;
    }
    markError('关键变化不是水位高低，而是水面张力减弱导致回形针下沉。');
  };

  const handleSummary = (choice: 'correct' | 'no-tension' | 'detergent-stronger') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：水具有表面张力，可支撑轻小物体；洗洁精会削弱表面张力。');
      return;
    }
    if (choice === 'no-tension') {
      markError('回形针能短暂停留在水面，正说明水具有表面张力。');
      return;
    }
    markError('洗洁精不是增强，而是削弱水的表面张力。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setClipFloated(false);
    setDetergentDropped(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察表面张力现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先轻放回形针，再滴入洗洁精。', '现象重点是“漂浮 → 下沉”的变化。', '总结时抓住“水有表面张力，洗洁精会削弱它”。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对表面张力现象。',
        '建议按“轻放回形针 → 滴洗洁精 → 观察下沉 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel surfacetension-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属科学实验页</h2>
          <p>把回形针漂浮、水面弯月面和洗洁精扩散涟漪做成动态场景，让表面张力更接近真实演示。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid surfacetension-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'surface' ? '水面近景' : '涟漪观察'}</span></div><span className="badge">{experiment.grade}</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div>
            </div>
          </section>
          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>表面张力 {tensionValue}</span><div className="chem-meter-bar"><i style={{ width: `${tensionValue}%` }} /></div></div>
              <div className="chem-meter"><span>涟漪强度 {rippleValue}</span><div className="chem-meter-bar"><i style={{ width: `${rippleValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
          <section className="info-card surfacetension-data-card">
            <span className="eyebrow">Readout</span>
            <h3>水面读数板</h3>
            <div className="generic-readout-grid surfacetension-readout-grid">
              <article className={clipFloated ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>回形针状态</span>
                <strong>{detergentDropped ? '开始下沉' : clipFloated ? '轻浮于水面' : '--'}</strong>
                <small>{clipFloated ? '轻放后可短暂停留在水面。' : '先让回形针轻放在水面。'}</small>
              </article>
              <article className={detergentDropped ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>液滴状态</span>
                <strong>{detergentDropped ? '洗洁精已扩散' : '--'}</strong>
                <small>{detergentDropped ? '洗洁精进入水面后张力减弱。' : '再滴入少量洗洁精。'}</small>
              </article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>核心结论</span>
                <strong>{summaryChoice === 'correct' ? '水有表面张力' : '等待总结'}</strong>
                <small>洗洁精会削弱表面张力，使回形针下沉。</small>
              </article>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '水的表面张力装置'} · 当前重点：{step <= 2 ? '建立漂浮状态' : step === 3 ? '加入洗洁精' : '观察回形针下沉'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'surface' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('surface')} type="button">水面</button>
              <button className={cameraPreset === 'ripple' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('ripple')} type="button">涟漪</button>
            </div>
          </div>

          <div className={`scene-canvas surfacetension-stage preset-${cameraPreset} ${clipFloated ? 'clip-floated' : ''} ${detergentDropped ? 'detergent-dropped' : ''} ${observationChoice === 'correct' ? 'observed' : ''}`}>
            <div className="surfacetension-rig">
              <div className="st-bowl"><div className={clipFloated ? 'st-water active' : 'st-water'} /></div>
              <div className={clipFloated ? 'st-clip active' : 'st-clip'} />
              <div className={detergentDropped ? 'st-ripple active' : 'st-ripple'} />
              <div className={detergentDropped ? 'st-dropper active' : 'st-dropper'} />
              <div className={detergentDropped ? 'st-drop active' : 'st-drop'} />
            </div>
          </div>

          <div className="observation-ribbon surfacetension-observation-row">
            <article className={clipFloated ? 'observation-chip active' : 'observation-chip calm'}><strong>初始状态</strong><span>{clipFloated ? '回形针已轻放在水面。' : '先建立回形针漂浮。'}</span></article>
            <article className={detergentDropped ? 'observation-chip active' : 'observation-chip calm'}><strong>变量变化</strong><span>{detergentDropped ? '洗洁精已滴入水面。' : '等待加入洗洁精。'}</span></article>
            <article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>最终现象</strong><span>{observationChoice === 'correct' ? '已观察到回形针下沉。' : '等待完成现象判断。'}</span></article>
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
                <button className="summary-choice generic-choice primary" onClick={() => handleFloatClip('correct')} type="button"><strong>让回形针轻轻停留在水面</strong><span>建立表面张力支撑现象。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleFloatClip('throw')} type="button"><strong>把回形针直接丢进水里</strong><span>错误演示：会直接下沉。</span></button>
              </> : null}
              {step === 3 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleDropDetergent('correct')} type="button"><strong>滴入少量洗洁精</strong><span>改变水面张力条件。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleDropDetergent('water')} type="button"><strong>继续往里加清水</strong><span>错误演示：变量没有按要求改变。</span></button>
              </> : null}
              {step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“滴入洗洁精后回形针下沉”</strong><span>这是本实验的正确现象。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('still-float')} type="button"><strong>记录“回形针仍稳定漂浮不变”</strong><span>错误演示：忽略张力变化。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleObserve('water-level')} type="button"><strong>记录“主要变化只是水位升高”</strong><span>错误演示：抓错观察重点。</span></button>
              </> : null}
              {step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>水具有表面张力，可支撑轻小物体；洗洁精会削弱表面张力</strong><span>完整总结本实验结论。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-tension')} type="button"><strong>水面本来就没有表面张力</strong><span>错误演示：与实验矛盾。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleSummary('detergent-stronger')} type="button"><strong>洗洁精会让表面张力更强</strong><span>错误演示：方向反了。</span></button>
              </> : null}
            </div>
          </section>
          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{clipFloated ? '已漂浮' : '待漂浮'} / {detergentDropped ? '已滴液' : '待滴液'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意轻放回形针，并用洗洁精改变水面张力'}</li>
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
            <small>这页已把“水的表面张力”升级成水面涟漪和回形针漂浮的专属页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
