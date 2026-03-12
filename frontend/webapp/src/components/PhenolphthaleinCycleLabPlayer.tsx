import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beaker' | 'titration';
type MaterialId = 'beaker' | 'alkali' | 'phenolphthalein' | 'acid' | 'dropper';
type TimelineState = 'done' | 'current' | 'todo';

interface PhenolphthaleinCycleLabPlayerProps {
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
  2: '滴加酚酞显红',
  3: '观察粉红色',
  4: '继续滴酸褪色',
  5: '总结可逆变色',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别烧杯、氢氧化钠溶液、酚酞、稀酸和滴管。',
  2: '向碱液中滴加酚酞，建立明显的粉红色。',
  3: '观察酚酞在碱性环境下是否显粉红色。',
  4: '继续滴加稀酸，观察粉红色是否逐渐褪去。',
  5: '总结酚酞在碱性显红、酸化后褪色的可逆变色现象。',
};

const materialLabels: Record<MaterialId, string> = {
  beaker: '烧杯',
  alkali: '氢氧化钠溶液',
  phenolphthalein: '酚酞试剂',
  acid: '稀酸',
  dropper: '滴管',
};

const materialOrder: MaterialId[] = ['beaker', 'alkali', 'phenolphthalein', 'acid', 'dropper'];

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

