import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'dish' | 'color';
type MaterialId = 'dish' | 'cobalt' | 'burner' | 'sprayer' | 'stand';
type TimelineState = 'done' | 'current' | 'todo';

interface CobaltChlorideCycleLabPlayerProps {
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
  2: "准备粉红体系",
  3: "加热后变蓝",
  4: "加水后回粉",
  5: "总结可逆变色",
};

const stepPrompts: Record<StepId, string> = {
  1: "先识别表面皿、氯化钴样品、酒精灯、滴管和支架。",
  2: "先准备含结晶水的粉红色起始体系。",
  3: "加热样品，观察是否由粉红色转为蓝色。",
  4: "滴加少量水，判断是否由蓝重新恢复粉红。",
  5: "总结失水与再水合带来的可逆变色。",
};

const materialLabels: Record<MaterialId, string> = {
  "dish": "表面皿",
  "cobalt": "氯化钴样品",
  "burner": "酒精灯",
  "sprayer": "加水滴管",
  "stand": "实验支架",
};

const materialOrder: MaterialId[] = ["dish", "cobalt", "burner", "sprayer", "stand"];
const cameraSceneLabels: Record<CameraPreset, string> = {
  "bench": "实验台总览",
  "dish": "样品近景",
  "color": "变色近景"
};
const prepareErrorMessages: Record<string, string> = {
  "dry-blue": "本实验应先建立含结晶水的粉红色起始状态。"
};
const triggerErrorMessages: Record<string, string> = {
  "spray-first": "应先加热观察变蓝，再通过加水看是否回粉。"
};
const observeErrorMessages: Record<string, string> = {
  "stay-blue": "加水后样品会重新回到粉红色，不能判为始终蓝色。",
  "black-char": "氯化钴可逆变色的典型现象是粉红与蓝色转换，不是炭化变黑。"
};
const summaryErrorMessages: Record<string, string> = {
  "permanent-blue": "氯化钴的蓝粉变化是可逆的，不是永久变化。",
  "temperature-only": "本实验核心在失水与再水合，不只是单纯温度变化。"
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

export function CobaltChlorideCycleLabPlayer({ experiment, onTelemetry }: CobaltChlorideCycleLabPlayerProps) {
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
  const [labNotes, setLabNotes] = useState<string[]>(["实验已载入：通过加热与加水观察氯化钴可逆变色。"]);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const effectValue = clamp(24 + (prepared ? 18 : 0) + (triggered ? 20 : 0) + (observed ? 24 : 0), 20, 99);
  const visualValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 28 : 0) + (summaryChoice === 'correct' ? 12 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 10 : 0) + (triggered ? 10 : 0) + (observed ? 14 : 0), 20, 100);
  const stageClassName = ['scene-canvas', 'cobaltchloridecycle-stage', 'preset-' + cameraPreset, prepared ? 'prepared' : '', triggered ? 'triggered' : '', observed ? 'observed' : ''].filter(Boolean).join(' ');

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
        setCameraPreset("dish");
        advanceStep(2, "器材识别完成，下一步准备含氯化钴的起始体系。");
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
    appendNote("准备记录：粉红色起始体系已准备好。");
    setCameraPreset("color");
    advanceStep(3, "起始体系已准备好，下一步加热观察是否变蓝。");
  };

  const handleTrigger = (choice: string) => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError("请先准备起始体系，再进行加热触发。");
      return;
    }
    if (choice !== 'correct') {
      markError(triggerErrorMessages[choice] ?? '请按当前步骤重新操作。');
      return;
    }
    setTriggered(true);
    appendNote("触发记录：加热后体系已由粉红变为蓝色。");
    setCameraPreset("color");
    advanceStep(4, "颜色变化已触发，下一步判断加水后是否恢复粉红。");
  };

  const handleObserve = (choice: string) => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!triggered) {
      markError("请先完成加热变蓝，再进行观察判断。");
      return;
    }
    if (choice !== 'correct') {
      markError(observeErrorMessages[choice] ?? '请重新核对观察结果。');
      return;
    }
    setObserved(true);
    appendNote("现象记录：加水后体系已重新恢复粉红色。");
    advanceStep(5, "回色现象记录完成，下一步总结可逆变色机理。");
  };

  const handleSummary = (choice: string) => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice !== 'correct') {
      markError(summaryErrorMessages[choice] ?? '请根据实验现象重新总结。');
      return;
    }
    advanceStep(null, "总结正确：氯化钴可因失水和再水合发生蓝粉可逆变色。");
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
    setLabNotes(["实验已重置：重新观察氯化钴可逆变色。"]);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ["先准备粉红色起始体系。", "加热后注意观察是否转为蓝色。", "加水后再看是否恢复粉红。"]
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对关键现象。',
        "建议按“识别 → 准备粉红体系 → 加热变蓝 → 加水回粉 → 总结”的顺序重做。",
      ];

  return (
    <section className="panel playground-panel cobaltchloridecycle-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把氯化钴由粉红到蓝色、再遇水回粉红的可逆变化做成更直观的专属化学演示页。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid cobaltchloridecycle-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraSceneLabels[cameraPreset]}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>变色反差 {effectValue}</span><div className="chem-meter-bar"><i style={{ width: effectValue + '%' }} /></div></div><div className="chem-meter"><span>可逆演示 {visualValue}</span><div className="chem-meter-bar"><i style={{ width: visualValue + '%' }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: readinessValue + '%' }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: score + '%' }} /></div></div></div></section><section className="info-card cobaltchloridecycle-data-card"><span className="eyebrow">Readout</span><h3>变色读数板</h3><div className="generic-readout-grid cobaltchloridecycle-readout-grid">
              <article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>起始颜色</span><strong>{prepared ? '粉红' : '--'}</strong><small>{prepared ? '含结晶水的粉红样品已就位。' : '先准备粉红起始体系。'}</small></article>
              <article className={observed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>可逆回色</span><strong>{observed ? '已回粉' : '--'}</strong><small>{observed ? '已完成粉红→蓝→粉红循环。' : '等待观察回粉现象。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '失水再水合' : '等待总结'}</strong><small>{'蓝粉切换最适合拿来做可逆变色演示。'}</small></article>
            </div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? "氯化钴变色装置"} · 当前重点：{step <= 2 ? "建立粉红起始体系" : step === 3 ? "加热变蓝" : "判断加水后是否回粉"}</small></div><div className="camera-actions">
              <button className={cameraPreset === "bench" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("bench")} type="button">实验台</button>
              <button className={cameraPreset === "dish" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("dish")} type="button">样品</button>
              <button className={cameraPreset === "color" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("color")} type="button">变色</button>
            </div></div><div className={stageClassName}>
            <div className="cobaltchloridecycle-rig">
              <div className="cbc-bench-shadow" />
              <div className={prepared ? "cbc-dish active" : "cbc-dish"}>
                <div className="cbc-dish-rim" />
                <div className="cbc-dish-shadow" />
                <div className={observed ? "cbc-paper active pink" : triggered ? "cbc-paper active blue" : "cbc-paper active pink"}>
                  <span className="cbc-paper-fiber" />
                  <span className="cbc-paper-sheen" />
                  <span className={triggered ? "cbc-heat-halo active" : "cbc-heat-halo"} />
                  <span className={triggered ? 'cbc-heat-front active' : 'cbc-heat-front'} />
                  <span className={observed ? "cbc-moisture-front active" : "cbc-moisture-front"} />
                  <span className={observed ? 'cbc-moisture-droplets active' : 'cbc-moisture-droplets'} />
                </div>
              </div>
              <div className={triggered ? "cbc-burner active" : "cbc-burner"}>
                <span className="cbc-burner-neck" />
                <span className="cbc-burner-glow" />
                <span className="cbc-flame-core" />
              </div>
              <div className={observed ? "cbc-spray active" : "cbc-spray"}>
                <span className={observed ? 'cbc-spray-plume active' : 'cbc-spray-plume'} />
              </div>
              <div className={observed ? "cbc-spray-bottle active" : "cbc-spray-bottle"}>
                <span className="cbc-spray-label" />
              </div>
              <div className={triggered ? "cbc-vapor active" : "cbc-vapor"}>
                <span className={triggered ? 'cbc-vapor-ring active' : 'cbc-vapor-ring'} />
              </div>
            </div>
          </div>

<div className="observation-ribbon cobaltchloridecycle-observation-row">
            <article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>起始</strong><span>{prepared ? '粉红起始样品已准备。' : '等待准备起始样品。'}</span></article>
            <article className={triggered ? 'observation-chip active' : 'observation-chip calm'}><strong>加热</strong><span>{triggered ? '加热后已明显变蓝。' : '等待加热变蓝。'}</span></article>
            <article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>回色</strong><span>{observed ? '加水后已恢复粉红。' : '等待完成回色观察。'}</span></article>
          </div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={'timeline-item ' + entry.state} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={note + '-' + index}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">
{step === 1 ? <>
                <button className="summary-choice generic-choice primary" key="dish" onClick={() => handleIdentify("dish")} type="button"><strong>识别 表面皿</strong><span>{identifiedMaterials.includes("dish") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="cobalt" onClick={() => handleIdentify("cobalt")} type="button"><strong>识别 氯化钴样品</strong><span>{identifiedMaterials.includes("cobalt") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="burner" onClick={() => handleIdentify("burner")} type="button"><strong>识别 酒精灯</strong><span>{identifiedMaterials.includes("burner") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="sprayer" onClick={() => handleIdentify("sprayer")} type="button"><strong>识别 加水滴管</strong><span>{identifiedMaterials.includes("sprayer") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="stand" onClick={() => handleIdentify("stand")} type="button"><strong>识别 实验支架</strong><span>{identifiedMaterials.includes("stand") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              </> : null}
{step === 2 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handlePrepare("correct")} type="button"><strong>放置含结晶水的氯化钴样品，建立粉红起始状态</strong><span>先建立正确起始颜色。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handlePrepare("dry-blue")} type="button"><strong>直接拿蓝色干样品当起始状态</strong><span>错误演示：起始状态不对。</span></button>
              </> : null}
{step === 3 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handleTrigger("correct")} type="button"><strong>缓慢加热样品，观察由粉红转蓝</strong><span>体现失水带来的颜色变化。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleTrigger("spray-first")} type="button"><strong>先加水后等待它自己变蓝</strong><span>错误演示：顺序颠倒。</span></button>
              </> : null}
{step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve("correct")} type="button"><strong>记录“加水后蓝色样品重新恢复粉红色”</strong><span>这是本实验最关键的回色现象。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleObserve("stay-blue")} type="button"><strong>记录“加水后依然只保持蓝色”</strong><span>错误演示：忽略再水合。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleObserve("black-char")} type="button"><strong>记录“样品会被烧成黑色炭化物”</strong><span>错误演示：与实验不符。</span></button>
              </> : null}
{step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary("correct")} type="button"><strong>加热失水偏蓝，重新加水后再水合可回粉红</strong><span>完整总结本实验结论。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleSummary("permanent-blue")} type="button"><strong>一旦变蓝就再也无法恢复原色</strong><span>错误演示：忽略可逆性。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleSummary("temperature-only")} type="button"><strong>颜色变化只和温度有关，和水分无关</strong><span>错误演示：忽略结晶水因素。</span></button>
              </> : null}
            </div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? "粉红体系已建" : "粉红体系待建"} / {observed ? "回粉现象已现" : "回粉现象待现"}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? "注意不要把“加热变蓝”和“加水回粉”混为一谈。"}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“氯化钴可逆变色”升级成更适合课堂展示的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
