import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'flask' | 'fountain';
type MaterialId = 'flask' | 'ammonia' | 'waterbasin' | 'phenolphthalein' | 'dropper';
type TimelineState = 'done' | 'current' | 'todo';

interface AmmoniaFountainLabPlayerProps {
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
  2: '准备酚酞水',
  3: '滴入少量水',
  4: '观察红色喷泉',
  5: '总结喷泉现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别充满氨气的烧瓶、水槽、酚酞溶液和滴管。',
  2: '准备含酚酞的水槽液体，建立后续显色基础。',
  3: '向烧瓶内滴入少量水，触发压差变化。',
  4: '观察水槽液体是否被迅速吸入并形成红色喷泉。',
  5: '总结氨气极易溶于水并导致喷泉与显色的现象。',
};

const materialLabels: Record<MaterialId, string> = {
  flask: '充满氨气的烧瓶',
  ammonia: '氨气',
  waterbasin: '水槽',
  phenolphthalein: '酚酞溶液',
  dropper: '滴管',
};

const materialOrder: MaterialId[] = ['flask', 'ammonia', 'waterbasin', 'phenolphthalein', 'dropper'];

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

export function AmmoniaFountainLabPlayer({ experiment, onTelemetry }: AmmoniaFountainLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [waterReady, setWaterReady] = useState(false);
  const [waterInjected, setWaterInjected] = useState(false);
  const [fountainObserved, setFountainObserved] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过氨气溶于水观察红色喷泉现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const fountainValue = clamp(24 + (waterReady ? 18 : 0) + (waterInjected ? 20 : 0) + (fountainObserved ? 24 : 0), 20, 99);
  const visualValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 30 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (waterReady ? 10 : 0) + (waterInjected ? 10 : 0) + (fountainObserved ? 14 : 0), 20, 100);
  const basinLiquidOpacity = waterReady ? 0.92 : 0.48;
  const fountainHeight = fountainObserved ? 132 : waterInjected ? 48 : 0;
  const fountainSpread = fountainObserved ? 1 : 0.34;
  const stageMode = fountainObserved ? 'fountain' : waterInjected ? 'injecting' : waterReady ? 'primed' : 'idle';

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
        setCameraPreset('flask');
        advanceStep(2, '器材识别完成，下一步准备含酚酞的水槽液体。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePrepareWater = (choice: 'correct' | 'plain') => {
    if (step !== 2 || completed) return;
    if (choice === 'plain') {
      markError('可先准备含酚酞的水槽液体，后续喷泉显色会更直观。');
      return;
    }
    setWaterReady(true);
    appendNote('准备记录：水槽中已形成含酚酞的无色液体。');
    advanceStep(3, '显色基础已准备好，下一步向烧瓶滴入少量水。');
  };

  const handleInjectWater = (choice: 'correct' | 'none') => {
    if (step !== 3 || completed) return;
    if (!waterReady) {
      markError('请先准备含酚酞的水槽液体，再滴水触发喷泉。');
      return;
    }
    if (choice === 'none') {
      markError('需要先向烧瓶内滴入少量水，才能触发明显喷泉。');
      return;
    }
    setWaterInjected(true);
    setCameraPreset('fountain');
    appendNote('触发记录：少量水进入烧瓶后，系统开始出现明显吸液趋势。');
    advanceStep(4, '喷泉已被触发，请记录红色液体喷入烧瓶的现象。');
  };

  const handleObserveFountain = (choice: 'correct' | 'slow' | 'clear') => {
    if (step !== 4 || completed) return;
    if (!waterInjected) {
      markError('请先滴入少量水，再观察喷泉。');
      return;
    }
    setObservationChoice(choice);
    if (choice === 'correct') {
      setFountainObserved(true);
      appendNote('观察记录：水槽液体被迅速吸入烧瓶，并形成明显红色喷泉。');
      advanceStep(5, '喷泉现象已记录，请完成总结。');
      return;
    }
    markError(choice === 'slow' ? '典型现象不是缓慢几乎不可见，而是明显快速的喷泉。' : '进入烧瓶后的液体不会始终透明，因显色会呈红色。');
  };

  const handleSummary = (choice: 'correct' | 'no-solubility' | 'color-only') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：氨气极易溶于水，导致压差形成喷泉，并使酚酞显红。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'no-solubility' ? '该喷泉现象恰恰说明氨气极易溶于水，不能忽略。' : '这不仅是颜色变化，更有明显液体被吸入并形成喷泉的过程。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setWaterReady(false);
    setWaterInjected(false);
    setFountainObserved(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察红色喷泉。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先准备含酚酞的无色水槽液体。', '再向烧瓶滴入少量水触发压差。', '重点看“快速吸液 + 红色喷泉”两个关键现象。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对准备与触发顺序。',
        '建议按“识别 → 准备液体 → 滴水触发 → 看喷泉 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel ammoniafountain-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把压差吸液、红色喷泉和烧瓶内液柱上冲做成更具戏剧性的化学演示场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid ammoniafountain-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'flask' ? '烧瓶近景' : '喷泉近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>喷泉强度 {fountainValue}</span><div className="chem-meter-bar"><i style={{ width: `${fountainValue}%` }} /></div></div><div className="chem-meter"><span>视觉冲击 {visualValue}</span><div className="chem-meter-bar"><i style={{ width: `${visualValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card ammoniafountain-data-card"><span className="eyebrow">Readout</span><h3>喷泉读数板</h3><div className="generic-readout-grid ammoniafountain-readout-grid"><article className={waterReady ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>水槽液体</span><strong>{waterReady ? '已准备' : '--'}</strong><small>{waterReady ? '含酚酞的无色液体已就位。' : '先准备水槽液体。'}</small></article><article className={fountainObserved ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>红色喷泉</span><strong>{fountainObserved ? '已出现' : '--'}</strong><small>{fountainObserved ? '快速吸液与红色喷泉已形成。' : '等待触发喷泉。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '易溶形成喷泉' : '等待总结'}</strong><small>该实验最震撼的地方是液体被迅速吸入并伴随显色。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '氨气喷泉装置'} · 当前重点：{step <= 2 ? '准备显色水槽' : step === 3 ? '滴水触发' : '观察红色喷泉'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'flask' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flask')} type="button">烧瓶</button><button className={cameraPreset === 'fountain' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('fountain')} type="button">喷泉</button></div></div><div className={`scene-canvas ammoniafountain-stage preset-${cameraPreset} ${waterReady ? 'water-ready' : ''} ${waterInjected ? 'water-injected' : ''} ${fountainObserved ? 'fountain-observed' : ''} stage-${stageMode}`}>
              <div className="ammoniafountain-rig">
                <div className="af-bench-shadow" />
                <div className="af-stand">
                  <div className="af-stand-base" />
                  <div className="af-stand-pole" />
                  <div className="af-stand-clamp" />
                  <div className="af-stand-ring" />
                  <div className="af-stand-joint" />
                </div>

                <div className={waterReady ? 'af-waterbasin active' : 'af-waterbasin'}>
                  <div className="af-waterbasin-rim" />
                  <div className={waterReady ? 'af-basin-liquid active' : 'af-basin-liquid'} style={{ opacity: basinLiquidOpacity }}>
                    <div className="af-basin-surface" />
                    <span className="af-basin-meniscus" />
                    <span className={waterInjected ? 'af-basin-caustic active' : 'af-basin-caustic'} />
                    <span className="af-basin-bubble af-basin-bubble-1" />
                    <span className="af-basin-bubble af-basin-bubble-2" />
                    <span className="af-basin-bubble af-basin-bubble-3" />
                  </div>
                </div>

                <div className={waterReady ? 'af-flask active' : 'af-flask'}>
                  <div className="af-flask-rim" />
                  <div className="af-flask-neck" />
                  <div className="af-flask-gloss" />
                  <div className={waterReady ? 'af-ammonia-haze active' : 'af-ammonia-haze'} />
                  <div className={waterInjected ? 'af-dropper-port active' : 'af-dropper-port'} />
                  <div className={waterInjected ? 'af-pressure-halo active' : 'af-pressure-halo'} />
                  <div className={fountainObserved ? 'af-fountain active' : waterInjected ? 'af-fountain primed' : 'af-fountain'} style={{ ['--af-fountain-height' as string]: `${fountainHeight}px`, ['--af-fountain-spread' as string]: fountainSpread }}>
                    <div className="af-fountain-core" />
                    <div className="af-fountain-crown" />
                    <div className="af-fountain-mist" />
                    <div className={fountainObserved ? 'af-jet-droplets active' : 'af-jet-droplets'} />
                  </div>
                  <div className={fountainObserved ? 'af-liquid-rise active' : waterInjected ? 'af-liquid-rise primed' : 'af-liquid-rise'}>
                    <span className={waterInjected ? 'af-vacuum-front active' : 'af-vacuum-front'} />
                  </div>
                </div>

                <div className={waterInjected ? 'af-dropper active' : 'af-dropper'}>
                  <div className="af-dropper-bulb" />
                  <div className="af-dropper-glass" />
                  <div className={waterInjected ? 'af-drop active' : 'af-drop'} />
                </div>
              </div>
            </div>

<div className="observation-ribbon ammoniafountain-observation-row"><article className={waterReady ? 'observation-chip active' : 'observation-chip calm'}><strong>准备</strong><span>{waterReady ? '显色水槽已准备好。' : '等待准备显色水槽。'}</span></article><article className={waterInjected ? 'observation-chip active' : 'observation-chip calm'}><strong>触发</strong><span>{waterInjected ? '已向烧瓶滴入少量水。' : '等待滴水触发。'}</span></article><article className={fountainObserved ? 'observation-chip active' : 'observation-chip calm'}><strong>喷泉</strong><span>{fountainObserved ? '已观察到明显红色喷泉。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePrepareWater('correct')} type="button"><strong>在水槽中准备含酚酞的无色液体</strong><span>为后续喷泉显色做基础。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePrepareWater('plain')} type="button"><strong>只准备普通清水后期待明显红色喷泉</strong><span>错误演示：显色对比不足。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleInjectWater('correct')} type="button"><strong>向烧瓶滴入少量水，触发压差吸液</strong><span>启动喷泉现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleInjectWater('none')} type="button"><strong>不滴水直接等待喷泉自己出现</strong><span>错误演示：缺少触发步骤。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserveFountain('correct')} type="button"><strong>记录“液体被迅速吸入并形成明显红色喷泉”</strong><span>这是本实验最典型的现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserveFountain('slow')} type="button"><strong>记录“液体只会极慢地一点点渗入”</strong><span>错误演示：忽略强烈喷泉。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserveFountain('clear')} type="button"><strong>记录“吸入的液体始终透明，没有显色”</strong><span>错误演示：忽略显色现象。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>氨气极易溶于水，导致压差形成喷泉，并使酚酞显红</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-solubility')} type="button"><strong>喷泉和氨气是否易溶于水没有关系</strong><span>错误演示：原理错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('color-only')} type="button"><strong>这只是一个简单染色现象，没有明显吸液喷泉过程</strong><span>错误演示：忽略关键运动现象。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{waterReady ? '显色液已准备' : '显色液待准备'} / {fountainObserved ? '喷泉已出现' : '喷泉待出现'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先准备显色液，再滴水触发喷泉'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“氨气喷泉”升级成更具戏剧效果的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
