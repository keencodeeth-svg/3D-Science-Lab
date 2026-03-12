import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beaker' | 'crystal';
type MaterialId = 'beaker' | 'silver' | 'copper' | 'support' | 'light';
type TimelineState = 'done' | 'current' | 'todo';

interface CopperSilverReplacementLabPlayerProps {
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
  2: "浸入铜丝",
  3: "观察银枝晶",
  4: "比较溶液变蓝",
  5: "总结置换现象",
};

const stepPrompts: Record<StepId, string> = {
  1: "先识别烧杯、硝酸银溶液、铜丝、支架和观察灯。",
  2: "把铜丝浸入无色硝酸银溶液，建立反应体系。",
  3: "观察铜丝表面是否逐步长出银白色枝晶。",
  4: "继续比较溶液是否由无色逐渐转为蓝色。",
  5: "总结银枝晶析出和溶液变蓝所说明的问题。",
};

const materialLabels: Record<MaterialId, string> = {
  "beaker": "烧杯",
  "silver": "硝酸银溶液",
  "copper": "铜丝",
  "support": "支架",
  "light": "观察灯",
};

const materialOrder: MaterialId[] = ["beaker", "silver", "copper", "support", "light"];
const cameraSceneLabels: Record<CameraPreset, string> = {
  "bench": "实验台总览",
  "beaker": "烧杯近景",
  "crystal": "枝晶近景"
};
const prepareErrorMessages: Record<string, string> = {
  "outside": "铜丝必须与硝酸银溶液接触，才能观察到银枝晶析出。"
};
const triggerErrorMessages: Record<string, string> = {
  "smooth": "铜丝表面会逐步析出银白色枝晶，不能判为无变化。"
};
const observeErrorMessages: Record<string, string> = {
  "stay-clear": "该实验中溶液会因铜离子出现而逐步转蓝，不能判为始终无色。",
  "turn-red": "本实验更典型的是溶液转蓝，而不是转红。"
};
const summaryErrorMessages: Record<string, string> = {
  "silver-only": "该实验要同时关注铜丝析银和溶液变蓝两个证据。",
  "no-reaction": "铜与硝酸银之间会发生明显的置换反应，现象很清楚。"
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

export function CopperSilverReplacementLabPlayer({ experiment, onTelemetry }: CopperSilverReplacementLabPlayerProps) {
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
  const [labNotes, setLabNotes] = useState<string[]>(["实验已载入：通过铜与硝酸银反应观察银枝晶和溶液变蓝。"]);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const effectValue = clamp(24 + (prepared ? 18 : 0) + (triggered ? 20 : 0) + (observed ? 24 : 0), 20, 99);
  const visualValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 28 : 0) + (summaryChoice === 'correct' ? 12 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 10 : 0) + (triggered ? 10 : 0) + (observed ? 14 : 0), 20, 100);
  const stageClassName = ['scene-canvas', 'coppersilverreplacement-stage', 'preset-' + cameraPreset, prepared ? 'prepared' : '', triggered ? 'triggered' : '', observed ? 'observed' : ''].filter(Boolean).join(' ');

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
        advanceStep(2, "器材识别完成，下一步把铜丝放入硝酸银溶液中。");
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
    appendNote("准备记录：铜丝已浸入无色硝酸银溶液。");
    setCameraPreset("crystal");
    advanceStep(3, "装置已准备好，下一步观察铜丝表面的银枝晶生长。");
  };

  const handleTrigger = (choice: string) => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError("请先把铜丝浸入硝酸银溶液，再进入下一步。");
      return;
    }
    if (choice !== 'correct') {
      markError(triggerErrorMessages[choice] ?? '请按当前步骤重新操作。');
      return;
    }
    setTriggered(true);
    appendNote("触发记录：铜丝表面已出现明显银枝晶。");
    setCameraPreset("crystal");
    advanceStep(4, "枝晶现象已出现，下一步判断溶液颜色是否变蓝。");
  };

  const handleObserve = (choice: string) => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!triggered) {
      markError("请先观察银枝晶生长，再进行下一步判断。");
      return;
    }
    if (choice !== 'correct') {
      markError(observeErrorMessages[choice] ?? '请重新核对观察结果。');
      return;
    }
    setObserved(true);
    appendNote("现象记录：溶液已由无色逐步转为蓝色。");
    advanceStep(5, "颜色变化记录完成，下一步总结置换反应现象。");
  };

  const handleSummary = (choice: string) => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice !== 'correct') {
      markError(summaryErrorMessages[choice] ?? '请根据实验现象重新总结。');
      return;
    }
    advanceStep(null, "总结正确：铜与硝酸银反应会析出银枝晶，并使溶液因铜离子出现而变蓝。");
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
    setLabNotes(["实验已重置：重新观察铜丝生银枝晶。"]);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ["先把铜丝浸入硝酸银溶液。", "注意看铜丝表面是否长出银色枝晶。", "同时别忽略溶液由无色变蓝。"]
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对关键现象。',
        "建议按“识别 → 浸入铜丝 → 观察银枝晶 → 比较溶液变蓝 → 总结”的顺序重做。",
      ];

  return (
    <section className="panel playground-panel coppersilverreplacement-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把铜丝表面长出银枝晶、溶液逐步转蓝的过程做成更细腻、更具金属质感的专属实验页。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid coppersilverreplacement-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraSceneLabels[cameraPreset]}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>枝晶生长 {effectValue}</span><div className="chem-meter-bar"><i style={{ width: effectValue + '%' }} /></div></div><div className="chem-meter"><span>金属光泽 {visualValue}</span><div className="chem-meter-bar"><i style={{ width: visualValue + '%' }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: readinessValue + '%' }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: score + '%' }} /></div></div></div></section><section className="info-card coppersilverreplacement-data-card"><span className="eyebrow">Readout</span><h3>枝晶读数板</h3><div className="generic-readout-grid coppersilverreplacement-readout-grid">
              <article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>浸没体系</span><strong>{prepared ? '已建立' : '--'}</strong><small>{prepared ? '铜丝已浸入硝酸银溶液。' : '先建立浸没体系。'}</small></article>
              <article className={triggered ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>银枝晶</span><strong>{triggered ? '已生长' : '--'}</strong><small>{triggered ? '铜丝表面已出现银枝晶。' : '等待观察枝晶。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '析银转蓝' : '等待总结'}</strong><small>{'最有操作感的地方是银枝晶会从铜丝表面长出来。'}</small></article>
            </div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? "铜丝与硝酸银装置"} · 当前重点：{step <= 2 ? "建立浸没体系" : step === 3 ? "观察银枝晶生长" : "判断溶液是否变蓝"}</small></div><div className="camera-actions">
              <button className={cameraPreset === "bench" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("bench")} type="button">实验台</button>
              <button className={cameraPreset === "beaker" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("beaker")} type="button">烧杯</button>
              <button className={cameraPreset === "crystal" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("crystal")} type="button">枝晶</button>
            </div></div><div className={stageClassName}>
            <div className="coppersilverreplacement-rig">
              <div className="csr-bench-shadow" />
              <div className={prepared ? 'csr-bench-caustic active' : 'csr-bench-caustic'} />
              <div className={prepared ? "csr-beaker active" : "csr-beaker"}>
                <div className="csr-beaker-foot" />
                <div className="csr-beaker-rim" />
                <div className="csr-inner-glass" />
                <div className={prepared ? 'csr-meniscus active' : 'csr-meniscus'} />
                <div className={observed ? 'csr-copper-front active' : 'csr-copper-front'} />
                <div className={prepared ? observed ? "csr-liquid active blue" : "csr-liquid active" : "csr-liquid"}>
                  <span className="csr-liquid-surface" />
                  <span className={triggered ? "csr-silver-haze active" : "csr-silver-haze"} />
                  <span className={observed ? "csr-blue-front active" : "csr-blue-front"} />
                </div>
                <div className={prepared ? "csr-wire active" : "csr-wire"}>
                  <span className="csr-wire-sheen" />
                  <div className={triggered ? "csr-crystal active" : "csr-crystal"}>
                    <span className={triggered ? "csr-dendrite-branches active" : "csr-dendrite-branches"} />
                    <span className={triggered ? "csr-dendrite-sparkles active" : "csr-dendrite-sparkles"} />
                    <span className={triggered ? 'csr-dendrite-halo active' : 'csr-dendrite-halo'} />
                  </div>
                </div>
              </div>
              <div className={prepared ? "csr-bottle active" : "csr-bottle"}>
                <span className="csr-bottle-rim" />
                <span className="csr-bottle-glass" />
                <span className="csr-bottle-cap" />
                <span className="csr-bottle-fill" />
              </div>
              <div className={triggered ? "csr-glint active" : "csr-glint"}>
                <span className={triggered ? "csr-metal-ray active" : "csr-metal-ray"} />
                <span className={observed ? 'csr-metal-ray ray-2 active' : 'csr-metal-ray ray-2'} />
              </div>
            </div>
          </div>

          <div className="observation-ribbon coppersilverreplacement-observation-row">
            <article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>浸入</strong><span>{prepared ? '铜丝已进入反应液。' : '等待建立浸入状态。'}</span></article>
            <article className={triggered ? 'observation-chip active' : 'observation-chip calm'}><strong>枝晶</strong><span>{triggered ? '银枝晶已明显生长。' : '等待枝晶生长。'}</span></article>
            <article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>蓝色</strong><span>{observed ? '溶液已明显变蓝。' : '等待完成蓝色观察。'}</span></article>
          </div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={'timeline-item ' + entry.state} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={note + '-' + index}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">
{step === 1 ? <>
                <button className="summary-choice generic-choice primary" key="beaker" onClick={() => handleIdentify("beaker")} type="button"><strong>识别 烧杯</strong><span>{identifiedMaterials.includes("beaker") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="silver" onClick={() => handleIdentify("silver")} type="button"><strong>识别 硝酸银溶液</strong><span>{identifiedMaterials.includes("silver") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="copper" onClick={() => handleIdentify("copper")} type="button"><strong>识别 铜丝</strong><span>{identifiedMaterials.includes("copper") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="support" onClick={() => handleIdentify("support")} type="button"><strong>识别 支架</strong><span>{identifiedMaterials.includes("support") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="light" onClick={() => handleIdentify("light")} type="button"><strong>识别 观察灯</strong><span>{identifiedMaterials.includes("light") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              </> : null}
{step === 2 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handlePrepare("correct")} type="button"><strong>把铜丝规范浸入硝酸银溶液中</strong><span>建立置换反应体系。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handlePrepare("outside")} type="button"><strong>把铜丝放在烧杯外等待银自己析出</strong><span>错误演示：没有接触反应液。</span></button>
              </> : null}
{step === 3 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handleTrigger("correct")} type="button"><strong>观察铜丝表面逐步长出银白枝晶</strong><span>这是本实验最吸睛的现象。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleTrigger("smooth")} type="button"><strong>记录“铜丝表面始终光滑无变化”</strong><span>错误演示：忽略析银。</span></button>
              </> : null}
{step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve("correct")} type="button"><strong>记录“溶液逐渐由无色转为蓝色”</strong><span>这是铜离子进入溶液的重要证据。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleObserve("stay-clear")} type="button"><strong>记录“溶液一直保持完全无色”</strong><span>错误演示：忽略溶液变化。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleObserve("turn-red")} type="button"><strong>记录“溶液会明显变成红色”</strong><span>错误演示：与现象不符。</span></button>
              </> : null}
{step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary("correct")} type="button"><strong>铜置换出银，铜丝长银枝晶，溶液因铜离子出现而变蓝</strong><span>完整总结本实验结论。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleSummary("silver-only")} type="button"><strong>只是银单独析出，与铜和溶液颜色无关</strong><span>错误演示：忽略整体变化。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleSummary("no-reaction")} type="button"><strong>铜与硝酸银之间不会发生明显反应</strong><span>错误演示：否认置换现象。</span></button>
              </> : null}
            </div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? "浸没体系已建" : "浸没体系待建"} / {observed ? "溶液变蓝已现" : "溶液变蓝待现"}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? "注意同时记录“银枝晶”和“溶液变蓝”两个证据。"}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“铜丝生银枝晶”升级成更具金属细节的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
