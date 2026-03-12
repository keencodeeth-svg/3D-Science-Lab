import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5 | 6;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'burette' | 'endpoint';
type ToolId = 'burette' | 'conical-flask' | 'indicator' | 'standard-solution' | 'wash-bottle';
type DripMode = 'idle' | 'rapid' | 'standard';
type TimelineState = 'done' | 'current' | 'todo';

interface TitrationLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别仪器与试剂',
  2: '安装滴定管',
  3: '加入待测液与指示剂',
  4: '调整滴定速度',
  5: '观察终点颜色',
  6: '总结关键控制点',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别滴定管、锥形瓶、酚酞、标准溶液和洗瓶。',
  2: '把滴定管固定到位，并检查液面、活塞和初始状态。',
  3: '向锥形瓶中加入待测液，再滴加指示剂，准备进入滴定。',
  4: '接近终点时切换为逐滴滴加，并轻轻振荡锥形瓶。',
  5: '观察终点颜色，应以浅粉红且短时间不褪色为准。',
  6: '总结装置检查、滴速控制和终点判断三个关键点。',
};

const toolLabels: Record<ToolId, string> = {
  burette: '滴定管',
  'conical-flask': '锥形瓶',
  indicator: '酚酞指示剂',
  'standard-solution': '标准溶液',
  'wash-bottle': '洗瓶',
};

const toolOrder: ToolId[] = ['burette', 'conical-flask', 'indicator', 'standard-solution', 'wash-bottle'];
const titrationStepOrder: StepId[] = [1, 2, 3, 4, 5, 6];

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

