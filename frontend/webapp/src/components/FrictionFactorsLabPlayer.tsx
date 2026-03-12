import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'scale' | 'compare';
type MaterialId = 'block' | 'scale' | 'smooth' | 'rough' | 'weights';
type TimelineState = 'done' | 'current' | 'todo';

interface FrictionFactorsLabPlayerProps { experiment: ExperimentConfig; onTelemetry?: (event: LabTelemetryInput) => void; }
interface TimelineEntry { title: string; detail: string; state: TimelineState; }

const stepTitles: Record<StepId, string> = { 1: '识别器材', 2: '在光滑面上拉动物块', 3: '在粗糙面上拉动物块', 4: '比较摩擦力大小', 5: '总结摩擦力影响因素' };
const stepPrompts: Record<StepId, string> = { 1: '先识别木块、测力计、光滑面、粗糙面和配重。', 2: '先在较光滑的表面上匀速拉动物块，记录较小读数。', 3: '再换到较粗糙的表面上匀速拉动，比较读数变化。', 4: '根据两次测力计示数判断摩擦力与接触面粗糙程度的关系。', 5: '总结接触面越粗糙，滑动摩擦力通常越大。' };
const materialLabels: Record<MaterialId, string> = { block: '木块', scale: '测力计', smooth: '光滑面', rough: '粗糙面', weights: '配重' };
const materialOrder: MaterialId[] = ['block', 'scale', 'smooth', 'rough', 'weights'];

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function buildTimeline(step: StepId, completed: boolean): TimelineEntry[] { return (Object.entries(stepTitles) as [string, string][]).map(([rawStep, title]) => { const current = Number(rawStep) as StepId; const state: TimelineState = completed || current < step ? 'done' : current === step ? 'current' : 'todo'; const detail = state === 'done' ? '已完成' : state === 'current' ? '进行中' : '待完成'; return { title, detail, state }; }); }

