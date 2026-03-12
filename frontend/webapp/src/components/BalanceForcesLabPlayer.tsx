import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'track' | 'meter';
type MaterialId = 'cart' | 'left-scale' | 'right-scale' | 'track' | 'fix-stand';
type ForceMode = 'equal' | 'left-strong' | 'right-strong' | null;
type TimelineState = 'done' | 'current' | 'todo';

interface BalanceForcesLabPlayerProps {
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
  2: '连接小车与测力计',
  3: '调成相等拉力',
  4: '观察小车状态',
  5: '总结二力平衡',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别小车、左右弹簧测力计、轨道和固定支架。',
  2: '把小车两端连接到测力计，建立对拉实验装置。',
  3: '把两侧拉力调成大小相等、方向相反。',
  4: '观察小车是否保持静止，分析合力情况。',
  5: '总结二力平衡时物体的受力和运动状态。',
};

const materialLabels: Record<MaterialId, string> = {
  cart: '小车',
  'left-scale': '左侧测力计',
  'right-scale': '右侧测力计',
  track: '轨道',
  'fix-stand': '固定支架',
};

const materialOrder: MaterialId[] = ['cart', 'left-scale', 'right-scale', 'track', 'fix-stand'];

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

export function BalanceForcesLabPlayer({ experiment, onTelemetry }: BalanceForcesLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [connected, setConnected] = useState(false);
  const [forceMode, setForceMode] = useState<ForceMode>(null);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先连好对拉装置，再把两侧拉力调成相等。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const leftForce = forceMode === 'left-strong' ? 2.6 : forceMode === 'right-strong' ? 1.4 : forceMode === 'equal' ? 2.0 : 0;
  const rightForce = forceMode === 'left-strong' ? 1.4 : forceMode === 'right-strong' ? 2.6 : forceMode === 'equal' ? 2.0 : 0;
  const netForce = forceMode ? Number(Math.abs(leftForce - rightForce).toFixed(1)) : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const forceValue = clamp(42 + (connected ? 18 : 0) + (forceMode === 'equal' ? 22 : forceMode ? 8 : 0) + (observationChoice === 'correct' ? 14 : 0), 24, 99);
  const clarityValue = clamp(42 + (forceMode ? 16 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (connected ? 14 : 0) + (forceMode === 'equal' ? 18 : 0), 20, 100);

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
        setCameraPreset('track');
        advanceStep(2, '器材识别完成，先把小车与左右测力计连接好。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleConnect = (choice: 'correct' | 'one-side') => {
    if (step !== 2 || completed) return;
    if (choice === 'one-side') {
      markError('必须形成左右对拉装置，不能只连接一侧。');
      return;
    }
    setConnected(true);
    appendNote('装置搭建：小车已与左右测力计连接，形成对拉模型。');
    advanceStep(3, '装置已搭好，下一步把两侧拉力调成相等。');
  };

  const handleForce = (choice: ForceMode) => {
    if (step !== 3 || completed) return;
    if (!connected) {
      markError('请先连接完整装置，再调节两侧拉力。');
      return;
    }
    setForceMode(choice);
    if (choice === 'equal') {
      setCameraPreset('meter');
      appendNote(`读数记录：左右两侧都约为 ${2.0.toFixed(1)} N，方向相反。`);
      advanceStep(4, '等大反向拉力已建立，请观察小车状态。');
      return;
    }
    if (choice === 'left-strong') {
      markError('当前左侧更大，合力不为零，不能作为二力平衡状态。');
      return;
    }
    markError('当前右侧更大，合力不为零，不能作为二力平衡状态。');
  };

  const handleObserve = (choice: 'correct' | 'move-left' | 'move-right') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (forceMode !== 'equal') {
      markError('请先把两侧拉力调成相等，再观察平衡状态。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：小车保持静止，说明合力为 0，处于二力平衡状态。');
      advanceStep(5, '现象判断完成，最后总结二力平衡的条件和结果。');
      return;
    }
    markError('当两侧拉力等大反向时，小车不会向单侧运动。');
  };

  const handleSummary = (choice: 'correct' | 'same-direction' | 'must-move') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：两个力大小相等、方向相反、作用在同一直线上时，物体可保持静止或匀速直线运动。');
      return;
    }
    if (choice === 'same-direction') {
      markError('二力平衡要求方向相反，不是同向。');
      return;
    }
    markError('二力平衡时物体不一定运动，也可能保持静止。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setConnected(false);
    setForceMode(null);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新连接对拉装置并调节两侧拉力。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先连完整装置，再调节拉力大小。',
        '注意二力平衡强调“等大、反向、同一直线”。',
        '现象判断要结合合力是否为零。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对受力关系。',
        '建议重新执行“连接装置 → 调成等大反向 → 观察状态”的流程。',
      ];

  return (
    <section className="panel playground-panel balanceforces-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把“等大反向”的抽象受力关系做成可看、可调、可比较的小车实验，让二力平衡真正看得见。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid balanceforces-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'track' ? '轨道观察' : '受力读数'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>平衡度 {forceValue}</span><div className="chem-meter-bar"><i style={{ width: `${forceValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card balanceforces-data-card"><span className="eyebrow">Readout</span><h3>受力读数板</h3><div className="generic-readout-grid balanceforces-readout-grid"><article className={connected ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>左侧拉力</span><strong>{forceMode ? `${leftForce.toFixed(1)} N` : '--'}</strong><small>{connected ? '先看左侧测力计，再与右侧比较。' : '先完成装置连接。'}</small></article><article className={forceMode ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>右侧拉力</span><strong>{forceMode ? `${rightForce.toFixed(1)} N` : '--'}</strong><small>{forceMode ? `当前合力约 ${netForce.toFixed(1)} N。` : '调节拉力后再读数。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '等大反向，合力为零' : '等待总结'}</strong><small>二力平衡时，两个力大小相等、方向相反并作用在同一直线上。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '二力平衡装置'} · 当前重点：{step <= 2 ? '搭建对拉装置' : step === 3 ? '调成等大反向' : '观察小车状态'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'track' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('track')} type="button">轨道</button><button className={cameraPreset === 'meter' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('meter')} type="button">读数</button></div></div>

          <div className={`scene-canvas balanceforces-stage preset-${cameraPreset} ${connected ? 'connected' : ''} ${forceMode ?? 'none'}`}>
            <div className="balanceforces-rig">
              <div className="bf-track" />
              <div className={`bf-cart ${forceMode === 'left-strong' ? 'shift-right' : forceMode === 'right-strong' ? 'shift-left' : 'centered'}`} />
              <div className="bf-scale left"><span>{leftForce ? `${leftForce.toFixed(1)} N` : '--'}</span></div>
              <div className="bf-scale right"><span>{rightForce ? `${rightForce.toFixed(1)} N` : '--'}</span></div>
              <div className={forceMode ? `bf-force-arrow left ${forceMode}` : 'bf-force-arrow left'} />
              <div className={forceMode ? `bf-force-arrow right ${forceMode}` : 'bf-force-arrow right'} />
            </div>
          </div>

          <div className="observation-ribbon balanceforces-observation-row"><article className={connected ? 'observation-chip active' : 'observation-chip calm'}><strong>装置状态</strong><span>{connected ? '左右对拉装置已建立。' : '先连接装置。'}</span></article><article className={forceMode === 'equal' ? 'observation-chip active' : 'observation-chip calm'}><strong>受力关系</strong><span>{forceMode === 'equal' ? '两侧拉力等大反向。' : forceMode ? '当前两侧拉力还不平衡。' : '等待调节拉力。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>小车状态</strong><span>{observationChoice === 'correct' ? '小车保持静止，合力为零。' : '等待完成运动状态判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleConnect('correct')} type="button"><strong>连接左右对拉装置</strong><span>让小车两端都接入测力计。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleConnect('one-side')} type="button"><strong>只连接一侧</strong><span>错误演示：无法比较平衡。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleForce('equal')} type="button"><strong>调成左右都为 2.0 N</strong><span>建立等大反向受力。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleForce('left-strong')} type="button"><strong>调成左大右小</strong><span>错误演示：合力不为零。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleForce('right-strong')} type="button"><strong>调成右大左小</strong><span>错误演示：合力不为零。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“小车保持静止，合力为零”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('move-left')} type="button"><strong>记录“小车向左运动”</strong><span>错误演示：与平衡状态不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('move-right')} type="button"><strong>记录“小车向右运动”</strong><span>错误演示：与平衡状态不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>两个力大小相等、方向相反、作用在同一直线上时，物体可保持静止或匀速直线运动</strong><span>完整总结二力平衡。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('same-direction')} type="button"><strong>二力平衡时两个力方向相同</strong><span>错误演示：与定义相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('must-move')} type="button"><strong>二力平衡时物体一定会运动</strong><span>错误演示：忽略静止情况。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{connected ? '已连接对拉装置' : '待连接'} / {forceMode ? `左 ${leftForce.toFixed(1)} N，右 ${rightForce.toFixed(1)} N` : '待调拉力'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意等大、反向、同一直线'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“二力平衡”升级成可调受力和小车状态联动的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
