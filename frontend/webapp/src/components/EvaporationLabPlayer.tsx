import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'table' | 'steam' | 'lid';
type MaterialId = 'beaker' | 'hot-water' | 'ice-lid' | 'timer';
type TimelineState = 'done' | 'current' | 'todo';

interface EvaporationLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '认识实验用品',
  2: '观察蒸发',
  3: '观察凝结',
  4: '联系生活',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别烧杯、热水、冷盖板和计时器。',
  2: '观察热水上方的变化，判断蒸发现象。',
  3: '把冷盖板放到烧杯上方，观察是否出现小水珠。',
  4: '把蒸发与凝结和生活中的水循环联系起来。',
};

const materialLabels: Record<MaterialId, string> = {
  beaker: '烧杯',
  'hot-water': '热水',
  'ice-lid': '冷盖板',
  timer: '计时器',
};

const materialOrder: MaterialId[] = ['beaker', 'hot-water', 'ice-lid', 'timer'];

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

export function EvaporationLabPlayer({ experiment, onTelemetry }: EvaporationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [evaporationObserved, setEvaporationObserved] = useState(false);
  const [lidPlaced, setLidPlaced] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('table');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先看热水蒸发，再用冷盖板观察凝结。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const condensationObserved = lidPlaced && evaporationObserved;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 4) * 100);
  const observeValue = clamp(42 + (evaporationObserved ? 22 : 0) + (condensationObserved ? 22 : 0), 22, 99);
  const clarityValue = clamp(48 + (lidPlaced ? 16 : 0) + (condensationObserved ? 14 : 0), 34, 99);
  const readinessValue = clamp(progressPercent + (evaporationObserved ? 16 : 0) + (condensationObserved ? 16 : 0), 22, 100);

  const { reportReset } = useLabTelemetryReporter({
    experiment,
    step,
    totalSteps: 4,
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
      appendNote(`器材识别：${materialLabels[materialId]}`);
      if (next.length === materialOrder.length) {
        setCameraPreset('steam');
        advanceStep(2, '实验用品识别完成，下一步观察热水上方的蒸发现象。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个用品，请继续。`);
      }
      return next;
    });
  };

  const handleEvaporation = (choice: 'steam' | 'bubble') => {
    if (step !== 2 || completed) return;
    if (choice === 'bubble') {
      markError('本步骤要观察热水上方的蒸发现象，不是只盯着水中气泡。');
      return;
    }
    setEvaporationObserved(true);
    setCameraPreset('lid');
    appendNote('现象观察：热水上方出现水蒸气。');
    advanceStep(3, '蒸发现象已观察完成，下一步把冷盖板放到烧杯上方看小水珠。');
  };

  const handleLid = (choice: 'correct' | 'far') => {
    if (step !== 3 || completed) return;
    if (!evaporationObserved) {
      markError('请先观察蒸发现象，再进行凝结观察。');
      return;
    }
    if (choice === 'far') {
      markError('冷盖板要放在烧杯上方合适位置，才能更容易观察到凝结小水珠。');
      return;
    }
    setLidPlaced(true);
    appendNote('凝结观察：冷盖板表面出现小水珠。');
    advanceStep(4, '蒸发和凝结现象都已出现，下一步联系生活场景完成总结。');
  };

  const handleSummary = (choice: 'correct' | 'same' | 'fog-only') => {
    if (step !== 4 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：水受热会蒸发，水蒸气遇到冷表面会凝结，这也是水循环的重要过程。');
      return;
    }
    if (choice === 'same') {
      markError('蒸发和凝结不是同一现象，它们是相反方向的变化过程。');
      return;
    }
    markError('不能只记住白雾或水珠，还要把现象和水循环联系起来。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setEvaporationObserved(false);
    setLidPlaced(false);
    setSummaryChoice('');
    setCameraPreset('table');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先看热水蒸发，再用冷盖板观察凝结。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先观察热水上方，再进行冷盖板实验。',
        '冷盖板要放在烧杯上方合适位置，便于观察小水珠。',
        '总结时把“蒸发—凝结—水循环”串起来。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对蒸发和凝结现象。',
        '建议重新观察热水上方和冷盖板表面，再完成总结。',
      ];

  return (
    <section className="panel playground-panel evaporation-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属小学科学实验页</h2>
          <p>把“热水蒸发 + 冷盖板凝结”整合到同一页，帮助学生把两个现象直接连到水循环。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 4</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid evaporation-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">小学科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'table' ? '实验台总览' : cameraPreset === 'steam' ? '蒸发视角' : '冷盖板视角'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>观察度 {observeValue}</span><div className="chem-meter-bar"><i style={{ width: `${observeValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card evaporation-data-card"><span className="eyebrow">Readout</span><h3>现象结果板</h3><div className="evaporation-data-grid"><div className="evaporation-data-item"><span>蒸发现象</span><strong>{evaporationObserved ? '已观察到水蒸气' : '待观察'}</strong><small>水受热后会不断蒸发。</small></div><div className="evaporation-data-item"><span>凝结现象</span><strong>{condensationObserved ? '冷盖板上出现小水珠' : '待观察'}</strong><small>水蒸气遇冷会凝结成小水珠。</small></div></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '蒸发与凝结装置'} · 当前重点：{step === 2 ? '蒸发现象' : step === 3 ? '凝结小水珠' : step === 4 ? '生活联系' : '器材识别'}</small></div><div className="camera-actions"><button className={cameraPreset === 'table' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('table')} type="button">实验台</button><button className={cameraPreset === 'steam' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('steam')} type="button">蒸发</button><button className={cameraPreset === 'lid' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('lid')} type="button">冷盖板</button></div></div>

          <div className={`scene-canvas evaporation-stage preset-${cameraPreset}`}>
            <div className="evaporation-stage-head"><div><span className="eyebrow">Live Science</span><h3>{experiment.curriculum.theme}</h3><p>{promptTone === 'error' ? '当前观察重点有偏差，请先回到蒸发或凝结现象本身。' : '把蒸发和凝结放到同一块实验舞台里，帮助学生看到水变化的完整过程。'}</p></div><div className="status-pill-row"><span className="status-pill ready">进度 {progressPercent}%</span><span className="status-pill">冷盖板 {lidPlaced ? '已放置' : '未放置'}</span></div></div>
            <div className="evaporation-stage-grid">
              <article className={evaporationObserved ? 'evaporation-card active' : 'evaporation-card'}><div className="reaction-card-head"><strong>热水蒸发区</strong><small>{evaporationObserved ? '蒸发现象已出现' : '等待观察'}</small></div><div className="evaporation-beaker"><div className="evaporation-liquid" /><div className={evaporationObserved ? 'steam-plume active' : 'steam-plume'} /></div></article>
              <article className={condensationObserved ? 'evaporation-card active' : 'evaporation-card'}><div className="reaction-card-head"><strong>冷盖板凝结区</strong><small>{condensationObserved ? '已出现小水珠' : '等待放置盖板'}</small></div><div className="condensation-rig"><div className={lidPlaced ? 'ice-lid-panel active' : 'ice-lid-panel'} /><div className={condensationObserved ? 'droplet-cluster active' : 'droplet-cluster'} /></div></article>
            </div>
            <div className="evaporation-insight-row"><article className="lab-readout-card active"><span>蒸发现象</span><strong>{evaporationObserved ? '热水上方有水蒸气' : '待观察'}</strong><small>水受热后会不断蒸发到空气中。</small></article><article className="lab-readout-card calm"><span>凝结条件</span><strong>{lidPlaced ? '冷表面已准备' : '待放冷盖板'}</strong><small>水蒸气遇到更冷的表面，容易凝结成小水珠。</small></article><article className={condensationObserved ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>生活联系</span><strong>{condensationObserved ? '可联系水循环' : '先完成两种现象观察'}</strong><small>蒸发与凝结都是生活中常见的水变化过程。</small></article></div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别用品'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleEvaporation('steam')} type="button"><strong>观察热水上方的水蒸气</strong><span>正确识别蒸发现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleEvaporation('bubble')} type="button"><strong>只看水里气泡</strong><span>错误演示：没有抓住蒸发重点。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleLid('correct')} type="button"><strong>把冷盖板放到烧杯上方</strong><span>观察盖板表面的凝结小水珠。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleLid('far')} type="button"><strong>把冷盖板放得很远</strong><span>错误演示：不利于观察凝结。</span></button></> : null}{step === 4 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>水受热会蒸发，水蒸气遇冷会凝结成小水珠，这也是水循环的一部分</strong><span>完整联系实验和生活现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('same')} type="button"><strong>蒸发和凝结其实是同一件事</strong><span>错误演示：混淆两个过程。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('fog-only')} type="button"><strong>只要记住白雾就够了</strong><span>错误演示：没有形成完整理解。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>观察状态：蒸发 {evaporationObserved ? '已完成' : '待观察'} / 凝结 {condensationObserved ? '已完成' : '待观察'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意实验现象'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“水的蒸发与凝结”升级成蒸发、凝结和生活联系三位一体的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
