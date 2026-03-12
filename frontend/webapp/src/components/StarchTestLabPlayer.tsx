import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'sample' | 'reaction';
type MaterialId = 'sample' | 'iodine' | 'dropper' | 'tile' | 'dish';
type TimelineState = 'done' | 'current' | 'todo';

interface StarchTestLabPlayerProps {
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
  2: '放置样品',
  3: '滴加碘液',
  4: '观察变色',
  5: '总结检验方法',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别样品、碘液、滴管、白瓷板和培养皿。',
  2: '将待测食物样品放在白瓷板上。',
  3: '向样品表面滴加碘液。',
  4: '观察样品颜色是否变成蓝黑色。',
  5: '总结淀粉遇碘液会呈蓝黑色。',
};

const materialLabels: Record<MaterialId, string> = {
  sample: '食物样品',
  iodine: '碘液',
  dropper: '滴管',
  tile: '白瓷板',
  dish: '培养皿',
};

const materialOrder: MaterialId[] = ['sample', 'iodine', 'dropper', 'tile', 'dish'];

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

export function StarchTestLabPlayer({ experiment, onTelemetry }: StarchTestLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [samplePlaced, setSamplePlaced] = useState(false);
  const [iodineAdded, setIodineAdded] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过碘液观察食物样品是否出现蓝黑色反应。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const reactionValue = clamp(28 + (samplePlaced ? 18 : 0) + (iodineAdded ? 24 : 0), 20, 99);
  const colorValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (samplePlaced ? 10 : 0) + (iodineAdded ? 14 : 0), 20, 100);

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
        setCameraPreset('sample');
        advanceStep(2, '器材识别完成，先放置食物样品。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePlaceSample = (choice: 'correct' | 'none') => {
    if (step !== 2 || completed) return;
    if (choice === 'none') {
      markError('请先把待测样品放到白瓷板上，再进行滴液。');
      return;
    }
    setSamplePlaced(true);
    appendNote('样品状态：食物样品已放在白瓷板中央。');
    advanceStep(3, '样品已就位，下一步滴加碘液。');
  };

  const handleIodine = (choice: 'correct' | 'water') => {
    if (step !== 3 || completed) return;
    if (!samplePlaced) {
      markError('请先放置样品，再滴加试剂。');
      return;
    }
    if (choice === 'water') {
      markError('本实验需要滴加碘液，清水不会产生典型显色反应。');
      return;
    }
    setIodineAdded(true);
    setCameraPreset('reaction');
    appendNote('反应开始：样品表面已滴加碘液，颜色逐渐加深。');
    advanceStep(4, '碘液已加入，请观察颜色变化。');
  };

  const handleObserve = (choice: 'correct' | 'yellow' | 'red') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!samplePlaced || !iodineAdded) {
      markError('请先放置样品并滴加碘液。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：样品与碘液接触后呈蓝黑色。');
      advanceStep(5, '变色现象已观察到，下一步总结淀粉检验方法。');
      return;
    }
    markError(choice === 'yellow' ? '碘液本身偏黄褐色，但遇淀粉会显蓝黑色。' : '该实验的典型现象不是变红，而是蓝黑色反应。');
  };

  const handleSummary = (choice: 'correct' | 'no-effect' | 'alkali') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：淀粉遇碘液会变蓝黑色，可据此检验食物中是否含淀粉。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'no-effect' ? '碘液不是没有作用，而是能与淀粉产生蓝黑色显色反应。' : '碘液检验淀粉不是利用酸碱变化，而是特征显色。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSamplePlaced(false);
    setIodineAdded(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新用碘液检验淀粉。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先放样品，再滴加碘液。', '观察时重点看样品是否变成蓝黑色。', '结论关键词是“淀粉 + 碘液 → 蓝黑色”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对是否使用了碘液。',
        '建议按“识别 → 放样品 → 滴碘液 → 观察变色 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel starchtest-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把白瓷板、样品表面滴液和蓝黑色显色反应做成更接近真实课堂操作的检测场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid starchtest-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'sample' ? '样品近景' : '反应近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>反应准备 {reactionValue}</span><div className="chem-meter-bar"><i style={{ width: `${reactionValue}%` }} /></div></div><div className="chem-meter"><span>显色清晰度 {colorValue}</span><div className="chem-meter-bar"><i style={{ width: `${colorValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card starchtest-data-card"><span className="eyebrow">Readout</span><h3>显色读数板</h3><div className="generic-readout-grid starchtest-readout-grid"><article className={samplePlaced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>样品状态</span><strong>{samplePlaced ? '已放置' : '--'}</strong><small>{samplePlaced ? '样品已放在白瓷板上。' : '先放置样品。'}</small></article><article className={iodineAdded ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>试剂状态</span><strong>{iodineAdded ? '已滴碘液' : '--'}</strong><small>{iodineAdded ? '显色反应已开始。' : '等待滴加碘液。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '蓝黑色显色' : '等待总结'}</strong><small>碘液可用于检验样品中是否含有淀粉。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '淀粉检验装置'} · 当前重点：{step <= 2 ? '规范放样' : step === 3 ? '滴加碘液' : '观察蓝黑色反应'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'sample' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('sample')} type="button">样品</button><button className={cameraPreset === 'reaction' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('reaction')} type="button">反应</button></div></div><div className={`scene-canvas starchtest-stage preset-${cameraPreset} ${samplePlaced ? 'sample-placed' : ''} ${iodineAdded ? 'iodine-added' : ''}`}><div className="starchtest-rig"><div className="st-tile" /><div className={samplePlaced ? 'st-sample active' : 'st-sample'}><div className={iodineAdded ? 'st-reaction active' : 'st-reaction'} /></div><div className={iodineAdded ? 'st-dropper active' : 'st-dropper'} /><div className="st-dish" /></div></div><div className="observation-ribbon starchtest-observation-row"><article className={samplePlaced ? 'observation-chip active' : 'observation-chip calm'}><strong>样品</strong><span>{samplePlaced ? '样品已放好。' : '等待放样。'}</span></article><article className={iodineAdded ? 'observation-chip active' : 'observation-chip calm'}><strong>碘液</strong><span>{iodineAdded ? '碘液已滴加。' : '等待滴加碘液。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>显色</strong><span>{observationChoice === 'correct' ? '已观察到蓝黑色。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePlaceSample('correct')} type="button"><strong>把样品放在白瓷板中央</strong><span>建立检测对象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePlaceSample('none')} type="button"><strong>不放样品直接开始滴液</strong><span>错误演示：没有检测对象。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleIodine('correct')} type="button"><strong>向样品表面滴加碘液</strong><span>触发淀粉显色反应。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleIodine('water')} type="button"><strong>向样品滴加清水代替碘液</strong><span>错误演示：不会出现典型显色。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“样品遇碘液后呈蓝黑色”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('yellow')} type="button"><strong>记录“样品始终保持碘液本来的黄褐色”</strong><span>错误演示：忽略显色反应。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('red')} type="button"><strong>记录“样品会变成红色”</strong><span>错误演示：颜色判断错误。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>淀粉遇碘液会变蓝黑色，可据此检验食物中是否含有淀粉</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-effect')} type="button"><strong>碘液对检验淀粉没有任何作用</strong><span>错误演示：与实验现象相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('alkali')} type="button"><strong>碘液检验淀粉主要靠判断酸碱性</strong><span>错误演示：原理错误。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{samplePlaced ? '样品已放' : '样品待放'} / {iodineAdded ? '碘液已加' : '碘液待加'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意使用碘液而不是清水'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“碘液检验淀粉”升级成蓝黑色显色的专属页。</small></section></aside>
      </div>
    </section>
  );
}
