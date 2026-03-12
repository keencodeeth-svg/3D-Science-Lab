import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'flask' | 'cross';
type MaterialId = 'flask' | 'thiosulfate' | 'acid' | 'crosscard' | 'timer';
type TimelineState = 'done' | 'current' | 'todo';

interface DisappearingCrossLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: "识别器材",
  2: "建立澄清体系",
  3: "加入酸液浑浊",
  4: "观察十字消失",
  5: "总结浑浊现象",
};

const stepPrompts: Record<StepId, string> = {
  1: "先识别锥形瓶、硫代硫酸钠溶液、酸液、十字卡片和计时器。",
  2: "先建立澄清反应体系，并把十字卡片置于下方。",
  3: "加入酸液，观察溶液是否逐步变浑浊。",
  4: "继续观察底部十字是否逐步看不清。",
  5: "总结溶液浑浊与十字消失之间的关系。",
};

const materialLabels: Record<MaterialId, string> = {
  "flask": "锥形瓶",
  "thiosulfate": "硫代硫酸钠溶液",
  "acid": "酸液",
  "crosscard": "十字卡片",
  "timer": "计时器",
};

const materialOrder: MaterialId[] = ["flask", "thiosulfate", "acid", "crosscard", "timer"];
const cameraSceneLabels: Record<CameraPreset, string> = {
  "bench": "实验台总览",
  "flask": "锥形瓶近景",
  "cross": "十字近景"
};
const prepareErrorMessages: Record<string, string> = {
  "no-card": "要观察十字消失，必须先把十字卡片放在瓶下。"
};
const triggerErrorMessages: Record<string, string> = {
  "water": "应加入酸液触发浑浊变化，而不是加清水。"
};
const observeErrorMessages: Record<string, string> = {
  "always-clear": "随着浑浊增强，底部十字会逐步被遮挡而看不清。",
  "bubble-only": "本实验的重点是浑浊遮挡十字，不是单纯看冒泡。"
};
const summaryErrorMessages: Record<string, string> = {
  "instant-black": "本实验更典型的是逐步浑浊，而不是瞬间纯黑。",
  "no-relationship": "十字变得看不清正是由于上方溶液逐步浑浊。"
};

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

