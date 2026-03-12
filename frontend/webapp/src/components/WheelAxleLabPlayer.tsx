import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'wheel' | 'compare';
type MaterialId = 'wheel' | 'axle' | 'rope' | 'weight' | 'scale';
type TimelineState = 'done' | 'current' | 'todo';

interface WheelAxleLabPlayerProps { experiment: ExperimentConfig; onTelemetry?: (event: LabTelemetryInput) => void; }
interface TimelineEntry { title: string; detail: string; state: TimelineState; }

const stepTitles: Record<StepId, string> = { 1: '识别器材', 2: '直接绕轴提升重物', 3: '转动大轮提升重物', 4: '比较所需拉力', 5: '总结轮轴作用' };
const stepPrompts: Record<StepId, string> = { 1: '先识别轮轴、绳子、重物和测力计。', 2: '先直接绕轴提升重物，记录较大的拉力。', 3: '再转动大轮提升同样重物，比较读数变化。', 4: '根据两次测力计示数判断轮轴是否省力。', 5: '总结使用大轮带动小轴能更省力。' };
const materialLabels: Record<MaterialId, string> = { wheel: '大轮', axle: '小轴', rope: '绳子', weight: '重物', scale: '测力计' };
const materialOrder: MaterialId[] = ['wheel', 'axle', 'rope', 'weight', 'scale'];

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function buildTimeline(step: StepId, completed: boolean): TimelineEntry[] { return (Object.entries(stepTitles) as [string, string][]).map(([rawStep, title]) => { const current = Number(rawStep) as StepId; const state: TimelineState = completed || current < step ? 'done' : current === step ? 'current' : 'todo'; const detail = state === 'done' ? '已完成' : state === 'current' ? '进行中' : '待完成'; return { title, detail, state }; }); }

