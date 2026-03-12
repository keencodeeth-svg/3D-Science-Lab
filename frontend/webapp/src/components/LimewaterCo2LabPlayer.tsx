import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beaker' | 'bubbles';
type MaterialId = 'beaker' | 'limewater' | 'co2flask' | 'tube' | 'stopper';
type TimelineState = 'done' | 'current' | 'todo';

interface LimewaterCo2LabPlayerProps {
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
  2: '通入二氧化碳',
  3: '观察先变浑浊',
  4: '继续通入后变澄清',
  5: '总结现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别澄清石灰水烧杯、二氧化碳发生装置、导气管和橡胶塞。',
  2: '将导气管伸入石灰水中，开始稳定通入二氧化碳。',
  3: '观察澄清石灰水是否先出现乳白色浑浊。',
  4: '继续通入过量二氧化碳，观察浑浊是否再次变清。',
  5: '总结石灰水遇二氧化碳先浑浊、过量后又变澄清的现象。',
};

const materialLabels: Record<MaterialId, string> = {
  beaker: '石灰水烧杯',
  limewater: '澄清石灰水',
  co2flask: '二氧化碳发生装置',
  tube: '导气管',
  stopper: '橡胶塞',
};

const materialOrder: MaterialId[] = ['beaker', 'limewater', 'co2flask', 'tube', 'stopper'];

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

