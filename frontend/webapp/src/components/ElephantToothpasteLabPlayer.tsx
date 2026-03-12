import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'cylinder' | 'foam';
type MaterialId = 'cylinder' | 'peroxide' | 'detergent' | 'dye' | 'catalyst';
type TimelineState = 'done' | 'current' | 'todo';

interface ElephantToothpasteLabPlayerProps {
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
  2: '加入洗洁精与染料',
  3: '加入催化剂',
  4: '观察彩色泡沫喷涌',
  5: '总结分解现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别量筒、双氧水、洗洁精、食用色素和催化剂。',
  2: '向量筒中的双氧水加入洗洁精和染料，建立有色起始体系。',
  3: '加入催化剂，启动快速分解。',
  4: '观察彩色泡沫是否快速大量喷涌而出。',
  5: '总结该实验中双氧水快速分解并产生大量泡沫的现象。',
};

const materialLabels: Record<MaterialId, string> = {
  cylinder: '量筒',
  peroxide: '双氧水',
  detergent: '洗洁精',
  dye: '食用色素',
  catalyst: '催化剂',
};

const materialOrder: MaterialId[] = ['cylinder', 'peroxide', 'detergent', 'dye', 'catalyst'];

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

export function ElephantToothpasteLabPlayer({ experiment, onTelemetry }: ElephantToothpasteLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [coloredReady, setColoredReady] = useState(false);
  const [catalystAdded, setCatalystAdded] = useState(false);
  const [foamObserved, setFoamObserved] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过催化分解观察彩色泡沫快速喷涌。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const foamValue = clamp(24 + (coloredReady ? 18 : 0) + (catalystAdded ? 22 : 0) + (foamObserved ? 22 : 0), 20, 99);
  const visualValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 30 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (coloredReady ? 10 : 0) + (catalystAdded ? 10 : 0) + (foamObserved ? 14 : 0), 20, 100);

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
        setCameraPreset('cylinder');
        advanceStep(2, '器材识别完成，下一步先加入洗洁精和染料。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePrepare = (choice: 'correct' | 'no-dye') => {
    if (step !== 2 || completed) return;
    if (choice === 'no-dye') {
      markError('可先加入洗洁精和染料，这样后续喷涌的泡沫颜色层次会更清晰。');
      return;
    }
    setColoredReady(true);
    appendNote('准备记录：量筒中已形成有色起始体系。');
    advanceStep(3, '有色体系已准备好，下一步加入催化剂。');
  };

  const handleCatalyst = (choice: 'correct' | 'water') => {
    if (step !== 3 || completed) return;
    if (!coloredReady) {
      markError('请先准备有色起始体系，再加入催化剂。');
      return;
    }
    if (choice === 'water') {
      markError('需要加入催化剂才能快速分解双氧水并产生大量泡沫。');
      return;
    }
    setCatalystAdded(true);
    setCameraPreset('foam');
    appendNote('催化启动：量筒内开始快速产生大量彩色泡沫。');
    advanceStep(4, '催化分解已启动，请记录喷涌泡沫现象。');
  };

  const handleObserveFoam = (choice: 'correct' | 'few' | 'no-foam') => {
    if (step !== 4 || completed) return;
    if (!catalystAdded) {
      markError('请先加入催化剂，再观察泡沫喷涌。');
      return;
    }
    setObservationChoice(choice);
    if (choice === 'correct') {
      setFoamObserved(true);
      appendNote('观察记录：彩色泡沫快速大量喷出并持续上升。');
      advanceStep(5, '泡沫喷涌现象已记录，请完成总结。');
      return;
    }
    markError(choice === 'few' ? '典型现象不是只有少量泡沫，而是快速大量喷涌。' : '加入催化剂后不会毫无泡沫，正确现象非常明显。');
  };

  const handleSummary = (choice: 'correct' | 'only-color' | 'no-catalyst') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：双氧水在催化剂作用下快速分解，伴随大量彩色泡沫喷涌。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'only-color' ? '该实验不只是颜色好看，更关键的是催化分解带来的大量泡沫。' : '没有催化剂时，很难快速产生如此剧烈的泡沫喷涌。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setColoredReady(false);
    setCatalystAdded(false);
    setFoamObserved(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察彩色泡沫喷涌。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先准备有色起始体系。', '再加入催化剂触发快速分解。', '重点看“彩色、大量、持续喷涌”的泡沫表现。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对准备和催化顺序。',
        '建议按“识别 → 准备有色体系 → 加催化剂 → 看喷涌 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel elephanttoothpaste-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把彩色泡沫喷涌、液柱翻卷和持续外溢做成更有舞台效果的仿真实验场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid elephanttoothpaste-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'cylinder' ? '量筒近景' : '泡沫近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>泡沫强度 {foamValue}</span><div className="chem-meter-bar"><i style={{ width: `${foamValue}%` }} /></div></div><div className="chem-meter"><span>视觉冲击 {visualValue}</span><div className="chem-meter-bar"><i style={{ width: `${visualValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card elephanttoothpaste-data-card"><span className="eyebrow">Readout</span><h3>泡沫读数板</h3><div className="generic-readout-grid elephanttoothpaste-readout-grid"><article className={coloredReady ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>有色体系</span><strong>{coloredReady ? '已建立' : '--'}</strong><small>{coloredReady ? '量筒中已形成彩色起始体系。' : '先加入洗洁精和染料。'}</small></article><article className={foamObserved ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>泡沫喷涌</span><strong>{foamObserved ? '已出现' : '--'}</strong><small>{foamObserved ? '大量彩色泡沫已快速喷出。' : '等待催化后喷涌。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '催化分解起泡' : '等待总结'}</strong><small>这个实验最强的观感来自快速分解与大量泡沫的结合。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '彩色泡沫装置'} · 当前重点：{step <= 2 ? '建立有色体系' : step === 3 ? '加入催化剂' : '观察泡沫喷涌'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'cylinder' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('cylinder')} type="button">量筒</button><button className={cameraPreset === 'foam' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('foam')} type="button">泡沫</button></div></div><div className={`scene-canvas elephanttoothpaste-stage preset-${cameraPreset} ${coloredReady ? 'colored-ready' : ''} ${catalystAdded ? 'catalyst-added' : ''} ${foamObserved ? 'foam-observed' : ''}`}><div className="elephanttoothpaste-rig"><div className={coloredReady ? 'ett-cylinder active' : 'ett-cylinder'}><div className={coloredReady ? 'ett-liquid active' : 'ett-liquid'} /><div className={catalystAdded ? 'ett-foam active' : 'ett-foam'} /></div><div className={catalystAdded ? 'ett-catalyst active' : 'ett-catalyst'} /><div className={coloredReady ? 'ett-dye active' : 'ett-dye'} /></div></div><div className="observation-ribbon elephanttoothpaste-observation-row"><article className={coloredReady ? 'observation-chip active' : 'observation-chip calm'}><strong>准备</strong><span>{coloredReady ? '有色起始体系已建立。' : '等待准备起始体系。'}</span></article><article className={catalystAdded ? 'observation-chip active' : 'observation-chip calm'}><strong>催化</strong><span>{catalystAdded ? '催化剂已加入。' : '等待加入催化剂。'}</span></article><article className={foamObserved ? 'observation-chip active' : 'observation-chip calm'}><strong>泡沫</strong><span>{foamObserved ? '已记录大量泡沫喷涌。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePrepare('correct')} type="button"><strong>向量筒中加入洗洁精和染料，建立有色起始体系</strong><span>为后续喷涌泡沫做视觉铺垫。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePrepare('no-dye')} type="button"><strong>不加染料直接等待彩色泡沫</strong><span>错误演示：视觉层次不足。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleCatalyst('correct')} type="button"><strong>加入催化剂，启动快速分解</strong><span>触发大量泡沫喷涌。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCatalyst('water')} type="button"><strong>改加清水后期待同样喷涌</strong><span>错误演示：缺少催化作用。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserveFoam('correct')} type="button"><strong>记录“彩色泡沫快速大量喷涌而出”</strong><span>这是本实验最典型的现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserveFoam('few')} type="button"><strong>记录“只会冒出一点点小泡沫”</strong><span>错误演示：忽略剧烈喷涌。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserveFoam('no-foam')} type="button"><strong>记录“完全不会出现泡沫”</strong><span>错误演示：与实验不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>双氧水在催化剂作用下快速分解，伴随大量彩色泡沫喷涌</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('only-color')} type="button"><strong>这只是染料造成的视觉效果，和反应无关</strong><span>错误演示：忽略分解与起泡。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-catalyst')} type="button"><strong>不需要催化剂也会同样快速喷出大量泡沫</strong><span>错误演示：忽略催化作用。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{coloredReady ? '有色体系已建' : '有色体系待建'} / {foamObserved ? '喷涌已出现' : '喷涌待出现'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先准备有色体系，再加催化剂'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“彩色泡沫喷涌”升级成更有视觉冲击力的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
