import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'microscope' | 'view';
type MaterialId = 'microscope' | 'slide' | 'specimen' | 'focus' | 'light';
type TimelineState = 'done' | 'current' | 'todo';

interface BloodSmearLabPlayerProps { experiment: ExperimentConfig; onTelemetry?: (event: LabTelemetryInput) => void; }
interface TimelineEntry { title: string; detail: string; state: TimelineState; }

const stepTitles: Record<StepId, string> = { 1: '识别器材', 2: '放置血涂片标本', 3: '调节显微镜', 4: '识别血细胞特征', 5: '总结观察结论' };
const stepPrompts: Record<StepId, string> = { 1: '先识别显微镜、血涂片标本、调焦装置和光源。', 2: '把人血涂片标本放到载物台上准备观察。', 3: '调节光线和焦距，使血细胞轮廓清晰。', 4: '观察并区分红细胞和白细胞的典型特征。', 5: '总结人血涂片中细胞的主要观察结果。' };
const materialLabels: Record<MaterialId, string> = { microscope: '显微镜', slide: '载物台', specimen: '人血涂片标本', focus: '调焦旋钮', light: '反光镜/光源' };
const materialOrder: MaterialId[] = ['microscope', 'slide', 'specimen', 'focus', 'light'];

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function buildTimeline(step: StepId, completed: boolean): TimelineEntry[] {
  return (Object.entries(stepTitles) as [string, string][]).map(([rawStep, title]) => {
    const current = Number(rawStep) as StepId;
    const state: TimelineState = completed || current < step ? 'done' : current === step ? 'current' : 'todo';
    const detail = state === 'done' ? '已完成' : state === 'current' ? '进行中' : '待完成';
    return { title, detail, state };
  });
}

