import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'flame' | 'cover';
type MaterialId = 'fuel-tray' | 'lid-cover' | 'sand-cup' | 'tongs' | 'method-card';
type TimelineState = 'done' | 'current' | 'todo';

interface ExtinguishingLabPlayerProps {
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
  2: '建立燃烧现象',
  3: '隔绝空气灭火',
  4: '观察火焰熄灭',
  5: '总结灭火原理',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别燃烧盘、盖板、细沙杯、坩埚钳和方法提示卡。',
  2: '先让燃烧盘中的燃料稳定燃烧，建立灭火前现象。',
  3: '使用盖板或细沙覆盖火焰，隔绝空气。',
  4: '观察火焰迅速减弱并熄灭。',
  5: '总结灭火可以通过隔绝空气、降低温度或移走可燃物实现。',
};

const materialLabels: Record<MaterialId, string> = {
  'fuel-tray': '燃烧盘',
  'lid-cover': '盖板',
  'sand-cup': '细沙杯',
  tongs: '坩埚钳',
  'method-card': '方法提示卡',
};

const materialOrder: MaterialId[] = ['fuel-tray', 'lid-cover', 'sand-cup', 'tongs', 'method-card'];

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

export function ExtinguishingLabPlayer({ experiment, onTelemetry }: ExtinguishingLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [burning, setBurning] = useState(false);
  const [covered, setCovered] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先建立火焰，再通过隔绝空气观察灭火。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const flameState = !burning ? '未燃烧' : covered ? '减弱并熄灭' : '稳定燃烧';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const safetyValue = clamp(42 + (burning ? 16 : 0) + (covered ? 20 : 0) + (observationChoice === 'correct' ? 14 : 0), 24, 99);
  const clarityValue = clamp(42 + (burning ? 10 : 0) + (covered ? 12 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (burning ? 14 : 0) + (covered ? 16 : 0), 20, 100);

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
        setCameraPreset('flame');
        advanceStep(2, '器材识别完成，先建立燃烧现象。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleBurn = (choice: 'ignite' | 'cover') => {
    if (step !== 2 || completed) return;
    if (choice === 'cover') {
      markError('要先建立燃烧现象，才能比较灭火前后的变化。');
      return;
    }
    setBurning(true);
    appendNote('现象建立：燃烧盘中火焰已经稳定燃烧。');
    advanceStep(3, '火焰已建立，下一步通过覆盖隔绝空气。');
  };

  const handleExtinguish = (choice: 'cover' | 'fan') => {
    if (step !== 3 || completed) return;
    if (!burning) {
      markError('请先建立燃烧现象。');
      return;
    }
    if (choice === 'fan') {
      markError('本实验重点是隔绝空气，不是用扇风处理火焰。');
      return;
    }
    setCovered(true);
    setCameraPreset('cover');
    appendNote('灭火操作：已用盖板覆盖火焰，空气供应被切断。');
    advanceStep(4, '覆盖完成，开始观察火焰熄灭过程。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'stronger') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!covered) {
      markError('请先完成覆盖灭火操作。');
      return;
    }
    if (choice === 'correct') {
      appendNote('结果记录：火焰迅速减弱并熄灭。');
      advanceStep(5, '现象已明确，最后总结灭火原理。');
      return;
    }
    if (choice === 'same') {
      markError('覆盖后火焰不会保持不变，会因空气不足而熄灭。');
      return;
    }
    markError('隔绝空气后火焰不会更旺。');
  };

  const handleSummary = (choice: 'correct' | 'oxygen-more' | 'only-water') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：灭火可以通过隔绝空气、降低温度或移走可燃物来实现。');
      return;
    }
    if (choice === 'oxygen-more') {
      markError('灭火不是提供更多氧气，而是要切断燃烧条件。');
      return;
    }
    markError('灭火方法并不只有浇水，隔绝空气同样是重要方法。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setBurning(false);
    setCovered(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察覆盖隔绝空气后的灭火现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先建立火焰，再做灭火操作。',
        '重点观察覆盖后火焰迅速变弱并熄灭。',
        '总结时把三种灭火思路都说完整。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对灭火原理。',
        '建议重新执行“燃烧 → 覆盖 → 观察熄灭”的流程。',
      ];

  return (
    <section className="panel playground-panel extinguishing-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把燃烧、覆盖、熄灭三段过程做成完整可视化场景，让“灭火原理”真正来自实验观察，而不是死记硬背。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid extinguishing-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'flame' ? '火焰观察' : '覆盖观察'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>规范值 {safetyValue}</span><div className="chem-meter-bar"><i style={{ width: `${safetyValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card extinguishing-data-card"><span className="eyebrow">Readout</span><h3>灭火读数板</h3><div className="generic-readout-grid extinguishing-readout-grid"><article className={burning ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>火焰状态</span><strong>{flameState}</strong><small>{burning ? '比较覆盖前后火焰状态变化。' : '先建立燃烧现象。'}</small></article><article className={covered ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>空气条件</span><strong>{covered ? '已被切断' : '仍可接触空气'}</strong><small>{covered ? '覆盖后空气供应被阻断。' : '还未进行灭火操作。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心原理</span><strong>{summaryChoice === 'correct' ? '切断燃烧条件' : '等待总结'}</strong><small>隔绝空气、降低温度或移走可燃物，都能使燃烧停止。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '燃烧盘与盖板'} · 当前重点：{step <= 2 ? '建立火焰' : step === 3 ? '覆盖隔绝空气' : '观察熄灭'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'flame' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flame')} type="button">火焰</button><button className={cameraPreset === 'cover' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('cover')} type="button">覆盖</button></div></div>

          <div className={`scene-canvas extinguishing-stage preset-${cameraPreset} ${burning ? 'burning' : ''} ${covered ? 'covered' : ''}`}>
            <div className="extinguishing-rig">
              <div className="extinguish-tray" />
              <div className={burning ? covered ? 'extinguish-flame low' : 'extinguish-flame active' : 'extinguish-flame'} />
              <div className={covered ? 'extinguish-cover active' : 'extinguish-cover'}>
                <div className="extinguish-cover-gloss" />
              </div>
              <div className={covered ? 'extinguish-smoke active' : 'extinguish-smoke'}>
                <span className="smoke-wisp smoke-1" />
                <span className="smoke-wisp smoke-2" />
                <span className="smoke-wisp smoke-3" />
              </div>
              <div className="extinguish-sand-cup" />
            </div>
          </div>

          <div className="observation-ribbon extinguishing-observation-row"><article className={burning ? 'observation-chip active' : 'observation-chip calm'}><strong>燃烧现象</strong><span>{burning ? '火焰已建立，可进行灭火比较。' : '先让燃烧盘稳定燃烧。'}</span></article><article className={covered ? 'observation-chip active' : 'observation-chip calm'}><strong>灭火操作</strong><span>{covered ? '覆盖完成，空气供应被阻断。' : '等待执行覆盖灭火。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>结果变化</strong><span>{observationChoice === 'correct' ? '火焰迅速减弱并熄灭。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleBurn('ignite')} type="button"><strong>建立稳定火焰</strong><span>为灭火前后比较提供基准。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleBurn('cover')} type="button"><strong>还没点燃就去覆盖</strong><span>错误演示：没有比较基准。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleExtinguish('cover')} type="button"><strong>用盖板覆盖火焰</strong><span>隔绝空气，使燃烧停止。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleExtinguish('fan')} type="button"><strong>对着火焰扇风</strong><span>错误演示：偏离本实验变量。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“火焰迅速减弱并熄灭”</strong><span>这是覆盖灭火的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“火焰保持不变”</strong><span>错误演示：忽略空气变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('stronger')} type="button"><strong>记录“火焰更旺”</strong><span>错误演示：与实际现象相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>灭火可以通过隔绝空气、降低温度或移走可燃物实现</strong><span>完整总结灭火原理。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('oxygen-more')} type="button"><strong>灭火要提供更多氧气</strong><span>错误演示：方向完全相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('only-water')} type="button"><strong>灭火只有浇水一种方法</strong><span>错误演示：方法过于片面。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{burning ? '火焰已建立' : '待建立火焰'} / {covered ? '已完成覆盖' : '待执行覆盖'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先燃烧再灭火'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“灭火原理”升级成燃烧、覆盖和熄灭一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
