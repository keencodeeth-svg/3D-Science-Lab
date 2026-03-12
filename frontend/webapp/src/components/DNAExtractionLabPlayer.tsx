import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tube' | 'precipitate';
type MaterialId = 'fruit-pulp' | 'lysis-solution' | 'filter-funnel' | 'alcohol' | 'test-tube';
type TimelineState = 'done' | 'current' | 'todo';

interface DNAExtractionLabPlayerProps {
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
  2: '加入裂解液并过滤',
  3: '沿壁加入冷酒精',
  4: '观察 DNA 析出',
  5: '总结粗提取原理',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别果泥、裂解液、过滤漏斗、冷酒精和试管。',
  2: '将果泥与裂解液混合后过滤，获得滤液。',
  3: '沿试管壁缓慢加入冷酒精，形成清晰分层。',
  4: '观察液体分界处是否析出白色丝状物。',
  5: '总结 DNA 在酒精中溶解度低，因此会析出。',
};

const materialLabels: Record<MaterialId, string> = {
  'fruit-pulp': '果泥',
  'lysis-solution': '裂解液',
  'filter-funnel': '过滤漏斗',
  alcohol: '冷酒精',
  'test-tube': '试管',
};

const materialOrder: MaterialId[] = ['fruit-pulp', 'lysis-solution', 'filter-funnel', 'alcohol', 'test-tube'];

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

