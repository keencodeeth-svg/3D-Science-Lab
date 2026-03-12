import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'flame' | 'dome';
type MaterialId = 'candle' | 'glass-dome' | 'lighter' | 'tray' | 'airflow-card';
type TimelineState = 'done' | 'current' | 'todo';

interface CombustionLabPlayerProps {
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
  2: '点燃蜡烛',
  3: '罩上玻璃罩',
  4: '观察火焰变化',
  5: '总结燃烧条件',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别蜡烛、玻璃罩、点火器、托盘和空气条件提示卡。',
  2: '先点燃蜡烛，建立稳定燃烧现象。',
  3: '再把玻璃罩扣在蜡烛上方，比较罩内外火焰状态。',
  4: '观察火焰先减弱再熄灭的过程，并思考与空气的关系。',
  5: '把可燃物、氧气和达到着火点三项条件完整总结出来。',
};

const materialLabels: Record<MaterialId, string> = {
  candle: '蜡烛',
  'glass-dome': '玻璃罩',
  lighter: '点火器',
  tray: '托盘',
  'airflow-card': '空气条件卡',
};

const materialOrder: MaterialId[] = ['candle', 'glass-dome', 'lighter', 'tray', 'airflow-card'];

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

export function CombustionLabPlayer({ experiment, onTelemetry }: CombustionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [candleLit, setCandleLit] = useState(false);
  const [covered, setCovered] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先点燃蜡烛，再用玻璃罩比较燃烧变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const flameState = !candleLit ? '未点燃' : covered ? '减弱后熄灭' : '稳定燃烧';
  const oxygenState = !candleLit ? '待点燃' : covered ? '罩内氧气减少' : '空气充足';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const safetyValue = clamp(48 + (candleLit ? 18 : 0) + (covered ? 16 : 0), 26, 99);
  const clarityValue = clamp(44 + (covered ? 14 : 0) + (observationChoice === 'correct' ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 28, 99);
  const readinessValue = clamp(progressPercent + (candleLit ? 16 : 0) + (covered ? 16 : 0), 20, 100);

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
        advanceStep(2, '器材识别完成，先点燃蜡烛建立稳定火焰。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleIgnite = (choice: 'ignite' | 'cover') => {
    if (step !== 2 || completed) return;
    if (choice === 'cover') {
      markError('要先让蜡烛稳定燃烧，再比较玻璃罩扣上后的变化。');
      return;
    }
    setCandleLit(true);
    appendNote('点火记录：蜡烛已被点燃，火焰稳定。');
    advanceStep(3, '火焰已经建立，下一步罩上玻璃罩比较空气变化。');
  };

  const handleCover = (choice: 'cover' | 'fan') => {
    if (step !== 3 || completed) return;
    if (!candleLit) {
      markError('请先点燃蜡烛，再进行玻璃罩比较。');
      return;
    }
    if (choice === 'fan') {
      markError('本实验重点是隔绝空气，不是用扇风改变火焰。');
      return;
    }
    setCovered(true);
    setCameraPreset('dome');
    appendNote('装置操作：已将玻璃罩扣在蜡烛上方。');
    advanceStep(4, '玻璃罩已扣上，开始观察火焰如何变化。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'stronger') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!covered) {
      markError('请先把玻璃罩扣上，再比较火焰变化。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：罩内火焰逐渐减弱，随后熄灭。');
      advanceStep(5, '现象观察完成，最后总结燃烧需要满足哪些条件。');
      return;
    }
    if (choice === 'same') {
      markError('罩内火焰并不会一直不变，氧气减少后会熄灭。');
      return;
    }
    markError('罩上玻璃罩后火焰不会更旺，反而会因缺少氧气而熄灭。');
  };

  const handleSummary = (choice: 'correct' | 'fuel-only' | 'oxygen-only') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：燃烧需要可燃物、与氧气接触，并达到着火点。');
      return;
    }
    if (choice === 'fuel-only') {
      markError('只有可燃物并不够，还需要氧气和达到着火点。');
      return;
    }
    markError('只有氧气也不能单独决定燃烧，还必须有可燃物并达到着火点。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setCandleLit(false);
    setCovered(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察玻璃罩扣上后蜡烛燃烧变化。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先点燃蜡烛，再罩上玻璃罩，不要颠倒顺序。',
        '观察重点是火焰先减弱后熄灭，而不是瞬间消失。',
        '总结时要把“可燃物、氧气、着火点”三项条件说完整。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对现象变化。',
        '建议重新执行“点燃 → 罩上玻璃罩 → 观察火焰变化”的流程。',
      ];

  return (
    <section className="panel playground-panel combustion-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把点火、隔绝空气和火焰减弱过程做成连续可视化场景，让“燃烧条件”不再只是背结论。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid combustion-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'flame' ? '火焰观察' : '玻璃罩观察'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>规范值 {safetyValue}</span><div className="chem-meter-bar"><i style={{ width: `${safetyValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card combustion-data-card"><span className="eyebrow">Readout</span><h3>燃烧读数板</h3><div className="generic-readout-grid combustion-readout-grid"><article className={candleLit ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>火焰状态</span><strong>{flameState}</strong><small>{candleLit ? '罩内空气减少后，火焰会逐渐熄灭。' : '先建立稳定燃烧火焰。'}</small></article><article className={covered ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>空气条件</span><strong>{oxygenState}</strong><small>{covered ? '玻璃罩限制了持续空气供应。' : '未罩上玻璃罩时空气较充足。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心条件</span><strong>{summaryChoice === 'correct' ? '三项条件齐全' : '等待总结'}</strong><small>可燃物、与氧气接触、达到着火点缺一不可。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '蜡烛与玻璃罩'} · 当前重点：{step <= 2 ? '建立燃烧' : step === 3 ? '隔绝空气' : '观察熄灭'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'flame' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flame')} type="button">火焰</button><button className={cameraPreset === 'dome' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('dome')} type="button">玻璃罩</button></div></div>

          <div className={`scene-canvas combustion-stage preset-${cameraPreset} ${candleLit ? 'lit' : ''} ${covered ? 'covered' : ''}`}>
            <div className="combustion-rig">
              <div className="combustion-table-glow" />
              <div className="combustion-tray" />
              <div className="combustion-candle">
                <div className="combustion-wax" />
                <div className={candleLit ? covered ? 'combustion-flame low' : 'combustion-flame active' : 'combustion-flame'} />
                <div className={candleLit && covered ? 'combustion-smoke active' : 'combustion-smoke'}>
                  <span className="smoke-wisp smoke-1" />
                  <span className="smoke-wisp smoke-2" />
                  <span className="smoke-wisp smoke-3" />
                </div>
              </div>
              <div className={covered ? 'combustion-dome active' : 'combustion-dome'}>
                <div className="combustion-dome-reflection" />
                <div className={covered ? 'oxygen-ring active' : 'oxygen-ring'} />
              </div>
              <div className={candleLit ? 'combustion-lighter active' : 'combustion-lighter'} />
            </div>
          </div>

          <div className="observation-ribbon combustion-observation-row"><article className={candleLit ? 'observation-chip active' : 'observation-chip calm'}><strong>点火现象</strong><span>{candleLit ? '蜡烛已稳定燃烧，可进行后续比较。' : '先点燃蜡烛建立基准。'}</span></article><article className={covered ? 'observation-chip active' : 'observation-chip calm'}><strong>空气变化</strong><span>{covered ? '玻璃罩扣上后，罩内空气逐渐不足。' : '等待隔绝空气操作。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>火焰结果</strong><span>{observationChoice === 'correct' ? '火焰逐渐减弱并熄灭。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleIgnite('ignite')} type="button"><strong>点燃蜡烛</strong><span>先建立稳定燃烧现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleIgnite('cover')} type="button"><strong>先直接罩上玻璃罩</strong><span>错误演示：没有燃烧基准。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleCover('cover')} type="button"><strong>扣上玻璃罩</strong><span>比较罩内外空气条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCover('fan')} type="button"><strong>对着火焰扇风</strong><span>错误演示：偏离本实验变量。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“火焰逐渐减弱后熄灭”</strong><span>对应罩内氧气减少的现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“火焰一直不变”</strong><span>错误演示：忽略空气变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('stronger')} type="button"><strong>记录“火焰越来越旺”</strong><span>错误演示：与实际现象相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>燃烧需要可燃物、氧气和达到着火点</strong><span>完整总结三项条件。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('fuel-only')} type="button"><strong>只要有可燃物就一定能燃烧</strong><span>错误演示：条件不完整。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('oxygen-only')} type="button"><strong>只要有氧气就能燃烧</strong><span>错误演示：忽略可燃物和着火点。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{candleLit ? '蜡烛已点燃' : '待点火'} / {covered ? '玻璃罩已扣上' : '未扣玻璃罩'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先观察再总结'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“燃烧的条件”升级成点火、隔绝空气和火焰衰减一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
