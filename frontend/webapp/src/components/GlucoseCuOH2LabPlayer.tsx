import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tube' | 'heating';
type MaterialId = 'cuso4' | 'naoh' | 'glucose' | 'lamp' | 'tube';
type TimelineState = 'done' | 'current' | 'todo';

interface GlucoseCuOH2LabPlayerProps {
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
  2: '配制蓝色悬浊液',
  3: '加入葡萄糖',
  4: '加热变砖红',
  5: '总结显色变化',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别硫酸铜溶液、氢氧化钠溶液、葡萄糖溶液、酒精灯和试管。',
  2: '将硫酸铜与氢氧化钠混合，配制蓝色悬浊液。',
  3: '向蓝色悬浊液中加入葡萄糖溶液。',
  4: '加热试管，观察蓝色体系是否逐渐出现砖红色沉淀。',
  5: '总结“蓝色悬浊液经加热后变成砖红色沉淀”的变化。',
};

const materialLabels: Record<MaterialId, string> = {
  cuso4: '硫酸铜溶液',
  naoh: '氢氧化钠溶液',
  glucose: '葡萄糖溶液',
  lamp: '酒精灯',
  tube: '试管',
};

const materialOrder: MaterialId[] = ['cuso4', 'naoh', 'glucose', 'lamp', 'tube'];

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