export function FrictionFactorsLabPlayer({ experiment, onTelemetry }: FrictionFactorsLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [smoothMeasured, setSmoothMeasured] = useState(false);
  const [roughMeasured, setRoughMeasured] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过光滑面和粗糙面对照比较滑动摩擦力大小。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const frictionValue = clamp(28 + (smoothMeasured ? 18 : 0) + (roughMeasured ? 30 : 0), 20, 99);
  const compareValue = clamp(24 + (cameraPreset !== 'bench' ? 14 : 0) + (observationChoice === 'correct' ? 22 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (smoothMeasured ? 10 : 0) + (roughMeasured ? 14 : 0), 20, 100);

  const { reportReset } = useLabTelemetryReporter({ experiment, step, totalSteps: 5, score, errors, prompt, completed, stepLabels: stepTitles, onTelemetry });
  const appendNote = (note: string) => setLabNotes((current) => [note, ...current].slice(0, 6));
  const markError = (message: string) => { setErrors((current) => current + 1); setPromptTone('error'); setPrompt(message); appendNote(`错误修正：${message}`); };
  const advanceStep = (nextStep: StepId | null, message: string) => { setPromptTone('success'); setPrompt(message); if (nextStep === null) { setCompleted(true); appendNote(`实验完成：${experiment.feedback.successSummary}`); return; } setStep(nextStep); appendNote(`步骤推进：进入「${stepTitles[nextStep]}」`); };

  const handleIdentify = (materialId: MaterialId) => {
    if (step !== 1 || completed) return;
    setIdentifiedMaterials((current) => {
      if (current.includes(materialId)) return current;
      const next = [...current, materialId];
      appendNote(`材料识别：${materialLabels[materialId]}`);
      if (next.length === materialOrder.length) { setCameraPreset('scale'); advanceStep(2, '器材识别完成，先在光滑面上拉动物块。'); }
      else { setPromptTone('success'); setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`); }
      return next;
    });
  };
  const handleSmooth = (choice: 'correct' | 'skip') => {
    if (step !== 2 || completed) return;
    if (choice === 'skip') { markError('请先完成光滑面对照，建立基准读数。'); return; }
    setSmoothMeasured(true); appendNote('第一组数据：光滑面上匀速拉动物块时读数约为 1.2 N。'); advanceStep(3, '光滑面对照已完成，下一步改到粗糙面上拉动物块。');
  };
  const handleRough = (choice: 'correct' | 'same-surface') => {
    if (step !== 3 || completed) return;
    if (!smoothMeasured) { markError('请先完成光滑面拉力测量。'); return; }
    if (choice === 'same-surface') { markError('此步需要更换成粗糙表面，才能比较摩擦力差异。'); return; }
    setRoughMeasured(true); setCameraPreset('compare'); appendNote('第二组数据：粗糙面上匀速拉动物块时读数约增至 2.4 N。'); advanceStep(4, '两组读数已具备，请比较摩擦力大小。');
  };
  const handleObserve = (choice: 'correct' | 'same' | 'smooth-bigger') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!smoothMeasured || !roughMeasured) { markError('请先完成两组表面条件下的拉力测量。'); return; }
    if (choice === 'correct') { appendNote('实验观察：接触面越粗糙，物块受到的滑动摩擦力越大。'); advanceStep(5, '现象判断正确，最后总结摩擦力与粗糙程度的关系。'); return; }
    if (choice === 'same') { markError('两次读数并不相同，粗糙面上的读数更大。'); return; }
    markError('光滑面上的摩擦力不会更大，通常粗糙面更大。');
  };
  const handleSummary = (choice: 'correct' | 'no-effect' | 'smooth-bigger') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') { advanceStep(null, '总结正确：接触面越粗糙，滑动摩擦力通常越大。'); return; }
    if (choice === 'no-effect') { markError('接触面粗糙程度会明显影响滑动摩擦力。'); return; }
    markError('通常不是光滑面更大，而是粗糙面更大。');
  };
  const handleReset = () => { setStep(1); setIdentifiedMaterials([]); setSmoothMeasured(false); setRoughMeasured(false); setObservationChoice(''); setSummaryChoice(''); setCameraPreset('bench'); setPromptTone('info'); setPrompt(stepPrompts[1]); setErrors(0); setCompleted(false); setLabNotes(['实验已重置：重新比较不同表面的滑动摩擦力。']); reportReset(); };

  const recoveryList = errors === 0 ? ['先做光滑面对照，再做粗糙面对照。', '重点比较两次测力计读数。', '总结时抓住“表面越粗糙，摩擦力越大”。'] : [stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。', experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对摩擦力读数。', '建议按“光滑面 → 粗糙面 → 比较 → 总结”的顺序重做。'];

  return (
    <section className="panel playground-panel frictionfactors-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属物理实验页</h2><p>把测力计、木块底面材质和粗糙纹理差异做成更真实的对照场景，让摩擦力大小规律更直观。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid frictionfactors-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'scale' ? '测力计近景' : '两面比较'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>摩擦力 {frictionValue}</span><div className="chem-meter-bar"><i style={{ width: `${frictionValue}%` }} /></div></div><div className="chem-meter"><span>对比清晰度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card frictionfactors-data-card"><span className="eyebrow">Readout</span><h3>摩擦读数板</h3><div className="generic-readout-grid frictionfactors-readout-grid"><article className={smoothMeasured ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>光滑面</span><strong>{smoothMeasured ? '1.2 N' : '--'}</strong><small>{smoothMeasured ? '光滑面对照下读数较小。' : '先完成光滑面对照。'}</small></article><article className={roughMeasured ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>粗糙面</span><strong>{roughMeasured ? '2.4 N' : '--'}</strong><small>{roughMeasured ? '粗糙面下读数明显增大。' : '再完成粗糙面对照。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '粗糙面摩擦更大' : '等待总结'}</strong><small>接触面越粗糙，滑动摩擦力通常越大。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '摩擦力实验装置'} · 当前重点：{step <= 2 ? '建立光滑面对照' : step === 3 ? '改用粗糙面' : '比较摩擦力差异'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'scale' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('scale')} type="button">读数</button><button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对比</button></div></div><div className={`scene-canvas frictionfactors-stage preset-${cameraPreset} ${smoothMeasured ? 'smooth-measured' : ''} ${roughMeasured ? 'rough-measured' : ''}`}><div className="frictionfactors-rig"><div className="ff-surface smooth" /><div className="ff-surface rough" /><div className={roughMeasured ? 'ff-block rough active' : smoothMeasured ? 'ff-block smooth active' : 'ff-block smooth'} /><div className="ff-scale"><div className="ff-pointer" /></div><div className="ff-readout smooth">1.2N</div><div className="ff-readout rough">2.4N</div></div></div><div className="observation-ribbon frictionfactors-observation-row"><article className={smoothMeasured ? 'observation-chip active' : 'observation-chip calm'}><strong>光滑面对照</strong><span>{smoothMeasured ? '光滑面拉力已记录。' : '先完成光滑面对照。'}</span></article><article className={roughMeasured ? 'observation-chip active' : 'observation-chip calm'}><strong>粗糙面对照</strong><span>{roughMeasured ? '粗糙面拉力已记录。' : '等待完成粗糙面对照。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>规律判断</strong><span>{observationChoice === 'correct' ? '已判断粗糙面摩擦力更大。' : '等待完成判断。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleSmooth('correct')} type="button"><strong>在光滑面上匀速拉动物块并记录 1.2 N</strong><span>建立较小摩擦力基准。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSmooth('skip')} type="button"><strong>跳过光滑面对照</strong><span>错误演示：无法有效比较。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRough('correct')} type="button"><strong>换到粗糙面上匀速拉动物块并记录 2.4 N</strong><span>形成粗糙程度对照。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRough('same-surface')} type="button"><strong>继续在同样的光滑面上拉</strong><span>错误演示：变量没有改变。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“粗糙面上的滑动摩擦力更大”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“两种表面摩擦力差不多”</strong><span>错误演示：忽略读数差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('smooth-bigger')} type="button"><strong>记录“光滑面摩擦力更大”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>接触面越粗糙，滑动摩擦力通常越大</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-effect')} type="button"><strong>接触面粗糙程度对摩擦力没有影响</strong><span>错误演示：与实验不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('smooth-bigger')} type="button"><strong>光滑面上的滑动摩擦力更大</strong><span>错误演示：结论反了。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{smoothMeasured ? '光滑面已测' : '光滑面待测'} / {roughMeasured ? '粗糙面已测' : '粗糙面待测'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意更换接触面后再比较读数'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“探究滑动摩擦力大小”升级成材质对照的专属页。</small></section></aside>
      </div>
    </section>
  );
}
