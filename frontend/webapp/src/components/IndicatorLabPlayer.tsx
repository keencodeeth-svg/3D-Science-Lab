import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tubes' | 'compare';
type MaterialId = 'tube' | 'dropper' | 'indicator' | 'acid' | 'alkali';
type TimelineState = 'done' | 'current' | 'todo';

interface IndicatorLabPlayerProps {
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
  2: '向酸性溶液滴加指示剂',
  3: '向碱性溶液滴加指示剂',
  4: '比较颜色变化',
  5: '总结检验方法',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别试管、滴管、酸碱指示剂、酸性溶液和碱性溶液。',
  2: '先向酸性溶液中滴加指示剂，观察颜色变化。',
  3: '再向碱性溶液中滴加指示剂，形成对照。',
  4: '比较两支试管中的颜色差异并判断酸碱性。',
  5: '总结酸碱指示剂可用不同颜色检验溶液酸碱性。',
};

const materialLabels: Record<MaterialId, string> = {
  tube: '试管',
  dropper: '滴管',
  indicator: '酸碱指示剂',
  acid: '酸性溶液',
  alkali: '碱性溶液',
};

const materialOrder: MaterialId[] = ['tube', 'dropper', 'indicator', 'acid', 'alkali'];

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function buildTimeline(step: StepId, completed: boolean): TimelineEntry[] {
  return (Object.entries(stepTitles) as [string, string][]).map(([rawStep, title]) => {
    const current = Number(rawStep) as StepId;
    const state: TimelineState = completed || current < step ? 'done' : current === step ? 'current' : 'todo';
    const detail = state === 'done' ? '已完成' : state === 'current' ? '进行中' : '待完成';
    return { title, detail, state };
  });
}

