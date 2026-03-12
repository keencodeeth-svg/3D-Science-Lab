import { useMemo, useState, type CSSProperties } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'pendulum' | 'timer';
type MaterialId = 'pendulum-ball' | 'string' | 'stand' | 'ruler' | 'timer';
type LengthId = 'short' | 'mid' | 'long';
type TimelineState = 'done' | 'current' | 'todo';

interface PendulumLabPlayerProps {
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
  2: '设置摆长',
  3: '释放摆球',
  4: '比较摆动快慢',
  5: '总结摆的规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别摆球、细线、支架、刻度尺和计时器。',
  2: '先设置一个明确的摆长，建立比较条件。',
  3: '从相近角度释放摆球，观察摆动周期。',
  4: '比较不同摆长下摆动的快慢。',
  5: '总结摆的快慢与摆长的关系。',
};

const materialLabels: Record<MaterialId, string> = {
  'pendulum-ball': '摆球',
  string: '细线',
  stand: '支架',
  ruler: '刻度尺',
  timer: '计时器',
};

const materialOrder: MaterialId[] = ['pendulum-ball', 'string', 'stand', 'ruler', 'timer'];
const periodMap: Record<LengthId, number> = { short: 1.2, mid: 1.7, long: 2.2 };

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

export function PendulumLabPlayer({ experiment, onTelemetry }: PendulumLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [lengthChoice, setLengthChoice] = useState<LengthId | null>(null);
  const [released, setReleased] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先设置摆长，再释放摆球比较摆动快慢。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const period = lengthChoice ? periodMap[lengthChoice] : 0;
  const swingAngle = released ? (lengthChoice === 'short' ? 24 : lengthChoice === 'mid' ? 20 : 16) : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const rhythmValue = clamp(42 + (lengthChoice ? 16 : 0) + (released ? 18 : 0) + (observationChoice === 'correct' ? 16 : 0), 24, 99);
  const clarityValue = clamp(40 + (released ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (lengthChoice ? 14 : 0) + (released ? 18 : 0), 20, 100);

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
        setCameraPreset('pendulum');
        advanceStep(2, '器材识别完成，先设置一个明确的摆长。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleLength = (choice: LengthId) => {
    if (step !== 2 || completed) return;
    setLengthChoice(choice);
    appendNote(`摆长设置：当前摆长为${choice === 'short' ? '较短' : choice === 'mid' ? '中等' : '较长'}，单次周期约 ${periodMap[choice].toFixed(1)} s。`);
    advanceStep(3, '摆长已设置好，下一步从相近角度释放摆球。');
  };

  const handleRelease = (choice: 'correct' | 'push') => {
    if (step !== 3 || completed) return;
    if (!lengthChoice) {
      markError('请先确定摆长，再释放摆球。');
      return;
    }
    if (choice === 'push') {
      markError('应轻轻释放而不是用力推，避免额外条件影响摆动。');
      return;
    }
    setReleased(true);
    setCameraPreset('timer');
    appendNote(`实验记录：摆球已释放，当前周期约 ${period.toFixed(1)} s。`);
    advanceStep(4, '摆球已开始摆动，请比较不同摆长下的摆动快慢。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'longer-faster') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!released || !lengthChoice) {
      markError('请先完成摆长设置和摆球释放，再比较快慢。');
      return;
    }
    if (choice === 'correct') {
      appendNote('比较结果：摆长越短，摆动越快；摆长越长，摆动越慢。');
      advanceStep(5, '比较完成，最后总结摆的快慢与摆长的关系。');
      return;
    }
    if (choice === 'same') {
      markError('不同摆长的摆动快慢并不完全相同。');
      return;
    }
    markError('长摆并不会更快，通常是短摆摆得更快。');
  };

  const handleSummary = (choice: 'correct' | 'mass' | 'bigger-angle') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：在相近条件下，摆长越短，摆动越快；摆长越长，摆动越慢。');
      return;
    }
    if (choice === 'mass') {
      markError('本实验主要比较的是摆长，不是摆球质量。');
      return;
    }
    markError('本页比较的是不同摆长，不是单纯靠增大摆角来判断快慢。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setLengthChoice(null);
    setReleased(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新设置摆长并释放摆球比较摆动快慢。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先确定摆长，再释放摆球。',
        '释放时不要用力推，保持条件尽量一致。',
        '总结时记住“短摆快，长摆慢”。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对摆动快慢。',
        '建议重新执行“设摆长 → 释放摆球 → 比较快慢”的流程。',
      ];

  return (
    <section className="panel playground-panel pendulum-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属小学科学实验页</h2>
          <p>把摆球周期和摆长做成可切换对比，让“为什么短摆更快”在孩子眼前直接成立。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid pendulum-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'pendulum' ? '摆球观察' : '周期读数'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>节律值 {rhythmValue}</span><div className="chem-meter-bar"><i style={{ width: `${rhythmValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card pendulum-data-card"><span className="eyebrow">Readout</span><h3>摆动读数板</h3><div className="generic-readout-grid pendulum-readout-grid"><article className={lengthChoice ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>当前摆长</span><strong>{lengthChoice ? lengthChoice === 'short' ? '较短' : lengthChoice === 'mid' ? '中等' : '较长' : '--'}</strong><small>{lengthChoice ? '摆长已固定，可进入释放比较。' : '先设置一个清晰的摆长。'}</small></article><article className={released ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>摆动周期</span><strong>{released ? `${period.toFixed(1)} s` : '--'}</strong><small>{released ? '当前条件下的单次摆动周期。' : '释放摆球后再读周期。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '短摆快，长摆慢' : '等待总结'}</strong><small>在相近条件下，摆长越短，摆动越快。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '摆的实验装置'} · 当前重点：{step <= 2 ? '设置摆长' : step === 3 ? '释放摆球' : '比较周期'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'pendulum' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('pendulum')} type="button">摆球</button><button className={cameraPreset === 'timer' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('timer')} type="button">计时</button></div></div>

          <div className={`scene-canvas pendulum-stage preset-${cameraPreset} ${released ? 'released' : ''} ${lengthChoice ?? 'none'}`}>
            <div className="pendulum-rig">
              <div className="pendulum-stand" />
              <div
                className={`pendulum-arm ${lengthChoice ?? 'mid'} ${released ? 'swing' : ''}`}
                style={{
                  '--pendulum-angle': `${swingAngle}deg`,
                  '--pendulum-angle-negative': `${-swingAngle}deg`,
                  '--pendulum-duration': `${period || 1.7}s`,
                } as CSSProperties}
              >
                <div className={`pendulum-string ${lengthChoice ?? 'mid'}`} />
                <div className={`pendulum-ball ${lengthChoice ?? 'mid'}`} />
              </div>
              <div className="pendulum-arc" />
              <div className="pendulum-timer">{released ? `${period.toFixed(1)} s` : '--'}</div>
            </div>
          </div>

          <div className="observation-ribbon pendulum-observation-row"><article className={lengthChoice ? 'observation-chip active' : 'observation-chip calm'}><strong>摆长设置</strong><span>{lengthChoice ? '摆长已设置完成。' : '先选择一个摆长。'}</span></article><article className={released ? 'observation-chip active' : 'observation-chip calm'}><strong>摆球释放</strong><span>{released ? '摆球已从相近角度释放。' : '等待释放摆球。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>快慢比较</strong><span>{observationChoice === 'correct' ? '已得出短摆更快、长摆更慢。' : '等待完成快慢比较。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? (['short', 'mid', 'long'] as LengthId[]).map((item) => (<button className={lengthChoice === item ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} key={item} onClick={() => handleLength(item)} type="button"><strong>设置{item === 'short' ? '短摆' : item === 'mid' ? '中摆' : '长摆'}</strong><span>{item === 'short' ? '摆动更快。' : item === 'mid' ? '速度适中。' : '摆动更慢。'}</span></button>)) : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRelease('correct')} type="button"><strong>轻轻释放摆球</strong><span>保持初始条件尽量一致。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRelease('push')} type="button"><strong>用力推摆球</strong><span>错误演示：加入额外影响。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“短摆更快，长摆更慢”</strong><span>这是本实验的正确结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“不同摆长快慢都一样”</strong><span>错误演示：忽略周期差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('longer-faster')} type="button"><strong>记录“长摆更快”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>在相近条件下，摆长越短，摆动越快；摆长越长，摆动越慢</strong><span>完整总结摆的规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('mass')} type="button"><strong>摆的快慢主要由摆球质量决定</strong><span>错误演示：偏离本实验变量。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('bigger-angle')} type="button"><strong>摆的快慢只由摆角大小决定</strong><span>错误演示：与本页比较目标不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{lengthChoice ? `当前为${lengthChoice === 'short' ? '短摆' : lengthChoice === 'mid' ? '中摆' : '长摆'}` : '待设摆长'} / {released ? `周期约 ${period.toFixed(1)} s` : '待释放'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意相近角度释放并比较摆长'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“摆的快慢”升级成可切换摆长和周期的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
