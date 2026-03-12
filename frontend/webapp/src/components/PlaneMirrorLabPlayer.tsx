import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'mirror' | 'scale';
type MaterialId = 'glass-plate' | 'object-candle' | 'image-candle' | 'scale' | 'screen';
type AlignmentState = 'none' | 'near' | 'equal' | 'far';
type TimelineState = 'done' | 'current' | 'todo';

interface PlaneMirrorLabPlayerProps {
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
  2: '放置物体蜡烛',
  3: '对齐像蜡烛',
  4: '比较像距物距',
  5: '总结成像规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别玻璃板、物体蜡烛、像蜡烛、刻度尺和挡光屏。',
  2: '把物体蜡烛放在玻璃板前固定位置，建立成像基准。',
  3: '移动像蜡烛，让它与玻璃板中的像完全重合。',
  4: '比较物体到镜面和像到镜面的距离是否相等。',
  5: '总结平面镜所成像的大小、正倒和虚实特点。',
};

const materialLabels: Record<MaterialId, string> = {
  'glass-plate': '玻璃板',
  'object-candle': '物体蜡烛',
  'image-candle': '像蜡烛',
  scale: '刻度尺',
  screen: '挡光屏',
};

const materialOrder: MaterialId[] = ['glass-plate', 'object-candle', 'image-candle', 'scale', 'screen'];

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