export function GlucoseCuOH2LabPlayer({ experiment, onTelemetry }: GlucoseCuOH2LabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [bluePrepared, setBluePrepared] = useState(false);
  const [glucoseAdded, setGlucoseAdded] = useState(false);
  const [brickRed, setBrickRed] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过加热葡萄糖与新制氢氧化铜观察由蓝到砖红的明显变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const heatValue = clamp(24 + (bluePrepared ? 18 : 0) + (glucoseAdded ? 18 : 0) + (brickRed ? 24 : 0), 20, 99);
  const colorValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 30 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (bluePrepared ? 10 : 0) + (glucoseAdded ? 10 : 0) + (brickRed ? 14 : 0), 20, 100);

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
        setCameraPreset('tube');
        advanceStep(2, '器材识别完成，下一步配制蓝色悬浊液。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePrepareBlue = (choice: 'correct' | 'water') => {
    if (step !== 2 || completed) return;
    if (choice === 'water') {
      markError('需要混合硫酸铜和氢氧化钠，才能配制蓝色悬浊液。');
      return;
    }
    setBluePrepared(true);
    appendNote('配制记录：试管中已形成蓝色悬浊液。');
    advanceStep(3, '蓝色悬浊液已配好，下一步加入葡萄糖。');
  };

  const handleAddGlucose = (choice: 'correct' | 'skip') => {
    if (step !== 3 || completed) return;
    if (!bluePrepared) {
      markError('请先配制蓝色悬浊液，再加入葡萄糖。');
      return;
    }
    if (choice === 'skip') {
      markError('需要先加入葡萄糖溶液，加热后才能更好看到砖红色变化。');
      return;
    }
    setGlucoseAdded(true);
    setCameraPreset('heating');
    appendNote('加样记录：葡萄糖溶液已加入蓝色体系。');
    advanceStep(4, '葡萄糖已加入，下一步加热观察砖红色沉淀。');
  };

  const handleHeat = (choice: 'correct' | 'blue' | 'black') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!glucoseAdded) {
      markError('请先向蓝色悬浊液中加入葡萄糖，再进行加热。');
      return;
    }
    if (choice === 'correct') {
      setBrickRed(true);
      appendNote('观察记录：加热后蓝色体系逐渐出现砖红色沉淀。');
      advanceStep(5, '砖红色沉淀已出现，请完成总结。');
      return;
    }
    markError(choice === 'blue' ? '加热后不应始终保持蓝色，典型现象是出现砖红色沉淀。' : '此实验不是直接变黑，关键现象是砖红色沉淀。');
  };

  const handleSummary = (choice: 'correct' | 'only-blue' | 'no-heat') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：蓝色新制氢氧化铜与葡萄糖加热后可出现砖红色沉淀。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'only-blue' ? '该实验不会一直保持蓝色不变，关键结果是加热后出现砖红色沉淀。' : '若不加热，就难以完整观察到该显色变化。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setBluePrepared(false);
    setGlucoseAdded(false);
    setBrickRed(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察葡萄糖与新制氢氧化铜加热显色。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先配制蓝色悬浊液，再加入葡萄糖。', '加热时重点看由蓝到砖红的变化。', '结论关键词是“加热、砖红沉淀、明显变色”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对配液与加热顺序。',
        '建议按“识别 → 配蓝液 → 加葡萄糖 → 加热观察 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel glucosecuoh2-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把蓝色悬浊液、酒精灯加热和砖红沉淀显现做成更有层次、更接近真实试管反应的场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid glucosecuoh2-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tube' ? '试管近景' : '加热近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>加热进度 {heatValue}</span><div className="chem-meter-bar"><i style={{ width: `${heatValue}%` }} /></div></div><div className="chem-meter"><span>颜色变化 {colorValue}</span><div className="chem-meter-bar"><i style={{ width: `${colorValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card glucosecuoh2-data-card"><span className="eyebrow">Readout</span><h3>显色读数板</h3><div className="generic-readout-grid glucosecuoh2-readout-grid"><article className={bluePrepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>蓝色体系</span><strong>{bluePrepared ? '已配制' : '--'}</strong><small>{bluePrepared ? '试管中已形成蓝色悬浊液。' : '先配制蓝色悬浊液。'}</small></article><article className={brickRed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>砖红沉淀</span><strong>{brickRed ? '已出现' : '--'}</strong><small>{brickRed ? '加热后已出现砖红色沉淀。' : '等待加热显色。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '蓝变砖红' : '等待总结'}</strong><small>该实验最典型的证据是蓝色体系加热后出现砖红沉淀。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '葡萄糖显色装置'} · 当前重点：{step <= 2 ? '配制蓝色悬浊液' : step === 3 ? '加入葡萄糖' : '加热观察砖红沉淀'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'tube' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tube')} type="button">试管</button><button className={cameraPreset === 'heating' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('heating')} type="button">加热</button></div></div><div className={`scene-canvas glucosecuoh2-stage preset-${cameraPreset} ${bluePrepared ? 'blue-prepared' : ''} ${glucoseAdded ? 'glucose-added' : ''} ${brickRed ? 'brick-red' : ''}`}>
          <div className="glucosecuoh2-rig">
            <div className="gch-bench-shadow" />
            <div className="gch-bench-caustic" />
            <div className={bluePrepared ? 'gch-tube active' : 'gch-tube'}>
              <div className="gch-tube-rim" />
              <div className="gch-tube-gloss" />
              <div className={bluePrepared ? 'gch-meniscus active' : 'gch-meniscus'} />
              <div className={glucoseAdded && !brickRed ? 'gch-blue-cloud active' : 'gch-blue-cloud'} />
              <div className={brickRed ? 'gch-brick-front active' : 'gch-brick-front'} />
              <div className={brickRed ? 'gch-liquid active brick' : bluePrepared ? 'gch-liquid active blue' : 'gch-liquid'}>
                <span className="gch-liquid-surface" />
              </div>
              <div className={brickRed ? 'gch-precipitate active' : 'gch-precipitate'}>
                <span className={brickRed ? 'gch-precip-specks active' : 'gch-precip-specks'} />
              </div>
            </div>
            <div className={brickRed ? 'gch-lamp active' : glucoseAdded ? 'gch-lamp active ready' : 'gch-lamp'}>
              <span className={glucoseAdded ? 'gch-heat-shimmer active' : 'gch-heat-shimmer'} />
            </div>
            <div className={glucoseAdded ? 'gch-dropper active' : 'gch-dropper'}>
              <span className="gch-dropper-bulb" />
              <span className="gch-dropper-glass" />
              <span className={glucoseAdded && !brickRed ? 'gch-dropper-front active' : 'gch-dropper-front'} />
            </div>
            <div className={bluePrepared ? 'gch-bottle cuso4 active' : 'gch-bottle cuso4'}>
              <span className="gch-bottle-rim" />
              <span className="gch-bottle-glass" />
            </div>
            <div className={bluePrepared ? 'gch-bottle naoh active' : 'gch-bottle naoh'}>
              <span className="gch-bottle-rim" />
              <span className="gch-bottle-glass" />
            </div>
          </div>
        </div>

        <div className="observation-ribbon glucosecuoh2-observation-row"><article className={bluePrepared ? 'observation-chip active' : 'observation-chip calm'}><strong>配液</strong><span>{bluePrepared ? '蓝色悬浊液已配制。' : '等待配制蓝色悬浊液。'}</span></article><article className={glucoseAdded ? 'observation-chip active' : 'observation-chip calm'}><strong>加糖</strong><span>{glucoseAdded ? '葡萄糖溶液已加入。' : '等待加入葡萄糖。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>变色</strong><span>{observationChoice === 'correct' ? '已记录砖红色沉淀。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePrepareBlue('correct')} type="button"><strong>混合硫酸铜与氢氧化钠，配制蓝色悬浊液</strong><span>建立后续加热显色的基础体系。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePrepareBlue('water')} type="button"><strong>直接加清水后等待显色</strong><span>错误演示：缺少蓝色体系。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAddGlucose('correct')} type="button"><strong>向蓝色悬浊液中加入葡萄糖溶液</strong><span>为后续加热变色做准备。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAddGlucose('skip')} type="button"><strong>不加葡萄糖直接开始加热</strong><span>错误演示：缺少关键反应物。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleHeat('correct')} type="button"><strong>加热后记录“蓝色体系逐渐出现砖红色沉淀”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleHeat('blue')} type="button"><strong>记录“加热后始终保持纯蓝色不变”</strong><span>错误演示：忽略显色变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleHeat('black')} type="button"><strong>记录“加热后会直接变成黑色物质”</strong><span>错误演示：颜色判断错误。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>蓝色新制氢氧化铜与葡萄糖加热后会出现砖红色沉淀</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('only-blue')} type="button"><strong>无论怎么加热，它都只会保持蓝色</strong><span>错误演示：与现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-heat')} type="button"><strong>这个实验不需要加热也会立刻出现砖红色</strong><span>错误演示：忽略加热步骤。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{bluePrepared ? '蓝色体系已配' : '蓝色体系待配'} / {brickRed ? '砖红沉淀已现' : '砖红沉淀待现'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先配蓝液，再加葡萄糖，后加热'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“葡萄糖与新制氢氧化铜加热显色”升级成蓝到砖红更明显的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
