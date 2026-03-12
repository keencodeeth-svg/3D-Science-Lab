import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'jar' | 'bands';
type MaterialId = 'mortar' | 'filter-paper' | 'leaf-extract' | 'solvent' | 'jar';
type TimelineState = 'done' | 'current' | 'todo';

interface PigmentSeparationLabPlayerProps {
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
  2: '点样叶绿素提取液',
  3: '将滤纸条放入层析液',
  4: '观察色素带分离',
  5: '总结分离现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别研钵、滤纸条、叶绿体色素提取液、层析液和层析瓶。',
  2: '把叶绿体色素提取液点在滤纸条起始线上。',
  3: '将滤纸条垂直放入层析液中，注意液面不能没过样点。',
  4: '观察色素随溶剂上升逐渐分离成不同颜色的条带。',
  5: '总结不同色素移动速度不同，因此会分离。',
};

const materialLabels: Record<MaterialId, string> = {
  mortar: '研钵',
  'filter-paper': '滤纸条',
  'leaf-extract': '色素提取液',
  solvent: '层析液',
  jar: '层析瓶',
};

const materialOrder: MaterialId[] = ['mortar', 'filter-paper', 'leaf-extract', 'solvent', 'jar'];

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

export function PigmentSeparationLabPlayer({ experiment, onTelemetry }: PigmentSeparationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [spotted, setSpotted] = useState(false);
  const [stripPlaced, setStripPlaced] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过滤纸层析观察叶绿体色素分离成不同色素带。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const solventValue = clamp(28 + (spotted ? 18 : 0) + (stripPlaced ? 24 : 0), 20, 99);
  const bandValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (spotted ? 10 : 0) + (stripPlaced ? 14 : 0), 20, 100);

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
        setCameraPreset('jar');
        advanceStep(2, '器材识别完成，先在滤纸条起始线上点样。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleSpot = (choice: 'correct' | 'high') => {
    if (step !== 2 || completed) return;
    if (choice === 'high') {
      markError('样点应点在起始线附近，不能点得太高。');
      return;
    }
    setSpotted(true);
    appendNote('点样完成：滤纸条起始线上已形成深绿色样点。');
    advanceStep(3, '样点已形成，下一步把滤纸条放入层析液。');
  };

  const handlePlaceStrip = (choice: 'correct' | 'submerge') => {
    if (step !== 3 || completed) return;
    if (!spotted) {
      markError('请先完成点样，再放入层析液。');
      return;
    }
    if (choice === 'submerge') {
      markError('层析液液面不能淹没样点，否则会把样点直接溶散。');
      return;
    }
    setStripPlaced(true);
    setCameraPreset('bands');
    appendNote('层析开始：溶剂沿滤纸上升，色素开始分离。');
    advanceStep(4, '滤纸条已放好，请观察不同色素带。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'washout') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!spotted || !stripPlaced) {
      markError('请先完成点样并放入层析液，再观察色素带。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：滤纸条上分离出黄绿、蓝绿和黄色等不同色素带。');
      advanceStep(5, '色素带已观察清楚，下一步总结分离原因。');
      return;
    }
    markError(choice === 'same' ? '不同色素不会始终重叠成一条线，而会分离成多条色带。' : '若液面没过样点会影响分离，但标准操作下会看到分层条带。');
  };

  const handleSummary = (choice: 'correct' | 'one' | 'none') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：不同色素在层析液中的溶解度和扩散速度不同，因此会分离。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'one' ? '叶绿体中不只一种色素，分离后应看到多条色素带。' : '色素不是不会移动，而是会被溶剂带动向上迁移并分离。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSpotted(false);
    setStripPlaced(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察叶绿体色素分离。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先点样，再放入层析液。', '液面不能没过样点。', '观察时重点看多条颜色不同的色素带。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对样点位置和液面高度。',
        '建议按“识别 → 点样 → 放入层析液 → 观察色带 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel pigmentsep-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属生物实验页</h2><p>把滤纸层析瓶、溶剂液面和多层色素带做成更接近真实演示的分离场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid pigmentsep-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'jar' ? '层析瓶近景' : '色素带近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>层析建立 {solventValue}</span><div className="chem-meter-bar"><i style={{ width: `${solventValue}%` }} /></div></div><div className="chem-meter"><span>色带清晰度 {bandValue}</span><div className="chem-meter-bar"><i style={{ width: `${bandValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card pigmentsep-data-card"><span className="eyebrow">Readout</span><h3>层析读数板</h3><div className="generic-readout-grid pigmentsep-readout-grid"><article className={spotted ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>样点状态</span><strong>{spotted ? '已点样' : '--'}</strong><small>{spotted ? '起始线已有叶绿素样点。' : '先完成点样。'}</small></article><article className={stripPlaced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>层析状态</span><strong>{stripPlaced ? '溶剂上升中' : '--'}</strong><small>{stripPlaced ? '滤纸条已放入层析液。' : '等待放入层析液。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '不同色素迁移不同' : '等待总结'}</strong><small>色素因溶解度和扩散速度不同而分离。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '滤纸层析装置'} · 当前重点：{step <= 2 ? '形成规范样点' : step === 3 ? '放入层析液' : '观察多条色带'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'jar' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('jar')} type="button">层析瓶</button><button className={cameraPreset === 'bands' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bands')} type="button">色带</button></div></div><div className={`scene-canvas pigmentsep-stage preset-${cameraPreset} ${spotted ? 'spotted' : ''} ${stripPlaced ? 'strip-placed' : ''}`}><div className="pigmentsep-rig"><div className="pg-jar"><div className="pg-solvent" /><div className={stripPlaced ? 'pg-strip active' : 'pg-strip'}><span className={spotted ? 'pg-spot active' : 'pg-spot'} /><span className={stripPlaced ? 'pg-band yellow active' : 'pg-band yellow'} /><span className={stripPlaced ? 'pg-band green active' : 'pg-band green'} /><span className={stripPlaced ? 'pg-band blue active' : 'pg-band blue'} /></div></div><div className="pg-mortar" /><div className="pg-dropper" /></div></div><div className="observation-ribbon pigmentsep-observation-row"><article className={spotted ? 'observation-chip active' : 'observation-chip calm'}><strong>点样</strong><span>{spotted ? '样点已形成。' : '等待点样。'}</span></article><article className={stripPlaced ? 'observation-chip active' : 'observation-chip calm'}><strong>层析</strong><span>{stripPlaced ? '溶剂已沿滤纸上升。' : '等待放入层析液。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>色素带</strong><span>{observationChoice === 'correct' ? '已观察到多条色带。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleSpot('correct')} type="button"><strong>把色素提取液点在滤纸条起始线上</strong><span>形成规范样点。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSpot('high')} type="button"><strong>把样点点在滤纸条过高位置</strong><span>错误演示：不利于层析分离。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePlaceStrip('correct')} type="button"><strong>将滤纸条放入层析液，液面低于样点</strong><span>标准层析操作。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePlaceStrip('submerge')} type="button"><strong>让层析液直接没过样点</strong><span>错误演示：会影响分离效果。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“滤纸条上分离出多条颜色不同的色素带”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“所有色素始终重叠成一条线”</strong><span>错误演示：忽略分离结果。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('washout')} type="button"><strong>记录“所有色素都被直接冲洗掉，不会形成色带”</strong><span>错误演示：与规范操作不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>不同色素在层析液中的溶解度和扩散速度不同，因此会分离成不同色带</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('one')} type="button"><strong>叶绿体中只有一种色素，所以不会分离</strong><span>错误演示：与实验现象相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('none')} type="button"><strong>层析时色素不会移动，所以看不到任何差别</strong><span>错误演示：概念错误。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{spotted ? '已点样' : '待点样'} / {stripPlaced ? '已层析' : '待层析'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意液面不能没过样点'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“叶绿体色素分离”升级成可见多层色带上升的专属页。</small></section></aside>
      </div>
    </section>
  );
}