export function DisappearingCrossLabPlayer({ experiment, onTelemetry }: DisappearingCrossLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [prepared, setPrepared] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [observed, setObserved] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(["实验已载入：通过溶液浑浊观察十字逐步消失。"]);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const effectValue = clamp(24 + (prepared ? 18 : 0) + (triggered ? 20 : 0) + (observed ? 24 : 0), 20, 99);
  const visualValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 28 : 0) + (summaryChoice === 'correct' ? 12 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 10 : 0) + (triggered ? 10 : 0) + (observed ? 14 : 0), 20, 100);
  const stageClassName = ['scene-canvas', 'disappearingcross-stage', 'preset-' + cameraPreset, prepared ? 'prepared' : '', triggered ? 'triggered' : '', observed ? 'observed' : ''].filter(Boolean).join(' ');

  const { reportReset } = useLabTelemetryReporter({ experiment, step, totalSteps: 5, score, errors, prompt, completed, stepLabels: stepTitles, onTelemetry });

  const appendNote = (note: string) => setLabNotes((current) => [note, ...current].slice(0, 6));
  const markError = (message: string) => {
    setErrors((current) => current + 1);
    setPromptTone('error');
    setPrompt(message);
    appendNote('错误修正：' + message);
  };
  const advanceStep = (nextStep: StepId | null, message: string) => {
    setPromptTone('success');
    setPrompt(message);
    if (nextStep === null) {
      setCompleted(true);
      appendNote('实验完成：' + experiment.feedback.successSummary);
      return;
    }
    setStep(nextStep);
    appendNote('步骤推进：进入「' + stepTitles[nextStep] + '」');
  };

  const handleIdentify = (materialId: MaterialId) => {
    if (step !== 1 || completed) return;
    setIdentifiedMaterials((current) => {
      if (current.includes(materialId)) return current;
      const next = [...current, materialId];
      appendNote('材料识别：' + materialLabels[materialId]);
      if (next.length === materialOrder.length) {
        setCameraPreset("flask");
        advanceStep(2, "器材识别完成，下一步建立澄清的反应体系。");
      } else {
        setPromptTone('success');
        setPrompt('已识别 ' + next.length + '/' + materialOrder.length + ' 个器材，请继续。');
      }
      return next;
    });
  };

  const handlePrepare = (choice: string) => {
    if (step !== 2 || completed) return;
    if (choice !== 'correct') {
      markError(prepareErrorMessages[choice] ?? '请按当前步骤重新操作。');
      return;
    }
    setPrepared(true);
    appendNote("准备记录：澄清溶液与十字卡片已准备好。");
    setCameraPreset("cross");
    advanceStep(3, "澄清体系已准备好，下一步加入酸触发浑浊。");
  };

  const handleTrigger = (choice: string) => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError("请先建立澄清反应体系，再进入加酸步骤。");
      return;
    }
    if (choice !== 'correct') {
      markError(triggerErrorMessages[choice] ?? '请按当前步骤重新操作。');
      return;
    }
    setTriggered(true);
    appendNote("触发记录：加入酸后溶液已开始明显浑浊。");
    setCameraPreset("cross");
    advanceStep(4, "浑浊过程已启动，下一步判断十字是否逐步消失。");
  };

  const handleObserve = (choice: string) => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!triggered) {
      markError("请先加入酸并让溶液开始浑浊，再进行观察判断。");
      return;
    }
    if (choice !== 'correct') {
      markError(observeErrorMessages[choice] ?? '请重新核对观察结果。');
      return;
    }
    setObserved(true);
    appendNote("现象记录：十字标记已逐步看不清。");
    advanceStep(5, "消失现象记录完成，下一步总结浑浊形成的影响。");
  };

  const handleSummary = (choice: string) => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice !== 'correct') {
      markError(summaryErrorMessages[choice] ?? '请根据实验现象重新总结。');
      return;
    }
    advanceStep(null, "总结正确：加入酸后生成浑浊体系，导致底部十字逐步看不清。");
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPrepared(false);
    setTriggered(false);
    setObserved(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(["实验已重置：重新观察十字消失实验。"]);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ["先建立澄清溶液与十字卡片。", "加酸后注意看溶液是否逐步变浑浊。", "继续观察底部十字是否逐步消失。"]
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对关键现象。',
        "建议按“识别 → 建立澄清体系 → 加酸浑浊 → 观察十字消失 → 总结”的顺序重做。",
      ];

  return (
    <section className="panel playground-panel disappearingcross-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把“十字逐步看不见”的浑浊过程做成更有层次、更适合课堂演示的专属化学实验页。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid disappearingcross-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraSceneLabels[cameraPreset]}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>浑浊速度 {effectValue}</span><div className="chem-meter-bar"><i style={{ width: effectValue + '%' }} /></div></div><div className="chem-meter"><span>观察冲击 {visualValue}</span><div className="chem-meter-bar"><i style={{ width: visualValue + '%' }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: readinessValue + '%' }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: score + '%' }} /></div></div></div></section><section className="info-card disappearingcross-data-card"><span className="eyebrow">Readout</span><h3>浑浊读数板</h3><div className="generic-readout-grid disappearingcross-readout-grid">
              <article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>澄清体系</span><strong>{prepared ? '已建立' : '--'}</strong><small>{prepared ? '澄清体系与十字卡片已准备好。' : '先建立澄清体系。'}</small></article>
              <article className={observed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>十字消失</span><strong>{observed ? '已出现' : '--'}</strong><small>{observed ? '底部十字已逐步看不清。' : '等待观察十字消失。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '浑浊遮挡' : '等待总结'}</strong><small>{'这个实验最妙的地方是能把“浑浊”直接变成可见证据。'}</small></article>
            </div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? "十字消失装置"} · 当前重点：{step <= 2 ? "建立澄清反应体系" : step === 3 ? "加酸触发浑浊" : "判断十字是否消失"}</small></div><div className="camera-actions">
              <button className={cameraPreset === "bench" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("bench")} type="button">实验台</button>
              <button className={cameraPreset === "flask" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("flask")} type="button">锥形瓶</button>
              <button className={cameraPreset === "cross" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("cross")} type="button">十字</button>
            </div></div><div className={stageClassName}><div className="disappearingcross-rig"><div className={prepared ? "dcr-card active" : "dcr-card"}><div className={observed ? "dcr-cross active hidden" : prepared ? "dcr-cross active" : "dcr-cross"} /></div><div className={prepared ? "dcr-flask active" : "dcr-flask"}><div className={observed ? "dcr-liquid active opaque" : triggered ? "dcr-liquid active cloudy" : prepared ? "dcr-liquid active" : "dcr-liquid"} /></div><div className={triggered ? "dcr-particles active" : "dcr-particles"} /><div className={prepared ? "dcr-timer active" : "dcr-timer"} /></div></div><div className="observation-ribbon disappearingcross-observation-row">
            <article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>准备</strong><span>{prepared ? '澄清体系与十字已就位。' : '等待建立澄清体系。'}</span></article>
            <article className={triggered ? 'observation-chip active' : 'observation-chip calm'}><strong>浑浊</strong><span>{triggered ? '溶液已开始逐步浑浊。' : '等待加酸浑浊。'}</span></article>
            <article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>消失</strong><span>{observed ? '十字已逐步被遮挡。' : '等待完成十字观察。'}</span></article>
          </div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={'timeline-item ' + entry.state} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={note + '-' + index}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">
{step === 1 ? <>
                <button className="summary-choice generic-choice primary" key={"flask"} onClick={() => handleIdentify("flask")} type="button"><strong>识别 锥形瓶</strong><span>{identifiedMaterials.includes("flask") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"thiosulfate"} onClick={() => handleIdentify("thiosulfate")} type="button"><strong>识别 硫代硫酸钠溶液</strong><span>{identifiedMaterials.includes("thiosulfate") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"acid"} onClick={() => handleIdentify("acid")} type="button"><strong>识别 酸液</strong><span>{identifiedMaterials.includes("acid") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"crosscard"} onClick={() => handleIdentify("crosscard")} type="button"><strong>识别 十字卡片</strong><span>{identifiedMaterials.includes("crosscard") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"timer"} onClick={() => handleIdentify("timer")} type="button"><strong>识别 计时器</strong><span>{identifiedMaterials.includes("timer") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              </> : null}
{step === 2 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handlePrepare("correct")} type="button"><strong>建立澄清溶液体系，并把十字卡片放在瓶下</strong><span>为后续消失观察做准备。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handlePrepare("no-card")} type="button"><strong>不放十字卡片直接等待“十字消失”</strong><span>错误演示：没有观察目标。</span></button>
              </> : null}
{step === 3 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handleTrigger("correct")} type="button"><strong>加入酸液，让澄清溶液逐步变浑浊</strong><span>进入遮挡增强阶段。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleTrigger("water")} type="button"><strong>改加清水后期待同样快速浑浊</strong><span>错误演示：缺少反应条件。</span></button>
              </> : null}
{step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve("correct")} type="button"><strong>记录“随着浑浊增强，底部十字逐步看不清”</strong><span>这是本实验最典型的观察结果。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleObserve("always-clear")} type="button"><strong>记录“无论多浑浊，十字都会始终很清楚”</strong><span>错误演示：与现象不符。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleObserve("bubble-only")} type="button"><strong>记录“重点只是冒泡，与十字无关”</strong><span>错误演示：抓错观察重点。</span></button>
              </> : null}
{step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary("correct")} type="button"><strong>加入酸后溶液逐步浑浊，导致底部十字逐渐消失</strong><span>完整总结本实验结论。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleSummary("instant-black")} type="button"><strong>溶液会瞬间变成纯黑色，所以十字看不见</strong><span>错误演示：夸大现象。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleSummary("no-relationship")} type="button"><strong>十字消失与溶液变化没有关系</strong><span>错误演示：否认观察逻辑。</span></button>
              </> : null}
            </div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? "澄清体系已建" : "澄清体系待建"} / {observed ? "十字消失已现" : "十字消失待现"}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? "注意观察的重点不是起泡，而是浑浊导致的遮挡。"}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“十字消失”升级成更具观察节奏感的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
