import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'strip' | 'chart';
type MaterialId = 'ph-paper' | 'chart' | 'sample' | 'glass-rod' | 'white-tile';
type TimelineState = 'done' | 'current' | 'todo';

interface PhPaperLabPlayerProps {
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
  2: '润湿试纸',
  3: '比对色卡',
  4: '判断酸碱度',
  5: '总结测定方法',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别 pH 试纸、标准比色卡、待测溶液、玻璃棒和白瓷板。',
  2: '用玻璃棒蘸取待测液，滴到 pH 试纸上。',
  3: '将显色后的试纸与标准比色卡进行比较。',
  4: '根据颜色和数值范围判断待测液酸碱度。',
  5: '总结 pH 试纸通过显色比对来测定酸碱度。',
};

const materialLabels: Record<MaterialId, string> = {
  'ph-paper': 'pH试纸',
  chart: '标准比色卡',
  sample: '待测溶液',
  'glass-rod': '玻璃棒',
  'white-tile': '白瓷板',
};

const materialOrder: MaterialId[] = ['ph-paper', 'chart', 'sample', 'glass-rod', 'white-tile'];

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

export function PhPaperLabPlayer({ experiment, onTelemetry }: PhPaperLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [stripWet, setStripWet] = useState(false);
  const [chartCompared, setChartCompared] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过 pH 试纸显色与标准比色卡比较来测定酸碱度。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const colorValue = clamp(28 + (stripWet ? 22 : 0) + (chartCompared ? 22 : 0), 20, 99);
  const compareValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (stripWet ? 10 : 0) + (chartCompared ? 14 : 0), 20, 100);

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
        setCameraPreset('strip');
        advanceStep(2, '器材识别完成，先用玻璃棒润湿 pH 试纸。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleWetStrip = (choice: 'correct' | 'dip-strip') => {
    if (step !== 2 || completed) return;
    if (choice === 'dip-strip') {
      markError('不要直接把整条试纸浸入溶液，应用玻璃棒蘸液后滴在试纸上。');
      return;
    }
    setStripWet(true);
    appendNote('显色状态：pH 试纸被样液润湿后呈橙黄色。');
    advanceStep(3, '试纸已显色，下一步与标准比色卡比较。');
  };

  const handleChart = (choice: 'correct' | 'guess') => {
    if (step !== 3 || completed) return;
    if (!stripWet) {
      markError('请先让 pH 试纸显色，再进行比色。');
      return;
    }
    if (choice === 'guess') {
      markError('应把试纸颜色与标准比色卡逐格比较，不能凭印象猜测。');
      return;
    }
    setChartCompared(true);
    setCameraPreset('chart');
    appendNote('比色记录：试纸颜色与 pH 4~5 的色块更接近。');
    advanceStep(4, '已完成比色，请判断待测液酸碱度。');
  };

  const handleObserve = (choice: 'correct' | 'neutral' | 'alkali') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!stripWet || !chartCompared) {
      markError('请先完成试纸显色和色卡比较，再判断酸碱度。');
      return;
    }
    if (choice === 'correct') {
      appendNote('判断结果：样液 pH 小于 7，属于酸性。');
      advanceStep(5, '酸碱度已判断，下一步总结 pH 试纸测定方法。');
      return;
    }
    markError(choice === 'neutral' ? '若颜色接近橙黄色，一般不是中性 7 左右。' : '该颜色不对应碱性，碱性常偏蓝绿。');
  };

  const handleSummary = (choice: 'correct' | 'direct' | 'same') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：pH 试纸通过显色并与标准比色卡比较来测定酸碱度。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'direct' ? 'pH 试纸不能不比色直接看出准确酸碱度，需要与标准色卡比较。' : '不同酸碱度会对应不同颜色，不是所有溶液都同色。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setStripWet(false);
    setChartCompared(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新用 pH 试纸测定酸碱度。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先用玻璃棒蘸液，再滴到试纸上。', '显色后要立刻与标准比色卡比较。', '结论关键词是“显色”“比色”“判断 pH 范围”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对试纸显色和比色结果。',
        '建议按“识别 → 润湿试纸 → 比色 → 判断 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel phpaper-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把 pH 试纸显色、白瓷板操作和标准色卡比对做成更真实的酸碱度测定场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid phpaper-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'strip' ? '试纸近景' : '色卡比对'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>显色完成 {colorValue}</span><div className="chem-meter-bar"><i style={{ width: `${colorValue}%` }} /></div></div><div className="chem-meter"><span>比色准确度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card phpaper-data-card"><span className="eyebrow">Readout</span><h3>pH 读数板</h3><div className="generic-readout-grid phpaper-readout-grid"><article className={stripWet ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>试纸显色</span><strong>{stripWet ? '橙黄色' : '--'}</strong><small>{stripWet ? '试纸已被样液润湿。' : '先完成试纸显色。'}</small></article><article className={chartCompared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>色卡比对</span><strong>{chartCompared ? 'pH 4~5' : '--'}</strong><small>{chartCompared ? '已完成标准色卡匹配。' : '等待比对色卡。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '显色后需比色' : '等待总结'}</strong><small>pH 试纸依靠颜色与色卡比对来判断酸碱度。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? 'pH 检测装置'} · 当前重点：{step <= 2 ? '让试纸正确显色' : step === 3 ? '完成标准比色' : '判断 pH 范围'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'strip' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('strip')} type="button">试纸</button><button className={cameraPreset === 'chart' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('chart')} type="button">色卡</button></div></div><div className={`scene-canvas phpaper-stage preset-${cameraPreset} ${stripWet ? 'strip-wet' : ''} ${chartCompared ? 'chart-compared' : ''}`}><div className="phpaper-rig"><div className="pp-tile" /><div className={stripWet ? 'pp-strip active' : 'pp-strip'} /><div className={stripWet ? 'pp-drop active' : 'pp-drop'} /><div className={stripWet ? 'pp-rod active' : 'pp-rod'} /><div className="pp-sample" /><div className="pp-chart">{Array.from({ length: 7 }).map((_, index) => (<span className={`pp-swatch swatch-${index + 1}`} key={index} />))}</div><div className={chartCompared ? 'pp-marker active' : 'pp-marker'} /></div></div><div className="observation-ribbon phpaper-observation-row"><article className={stripWet ? 'observation-chip active' : 'observation-chip calm'}><strong>试纸显色</strong><span>{stripWet ? '试纸已由样液显色。' : '等待显色。'}</span></article><article className={chartCompared ? 'observation-chip active' : 'observation-chip calm'}><strong>标准比色</strong><span>{chartCompared ? '已完成色卡匹配。' : '等待完成比色。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>酸碱判断</strong><span>{observationChoice === 'correct' ? '已判断为酸性。' : '等待完成判断。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleWetStrip('correct')} type="button"><strong>用玻璃棒蘸样液后滴到 pH 试纸上</strong><span>让试纸正确显色。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleWetStrip('dip-strip')} type="button"><strong>把整条试纸直接浸入样液</strong><span>错误演示：操作不规范。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleChart('correct')} type="button"><strong>将显色试纸与标准比色卡逐格比较</strong><span>得到 pH 范围。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleChart('guess')} type="button"><strong>不看色卡直接猜测结果</strong><span>错误演示：没有比色依据。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“试纸呈橙黄色，对应 pH 小于 7，为酸性”</strong><span>这是本实验的正确判断。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('neutral')} type="button"><strong>记录“显色后对应中性”</strong><span>错误演示：判断偏差。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('alkali')} type="button"><strong>记录“显色后对应碱性”</strong><span>错误演示：方向错误。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>pH 试纸先显色，再与标准比色卡比较，从而测定溶液酸碱度</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('direct')} type="button"><strong>看一眼试纸就能直接知道精确 pH，不需要色卡</strong><span>错误演示：忽略比色步骤。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('same')} type="button"><strong>所有溶液都会让 pH 试纸显示同一种颜色</strong><span>错误演示：概念错误。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{stripWet ? '试纸已显色' : '试纸待显色'} / {chartCompared ? '已完成比色' : '待比色'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意不要把整条试纸直接浸入样液'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“pH 试纸测定”升级成试纸显色 + 标准比色卡对照的专属页。</small></section></aside>
      </div>
    </section>
  );
}
