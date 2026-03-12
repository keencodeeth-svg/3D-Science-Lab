import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'jar' | 'gauge';
type MaterialId = 'bell' | 'jar' | 'pump' | 'gauge' | 'switch';
type TimelineState = 'done' | 'current' | 'todo';

interface SoundVacuumLabPlayerProps {
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
  2: '放置铃罩装置',
  3: '抽气形成低压环境',
  4: '观察声音变化',
  5: '总结真空不能传声',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别电铃、玻璃铃罩、抽气泵、压力表和开关。',
  2: '把电铃装置放入玻璃铃罩并盖好。',
  3: '启动抽气泵，让铃罩内空气逐渐减少。',
  4: '观察电铃仍在振动，但声音会明显减弱。',
  5: '总结声音传播需要介质，真空不能传声。',
};

const materialLabels: Record<MaterialId, string> = {
  bell: '电铃',
  jar: '玻璃铃罩',
  pump: '抽气泵',
  gauge: '压力表',
  switch: '开关',
};

const materialOrder: MaterialId[] = ['bell', 'jar', 'pump', 'gauge', 'switch'];

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

export function SoundVacuumLabPlayer({ experiment, onTelemetry }: SoundVacuumLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [apparatusReady, setApparatusReady] = useState(false);
  const [pumped, setPumped] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过玻璃铃罩、电铃和抽气泵观察真空不能传声。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const pressureValue = clamp(28 + (apparatusReady ? 18 : 0) + (pumped ? 24 : 0), 20, 99);
  const soundValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (apparatusReady ? 10 : 0) + (pumped ? 14 : 0), 20, 100);

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
        advanceStep(2, '器材识别完成，先盖好铃罩装置。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleApparatus = (choice: 'correct' | 'open') => {
    if (step !== 2 || completed) return;
    if (choice === 'open') {
      markError('需要先把电铃装置置于密闭铃罩中，才能进行抽气对比。');
      return;
    }
    setApparatusReady(true);
    appendNote('装置状态：电铃已置于玻璃铃罩内并连接抽气系统。');
    advanceStep(3, '铃罩装置已准备好，下一步启动抽气。');
  };

  const handlePump = (choice: 'correct' | 'stop') => {
    if (step !== 3 || completed) return;
    if (!apparatusReady) {
      markError('请先盖好铃罩装置，再进行抽气。');
      return;
    }
    if (choice === 'stop') {
      markError('若不抽气，铃罩内空气不会减少，无法体现对比现象。');
      return;
    }
    setPumped(true);
    setCameraPreset('gauge');
    appendNote('抽气状态：压力表读数下降，铃罩内空气明显减少。');
    advanceStep(4, '已形成低压环境，请观察声音变化。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'stop-vibration') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!apparatusReady || !pumped) {
      markError('请先完成铃罩准备和抽气。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：电铃仍在振动，但声音明显减弱甚至几乎听不见。');
      advanceStep(5, '现象已观察到，下一步总结真空传声条件。');
      return;
    }
    markError(choice === 'same' ? '抽气后声音不会保持同样响亮，而是逐渐减弱。' : '抽气不会让电铃立刻停止振动，变化主要体现在声音传播上。');
  };

  const handleSummary = (choice: 'correct' | 'no-medium-needed' | 'vibration-only') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：声音传播需要介质，真空中不能传声。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'no-medium-needed' ? '声音不是不需要介质，而是必须依靠介质传播。' : '只有振动而没有传播介质时，人也无法听到声音。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setApparatusReady(false);
    setPumped(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察真空不能传声。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先盖好铃罩，再启动抽气泵。', '观察时重点看“铃在振动但声音变弱”。', '结论关键词是“声音传播需要介质”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对铃罩是否密闭并已抽气。',
        '建议按“识别 → 盖铃罩 → 抽气 → 观察 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel soundvacuum-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属物理实验页</h2><p>把玻璃铃罩、电铃振动、压力表变化和声音衰减做成更接近真实演示仪器的场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid soundvacuum-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'jar' ? '铃罩近景' : '表盘近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>低压建立 {pressureValue}</span><div className="chem-meter-bar"><i style={{ width: `${pressureValue}%` }} /></div></div><div className="chem-meter"><span>声音衰减 {soundValue}</span><div className="chem-meter-bar"><i style={{ width: `${soundValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card soundvacuum-data-card"><span className="eyebrow">Readout</span><h3>铃罩读数板</h3><div className="generic-readout-grid soundvacuum-readout-grid"><article className={apparatusReady ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装置状态</span><strong>{apparatusReady ? '已密闭' : '--'}</strong><small>{apparatusReady ? '电铃已置于铃罩内。' : '先密闭铃罩。'}</small></article><article className={pumped ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>压力状态</span><strong>{pumped ? '低压' : '--'}</strong><small>{pumped ? '空气已被明显抽走。' : '等待启动抽气泵。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '真空不能传声' : '等待总结'}</strong><small>铃声减弱说明声音传播离不开介质。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '铃罩传声装置'} · 当前重点：{step <= 2 ? '建立密闭铃罩' : step === 3 ? '抽气降压' : '观察声音变化'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'jar' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('jar')} type="button">铃罩</button><button className={cameraPreset === 'gauge' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('gauge')} type="button">表盘</button></div></div><div className={`scene-canvas soundvacuum-stage preset-${cameraPreset} ${apparatusReady ? 'apparatus-ready' : ''} ${pumped ? 'pumped' : ''}`}><div className="soundvacuum-rig"><div className="sv-base" /><div className={apparatusReady ? 'sv-jar active' : 'sv-jar'}><div className={apparatusReady ? 'sv-bell active' : 'sv-bell'}><div className={pumped ? 'sv-wave low' : apparatusReady ? 'sv-wave active' : 'sv-wave'} /></div></div><div className={pumped ? 'sv-gauge active low' : apparatusReady ? 'sv-gauge active' : 'sv-gauge'} /><div className={pumped ? 'sv-pump active' : apparatusReady ? 'sv-pump active' : 'sv-pump'} /></div></div><div className="observation-ribbon soundvacuum-observation-row"><article className={apparatusReady ? 'observation-chip active' : 'observation-chip calm'}><strong>铃罩</strong><span>{apparatusReady ? '装置已密闭。' : '待密闭铃罩。'}</span></article><article className={pumped ? 'observation-chip active' : 'observation-chip calm'}><strong>抽气</strong><span>{pumped ? '已形成低压环境。' : '等待启动抽气。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>声音</strong><span>{observationChoice === 'correct' ? '已记录声音减弱。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleApparatus('correct')} type="button"><strong>把电铃放入玻璃铃罩并密闭连接抽气系统</strong><span>建立对比实验装置。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleApparatus('open')} type="button"><strong>保持铃罩敞开不密闭</strong><span>错误演示：无法形成低压环境。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePump('correct')} type="button"><strong>启动抽气泵降低铃罩内气压</strong><span>让空气逐渐减少。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePump('stop')} type="button"><strong>不抽气直接进入观察</strong><span>错误演示：缺少关键变量变化。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“电铃仍在振动，但声音明显减弱甚至几乎听不见”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“抽气后铃声和原来一样响亮”</strong><span>错误演示：与实验现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('stop-vibration')} type="button"><strong>记录“抽气会让电铃立刻停止振动”</strong><span>错误演示：抓错了变化对象。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>声音传播需要介质，真空中不能传声</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-medium-needed')} type="button"><strong>声音传播不需要任何介质</strong><span>错误演示：与实验相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('vibration-only')} type="button"><strong>只要物体振动，人就一定能听到声音</strong><span>错误演示：忽略传播介质。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{apparatusReady ? '铃罩已密闭' : '铃罩待密闭'} / {pumped ? '已抽气' : '待抽气'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先密闭铃罩，再启动抽气泵'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“真空不能传声”升级成带压力表和铃罩动态的专属页。</small></section></aside>
      </div>
    </section>
  );
}
