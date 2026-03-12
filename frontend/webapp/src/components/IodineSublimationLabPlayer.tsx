import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tube' | 'vapor';
type MaterialId = 'tube' | 'iodine' | 'burner' | 'cold-cap' | 'clamp';
type TimelineState = 'done' | 'current' | 'todo';

interface IodineSublimationLabPlayerProps {
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
  2: "建立试管装置",
  3: "加热产生紫气",
  4: "观察上端凝华",
  5: "总结相变特点",
};

const stepPrompts: Record<StepId, string> = {
  1: "先识别试管、碘晶体、酒精灯、冷却端和试管夹。",
  2: "在试管底部装入碘晶体，并建立上端冷却区域。",
  3: "缓慢加热，观察是否有紫色蒸气出现。",
  4: "继续观察试管上端是否重新出现深色晶体。",
  5: "总结碘升华和凝华的连续相变现象。",
};

const materialLabels: Record<MaterialId, string> = {
  "tube": "试管",
  "iodine": "碘晶体",
  "burner": "酒精灯",
  "cold-cap": "冷却端",
  "clamp": "试管夹",
};

const materialOrder: MaterialId[] = ["tube", "iodine", "burner", "cold-cap", "clamp"];
const cameraSceneLabels: Record<CameraPreset, string> = {
  "bench": "实验台总览",
  "tube": "试管近景",
  "vapor": "蒸气近景"
};
const prepareErrorMessages: Record<string, string> = {
  "no-cold-end": "应同时建立上端冷却区域，才能更直观看到凝华现象。"
};
const triggerErrorMessages: Record<string, string> = {
  "violent-flame": "应缓慢加热并观察紫色蒸气，而不是粗暴猛烧。"
};
const observeErrorMessages: Record<string, string> = {
  "only-vapor": "试管上端冷却区会重新凝华出晶体，不能忽略。",
  "turn-liquid": "本实验更典型的是上端重新析出深色晶体，而不是大量液滴。"
};
const summaryErrorMessages: Record<string, string> = {
  "melt-only": "本实验的亮点在于升华与凝华连续出现，不只是简单熔化。",
  "colorless-vapor": "碘升华时最典型的就是紫色蒸气，不能判为无色。"
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

export function IodineSublimationLabPlayer({ experiment, onTelemetry }: IodineSublimationLabPlayerProps) {
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
  const [labNotes, setLabNotes] = useState<string[]>(["实验已载入：通过加热与冷却观察碘的升华与凝华。"]);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const effectValue = clamp(24 + (prepared ? 18 : 0) + (triggered ? 20 : 0) + (observed ? 24 : 0), 20, 99);
  const visualValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 28 : 0) + (summaryChoice === 'correct' ? 12 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 10 : 0) + (triggered ? 10 : 0) + (observed ? 14 : 0), 20, 100);
  const stageClassName = ['scene-canvas', 'iodinesublimation-stage', 'preset-' + cameraPreset, prepared ? 'prepared' : '', triggered ? 'triggered' : '', observed ? 'observed' : ''].filter(Boolean).join(' ');

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
        setCameraPreset("tube");
        advanceStep(2, "器材识别完成，下一步装入碘晶体并建立冷端。");
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
    appendNote("准备记录：试管内碘晶体与冷端已准备好。");
    setCameraPreset("vapor");
    advanceStep(3, "装置已准备好，下一步加热观察紫色蒸气。");
  };

  const handleTrigger = (choice: string) => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError("请先建立装置，再进入加热步骤。");
      return;
    }
    if (choice !== 'correct') {
      markError(triggerErrorMessages[choice] ?? '请按当前步骤重新操作。');
      return;
    }
    setTriggered(true);
    appendNote("触发记录：加热后已出现明显紫色蒸气。");
    setCameraPreset("vapor");
    advanceStep(4, "蒸气现象已出现，下一步观察上端是否重新析出晶体。");
  };

  const handleObserve = (choice: string) => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!triggered) {
      markError("请先观察紫色蒸气，再进行下一步判断。");
      return;
    }
    if (choice !== 'correct') {
      markError(observeErrorMessages[choice] ?? '请重新核对观察结果。');
      return;
    }
    setObserved(true);
    appendNote("现象记录：试管上端已重新凝华出深色晶体。");
    advanceStep(5, "凝华现象记录完成，下一步总结碘的相变特点。");
  };

  const handleSummary = (choice: string) => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice !== 'correct') {
      markError(summaryErrorMessages[choice] ?? '请根据实验现象重新总结。');
      return;
    }
    advanceStep(null, "总结正确：碘受热可升华成紫色蒸气，冷却后又能凝华成晶体。");
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
    setLabNotes(["实验已重置：重新观察碘升华与凝华。"]);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ["先装好碘晶体并建立冷端。", "加热后注意看紫色蒸气。", "上端冷却区还会重新析出晶体。"]
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对关键现象。',
        "建议按“识别 → 建立装置 → 加热升华 → 观察凝华 → 总结”的顺序重做。",
      ];

  return (
    <section className="panel playground-panel iodinesublimation-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把紫色蒸气上升、上端重新凝华成晶体的过程做成更具有观赏性的专属化学实验页。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid iodinesublimation-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraSceneLabels[cameraPreset]}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>蒸气戏剧性 {effectValue}</span><div className="chem-meter-bar"><i style={{ width: effectValue + '%' }} /></div></div><div className="chem-meter"><span>凝华细节 {visualValue}</span><div className="chem-meter-bar"><i style={{ width: visualValue + '%' }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: readinessValue + '%' }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: score + '%' }} /></div></div></div></section><section className="info-card iodinesublimation-data-card"><span className="eyebrow">Readout</span><h3>相变读数板</h3><div className="generic-readout-grid iodinesublimation-readout-grid">
              <article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>试管装置</span><strong>{prepared ? '已建立' : '--'}</strong><small>{prepared ? '碘晶体与冷却端已就位。' : '先建立试管装置。'}</small></article>
              <article className={triggered ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>紫色蒸气</span><strong>{triggered ? '已出现' : '--'}</strong><small>{triggered ? '试管内已出现明显紫色蒸气。' : '等待观察蒸气。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '升华凝华' : '等待总结'}</strong><small>{'这类实验最迷人的地方是紫气上升后又在上端重新结晶。'}</small></article>
            </div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? "碘升华装置"} · 当前重点：{step <= 2 ? "装入碘晶体并建立冷端" : step === 3 ? "加热观察紫色蒸气" : "判断上端是否重新凝华"}</small></div><div className="camera-actions">
              <button className={cameraPreset === "bench" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("bench")} type="button">实验台</button>
              <button className={cameraPreset === "tube" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("tube")} type="button">试管</button>
              <button className={cameraPreset === "vapor" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("vapor")} type="button">蒸气</button>
            </div></div><div className={stageClassName}><div className="iodinesublimation-rig"><div className={prepared ? "ids-tube active" : "ids-tube"}><div className={prepared ? "ids-crystal active" : "ids-crystal"} /><div className={triggered ? "ids-vapor active" : "ids-vapor"} /><div className={observed ? "ids-deposit active" : "ids-deposit"} /></div><div className={triggered ? "ids-burner active" : "ids-burner"} /><div className={observed ? "ids-coldcap active" : "ids-coldcap"} /></div></div><div className="observation-ribbon iodinesublimation-observation-row">
            <article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>装置</strong><span>{prepared ? '试管与冷端已准备好。' : '等待建立试管装置。'}</span></article>
            <article className={triggered ? 'observation-chip active' : 'observation-chip calm'}><strong>升华</strong><span>{triggered ? '紫色蒸气已明显上升。' : '等待加热升华。'}</span></article>
            <article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>凝华</strong><span>{observed ? '上端已重新析出晶体。' : '等待完成凝华观察。'}</span></article>
          </div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={'timeline-item ' + entry.state} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={note + '-' + index}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">
{step === 1 ? <>
                <button className="summary-choice generic-choice primary" key="tube" onClick={() => handleIdentify("tube")} type="button"><strong>识别 试管</strong><span>{identifiedMaterials.includes("tube") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="iodine" onClick={() => handleIdentify("iodine")} type="button"><strong>识别 碘晶体</strong><span>{identifiedMaterials.includes("iodine") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="burner" onClick={() => handleIdentify("burner")} type="button"><strong>识别 酒精灯</strong><span>{identifiedMaterials.includes("burner") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="cold-cap" onClick={() => handleIdentify("cold-cap")} type="button"><strong>识别 冷却端</strong><span>{identifiedMaterials.includes("cold-cap") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="clamp" onClick={() => handleIdentify("clamp")} type="button"><strong>识别 试管夹</strong><span>{identifiedMaterials.includes("clamp") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              </> : null}
{step === 2 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handlePrepare("correct")} type="button"><strong>在试管底部装入碘晶体并建立冷却端</strong><span>为升华与凝华同时观察做准备。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handlePrepare("no-cold-end")} type="button"><strong>只装碘晶体，不设置冷却端</strong><span>错误演示：不利于观察凝华。</span></button>
              </> : null}
{step === 3 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handleTrigger("correct")} type="button"><strong>缓慢加热，观察紫色蒸气逐步上升</strong><span>进入明显的升华阶段。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleTrigger("violent-flame")} type="button"><strong>用大火猛烧并忽略蒸气过程</strong><span>错误演示：不利于稳定观察。</span></button>
              </> : null}
{step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve("correct")} type="button"><strong>记录“试管上端重新凝华出深色晶体”</strong><span>这是完整相变链条的重要证据。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleObserve("only-vapor")} type="button"><strong>记录“只会一直有紫气，不会重新成晶体”</strong><span>错误演示：忽略凝华。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleObserve("turn-liquid")} type="button"><strong>记录“紫气会先变成大量液滴再消失”</strong><span>错误演示：与本实验典型观察不符。</span></button>
              </> : null}
{step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary("correct")} type="button"><strong>碘受热升华成紫色蒸气，冷却后又凝华成晶体</strong><span>完整总结本实验结论。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleSummary("melt-only")} type="button"><strong>碘只是先熔化再蒸发，没有明显凝华</strong><span>错误演示：忽略凝华现象。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleSummary("colorless-vapor")} type="button"><strong>碘蒸气本身应当是无色的</strong><span>错误演示：与现象不符。</span></button>
              </> : null}
            </div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? "试管装置已建" : "试管装置待建"} / {observed ? "凝华晶体已现" : "凝华晶体待现"}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? "注意同时观察下端升华和上端凝华两个区域。"}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“碘升华与凝华”升级成更具相变观感的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
