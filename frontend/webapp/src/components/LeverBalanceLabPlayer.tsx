import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'lever' | 'balance';
type MaterialId = 'stand' | 'lever' | 'fulcrum' | 'weight' | 'ruler';
type TimelineState = 'done' | 'current' | 'todo';

interface LeverBalanceLabPlayerProps {
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
  2: '设置左侧阻力',
  3: '调整右侧动力臂',
  4: '观察杠杆平衡',
  5: '总结杠杆平衡条件',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别支架、杠杆尺、支点、钩码和刻度。',
  2: '先在左侧较近位置挂上两个钩码，形成阻力一侧。',
  3: '再在右侧较远位置挂上一个钩码，尝试让杠杆平衡。',
  4: '根据两侧位置和数量比较杠杆是否平衡。',
  5: '总结杠杆平衡时力和力臂的关系。',
};

const materialLabels: Record<MaterialId, string> = {
  stand: '支架',
  lever: '杠杆尺',
  fulcrum: '支点',
  weight: '钩码',
  ruler: '刻度',
};

const materialOrder: MaterialId[] = ['stand', 'lever', 'fulcrum', 'weight', 'ruler'];

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

export function LeverBalanceLabPlayer({ experiment, onTelemetry }: LeverBalanceLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [leftSet, setLeftSet] = useState(false);
  const [rightBalanced, setRightBalanced] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过两侧钩码数量与位置对比观察杠杆平衡条件。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const torqueValue = clamp(32 + (leftSet ? 22 : 0) + (rightBalanced ? 26 : 0), 24, 99);
  const balanceValue = clamp(28 + (cameraPreset !== 'bench' ? 10 : 0) + (observationChoice === 'correct' ? 26 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (leftSet ? 10 : 0) + (rightBalanced ? 14 : 0), 20, 100);

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
        setCameraPreset('lever');
        advanceStep(2, '器材识别完成，先在左侧挂上两个钩码。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleLeft = (choice: 'correct' | 'center') => {
    if (step !== 2 || completed) return;
    if (choice === 'center') {
      markError('应把阻力放在离支点有一定距离的位置，便于后续比较力臂。');
      return;
    }
    setLeftSet(true);
    appendNote('左侧设置：左侧 2 个钩码挂在距支点较近的位置。');
    advanceStep(3, '左侧阻力已建立，下一步在右侧调整动力臂。');
  };

  const handleRight = (choice: 'correct' | 'near') => {
    if (step !== 3 || completed) return;
    if (!leftSet) {
      markError('请先设置左侧阻力，再调整右侧动力臂。');
      return;
    }
    if (choice === 'near') {
      markError('右侧单个钩码若离支点太近，往往无法平衡左侧。');
      return;
    }
    setRightBalanced(true);
    setCameraPreset('balance');
    appendNote('右侧调整：右侧 1 个钩码挂在更远位置后，杠杆接近平衡。');
    advanceStep(4, '两侧配置已完成，请判断杠杆是否达到平衡。');
  };

  const handleObserve = (choice: 'correct' | 'left-down' | 'shorter-arm') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!leftSet || !rightBalanced) {
      markError('请先完成两侧挂码设置，再判断平衡现象。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：左侧钩码较多但力臂较短，右侧钩码较少但力臂较长，杠杆仍可平衡。');
      advanceStep(5, '现象判断正确，最后总结杠杆平衡条件。');
      return;
    }
    if (choice === 'left-down') {
      markError('当前正确设置下杠杆应接近平衡，而不是左侧持续下沉。');
      return;
    }
    markError('平衡时不能只看重量多少，还要结合力臂长短。');
  };

  const handleSummary = (choice: 'correct' | 'heavier-only' | 'distance-only') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：杠杆平衡时，动力 × 动力臂 = 阻力 × 阻力臂。');
      return;
    }
    if (choice === 'heavier-only') {
      markError('杠杆平衡不能只看力的大小，还要看力臂。');
      return;
    }
    markError('杠杆平衡也不能只看距离长短，还要结合力的大小。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setLeftSet(false);
    setRightBalanced(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新探究杠杆平衡条件。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先建立左侧阻力，再调整右侧力臂。', '重点看“两侧力和力臂的乘积关系”。', '总结时记住“力 × 力臂”。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对杠杆两侧配置。',
        '建议按“左侧阻力 → 右侧力臂 → 观察平衡 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel leverbalance-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属物理实验页</h2><p>把杠杆尺、支点、钩码和力臂刻度做成更像真实演示教具的对照场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid leverbalance-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'lever' ? '杠杆近景' : '平衡对比'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>力矩关系 {torqueValue}</span><div className="chem-meter-bar"><i style={{ width: `${torqueValue}%` }} /></div></div><div className="chem-meter"><span>平衡程度 {balanceValue}</span><div className="chem-meter-bar"><i style={{ width: `${balanceValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card leverbalance-data-card"><span className="eyebrow">Readout</span><h3>杠杆读数板</h3><div className="generic-readout-grid leverbalance-readout-grid"><article className={leftSet ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>左侧设置</span><strong>{leftSet ? '2 个钩码 × 短力臂' : '--'}</strong><small>{leftSet ? '左侧阻力已建立。' : '先在左侧挂上阻力。'}</small></article><article className={rightBalanced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>右侧设置</span><strong>{rightBalanced ? '1 个钩码 × 长力臂' : '--'}</strong><small>{rightBalanced ? '右侧动力臂已调到更远位置。' : '再调整右侧力臂。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '力 × 力臂 相等' : '等待总结'}</strong><small>杠杆平衡取决于力和力臂的共同作用。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '杠杆装置'} · 当前重点：{step <= 2 ? '建立左侧阻力' : step === 3 ? '拉长右侧力臂' : '比较力和力臂'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'lever' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('lever')} type="button">杠杆</button><button className={cameraPreset === 'balance' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('balance')} type="button">平衡</button></div></div><div className={`scene-canvas leverbalance-stage preset-${cameraPreset} ${leftSet ? 'left-set' : ''} ${rightBalanced ? 'right-balanced' : ''}`}><div className="leverbalance-rig"><div className="lb-stand" /><div className="lb-fulcrum" /><div className={rightBalanced ? 'lb-beam active balanced' : leftSet ? 'lb-beam active tilted' : 'lb-beam'}><div className={leftSet ? 'lb-weight left a active' : 'lb-weight left a'} /><div className={leftSet ? 'lb-weight left b active' : 'lb-weight left b'} /><div className={rightBalanced ? 'lb-weight right active' : 'lb-weight right'} /></div><div className="lb-ruler" /><div className="lb-pointer" /></div></div><div className="observation-ribbon leverbalance-observation-row"><article className={leftSet ? 'observation-chip active' : 'observation-chip calm'}><strong>左侧阻力</strong><span>{leftSet ? '左侧 2 个钩码已就位。' : '先设置左侧阻力。'}</span></article><article className={rightBalanced ? 'observation-chip active' : 'observation-chip calm'}><strong>右侧力臂</strong><span>{rightBalanced ? '右侧单个钩码已移到更远位置。' : '等待右侧调整。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>平衡判断</strong><span>{observationChoice === 'correct' ? '已判断杠杆达到平衡。' : '等待完成判断。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleLeft('correct')} type="button"><strong>左侧近处挂 2 个钩码</strong><span>先建立阻力一侧。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleLeft('center')} type="button"><strong>把钩码都挂在支点附近</strong><span>错误演示：不利于比较力臂。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRight('correct')} type="button"><strong>右侧远处挂 1 个钩码使其平衡</strong><span>通过加长力臂来平衡。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRight('near')} type="button"><strong>右侧近处挂 1 个钩码</strong><span>错误演示：通常难以平衡左侧。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“左侧较大阻力配较短力臂，右侧较小动力配较长力臂，杠杆仍能平衡”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('left-down')} type="button"><strong>记录“左侧一直下沉，根本不能平衡”</strong><span>错误演示：与正确配置不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('shorter-arm')} type="button"><strong>记录“平衡时只看钩码多少，不用看距离支点远近”</strong><span>错误演示：忽略力臂。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>杠杆平衡时，动力 × 动力臂 = 阻力 × 阻力臂</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('heavier-only')} type="button"><strong>杠杆平衡只由哪边更重决定</strong><span>错误演示：忽略力臂作用。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('distance-only')} type="button"><strong>杠杆平衡只由哪边离支点更远决定</strong><span>错误演示：忽略力的大小。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{leftSet ? '左侧已设' : '左侧待设'} / {rightBalanced ? '右侧已调' : '右侧待调'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意同时比较力和力臂'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“探究杠杆平衡条件”升级成钩码和力臂对照的专属页。</small></section></aside>
      </div>
    </section>
  );
}
