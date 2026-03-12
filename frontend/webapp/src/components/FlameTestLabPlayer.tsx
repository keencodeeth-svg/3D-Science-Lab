import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'flame' | 'salts';
type MaterialId = 'lamp' | 'loop' | 'sodium' | 'copper' | 'dish';
type TimelineState = 'done' | 'current' | 'todo';

interface FlameTestLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别器材',
  2: '点燃酒精灯',
  3: '观察钠盐黄焰',
  4: '观察铜盐绿焰',
  5: '总结焰色特征',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别酒精灯、铂丝（或镍铬丝）环、钠盐、铜盐和瓷皿。',
  2: '点燃酒精灯，建立稳定无烟火焰。',
  3: '让蘸有钠盐的金属丝伸入火焰，观察明亮黄色火焰。',
  4: '更换蘸有铜盐的金属丝，观察火焰转为蓝绿色。',
  5: '总结不同金属离子可以呈现各自特征焰色。',
};

const materialLabels: Record<MaterialId, string> = {
  lamp: '酒精灯',
  loop: '金属丝环',
  sodium: '钠盐样品',
  copper: '铜盐样品',
  dish: '瓷皿',
};

const materialOrder: MaterialId[] = ['lamp', 'loop', 'sodium', 'copper', 'dish'];

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

