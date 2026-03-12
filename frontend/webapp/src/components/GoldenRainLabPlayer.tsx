import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tube' | 'crystal';
type MaterialId = 'tube' | 'lead' | 'iodide' | 'bath' | 'rack';
type TimelineState = 'done' | 'current' | 'todo';

interface GoldenRainLabPlayerProps {
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
  2: '混合形成黄沉淀',
  3: '加热使其澄清',
  4: '冷却析出金晶',
  5: '总结金色雨现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别试管、硝酸铅溶液、碘化钾溶液、热水浴和试管架。',
  2: '把两种溶液混合，观察是否出现亮黄色沉淀。',
  3: '将试管放入热水浴中，观察黄色沉淀是否逐渐消失。',
  4: '取出冷却，观察片状金黄色晶体重新析出。',
  5: '总结“先黄沉淀，再澄清，后析出金色晶体”的变化。',
};

const materialLabels: Record<MaterialId, string> = {
  tube: '试管',
  lead: '硝酸铅溶液',
  iodide: '碘化钾溶液',
  bath: '热水浴',
  rack: '试管架',
};

const materialOrder: MaterialId[] = ['tube', 'lead', 'iodide', 'bath', 'rack'];

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

export function GoldenRainLabPlayer({ experiment, onTelemetry }: GoldenRainLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [precipitated, setPrecipitated] = useState(false);
  const [heatedClear, setHeatedClear] = useState(false);
  const [crystallized, setCrystallized] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过加热与冷却观察碘化铅由黄色沉淀到“金色雨”晶体的变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const crystalValue = clamp(24 + (precipitated ? 22 : 0) + (heatedClear ? 14 : 0) + (crystallized ? 26 : 0), 20, 99);
  const clarityValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 30 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (precipitated ? 10 : 0) + (heatedClear ? 10 : 0) + (crystallized ? 14 : 0), 20, 100);

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
        advanceStep(2, '器材识别完成，下一步混合两种溶液形成黄色沉淀。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleMix = (choice: 'correct' | 'water') => {
    if (step !== 2 || completed) return;
    if (choice === 'water') {
      markError('需要混合硝酸铅和碘化钾，才能形成亮黄色沉淀。');
      return;
    }
    setPrecipitated(true);
    appendNote('混合记录：试管中迅速出现亮黄色沉淀。');
    advanceStep(3, '黄色沉淀已形成，下一步放入热水浴。');
  };

  const handleHeat = (choice: 'correct' | 'skip') => {
    if (step !== 3 || completed) return;
    if (!precipitated) {
      markError('请先形成黄色沉淀，再进行加热。');
      return;
    }
    if (choice === 'skip') {
      markError('要先通过加热让沉淀溶解，后续冷却才能更好看到“金色雨”晶体。');
      return;
    }
    setHeatedClear(true);
    setCameraPreset('crystal');
    appendNote('加热状态：黄色沉淀逐渐溶解，试管重新变得较澄清。');
    advanceStep(4, '溶液已加热澄清，下一步冷却观察金色晶体。');
  };

  const handleCool = (choice: 'correct' | 'stay-clear' | 'white') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!heatedClear) {
      markError('请先完成加热澄清，再冷却观察晶体析出。');
      return;
    }
    if (choice === 'correct') {
      setCrystallized(true);
      appendNote('观察记录：冷却后片状金黄色晶体从溶液中缓慢析出，形成“金色雨”。');
      advanceStep(5, '金色雨现象已记录，请完成总结。');
      return;
    }
    markError(choice === 'stay-clear' ? '冷却后不会始终保持完全澄清，典型现象是重新析出金黄色晶体。' : '析出的不是白色晶体，而是更具辨识度的金黄色晶体。');
  };

  const handleSummary = (choice: 'correct' | 'only-once' | 'no-crystal') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：碘化铅可先形成黄色沉淀，加热溶解后冷却又析出金黄色晶体。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'only-once' ? '这一实验并非只出现一次黄色变化，而是“沉淀—溶解—再结晶”的连续过程。' : '冷却后会重新析出明显晶体，不能忽略。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPrecipitated(false);
    setHeatedClear(false);
    setCrystallized(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察“金色雨”现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先形成亮黄色沉淀，再放入热水浴。', '观察顺序是“黄沉淀 → 澄清 → 金晶析出”。', '重点记录冷却后片状金黄色晶体。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对加热与冷却顺序。',
        '建议按“识别 → 混合 → 加热 → 冷却观察 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel goldenrain-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把亮黄色沉淀、热水浴澄清和冷却后金晶下落做成更具表演感的“金色雨”场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid goldenrain-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tube' ? '试管近景' : '晶体近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>晶体变化 {crystalValue}</span><div className="chem-meter-bar"><i style={{ width: `${crystalValue}%` }} /></div></div><div className="chem-meter"><span>观察清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card goldenrain-data-card"><span className="eyebrow">Readout</span><h3>金色雨读数板</h3><div className="generic-readout-grid goldenrain-readout-grid"><article className={precipitated ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>黄色沉淀</span><strong>{precipitated ? '已形成' : '--'}</strong><small>{precipitated ? '混合后已出现亮黄色沉淀。' : '先混合两种溶液。'}</small></article><article className={crystallized ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>金色晶体</span><strong>{crystallized ? '已析出' : '--'}</strong><small>{crystallized ? '冷却后已出现片状金黄色晶体。' : '等待冷却析晶。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '沉淀可再结晶' : '等待总结'}</strong><small>该实验最有辨识度的结果是冷却后重新析出金色晶体。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '金色雨装置'} · 当前重点：{step <= 2 ? '建立黄色沉淀' : step === 3 ? '加热澄清' : '冷却观察金晶'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'tube' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tube')} type="button">试管</button><button className={cameraPreset === 'crystal' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('crystal')} type="button">金晶</button></div></div><div className={`scene-canvas goldenrain-stage preset-${cameraPreset} ${precipitated ? 'precipitated' : ''} ${heatedClear ? 'heated-clear' : ''} ${crystallized ? 'crystallized' : ''}`}>
            <div className="goldenrain-rig">
              <div className="gdr-bench-shadow" />
              <div className="gdr-bench-caustic" />
              <div className={heatedClear ? 'gdr-bath active' : 'gdr-bath'}>
                <span className="gdr-bath-rim" />
                <span className="gdr-bath-meniscus" />
                <span className="gdr-bath-water" />
                <span className="gdr-bath-caustic" />
                <span className={heatedClear ? 'gdr-bath-steam active' : 'gdr-bath-steam'} />
              </div>
              <div className={precipitated ? 'gdr-tube active' : 'gdr-tube'}>
                <div className="gdr-tube-rim" />
                <div className="gdr-tube-mouth" />
                <div className="gdr-tube-inner" />
                <div className="gdr-tube-gloss" />
                <div className={precipitated ? 'gdr-liquid-meniscus active' : 'gdr-liquid-meniscus'} />
                <div className={heatedClear ? 'gdr-heat-front active' : 'gdr-heat-front'} />
                <div className={heatedClear ? 'gdr-liquid active clear' : precipitated ? 'gdr-liquid active yellow' : 'gdr-liquid'}>
                  <span className="gdr-liquid-surface" />
                  <span className={heatedClear ? 'gdr-thermal-shimmer active' : 'gdr-thermal-shimmer'} />
                </div>
                <div className={precipitated && !heatedClear ? 'gdr-precipitate active' : 'gdr-precipitate'}>
                  <span className={precipitated && !heatedClear ? 'gdr-precipitate-grains active' : 'gdr-precipitate-grains'} />
                  <span className={precipitated && !heatedClear ? 'gdr-nucleation-cloud active' : 'gdr-nucleation-cloud'} />
                </div>
                <div className={crystallized ? 'gdr-crystals active' : 'gdr-crystals'}>
                  <span className={crystallized ? 'gdr-crystal-front active' : 'gdr-crystal-front'} />
                  <span className={crystallized ? 'gdr-crystal-spark active' : 'gdr-crystal-spark'} />
                  <span className={crystallized ? 'gdr-crystal-flakes active' : 'gdr-crystal-flakes'} />
                </div>
              </div>
              <div className={precipitated ? 'gdr-bottle left active' : 'gdr-bottle left'}>
                <span className="gdr-bottle-rim" />
                <span className="gdr-bottle-glass" />
                <span className="gdr-bottle-cap" />
                <span className="gdr-bottle-fill left" />
              </div>
              <div className={precipitated ? 'gdr-bottle right active' : 'gdr-bottle right'}>
                <span className="gdr-bottle-rim" />
                <span className="gdr-bottle-glass" />
                <span className="gdr-bottle-cap" />
                <span className="gdr-bottle-fill right" />
              </div>
            </div>
          </div>

          <div className="observation-ribbon goldenrain-observation-row"><article className={precipitated ? 'observation-chip active' : 'observation-chip calm'}><strong>沉淀</strong><span>{precipitated ? '亮黄色沉淀已形成。' : '等待混合形成沉淀。'}</span></article><article className={heatedClear ? 'observation-chip active' : 'observation-chip calm'}><strong>加热</strong><span>{heatedClear ? '加热后溶液已变得较澄清。' : '等待热水浴处理。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>金晶</strong><span>{observationChoice === 'correct' ? '已记录金色晶体析出。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleMix('correct')} type="button"><strong>混合硝酸铅和碘化钾，形成亮黄色沉淀</strong><span>建立“金色雨”前的起始状态。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleMix('water')} type="button"><strong>改用清水混合后直接观察</strong><span>错误演示：不会产生目标沉淀。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleHeat('correct')} type="button"><strong>把试管放入热水浴中，让黄沉淀逐渐溶解</strong><span>为后续再结晶做准备。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleHeat('skip')} type="button"><strong>跳过加热直接等待金晶出现</strong><span>错误演示：会错过关键过程。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleCool('correct')} type="button"><strong>冷却后记录“片状金黄色晶体重新析出”</strong><span>这是本实验最典型的现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleCool('stay-clear')} type="button"><strong>记录“冷却后依然始终保持澄清”</strong><span>错误演示：忽略析晶。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCool('white')} type="button"><strong>记录“析出的是白色粉末晶体”</strong><span>错误演示：颜色判断错误。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>碘化铅可先形成黄色沉淀，加热溶解后冷却又析出金黄色晶体</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('only-once')} type="button"><strong>实验只会出现一次黄色变化，不存在再结晶</strong><span>错误演示：忽略完整过程。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-crystal')} type="button"><strong>冷却后不会再产生任何晶体</strong><span>错误演示：忽略“金色雨”。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{precipitated ? '黄沉淀已形成' : '黄沉淀待形成'} / {crystallized ? '金晶已析出' : '金晶待析出'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先沉淀、再加热、后冷却析晶'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“金色雨”升级成带沉淀、澄清和晶体下落效果的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