export function IndicatorLabPlayer({ experiment, onTelemetry }: IndicatorLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [acidTested, setAcidTested] = useState(false);
  const [alkaliTested, setAlkaliTested] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过酸碱指示剂对两种溶液的颜色变化来检验酸碱性。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const colorValue = clamp(28 + (acidTested ? 22 : 0) + (alkaliTested ? 24 : 0), 20, 99);
  const contrastValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 24 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (acidTested ? 10 : 0) + (alkaliTested ? 14 : 0), 20, 100);

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
      if (next.length === materialOrder.length) { setCameraPreset('tubes'); advanceStep(2, '器材识别完成，先向酸性溶液中滴加指示剂。'); }
      else { setPromptTone('success'); setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`); }
      return next;
    });
  };
  const handleAcid = (choice: 'correct' | 'skip') => {
    if (step !== 2 || completed) return;
    if (choice === 'skip') { markError('请先给酸性溶液滴加指示剂，建立第一组颜色变化。'); return; }
    setAcidTested(true); appendNote('颜色变化：酸性溶液中指示剂显红色。'); advanceStep(3, '酸性溶液已完成，下一步检验碱性溶液。');
  };
  const handleAlkali = (choice: 'correct' | 'same') => {
    if (step !== 3 || completed) return;
    if (!acidTested) { markError('请先完成酸性溶液的检验。'); return; }
    if (choice === 'same') { markError('碱性溶液应形成不同于酸性溶液的颜色变化。'); return; }
    setAlkaliTested(true); setCameraPreset('compare'); appendNote('颜色变化：碱性溶液中指示剂显蓝色。'); advanceStep(4, '两支试管都已完成，请比较颜色差异。');
  };
  const handleObserve = (choice: 'correct' | 'same' | 'reversed') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!acidTested || !alkaliTested) { markError('请先完成两种溶液的指示剂检验。'); return; }
    if (choice === 'correct') { appendNote('实验观察：酸性溶液显红色，碱性溶液显蓝色，说明指示剂可区分酸碱。'); advanceStep(5, '现象判断正确，最后总结酸碱指示剂的用途。'); return; }
    if (choice === 'same') { markError('两支试管颜色并不相同。'); return; }
    markError('酸碱两侧颜色判断方向反了。');
  };
  const handleSummary = (choice: 'correct' | 'same-color' | 'no-test') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') { advanceStep(null, '总结正确：酸碱指示剂在酸性和碱性溶液中会显示不同颜色，可据此检验溶液酸碱性。'); return; }
    if (choice === 'same-color') { markError('若总是同一种颜色，就不能区分酸碱。'); return; }
    markError('酸碱指示剂正是用来检验溶液酸碱性的。');
  };
  const handleReset = () => { setStep(1); setIdentifiedMaterials([]); setAcidTested(false); setAlkaliTested(false); setObservationChoice(''); setSummaryChoice(''); setCameraPreset('bench'); setPromptTone('info'); setPrompt(stepPrompts[1]); setErrors(0); setCompleted(false); setLabNotes(['实验已重置：重新用指示剂检验溶液酸碱性。']); reportReset(); };

  const recoveryList = errors === 0 ? ['先检验酸性，再检验碱性。', '重点看两支试管的颜色差异。', '总结时抓住“不同颜色检验酸碱性”。'] : [stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。', experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对颜色变化。', '建议按“酸性 → 碱性 → 比较颜色 → 总结”的顺序重做。'];

  return (
    <section className="panel playground-panel indicator-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把试管液面、滴管液滴和酸碱指示剂显色做成更接近真实实验演示的仿真场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid indicator-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tubes' ? '试管近景' : '显色对比'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>显色进度 {colorValue}</span><div className="chem-meter-bar"><i style={{ width: `${colorValue}%` }} /></div></div><div className="chem-meter"><span>对比清晰度 {contrastValue}</span><div className="chem-meter-bar"><i style={{ width: `${contrastValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card indicator-data-card"><span className="eyebrow">Readout</span><h3>显色读数板</h3><div className="generic-readout-grid indicator-readout-grid"><article className={acidTested ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>酸性溶液</span><strong>{acidTested ? '红色' : '--'}</strong><small>{acidTested ? '酸性一侧显出暖色变化。' : '先完成酸性检验。'}</small></article><article className={alkaliTested ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>碱性溶液</span><strong>{alkaliTested ? '蓝色' : '--'}</strong><small>{alkaliTested ? '碱性一侧显出冷色变化。' : '再完成碱性检验。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '不同颜色检验酸碱' : '等待总结'}</strong><small>酸碱指示剂能用不同颜色区分酸碱性。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '显色试管'} · 当前重点：{step <= 2 ? '建立酸性显色' : step === 3 ? '补全碱性对照' : '比较颜色差异'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'tubes' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tubes')} type="button">试管</button><button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对比</button></div></div><div className={`scene-canvas indicator-stage preset-${cameraPreset} ${acidTested ? 'acid-tested' : ''} ${alkaliTested ? 'alkali-tested' : ''}`}><div className="indicator-rig"><div className="id-tube acid"><div className={acidTested ? 'id-liquid acid active' : 'id-liquid acid'} /></div><div className="id-tube alkali"><div className={alkaliTested ? 'id-liquid alkali active' : 'id-liquid alkali'} /></div><div className={acidTested || alkaliTested ? 'id-dropper active' : 'id-dropper'} /></div></div><div className="observation-ribbon indicator-observation-row"><article className={acidTested ? 'observation-chip active' : 'observation-chip calm'}><strong>酸性显色</strong><span>{acidTested ? '酸性试管已显红色。' : '先完成酸性溶液检验。'}</span></article><article className={alkaliTested ? 'observation-chip active' : 'observation-chip calm'}><strong>碱性显色</strong><span>{alkaliTested ? '碱性试管已显蓝色。' : '等待完成碱性溶液检验。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>比较判断</strong><span>{observationChoice === 'correct' ? '已判断两支试管颜色不同。' : '等待完成比较。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAcid('correct')} type="button"><strong>向酸性溶液中滴加指示剂并观察显红色</strong><span>建立第一组显色现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAcid('skip')} type="button"><strong>跳过酸性一侧直接做结论</strong><span>错误演示：缺少对照。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAlkali('correct')} type="button"><strong>向碱性溶液中滴加指示剂并观察显蓝色</strong><span>补全第二组显色对照。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAlkali('same')} type="button"><strong>让碱性溶液和酸性一侧完全同色</strong><span>错误演示：不符合实验现象。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“酸性溶液显红色，碱性溶液显蓝色”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“两支试管颜色一样”</strong><span>错误演示：忽略显色差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('reversed')} type="button"><strong>记录“酸性显蓝色，碱性显红色”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>酸碱指示剂在酸性和碱性溶液中显示不同颜色，可据此检验溶液酸碱性</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('same-color')} type="button"><strong>酸碱指示剂不管什么溶液都只会显示同一种颜色</strong><span>错误演示：失去检验作用。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-test')} type="button"><strong>酸碱指示剂不能用来检验溶液酸碱性</strong><span>错误演示：概念错误。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{acidTested ? '酸性已测' : '酸性待测'} / {alkaliTested ? '碱性已测' : '碱性待测'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意两种溶液都要检验并形成显色对照'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“酸碱指示剂检验”升级成双试管显色对照的专属页。</small></section></aside>
      </div>
    </section>
  );
}
