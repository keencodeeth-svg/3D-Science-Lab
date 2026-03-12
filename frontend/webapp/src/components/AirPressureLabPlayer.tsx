import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'cup' | 'detail';
type MaterialId = 'glass-cup' | 'water' | 'hard-card' | 'tray' | 'sink';
type TimelineState = 'done' | 'current' | 'todo';

interface AirPressureLabPlayerProps {
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
  2: '向杯中加满水',
  3: '盖上硬卡片',
  4: '倒转水杯观察',
  5: '总结大气压作用',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别玻璃杯、水、硬卡片、托盘和水槽。',
  2: '把杯中加满水，尽量减少空气残留。',
  3: '用硬卡片紧贴杯口，准备倒转。',
  4: '缓慢倒转水杯，观察卡片是否掉落和水是否漏出。',
  5: '总结硬卡片能托住杯中水的原因。',
};

const materialLabels: Record<MaterialId, string> = {
  'glass-cup': '玻璃杯',
  water: '水',
  'hard-card': '硬卡片',
  tray: '托盘',
  sink: '水槽',
};

const materialOrder: MaterialId[] = ['glass-cup', 'water', 'hard-card', 'tray', 'sink'];

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

export function AirPressureLabPlayer({ experiment, onTelemetry }: AirPressureLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [filled, setFilled] = useState(false);
  const [covered, setCovered] = useState(false);
  const [inverted, setInverted] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先把杯子装满水，再覆盖卡片倒转观察现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const sealValue = clamp(42 + (filled ? 18 : 0) + (covered ? 18 : 0) + (inverted ? 18 : 0), 24, 99);
  const clarityValue = clamp(38 + (inverted ? 22 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (filled ? 14 : 0) + (covered ? 16 : 0) + (inverted ? 16 : 0), 20, 100);

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
        setCameraPreset('cup');
        advanceStep(2, '器材识别完成，下一步先把杯中加满水。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleFill = (choice: 'correct' | 'half') => {
    if (step !== 2 || completed) return;
    if (choice === 'half') {
      markError('杯中应尽量加满水，减少空气残留，实验现象才更稳定。');
      return;
    }
    setFilled(true);
    appendNote('操作记录：玻璃杯已装满水，杯口液面接近齐平。');
    advanceStep(3, '加水完成，下一步用硬卡片覆盖杯口。');
  };

  const handleCover = (choice: 'correct' | 'loose') => {
    if (step !== 3 || completed) return;
    if (!filled) {
      markError('请先把杯中加满水，再覆盖卡片。');
      return;
    }
    if (choice === 'loose') {
      markError('卡片要紧贴杯口，不能松松垮垮。');
      return;
    }
    setCovered(true);
    appendNote('操作记录：硬卡片已紧贴杯口，准备倒转观察。');
    advanceStep(4, '覆盖完成，开始倒转水杯观察是否漏水。');
  };

  const handleInvert = (choice: 'correct' | 'shake') => {
    if (step !== 4 || completed) return;
    if (!covered) {
      markError('请先把卡片盖稳，再倒转水杯。');
      return;
    }
    if (choice === 'shake') {
      markError('应缓慢平稳倒转，不能剧烈晃动。');
      return;
    }
    setInverted(true);
    setCameraPreset('detail');
    appendNote('现象记录：倒转后卡片未掉落，杯中水没有明显漏出。');
    advanceStep(5, '现象已出现，最后总结是什么力量托住了卡片和杯中水。');
  };

  const handleSummary = (choice: 'correct' | 'water-stick' | 'cup-magic') => {
    if (step !== 5 || completed) return;
    setObservationChoice(choice);
    setSummaryChoice(choice);
    if (!inverted) {
      markError('请先完成倒转观察，再进行原因总结。');
      return;
    }
    if (choice === 'correct') {
      advanceStep(null, '总结正确：外界大气压托住了卡片，从而使杯中水不易落下。');
      return;
    }
    if (choice === 'water-stick') {
      markError('不是水自己“粘住”卡片，而是外界大气压起主要作用。');
      return;
    }
    markError('这不是“魔法”，要从大气压与杯内压强差来解释。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setFilled(false);
    setCovered(false);
    setInverted(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新覆盖卡片并倒转水杯观察大气压现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '杯中尽量加满水，现象更稳定。',
        '卡片一定要贴紧杯口后再倒转。',
        '总结时把现象与“大气压”对应起来。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对倒转现象。',
        '建议重新执行“加满水 → 盖卡片 → 缓慢倒转”的流程。',
      ];

  return (
    <section className="panel playground-panel airpressure-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属小学科学实验页</h2>
          <p>把“倒扣水杯卡片不掉”做成可操作场景，让孩子更直观理解大气压的托举作用。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid airpressure-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'cup' ? '杯口观察' : '倒转细节'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>密封度 {sealValue}</span><div className="chem-meter-bar"><i style={{ width: `${sealValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card airpressure-data-card"><span className="eyebrow">Readout</span><h3>大气压读数板</h3><div className="generic-readout-grid airpressure-readout-grid"><article className={filled ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>加水状态</span><strong>{filled ? '已加满' : '待加水'}</strong><small>{filled ? '杯内液面接近杯口。' : '先把杯中加满水。'}</small></article><article className={inverted ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>倒转现象</span><strong>{inverted ? '卡片未掉，水未漏' : '待观察'}</strong><small>{inverted ? '说明外界作用力在托举卡片。' : '覆盖卡片后再倒转。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '大气压托举' : '等待总结'}</strong><small>外界大气压托住卡片，从而帮助杯中水保持不落下。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '大气压实验装置'} · 当前重点：{step <= 3 ? '形成密封状态' : step === 4 ? '倒转观察' : '解释现象原因'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'cup' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('cup')} type="button">杯口</button><button className={cameraPreset === 'detail' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('detail')} type="button">倒转</button></div></div>

          <div className={`scene-canvas airpressure-stage preset-${cameraPreset} ${filled ? 'filled' : ''} ${covered ? 'covered' : ''} ${inverted ? 'inverted' : ''}`}>
            <div className="airpressure-rig">
              <div className="airpressure-tray" />
              <div className={inverted ? 'airpressure-cup inverted' : 'airpressure-cup'}>
                <div className={filled ? 'airpressure-water active' : 'airpressure-water'} />
                <div className={covered ? 'airpressure-card active' : 'airpressure-card'} />
              </div>
              <div className={inverted ? 'airpressure-pressure-ring active' : 'airpressure-pressure-ring'} />
            </div>
          </div>

          <div className="observation-ribbon airpressure-observation-row"><article className={filled ? 'observation-chip active' : 'observation-chip calm'}><strong>加水准备</strong><span>{filled ? '杯内几乎充满水。' : '先完成加水。'}</span></article><article className={covered ? 'observation-chip active' : 'observation-chip calm'}><strong>覆盖状态</strong><span>{covered ? '硬卡片已贴紧杯口。' : '等待盖上硬卡片。'}</span></article><article className={inverted ? 'observation-chip active' : 'observation-chip calm'}><strong>倒转现象</strong><span>{inverted ? '卡片未掉落，水没有明显漏出。' : '缓慢倒转后再观察。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFill('correct')} type="button"><strong>把杯中加满水</strong><span>尽量减少空气残留。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFill('half')} type="button"><strong>只加半杯水</strong><span>错误演示：现象不稳定。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleCover('correct')} type="button"><strong>用硬卡片贴紧杯口</strong><span>形成较稳定密封状态。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCover('loose')} type="button"><strong>松松地盖住杯口</strong><span>错误演示：容易漏水。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleInvert('correct')} type="button"><strong>缓慢平稳倒转水杯</strong><span>观察卡片和水的状态。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleInvert('shake')} type="button"><strong>剧烈晃动再倒转</strong><span>错误演示：破坏实验条件。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>外界大气压托住卡片，使杯中水不易落下</strong><span>完整总结实验原因。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('water-stick')} type="button"><strong>是水自己粘住了卡片</strong><span>错误演示：忽略大气压作用。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('cup-magic')} type="button"><strong>这是玻璃杯的魔法现象</strong><span>错误演示：没有科学解释。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{filled ? '已加满水' : '待加水'} / {covered ? '卡片已覆盖' : '待覆盖'} / {inverted ? '已倒转' : '待倒转'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意杯口覆盖紧密与倒转平稳'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“大气压托水”升级成可操作、可观察的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
