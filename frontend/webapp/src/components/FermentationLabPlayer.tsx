import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'flask' | 'balloon';
type MaterialId = 'flask' | 'balloon' | 'yeast' | 'sugar-water' | 'warm-bath';
type TimelineState = 'done' | 'current' | 'todo';

interface FermentationLabPlayerProps {
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
  2: '加入酵母和糖水',
  3: '放入温暖环境',
  4: '观察发酵现象',
  5: '总结发酵特点',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别锥形瓶、气球、酵母、糖水和温水装置。',
  2: '把酵母和糖水加入瓶中，并套好气球。',
  3: '把装置放到适宜温暖环境中。',
  4: '观察瓶内气泡和气球膨胀变化。',
  5: '总结酵母发酵会产生气体并使气球鼓起。',
};

const materialLabels: Record<MaterialId, string> = {
  flask: '锥形瓶',
  balloon: '气球',
  yeast: '酵母',
  'sugar-water': '糖水',
  'warm-bath': '温水环境',
};

const materialOrder: MaterialId[] = ['flask', 'balloon', 'yeast', 'sugar-water', 'warm-bath'];

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

export function FermentationLabPlayer({ experiment, onTelemetry }: FermentationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [mixed, setMixed] = useState(false);
  const [warmed, setWarmed] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先配置酵母糖水，再观察气泡和气球膨胀。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const inflation = warmed ? 78 : mixed ? 28 : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const activityValue = clamp(42 + (mixed ? 18 : 0) + (warmed ? 22 : 0) + (observationChoice === 'correct' ? 12 : 0), 24, 99);
  const clarityValue = clamp(38 + (cameraPreset !== 'bench' ? 10 : 0) + (warmed ? 16 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (mixed ? 12 : 0) + (warmed ? 18 : 0), 20, 100);

  const { reportReset } = useLabTelemetryReporter({ experiment, step, totalSteps: 5, score, errors, prompt, completed, stepLabels: stepTitles, onTelemetry });

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
        setCameraPreset('flask');
        advanceStep(2, '器材识别完成，下一步把酵母和糖水加入瓶中。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleMix = (choice: 'correct' | 'water-only') => {
    if (step !== 2 || completed) return;
    if (choice === 'water-only') {
      markError('只加清水缺少糖分，酵母发酵现象会明显变弱。');
      return;
    }
    setMixed(true);
    appendNote('装置准备：酵母和糖水已加入瓶中，气球已套好。');
    advanceStep(3, '混合完成，下一步把装置放入温暖环境。');
  };

  const handleWarm = (choice: 'warm' | 'cold') => {
    if (step !== 3 || completed) return;
    if (!mixed) {
      markError('请先加入酵母和糖水，再调节环境温度。');
      return;
    }
    if (choice === 'cold') {
      markError('环境过冷会让酵母活性降低，发酵现象不明显。');
      return;
    }
    setWarmed(true);
    setCameraPreset('balloon');
    appendNote('环境控制：装置已放入适宜温暖环境，发酵逐渐增强。');
    advanceStep(4, '温暖环境已建立，请观察气泡和气球变化。');
  };

  const handleObserve = (choice: 'correct' | 'no-change' | 'deflate') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!warmed) {
      markError('请先把装置放入适宜温暖环境，再观察发酵。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：瓶内持续冒泡，产生气体使气球明显鼓起。');
      advanceStep(5, '现象判断正确，最后总结发酵特点。');
      return;
    }
    if (choice === 'no-change') {
      markError('在适宜条件下，酵母发酵不会毫无变化。');
      return;
    }
    markError('发酵产生气体通常会让气球鼓起，而不是瘪下去。');
  };

  const handleSummary = (choice: 'correct' | 'no-gas' | 'only-heat') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：酵母在适宜条件下发酵会产生气体，使气球逐渐鼓起。');
      return;
    }
    if (choice === 'no-gas') {
      markError('本实验的关键现象就是发酵产生气体。');
      return;
    }
    markError('发酵不仅是“变热”，更重要的是会产生气泡和气体。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setMixed(false);
    setWarmed(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新配置酵母糖水并观察发酵。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先加入酵母和糖水，再放到温暖环境。', '重点观察气泡和气球是否逐渐鼓起。', '总结时记住“发酵会产生气体”。']
    : [stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。', experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对发酵现象。', '建议重新执行“加酵母糖水 → 保温 → 观察气球”的流程。'];

  return (
    <section className="panel playground-panel fermentation-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>把酵母糖水、气泡生成和气球鼓起做成连续变化，让发酵现象更像真实课堂实验。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid fermentation-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'flask' ? '锥形瓶观察' : '气球变化'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>活性值 {activityValue}</span><div className="chem-meter-bar"><i style={{ width: `${activityValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card fermentation-data-card"><span className="eyebrow">Readout</span><h3>发酵读数板</h3><div className="generic-readout-grid fermentation-readout-grid"><article className={mixed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装置准备</span><strong>{mixed ? '已加入酵母糖水' : '待加入'}</strong><small>{mixed ? '瓶中发酵底物已准备好。' : '先加入酵母和糖水。'}</small></article><article className={warmed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>环境状态</span><strong>{warmed ? '适宜温暖' : '待保温'}</strong><small>{warmed ? '酵母活性已明显增强。' : '先放入温暖环境。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>气球膨胀</span><strong>{warmed ? `${inflation}%` : '--'}</strong><small>发酵产生气体会让气球逐渐鼓起。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '酵母发酵装置'} · 当前重点：{step <= 2 ? '配置发酵液' : step === 3 ? '保温环境' : '观察气泡与气球'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'flask' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flask')} type="button">锥形瓶</button><button className={cameraPreset === 'balloon' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('balloon')} type="button">气球</button></div></div>

          <div className={`scene-canvas fermentation-stage preset-${cameraPreset} ${mixed ? 'mixed' : ''} ${warmed ? 'warmed' : ''}`}>
            <div className="fermentation-rig">
              <div className={mixed ? 'fe-flask active' : 'fe-flask'}><div className={mixed ? 'fe-liquid active' : 'fe-liquid'} /><div className={warmed ? 'fe-bubble bubble-a active' : 'fe-bubble bubble-a'} /><div className={warmed ? 'fe-bubble bubble-b active' : 'fe-bubble bubble-b'} /><div className={warmed ? 'fe-bubble bubble-c active' : 'fe-bubble bubble-c'} /></div>
              <div className={mixed ? 'fe-neck active' : 'fe-neck'} />
              <div className={mixed ? 'fe-balloon active' : 'fe-balloon'} style={{ transform: `scale(${1 + inflation / 220})` }} />
              <div className={warmed ? 'fe-warmbath active' : 'fe-warmbath'} />
            </div>
          </div>

          <div className="observation-ribbon fermentation-observation-row"><article className={mixed ? 'observation-chip active' : 'observation-chip calm'}><strong>溶液配置</strong><span>{mixed ? '酵母和糖水已加入瓶中。' : '先配置酵母糖水。'}</span></article><article className={warmed ? 'observation-chip active' : 'observation-chip calm'}><strong>环境控制</strong><span>{warmed ? '已处在适宜温暖环境。' : '等待保温。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>发酵现象</strong><span>{observationChoice === 'correct' ? '已观察到气泡增多、气球鼓起。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleMix('correct')} type="button"><strong>加入酵母和糖水并套好气球</strong><span>为发酵提供底物和观察条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleMix('water-only')} type="button"><strong>只加清水不加糖</strong><span>错误演示：发酵现象会变弱。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleWarm('warm')} type="button"><strong>把装置放在适宜温暖环境</strong><span>利于酵母发酵。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleWarm('cold')} type="button"><strong>把装置放在寒冷环境</strong><span>错误演示：酵母活性降低。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“瓶内气泡增多，气球逐渐鼓起”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('no-change')} type="button"><strong>记录“完全没有变化”</strong><span>错误演示：与适宜条件下发酵不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('deflate')} type="button"><strong>记录“气球越来越瘪”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>酵母在适宜条件下发酵会产生气体，使气球鼓起</strong><span>完整总结发酵特点。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-gas')} type="button"><strong>发酵过程中不会产生气体</strong><span>错误演示：忽略关键现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('only-heat')} type="button"><strong>发酵只会让液体变热</strong><span>错误演示：忽略气泡和气体。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{mixed ? '已配置发酵液' : '待配置'} / {warmed ? '已保温' : '待保温'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意底物和温度条件'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“酵母菌发酵”升级成气泡和气球联动的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
