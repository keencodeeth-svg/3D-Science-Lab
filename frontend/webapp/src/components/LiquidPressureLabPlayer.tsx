import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'jet' | 'compare';
type MaterialId = 'cylinder' | 'water' | 'plug' | 'holes' | 'ruler';
type TimelineState = 'done' | 'current' | 'todo';

interface LiquidPressureLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry { title: string; detail: string; state: TimelineState; }

const stepTitles: Record<StepId, string> = { 1: '识别器材', 2: '向容器中加水', 3: '打开侧孔观察水流', 4: '比较不同深度水流', 5: '总结液体压强特点' };
const stepPrompts: Record<StepId, string> = { 1: '先识别透明容器、清水、孔塞、侧孔和刻度尺。', 2: '先向容器中加入足量清水，形成不同深度液层。', 3: '拔开侧孔塞，观察不同高度孔口喷出的水流。', 4: '比较上下不同深度处水流射程远近。', 5: '总结液体内部压强随深度变化的特点。' };
const materialLabels: Record<MaterialId, string> = { cylinder: '透明容器', water: '清水', plug: '孔塞', holes: '侧孔组', ruler: '刻度尺' };
const materialOrder: MaterialId[] = ['cylinder', 'water', 'plug', 'holes', 'ruler'];

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function buildTimeline(step: StepId, completed: boolean): TimelineEntry[] {
  return (Object.entries(stepTitles) as [string, string][]).map(([rawStep, title]) => {
    const current = Number(rawStep) as StepId;
    const state: TimelineState = completed || current < step ? 'done' : current === step ? 'current' : 'todo';
    const detail = state === 'done' ? '已完成' : state === 'current' ? '进行中' : '待完成';
    return { title, detail, state };
  });
}