export function FlameTestLabPlayer({ experiment, onTelemetry }: FlameTestLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [lampLit, setLampLit] = useState(false);
  const [sodiumTested, setSodiumTested] = useState(false);
  const [copperTested, setCopperTested] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过钠盐黄焰与铜盐绿焰观察焰色反应的明显颜色差异。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const flameValue = clamp(24 + (lampLit ? 18 : 0) + (sodiumTested ? 18 : 0) + (copperTested ? 20 : 0), 20, 99);
  const colorValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (sodiumTested ? 24 : 0) + (copperTested ? 24 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (lampLit ? 10 : 0) + (sodiumTested ? 10 : 0) + (copperTested ? 14 : 0), 20, 100);

  const { reportReset } = useLabTelemetryReporter({
    experiment,
    step,
    totalSteps: 5,
    score,
    errors,
    prompt,
    completed,
    stepLabels: stepTitles,
    onTelemetry,
  });

  const appendNote = (note: string) => setLabNotes((current) => [note, ...current].slice(0, 6));
  const markError = (message: string) => {
    setErrors((current) => current + 1);
    setPromptTone('error');
    setPrompt(message);
    appendNote(`错误修正：${message}`);
  };
  const advanceStep = (nextStep: StepId | null, message: string) => {
    setPromptTone('success');
    setPrompt(message);
    if (nextStep === null) {
      setCompleted(true);
      appendNote(`实验完成：${experiment.feedback.successSummary}`);
      return;
    }
    setStep(nextStep);
    appendNote(`步骤推进：进入「${stepTitles[nextStep]}」`);
  };

  const handleIdentify = (materialId: MaterialId) => {
    if (step !== 1 || completed) return;
    setIdentifiedMaterials((current) => {
      if (current.includes(materialId)) return current;
      const next = [...current, materialId];
      appendNote(`材料识别：${materialLabels[materialId]}`);
      if (next.length === materialOrder.length) {
        setCameraPreset('flame');
        advanceStep(2, '器材识别完成，下一步点燃酒精灯。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleLightLamp = (choice: 'correct' | 'cold') => {
    if (step !== 2 || completed) return;
    if (choice === 'cold') {
      markError('需要先点燃酒精灯，建立稳定火焰后再做焰色反应。');
      return;
    }
    setLampLit(true);
    appendNote('火焰建立：酒精灯已形成稳定的蓝色外焰。');
    advanceStep(3, '火焰已建立，下一步检测钠盐焰色。');
  };

  const handleSodium = (choice: 'correct' | 'purple') => {
    if (step !== 3 || completed) return;
    if (!lampLit) {
      markError('请先点燃酒精灯，再进行焰色观察。');
      return;
    }
    if (choice === 'purple') {
      markError('钠盐的典型焰色不是紫色，而是明亮黄色。');
      return;
    }
    setSodiumTested(true);
    appendNote('焰色记录：钠盐在火焰中呈明亮黄色。');
    advanceStep(4, '钠盐黄焰已记录，下一步切换到铜盐绿焰。');
  };

  const handleCopper = (choice: 'correct' | 'yellow') => {
    if (step !== 4 || completed) return;
    if (!sodiumTested) {
      markError('请先完成钠盐焰色观察，再切换到铜盐。');
      return;
    }
    if (choice === 'yellow') {
      markError('铜盐的典型焰色不是黄色，更接近蓝绿色。');
      return;
    }
    setCopperTested(true);
    setCameraPreset('salts');
    appendNote('焰色记录：铜盐在火焰中呈蓝绿色。');
    advanceStep(5, '两种焰色对比已完成，请总结规律。');
  };

  const handleSummary = (choice: 'correct' | 'same' | 'reverse') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：不同金属离子会使火焰呈现不同特征颜色。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'same' ? '不同盐不会呈现完全相同的焰色，钠盐和铜盐差异很明显。' : '不能把钠盐黄焰与铜盐绿焰的对应关系说反。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setLampLit(false);
    setSodiumTested(false);
    setCopperTested(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察焰色反应。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先建立稳定火焰，再逐个测试盐样。', '重点观察钠盐黄焰和铜盐蓝绿色焰。', '保持“点燃 → 钠盐 → 铜盐 → 总结”的顺序。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对焰色对应关系。',
        '建议按“识别 → 点灯 → 看黄焰 → 看绿焰 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel flametest-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把火焰层次、金属丝操作和不同离子的典型焰色做成更接近真实演示实验的场景。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>
      <div className="playground-grid flametest-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'flame' ? '火焰近景' : '盐样近景'}</span></div><span className="badge">{experiment.grade}</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div>
            </div>
          </section>
          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>火焰稳定 {flameValue}</span><div className="chem-meter-bar"><i style={{ width: `${flameValue}%` }} /></div></div>
              <div className="chem-meter"><span>颜色对比 {colorValue}</span><div className="chem-meter-bar"><i style={{ width: `${colorValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
          <section className="info-card flametest-data-card">
            <span className="eyebrow">Readout</span>
            <h3>焰色读数板</h3>
            <div className="generic-readout-grid flametest-readout-grid">
              <article className={lampLit ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>火焰状态</span><strong>{lampLit ? '已点燃' : '--'}</strong><small>{lampLit ? '酒精灯已形成稳定火焰。' : '先点燃酒精灯。'}</small></article>
              <article className={copperTested ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>焰色对比</span><strong>{copperTested ? '黄 / 绿' : '--'}</strong><small>{copperTested ? '钠盐黄焰与铜盐绿焰均已出现。' : '等待完成两次测试。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '焰色有特征' : '等待总结'}</strong><small>金属离子会使火焰呈现各自特征颜色。</small></article>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '焰色反应装置'} · 当前重点：{step <= 2 ? '建立稳定火焰' : step === 3 ? '观察钠盐黄焰' : '观察铜盐绿焰'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'flame' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flame')} type="button">火焰</button>
              <button className={cameraPreset === 'salts' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('salts')} type="button">盐样</button>
            </div>
          </div>

          <div className={`scene-canvas flametest-stage preset-${cameraPreset} ${lampLit ? 'lamp-lit' : ''} ${sodiumTested ? 'sodium-tested' : ''} ${copperTested ? 'copper-tested' : ''}`}>
            <div className="flametest-rig">
              <div className="flt-bench-shadow" />
              <div className="flt-burner-shadow" />
              <div className="flt-base">
                <span className="flt-lamp-neck" />
                <span className="flt-air-intake" />
                <span className="flt-burner-cap" />
                <span className="flt-burner-ring" />
              </div>
              <div className={lampLit ? 'flt-lamp active' : 'flt-lamp'}>
                <div className={copperTested ? 'flt-flame copper active' : sodiumTested ? 'flt-flame sodium active' : lampLit ? 'flt-flame base active' : 'flt-flame'}>
                  <span className="flt-flame-outer" />
                  <span className="flt-flame-core" />
                  <span className="flt-flame-halo" />
                  <span className={lampLit ? 'flt-flame-flicker active' : 'flt-flame-flicker'} />
                </div>
              </div>
              <div className={lampLit ? 'flt-heat-shimmer active' : 'flt-heat-shimmer'} />
              <div className={step >= 3 ? 'flt-loop active sodium' : 'flt-loop'}>
                <span className="flt-loop-handle" />
                <span className="flt-loop-tip" />
                <span className={sodiumTested ? 'flt-loop-glow sodium active' : 'flt-loop-glow sodium'} />
                <span className={sodiumTested ? 'flt-spark sodium active' : 'flt-spark sodium'} />
                <span className={sodiumTested ? 'flt-salt-grains sodium active' : 'flt-salt-grains sodium'} />
              </div>
              <div className={step >= 4 ? 'flt-loop copper active' : 'flt-loop copper'}>
                <span className="flt-loop-handle" />
                <span className="flt-loop-tip" />
                <span className={copperTested ? 'flt-loop-glow copper active' : 'flt-loop-glow copper'} />
                <span className={copperTested ? 'flt-spark copper active' : 'flt-spark copper'} />
                <span className={copperTested ? 'flt-salt-grains copper active' : 'flt-salt-grains copper'} />
              </div>
              <div className={sodiumTested ? 'flt-dish sodium active' : 'flt-dish sodium'}>
                <span className="flt-dish-rim" />
                <span className="flt-dish-shadow" />
                <span className={step >= 3 ? 'flt-dish-crystals sodium active' : 'flt-dish-crystals sodium'} />
              </div>
              <div className={copperTested ? 'flt-dish copper active' : 'flt-dish copper'}>
                <span className="flt-dish-rim" />
                <span className="flt-dish-shadow" />
                <span className={step >= 4 ? 'flt-dish-crystals copper active' : 'flt-dish-crystals copper'} />
              </div>
            </div>
          </div>

          <div className="observation-ribbon flametest-observation-row">
            <article className={lampLit ? 'observation-chip active' : 'observation-chip calm'}><strong>火焰</strong><span>{lampLit ? '酒精灯火焰已稳定。' : '等待点燃酒精灯。'}</span></article>
            <article className={sodiumTested ? 'observation-chip active' : 'observation-chip calm'}><strong>钠盐</strong><span>{sodiumTested ? '已观察到明亮黄焰。' : '等待钠盐焰色。'}</span></article>
            <article className={copperTested ? 'observation-chip active' : 'observation-chip calm'}><strong>铜盐</strong><span>{copperTested ? '已观察到蓝绿色焰。' : '等待铜盐焰色。'}</span></article>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}>
            <span className="eyebrow">Lab Prompt</span>
            <h3>{completed ? '实验已完成' : stepTitles[step]}</h3>
            <p>{prompt}</p>
          </div>

          <section className="info-card generic-notebook-card">
            <div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div>
            <div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div>
            <div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div>
          </section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>当前步骤操作</h3>
            <div className="summary-stack generic-choice-stack">
              {step === 1 ? materialOrder.map((materialId) => (
                <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              )) : null}
              {step === 2 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleLightLamp('correct')} type="button"><strong>点燃酒精灯，建立稳定火焰</strong><span>焰色观察必须先有稳定火焰。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleLightLamp('cold')} type="button"><strong>不点火直接判断焰色</strong><span>错误演示：没有观察基础。</span></button>
              </> : null}
              {step === 3 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleSodium('correct')} type="button"><strong>让蘸有钠盐的金属丝伸入火焰，观察黄色焰</strong><span>记录钠盐的典型焰色。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleSodium('purple')} type="button"><strong>记录“钠盐显紫色火焰”</strong><span>错误演示：颜色判断错误。</span></button>
              </> : null}
              {step === 4 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleCopper('correct')} type="button"><strong>换用铜盐，再观察蓝绿色火焰</strong><span>完成两种离子的焰色对照。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleCopper('yellow')} type="button"><strong>记录“铜盐也呈明亮黄色”</strong><span>错误演示：忽略差异。</span></button>
              </> : null}
              {step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>不同金属离子会使火焰呈现不同特征颜色</strong><span>完整总结焰色反应规律。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('same')} type="button"><strong>只要是盐，焰色基本都会完全一样</strong><span>错误演示：与实验现象不符。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleSummary('reverse')} type="button"><strong>钠盐显绿焰，铜盐显黄焰</strong><span>错误演示：把对应关系说反了。</span></button>
              </> : null}
            </div>
          </section>
          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{lampLit ? '火焰已建立' : '火焰待建立'} / {copperTested ? '双盐对照已完成' : '双盐对照待完成'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先点灯，再逐个测试盐样'}</li>
            </ul>
          </section>
          <section className="info-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul>
          </section>
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>实验控制</h3>
            <div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div>
            <small>这页已把“焰色反应”升级成火焰层次和盐样切换都更清晰的专属实验页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
