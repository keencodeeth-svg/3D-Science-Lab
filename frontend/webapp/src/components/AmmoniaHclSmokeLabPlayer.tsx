import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tube' | 'ring';
type MaterialId = 'tube' | 'ammonia' | 'hcl' | 'stand' | 'clamp';
type TimelineState = 'done' | 'current' | 'todo';

interface AmmoniaHclSmokeLabPlayerProps {
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
  2: "布置两端试剂",
  3: "启动相向扩散",
  4: "观察白烟环位置",
  5: "总结扩散快慢",
};

const stepPrompts: Record<StepId, string> = {
  1: "先识别扩散管、氨气端棉团、氯化氢端棉团、支架和夹具。",
  2: "把两端试剂规范布置在扩散管两端。",
  3: "让两股气体沿管内相向扩散。",
  4: "观察白烟环出现的位置更靠近哪一端。",
  5: "总结白烟环位置所反映的扩散快慢差异。",
};

const materialLabels: Record<MaterialId, string> = {
  "tube": "扩散管",
  "ammonia": "氨气端棉团",
  "hcl": "氯化氢端棉团",
  "stand": "支架",
  "clamp": "夹具",
};

const materialOrder: MaterialId[] = ["tube", "ammonia", "hcl", "stand", "clamp"];
const cameraSceneLabels: Record<CameraPreset, string> = {
  "bench": "实验台总览",
  "tube": "扩散管近景",
  "ring": "白烟环近景"
};
const prepareErrorMessages: Record<string, string> = {
  "one-side": "白烟环需要两端气体相向扩散并相遇，不能只布置一端。"
};
const triggerErrorMessages: Record<string, string> = {
  "shake": "应让两股气体自然扩散相遇，不要通过猛烈摇晃破坏观察。"
};
const observeErrorMessages: Record<string, string> = {
  "middle": "白烟环通常不会正好在中间，而是更靠近氯化氢一端。",
  "near-ammonia": "由于氨气扩散更快，白烟环应更靠近氯化氢一端。"
};
const summaryErrorMessages: Record<string, string> = {
  "same-speed": "白烟环位置恰好说明两种气体扩散快慢并不相同。",
  "hcl-faster": "白烟环更靠近氯化氢端，反而说明氨气扩散得更快。"
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

export function AmmoniaHclSmokeLabPlayer({ experiment, onTelemetry }: AmmoniaHclSmokeLabPlayerProps) {
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
  const [labNotes, setLabNotes] = useState<string[]>(["实验已载入：通过氨气与氯化氢扩散观察白烟环。"]);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const effectValue = clamp(24 + (prepared ? 18 : 0) + (triggered ? 20 : 0) + (observed ? 24 : 0), 20, 99);
  const visualValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 28 : 0) + (summaryChoice === 'correct' ? 12 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 10 : 0) + (triggered ? 10 : 0) + (observed ? 14 : 0), 20, 100);
  const stageClassName = ['scene-canvas', 'ammoniahclsmoke-stage', 'preset-' + cameraPreset, prepared ? 'prepared' : '', triggered ? 'triggered' : '', observed ? 'observed' : ''].filter(Boolean).join(' ');

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
        advanceStep(2, "器材识别完成，下一步把氨气端和氯化氢端同时布置好。");
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
    appendNote("准备记录：扩散管两端试剂已布置完成。");
    setCameraPreset("tube");
    advanceStep(3, "两端已就位，下一步让两种气体沿管内扩散相遇。");
  };

  const handleTrigger = (choice: string) => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError("请先布置扩散管两端试剂，再进入扩散步骤。");
      return;
    }
    if (choice !== 'correct') {
      markError(triggerErrorMessages[choice] ?? '请按当前步骤重新操作。');
      return;
    }
    setTriggered(true);
    appendNote("触发记录：管内两股气体已开始相向扩散。");
    setCameraPreset("ring");
    advanceStep(4, "扩散已开始，下一步判断白烟环出现的位置。");
  };

  const handleObserve = (choice: string) => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!triggered) {
      markError("请先启动两端扩散，再进行位置判断。");
      return;
    }
    if (choice !== 'correct') {
      markError(observeErrorMessages[choice] ?? '请重新核对观察结果。');
      return;
    }
    setObserved(true);
    appendNote("现象记录：已观察到白烟环更靠近氯化氢一端。");
    advanceStep(5, "白烟环位置已记录，下一步总结扩散快慢差异。");
  };

  const handleSummary = (choice: string) => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice !== 'correct') {
      markError(summaryErrorMessages[choice] ?? '请根据实验现象重新总结。');
      return;
    }
    advanceStep(null, "总结正确：氨气扩散更快，因此白烟环更靠近氯化氢一端。");
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
    setLabNotes(["实验已重置：重新观察氨气与氯化氢白烟环。"]);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ["先把扩散管两端试剂布置好。", "让两种气体沿管内相向扩散。", "观察白烟环更靠近哪一端。"]
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对关键现象。',
        "建议按“识别 → 布置两端 → 启动扩散 → 判断白烟环位置 → 总结”的顺序重做。",
      ];

  return (
    <section className="panel playground-panel ammoniahclsmoke-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把扩散管中的白烟环生成过程做成更有空间感、更适合课堂演示的专属化学实验页。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid ammoniahclsmoke-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraSceneLabels[cameraPreset]}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>白烟强度 {effectValue}</span><div className="chem-meter-bar"><i style={{ width: effectValue + '%' }} /></div></div><div className="chem-meter"><span>扩散观感 {visualValue}</span><div className="chem-meter-bar"><i style={{ width: visualValue + '%' }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: readinessValue + '%' }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: score + '%' }} /></div></div></div></section><section className="info-card ammoniahclsmoke-data-card"><span className="eyebrow">Readout</span><h3>扩散读数板</h3><div className="generic-readout-grid ammoniahclsmoke-readout-grid">
              <article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>两端试剂</span><strong>{prepared ? '已布置' : '--'}</strong><small>{prepared ? '扩散管两端试剂已就位。' : '先布置两端试剂。'}</small></article>
              <article className={observed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>白烟环</span><strong>{observed ? '已出现' : '--'}</strong><small>{observed ? '白烟环已出现在靠近氯化氢的一侧。' : '等待观察白烟环。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '氨气更快' : '等待总结'}</strong><small>{'白烟环最适合用来演示不同气体扩散快慢。'}</small></article>
            </div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? "白烟环扩散装置"} · 当前重点：{step <= 2 ? "布置扩散管两端" : step === 3 ? "启动相向扩散" : "判断白烟环位置"}</small></div><div className="camera-actions">
              <button className={cameraPreset === "bench" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("bench")} type="button">实验台</button>
              <button className={cameraPreset === "tube" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("tube")} type="button">扩散管</button>
              <button className={cameraPreset === "ring" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("ring")} type="button">白烟环</button>
            </div></div><div className={stageClassName}>
            <div className="ammoniahclsmoke-rig">
              <div className="ahs-bench-shadow" />
              <div className={prepared ? "ahs-stand active" : "ahs-stand"}>
                <span className="ahs-stand-clamp" />
              </div>
              <div className={prepared ? "ahs-tube active" : "ahs-tube"}>
                <div className="ahs-tube-rim" />
                <div className="ahs-tube-gloss" />
                <div className={prepared ? "ahs-plug left active" : "ahs-plug left"}>
                  <span className="ahs-plug-fiber" />
                </div>
                <div className={prepared ? "ahs-plug right active" : "ahs-plug right"}>
                  <span className="ahs-plug-fiber" />
                </div>
                <div className={triggered ? "ahs-mist left active" : "ahs-mist left"}>
                  <span className="ahs-mist-core" />
                </div>
                <div className={triggered ? "ahs-mist right active" : "ahs-mist right"}>
                  <span className="ahs-mist-core" />
                </div>
                <div className={triggered ? 'ahs-diffusion-front active' : 'ahs-diffusion-front'} />
                <div className={observed ? "ahs-ring active" : "ahs-ring"}>
                  <span className={observed ? 'ahs-ring-cloud active' : 'ahs-ring-cloud'} />
                </div>
              </div>
              <div className={prepared ? 'ahs-reagent left active' : 'ahs-reagent left'}>
                <span className="ahs-reagent-cap" />
                <span className="ahs-reagent-fill left" />
              </div>
              <div className={prepared ? 'ahs-reagent right active' : 'ahs-reagent right'}>
                <span className="ahs-reagent-cap" />
                <span className="ahs-reagent-fill right" />
              </div>
            </div>
          </div>

          <div className="observation-ribbon ammoniahclsmoke-observation-row">
            <article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>布置</strong><span>{prepared ? '两端试剂已布置完成。' : '等待布置两端。'}</span></article>
            <article className={triggered ? 'observation-chip active' : 'observation-chip calm'}><strong>扩散</strong><span>{triggered ? '两股气体已相向扩散。' : '等待启动扩散。'}</span></article>
            <article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>白烟</strong><span>{observed ? '白烟环位置已被判断。' : '等待判断白烟环。'}</span></article>
          </div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={'timeline-item ' + entry.state} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={note + '-' + index}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">
{step === 1 ? <>
                <button className="summary-choice generic-choice primary" key={"tube"} onClick={() => handleIdentify("tube")} type="button"><strong>识别 扩散管</strong><span>{identifiedMaterials.includes("tube") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"ammonia"} onClick={() => handleIdentify("ammonia")} type="button"><strong>识别 氨气端棉团</strong><span>{identifiedMaterials.includes("ammonia") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"hcl"} onClick={() => handleIdentify("hcl")} type="button"><strong>识别 氯化氢端棉团</strong><span>{identifiedMaterials.includes("hcl") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"stand"} onClick={() => handleIdentify("stand")} type="button"><strong>识别 支架</strong><span>{identifiedMaterials.includes("stand") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"clamp"} onClick={() => handleIdentify("clamp")} type="button"><strong>识别 夹具</strong><span>{identifiedMaterials.includes("clamp") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              </> : null}
{step === 2 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handlePrepare("correct")} type="button"><strong>把氨气端和氯化氢端同时布置到扩散管两端</strong><span>建立相向扩散条件。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handlePrepare("one-side")} type="button"><strong>只布置一端试剂后等待白烟环出现</strong><span>错误演示：无法形成相遇区。</span></button>
              </> : null}
{step === 3 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handleTrigger("correct")} type="button"><strong>让两股气体沿管内同时相向扩散</strong><span>进入白烟生成阶段。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleTrigger("shake")} type="button"><strong>猛烈摇晃扩散管后期待更稳定白烟环</strong><span>错误演示：不利于观察位置。</span></button>
              </> : null}
{step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve("correct")} type="button"><strong>记录“白烟环更靠近氯化氢一端”</strong><span>这是本实验最关键的判断。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleObserve("middle")} type="button"><strong>记录“白烟环一定正好出现在正中间”</strong><span>错误演示：忽略扩散速率差异。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleObserve("near-ammonia")} type="button"><strong>记录“白烟环更靠近氨气一端”</strong><span>错误演示：方向判断错误。</span></button>
              </> : null}
{step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary("correct")} type="button"><strong>氨气扩散更快，所以白烟环更靠近氯化氢一端</strong><span>完整总结本实验结论。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleSummary("same-speed")} type="button"><strong>两种气体扩散一样快，所以位置没有意义</strong><span>错误演示：忽略扩散差异。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleSummary("hcl-faster")} type="button"><strong>白烟环靠近氯化氢端说明氯化氢扩散更快</strong><span>错误演示：因果判断错误。</span></button>
              </> : null}
            </div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? "两端试剂已布置" : "两端试剂待布置"} / {observed ? "白烟环已出现" : "白烟环待出现"}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? "注意白烟环通常更靠近氯化氢一端。"}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“氨气与氯化氢白烟环”升级成更具空间扩散感的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
