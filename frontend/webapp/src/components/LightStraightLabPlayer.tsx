import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beam' | 'screen';
type MaterialId = 'candle' | 'screen' | 'hole-board' | 'match' | 'target';
type TimelineState = 'done' | 'current' | 'todo';

interface LightStraightLabPlayerProps {
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
  2: '点亮光源',
  3: '调整小孔对齐',
  4: '观察光路',
  5: '总结传播规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别蜡烛、带孔屏、火柴和观察屏。',
  2: '点亮蜡烛，建立稳定光源。',
  3: '调整三块带孔屏，让小孔排成一条直线。',
  4: '观察光线是否能连续穿过小孔并到达观察屏。',
  5: '总结光在同一种均匀介质中沿直线传播。',
};

const materialLabels: Record<MaterialId, string> = {
  candle: '蜡烛',
  screen: '观察屏',
  'hole-board': '带孔屏',
  match: '火柴',
  target: '小孔目标线',
};

const materialOrder: MaterialId[] = ['candle', 'screen', 'hole-board', 'match', 'target'];
const lightstraightStepOrder: StepId[] = [1, 2, 3, 4, 5];

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

export function LightStraightLabPlayer({ experiment, onTelemetry }: LightStraightLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [lit, setLit] = useState(false);
  const [aligned, setAligned] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过三块带孔屏和蜡烛观察光线是否沿直线传播。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const beamValue = clamp(28 + (lit ? 20 : 0) + (aligned ? 24 : 0), 20, 99);
  const pathValue = clamp(22 + (cameraPreset !== 'bench' ? 14 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (lit ? 10 : 0) + (aligned ? 14 : 0), 20, 100);

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
        setCameraPreset('beam');
        advanceStep(2, '器材识别完成，先点亮蜡烛。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleLight = (choice: 'correct' | 'unlit') => {
    if (step !== 2 || completed) return;
    if (choice === 'unlit') {
      markError('请先点亮蜡烛，否则无法形成稳定光线。');
      return;
    }
    setLit(true);
    appendNote('光源状态：蜡烛已点亮，形成稳定火焰。');
    advanceStep(3, '光源已建立，下一步调整三块带孔屏。');
  };

  const handleAlign = (choice: 'correct' | 'offset') => {
    if (step !== 3 || completed) return;
    if (!lit) {
      markError('请先点亮光源，再调整带孔屏。');
      return;
    }
    if (choice === 'offset') {
      markError('若小孔不在同一直线上，光线不能连续通过。');
      return;
    }
    setAligned(true);
    setCameraPreset('screen');
    appendNote('装置调整：三块带孔屏已排成一条直线。');
    advanceStep(4, '小孔已对齐，请观察光路和观察屏亮斑。');
  };

  const handleObserve = (choice: 'correct' | 'curve' | 'ignore') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!lit || !aligned) {
      markError('请先点亮光源并对齐小孔，再观察光路。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：光线能穿过三孔并在观察屏上形成亮点。');
      advanceStep(5, '已完成光路观察，下一步总结传播规律。');
      return;
    }
    markError(choice === 'curve' ? '本实验中光线不是弯曲绕过带孔屏，而是直线穿过对齐的小孔。' : '观察时要注意是否在最终观察屏上出现亮斑。');
  };

  const handleSummary = (choice: 'correct' | 'bend' | 'random') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：光在同一种均匀介质中沿直线传播。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'bend' ? '本实验结论不是“光总会弯曲传播”，而是强调直线传播。' : '光并不是随机传播，带孔对齐后才能看到连续光路。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setLit(false);
    setAligned(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察光沿直线传播。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先点亮蜡烛，再调三块带孔屏。', '观察时重点看最终观察屏是否出现亮点。', '结论关键词是“同一种均匀介质、直线传播”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对光源和小孔是否已对齐。',
        '建议按“识别 → 点光源 → 对齐小孔 → 观察亮点 → 总结”的顺序重做。',
      ];

  const lightPathResult = observationChoice === 'correct'
    ? '亮点成功到达观察屏'
    : observationChoice === 'curve'
      ? '误判为弯曲传播'
      : observationChoice === 'ignore'
        ? '误判为无需看亮点'
        : aligned
          ? '光路已具备，待观察'
          : '待观察';
  const lightstraightWorkbenchStatus = completed
    ? '光路流程已闭环：识别、点光源、对齐小孔、观察和总结全部完成。'
    : step === 1
      ? '先识别蜡烛、观察屏、带孔屏、火柴和目标线。'
      : step === 2
        ? '先点亮稳定光源，再调整装置。'
        : step === 3
          ? '三块带孔屏必须排成一条直线。'
          : step === 4
            ? '重点看光线是否连续穿过小孔并在观察屏上形成亮点。'
            : '总结关键词：同一种均匀介质、沿直线传播。';
  const lightstraightCompletionCopy = completed
    ? '实验已完成，当前版本支持点亮光源、小孔对齐、亮点观察与传播规律总结。'
    : '完成全部 5 个步骤后，这里会输出本次光沿直线传播实验的总结结果。';
  const latestLabNote = labNotes[0] ?? '实验已载入：通过三块带孔屏和蜡烛观察光线是否沿直线传播。';

  return (
    <section className="panel playground-panel lightstraight-lab-panel lightstraight-stage-first-panel lightstraight-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属科学实验页</h2>
          <p>把蜡烛、带孔屏、观察屏和穿孔光束完整放回中央舞台，提示与记录统一收纳到底部工作台。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">得分 {score}</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid lightstraight-grid">
        <aside className="playground-side lightstraight-side-rail lightstraight-side-rail-left">
          <section className="info-card lightstraight-rail-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台' : cameraPreset === 'beam' ? '光束近景' : '观察屏'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card lightstraight-rail-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>光束强度 {beamValue}</span><div className="chem-meter-bar"><i style={{ width: `${beamValue}%` }} /></div></div><div className="chem-meter"><span>光路清晰度 {pathValue}</span><div className="chem-meter-bar"><i style={{ width: `${pathValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
        </aside>

        <section className="scene-panel lightstraight-workbench-stage">
          <div className="scene-toolbar lightstraight-workbench-toolbar"><div className="lightstraight-toolbar-head"><div className="lightstraight-toolbar-kicker">光路工作台</div><strong>{experiment.title}</strong><p className="lightstraight-toolbar-copy">中央舞台只保留蜡烛、带孔屏、观察屏与光束，所有提示和操作统一收回下方。</p></div><div className="camera-actions lightstraight-camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'beam' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('beam')} type="button">光束</button><button className={cameraPreset === 'screen' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('screen')} type="button">观察屏</button></div></div>

          <div className="scene-meta-strip lightstraight-stage-meta"><div className={`lightstraight-stage-card tone-${promptTone}`}><span>当前任务</span><strong>步骤 {step} · {stepTitles[step]}</strong><p>{prompt}</p></div><div className="lightstraight-step-pills" aria-label="实验步骤概览">{lightstraightStepOrder.map((stepId) => (<span className={step === stepId ? 'lightstraight-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'lightstraight-step-pill done' : 'lightstraight-step-pill'} key={stepId}><small>步骤 {stepId}</small><strong>{stepTitles[stepId]}</strong></span>))}</div></div>

          <div className={`scene-canvas lightstraight-stage preset-${cameraPreset} ${lit ? 'lit' : ''} ${aligned ? 'aligned' : ''}`}><div className="lightstraight-rig" /></div>

          <div className="workbench-inline-dock lightstraight-workbench-dock">
            <div className="lightstraight-workbench-status-grid"><div className={`info-card lightstraight-status-card tone-${promptTone}`}><span>当前进度</span><strong>步骤 {step} · {stepTitles[step]}</strong><p>{lightstraightWorkbenchStatus}</p></div><div className={`info-card lightstraight-status-card ${lit ? 'tone-success' : ''}`.trim()}><span>光源与对齐</span><strong>{lit ? '蜡烛已点亮' : '待点亮'} / {aligned ? '小孔已对齐' : '待对齐'}</strong><p>只有稳定光源 + 三孔成一直线，光束才会清晰通过。</p></div><div className={`info-card lightstraight-status-card ${observationChoice === 'correct' ? 'tone-success' : promptTone === 'error' && step >= 4 ? 'tone-error' : ''}`.trim()}><span>观察结果</span><strong>{lightPathResult}</strong><p>{aligned ? '重点看观察屏上是否出现亮点。' : '先把三块带孔屏排成一条直线。'}</p></div><div className={`info-card lightstraight-status-card ${completed ? 'tone-success' : ''}`.trim()}><span>实验指标</span><strong>得分 {score} · 完成度 {readinessValue}%</strong><p>光路清晰度 {pathValue} · 最新记录：{latestLabNote}</p></div></div>

            <div className="lightstraight-inline-workbench">
              <section className="info-card lightstraight-inline-panel lightstraight-workbench-actions"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleLight('correct')} type="button"><strong>点亮蜡烛</strong><span>建立稳定光源。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleLight('unlit')} type="button"><strong>不点蜡烛直接观察</strong><span>错误演示：没有光源。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAlign('correct')} type="button"><strong>把三块带孔屏调成一条直线</strong><span>为连续光路创造条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAlign('offset')} type="button"><strong>故意错开小孔</strong><span>错误演示：光线不能连续通过。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“光线穿过三孔并在观察屏上形成亮点”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('curve')} type="button"><strong>记录“光线弯曲绕过小孔”</strong><span>错误演示：与实验相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('ignore')} type="button"><strong>记录“观察屏有没有亮点都无所谓”</strong><span>错误演示：忽略关键证据。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>光在同一种均匀介质中沿直线传播</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('bend')} type="button"><strong>光在空气中总会自动弯曲传播</strong><span>错误演示：与实验相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('random')} type="button"><strong>光线传播方向是随机的</strong><span>错误演示：概念错误。</span></button></> : null}</div></section>
              <section className="info-card lightstraight-inline-panel lightstraight-notebook-panel"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>过程记录与读数</h3></div><span className="badge">舞台下工作台</span></div><div className="generic-readout-grid lightstraight-readout-grid"><article className={lit ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>光源</span><strong>{lit ? '已点亮' : '--'}</strong><small>{lit ? '蜡烛已形成稳定火焰。' : '先点亮蜡烛。'}</small></article><article className={aligned ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>对齐</span><strong>{aligned ? '已成一直线' : '--'}</strong><small>{aligned ? '三孔对齐，光路连续。' : '先调整带孔屏。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '直线传播' : '等待总结'}</strong><small>观察屏亮点是关键证据。</small></article></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
            </div>
          </div>
        </section>

        <aside className="playground-side lightstraight-side-rail lightstraight-side-rail-right"><section className="info-card lightstraight-rail-card"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{lit ? '光源已建立' : '待点亮光源'} / {aligned ? '小孔已对齐' : '待对齐小孔'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先点光源，再对齐小孔，再看观察屏亮点'}</li></ul></section><section className="info-card lightstraight-rail-card lightstraight-rail-prompt"><span className="eyebrow">Readout</span><h3>光路结果板</h3><div className="generic-readout-grid lightstraight-readout-grid"><article className={lit ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>光源</span><strong>{lit ? '稳定' : '--'}</strong><small>先建立稳定火焰。</small></article><article className={aligned ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>对齐</span><strong>{aligned ? '完成' : '--'}</strong><small>三孔必须排成一线。</small></article><article className={observationChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>结果</span><strong>{lightPathResult}</strong><small>关键看观察屏亮点。</small></article></div></section><section className="info-card lightstraight-rail-card lightstraight-rail-prompt"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className={`info-card lightstraight-rail-card lightstraight-rail-prompt ${completed ? 'tone-success' : promptTone === 'error' ? 'tone-error' : ''}`.trim()}><span className="eyebrow">Control</span><h3>实验控制</h3><p>{lightstraightCompletionCopy}</p><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>{latestLabNote}</small></section></aside>
      </div>
    </section>
  );
}