export function WheelAxleLabPlayer({ experiment, onTelemetry }: WheelAxleLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [axleMeasured, setAxleMeasured] = useState(false);
  const [wheelMeasured, setWheelMeasured] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过直接绕轴和转动大轮两种方式比较轮轴的省力效果。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const forceValue = clamp(40 + (axleMeasured ? 20 : 0) - (wheelMeasured ? 12 : 0), 20, 95);
  const savingValue = clamp(24 + (wheelMeasured ? 28 : 0) + (observationChoice === 'correct' ? 18 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (axleMeasured ? 10 : 0) + (wheelMeasured ? 14 : 0), 20, 100);

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
      if (next.length === materialOrder.length) { setCameraPreset('wheel'); advanceStep(2, '器材识别完成，先直接绕轴提升重物。'); }
      else { setPromptTone('success'); setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`); }
      return next;
    });
  };
  const handleAxle = (choice: 'correct' | 'skip') => {
    if (step !== 2 || completed) return;
    if (choice === 'skip') { markError('请先做直接绕轴提升的基准对照。'); return; }
    setAxleMeasured(true); appendNote('第一组数据：直接绕小轴提升重物时拉力约为 3.0 N。'); advanceStep(3, '直接绕轴对照已完成，下一步转动大轮提升同样重物。');
  };
  const handleWheel = (choice: 'correct' | 'same-axle') => {
    if (step !== 3 || completed) return;
    if (!axleMeasured) { markError('请先完成直接绕轴提升的拉力测量。'); return; }
    if (choice === 'same-axle') { markError('此步需要改用大轮发力，而不是继续直接绕小轴。'); return; }
    setWheelMeasured(true); setCameraPreset('compare'); appendNote('第二组数据：转动大轮提升同样重物时拉力约降为 1.6 N。'); advanceStep(4, '两组读数已具备，请比较轮轴是否省力。');
  };
  const handleObserve = (choice: 'correct' | 'same' | 'harder') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!axleMeasured || !wheelMeasured) { markError('请先完成两种方式的拉力测量。'); return; }
    if (choice === 'correct') { appendNote('实验观察：使用大轮带动小轴时所需拉力更小，轮轴具有省力效果。'); advanceStep(5, '现象判断正确，最后总结轮轴的作用。'); return; }
    if (choice === 'same') { markError('两次拉力并不相同，使用大轮时所需拉力更小。'); return; }
    markError('使用大轮一般不会更费力，关键现象是拉力减小。');
  };
  const handleSummary = (choice: 'correct' | 'no-effect' | 'smaller-wheel') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') { advanceStep(null, '总结正确：轮轴中较大的轮可以省力地带动较小的轴。'); return; }
    if (choice === 'no-effect') { markError('轮轴对省力效果有明显影响，并不是没有作用。'); return; }
    markError('更省力的是使用较大的轮，而不是更小的轮。');
  };
  const handleReset = () => { setStep(1); setIdentifiedMaterials([]); setAxleMeasured(false); setWheelMeasured(false); setObservationChoice(''); setSummaryChoice(''); setCameraPreset('bench'); setPromptTone('info'); setPrompt(stepPrompts[1]); setErrors(0); setCompleted(false); setLabNotes(['实验已重置：重新比较轮轴两种提升方式。']); reportReset(); };

  const recoveryList = errors === 0 ? ['先做直接绕轴基准，再做大轮对照。', '重点比较两次拉力读数。', '总结时抓住“较大的轮更省力”。'] : [stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。', experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对轮轴读数。', '建议按“绕轴 → 转轮 → 比较 → 总结”的顺序重做。'];

  return (
    <section className="panel playground-panel wheelaxle-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属科学实验页</h2><p>把大轮、小轴、绳索缠绕和重物提升做成更接近真实模型教具的仿真场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid wheelaxle-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'wheel' ? '轮轴近景' : '拉力对比'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>拉力趋势 {forceValue}</span><div className="chem-meter-bar"><i style={{ width: `${forceValue}%` }} /></div></div><div className="chem-meter"><span>省力感知 {savingValue}</span><div className="chem-meter-bar"><i style={{ width: `${savingValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card wheelaxle-data-card"><span className="eyebrow">Readout</span><h3>轮轴读数板</h3><div className="generic-readout-grid wheelaxle-readout-grid"><article className={axleMeasured ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>绕轴提升</span><strong>{axleMeasured ? '3.0 N' : '--'}</strong><small>{axleMeasured ? '直接作用在小轴上时拉力较大。' : '先完成绕轴基准测量。'}</small></article><article className={wheelMeasured ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>转轮提升</span><strong>{wheelMeasured ? '1.6 N' : '--'}</strong><small>{wheelMeasured ? '转动大轮后拉力明显减小。' : '再完成大轮测量。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '大轮更省力' : '等待总结'}</strong><small>较大的轮可以更省力地带动小轴。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '轮轴装置'} · 当前重点：{step <= 2 ? '建立绕轴基准' : step === 3 ? '改用大轮' : '比较拉力差异'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'wheel' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('wheel')} type="button">轮轴</button><button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对比</button></div></div><div className={`scene-canvas wheelaxle-stage preset-${cameraPreset} ${axleMeasured ? 'axle-measured' : ''} ${wheelMeasured ? 'wheel-measured' : ''}`}><div className="wheelaxle-rig"><div className="wa-stand" /><div className="wa-wheel" /><div className="wa-axle" /><div className={wheelMeasured ? 'wa-rope active wheel' : axleMeasured ? 'wa-rope active axle' : 'wa-rope axle'} /><div className="wa-weight" /><div className="wa-scale"><div className="wa-pointer" /></div><div className="wa-readout axle">3.0N</div><div className="wa-readout wheel">1.6N</div></div></div><div className="observation-ribbon wheelaxle-observation-row"><article className={axleMeasured ? 'observation-chip active' : 'observation-chip calm'}><strong>基准测量</strong><span>{axleMeasured ? '绕轴提升拉力已记录。' : '先完成基准测量。'}</span></article><article className={wheelMeasured ? 'observation-chip active' : 'observation-chip calm'}><strong>轮面测量</strong><span>{wheelMeasured ? '转轮提升拉力已记录。' : '等待完成转轮测量。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>规律判断</strong><span>{observationChoice === 'correct' ? '已判断大轮更省力。' : '等待完成判断。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAxle('correct')} type="button"><strong>直接绕小轴提升重物并记录 3.0 N</strong><span>建立不借助大轮的基准。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAxle('skip')} type="button"><strong>跳过绕轴基准</strong><span>错误演示：无法有效比较。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleWheel('correct')} type="button"><strong>转动大轮提升同样重物并记录 1.6 N</strong><span>形成轮轴对照。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleWheel('same-axle')} type="button"><strong>继续直接绕小轴提升</strong><span>错误演示：变量没有改变。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“转动大轮提升同样重物所需拉力更小”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“两次拉力完全相同”</strong><span>错误演示：忽略读数差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('harder')} type="button"><strong>记录“转动大轮更费力”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>轮轴中较大的轮可以更省力地带动较小的轴</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-effect')} type="button"><strong>轮轴对省力没有明显影响</strong><span>错误演示：与实验读数不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('smaller-wheel')} type="button"><strong>更小的轮会更省力</strong><span>错误演示：规律判断错误。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{axleMeasured ? '绕轴已测' : '绕轴待测'} / {wheelMeasured ? '转轮已测' : '转轮待测'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先基准后对照，再比较读数'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“轮轴作用”升级成读数对比的专属页。</small></section></aside>
      </div>
    </section>
  );
}