export function LimewaterCo2LabPlayer({ experiment, onTelemetry }: LimewaterCo2LabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [co2Started, setCo2Started] = useState(false);
  const [cloudyObserved, setCloudyObserved] = useState(false);
  const [clearAgain, setClearAgain] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过持续通入二氧化碳观察石灰水先浑浊后又变清。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const bubbleValue = clamp(24 + (co2Started ? 22 : 0) + (clearAgain ? 20 : 0), 20, 99);
  const compareValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 30 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (co2Started ? 10 : 0) + (cloudyObserved ? 10 : 0) + (clearAgain ? 14 : 0), 20, 100);

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
        advanceStep(2, '器材识别完成，下一步开始向石灰水通入二氧化碳。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleStartCo2 = (choice: 'correct' | 'surface') => {
    if (step !== 2 || completed) return;
    if (choice === 'surface') {
      markError('导气管应深入液面以下，让气泡稳定通过石灰水。');
      return;
    }
    setCo2Started(true);
    setCameraPreset('bubbles');
    appendNote('通气状态：二氧化碳已连续通过石灰水，液内出现稳定气泡。');
    advanceStep(3, '已开始通气，下一步观察石灰水是否先变浑浊。');
  };

  const handleObserveCloudy = (choice: 'correct' | 'blue' | 'no-change') => {
    if (step !== 3 || completed) return;
    if (!co2Started) {
      markError('请先稳定通入二氧化碳，再记录前期现象。');
      return;
    }
    setObservationChoice(choice);
    if (choice === 'correct') {
      setCloudyObserved(true);
      appendNote('观察记录：石灰水先变成乳白色浑浊。');
      advanceStep(4, '前期浑浊现象已记录，下一步继续通入过量二氧化碳。');
      return;
    }
    markError(choice === 'blue' ? '石灰水不会变成蓝色，正确现象是先变乳白浑浊。' : '刚开始通入二氧化碳后会有明显浑浊，不是完全无变化。');
  };

  const handleObserveClearAgain = (choice: 'correct' | 'always-cloudy') => {
    if (step !== 4 || completed) return;
    if (!cloudyObserved) {
      markError('请先确认石灰水已出现浑浊，再继续比较后续变化。');
      return;
    }
    if (choice === 'always-cloudy') {
      markError('过量通入二氧化碳后，浑浊会再次减弱并趋于澄清。');
      return;
    }
    setClearAgain(true);
    appendNote('连续通气记录：过量二氧化碳进入后，浑浊逐渐减弱并再次变清。');
    advanceStep(5, '先浑浊后变清的完整过程已出现，请完成总结。');
  };

  const handleSummary = (choice: 'correct' | 'only-cloudy' | 'reverse') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：石灰水遇二氧化碳先变浑浊，继续通入过量后又可变澄清。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'only-cloudy' ? '该实验不只停留在浑浊阶段，过量二氧化碳后还会再次变清。' : '过程顺序不能说反，正确是先浑浊后变清。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setCo2Started(false);
    setCloudyObserved(false);
    setClearAgain(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察石灰水与二氧化碳反应。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先让导气管伸入液面以下稳定通气。', '重点记住“先乳白浑浊，再重新变清”。', '观察时同时关注气泡和液体清浊变化。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对导气和观察顺序。',
        '建议按“识别 → 通气 → 看浑浊 → 继续通气 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel limewaterco2-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把连续气泡、乳白浑浊和过量二氧化碳后再澄清做成更适合课堂演示的动态场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid limewaterco2-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'beaker' ? '烧杯近景' : '气泡近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>通气活跃 {bubbleValue}</span><div className="chem-meter-bar"><i style={{ width: `${bubbleValue}%` }} /></div></div><div className="chem-meter"><span>观察清晰度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card limewaterco2-data-card"><span className="eyebrow">Readout</span><h3>通气读数板</h3><div className="generic-readout-grid limewaterco2-readout-grid"><article className={co2Started ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>通气状态</span><strong>{co2Started ? '已稳定' : '--'}</strong><small>{co2Started ? '二氧化碳已连续通过石灰水。' : '先建立稳定通气。'}</small></article><article className={clearAgain ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>液体变化</span><strong>{clearAgain ? '浑浊后变清' : '--'}</strong><small>{clearAgain ? '完整现象链已出现。' : '等待继续通入过量二氧化碳。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '先浑浊后变清' : '等待总结'}</strong><small>石灰水与二氧化碳的变化具有明显阶段性。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '石灰水通气装置'} · 当前重点：{step <= 2 ? '建立稳定通气' : step === 3 ? '看乳白浑浊' : '继续通气后变清'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'beaker' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('beaker')} type="button">烧杯</button><button className={cameraPreset === 'bubbles' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bubbles')} type="button">气泡</button></div></div><div className={`scene-canvas limewaterco2-stage preset-${cameraPreset} ${co2Started ? 'co2-started' : ''} ${cloudyObserved ? 'cloudy-observed' : ''} ${clearAgain ? 'clear-again' : ''}`}><div className="limewaterco2-rig"><div className={co2Started ? 'lwc-beaker active' : 'lwc-beaker'}><div className={clearAgain ? 'lwc-liquid active clearagain' : cloudyObserved ? 'lwc-liquid active cloudy' : 'lwc-liquid active'} /><div className={co2Started ? 'lwc-bubbles active' : 'lwc-bubbles'} /></div><div className={co2Started ? 'lwc-tube active' : 'lwc-tube'} /><div className={co2Started ? 'lwc-flask active' : 'lwc-flask'} /></div></div><div className="observation-ribbon limewaterco2-observation-row"><article className={co2Started ? 'observation-chip active' : 'observation-chip calm'}><strong>通气</strong><span>{co2Started ? '二氧化碳已稳定通入。' : '等待稳定通气。'}</span></article><article className={cloudyObserved ? 'observation-chip active' : 'observation-chip calm'}><strong>浑浊</strong><span>{cloudyObserved ? '已观察到乳白浑浊。' : '等待前期浑浊现象。'}</span></article><article className={clearAgain ? 'observation-chip active' : 'observation-chip calm'}><strong>再澄清</strong><span>{clearAgain ? '已观察到再次变清。' : '等待继续通气后的变化。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleStartCo2('correct')} type="button"><strong>把导气管伸入石灰水中，开始稳定通入二氧化碳</strong><span>建立后续清浊变化的基础。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleStartCo2('surface')} type="button"><strong>让导气管只停留在液面上方随意漏气</strong><span>错误演示：现象不稳定。</span></button></> : null}{step === 3 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserveCloudy('correct')} type="button"><strong>记录“石灰水先变成乳白色浑浊”</strong><span>这是前期最典型的现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserveCloudy('blue')} type="button"><strong>记录“石灰水会慢慢变蓝”</strong><span>错误演示：颜色判断错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserveCloudy('no-change')} type="button"><strong>记录“前期完全没有任何变化”</strong><span>错误演示：忽略浑浊现象。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleObserveClearAgain('correct')} type="button"><strong>继续通入过量二氧化碳，记录“浑浊逐渐减弱并再次变清”</strong><span>完成完整的两阶段现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserveClearAgain('always-cloudy')} type="button"><strong>记录“只要一直通气就会永远越来越浑浊”</strong><span>错误演示：忽略后期变化。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>石灰水遇二氧化碳先变浑浊，继续通入过量后又可变澄清</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('only-cloudy')} type="button"><strong>石灰水只会越来越浑浊，不会再变清</strong><span>错误演示：忽略后段过程。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('reverse')} type="button"><strong>石灰水会先变清后变浑浊</strong><span>错误演示：顺序说反。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{co2Started ? '已稳定通气' : '待通气'} / {clearAgain ? '完整现象已现' : '完整现象待现'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意导气管应深入液面以下'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“石灰水与二氧化碳”升级成可连续观察两阶段变化的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
