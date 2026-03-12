import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'rod' | 'paper';
type MaterialId = 'plastic-rod' | 'wool-cloth' | 'paper-bits' | 'stand' | 'comb';
type TimelineState = 'done' | 'current' | 'todo';

interface StaticElectricityLabPlayerProps {
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
  2: '摩擦塑料棒',
  3: '靠近纸屑',
  4: '观察吸引现象',
  5: '总结摩擦起电',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别塑料棒、毛呢布、纸屑、支架和塑料梳。',
  2: '用毛呢布来回摩擦塑料棒，使其带电。',
  3: '把带电塑料棒慢慢靠近纸屑。',
  4: '观察纸屑是否被吸引、跳起并粘向塑料棒。',
  5: '总结摩擦起电和带电体吸引轻小物体的现象。',
};

const materialLabels: Record<MaterialId, string> = {
  'plastic-rod': '塑料棒',
  'wool-cloth': '毛呢布',
  'paper-bits': '纸屑',
  stand: '支架',
  comb: '塑料梳',
};

const materialOrder: MaterialId[] = ['plastic-rod', 'wool-cloth', 'paper-bits', 'stand', 'comb'];

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

export function StaticElectricityLabPlayer({ experiment, onTelemetry }: StaticElectricityLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [charged, setCharged] = useState(false);
  const [approached, setApproached] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先摩擦塑料棒，再靠近纸屑观察带电体的吸引现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const chargeValue = clamp(42 + (charged ? 20 : 0) + (approached ? 16 : 0) + (observationChoice === 'correct' ? 14 : 0), 24, 99);
  const clarityValue = clamp(40 + (approached ? 20 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 24, 99);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const readinessValue = clamp(progressPercent + (charged ? 14 : 0) + (approached ? 18 : 0), 20, 100);

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
        setCameraPreset('rod');
        advanceStep(2, '器材识别完成，先用毛呢布摩擦塑料棒。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleCharge = (choice: 'correct' | 'light') => {
    if (step !== 2 || completed) return;
    if (choice === 'light') {
      markError('摩擦要足够充分，轻轻碰一下不容易积累明显静电。');
      return;
    }
    setCharged(true);
    appendNote('操作记录：塑料棒经毛呢布充分摩擦后已带电。');
    advanceStep(3, '塑料棒已带电，下一步把它慢慢靠近纸屑。');
  };

  const handleApproach = (choice: 'correct' | 'far') => {
    if (step !== 3 || completed) return;
    if (!charged) {
      markError('请先完成充分摩擦，再靠近纸屑。');
      return;
    }
    if (choice === 'far') {
      markError('塑料棒需要靠近纸屑，距离太远时吸引现象不明显。');
      return;
    }
    setApproached(true);
    setCameraPreset('paper');
    appendNote('实验现象：塑料棒靠近后，纸屑开始跳起并向带电体聚拢。');
    advanceStep(4, '纸屑已被吸引，请判断现象是否符合摩擦起电。');
  };

  const handleObserve = (choice: 'correct' | 'repel' | 'nothing') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!approached) {
      markError('请先把带电塑料棒靠近纸屑，再观察现象。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：带电塑料棒能吸引轻小纸屑，部分纸屑会短暂粘附在棒上。');
      advanceStep(5, '现象判断完成，最后总结摩擦起电规律。');
      return;
    }
    if (choice === 'repel') {
      markError('开始时更典型的现象是吸引纸屑，而不是直接把纸屑都排开。');
      return;
    }
    markError('正确操作后不应毫无现象，纸屑通常会被吸引。');
  };

  const handleSummary = (choice: 'correct' | 'heat-only' | 'all-heavy') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：物体经摩擦可带电，带电体能吸引轻小物体。');
      return;
    }
    if (choice === 'heat-only') {
      markError('关键不是“发热”，而是摩擦使物体带上了电荷。');
      return;
    }
    markError('带电体更容易吸引轻小物体，不是把所有较重物体都吸起来。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setCharged(false);
    setApproached(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新摩擦塑料棒并靠近纸屑观察吸引现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '摩擦要充分，带电现象才明显。',
        '塑料棒要靠近纸屑再观察。',
        '总结时记住“带电体吸引轻小物体”。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对纸屑变化。',
        '建议重新执行“摩擦带电 → 靠近纸屑 → 观察吸引”的流程。',
      ];

  return (
    <section className="panel playground-panel staticelectricity-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属小学科学实验页</h2>
          <p>把“摩擦起电吸纸屑”做成更有反馈的近场实验，让孩子直观看到带电体真的会吸引轻小物体。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid staticelectricity-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'rod' ? '摩擦充电' : '纸屑吸引'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>带电度 {chargeValue}</span><div className="chem-meter-bar"><i style={{ width: `${chargeValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card staticelectricity-data-card"><span className="eyebrow">Readout</span><h3>静电读数板</h3><div className="generic-readout-grid staticelectricity-readout-grid"><article className={charged ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>塑料棒状态</span><strong>{charged ? '已带电' : '待摩擦'}</strong><small>{charged ? '充分摩擦后带电现象更明显。' : '先用毛呢布充分摩擦塑料棒。'}</small></article><article className={approached ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>纸屑变化</span><strong>{approached ? '开始被吸引' : '待靠近'}</strong><small>{approached ? '轻小纸屑会跳起并靠向塑料棒。' : '带电后再把塑料棒靠近纸屑。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '带电体吸引轻小物体' : '等待总结'}</strong><small>物体经摩擦可带电，带电体能吸引轻小物体。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '摩擦起电装置'} · 当前重点：{step <= 2 ? '摩擦带电' : step === 3 ? '靠近纸屑' : '观察吸引与总结'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'rod' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('rod')} type="button">塑料棒</button><button className={cameraPreset === 'paper' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('paper')} type="button">纸屑</button></div></div>

          <div className={`scene-canvas staticelectricity-stage preset-${cameraPreset} ${charged ? 'charged' : ''} ${approached ? 'approached' : ''}`}>
            <div className="staticelectricity-rig">
              <div className={charged ? 'se-rod charged' : 'se-rod'} />
              <div className={charged ? 'se-cloth active' : 'se-cloth'} />
              <div className={charged ? 'se-charge-ring active' : 'se-charge-ring'} />
              <div className="se-paper-field">
                <span className={approached ? 'se-paper paper-a active' : 'se-paper paper-a'} />
                <span className={approached ? 'se-paper paper-b active' : 'se-paper paper-b'} />
                <span className={approached ? 'se-paper paper-c active' : 'se-paper paper-c'} />
                <span className={approached ? 'se-paper paper-d active' : 'se-paper paper-d'} />
              </div>
            </div>
          </div>

          <div className="observation-ribbon staticelectricity-observation-row"><article className={charged ? 'observation-chip active' : 'observation-chip calm'}><strong>摩擦带电</strong><span>{charged ? '塑料棒已通过摩擦带电。' : '先完成充分摩擦。'}</span></article><article className={approached ? 'observation-chip active' : 'observation-chip calm'}><strong>靠近纸屑</strong><span>{approached ? '纸屑已开始跳起并聚向塑料棒。' : '带电后再靠近纸屑。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>现象判断</strong><span>{observationChoice === 'correct' ? '带电体吸引轻小纸屑。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleCharge('correct')} type="button"><strong>充分摩擦塑料棒</strong><span>让塑料棒带上较明显静电。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCharge('light')} type="button"><strong>只轻轻擦一下</strong><span>错误演示：带电不明显。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleApproach('correct')} type="button"><strong>把塑料棒慢慢靠近纸屑</strong><span>观察吸引是否发生。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleApproach('far')} type="button"><strong>距离纸屑太远</strong><span>错误演示：现象不明显。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“纸屑被吸引并跳向塑料棒”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('repel')} type="button"><strong>记录“纸屑一开始就全部被排开”</strong><span>错误演示：与典型现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('nothing')} type="button"><strong>记录“完全没有变化”</strong><span>错误演示：忽略带电吸引。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>物体经摩擦可带电，带电体能吸引轻小物体</strong><span>完整总结摩擦起电。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('heat-only')} type="button"><strong>纸屑被吸引只是因为摩擦发热</strong><span>错误演示：忽略带电本质。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('all-heavy')} type="button"><strong>带电体能吸起所有较重物体</strong><span>错误演示：概括过度。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{charged ? '塑料棒已带电' : '待带电'} / {approached ? '已靠近纸屑' : '待靠近'} / {observationChoice === 'correct' ? '已观察到吸引' : '待观察'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意充分摩擦并近距离观察吸引'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“摩擦起电”升级成带电反馈和纸屑吸引更明显的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
