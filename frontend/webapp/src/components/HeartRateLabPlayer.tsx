import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'wrist' | 'chart';
type MaterialId = 'timer' | 'pulse-chart' | 'exercise-pad' | 'record-sheet' | 'heart-model';
type TimelineState = 'done' | 'current' | 'todo';

interface HeartRateLabPlayerProps {
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
  2: '测静息心率',
  3: '完成短时运动',
  4: '测运动后心率',
  5: '总结变化原因',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别计时器、脉搏图、运动垫、记录表和心脏模型。',
  2: '在静息状态下测量脉搏，得到基础心率。',
  3: '完成短时运动，再准备第二次测量。',
  4: '比较运动前后心率变化，记录运动后读数。',
  5: '总结运动后心率为什么会增快。',
};

const materialLabels: Record<MaterialId, string> = {
  timer: '计时器',
  'pulse-chart': '脉搏图',
  'exercise-pad': '运动垫',
  'record-sheet': '记录表',
  'heart-model': '心脏模型',
};

const materialOrder: MaterialId[] = ['timer', 'pulse-chart', 'exercise-pad', 'record-sheet', 'heart-model'];
const restPulse = 72;
const activePulse = 118;

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

export function HeartRateLabPlayer({ experiment, onTelemetry }: HeartRateLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [restMeasured, setRestMeasured] = useState(false);
  const [exercised, setExercised] = useState(false);
  const [afterChoice, setAfterChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先测静息心率，再运动后复测做对照。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const currentPulse = afterChoice === 'correct' ? activePulse : restMeasured ? restPulse : 0;
  const pulseState = afterChoice === 'correct' ? '运动后明显升高' : exercised ? '等待复测' : restMeasured ? '静息稳定' : '待测';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const compareValue = clamp(40 + (restMeasured ? 16 : 0) + (exercised ? 16 : 0) + (afterChoice === 'correct' ? 18 : 0), 24, 99);
  const clarityValue = clamp(42 + (restMeasured ? 10 : 0) + (afterChoice === 'correct' ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (restMeasured ? 14 : 0) + (exercised ? 14 : 0) + (afterChoice === 'correct' ? 16 : 0), 20, 100);

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
        setCameraPreset('wrist');
        advanceStep(2, '器材识别完成，先测静息状态下的脉搏。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleRest = (choice: 'rest' | 'exercise') => {
    if (step !== 2 || completed) return;
    if (choice === 'exercise') {
      markError('要先测静息心率，才能和运动后结果做对照。');
      return;
    }
    setRestMeasured(true);
    appendNote(`测量记录：静息心率约为 ${restPulse} 次/分。`);
    advanceStep(3, '静息心率已记录，下一步进行短时运动。');
  };

  const handleExercise = (choice: 'exercise' | 'skip') => {
    if (step !== 3 || completed) return;
    if (!restMeasured) {
      markError('请先测静息心率，再进行运动。');
      return;
    }
    if (choice === 'skip') {
      markError('没有运动就无法比较心率变化。');
      return;
    }
    setExercised(true);
    setCameraPreset('chart');
    appendNote('过程记录：已完成 30 秒短时运动，准备复测心率。');
    advanceStep(4, '运动已完成，开始判断运动后的心率读数。');
  };

  const handleAfter = (choice: 'correct' | 'same' | 'lower') => {
    if (step !== 4 || completed) return;
    setAfterChoice(choice);
    if (!exercised) {
      markError('请先完成短时运动，再比较运动后心率。');
      return;
    }
    if (choice === 'correct') {
      appendNote(`测量记录：运动后心率升高到约 ${activePulse} 次/分。`);
      advanceStep(5, '前后对照完成，最后总结心率变化原因。');
      return;
    }
    if (choice === 'same') {
      markError('运动后心率一般不会和静息状态完全相同。');
      return;
    }
    markError('短时运动后心率通常不会更低，而会明显增快。');
  };

  const handleSummary = (choice: 'correct' | 'no-change' | 'less-oxygen') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：运动后身体需要更多氧气和营养，心率会增快以满足需要。');
      return;
    }
    if (choice === 'no-change') {
      markError('运动后身体需求增加，心率不会一直保持不变。');
      return;
    }
    markError('心率增快不是为了让身体得到更少氧气，而是为了运输更多氧气和营养。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setRestMeasured(false);
    setExercised(false);
    setAfterChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新比较静息和运动后的心率变化。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '一定先测静息心率，再做运动后复测。',
        '前后对照时重点看次数变化，而不是只看有没有跳动。',
        '总结时要把“身体需要更多氧气和营养”说出来。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对前后变化。',
        '建议重新执行“静息测量 → 短时运动 → 再测心率”的流程。',
      ];

  return (
    <section className="panel playground-panel heartrate-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>把静息、运动、复测做成完整对照流程，让“心率为什么会增快”从结论变成可以直接看见的数据变化。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid heartrate-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'wrist' ? '脉搏观察' : '图表观察'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>对照值 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card heartrate-data-card"><span className="eyebrow">Readout</span><h3>心率读数板</h3><div className="generic-readout-grid heartrate-readout-grid"><article className={restMeasured ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>静息心率</span><strong>{restMeasured ? `${restPulse} 次/分` : '--'}</strong><small>静息状态是后续比较的基准。</small></article><article className={afterChoice === 'correct' ? 'lab-readout-card active' : exercised ? 'lab-readout-card warn' : 'lab-readout-card calm'}><span>运动后心率</span><strong>{afterChoice === 'correct' ? `${activePulse} 次/分` : exercised ? '待判断' : '--'}</strong><small>{afterChoice === 'correct' ? '短时运动后心率明显升高。' : '完成运动后再复测。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{pulseState}</strong><small>运动时身体需要更多氧气和营养，因此心率会增快。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '脉搏与记录表'} · 当前重点：{step <= 2 ? '建立静息基准' : step === 3 ? '完成运动' : '比较前后心率'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'wrist' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('wrist')} type="button">脉搏</button><button className={cameraPreset === 'chart' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('chart')} type="button">图表</button></div></div>

          <div className={`scene-canvas heartrate-stage preset-${cameraPreset} ${restMeasured ? 'rest' : ''} ${exercised ? 'exercise' : ''} ${afterChoice === 'correct' ? 'raised' : ''}`}>
            <div className="heartrate-rig">
              <div className="heartrate-card">
                <div className={`heart-figure ${afterChoice === 'correct' ? 'active' : restMeasured ? 'resting' : ''}`} />
                <div className="pulse-wave">
                  <span className="pulse-line line-a" />
                  <span className="pulse-line line-b" />
                  <span className="pulse-line line-c" />
                </div>
              </div>
              <div className="heartrate-meter rest"><strong>{restMeasured ? restPulse : '--'}</strong><small>静息</small></div>
              <div className="heartrate-meter active"><strong>{afterChoice === 'correct' ? activePulse : '--'}</strong><small>运动后</small></div>
              <div className={`exercise-ring ${exercised ? 'active' : ''}`} />
            </div>
          </div>

          <div className="observation-ribbon heartrate-observation-row"><article className={restMeasured ? 'observation-chip active' : 'observation-chip calm'}><strong>静息状态</strong><span>{restMeasured ? `静息心率约 ${restPulse} 次/分。` : '先完成静息心率测量。'}</span></article><article className={exercised ? 'observation-chip active' : 'observation-chip calm'}><strong>运动过程</strong><span>{exercised ? '短时运动已完成，身体耗氧需求上升。' : '完成运动后再进行复测。'}</span></article><article className={afterChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>前后对照</strong><span>{afterChoice === 'correct' ? '运动后心率明显高于静息状态。' : '等待完成运动后复测。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRest('rest')} type="button"><strong>测静息心率</strong><span>建立后续对照基准。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRest('exercise')} type="button"><strong>先去运动</strong><span>错误演示：没有静息基准。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleExercise('exercise')} type="button"><strong>完成 30 秒短时运动</strong><span>为复测心率制造变化条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleExercise('skip')} type="button"><strong>跳过运动直接复测</strong><span>错误演示：缺少变量变化。</span></button></> : null}{step === 4 ? <><button className={afterChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleAfter('correct')} type="button"><strong>记录“运动后约 118 次/分，更高”</strong><span>这是本实验的正确读数方向。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleAfter('same')} type="button"><strong>记录“和静息时一样”</strong><span>错误演示：忽略运动影响。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAfter('lower')} type="button"><strong>记录“运动后更低”</strong><span>错误演示：与常见现象相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>运动后身体需要更多氧气和营养，所以心率增快</strong><span>完整解释前后变化原因。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-change')} type="button"><strong>运动和静息时心率不会变化</strong><span>错误演示：与实验数据不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('less-oxygen')} type="button"><strong>心率增快是为了让身体得到更少氧气</strong><span>错误演示：因果方向错误。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{restMeasured ? '静息已测' : '待测静息'} / {exercised ? '已运动' : '待运动'} / {afterChoice === 'correct' ? '已复测' : '待复测'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先测前后再总结'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“心率变化”升级成静息—运动—复测三段式专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
