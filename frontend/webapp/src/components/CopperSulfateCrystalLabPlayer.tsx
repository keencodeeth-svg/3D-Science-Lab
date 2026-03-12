import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beaker' | 'crystal';
type MaterialId = 'beaker' | 'cuso4' | 'burner' | 'thread' | 'seed';
type TimelineState = 'done' | 'current' | 'todo';

interface CopperSulfateCrystalLabPlayerProps {
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
  2: "配制热饱和液",
  3: "悬挂晶种冷却",
  4: "观察蓝晶体生长",
  5: "总结结晶条件",
};

const stepPrompts: Record<StepId, string> = {
  1: "先识别烧杯、硫酸铜溶液、酒精灯、悬线和晶种。",
  2: "先配制热饱和蓝色溶液。",
  3: "把晶种悬挂在冷却中的溶液中，启动结晶。",
  4: "观察晶种附近是否逐步长出明显蓝晶体。",
  5: "总结热饱和溶液冷却析晶的条件。",
};

const materialLabels: Record<MaterialId, string> = {
  "beaker": "烧杯",
  "cuso4": "硫酸铜溶液",
  "burner": "酒精灯",
  "thread": "悬线",
  "seed": "晶种",
};

const materialOrder: MaterialId[] = ["beaker", "cuso4", "burner", "thread", "seed"];
const cameraSceneLabels: Record<CameraPreset, string> = {
  "bench": "实验台总览",
  "beaker": "烧杯近景",
  "crystal": "晶体近景"
};
const prepareErrorMessages: Record<string, string> = {
  "cold-start": "应先建立热饱和溶液，再通过冷却观察典型蓝晶体生长。"
};
const triggerErrorMessages: Record<string, string> = {
  "drop-seed": "悬挂晶种更利于观察蓝晶体的清晰生长。"
};
const observeErrorMessages: Record<string, string> = {
  "no-growth": "热饱和溶液冷却后会出现晶体生长，不能判为完全无变化。",
  "white-crystal": "硫酸铜结晶最典型的是蓝色晶体，不是白色。"
};
const summaryErrorMessages: Record<string, string> = {
  "evap-only": "除了蒸发，热饱和溶液冷却也能析出晶体。",
  "seed-useless": "晶种能够为晶体生长提供更直观的起点。"
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

export function CopperSulfateCrystalLabPlayer({ experiment, onTelemetry }: CopperSulfateCrystalLabPlayerProps) {
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
  const [labNotes, setLabNotes] = useState<string[]>(["实验已载入：通过热饱和溶液冷却观察硫酸铜蓝晶体生长。"]);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const effectValue = clamp(24 + (prepared ? 18 : 0) + (triggered ? 20 : 0) + (observed ? 24 : 0), 20, 99);
  const visualValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 28 : 0) + (summaryChoice === 'correct' ? 12 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 10 : 0) + (triggered ? 10 : 0) + (observed ? 14 : 0), 20, 100);
  const stageClassName = ['scene-canvas', 'coppersulfatecrystal-stage', 'preset-' + cameraPreset, prepared ? 'prepared' : '', triggered ? 'triggered' : '', observed ? 'observed' : ''].filter(Boolean).join(' ');

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
        setCameraPreset("beaker");
        advanceStep(2, "器材识别完成，下一步配制热饱和硫酸铜溶液。");
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
    appendNote("准备记录：热饱和蓝色溶液已建立。");
    setCameraPreset("crystal");
    advanceStep(3, "热饱和体系已准备好，下一步悬挂晶种进行冷却结晶。");
  };

  const handleTrigger = (choice: string) => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError("请先建立热饱和蓝色溶液，再进入结晶步骤。");
      return;
    }
    if (choice !== 'correct') {
      markError(triggerErrorMessages[choice] ?? '请按当前步骤重新操作。');
      return;
    }
    setTriggered(true);
    appendNote("触发记录：晶种已悬挂到冷却中的蓝色溶液中。");
    setCameraPreset("crystal");
    advanceStep(4, "结晶过程已启动，下一步观察蓝晶体是否继续长大。");
  };

  const handleObserve = (choice: string) => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!triggered) {
      markError("请先悬挂晶种启动结晶，再进行观察判断。");
      return;
    }
    if (choice !== 'correct') {
      markError(observeErrorMessages[choice] ?? '请重新核对观察结果。');
      return;
    }
    setObserved(true);
    appendNote("现象记录：已观察到明显蓝色晶体生长。");
    advanceStep(5, "晶体生长记录完成，下一步总结结晶条件。");
  };

  const handleSummary = (choice: string) => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice !== 'correct') {
      markError(summaryErrorMessages[choice] ?? '请根据实验现象重新总结。');
      return;
    }
    advanceStep(null, "总结正确：热饱和硫酸铜溶液冷却后会析出蓝色晶体，晶种有助于定向生长。");
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
    setLabNotes(["实验已重置：重新观察硫酸铜蓝晶体。"]);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ["先配制热饱和蓝色溶液。", "冷却时把晶种悬挂到溶液中。", "观察蓝色晶体是否逐步长大。"]
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对关键现象。',
        "建议按“识别 → 配制热饱和溶液 → 悬挂晶种 → 观察蓝晶体 → 总结”的顺序重做。",
      ];

  return (
    <section className="panel playground-panel coppersulfatecrystal-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把热饱和蓝色溶液冷却析晶的过程做成更有材质感、更适合课堂展示的专属实验页。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid coppersulfatecrystal-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraSceneLabels[cameraPreset]}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>晶体生长 {effectValue}</span><div className="chem-meter-bar"><i style={{ width: effectValue + '%' }} /></div></div><div className="chem-meter"><span>蓝色质感 {visualValue}</span><div className="chem-meter-bar"><i style={{ width: visualValue + '%' }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: readinessValue + '%' }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: score + '%' }} /></div></div></div></section><section className="info-card coppersulfatecrystal-data-card"><span className="eyebrow">Readout</span><h3>晶体读数板</h3><div className="generic-readout-grid coppersulfatecrystal-readout-grid">
              <article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>热饱和液</span><strong>{prepared ? '已建立' : '--'}</strong><small>{prepared ? '热饱和蓝色溶液已准备好。' : '先建立热饱和溶液。'}</small></article>
              <article className={observed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>蓝晶体</span><strong>{observed ? '已生长' : '--'}</strong><small>{observed ? '已观察到明显蓝晶体生长。' : '等待观察晶体。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '冷却析晶' : '等待总结'}</strong><small>{'这类实验最迷人的地方是蓝晶体会一点点长出来。'}</small></article>
            </div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? "硫酸铜结晶装置"} · 当前重点：{step <= 2 ? "建立热饱和蓝色溶液" : step === 3 ? "悬挂晶种启动结晶" : "判断蓝晶体生长"}</small></div><div className="camera-actions">
              <button className={cameraPreset === "bench" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("bench")} type="button">实验台</button>
              <button className={cameraPreset === "beaker" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("beaker")} type="button">烧杯</button>
              <button className={cameraPreset === "crystal" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("crystal")} type="button">晶体</button>
            </div></div><div className={stageClassName}><div className="coppersulfatecrystal-rig"><div className={prepared ? "csc-beaker active" : "csc-beaker"}><div className={observed ? "csc-liquid active deep" : prepared ? "csc-liquid active" : "csc-liquid"} /><div className={triggered ? "csc-thread active" : "csc-thread"}><div className={triggered ? "csc-seed active" : "csc-seed"} /><div className={observed ? "csc-crystal active" : "csc-crystal"} /></div></div><div className={prepared ? "csc-burner active" : "csc-burner"} /><div className={prepared ? "csc-bottle active" : "csc-bottle"} /></div></div><div className="observation-ribbon coppersulfatecrystal-observation-row">
            <article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>配液</strong><span>{prepared ? '热饱和蓝液已建立。' : '等待建立热饱和液。'}</span></article>
            <article className={triggered ? 'observation-chip active' : 'observation-chip calm'}><strong>晶种</strong><span>{triggered ? '晶种已悬挂到位。' : '等待悬挂晶种。'}</span></article>
            <article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>生长</strong><span>{observed ? '蓝晶体已明显生长。' : '等待完成生长观察。'}</span></article>
          </div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={'timeline-item ' + entry.state} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={note + '-' + index}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">
{step === 1 ? <>
                <button className="summary-choice generic-choice primary" key={"beaker"} onClick={() => handleIdentify("beaker")} type="button"><strong>识别 烧杯</strong><span>{identifiedMaterials.includes("beaker") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"cuso4"} onClick={() => handleIdentify("cuso4")} type="button"><strong>识别 硫酸铜溶液</strong><span>{identifiedMaterials.includes("cuso4") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"burner"} onClick={() => handleIdentify("burner")} type="button"><strong>识别 酒精灯</strong><span>{identifiedMaterials.includes("burner") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"thread"} onClick={() => handleIdentify("thread")} type="button"><strong>识别 悬线</strong><span>{identifiedMaterials.includes("thread") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"seed"} onClick={() => handleIdentify("seed")} type="button"><strong>识别 晶种</strong><span>{identifiedMaterials.includes("seed") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              </> : null}
{step === 2 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handlePrepare("correct")} type="button"><strong>加热并建立清澈的热饱和蓝色溶液</strong><span>为后续析晶提供条件。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handlePrepare("cold-start")} type="button"><strong>不加热直接用冷稀溶液等待大晶体</strong><span>错误演示：不利于形成典型结晶。</span></button>
              </> : null}
{step === 3 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handleTrigger("correct")} type="button"><strong>把晶种悬挂到冷却中的蓝色溶液里</strong><span>启动定向结晶。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleTrigger("drop-seed")} type="button"><strong>把晶种直接乱丢在杯底后等待整齐生长</strong><span>错误演示：不利于展示晶体外形。</span></button>
              </> : null}
{step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve("correct")} type="button"><strong>记录“晶种附近逐步长出明显蓝色晶体”</strong><span>这是本实验最典型的现象。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleObserve("no-growth")} type="button"><strong>记录“冷却后完全不会出现明显晶体”</strong><span>错误演示：忽略析晶。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleObserve("white-crystal")} type="button"><strong>记录“析出的应是白色晶体”</strong><span>错误演示：颜色判断错误。</span></button>
              </> : null}
{step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary("correct")} type="button"><strong>热饱和硫酸铜溶液冷却后析出蓝晶体，晶种可引导生长</strong><span>完整总结本实验结论。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleSummary("evap-only")} type="button"><strong>只有把水全部蒸干才会得到蓝晶体</strong><span>错误演示：忽略冷却结晶。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleSummary("seed-useless")} type="button"><strong>晶种对晶体生长没有任何帮助</strong><span>错误演示：忽略晶种作用。</span></button>
              </> : null}
            </div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? "热饱和体系已建" : "热饱和体系待建"} / {observed ? "蓝晶体已现" : "蓝晶体待现"}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? "注意既要观察蓝色溶液，也要观察晶种附近的晶体生长。"}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“硫酸铜蓝晶体”升级成更具材质观感的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