export function TitrationLabPlayer({ experiment, onTelemetry }: TitrationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedTools, setIdentifiedTools] = useState<ToolId[]>([]);
  const [buretteMounted, setBuretteMounted] = useState(false);
  const [buretteChecked, setBuretteChecked] = useState(false);
  const [analyteAdded, setAnalyteAdded] = useState(false);
  const [indicatorAdded, setIndicatorAdded] = useState(false);
  const [dripMode, setDripMode] = useState<DripMode>('idle');
  const [flaskSwirled, setFlaskSwirled] = useState(false);
  const [endpointRecorded, setEndpointRecorded] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先完成装置检查，再进行滴定控制和终点判断。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const setupReady = buretteMounted && buretteChecked;
  const reagentReady = analyteAdded && indicatorAdded;
  const dripReady = dripMode === 'standard' && flaskSwirled;
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 6) * 100);
  const score = Math.max(80, 100 - errors * 4);
  const safetyValue = clamp(95 - errors * 5 - (dripMode === 'rapid' ? 8 : 0), 48, 99);
  const precisionValue = clamp(42 + (setupReady ? 18 : 0) + (reagentReady ? 12 : 0) + (dripMode === 'standard' ? 10 : 0) + (flaskSwirled ? 8 : 0) + (endpointRecorded ? 14 : 0) - (dripMode === 'rapid' ? 12 : 0), 32, 99);
  const readinessValue = clamp(progressPercent + (setupReady ? 16 : 0) + (reagentReady ? 16 : 0) + (endpointRecorded ? 18 : 0), 20, 100);
  const meniscusValue = endpointRecorded ? '18.64 mL' : dripMode === 'rapid' ? '19.80 mL' : setupReady ? '25.00 mL' : '待校准';
  const endpointTone = endpointRecorded ? '浅粉红 30 秒不褪' : reagentReady ? '待观察终点' : '待加样';
  const buretteFillPercent = endpointRecorded ? 46 : dripMode === 'standard' ? 58 : dripMode === 'rapid' ? 52 : setupReady ? 72 : 82;

  const { reportReset } = useLabTelemetryReporter({
    experiment,
    step,
    totalSteps: 6,
    score,
    errors,
    prompt,
    completed,
    stepLabels: stepTitles,
    onTelemetry,
  });

  const appendNote = (note: string) => {
    setLabNotes((current) => [note, ...current].slice(0, 6));
  };

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

  const handleIdentify = (toolId: ToolId) => {
    if (step !== 1 || completed) return;
    setIdentifiedTools((current) => {
      if (current.includes(toolId)) return current;
      const next = [...current, toolId];
      appendNote(`仪器识别：${toolLabels[toolId]}`);
      if (next.length === toolOrder.length) {
        setCameraPreset('burette');
        advanceStep(2, '识别完成，下一步固定滴定管并检查初始状态。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${toolOrder.length} 个对象，请继续完成识别。`);
      }
      return next;
    });
  };

  const handleSetup = (action: 'mount' | 'check' | 'skip') => {
    if (step !== 2 || completed) return;

    if (action === 'skip') {
      markError('滴定前必须先固定滴定管并检查液面与活塞状态，不能直接开始。');
      return;
    }

    const nextMounted = action === 'mount' ? true : buretteMounted;
    const nextChecked = action === 'check' ? true : buretteChecked;

    if (action === 'check' && !buretteMounted) {
      markError('请先把滴定管固定到铁架台，再检查液面和活塞。');
      return;
    }

    if (action === 'mount' && !buretteMounted) {
      setBuretteMounted(true);
      appendNote('装置搭建：滴定管已固定在实验位。');
    }

    if (action === 'check' && !buretteChecked) {
      setBuretteChecked(true);
      appendNote('装置检查：已确认液面、活塞和初始读数。');
    }

    if (nextMounted && nextChecked) {
      setCameraPreset('endpoint');
      advanceStep(3, '滴定管准备完成，下一步向锥形瓶加入待测液和指示剂。');
      return;
    }

    setPromptTone('success');
    setPrompt(nextMounted ? '滴定管已固定，请继续检查液面和活塞状态。' : '请先把滴定管固定到实验位。');
  };

  const handleAdd = (action: 'analyte' | 'indicator' | 'skip-indicator') => {
    if (step !== 3 || completed) return;

    if (action === 'skip-indicator') {
      markError('中和滴定需要指示剂辅助判断终点，不能省略。');
      return;
    }

    if (action === 'analyte') {
      if (analyteAdded) return;
      setAnalyteAdded(true);
      appendNote('加样记录：已向锥形瓶加入待测液。');
      if (indicatorAdded) {
        advanceStep(4, '待测液与指示剂均已加入，下一步控制滴速并轻轻振荡。');
      } else {
        setPromptTone('success');
        setPrompt('待测液已加入，请继续滴加指示剂。');
      }
      return;
    }

    if (!analyteAdded) {
      markError('应先向锥形瓶加入待测液，再滴加酚酞指示剂。');
      return;
    }

    if (!indicatorAdded) {
      setIndicatorAdded(true);
      appendNote('加样记录：已滴加酚酞指示剂。');
    }

    advanceStep(4, '待测液与指示剂准备完成，下一步切换到终点附近的标准滴定速度。');
  };

  const handleDrip = (action: 'standard' | 'rapid' | 'swirl') => {
    if (step !== 4 || completed) return;

    if (!reagentReady) {
      markError('请先完成待测液和指示剂加入，再进入滴定控制。');
      return;
    }

    if (action === 'rapid') {
      setDripMode('rapid');
      markError('接近终点仍快速滴加会导致过量，应改为逐滴滴加。');
      return;
    }

    if (action === 'standard') {
      setDripMode('standard');
      appendNote('滴速调整：已切换为逐滴滴加。');
      if (flaskSwirled) {
        advanceStep(5, '滴速已调稳且已轻振锥形瓶，可以开始判断终点颜色。');
      } else {
        setPromptTone('success');
        setPrompt('已切换为标准滴速，请继续轻轻振荡锥形瓶。');
      }
      return;
    }

    if (!flaskSwirled) {
      setFlaskSwirled(true);
      appendNote('滴定控制：已轻轻振荡锥形瓶，使溶液混合均匀。');
    }

    if (dripMode === 'standard') {
      advanceStep(5, '滴速与振荡控制到位，可以开始判断终点颜色。');
    } else {
      setPromptTone('success');
      setPrompt('锥形瓶已振荡，请继续把滴速调整为逐滴滴加。');
    }
  };

  const handleEndpoint = (choice: 'correct' | 'deep' | 'colorless') => {
    if (step !== 5 || completed) return;

    if (!dripReady) {
      markError('请先完成逐滴滴加并轻轻振荡锥形瓶，再判断终点。');
      return;
    }

    if (choice === 'correct') {
      setEndpointRecorded(true);
      setCameraPreset('endpoint');
      advanceStep(6, '终点记录完成，下一步总结滴定关键控制点。');
      return;
    }

    if (choice === 'deep') {
      markError('深红色通常表示滴定过量，终点应是浅粉红且短时间不褪色。');
      return;
    }

    markError('完全无色通常说明尚未达到终点，请继续精细滴定并观察颜色。');
  };

  const handleSummary = (choice: 'correct' | 'speed-only' | 'dark-pink') => {
    if (step !== 6 || completed) return;
    setSummaryChoice(choice);

    if (choice === 'correct') {
      advanceStep(null, '总结正确：你已完成酸碱中和滴定的关键流程。');
      return;
    }

    if (choice === 'speed-only') {
      markError('滴定不能只看速度，还要先做装置检查并准确判断终点颜色。');
      return;
    }

    markError('把深粉红当作终点会造成过量滴定，需回到“浅粉红、短时不褪”标准。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedTools([]);
    setBuretteMounted(false);
    setBuretteChecked(false);
    setAnalyteAdded(false);
    setIndicatorAdded(false);
    setDripMode('idle');
    setFlaskSwirled(false);
    setEndpointRecorded(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先完成装置检查，再进行滴定控制和终点判断。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先固定滴定管并检查液面、活塞与初始读数，再开始滴定。',
        '终点附近改为逐滴滴加，并同步轻轻振荡锥形瓶。',
        '终点应以浅粉红且短时间不褪色为准，避免过量滴定。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对滴速与颜色判断。',
        '建议先把装置、加样和滴速控制三个环节补齐，再记录终点结果。',
      ];

  const titrationWorkbenchStatus = completed
    ? '滴定流程已闭环：装置检查、慢滴控制和终点判断均已完成。'
    : step === 1
      ? '先完成器材识别，再进入滴定管安装与校准。'
      : step === 2
        ? '先固定滴定管，再检查液面、活塞和初始读数。'
        : step === 3
          ? '待测液与指示剂都要加入，顺序不能颠倒。'
          : step === 4
            ? '终点附近切到逐滴滴加，并同步轻轻振荡锥形瓶。'
            : step === 5
              ? '以“浅粉红且 30 秒不褪色”作为终点标准。'
              : '请把装置检查、滴速控制和终点判断三个要点总结完整。';
  const titrationCompletionCopy = completed
    ? '实验已完成，当前版本支持器材识别、滴定装置检查、慢滴控制、终点显色和规范总结。'
    : '完成全部 6 个步骤后，这里会生成本次滴定实验的规范性总结。';
  const latestLabNote = labNotes[0] ?? '实验已载入：先完成装置检查，再进行滴定控制和终点判断。';

  return (
    <section className="panel playground-panel titration-lab-panel titration-stage-first-panel titration-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属定量分析实验页</h2>
          <p>把滴定装置完整留在舞台中央，操作、读数和复盘统一收回到舞台下方工作台，减少遮挡并保留完整流程。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 6</span>
          <span className="badge">得分 {score}</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid titration-grid">
        <aside className="playground-side titration-side-rail titration-side-rail-left">
          <section className="info-card titration-rail-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>环境</strong>
                  <span>{experiment.scene.environment}</span>
                </div>
                <span className="badge">化学</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜头</strong>
                  <span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'burette' ? '滴定管特写' : '终点观察视角'}</span>
                </div>
                <span className="badge">{experiment.grade}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>主题</strong>
                  <span>{experiment.curriculum.theme}</span>
                </div>
                <span className="badge">{experiment.durationMinutes} 分钟</span>
              </div>
            </div>
          </section>

          <section className="info-card titration-rail-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>安全值 {safetyValue}</span><div className="chem-meter-bar"><i style={{ width: `${safetyValue}%` }} /></div></div>
              <div className="chem-meter"><span>精细度 {precisionValue}</span><div className="chem-meter-bar"><i style={{ width: `${precisionValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
        </aside>

        <section className="scene-panel titration-workbench-stage">
          <div className="scene-toolbar titration-workbench-toolbar">
            <div className="titration-toolbar-head">
              <div className="titration-toolbar-kicker">滴定工作台</div>
              <strong>{experiment.title}</strong>
              <p className="titration-toolbar-copy">顶部只保留轻量步骤提示，中央舞台只呈现滴定装置，所有关键操作与记录都放到实验台下方。</p>
            </div>
            <div className="camera-actions titration-camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'burette' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('burette')} type="button">滴定管</button>
              <button className={cameraPreset === 'endpoint' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('endpoint')} type="button">终点</button>
            </div>
          </div>

          <div className="scene-meta-strip titration-stage-meta">
            <div className={`titration-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>步骤 {step} · {stepTitles[step]}</strong>
              <p>{prompt}</p>
            </div>
            <div className="titration-step-pills" aria-label="实验步骤概览">
              {titrationStepOrder.map((stepId) => (
                <span className={step === stepId ? 'titration-step-pill active' : step > stepId || (stepId === 6 && completed) ? 'titration-step-pill done' : 'titration-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className={`scene-canvas titration-stage preset-${cameraPreset} ${setupReady ? 'setup-ready' : ''} ${reagentReady ? 'reagent-ready' : ''} ${flaskSwirled ? 'flask-swirled' : ''} ${endpointRecorded ? 'endpoint-recorded' : ''} drip-${dripMode}`}>
            <div className="titration-stage-grid">
              <article className={setupReady ? 'titration-card active' : 'titration-card'}>
                <div className="reaction-card-head"><strong>滴定装置</strong><small>{setupReady ? '已固定并检查' : '等待完成准备'}</small></div>
                <div className="burette-rig">
                  <div className="stand-shadow" />
                  <div className="stand-base-shadow" />
                  <div className="stand-base" />
                  <div className="stand-base-top" />
                  <div className="stand-rod" />
                  <div className="stand-rod-sheen" />
                  <div className="burette-clamp">
                    <span className="burette-clamp-arm arm-left" />
                    <span className="burette-clamp-arm arm-right" />
                    <span className="burette-clamp-knob" />
                  </div>
                  <div className={setupReady ? 'burette-column ready' : 'burette-column'}>
                    <div className="burette-reflection" />
                    <div className="burette-refraction" />
                    <div className={setupReady ? 'burette-scale active' : 'burette-scale'} />
                    <div className={setupReady ? 'burette-caustic active' : 'burette-caustic'} />
                    <div className={dripMode === 'standard' ? 'burette-liquid standard' : dripMode === 'rapid' ? 'burette-liquid rapid' : 'burette-liquid'} style={{ height: `${buretteFillPercent}%` }}>
                      <span className="burette-liquid-surface" />
                      <span className="burette-liquid-core" />
                    </div>
                    <div className={setupReady ? 'meniscus-line active' : 'meniscus-line'} style={{ top: `${100 - buretteFillPercent}%` }} />
                    <div className={setupReady ? 'meniscus-lens active' : 'meniscus-lens'} style={{ top: `calc(${100 - buretteFillPercent}% - 6px)` }} />
                  </div>
                  <div className="stopcock-body" />
                  <div className={dripMode === 'standard' ? 'drip-stream standard' : dripMode === 'rapid' ? 'drip-stream rapid' : 'drip-stream'} />
                  <div className={dripMode !== 'idle' ? 'drip-mist active' : 'drip-mist'} />
                  <div className={dripMode !== 'idle' ? 'stopcock-handle active' : 'stopcock-handle'} />
                  <div className={dripMode !== 'idle' ? 'titration-terminal-drop active' : 'titration-terminal-drop'} />
                  <div className={dripMode !== 'idle' ? 'droplet-cluster titration-drops active' : 'droplet-cluster titration-drops'}>
                    <span className="droplet-dot dot-1" />
                    <span className="droplet-dot dot-2" />
                    <span className="droplet-dot dot-3" />
                    <span className="droplet-dot dot-4" />
                  </div>
                  <div className="burette-readout-chip">{dripMode === 'standard' ? '终点慢滴中' : dripMode === 'rapid' ? '滴速过快' : '等待滴定'}</div>
                  <div className={identifiedTools.includes('wash-bottle') ? 'wash-bottle-mini active' : 'wash-bottle-mini'}>
                    <span className="wash-bottle-gloss" />
                  </div>
                  <div className={identifiedTools.includes('standard-solution') ? 'reagent-bottle-mini active' : 'reagent-bottle-mini'}>
                    <span className="reagent-bottle-gloss" />
                  </div>
                </div>
              </article>

              <article className={endpointRecorded ? 'titration-card active' : reagentReady ? 'titration-card primed' : 'titration-card'}>
                <div className="reaction-card-head"><strong>锥形瓶观察位</strong><small>{endpointRecorded ? '终点已记录' : reagentReady ? '接近终点' : '等待加样'}</small></div>
                <div className="endpoint-rig">
                  <div className="endpoint-pad" />
                  <div className={endpointRecorded ? 'titration-flask-shell endpoint' : reagentReady ? 'titration-flask-shell primed' : 'titration-flask-shell'}>
                    <div className="flask-shadow" />
                    <div className="flask-neck" />
                    <div className="flask-rim" />
                    <div className="flask-inner-glass" />
                    <div className="flask-reflection" />
                    <div className="flask-foot" />
                    <div className={reagentReady ? 'endpoint-front active' : 'endpoint-front'} />
                    <div className={endpointRecorded ? 'endpoint-caustic active' : 'endpoint-caustic'} />
                    <div className={endpointRecorded ? 'titration-flask-liquid endpoint' : reagentReady ? 'titration-flask-liquid charged' : 'titration-flask-liquid'}>
                      <span className="titration-liquid-surface" />
                      <span className={flaskSwirled ? 'titration-vortex active' : 'titration-vortex'} />
                      <span className={reagentReady ? 'indicator-cloud active cloud-1' : 'indicator-cloud cloud-1'} />
                      <span className={reagentReady ? 'indicator-cloud active cloud-2' : 'indicator-cloud cloud-2'} />
                    </div>
                    <div className={flaskSwirled ? 'swirl-ring active' : 'swirl-ring'} />
                    <div className={flaskSwirled ? 'swirl-ring secondary active' : 'swirl-ring secondary'} />
                    <div className={endpointRecorded ? 'endpoint-halo active' : 'endpoint-halo'} />
                    <div className={endpointRecorded ? 'endpoint-bloom active' : 'endpoint-bloom'} />
                    <div className={endpointRecorded ? 'endpoint-specks active' : 'endpoint-specks'} />
                  </div>
                </div>
              </article>
            </div>
          </div>

          <div className="workbench-inline-dock titration-workbench-dock">
            <div className="titration-workbench-status-grid">
              <div className={`info-card titration-status-card tone-${promptTone}`}>
                <span>当前进度</span>
                <strong>步骤 {step} · {stepTitles[step]}</strong>
                <p>{titrationWorkbenchStatus}</p>
              </div>
              <div className={`info-card titration-status-card ${setupReady ? 'tone-success' : ''}`.trim()}>
                <span>滴定装置</span>
                <strong>{setupReady ? '已固定并检查' : '待安装检查'}</strong>
                <p>液面读数 {meniscusValue} · 镜头 {cameraPreset === 'bench' ? '实验台' : cameraPreset === 'burette' ? '滴定管' : '终点'}</p>
              </div>
              <div className={`info-card titration-status-card ${endpointRecorded ? 'tone-success' : dripMode === 'rapid' ? 'tone-error' : ''}`.trim()}>
                <span>滴速与终点</span>
                <strong>{endpointRecorded ? '终点已锁定' : dripReady ? '慢滴稳定' : dripMode === 'rapid' ? '速度过快' : '待调节'}</strong>
                <p>当前状态 {endpointTone} · {flaskSwirled ? '已轻振锥形瓶' : '待轻振混匀'}</p>
              </div>
              <div className={`info-card titration-status-card ${completed ? 'tone-success' : ''}`.trim()}>
                <span>实验指标</span>
                <strong>得分 {score} · 完成度 {readinessValue}%</strong>
                <p>精细度 {precisionValue} · 最新记录：{latestLabNote}</p>
              </div>
            </div>

            <div className="titration-inline-workbench">
              <section className="info-card titration-inline-panel titration-workbench-actions">
                <span className="eyebrow">Actions</span>
                <h3>当前步骤操作</h3>
                <div className="summary-stack generic-choice-stack">
                  {step === 1 ? toolOrder.map((toolId) => (
                    <button className="summary-choice generic-choice primary" key={toolId} onClick={() => handleIdentify(toolId)} type="button">
                      <strong>识别 {toolLabels[toolId]}</strong>
                      <span>{identifiedTools.includes(toolId) ? '已完成识别' : '点击后标记为已识别对象'}</span>
                    </button>
                  )) : null}

                  {step === 2 ? (
                    <>
                      <button className={buretteMounted ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleSetup('mount')} type="button">
                        <strong>固定滴定管</strong>
                        <span>先把滴定管安装到实验位。</span>
                      </button>
                      <button className={buretteChecked ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSetup('check')} type="button">
                        <strong>检查液面与活塞</strong>
                        <span>确认初始状态规范。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleSetup('skip')} type="button">
                        <strong>不检查直接开始</strong>
                        <span>错误演示：跳过装置检查。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 3 ? (
                    <>
                      <button className={analyteAdded ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleAdd('analyte')} type="button">
                        <strong>加入待测液</strong>
                        <span>先向锥形瓶加入待测液。</span>
                      </button>
                      <button className={indicatorAdded ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleAdd('indicator')} type="button">
                        <strong>滴加酚酞指示剂</strong>
                        <span>用颜色变化辅助判断终点。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleAdd('skip-indicator')} type="button">
                        <strong>不加指示剂直接滴定</strong>
                        <span>错误演示：终点不易判断。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 4 ? (
                    <>
                      <button className={dripMode === 'standard' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleDrip('standard')} type="button">
                        <strong>切换为逐滴滴加</strong>
                        <span>终点附近需更精细地控制滴速。</span>
                      </button>
                      <button className={flaskSwirled ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleDrip('swirl')} type="button">
                        <strong>轻轻振荡锥形瓶</strong>
                        <span>让反应更均匀，便于判断颜色。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleDrip('rapid')} type="button">
                        <strong>继续快速滴加</strong>
                        <span>错误演示：容易超过终点。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 5 ? (
                    <>
                      <button className="summary-choice generic-choice primary" onClick={() => handleEndpoint('correct')} type="button">
                        <strong>记录“浅粉红且 30 秒不褪色”</strong>
                        <span>这是中和滴定的正确终点特征。</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleEndpoint('colorless')} type="button">
                        <strong>记录“依旧无色”</strong>
                        <span>错误演示：尚未到达终点。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleEndpoint('deep')} type="button">
                        <strong>记录“深粉红”</strong>
                        <span>错误演示：已滴定过量。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 6 ? (
                    <>
                      <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                        <strong>先检查装置，终点附近慢滴并轻振，浅粉红且短时不褪即为终点</strong>
                        <span>同时覆盖装置、速度和终点三个关键点。</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('speed-only')} type="button">
                        <strong>滴定只要慢一点就可以</strong>
                        <span>错误演示：忽略装置检查与终点判断。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleSummary('dark-pink')} type="button">
                        <strong>颜色越深越说明终点准确</strong>
                        <span>错误演示：终点过量会影响定量分析。</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="info-card titration-inline-panel titration-notebook-panel">
                <div className="generic-notebook-head">
                  <div>
                    <span className="eyebrow">Notebook</span>
                    <h3>过程记录与读数</h3>
                  </div>
                  <span className="badge">舞台下工作台</span>
                </div>
                <div className="titration-data-grid">
                  <div className="titration-data-item"><span>滴定管读数</span><strong>{meniscusValue}</strong><small>{setupReady ? '已完成初始检查，可观察液面变化。' : '先固定并检查装置。'}</small></div>
                  <div className="titration-data-item"><span>滴定速度</span><strong>{dripMode === 'standard' ? '逐滴滴加' : dripMode === 'rapid' ? '过快' : '待设置'}</strong><small>{dripReady ? '终点附近控制稳定。' : '接近终点要切到慢滴模式。'}</small></div>
                  <div className="titration-data-item"><span>终点颜色</span><strong>{endpointTone}</strong><small>{endpointRecorded ? '可进入结论总结。' : '重点观察浅粉红是否短时不褪色。'}</small></div>
                </div>
                <div className="timeline-list">
                  {timeline.map((entry) => (
                    <div className={`timeline-item ${entry.state}`} key={entry.title}>
                      <span className="timeline-marker" />
                      <div className="timeline-copy">
                        <strong>{entry.title}</strong>
                        <small>{entry.detail}</small>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="lab-note-stack">
                  {labNotes.map((note, index) => (
                    <div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>
                      {note}
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>

        <aside className="playground-side titration-side-rail titration-side-rail-right">
          <section className="info-card titration-rail-card">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{setupReady ? '已准备' : '待准备'} / 加样状态：{reagentReady ? '已完成' : '待完成'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意滴定规范'}</li>
            </ul>
          </section>

          <section className="info-card titration-rail-card titration-rail-prompt">
            <span className="eyebrow">Readout</span>
            <h3>滴定读数板</h3>
            <div className="titration-data-grid">
              <div className="titration-data-item"><span>滴定管读数</span><strong>{meniscusValue}</strong><small>{setupReady ? '读数已可追踪' : '先完成滴定管校准。'}</small></div>
              <div className="titration-data-item"><span>终点颜色</span><strong>{endpointTone}</strong><small>{endpointRecorded ? '终点已锁定' : '关注浅粉红是否短时不褪。'}</small></div>
            </div>
          </section>

          <section className="info-card titration-rail-card titration-rail-prompt">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`info-card titration-rail-card titration-rail-prompt ${completed ? 'tone-success' : promptTone === 'error' ? 'tone-error' : ''}`.trim()}>
            <span className="eyebrow">Control</span>
            <h3>实验控制</h3>
            <p>{titrationCompletionCopy}</p>
            <div className="button-stack">
              <button className="action-button ghost" onClick={handleReset} type="button">重新开始</button>
            </div>
            <small>{latestLabNote}</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
