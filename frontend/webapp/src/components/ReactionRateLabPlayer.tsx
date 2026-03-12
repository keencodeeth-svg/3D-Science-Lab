import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'reaction' | 'timer';
type MaterialId = 'test-tube-a' | 'test-tube-b' | 'reagent-set' | 'thermometer' | 'timer';
type TimelineState = 'done' | 'current' | 'todo';

interface ReactionRateLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别材料',
  2: '建立对照组',
  3: '改变变量',
  4: '记录反应快慢',
  5: '总结影响因素',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别试管、试剂组、温度计和计时器。',
  2: '先建立仅有一个变量差异的两组条件。',
  3: '本次只改变一个变量，比较反应快慢。',
  4: '根据气泡出现快慢和计时结果记录反应速率差异。',
  5: '把变量控制和反应速率变化关系总结出来。',
};

const materialLabels: Record<MaterialId, string> = {
  'test-tube-a': '试管 A',
  'test-tube-b': '试管 B',
  'reagent-set': '试剂组',
  thermometer: '温度计',
  timer: '计时器',
};

const materialOrder: MaterialId[] = ['test-tube-a', 'test-tube-b', 'reagent-set', 'thermometer', 'timer'];

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

export function ReactionRateLabPlayer({ experiment, onTelemetry }: ReactionRateLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [controlReady, setControlReady] = useState(false);
  const [variableSet, setVariableSet] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先建立对照组，再只改变一个变量比较反应快慢。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const fastTime = variableSet ? 12 : 18;
  const slowTime = variableSet ? 26 : 18;
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const controlValue = clamp(42 + (controlReady ? 20 : 0) + (variableSet ? 20 : 0), 22, 99);
  const clarityValue = clamp(46 + (variableSet ? 18 : 0), 34, 99);
  const readinessValue = clamp(progressPercent + (controlReady ? 16 : 0) + (variableSet ? 18 : 0), 22, 100);

  const { reportReset } = useLabTelemetryReporter({
    experiment,
    step,
    totalSteps: 5,
    score,
    errors,
    prompt,
    completed,
    stepLabels: stepTitles,
    onTelemetry,
  });

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
        setCameraPreset('reaction');
        advanceStep(2, '材料识别完成，下一步先建立只有一个变量差异的对照组。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个材料，请继续。`);
      }
      return next;
    });
  };

  const handleControl = (choice: 'correct' | 'double') => {
    if (step !== 2 || completed) return;
    if (choice === 'double') {
      markError('一次不能改变多个条件，对照组必须只有一个变量差异。');
      return;
    }
    setControlReady(true);
    appendNote('对照设置：两组试剂基础条件一致，仅保留一个待改变变量。');
    advanceStep(3, '对照组已建立，下一步只改变一个变量比较反应快慢。');
  };

  const handleVariable = (choice: 'temperature' | 'both') => {
    if (step !== 3 || completed) return;
    if (!controlReady) {
      markError('请先建立对照组，再改变变量。');
      return;
    }
    if (choice === 'both') {
      markError('本实验一次只改变一个变量，不能同时改变温度和浓度。');
      return;
    }
    setVariableSet(true);
    setCameraPreset('timer');
    appendNote('变量控制：仅提高了试管 B 的温度，其他条件保持一致。');
    advanceStep(4, '变量已设置完成，下一步根据反应快慢和计时结果完成记录。');
  };

  const handleRecord = (choice: 'correct' | 'same' | 'reverse') => {
    if (step !== 4 || completed) return;
    if (!variableSet) {
      markError('请先改变一个变量，再比较反应快慢。');
      return;
    }
    if (choice === 'correct') {
      appendNote('结果记录：较高温度条件下反应更快，所需时间更短。');
      advanceStep(5, '记录完成，下一步总结变量控制和反应速率关系。');
      return;
    }
    if (choice === 'same') {
      markError('两组反应快慢并不相同，变量变化后会出现明显差异。');
      return;
    }
    markError('结果不能记反，温度较高的条件下反应更快。');
  };

  const handleSummary = (choice: 'correct' | 'multi' | 'random') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：通过控制变量可以比较反应速率，高温条件会使该反应更快。');
      return;
    }
    if (choice === 'multi') {
      markError('一次改变多个变量会让结论不可靠，必须坚持控制变量。');
      return;
    }
    markError('反应快慢不是随机判断，而是要结合变量和现象做分析。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setControlReady(false);
    setVariableSet(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先建立对照组，再只改变一个变量比较反应快慢。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先建立对照组，再去改变变量。',
        '一次只能改变一个变量，才能判断影响因素。',
        '要把气泡快慢、计时数据和变量变化一起记录。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对变量控制。',
        '建议重新回到对照设置，再只改变一个变量进行比较。',
      ];

  return (
    <section className="panel playground-panel rate-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属高中化学实验页</h2>
          <p>把“建立对照—只改一个变量—记录速率差异”压成一条清晰链路，让变量控制思维真正落到实验里。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid rate-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'reaction' ? '反应视角' : '计时视角'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>控制度 {controlValue}</span><div className="chem-meter-bar"><i style={{ width: `${controlValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card rate-data-card"><span className="eyebrow">Readout</span><h3>速率结果板</h3><div className="rate-data-grid"><div className="rate-data-item"><span>试管 A</span><strong>{variableSet ? `${slowTime}s` : '待比较'}</strong><small>标准条件下反应较慢。</small></div><div className="rate-data-item"><span>试管 B</span><strong>{variableSet ? `${fastTime}s` : '待比较'}</strong><small>较高温度条件下反应更快。</small></div></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '速率对照装置'} · 当前重点：{step === 2 ? '建立对照' : step === 3 ? '只改一个变量' : step === 4 ? '快慢比较' : '变量关系总结'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'reaction' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('reaction')} type="button">反应</button><button className={cameraPreset === 'timer' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('timer')} type="button">计时</button></div></div>

          <div className={`scene-canvas rate-stage preset-${cameraPreset}`}>
            <div className="rate-stage-head"><div><span className="eyebrow">Live Chemistry</span><h3>{experiment.curriculum.theme}</h3><p>{promptTone === 'error' ? '当前变量控制或记录判断有偏差，请先回到对照条件重新核对。' : '把“控制变量”变成看得见的实验流程，让学生能真正比较同一反应在不同条件下的快慢差异。'}</p></div><div className="status-pill-row"><span className="status-pill ready">进度 {progressPercent}%</span><span className="status-pill">变量 {variableSet ? '已设置' : '待设置'}</span></div></div>
            <div className="rate-stage-grid">
              <article className={controlReady ? 'rate-card active' : 'rate-card'}><div className="reaction-card-head"><strong>双试管对照区</strong><small>{controlReady ? '对照已建立' : '等待建立'}</small></div><div className="rate-tube-row"><div className="rate-tube tube-a"><div className={variableSet ? 'rate-bubbles slow active' : 'rate-bubbles slow'} /></div><div className="rate-tube tube-b warm"><div className={variableSet ? 'rate-bubbles fast active' : 'rate-bubbles fast'} /></div></div></article>
              <article className={variableSet ? 'rate-card active' : 'rate-card'}><div className="reaction-card-head"><strong>计时与温度区</strong><small>{variableSet ? '差异已形成' : '等待变量设置'}</small></div><div className="rate-meter-panel"><div className="thermo-column"><i style={{ height: `${variableSet ? 78 : 58}%` }} /></div><div className="time-chip-row"><span className="time-chip">A：{variableSet ? `${slowTime}s` : '--'}</span><span className="time-chip warm">B：{variableSet ? `${fastTime}s` : '--'}</span></div></div></article>
            </div>
            <div className="rate-insight-row"><article className="lab-readout-card active"><span>对照设置</span><strong>{controlReady ? '仅保留一个待变变量' : '待建立'}</strong><small>对照组要保证只有一个变量差异。</small></article><article className="lab-readout-card calm"><span>变量控制</span><strong>{variableSet ? '仅提高 B 组温度' : '待设置'}</strong><small>一次只改变一个变量，结论才可靠。</small></article><article className={variableSet ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>核心现象</span><strong>{variableSet ? 'B 组反应更快' : '先完成变量设置'}</strong><small>较高温度条件下，本实验反应速率更快。</small></article></div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别材料'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleControl('correct')} type="button"><strong>建立只差一个变量的两组条件</strong><span>完成标准对照设置。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleControl('double')} type="button"><strong>同时改变多个条件</strong><span>错误演示：无法判断真正影响因素。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleVariable('temperature')} type="button"><strong>只提高 B 组温度</strong><span>保持其他条件一致进行比较。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleVariable('both')} type="button"><strong>同时改温度和浓度</strong><span>错误演示：破坏控制变量。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button"><strong>记录“B 组更快，所需时间更短”</strong><span>这是本实验的正确速率判断。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleRecord('same')} type="button"><strong>记录“两组一样快”</strong><span>错误演示：忽略数据差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRecord('reverse')} type="button"><strong>记录“A 组更快”</strong><span>错误演示：把快慢关系记反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>通过控制变量比较反应速率，本实验中较高温度使反应更快</strong><span>同时概括方法和结果。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('multi')} type="button"><strong>一次改变多个变量更容易看出结果</strong><span>错误演示：结论不可靠。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('random')} type="button"><strong>反应快慢主要靠感觉判断</strong><span>错误演示：没有基于实验数据。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>对照状态：{controlReady ? '已建立' : '待建立'} / 变量状态：{variableSet ? '已设置' : '待设置'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意控制变量'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“化学反应速率影响因素”升级成对照设置、变量控制和速率记录一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
