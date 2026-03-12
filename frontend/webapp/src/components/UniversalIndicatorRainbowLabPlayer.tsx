import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tray' | 'color';
type MaterialId = 'tray' | 'indicator' | 'acid' | 'alkali' | 'dropper';
type TimelineState = 'done' | 'current' | 'todo';

interface UniversalIndicatorRainbowLabPlayerProps {
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
  2: "建立初始体系",
  3: "加入酸碱梯度",
  4: "观察彩虹色阶",
  5: "总结颜色规律",
};

const stepPrompts: Record<StepId, string> = {
  1: "先识别色盘、通用指示剂、酸液、碱液和滴管。",
  2: "先建立含通用指示剂的初始体系。",
  3: "向不同杯中加入不同强度的酸碱，建立颜色梯度。",
  4: "观察是否形成由酸到碱的连续彩虹色阶。",
  5: "总结酸碱度变化与通用指示剂颜色变化的关系。",
};

const materialLabels: Record<MaterialId, string> = {
  "tray": "色盘",
  "indicator": "通用指示剂",
  "acid": "酸液",
  "alkali": "碱液",
  "dropper": "滴管",
};

const materialOrder: MaterialId[] = ["tray", "indicator", "acid", "alkali", "dropper"];
const cameraSceneLabels: Record<CameraPreset, string> = {
  "bench": "实验台总览",
  "tray": "色盘近景",
  "color": "色阶近景"
};
const prepareErrorMessages: Record<string, string> = {
  "single-cup": "要想形成彩虹色阶，需要多个位置呈现不同酸碱度。"
};
const triggerErrorMessages: Record<string, string> = {
  "same-addition": "不同杯需要不同酸碱度，才能形成连续彩虹色阶。"
};
const observeErrorMessages: Record<string, string> = {
  "one-color": "不同酸碱度会导致不同颜色，不会全部变成同一种。",
  "only-two": "通用指示剂的魅力就在于能呈现连续多色变化。"
};
const summaryErrorMessages: Record<string, string> = {
  "binary-only": "通用指示剂不是只有两种颜色，而是能呈现一系列连续变化。",
  "random-color": "颜色变化与酸碱度密切相关，并非随机。"
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

export function UniversalIndicatorRainbowLabPlayer({ experiment, onTelemetry }: UniversalIndicatorRainbowLabPlayerProps) {
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
  const [labNotes, setLabNotes] = useState<string[]>(["实验已载入：通过通用指示剂观察酸碱度彩虹变色。"]);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const effectValue = clamp(24 + (prepared ? 18 : 0) + (triggered ? 20 : 0) + (observed ? 24 : 0), 20, 99);
  const visualValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 28 : 0) + (summaryChoice === 'correct' ? 12 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 10 : 0) + (triggered ? 10 : 0) + (observed ? 14 : 0), 20, 100);
  const stageClassName = ['scene-canvas', 'indicatorrainbow-stage', 'preset-' + cameraPreset, prepared ? 'prepared' : '', triggered ? 'triggered' : '', observed ? 'observed' : ''].filter(Boolean).join(' ');

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
        setCameraPreset("tray");
        advanceStep(2, "器材识别完成，下一步准备含通用指示剂的初始体系。");
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
    appendNote("准备记录：通用指示剂初始体系已建立。");
    setCameraPreset("color");
    advanceStep(3, "初始体系已准备好，下一步加入酸碱梯度建立颜色变化。");
  };

  const handleTrigger = (choice: string) => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError("请先建立通用指示剂初始体系，再进入梯度步骤。");
      return;
    }
    if (choice !== 'correct') {
      markError(triggerErrorMessages[choice] ?? '请按当前步骤重新操作。');
      return;
    }
    setTriggered(true);
    appendNote("触发记录：酸碱梯度已加入，多杯颜色开始分化。");
    setCameraPreset("color");
    advanceStep(4, "颜色分化已启动，下一步判断是否形成连续彩虹序列。");
  };

  const handleObserve = (choice: string) => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!triggered) {
      markError("请先加入酸碱梯度，再进行颜色判断。");
      return;
    }
    if (choice !== 'correct') {
      markError(observeErrorMessages[choice] ?? '请重新核对观察结果。');
      return;
    }
    setObserved(true);
    appendNote("现象记录：已形成由酸到碱的连续彩虹色阶。");
    advanceStep(5, "彩虹色阶记录完成，下一步总结酸碱度与颜色关系。");
  };

  const handleSummary = (choice: string) => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice !== 'correct') {
      markError(summaryErrorMessages[choice] ?? '请根据实验现象重新总结。');
      return;
    }
    advanceStep(null, "总结正确：通用指示剂在不同酸碱度下会呈现连续变化的多种颜色。");
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
    setLabNotes(["实验已重置：重新观察通用指示剂彩虹变色。"]);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ["先准备含通用指示剂的初始体系。", "再加入不同强度的酸碱形成梯度。", "观察颜色是否形成连续彩虹变化。"]
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对关键现象。',
        "建议按“识别 → 建立初始体系 → 加入酸碱梯度 → 观察彩虹色阶 → 总结”的顺序重做。",
      ];

  return (
    <section className="panel playground-panel indicatorrainbow-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把通用指示剂在不同酸碱度下呈现的连续彩虹色阶做成更直观的专属化学实验页。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid indicatorrainbow-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraSceneLabels[cameraPreset]}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>色谱层次 {effectValue}</span><div className="chem-meter-bar"><i style={{ width: effectValue + '%' }} /></div></div><div className="chem-meter"><span>彩虹观感 {visualValue}</span><div className="chem-meter-bar"><i style={{ width: visualValue + '%' }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: readinessValue + '%' }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: score + '%' }} /></div></div></div></section><section className="info-card indicatorrainbow-data-card"><span className="eyebrow">Readout</span><h3>色卡读数板</h3><div className="generic-readout-grid indicatorrainbow-readout-grid">
              <article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>初始体系</span><strong>{prepared ? '已建立' : '--'}</strong><small>{prepared ? '通用指示剂初始体系已就位。' : '先建立初始体系。'}</small></article>
              <article className={observed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>彩虹色阶</span><strong>{observed ? '已形成' : '--'}</strong><small>{observed ? '连续彩虹色阶已形成。' : '等待观察彩虹色阶。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '连续变色' : '等待总结'}</strong><small>{'这个实验最适合一眼看懂酸碱度与颜色的关系。'}</small></article>
            </div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? "通用指示剂彩虹装置"} · 当前重点：{step <= 2 ? "建立通用指示剂初始体系" : step === 3 ? "加入酸碱梯度" : "判断彩虹色阶是否连续"}</small></div><div className="camera-actions">
              <button className={cameraPreset === "bench" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("bench")} type="button">实验台</button>
              <button className={cameraPreset === "tray" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("tray")} type="button">色盘</button>
              <button className={cameraPreset === "color" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("color")} type="button">色阶</button>
            </div></div><div className={stageClassName}>
            <div className="indicatorrainbow-rig">
              <div className="idr-bench-shadow" />
              <div className={observed ? 'idr-spectrum-halo active' : triggered ? 'idr-spectrum-halo active' : 'idr-spectrum-halo'} />
              <div className={prepared ? 'idr-tray active' : 'idr-tray'}>
                <div className="idr-tray-rim" />
                <div className="idr-tray-shadow" />
                <div className="idr-tray-gloss" />
                <div className={triggered ? 'idr-gradient-bridge active' : 'idr-gradient-bridge'} />
                <div className={observed ? 'idr-well one active red' : triggered ? 'idr-well one active orange' : prepared ? 'idr-well one active green' : 'idr-well one'}>
                  <span className="idr-well-rim" />
                  <span className={prepared ? 'idr-meniscus active' : 'idr-meniscus'} />
                  <span className="idr-well-surface" />
                  <span className="idr-well-gloss" />
                  <span className={triggered || observed ? 'idr-well-caustic active' : 'idr-well-caustic'} />
                </div>
                <div className={observed ? 'idr-well two active orange' : triggered ? 'idr-well two active yellow' : prepared ? 'idr-well two active green' : 'idr-well two'}>
                  <span className="idr-well-rim" />
                  <span className={prepared ? 'idr-meniscus active' : 'idr-meniscus'} />
                  <span className="idr-well-surface" />
                  <span className="idr-well-gloss" />
                  <span className={triggered || observed ? 'idr-well-caustic active' : 'idr-well-caustic'} />
                </div>
                <div className={observed ? 'idr-well three active yellow' : triggered ? 'idr-well three active green' : prepared ? 'idr-well three active green' : 'idr-well three'}>
                  <span className="idr-well-rim" />
                  <span className={prepared ? 'idr-meniscus active' : 'idr-meniscus'} />
                  <span className="idr-well-surface" />
                  <span className="idr-well-gloss" />
                  <span className={triggered || observed ? 'idr-well-caustic active' : 'idr-well-caustic'} />
                </div>
                <div className={observed ? 'idr-well four active blue' : triggered ? 'idr-well four active teal' : prepared ? 'idr-well four active green' : 'idr-well four'}>
                  <span className="idr-well-rim" />
                  <span className={prepared ? 'idr-meniscus active' : 'idr-meniscus'} />
                  <span className="idr-well-surface" />
                  <span className="idr-well-gloss" />
                  <span className={triggered || observed ? 'idr-well-caustic active' : 'idr-well-caustic'} />
                </div>
                <div className={observed ? 'idr-well five active purple' : triggered ? 'idr-well five active blue' : prepared ? 'idr-well five active green' : 'idr-well five'}>
                  <span className="idr-well-rim" />
                  <span className={prepared ? 'idr-meniscus active' : 'idr-meniscus'} />
                  <span className="idr-well-surface" />
                  <span className="idr-well-gloss" />
                  <span className={triggered || observed ? 'idr-well-caustic active' : 'idr-well-caustic'} />
                </div>
              </div>
              <div className={triggered ? 'idr-dropper acid active' : 'idr-dropper acid'}>
                <span className="idr-dropper-bulb" />
                <span className="idr-dropper-glass" />
                <span className={triggered ? 'idr-dropper-front acid active' : 'idr-dropper-front acid'} />
                <span className={triggered ? 'idr-drop acid active' : 'idr-drop acid'} />
              </div>
              <div className={triggered ? 'idr-dropper alkali active' : 'idr-dropper alkali'}>
                <span className="idr-dropper-bulb" />
                <span className="idr-dropper-glass" />
                <span className={triggered ? 'idr-dropper-front alkali active' : 'idr-dropper-front alkali'} />
                <span className={triggered ? 'idr-drop alkali active' : 'idr-drop alkali'} />
              </div>
            </div>
          </div>

          <div className="observation-ribbon indicatorrainbow-observation-row">
            <article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>准备</strong><span>{prepared ? '多杯初始体系已建立。' : '等待建立初始体系。'}</span></article>
            <article className={triggered ? 'observation-chip active' : 'observation-chip calm'}><strong>梯度</strong><span>{triggered ? '酸碱梯度已形成。' : '等待加入酸碱梯度。'}</span></article>
            <article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>彩虹</strong><span>{observed ? '连续色阶已清晰呈现。' : '等待完成彩虹观察。'}</span></article>
          </div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={'timeline-item ' + entry.state} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={note + '-' + index}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">
{step === 1 ? <>
                <button className="summary-choice generic-choice primary" key={"tray"} onClick={() => handleIdentify("tray")} type="button"><strong>识别 色盘</strong><span>{identifiedMaterials.includes("tray") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"indicator"} onClick={() => handleIdentify("indicator")} type="button"><strong>识别 通用指示剂</strong><span>{identifiedMaterials.includes("indicator") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"acid"} onClick={() => handleIdentify("acid")} type="button"><strong>识别 酸液</strong><span>{identifiedMaterials.includes("acid") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"alkali"} onClick={() => handleIdentify("alkali")} type="button"><strong>识别 碱液</strong><span>{identifiedMaterials.includes("alkali") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"dropper"} onClick={() => handleIdentify("dropper")} type="button"><strong>识别 滴管</strong><span>{identifiedMaterials.includes("dropper") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              </> : null}
{step === 2 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handlePrepare("correct")} type="button"><strong>在多个小杯中加入通用指示剂，建立统一初始状态</strong><span>为后续颜色梯度做准备。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handlePrepare("single-cup")} type="button"><strong>只留一杯后期待直接出现完整彩虹</strong><span>错误演示：缺少梯度载体。</span></button>
              </> : null}
{step === 3 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handleTrigger("correct")} type="button"><strong>向各杯加入不同强度的酸碱，建立颜色梯度</strong><span>进入多色分化阶段。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleTrigger("same-addition")} type="button"><strong>给所有杯加入完全相同的溶液后期待彩虹</strong><span>错误演示：难以形成梯度。</span></button>
              </> : null}
{step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve("correct")} type="button"><strong>记录“颜色形成由红橙黄绿蓝紫的连续梯度”</strong><span>这是本实验最典型的现象。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleObserve("one-color")} type="button"><strong>记录“所有杯最终都应当变成同一种颜色”</strong><span>错误演示：忽略梯度差异。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleObserve("only-two")} type="button"><strong>记录“最多只会出现两种颜色，没有连续变化”</strong><span>错误演示：忽略连续色阶。</span></button>
              </> : null}
{step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary("correct")} type="button"><strong>通用指示剂会因酸碱度不同呈现连续变化的多种颜色</strong><span>完整总结本实验结论。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleSummary("binary-only")} type="button"><strong>通用指示剂只有酸性和碱性两种颜色</strong><span>错误演示：把连续变化说成二元变化。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleSummary("random-color")} type="button"><strong>颜色变化完全随机，与酸碱度关系不大</strong><span>错误演示：否认颜色规律。</span></button>
              </> : null}
            </div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? "初始体系已建" : "初始体系待建"} / {observed ? "彩虹色阶已现" : "彩虹色阶待现"}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? "注意颜色不是只变一种，而是形成连续的多色序列。"}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“通用指示剂彩虹变色”升级成更有产品观感的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
