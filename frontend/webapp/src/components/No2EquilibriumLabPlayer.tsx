import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'flask' | 'temperature';
type MaterialId = 'flask' | 'no2' | 'icebath' | 'warmbath' | 'stopper';
type TimelineState = 'done' | 'current' | 'todo';

interface No2EquilibriumLabPlayerProps {
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
  2: "建立棕色体系",
  3: "冰浴后变浅",
  4: "升温后回深",
  5: "总结可逆变化",
};

const stepPrompts: Record<StepId, string> = {
  1: "先识别烧瓶、二氧化氮气体、冰浴、温水浴和瓶塞。",
  2: "先建立棕色二氧化氮气体体系。",
  3: "将烧瓶置入冰浴，观察棕色是否明显变浅。",
  4: "再把烧瓶转入温水浴，判断颜色是否重新加深。",
  5: "总结二氧化氮在冷暖条件下的颜色可逆变化。",
};

const materialLabels: Record<MaterialId, string> = {
  "flask": "烧瓶",
  "no2": "二氧化氮气体",
  "icebath": "冰浴",
  "warmbath": "温水浴",
  "stopper": "瓶塞",
};

const materialOrder: MaterialId[] = ["flask", "no2", "icebath", "warmbath", "stopper"];
const cameraSceneLabels: Record<CameraPreset, string> = {
  "bench": "实验台总览",
  "flask": "烧瓶近景",
  "temperature": "温变近景"
};
const prepareErrorMessages: Record<string, string> = {
  "open-air": "应建立封闭烧瓶并配合冷暖浴，才能稳定观察颜色变化。"
};
const triggerErrorMessages: Record<string, string> = {
  "warm-first": "应先置入冰浴观察颜色变浅，而不是先升温。"
};
const observeErrorMessages: Record<string, string> = {
  "stay-pale": "升温后颜色会重新加深，不能判为一直保持浅色。",
  "colorless": "冷却后通常是颜色明显变浅而非永久无色，升温后还会回深。"
};
const summaryErrorMessages: Record<string, string> = {
  "irreversible": "该实验最重要的就是冷暖切换下的可逆颜色变化。",
  "light-only": "本实验核心变量是温度，不是光照。"
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

export function No2EquilibriumLabPlayer({ experiment, onTelemetry }: No2EquilibriumLabPlayerProps) {
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
  const [labNotes, setLabNotes] = useState<string[]>(["实验已载入：通过冷却与升温观察二氧化氮颜色变化。"]);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const effectValue = clamp(24 + (prepared ? 18 : 0) + (triggered ? 20 : 0) + (observed ? 24 : 0), 20, 99);
  const visualValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 28 : 0) + (summaryChoice === 'correct' ? 12 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 10 : 0) + (triggered ? 10 : 0) + (observed ? 14 : 0), 20, 100);
  const stageClassName = ['scene-canvas', 'no2equilibrium-stage', 'preset-' + cameraPreset, prepared ? 'prepared' : '', triggered ? 'triggered' : '', observed ? 'observed' : ''].filter(Boolean).join(' ');

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
        advanceStep(2, "器材识别完成，下一步建立棕色二氧化氮气体体系。");
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
    appendNote("准备记录：棕色气体烧瓶及冷暖浴装置已建立。");
    setCameraPreset("temperature");
    advanceStep(3, "棕色气体体系已准备好，下一步置入冰浴观察褪色。");
  };

  const handleTrigger = (choice: string) => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError("请先建立棕色气体体系，再进入冷却步骤。");
      return;
    }
    if (choice !== 'correct') {
      markError(triggerErrorMessages[choice] ?? '请按当前步骤重新操作。');
      return;
    }
    setTriggered(true);
    appendNote("触发记录：冰浴后烧瓶内棕色已明显变浅。");
    setCameraPreset("temperature");
    advanceStep(4, "冷却现象已出现，下一步判断升温后是否重新加深。");
  };

  const handleObserve = (choice: string) => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!triggered) {
      markError("请先完成冰浴褪色，再进行下一步判断。");
      return;
    }
    if (choice !== 'correct') {
      markError(observeErrorMessages[choice] ?? '请重新核对观察结果。');
      return;
    }
    setObserved(true);
    appendNote("现象记录：升温后棕色已重新加深。");
    advanceStep(5, "可逆色变记录完成，下一步总结冷暖平衡变化。");
  };

  const handleSummary = (choice: string) => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice !== 'correct') {
      markError(summaryErrorMessages[choice] ?? '请根据实验现象重新总结。');
      return;
    }
    advanceStep(null, "总结正确：二氧化氮在冷却时颜色变浅，升温后又会加深，体现可逆平衡变化。");
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
    setLabNotes(["实验已重置：重新观察二氧化氮冷暖色变。"]);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ["先建立棕色二氧化氮烧瓶。", "置入冰浴后注意看棕色是否变浅。", "再升温时判断颜色是否重新加深。"]
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对关键现象。',
        "建议按“识别 → 建立棕色体系 → 冰浴褪色 → 升温回深 → 总结”的顺序重做。",
      ];

  return (
    <section className="panel playground-panel no2equilibrium-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把棕色气体在冷暖条件下的可逆颜色变化做成更具戏剧感的专属化学实验场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid no2equilibrium-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraSceneLabels[cameraPreset]}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>色深变化 {effectValue}</span><div className="chem-meter-bar"><i style={{ width: effectValue + '%' }} /></div></div><div className="chem-meter"><span>可逆演示 {visualValue}</span><div className="chem-meter-bar"><i style={{ width: visualValue + '%' }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: readinessValue + '%' }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: score + '%' }} /></div></div></div></section><section className="info-card no2equilibrium-data-card"><span className="eyebrow">Readout</span><h3>气体读数板</h3><div className="generic-readout-grid no2equilibrium-readout-grid">
              <article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>棕色体系</span><strong>{prepared ? '已建立' : '--'}</strong><small>{prepared ? '棕色二氧化氮烧瓶已就位。' : '先建立气体体系。'}</small></article>
              <article className={observed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>回深现象</span><strong>{observed ? '已出现' : '--'}</strong><small>{observed ? '升温后棕色已重新加深。' : '等待观察回深。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '冷暖可逆' : '等待总结'}</strong><small>{'这个实验最适合用来展示温度对平衡的影响。'}</small></article>
            </div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? "二氧化氮平衡装置"} · 当前重点：{step <= 2 ? "建立棕色气体体系" : step === 3 ? "冰浴观察褪色" : "升温判断回深"}</small></div><div className="camera-actions">
              <button className={cameraPreset === "bench" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("bench")} type="button">实验台</button>
              <button className={cameraPreset === "flask" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("flask")} type="button">烧瓶</button>
              <button className={cameraPreset === "temperature" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("temperature")} type="button">温变</button>
            </div></div><div className={stageClassName}>
            <div className="no2equilibrium-rig">
              <div className="n2e-bench-shadow" />
              <div className={prepared ? "n2e-flask active" : "n2e-flask"}>
                <div className="n2e-rim" />
                <div className={prepared ? "n2e-stopper active" : "n2e-stopper"} />
                <div className="n2e-flask-foot" />
                <div className="n2e-flask-gloss" />
                <div className={observed ? "n2e-gas active warm" : triggered ? "n2e-gas active pale" : prepared ? "n2e-gas active brown" : "n2e-gas"}>
                  <span className="n2e-gas-core" />
                  <span className={prepared ? 'n2e-gas-band active' : 'n2e-gas-band'} />
                  <span className={triggered ? "n2e-condensation active" : "n2e-condensation"} />
                  <span className={triggered ? 'n2e-cool-front active' : 'n2e-cool-front'} />
                  <span className={observed ? 'n2e-warm-front active' : 'n2e-warm-front'} />
                  <span className={observed ? "n2e-thermal-swirl active" : "n2e-thermal-swirl"} />
                </div>
              </div>
              <div className={triggered ? "n2e-bath cool active" : "n2e-bath cool"}>
                <span className="n2e-bath-rim" />
                <span className="n2e-bath-surface" />
                <span className={triggered ? 'n2e-ice-shine active' : 'n2e-ice-shine'} />
                <span className={triggered ? "n2e-bath-bubble bubble-1 active" : "n2e-bath-bubble bubble-1"} />
                <span className={triggered ? "n2e-bath-bubble bubble-2 active" : "n2e-bath-bubble bubble-2"} />
              </div>
              <div className={observed ? "n2e-bath warm active" : "n2e-bath warm"}>
                <span className="n2e-bath-rim" />
                <span className="n2e-bath-surface" />
                <span className={observed ? 'n2e-heat-shimmer active' : 'n2e-heat-shimmer'} />
                <span className={observed ? "n2e-steam steam-1 active" : "n2e-steam steam-1"} />
                <span className={observed ? "n2e-steam steam-2 active" : "n2e-steam steam-2"} />
              </div>
              <div className={triggered ? "n2e-vapor active" : "n2e-vapor"}>
                <span className={triggered ? 'n2e-vapor-sheet active' : 'n2e-vapor-sheet'} />
              </div>
              <div className={observed ? "n2e-thermal-halo active" : "n2e-thermal-halo"} />
            </div>
          </div>

<div className="observation-ribbon no2equilibrium-observation-row">
            <article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>建立</strong><span>{prepared ? '棕色烧瓶已建立。' : '等待建立棕色体系。'}</span></article>
            <article className={triggered ? 'observation-chip active' : 'observation-chip calm'}><strong>冰浴</strong><span>{triggered ? '冰浴后颜色已明显变浅。' : '等待冰浴褪色。'}</span></article>
            <article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>升温</strong><span>{observed ? '升温后颜色已回深。' : '等待完成升温判断。'}</span></article>
          </div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={'timeline-item ' + entry.state} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={note + '-' + index}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">
{step === 1 ? <>
                <button className="summary-choice generic-choice primary" key={"flask"} onClick={() => handleIdentify("flask")} type="button"><strong>识别 烧瓶</strong><span>{identifiedMaterials.includes("flask") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"no2"} onClick={() => handleIdentify("no2")} type="button"><strong>识别 二氧化氮气体</strong><span>{identifiedMaterials.includes("no2") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"icebath"} onClick={() => handleIdentify("icebath")} type="button"><strong>识别 冰浴</strong><span>{identifiedMaterials.includes("icebath") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"warmbath"} onClick={() => handleIdentify("warmbath")} type="button"><strong>识别 温水浴</strong><span>{identifiedMaterials.includes("warmbath") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key={"stopper"} onClick={() => handleIdentify("stopper")} type="button"><strong>识别 瓶塞</strong><span>{identifiedMaterials.includes("stopper") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              </> : null}
{step === 2 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handlePrepare("correct")} type="button"><strong>建立封闭棕色二氧化氮烧瓶，并准备冷暖浴</strong><span>为后续冷暖可逆变化做准备。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handlePrepare("open-air")} type="button"><strong>敞口放置后直接等待颜色自己变化</strong><span>错误演示：不利于稳定观察。</span></button>
              </> : null}
{step === 3 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handleTrigger("correct")} type="button"><strong>把烧瓶置入冰浴，观察棕色明显变浅</strong><span>进入低温褪色阶段。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleTrigger("warm-first")} type="button"><strong>先放温水中再期待颜色变浅</strong><span>错误演示：顺序与条件错误。</span></button>
              </> : null}
{step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve("correct")} type="button"><strong>记录“升温后颜色重新变深，体现可逆变化”</strong><span>这是本实验最关键的现象。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleObserve("stay-pale")} type="button"><strong>记录“变浅后会一直保持不再变化”</strong><span>错误演示：忽略可逆性。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleObserve("colorless")} type="button"><strong>记录“冷却后会完全变成无色并不再恢复”</strong><span>错误演示：与典型现象不符。</span></button>
              </> : null}
{step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary("correct")} type="button"><strong>低温颜色变浅，升温颜色加深，说明体系存在可逆平衡变化</strong><span>完整总结本实验结论。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleSummary("irreversible")} type="button"><strong>只要冷却一次，颜色变化就不可逆了</strong><span>错误演示：忽略可逆平衡。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleSummary("light-only")} type="button"><strong>颜色变化主要由光照强弱决定，与温度无关</strong><span>错误演示：忽略温度因素。</span></button>
              </> : null}
            </div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? "棕色体系已建" : "棕色体系待建"} / {observed ? "回深现象已现" : "回深现象待现"}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? "注意区分“冰浴变浅”和“升温回深”两个阶段。"}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“二氧化氮冷暖色变”升级成更具可逆平衡观感的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