export function LiquidPressureLabPlayer({ experiment, onTelemetry }: LiquidPressureLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [filled, setFilled] = useState(false);
  const [opened, setOpened] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过透明容器侧孔喷流对比观察液体压强随深度变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const pressureValue = clamp(28 + (filled ? 22 : 0) + (opened ? 28 : 0), 20, 99);
  const jetValue = clamp(24 + (cameraPreset !== 'bench' ? 14 : 0) + (observationChoice === 'correct' ? 22 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (filled ? 10 : 0) + (opened ? 14 : 0), 20, 100);

  const { reportReset } = useLabTelemetryReporter({ experiment, step, totalSteps: 5, score, errors, prompt, completed, stepLabels: stepTitles, onTelemetry });
  const appendNote = (note: string) => setLabNotes((current) => [note, ...current].slice(0, 6));
  const markError = (message: string) => { setErrors((current) => current + 1); setPromptTone('error'); setPrompt(message); appendNote(`错误修正：${message}`); };
  const advanceStep = (nextStep: StepId | null, message: string) => {
    setPromptTone('success'); setPrompt(message);
    if (nextStep === null) { setCompleted(true); appendNote(`实验完成：${experiment.feedback.successSummary}`); return; }
    setStep(nextStep); appendNote(`步骤推进：进入「${stepTitles[nextStep]}」`);
  };

  const handleIdentify = (materialId: MaterialId) => {
    if (step !== 1 || completed) return;
    setIdentifiedMaterials((current) => {
      if (current.includes(materialId)) return current;
      const next = [...current, materialId];
      appendNote(`材料识别：${materialLabels[materialId]}`);
      if (next.length === materialOrder.length) { setCameraPreset('jet'); advanceStep(2, '器材识别完成，下一步向容器中加水。'); }
      else { setPromptTone('success'); setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`); }
      return next;
    });
  };
  const handleFill = (choice: 'correct' | 'shallow') => {
    if (step !== 2 || completed) return;
    if (choice === 'shallow') { markError('水量过少时不同深度差异不明显，请加足够的水。'); return; }
    setFilled(true); appendNote('液面建立：透明容器内已形成明显的不同深度水层。'); advanceStep(3, '液面已建立，下一步打开侧孔观察喷流。');
  };
  const handleOpen = (choice: 'correct' | 'top-only') => {
    if (step !== 3 || completed) return;
    if (!filled) { markError('请先向容器中加水，再打开侧孔。'); return; }
    if (choice === 'top-only') { markError('应观察多组不同深度的侧孔，才能比较液体压强变化。'); return; }
    setOpened(true); setCameraPreset('compare'); appendNote('喷流出现：不同高度侧孔喷出的水流射程已形成明显差异。'); advanceStep(4, '喷流已出现，请比较不同深度处的射程差异。');
  };
  const handleObserve = (choice: 'correct' | 'same' | 'upper-farther') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!opened) { markError('请先打开侧孔，观察水流喷出后再判断。'); return; }
    if (choice === 'correct') { appendNote('实验观察：越靠下的孔喷流越远，说明该处液体压强更大。'); advanceStep(5, '现象判断正确，最后总结液体压强大小规律。'); return; }
    if (choice === 'same') { markError('不同深度孔口的喷流射程并不相同。'); return; }
    markError('上层孔不会更远，较深位置通常喷流更远。');
  };
  const handleSummary = (choice: 'correct' | 'no-depth' | 'upper-bigger') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') { advanceStep(null, '总结正确：液体内部压强随深度增加而增大。'); return; }
    if (choice === 'no-depth') { markError('液体压强并不是与深度无关，深度越大压强通常越大。'); return; }
    markError('上层位置压强不会更大，通常是越深压强越大。');
  };
  const handleReset = () => {
    setStep(1); setIdentifiedMaterials([]); setFilled(false); setOpened(false); setObservationChoice(''); setSummaryChoice(''); setCameraPreset('bench'); setPromptTone('info'); setPrompt(stepPrompts[1]); setErrors(0); setCompleted(false); setLabNotes(['实验已重置：重新观察液体压强与深度关系。']); reportReset();
  };

  const recoveryList = errors === 0 ? ['先加足量水，再同时观察多个深度孔口。', '重点比较不同高度喷流的远近。', '总结时抓住“越深压强越大”。'] : [stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。', experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对喷流差异。', '建议按“加水 → 开孔 → 比较喷流 → 总结”的顺序重做。'];

  return (
    <section className="panel playground-panel liquidpressure-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属物理实验页</h2><p>把透明容器、水面高度和多孔喷流做成更真实的液体仿真场景，让压强差异一眼可见。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid liquidpressure-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'jet' ? '容器近景' : '喷流比较'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>液压趋势 {pressureValue}</span><div className="chem-meter-bar"><i style={{ width: `${pressureValue}%` }} /></div></div><div className="chem-meter"><span>喷流差异 {jetValue}</span><div className="chem-meter-bar"><i style={{ width: `${jetValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card liquidpressure-data-card"><span className="eyebrow">Readout</span><h3>喷流读数板</h3><div className="generic-readout-grid liquidpressure-readout-grid"><article className={filled ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>液面状态</span><strong>{filled ? '液柱已建立' : '--'}</strong><small>{filled ? '容器中已形成明显液体深度。' : '先向容器中加入足量清水。'}</small></article><article className={opened ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>喷流状态</span><strong>{opened ? '三股喷流可比' : '--'}</strong><small>{opened ? '不同深度喷流已出现差异。' : '再打开多个侧孔。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '越深压强越大' : '等待总结'}</strong><small>较深处的液体压强更大，水流喷得更远。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '液体压强装置'} · 当前重点：{step <= 2 ? '建立液面' : step === 3 ? '形成喷流' : '比较不同深度'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'jet' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('jet')} type="button">容器</button><button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对比</button></div></div><div className={`scene-canvas liquidpressure-stage preset-${cameraPreset} ${filled ? 'filled' : ''} ${opened ? 'opened' : ''}`}><div className="liquidpressure-rig"><div className="lp-cylinder"><div className={filled ? 'lp-water active' : 'lp-water'} /><div className="lp-hole top" /><div className="lp-hole mid" /><div className="lp-hole low" /></div><div className={opened ? 'lp-jet top active' : 'lp-jet top'} /><div className={opened ? 'lp-jet mid active' : 'lp-jet mid'} /><div className={opened ? 'lp-jet low active' : 'lp-jet low'} /><div className="lp-ruler" /></div></div><div className="observation-ribbon liquidpressure-observation-row"><article className={filled ? 'observation-chip active' : 'observation-chip calm'}><strong>液面状态</strong><span>{filled ? '容器液面已达到观察要求。' : '先完成加水。'}</span></article><article className={opened ? 'observation-chip active' : 'observation-chip calm'}><strong>开孔状态</strong><span>{opened ? '多股喷流已同时出现。' : '等待打开侧孔。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>规律判断</strong><span>{observationChoice === 'correct' ? '已判断较深处喷流更远。' : '等待完成比较。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFill('correct')} type="button"><strong>向容器中加入足量清水</strong><span>形成明显的不同深度液层。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFill('shallow')} type="button"><strong>只加很浅的一点点水</strong><span>错误演示：不利于形成明显差异。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleOpen('correct')} type="button"><strong>同时观察多个深度的侧孔喷流</strong><span>形成有效比较。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleOpen('top-only')} type="button"><strong>只看最上面一个孔</strong><span>错误演示：无法比较深度差异。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“越靠下的孔喷流越远”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“三股喷流远近完全相同”</strong><span>错误演示：忽略深度影响。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('upper-farther')} type="button"><strong>记录“越靠上的孔喷得越远”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>液体内部压强随深度增加而增大</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-depth')} type="button"><strong>液体压强和深度没有关系</strong><span>错误演示：与喷流现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('upper-bigger')} type="button"><strong>越靠上的位置液体压强越大</strong><span>错误演示：规律判断反了。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{filled ? '已加水' : '待加水'} / {opened ? '已开孔' : '待开孔'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意比较多个深度孔口的喷流远近'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“液体压强特点”升级成喷流对比的专属页。</small></section></aside>
      </div>
    </section>
  );
}
