import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'flask' | 'glow';
type MaterialId = 'flask' | 'luminol' | 'oxidant' | 'catalyst' | 'darkroom';
type TimelineState = 'done' | 'current' | 'todo';

interface LuminolGlowLabPlayerProps {
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
  2: "建立暗室体系",
  3: "加入氧化体系",
  4: "观察冷蓝发光",
  5: "总结化学发光",
};

const stepPrompts: Record<StepId, string> = {
  1: "先识别锥形瓶、鲁米诺溶液、氧化液、催化液和遮光环境。",
  2: "先建立鲁米诺暗室反应体系，为后续发光创造条件。",
  3: "向体系中加入氧化液与催化液，触发化学发光。",
  4: "观察烧瓶内是否出现明显的冷蓝色发光。",
  5: "总结鲁米诺发光的关键现象与条件。",
};

const materialLabels: Record<MaterialId, string> = {
  "flask": "锥形瓶",
  "luminol": "鲁米诺溶液",
  "oxidant": "氧化液",
  "catalyst": "催化液",
  "darkroom": "遮光环境",
};

const materialOrder: MaterialId[] = ["flask", "luminol", "oxidant", "catalyst", "darkroom"];
const cameraSceneLabels: Record<CameraPreset, string> = {
  "bench": "实验台总览",
  "flask": "烧瓶近景",
  "glow": "发光近景"
};
const prepareErrorMessages: Record<string, string> = {
  "bright-room": "鲁米诺发光需要更暗的观察环境，不能忽略遮光条件。"
};
const triggerErrorMessages: Record<string, string> = {
  "water": "仅加清水不会触发典型鲁米诺蓝光，必须加入氧化体系。"
};
const observeErrorMessages: Record<string, string> = {
  "only-bubbles": "鲁米诺实验的核心现象是冷蓝色发光，不能只记气泡。",
  "need-lamp": "该实验是化学发光，不依赖外部灯光照亮。"
};
const summaryErrorMessages: Record<string, string> = {
  "fluorescence": "鲁米诺属于化学发光，不是依赖外部照射的普通荧光。",
  "heating-only": "鲁米诺发光关键在氧化体系，不是单靠加热。"
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

export function LuminolGlowLabPlayer({ experiment, onTelemetry }: LuminolGlowLabPlayerProps) {
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
  const [labNotes, setLabNotes] = useState<string[]>(["实验已载入：通过鲁米诺体系观察冷蓝色化学发光。"]);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const effectValue = clamp(24 + (prepared ? 18 : 0) + (triggered ? 20 : 0) + (observed ? 24 : 0), 20, 99);
  const visualValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 28 : 0) + (summaryChoice === 'correct' ? 12 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 10 : 0) + (triggered ? 10 : 0) + (observed ? 14 : 0), 20, 100);
  const stageClassName = ['scene-canvas', 'luminolglow-stage', 'preset-' + cameraPreset, prepared ? 'prepared' : '', triggered ? 'triggered' : '', observed ? 'observed' : ''].filter(Boolean).join(' ');

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
        advanceStep(2, "器材识别完成，下一步搭建鲁米诺暗室反应体系。");
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
    appendNote("准备记录：鲁米诺体系与暗室条件已建立。");
    setCameraPreset("glow");
    advanceStep(3, "暗室体系已准备好，下一步加入氧化体系触发发光。");
  };

  const handleTrigger = (choice: string) => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError("请先完成鲁米诺暗室体系准备，再进入触发步骤。");
      return;
    }
    if (choice !== 'correct') {
      markError(triggerErrorMessages[choice] ?? '请按当前步骤重新操作。');
      return;
    }
    setTriggered(true);
    appendNote("触发记录：氧化体系已加入，烧瓶开始进入发光窗口。");
    setCameraPreset("glow");
    advanceStep(4, "反应已触发，下一步观察是否出现冷蓝色发光。");
  };

  const handleObserve = (choice: string) => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!triggered) {
      markError("请先完成触发步骤，再进行观察判断。");
      return;
    }
    if (choice !== 'correct') {
      markError(observeErrorMessages[choice] ?? '请重新核对观察结果。');
      return;
    }
    setObserved(true);
    appendNote("现象记录：已观察到明显冷蓝色发光。");
    advanceStep(5, "发光现象记录完成，下一步总结化学发光的关键特征。");
  };

  const handleSummary = (choice: string) => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice !== 'correct') {
      markError(summaryErrorMessages[choice] ?? '请根据实验现象重新总结。');
      return;
    }
    advanceStep(null, "总结正确：鲁米诺在氧化体系中会出现冷蓝色化学发光。");
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
    setLabNotes(["实验已重置：重新观察鲁米诺发光。"]);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ["先搭建鲁米诺暗室体系。", "加入氧化体系后注意观察冷蓝色发光。", "总结时记住这是化学发光，不依赖外部照明。"]
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对关键现象。',
        "建议按“识别 → 建立暗室体系 → 触发反应 → 观察冷蓝光 → 总结”的顺序重做。",
      ];

  return (
    <section className="panel playground-panel luminolglow-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把暗室中的冷蓝色化学发光做成更沉浸、更具戏剧感的专属化学实验场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid luminolglow-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraSceneLabels[cameraPreset]}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>发光强度 {effectValue}</span><div className="chem-meter-bar"><i style={{ width: effectValue + '%' }} /></div></div><div className="chem-meter"><span>沉浸感 {visualValue}</span><div className="chem-meter-bar"><i style={{ width: visualValue + '%' }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: readinessValue + '%' }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: score + '%' }} /></div></div></div></section><section className="info-card luminolglow-data-card"><span className="eyebrow">Readout</span><h3>发光读数板</h3><div className="generic-readout-grid luminolglow-readout-grid">
              <article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>暗室体系</span><strong>{prepared ? '已就绪' : '--'}</strong><small>{prepared ? '鲁米诺体系与暗室条件已就位。' : '先建立暗室体系。'}</small></article>
              <article className={observed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>冷蓝发光</span><strong>{observed ? '已出现' : '--'}</strong><small>{observed ? '烧瓶内已出现冷蓝色发光。' : '等待观察发光。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '化学发光' : '等待总结'}</strong><small>{'该实验最震撼的地方是暗处突然出现冷蓝色光。'}</small></article>
            </div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? "鲁米诺发光装置"} · 当前重点：{step <= 2 ? "建立暗室与反应体系" : step === 3 ? "加入氧化体系触发" : "判断冷蓝色发光"}</small></div><div className="camera-actions">
              <button className={cameraPreset === "bench" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("bench")} type="button">实验台</button>
              <button className={cameraPreset === "flask" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("flask")} type="button">烧瓶</button>
              <button className={cameraPreset === "glow" ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset("glow")} type="button">发光</button>
            </div></div><div className={stageClassName}>
            <div className="luminolglow-rig">
              <div className="lmg-bench-shadow" />
              <div className={observed ? 'lmg-bench-reflection active' : 'lmg-bench-reflection'} />
              <div className={triggered || observed ? 'lmg-bench-caustic active' : 'lmg-bench-caustic'} />
              <div className={prepared ? "lmg-reagent left active" : "lmg-reagent left"}>
                <span className="lmg-reagent-rim" />
                <span className="lmg-reagent-glass" />
                <span className="lmg-reagent-cap" />
                <span className="lmg-reagent-fill luminol" />
                <span className="lmg-reagent-meniscus luminol" />
                <span className="lmg-reagent-label" />
              </div>
              <div className={prepared ? "lmg-flask active" : "lmg-flask"}>
                <div className="lmg-flask-foot" />
                <div className="lmg-neck" />
                <div className="lmg-rim" />
                <div className="lmg-neck-reflection" />
                <div className="lmg-flask-gloss" />
                <div className={prepared ? 'lmg-meniscus active' : 'lmg-meniscus'} />
                <div className={triggered ? 'lmg-glow-sheet active' : 'lmg-glow-sheet'} />
                <div className={observed ? "lmg-liquid active glow" : triggered ? "lmg-liquid active bright" : "lmg-liquid active"}>
                  <span className="lmg-liquid-surface" />
                  <span className={triggered ? "lmg-reaction-plume active" : "lmg-reaction-plume"} />
                  <span className={triggered ? 'lmg-liquid-caustic active' : 'lmg-liquid-caustic'} />
                  <span className={observed ? "lmg-photon-specks active" : "lmg-photon-specks"} />
                  <span className={observed ? 'lmg-blue-mist active' : 'lmg-blue-mist'} />
                </div>
                <div className={observed ? "lmg-halo active" : "lmg-halo"} />
                <div className={observed ? "lmg-halo-ring ring-1 active" : "lmg-halo-ring ring-1"} />
                <div className={observed ? "lmg-halo-ring ring-2 active" : "lmg-halo-ring ring-2"} />
                <div className={observed ? 'lmg-photon-crown active' : 'lmg-photon-crown'} />
              </div>
              <div className={triggered ? "lmg-transfer-stream active" : "lmg-transfer-stream"}>
                <span className={triggered ? 'lmg-transfer-core active' : 'lmg-transfer-core'} />
                <span className={triggered ? 'lmg-transfer-spray active' : 'lmg-transfer-spray'} />
              </div>
              <div className={triggered ? "lmg-reagent right active" : "lmg-reagent right"}>
                <span className="lmg-reagent-rim" />
                <span className="lmg-reagent-glass" />
                <span className="lmg-reagent-cap" />
                <span className="lmg-reagent-fill oxidant" />
                <span className="lmg-reagent-meniscus oxidant" />
                <span className="lmg-reagent-label catalyst" />
              </div>
              <div className={observed ? 'lmg-photon-trail active' : 'lmg-photon-trail'} />
              <div className={observed ? 'lmg-darkroom-vignette active' : 'lmg-darkroom-vignette'} />
              <div className={observed ? "lmg-darkmask active" : "lmg-darkmask"} />
            </div>
          </div>

          <div className="observation-ribbon luminolglow-observation-row">
            <article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>准备</strong><span>{prepared ? '暗室体系已就位。' : '等待建立暗室体系。'}</span></article>
            <article className={triggered ? 'observation-chip active' : 'observation-chip calm'}><strong>触发</strong><span>{triggered ? '氧化体系已加入。' : '等待触发反应。'}</span></article>
            <article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>发光</strong><span>{observed ? '冷蓝色光已被记录。' : '等待完成发光观察。'}</span></article>
          </div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={'timeline-item ' + entry.state} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={note + '-' + index}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">
{step === 1 ? <>
                <button className="summary-choice generic-choice primary" key="flask" onClick={() => handleIdentify("flask")} type="button"><strong>识别 锥形瓶</strong><span>{identifiedMaterials.includes("flask") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="luminol" onClick={() => handleIdentify("luminol")} type="button"><strong>识别 鲁米诺溶液</strong><span>{identifiedMaterials.includes("luminol") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="oxidant" onClick={() => handleIdentify("oxidant")} type="button"><strong>识别 氧化液</strong><span>{identifiedMaterials.includes("oxidant") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="catalyst" onClick={() => handleIdentify("catalyst")} type="button"><strong>识别 催化液</strong><span>{identifiedMaterials.includes("catalyst") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
                <button className="summary-choice generic-choice primary" key="darkroom" onClick={() => handleIdentify("darkroom")} type="button"><strong>识别 遮光环境</strong><span>{identifiedMaterials.includes("darkroom") ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              </> : null}
{step === 2 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handlePrepare("correct")} type="button"><strong>布置遮光环境并加入鲁米诺反应液</strong><span>建立稳定暗室体系。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handlePrepare("bright-room")} type="button"><strong>在明亮环境中直接等待明显蓝光</strong><span>错误演示：会削弱观察效果。</span></button>
              </> : null}
{step === 3 ? <>
                <button className={'summary-choice generic-choice primary'} onClick={() => handleTrigger("correct")} type="button"><strong>加入氧化液与催化液，启动发光反应</strong><span>进入化学发光阶段。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleTrigger("water")} type="button"><strong>改加清水后期待同样强烈蓝光</strong><span>错误演示：缺少关键反应体系。</span></button>
              </> : null}
{step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve("correct")} type="button"><strong>记录“体系发出明显冷蓝色光，不需要外部照明”</strong><span>这是本实验最典型的现象。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleObserve("only-bubbles")} type="button"><strong>记录“只会出现气泡，不会明显发光”</strong><span>错误演示：忽略化学发光。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleObserve("need-lamp")} type="button"><strong>记录“必须靠外部灯光照亮才看得见颜色”</strong><span>错误演示：误解化学发光。</span></button>
              </> : null}
{step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary("correct")} type="button"><strong>鲁米诺在氧化体系中会发出冷蓝色化学光</strong><span>完整总结本实验结论。</span></button>
                <button className={'summary-choice generic-choice secondary'} onClick={() => handleSummary("fluorescence")} type="button"><strong>这只是普通荧光，停止照射后才发光</strong><span>错误演示：混淆荧光与化学发光。</span></button>
                <button className={'summary-choice generic-choice danger'} onClick={() => handleSummary("heating-only")} type="button"><strong>只要持续加热就一定会稳定发蓝光</strong><span>错误演示：忽略反应条件。</span></button>
              </> : null}
            </div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? "暗室体系已就绪" : "暗室体系待就绪"} / {observed ? "蓝光已出现" : "蓝光待出现"}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? "注意先建立暗室体系，再进行触发与观察。"}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“鲁米诺发光”升级成更具沉浸氛围的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