export function PhenolphthaleinCycleLabPlayer({ experiment, onTelemetry }: PhenolphthaleinCycleLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [pinkShown, setPinkShown] = useState(false);
  const [acidAdded, setAcidAdded] = useState(false);
  const [faded, setFaded] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过酚酞在碱中显红、滴酸后褪色观察可逆变色。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const colorValue = clamp(24 + (pinkShown ? 24 : 0) + (faded ? 18 : 0), 20, 99);
  const contrastValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 30 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (pinkShown ? 10 : 0) + (acidAdded ? 10 : 0) + (faded ? 14 : 0), 20, 100);

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
        setCameraPreset('beaker');
        advanceStep(2, '器材识别完成，下一步向碱液中滴加酚酞。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleShowPink = (choice: 'correct' | 'acidfirst') => {
    if (step !== 2 || completed) return;
    if (choice === 'acidfirst') {
      markError('应先在碱液中滴加酚酞，先建立明显粉红色，再进行后续褪色比较。');
      return;
    }
    setPinkShown(true);
    appendNote('显色记录：酚酞加入碱液后迅速出现粉红色。');
    advanceStep(3, '粉红色已出现，下一步确认显色结果。');
  };

  const handleObservePink = (choice: 'correct' | 'blue' | 'colorless') => {
    if (step !== 3 || completed) return;
    if (!pinkShown) {
      markError('请先向碱液中滴加酚酞，再记录显色结果。');
      return;
    }
    setObservationChoice(choice);
    if (choice === 'correct') {
      appendNote('观察记录：酚酞在碱性条件下呈明显粉红色。');
      setCameraPreset('titration');
      advanceStep(4, '碱性显色已记录，下一步滴加稀酸让颜色褪去。');
      return;
    }
    markError(choice === 'blue' ? '酚酞不会显蓝色，典型现象是碱中显粉红。' : '在碱液中加酚酞不会保持无色，应出现明显粉红色。');
  };

  const handleFade = (choice: 'correct' | 'deeper') => {
    if (step !== 4 || completed) return;
    if (!pinkShown) {
      markError('请先观察到粉红色，再进行酸化褪色。');
      return;
    }
    setAcidAdded(true);
    if (choice === 'deeper') {
      markError('滴加稀酸后不会更红，正确现象是颜色逐渐褪去。');
      return;
    }
    setFaded(true);
    appendNote('滴酸记录：粉红色逐渐减弱并褪去，溶液重新接近无色。');
    advanceStep(5, '显红与褪色的完整过程已建立，请完成总结。');
  };

  const handleSummary = (choice: 'correct' | 'always-red' | 'reverse') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：酚酞在碱性环境下显粉红，酸化后颜色可再次褪去。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'always-red' ? '酚酞不会始终保持红色，酸化后会明显褪色。' : '酸碱环境与显色关系不能说反。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPinkShown(false);
    setAcidAdded(false);
    setFaded(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察酚酞显红与褪色。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先让酚酞在碱液中显出明显粉红色。', '再逐步滴酸比较颜色由深到浅的变化。', '重点记住“碱中显红、酸化褪色”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对加液顺序。',
        '建议按“识别 → 显红 → 观察 → 滴酸褪色 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel phenolphthaleincycle-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把粉红显色、滴酸褪色和液体透明度变化做成更有操作反馈的可逆变色场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid phenolphthaleincycle-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'beaker' ? '烧杯近景' : '滴加近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>色彩强度 {colorValue}</span><div className="chem-meter-bar"><i style={{ width: `${colorValue}%` }} /></div></div><div className="chem-meter"><span>对比清晰度 {contrastValue}</span><div className="chem-meter-bar"><i style={{ width: `${contrastValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card phenolphthaleincycle-data-card"><span className="eyebrow">Readout</span><h3>显色读数板</h3><div className="generic-readout-grid phenolphthaleincycle-readout-grid"><article className={pinkShown ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>粉红显色</span><strong>{pinkShown ? '已出现' : '--'}</strong><small>{pinkShown ? '碱液中已出现明显粉红色。' : '先滴加酚酞显色。'}</small></article><article className={faded ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>酸化褪色</span><strong>{faded ? '已完成' : '--'}</strong><small>{faded ? '滴酸后颜色已明显减弱。' : '等待滴酸褪色。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '显红后可褪色' : '等待总结'}</strong><small>酚酞对酸碱环境具有明显而直观的可逆显色特征。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '酚酞变色装置'} · 当前重点：{step <= 2 ? '先建立粉红显色' : step === 3 ? '确认显色结果' : '滴酸褪色'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'beaker' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('beaker')} type="button">烧杯</button><button className={cameraPreset === 'titration' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('titration')} type="button">滴加</button></div></div><div className={`scene-canvas phenolphthaleincycle-stage preset-${cameraPreset} ${pinkShown ? 'pink-shown' : ''} ${acidAdded ? 'acid-added' : ''} ${faded ? 'faded' : ''}`}>
            <div className="phenolphthaleincycle-rig">
              <div className="ppc-bench-shadow" />
              <div className={pinkShown ? 'ppc-beaker active' : 'ppc-beaker'}>
                <div className="ppc-beaker-rim" />
                <div className={faded ? 'ppc-liquid active faded' : pinkShown ? 'ppc-liquid active pink' : 'ppc-liquid active clear'}>
                  <span className="ppc-liquid-surface" />
                  <span className={pinkShown ? 'ppc-phen-plume active' : 'ppc-phen-plume'} />
                  <span className={acidAdded ? 'ppc-acid-plume active' : 'ppc-acid-plume'} />
                  <span className={faded ? 'ppc-neutral-front active' : 'ppc-neutral-front'} />
                </div>
                <div className={pinkShown ? 'ppc-swirl active' : 'ppc-swirl'} />
              </div>
              <div className={pinkShown ? 'ppc-dropper phen active' : 'ppc-dropper phen'}>
                <span className="ppc-dropper-glass" />
                <span className={pinkShown && !acidAdded ? 'ppc-drop phen active' : 'ppc-drop phen'} />
              </div>
              <div className={acidAdded ? 'ppc-dropper acid active' : 'ppc-dropper acid'}>
                <span className="ppc-dropper-glass" />
                <span className={acidAdded && !faded ? 'ppc-drop acid active' : 'ppc-drop acid'} />
              </div>
              <div className={pinkShown ? 'ppc-palette active' : 'ppc-palette'}>
                <span className={faded ? 'ppc-palette-sheen faded active' : pinkShown ? 'ppc-palette-sheen active' : 'ppc-palette-sheen'} />
              </div>
            </div>
          </div>

          <div className="observation-ribbon phenolphthaleincycle-observation-row"><article className={pinkShown ? 'observation-chip active' : 'observation-chip calm'}><strong>显红</strong><span>{pinkShown ? '碱液已显粉红色。' : '等待酚酞显色。'}</span></article><article className={acidAdded ? 'observation-chip active' : 'observation-chip calm'}><strong>滴酸</strong><span>{acidAdded ? '已开始滴加稀酸。' : '等待滴酸。'}</span></article><article className={faded ? 'observation-chip active' : 'observation-chip calm'}><strong>褪色</strong><span>{faded ? '颜色已明显减弱并趋于无色。' : '等待完成褪色观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleShowPink('correct')} type="button"><strong>向碱液中滴加酚酞，建立粉红色</strong><span>先形成明显显色，再进行后续褪色对比。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleShowPink('acidfirst')} type="button"><strong>先往烧杯里滴酸再想让它显红</strong><span>错误演示：顺序不合理。</span></button></> : null}{step === 3 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObservePink('correct')} type="button"><strong>记录“酚酞在碱性条件下呈明显粉红色”</strong><span>这是本实验的正确显色结果。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObservePink('blue')} type="button"><strong>记录“酚酞会显蓝色”</strong><span>错误演示：颜色判断错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObservePink('colorless')} type="button"><strong>记录“碱液中加酚酞后依旧完全无色”</strong><span>错误演示：忽略显色现象。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFade('correct')} type="button"><strong>继续滴加稀酸，观察粉红色逐渐褪去</strong><span>完成可逆变色过程。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFade('deeper')} type="button"><strong>继续滴酸后记录颜色会更深更红</strong><span>错误演示：与真实现象相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>酚酞在碱性环境下显粉红，酸化后颜色可再次褪去</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('always-red')} type="button"><strong>酚酞一旦变红就永远不会再褪色</strong><span>错误演示：忽略可逆变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('reverse')} type="button"><strong>酚酞在酸中显红，在碱中无色</strong><span>错误演示：酸碱显色关系说反。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{pinkShown ? '粉红已显色' : '粉红待显色'} / {faded ? '颜色已褪去' : '颜色待褪去'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先显红，再滴酸褪色'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“酚酞显红再褪色”升级成更适合课堂操作演示的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