export function BloodSmearLabPlayer({ experiment, onTelemetry }: BloodSmearLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [slidePlaced, setSlidePlaced] = useState(false);
  const [focused, setFocused] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过显微镜视野观察人血涂片中的血细胞形态差异。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const focusValue = clamp(28 + (slidePlaced ? 18 : 0) + (focused ? 28 : 0), 20, 99);
  const clarityValue = clamp(24 + (cameraPreset !== 'bench' ? 14 : 0) + (observationChoice === 'correct' ? 22 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (slidePlaced ? 10 : 0) + (focused ? 14 : 0), 20, 100);

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
      if (next.length === materialOrder.length) { setCameraPreset('microscope'); advanceStep(2, '器材识别完成，下一步放置人血涂片标本。'); }
      else { setPromptTone('success'); setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`); }
      return next;
    });
  };
  const handlePlaceSlide = (choice: 'correct' | 'empty') => {
    if (step !== 2 || completed) return;
    if (choice === 'empty') { markError('请放置人血涂片标本，而不是空着载物台直接观察。'); return; }
    setSlidePlaced(true); appendNote('标本到位：人血涂片标本已放上载物台并准备观察。'); advanceStep(3, '标本已放置，下一步调节光线与焦距。');
  };
  const handleFocus = (choice: 'correct' | 'blur') => {
    if (step !== 3 || completed) return;
    if (!slidePlaced) { markError('请先放置人血涂片标本，再进行调焦。'); return; }
    if (choice === 'blur') { markError('模糊视野无法准确辨认红细胞和白细胞。'); return; }
    setFocused(true); setCameraPreset('view'); appendNote('视野调清：大量圆盘状红细胞和少量较大白细胞已经可见。'); advanceStep(4, '显微视野已清晰，请辨认血细胞主要特征。');
  };
  const handleObserve = (choice: 'correct' | 'white-most' | 'red-nucleus') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!focused) { markError('请先把显微镜视野调清，再观察血细胞。'); return; }
    if (choice === 'correct') { appendNote('实验观察：红细胞数量较多，成熟红细胞无细胞核；白细胞较少且体积较大。'); advanceStep(5, '观察正确，最后总结人血涂片中的细胞特点。'); return; }
    if (choice === 'white-most') { markError('白细胞数量并不是最多，视野中通常红细胞数量明显更多。'); return; }
    markError('成熟红细胞通常没有细胞核，这一判断方向错了。');
  };
  const handleSummary = (choice: 'correct' | 'same-cells' | 'white-most') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') { advanceStep(null, '总结正确：人血涂片中红细胞数量较多、成熟红细胞无核，白细胞较少且较大。'); return; }
    if (choice === 'same-cells') { markError('人血涂片中的血细胞并不完全一样，红细胞和白细胞有明显差异。'); return; }
    markError('白细胞不是数量最多的血细胞。');
  };
  const handleReset = () => { setStep(1); setIdentifiedMaterials([]); setSlidePlaced(false); setFocused(false); setObservationChoice(''); setSummaryChoice(''); setCameraPreset('bench'); setPromptTone('info'); setPrompt(stepPrompts[1]); setErrors(0); setCompleted(false); setLabNotes(['实验已重置：重新观察人血涂片。']); reportReset(); };

  const recoveryList = errors === 0 ? ['先放置标本，再调焦观察。', '重点看“红细胞多、白细胞少且较大”。', '总结时抓住“成熟红细胞无核”。'] : [stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。', experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对血细胞特征。', '建议按“放标本 → 调焦 → 观察细胞 → 总结”的顺序重做。'];

  return (
    <section className="panel playground-panel bloodsmear-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属生物实验页</h2><p>把金属显微镜、载物台压片和血细胞视野做成更接近真实课堂器材的仿真场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid bloodsmear-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'microscope' ? '显微镜近景' : '显微视野'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>调焦度 {focusValue}</span><div className="chem-meter-bar"><i style={{ width: `${focusValue}%` }} /></div></div><div className="chem-meter"><span>识别清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card bloodsmear-data-card"><span className="eyebrow">Readout</span><h3>观察读数板</h3><div className="generic-readout-grid bloodsmear-readout-grid"><article className={slidePlaced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>标本状态</span><strong>{slidePlaced ? '标本已放置' : '--'}</strong><small>{slidePlaced ? '人血涂片已进入显微镜观察流程。' : '先放置涂片标本。'}</small></article><article className={focused ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>视野状态</span><strong>{focused ? '视野清晰' : '--'}</strong><small>{focused ? '红细胞和白细胞形态已可辨认。' : '再调节光线与焦距。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '红细胞多且无核' : '等待总结'}</strong><small>白细胞较少且体积相对更大。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '人血涂片'} · 当前重点：{step <= 2 ? '放置标本' : step === 3 ? '调焦清晰' : '识别血细胞'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'microscope' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('microscope')} type="button">显微镜</button><button className={cameraPreset === 'view' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('view')} type="button">视野</button></div></div><div className={`scene-canvas bloodsmear-stage preset-${cameraPreset} ${slidePlaced ? 'slide-placed' : ''} ${focused ? 'focused' : ''}`}><div className="bloodsmear-rig"><div className="bs-microscope"><div className="bs-body" /><div className="bs-stage" /><div className={slidePlaced ? 'bs-slide active' : 'bs-slide'} /></div><div className={focused ? 'bs-focus active' : 'bs-focus'} /><div className={focused ? 'bs-view active' : 'bs-view'}><div className="bs-rbc a" /><div className="bs-rbc b" /><div className="bs-rbc c" /><div className="bs-rbc d" /><div className="bs-rbc e" /><div className="bs-rbc f" /><div className="bs-wbc" /></div></div></div><div className="observation-ribbon bloodsmear-observation-row"><article className={slidePlaced ? 'observation-chip active' : 'observation-chip calm'}><strong>标本状态</strong><span>{slidePlaced ? '人血涂片已放到位。' : '先放置标本。'}</span></article><article className={focused ? 'observation-chip active' : 'observation-chip calm'}><strong>调焦状态</strong><span>{focused ? '血细胞轮廓已清晰。' : '等待调焦清晰。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>结果判断</strong><span>{observationChoice === 'correct' ? '已判断红细胞多、成熟红细胞无核。' : '等待完成判断。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePlaceSlide('correct')} type="button"><strong>把人血涂片标本放到载物台上</strong><span>进入显微观察准备。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePlaceSlide('empty')} type="button"><strong>空着载物台直接观察</strong><span>错误演示：没有观察对象。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFocus('correct')} type="button"><strong>调节光线和焦距直到视野清晰</strong><span>便于辨认不同血细胞。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFocus('blur')} type="button"><strong>保持模糊视野直接判断</strong><span>错误演示：容易误判。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“红细胞数量较多，成熟红细胞无核；白细胞较少且较大”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('white-most')} type="button"><strong>记录“白细胞数量最多”</strong><span>错误演示：数量判断错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('red-nucleus')} type="button"><strong>记录“成熟红细胞都有明显细胞核”</strong><span>错误演示：特征判断错误。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>人血涂片中红细胞较多、成熟红细胞无核，白细胞较少且较大</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('same-cells')} type="button"><strong>血涂片中的细胞都差不多，没有明显区别</strong><span>错误演示：忽略细胞差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('white-most')} type="button"><strong>白细胞是数量最多的血细胞</strong><span>错误演示：与观察不符。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{slidePlaced ? '标本已放' : '标本待放'} / {focused ? '视野已清' : '视野待清'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先放标本，再调焦辨认细胞'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“观察人血涂片”升级成显微镜与视野一体的专属页。</small></section></aside>
      </div>
    </section>
  );
}