export function DNAExtractionLabPlayer({ experiment, onTelemetry }: DNAExtractionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [filtered, setFiltered] = useState(false);
  const [alcoholAdded, setAlcoholAdded] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过果泥滤液与冷酒精分层观察 DNA 的粗提取现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const layeringValue = clamp(28 + (filtered ? 18 : 0) + (alcoholAdded ? 24 : 0), 20, 99);
  const filamentValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (filtered ? 10 : 0) + (alcoholAdded ? 14 : 0), 20, 100);

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
        setCameraPreset('tube');
        advanceStep(2, '器材识别完成，先处理果泥并过滤得到滤液。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleFilter = (choice: 'correct' | 'skip') => {
    if (step !== 2 || completed) return;
    if (choice === 'skip') {
      markError('应先把果泥与裂解液处理并过滤，得到较清晰的滤液。');
      return;
    }
    setFiltered(true);
    appendNote('处理完成：果泥滤液已进入试管下层。');
    advanceStep(3, '滤液已获得，下一步沿壁加入冷酒精。');
  };

  const handleAlcohol = (choice: 'correct' | 'mix') => {
    if (step !== 3 || completed) return;
    if (!filtered) {
      markError('请先获得滤液，再加入冷酒精。');
      return;
    }
    if (choice === 'mix') {
      markError('酒精应沿壁缓慢加入形成分层，不能与滤液剧烈混合。');
      return;
    }
    setAlcoholAdded(true);
    setCameraPreset('precipitate');
    appendNote('加液完成：试管内已形成上层酒精和下层滤液的分层界面。');
    advanceStep(4, '酒精已加入，请观察分界处是否出现白色丝状物。');
  };

  const handleObserve = (choice: 'correct' | 'bubble' | 'dissolve') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!filtered || !alcoholAdded) {
      markError('请先过滤并加入冷酒精，再观察析出物。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：液体分界处出现白色絮状、丝状 DNA 析出物。');
      advanceStep(5, '已观察到 DNA 析出，下一步总结粗提取原理。');
      return;
    }
    markError(choice === 'bubble' ? '本实验重点不是冒气泡，而是白色丝状析出物。' : 'DNA 不会在冷酒精中继续溶解，相反会析出。');
  };

  const handleSummary = (choice: 'correct' | 'mix' | 'nothing') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：DNA 在酒精中溶解度低，在分界处会以白色丝状物形式析出。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'mix' ? '若酒精与滤液完全混匀，就不利于在界面处观察 DNA 析出。' : '实验并非没有现象，白色丝状物正是粗提取的关键证据。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setFiltered(false);
    setAlcoholAdded(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新进行水果 DNA 粗提取。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先过滤得到滤液，再沿壁加入冷酒精。', '保持液体分层，不要剧烈混合。', '观察时重点看分界处白色丝状物。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对是否形成清晰分层。',
        '建议按“识别 → 过滤 → 沿壁加酒精 → 观察析出 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel dnaextract-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属生物实验页</h2><p>把果泥滤液、冷酒精分层和白色 DNA 丝状析出做成更接近真实粗提取实验的场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid dnaextract-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tube' ? '试管分层' : '析出近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>分层建立 {layeringValue}</span><div className="chem-meter-bar"><i style={{ width: `${layeringValue}%` }} /></div></div><div className="chem-meter"><span>析出清晰度 {filamentValue}</span><div className="chem-meter-bar"><i style={{ width: `${filamentValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card dnaextract-data-card"><span className="eyebrow">Readout</span><h3>DNA 读数板</h3><div className="generic-readout-grid dnaextract-readout-grid"><article className={filtered ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>滤液状态</span><strong>{filtered ? '已过滤' : '--'}</strong><small>{filtered ? '下层样液已准备完成。' : '先处理并过滤样液。'}</small></article><article className={alcoholAdded ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>酒精分层</span><strong>{alcoholAdded ? '已形成界面' : '--'}</strong><small>{alcoholAdded ? '酒精和滤液形成明显分层。' : '等待沿壁加酒精。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? 'DNA 在酒精中析出' : '等待总结'}</strong><small>分界处的白色丝状物是 DNA 粗提取的重要现象。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? 'DNA 提取装置'} · 当前重点：{step <= 2 ? '获得较清滤液' : step === 3 ? '形成酒精分层' : '观察白色丝状物'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'tube' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tube')} type="button">分层</button><button className={cameraPreset === 'precipitate' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('precipitate')} type="button">析出</button></div></div><div className={`scene-canvas dnaextract-stage preset-${cameraPreset} ${filtered ? 'filtered' : ''} ${alcoholAdded ? 'alcohol-added' : ''}`}><div className="dnaextract-rig"><div className="de-funnel" /><div className="de-tube"><div className={filtered ? 'de-liquid active' : 'de-liquid'} /><div className={alcoholAdded ? 'de-alcohol active' : 'de-alcohol'} /><div className={alcoholAdded ? 'de-interface active' : 'de-interface'} /><div className={observationChoice === 'correct' ? 'de-dna active' : 'de-dna'} /></div><div className="de-bowl" /></div></div><div className="observation-ribbon dnaextract-observation-row"><article className={filtered ? 'observation-chip active' : 'observation-chip calm'}><strong>滤液</strong><span>{filtered ? '果泥滤液已得到。' : '等待处理并过滤。'}</span></article><article className={alcoholAdded ? 'observation-chip active' : 'observation-chip calm'}><strong>分层</strong><span>{alcoholAdded ? '冷酒精已沿壁形成上层。' : '等待加入冷酒精。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>析出物</strong><span>{observationChoice === 'correct' ? '已观察到白色丝状物。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFilter('correct')} type="button"><strong>将果泥与裂解液处理后过滤得到滤液</strong><span>为后续析出提供样液。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFilter('skip')} type="button"><strong>跳过过滤直接往试管里加酒精</strong><span>错误演示：样液处理不完整。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAlcohol('correct')} type="button"><strong>沿试管壁缓慢加入冷酒精形成分层</strong><span>建立析出界面。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAlcohol('mix')} type="button"><strong>把酒精和滤液剧烈摇匀</strong><span>错误演示：破坏分层界面。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“分界处出现白色絮状、丝状 DNA 析出物”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('bubble')} type="button"><strong>记录“主要现象是不断冒气泡”</strong><span>错误演示：抓错重点。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('dissolve')} type="button"><strong>记录“DNA 会在冷酒精中完全溶解消失”</strong><span>错误演示：与实验相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>DNA 在酒精中的溶解度较低，因此会在液体分界处以白色丝状物形式析出</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('mix')} type="button"><strong>DNA 粗提取的关键是把酒精和滤液完全混匀</strong><span>错误演示：不利于界面析出。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('nothing')} type="button"><strong>这个实验通常不会出现任何可见现象</strong><span>错误演示：忽略白色丝状析出。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{filtered ? '滤液已得' : '滤液待得'} / {alcoholAdded ? '酒精已加' : '酒精待加'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意沿壁缓慢加酒精并保持分层'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“DNA 粗提取”升级成分层与丝状析出的专属页。</small></section></aside>
      </div>
    </section>
  );
}