export function PlaneMirrorLabPlayer({ experiment, onTelemetry }: PlaneMirrorLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [objectPlaced, setObjectPlaced] = useState(false);
  const [alignment, setAlignment] = useState<AlignmentState>('none');
  const [distanceChoice, setDistanceChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先固定物体蜡烛，再移动像蜡烛找重合位置。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const imageReady = objectPlaced && alignment !== 'none';
  const equalDistance = alignment === 'equal';
  const imageDistance = alignment === 'near' ? 4 : alignment === 'equal' ? 6 : alignment === 'far' ? 8 : 0;
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const alignmentValue = clamp(40 + (objectPlaced ? 16 : 0) + (equalDistance ? 26 : alignment === 'near' || alignment === 'far' ? 10 : 0), 24, 99);
  const clarityValue = clamp(42 + (imageReady ? 14 : 0) + (distanceChoice === 'correct' ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 28, 99);
  const readinessValue = clamp(progressPercent + (objectPlaced ? 14 : 0) + (equalDistance ? 18 : 0), 20, 100);

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
        setCameraPreset('mirror');
        advanceStep(2, '器材识别完成，先固定玻璃板前的物体蜡烛。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleObject = (choice: 'place' | 'skip') => {
    if (step !== 2 || completed) return;
    if (choice === 'skip') {
      markError('必须先固定物体蜡烛的位置，才有基准去找像。');
      return;
    }
    setObjectPlaced(true);
    appendNote('装置准备：物体蜡烛已固定在镜前 6 cm 位置。');
    advanceStep(3, '基准已建立，下一步移动像蜡烛寻找重合位置。');
  };

  const handleAlign = (choice: AlignmentState) => {
    if (step !== 3 || completed || choice === 'none') return;
    if (!objectPlaced) {
      markError('请先放置物体蜡烛。');
      return;
    }
    setAlignment(choice);
    setCameraPreset(choice === 'equal' ? 'scale' : 'mirror');
    appendNote(`像位调节：像蜡烛已移到${choice === 'near' ? '近处' : choice === 'equal' ? '重合位置' : '远处'}。`);
    if (choice === 'equal') {
      advanceStep(4, '像蜡烛已与像重合，开始比较镜前镜后的距离。');
      return;
    }
    markError(choice === 'near' ? '像蜡烛离镜面太近，还没有与像完全重合。' : '像蜡烛离镜面太远，请重新微调位置。');
  };

  const handleDistance = (choice: 'correct' | 'larger' | 'smaller') => {
    if (step !== 4 || completed) return;
    setDistanceChoice(choice);
    if (!equalDistance) {
      markError('请先把像蜡烛调到与像重合的位置。');
      return;
    }
    if (choice === 'correct') {
      appendNote('结果记录：像距与物距相等，且像与物大小相当。');
      advanceStep(5, '距离关系记录完成，最后总结平面镜成像规律。');
      return;
    }
    if (choice === 'larger') {
      markError('平面镜成像中，像距并不比物距更大。');
      return;
    }
    markError('像距也不会比物距更小，它们应当相等。');
  };

  const handleSummary = (choice: 'correct' | 'real' | 'inverted') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：平面镜成正立、等大的虚像，且像距等于物距。');
      return;
    }
    if (choice === 'real') {
      markError('平面镜所成的是虚像，挡光屏接不到。');
      return;
    }
    markError('平面镜成像是正立的，不是倒立实像。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setObjectPlaced(false);
    setAlignment('none');
    setDistanceChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新固定物体蜡烛并比较像距物距。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先固定物体蜡烛，再移动像蜡烛，顺序不能反。',
        '当像蜡烛与像完全重合时，再读取镜前镜后的距离。',
        '挡光屏接不到像，说明平面镜成的是虚像。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对像的位置。',
        '建议先把像蜡烛调到与像重合，再读两侧距离。',
      ];

  return (
    <section className="panel playground-panel mirror-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把“找像—对齐—读距”做成真实镜面场景，让平面镜成像规律不再只是背结论。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid mirror-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'mirror' ? '镜面观察' : '刻度观察'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>对齐值 {alignmentValue}</span><div className="chem-meter-bar"><i style={{ width: `${alignmentValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card mirror-data-card"><span className="eyebrow">Readout</span><h3>成像读数板</h3><div className="generic-readout-grid mirror-readout-grid"><article className={objectPlaced ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>物距</span><strong>{objectPlaced ? '6 cm' : '--'}</strong><small>物体蜡烛已固定在镜前标准位置。</small></article><article className={imageReady ? equalDistance ? 'lab-readout-card active' : 'lab-readout-card warn' : 'lab-readout-card calm'}><span>像距</span><strong>{imageReady ? `${imageDistance} cm` : '--'}</strong><small>{equalDistance ? '像距与物距匹配。' : '继续移动像蜡烛直到重合。'}</small></article><article className={distanceChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>像的性质</span><strong>{distanceChoice === 'correct' ? '正立、等大、虚像' : '等待总结'}</strong><small>挡光屏接不到像，是判断虚像的重要依据。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '平面镜'} · 当前重点：{step <= 2 ? '建立基准' : step === 3 ? '寻找重合' : '比较距离'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'mirror' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('mirror')} type="button">镜面</button><button className={cameraPreset === 'scale' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('scale')} type="button">刻度</button></div></div>

          <div className={`scene-canvas mirror-stage preset-${cameraPreset}`}>
            <div className="mirror-rig">
              <div className="mirror-ruler" />
              <div className="mirror-board">
                <div className="mirror-sheen" />
              </div>
              <div className={objectPlaced ? 'mirror-candle object active' : 'mirror-candle object'}>
                <div className="mirror-body" />
                <div className="mirror-flame" />
              </div>
              <div className={alignment !== 'none' ? `mirror-candle image active ${alignment}` : 'mirror-candle image'}>
                <div className="mirror-body" />
                <div className="mirror-flame ghost" />
              </div>
              <div className={objectPlaced ? 'mirror-image-glow active' : 'mirror-image-glow'} />
              <div className={objectPlaced ? 'mirror-distance-line left active' : 'mirror-distance-line left'} />
              <div className={imageReady ? 'mirror-distance-line right active' : 'mirror-distance-line right'} />
            </div>
          </div>

          <div className="observation-ribbon mirror-observation-row"><article className={objectPlaced ? 'observation-chip active' : 'observation-chip calm'}><strong>物体位置</strong><span>{objectPlaced ? '物体蜡烛已固定，成像基准明确。' : '先放置物体蜡烛。'}</span></article><article className={equalDistance ? 'observation-chip active' : alignment === 'none' ? 'observation-chip calm' : 'observation-chip warn'}><strong>像位对齐</strong><span>{equalDistance ? '像蜡烛与像完全重合。' : alignment === 'none' ? '等待寻找像的位置。' : '像位仍需微调。'}</span></article><article className={distanceChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>距离关系</strong><span>{distanceChoice === 'correct' ? '像距等于物距，规律已锁定。' : '等待比较镜前镜后距离。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleObject('place')} type="button"><strong>固定物体蜡烛到镜前</strong><span>建立读数基准。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObject('skip')} type="button"><strong>不放物体直接找像</strong><span>错误演示：没有成像基准。</span></button></> : null}{step === 3 ? <><button className={alignment === 'near' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleAlign('near')} type="button"><strong>像蜡烛靠得更近</strong><span>还没有与像完全重合。</span></button><button className={alignment === 'equal' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleAlign('equal')} type="button"><strong>调到与像完全重合</strong><span>这是正确的读数位置。</span></button><button className={alignment === 'far' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleAlign('far')} type="button"><strong>像蜡烛放得更远</strong><span>错误演示：对齐过头。</span></button></> : null}{step === 4 ? <><button className={distanceChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleDistance('correct')} type="button"><strong>记录“像距等于物距”</strong><span>对应镜前镜后的对称关系。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleDistance('larger')} type="button"><strong>记录“像距更大”</strong><span>错误演示：与读数不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleDistance('smaller')} type="button"><strong>记录“像距更小”</strong><span>错误演示：与读数不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>平面镜成正立、等大的虚像，像距等于物距</strong><span>完整总结本实验规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('real')} type="button"><strong>平面镜成的是实像</strong><span>错误演示：挡光屏接不到像。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('inverted')} type="button"><strong>平面镜成倒立像</strong><span>错误演示：与现象不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{objectPlaced ? '物体已固定' : '待放置物体'} / 像距 {imageReady ? `${imageDistance} cm` : '--'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先对齐再读数'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“平面镜成像”升级成可对齐、可读距、可总结的镜面实验台。</small></section>
        </aside>
      </div>
    </section>
  );
}
