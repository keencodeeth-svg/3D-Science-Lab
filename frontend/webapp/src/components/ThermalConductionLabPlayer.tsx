import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'rods' | 'close';
type MaterialId = 'metal-rod' | 'wood-rod' | 'heater' | 'wax-beads' | 'stand';
type TimelineState = 'done' | 'current' | 'todo';

interface ThermalConductionLabPlayerProps {
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
  2: '加热金属棒',
  3: '比较木棒变化',
  4: '观察蜡珠脱落',
  5: '总结传热规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别金属棒、木棒、加热器、蜡珠和支架。',
  2: '先加热金属棒的一端，观察蜡珠先后受热变化。',
  3: '再比较木棒上的蜡珠变化是否同样明显。',
  4: '根据蜡珠脱落情况判断哪种材料导热更快。',
  5: '总结不同材料导热本领的差异。',
};

const materialLabels: Record<MaterialId, string> = {
  'metal-rod': '金属棒',
  'wood-rod': '木棒',
  heater: '加热器',
  'wax-beads': '蜡珠',
  stand: '支架',
};

const materialOrder: MaterialId[] = ['metal-rod', 'wood-rod', 'heater', 'wax-beads', 'stand'];

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

export function ThermalConductionLabPlayer({ experiment, onTelemetry }: ThermalConductionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [metalHeated, setMetalHeated] = useState(false);
  const [woodCompared, setWoodCompared] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先加热金属棒，再和木棒的受热变化做对照。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const conductionState = !metalHeated ? '待加热' : woodCompared ? '金属导热更快' : '等待木棒对照';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const conductionValue = clamp(42 + (metalHeated ? 18 : 0) + (woodCompared ? 18 : 0) + (observationChoice === 'correct' ? 18 : 0), 24, 99);
  const clarityValue = clamp(42 + (metalHeated ? 12 : 0) + (observationChoice === 'correct' ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (metalHeated ? 14 : 0) + (woodCompared ? 16 : 0), 20, 100);

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
        setCameraPreset('rods');
        advanceStep(2, '器材识别完成，先加热金属棒的一端。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleMetal = (choice: 'metal' | 'wood') => {
    if (step !== 2 || completed) return;
    if (choice === 'wood') {
      markError('请先加热金属棒，建立明显的导热现象。');
      return;
    }
    setMetalHeated(true);
    appendNote('实验记录：金属棒受热后，靠近热源的蜡珠开始迅速融化。');
    advanceStep(3, '金属棒测试完成，下一步和木棒进行对照。');
  };

  const handleWood = (choice: 'wood' | 'metal') => {
    if (step !== 3 || completed) return;
    if (!metalHeated) {
      markError('请先完成金属棒加热，再比较木棒。');
      return;
    }
    if (choice === 'metal') {
      markError('现在需要换成木棒，才能看出材料差异。');
      return;
    }
    setWoodCompared(true);
    setCameraPreset('close');
    appendNote('实验记录：木棒上的蜡珠变化较慢，脱落不明显。');
    advanceStep(4, '两种材料都已测试，开始比较蜡珠脱落情况。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'reverse') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!woodCompared) {
      markError('请先完成木棒对照，再比较蜡珠变化。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：金属棒上的蜡珠更早融化脱落，木棒变化较慢。');
      advanceStep(5, '现象比较完成，最后总结不同材料导热快慢。');
      return;
    }
    if (choice === 'same') {
      markError('两种材料上的蜡珠变化并不完全相同。');
      return;
    }
    markError('结果不能记反，不是木棒上的蜡珠先大量脱落。');
  };

  const handleSummary = (choice: 'correct' | 'wood-faster' | 'same-speed') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：金属通常比木材导热更快，因此金属棒上的蜡珠更早融化脱落。');
      return;
    }
    if (choice === 'wood-faster') {
      markError('本实验中不是木棒导热更快，而是金属棒表现更明显。');
      return;
    }
    markError('不同材料导热速度并不一样，本实验正是在比较这种差异。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setMetalHeated(false);
    setWoodCompared(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新比较金属棒和木棒的导热快慢。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先加热金属棒，再换木棒做对照。',
        '重点看蜡珠融化脱落的快慢差异。',
        '总结时要把“材料不同”与“导热快慢不同”对应起来。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对对照组。',
        '建议重新执行“金属棒 → 木棒 → 比较蜡珠变化”的流程。',
      ];

  return (
    <section className="panel playground-panel thermalconduction-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属小学科学实验页</h2>
          <p>把金属棒和木棒受热后的蜡珠变化做成同台对照，让“导热快慢”从抽象词变成能一眼看懂的现象。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid thermalconduction-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'rods' ? '导热棒观察' : '蜡珠近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>导热值 {conductionValue}</span><div className="chem-meter-bar"><i style={{ width: `${conductionValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card thermalconduction-data-card"><span className="eyebrow">Readout</span><h3>导热读数板</h3><div className="generic-readout-grid thermalconduction-readout-grid"><article className={metalHeated ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>金属棒</span><strong>{metalHeated ? '已受热' : '待受热'}</strong><small>{metalHeated ? '靠近热源的蜡珠先融化脱落。' : '先开始加热金属棒。'}</small></article><article className={woodCompared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>木棒</span><strong>{woodCompared ? '已对照' : '待对照'}</strong><small>{woodCompared ? '蜡珠变化较慢，脱落不明显。' : '再换木棒形成导热对照。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心规律</span><strong>{conductionState}</strong><small>不同材料导热快慢不同，金属通常比木材导热更快。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '导热棒与蜡珠'} · 当前重点：{step <= 2 ? '建立金属受热现象' : step === 3 ? '比较木棒' : '观察蜡珠差异'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'rods' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('rods')} type="button">导热棒</button><button className={cameraPreset === 'close' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('close')} type="button">蜡珠</button></div></div>

          <div className={`scene-canvas thermalconduction-stage preset-${cameraPreset} ${metalHeated ? 'metal-heated' : ''} ${woodCompared ? 'wood-compared' : ''}`}>
            <div className="thermal-rig">
              <div className="thermal-burner" />
              <div className={`thermal-flame ${metalHeated ? 'active' : ''}`} />
              <div className="thermal-stand" />
              <div className="thermal-rod metal">
                <span className={metalHeated ? 'wax-bead bead-1 melted' : 'wax-bead bead-1'} />
                <span className={metalHeated ? 'wax-bead bead-2 melted' : 'wax-bead bead-2'} />
                <span className={woodCompared ? 'wax-bead bead-3 melted' : 'wax-bead bead-3'} />
              </div>
              <div className="thermal-rod wood">
                <span className={woodCompared ? 'wax-bead bead-1 warm' : 'wax-bead bead-1'} />
                <span className="wax-bead bead-2" />
                <span className="wax-bead bead-3" />
              </div>
              <div className={metalHeated ? 'heat-wave active' : 'heat-wave'} />
            </div>
          </div>

          <div className="observation-ribbon thermalconduction-observation-row"><article className={metalHeated ? 'observation-chip active' : 'observation-chip calm'}><strong>金属棒</strong><span>{metalHeated ? '金属棒上靠近热源的蜡珠更早融化。' : '先加热金属棒观察变化。'}</span></article><article className={woodCompared ? 'observation-chip active' : 'observation-chip calm'}><strong>木棒</strong><span>{woodCompared ? '木棒上的蜡珠变化较慢，不如金属明显。' : '再换木棒形成对照。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>导热结论</strong><span>{observationChoice === 'correct' ? '金属导热更快，木材导热较慢。' : '等待完成正确比较。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleMetal('metal')} type="button"><strong>先加热金属棒</strong><span>观察蜡珠先后融化变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleMetal('wood')} type="button"><strong>直接加热木棒</strong><span>错误演示：没有建立金属对照现象。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleWood('wood')} type="button"><strong>换木棒做对照</strong><span>比较蜡珠变化是否同样明显。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleWood('metal')} type="button"><strong>继续只看金属棒</strong><span>错误演示：无法形成材料对照。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“金属棒上的蜡珠更早融化脱落”</strong><span>这是本实验的正确比较结果。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“两种材料变化一样快”</strong><span>错误演示：忽略材料差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('reverse')} type="button"><strong>记录“木棒上的蜡珠更早脱落”</strong><span>错误演示：结果方向反了。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>金属通常比木材导热更快</strong><span>完整总结本实验规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('wood-faster')} type="button"><strong>木材导热比金属更快</strong><span>错误演示：与实验现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('same-speed')} type="button"><strong>两种材料导热速度完全相同</strong><span>错误演示：忽略材料差异。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{metalHeated ? '金属棒已加热' : '待加热金属棒'} / {woodCompared ? '木棒已对照' : '待对照木棒'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先对照再总结'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“热传导比较”升级成金属棒/木棒同台对照的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
