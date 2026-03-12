import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beaker' | 'color';
type MaterialId = 'beaker' | 'chromate' | 'acid' | 'alkali' | 'dropper';
type TimelineState = 'done' | 'current' | 'todo';

interface ChromateEquilibriumLabPlayerProps {
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
  2: "建立黄色体系",
  3: "滴酸后变橙",
  4: "滴碱后回黄",
  5: "总结平衡移动",
};

const stepPrompts: Record<StepId, string> = {
  1: "先识别烧杯、铬酸根溶液、酸液、碱液和滴管。",
  2: "先建立黄色铬酸根起始体系。",
  3: "滴加酸液，观察是否由黄色转为橙色。",
  4: "继续滴加碱液，判断颜色是否重新回到黄色。",
  5: "总结黄橙变化与酸碱条件的关系。",
};

const materialLabels: Record<MaterialId, string> = {
  "beaker": "烧杯",
  "chromate": "铬酸根溶液",
  "acid": "酸液",
  "alkali": "碱液",
  "dropper": "滴管",
};

const materialOrder: MaterialId[] = ["beaker", "chromate", "acid", "alkali", "dropper"];
const cameraSceneLabels: Record<CameraPreset, string> = {
  "bench": "实验台总览",
  "beaker": "烧杯近景",
  "color": "颜色近景"
};
const prepareErrorMessages: Record<string, string> = {
  "orange-first": "本实验应先建立黄色铬酸根起始体系，不能一开始就做成橙色。"
};
const triggerErrorMessages: Record<string, string> = {
  "alkali-first": "应先滴加酸液观察黄色转橙色，再谈回黄。"
};
const observeErrorMessages: Record<string, string> = {
  "stay-orange": "继续加碱后颜色可以由橙重新回到黄色，说明过程可逆。",
  "no-change": "该实验的核心就是黄橙明显变化，不能判定为无变化。"
};
const summaryErrorMessages: Record<string, string> = {
  "irreversible": "颜色变化是可逆的，不是单向不可逆变化。",
  "same-ion": "黄橙变化反映了离子平衡移动，不能当作观察误差。"
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

export function ChromateEquilibriumLabPlayer({ experiment, onTelemetry }: ChromateEquilibriumLabPlayerProps) {
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
  const [labNotes, setLabNotes] = useState<string[]>(["实验已载入：通过酸碱调节观察黄橙颜色平衡。"]);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const effectValue = clamp(24 + (prepared ? 18 : 0) + (triggered ? 20 : 0) + (observed ? 24 : 0), 20, 99);
  const visualValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 28 : 0) + (summaryChoice === 'correct' ? 12 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 10 : 0) + (triggered ? 10 : 0) + (observed ? 14 : 0), 20, 100);
  const stageClassName = ['scene-canvas', 'chromateequilibrium-stage', 'preset-' + cameraPreset, prepared ? 'prepared' : '', triggered ? 'triggered' : '', observed ? 'observed' : ''].filter(Boolean).join(' ');

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
        advanceStep(2, "器材识别完成，下一步建立黄色铬酸根体系。");
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
    appendNote("准备记录：黄色铬酸根体系已建立。");
    setCameraPreset("color");
    advanceStep(3, "黄色体系已准备好，下一步滴加酸使颜色转橙。");
  };

  const handleTrigger = (choice: string) => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError("请先建立黄色铬酸根体系，再进入下一步。");
      return;
    }
    if (choice !== 'correct') {
      markError(triggerErrorMessages[choice] ?? '请按当前步骤重新操作。');
      return;
    }
    setTriggered(true);
    appendNote("触发记录：加入酸后体系已明显转为橙色。");
    setCameraPreset("color");
    advanceStep(4, "颜色变化已触发，下一步判断是否能再回到黄色。");
  };

  const handleObserve = (choice: string) => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!triggered) {
      markError("请先滴加酸完成变橙，再进行判断。");
      return;
    }
    if (choice !== 'correct') {
      markError(observeErrorMessages[choice] ?? '请重新核对观察结果。');
      return;
    }
    setObserved(true);
    appendNote("现象记录：加入碱后体系已由橙重新回到黄色。");
    advanceStep(5, "可逆变化记录完成，下一步总结平衡移动。");
  };

  const handleSummary = (choice: string) => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice !== 'correct') {
      markError(summaryErrorMessages[choice] ?? '请根据实验现象重新总结。');
      return;
    }
    advanceStep(null, "总结正确：铬酸根与重铬酸根可因酸碱条件不同发生黄橙可逆转化。");
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
    setLabNotes(["实验已重置：重新观察铬酸根与重铬酸根颜色平衡。"]);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ["先建立黄色铬酸根体系。", "滴酸后注意看颜色由黄转橙。", "继续用碱调节时再观察颜色是否回黄。"]
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对关键现象。',
        "建议按“识别 → 建立黄色体系 → 滴酸变橙 → 滴碱回黄 → 总结”的顺序重做。",
      ];

  return (
    <section className="panel playground-panel chromateequilibrium-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把黄橙可逆切换的离子平衡现象做成更清晰、更有演示冲击力的专属化学实验页。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid chromateequilibrium-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraSceneLabels[cameraPreset]}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>颜色反差 {effectValue}</span><div className="chem-meter-bar"><i style={{ width: effectValue + '%' }} /></div></div><div className="chem-meter"><span>平衡演示 {visualValue}</span><div className="chem-meter-bar"><i style={{ width: visualValue + '%' }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: readinessValue + '%' }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: score + '%' }} /></div></div></div></section><section className="info-card chromateequilibrium-data-card"><span className="eyebrow">Readout</span><h3>平衡读数板</h3><div className="generic-readout-grid chromateequilibrium-readout-grid">
              <article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>黄色体系</span><strong>{prepared ? '已建立' : '--'}</strong><small>{prepared ? '黄色铬酸根起始体系已形成。' : '先建立黄色体系。'}</small></article>
              <article className={observed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>可逆回黄</span><strong>{observed ? '已完成' : '--'}</strong><small>{observed ? '已完成黄→橙→黄的可逆变化。' : '等待完成回黄观察。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '黄橙可逆' : '等待总结'}</strong><small>{'这类实验最适合展示平衡移动的可逆性。'}</small></article>
            </div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? "铬酸根平衡装置"} · 当前重点：{step <= 2 ? "建立黄色起始体系" : step === 3 ? "滴酸变橙" : "判断是否可逆回黄"}</small></div><div className="camera-actions">
              <button className={cameraPreset === "bench" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("bench")} type="button">实验台</button>
              <button className={cameraPreset === "beaker" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("beaker")} type="button">烧杯</button>
              <button className={cameraPreset === "color" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("color")} type="button">颜色</button>
            </div></div><div className={stageClassName}>
            <div className="chromateequilibrium-rig">
              <div className="ceq-bench-shadow" />
              <div className={prepared ? "ceq-beaker active" : "ceq-beaker"}>
                <div className="ceq-beaker-rim" />
                <div className="ceq-beaker-gloss" />
                <div className={observed ? "ceq-liquid active yellow" : triggered ? "ceq-liquid active orange" : "ceq-liquid active yellow"}>
                  <span className="ceq-liquid-surface" />
                  <span className={prepared ? 'ceq-liquid-caustic active' : 'ceq-liquid-caustic'} />
                  <span className={triggered ? "ceq-plume acid active" : "ceq-plume acid"} />
                  <span className={observed ? "ceq-plume alkali active" : "ceq-plume alkali"} />
                  <span className={observed ? 'ceq-transition-front active yellow' : triggered ? 'ceq-transition-front active orange' : 'ceq-transition-front'} />
                  <span className={observed ? "ceq-color-band active yellow" : triggered ? "ceq-color-band active orange" : prepared ? "ceq-color-band active yellow" : "ceq-color-band"} />
                </div>
              </div>
              <div className={triggered ? "ceq-dropper acid active" : "ceq-dropper acid"}>
                <span className="ceq-dropper-bulb" />
                <span className="ceq-dropper-glass" />
                <span className={triggered && !observed ? "ceq-drop acid active" : "ceq-drop acid"} />
              </div>
              <div className={observed ? "ceq-dropper alkali active" : "ceq-dropper alkali"}>
                <span className="ceq-dropper-bulb" />
                <span className="ceq-dropper-glass" />
                <span className={observed ? "ceq-drop alkali active" : "ceq-drop alkali"} />
              </div>
              <div className={triggered ? 'ceq-reagent-bottle acid active' : prepared ? 'ceq-reagent-bottle acid active poised' : 'ceq-reagent-bottle acid'}>
                <span className="ceq-reagent-cap" />
                <span className="ceq-reagent-fill acid" />
              </div>
              <div className={observed ? 'ceq-reagent-bottle alkali active' : prepared ? 'ceq-reagent-bottle alkali active poised' : 'ceq-reagent-bottle alkali'}>
                <span className="ceq-reagent-cap" />
                <span className="ceq-reagent-fill alkali" />
              </div>
              <div className={triggered ? "ceq-palette active orange" : prepared ? "ceq-palette active" : "ceq-palette"}>
                <span className="ceq-palette-sheen" />
              </div>
              <div className={observed ? "ceq-reaction-halo alkali active" : triggered ? "ceq-reaction-halo acid active" : "ceq-reaction-halo"} />
            </div>
          </div>

<div className="observation-ribbon chromateequilibrium-observation-row">
            <article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>起始</strong><span>{prepared ? '黄色起始体系已建立。' : '等待建立黄色体系。'}</span></article>
            <article className={triggered ? 'observation-chip active' : 'observation-chip calm'}><strong>变橙</strong><span>{triggered ? '滴酸后已明显变橙。' : '等待滴酸变橙。'}</span></article>
            <article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>回黄</strong><span>{observed ? '滴碱后已重新回黄。' : '等待完成回黄观察。'}</span></article>
          </div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={'timeline-item ' + entry.state} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={note + '-' + index}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">
{step === 1 ? <>
                <button className="summary-choice generic-choice primary" key="beaker" onClick={() => handleIdentify("beaker")} type="button"><strong>识别 烧杯</strong><span>{identifiedMaterials.includes("beaker") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="chromate" onClick={() => handleIdentify("chromate")} type="button"><strong>识别 铬酸根溶液</strong><span>{identifiedMaterials.includes("chromate") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="acid" onClick={() => handleIdentify("acid")} type="button"><strong>识别 酸液</strong><span>{identifiedMaterials.includes("acid") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="alkali" onClick={() => handleIdentify("alkali")} type="button"><strong>识别 碱液</strong><span>{identifiedMaterials.includes("alkali") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="dropper" onClick={() => handleIdentify("dropper")} type="button"><strong>识别 滴管</strong><span>{identifiedMaterials.includes("dropper") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              </> : null}
{step === 2 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handlePrepare("correct")} type="button"><strong>加入铬酸根溶液，建立明黄色起始体系</strong><span>为后续平衡演示打基础。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handlePrepare("orange-first")} type="button"><strong>先把体系做成橙色再说</strong><span>错误演示：起始状态错误。</span></button>
              </> : null}
{step === 3 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handleTrigger("correct")} type="button"><strong>滴加酸液，使体系由黄转橙</strong><span>推动平衡向重铬酸根方向移动。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleTrigger("alkali-first")} type="button"><strong>直接先加碱等待变橙</strong><span>错误演示：操作方向相反。</span></button>
              </> : null}
{step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve("correct")} type="button"><strong>记录“再加碱后体系由橙重新回到黄色”</strong><span>这是本实验最关键的可逆现象。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleObserve("stay-orange")} type="button"><strong>记录“颜色只会保持橙色，不能回黄”</strong><span>错误演示：忽略平衡可逆。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleObserve("no-change")} type="button"><strong>记录“酸碱加入都不会引起明显颜色变化”</strong><span>错误演示：与现象不符。</span></button>
              </> : null}
{step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary("correct")} type="button"><strong>酸性更强时偏橙，碱性增强时可重新偏黄</strong><span>完整总结平衡移动。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleSummary("irreversible")} type="button"><strong>一旦变橙就不能再回黄</strong><span>错误演示：忽略可逆性。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleSummary("same-ion")} type="button"><strong>黄和橙只是观察误差，本质没有变化</strong><span>错误演示：否认平衡变化。</span></button>
              </> : null}
            </div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? "黄色体系已建" : "黄色体系待建"} / {observed ? "可逆回黄已现" : "回黄现象待现"}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? "注意区分“滴酸变橙”和“滴碱回黄”两个阶段。"}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“铬酸根平衡”升级成更适合课堂演示的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
