import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'flask' | 'flame';
type MaterialId = 'flask' | 'funnel' | 'zinc' | 'acid' | 'collector';
type TimelineState = 'done' | 'current' | 'todo';

interface HydrogenPreparationLabPlayerProps {
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
  2: '加入锌粒和稀酸',
  3: '收集气体',
  4: '观察验纯现象',
  5: '总结氢气制取特点',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别发生瓶、长颈漏斗、锌粒、稀酸和集气装置。',
  2: '把锌粒与稀酸加入装置中，观察反应开始放出气泡。',
  3: '待气体稳定后，再收集生成的氢气。',
  4: '根据点燃时的现象判断是否为较纯净氢气。',
  5: '总结实验室制氢常见现象与注意点。',
};

const materialLabels: Record<MaterialId, string> = {
  flask: '发生瓶',
  funnel: '长颈漏斗',
  zinc: '锌粒',
  acid: '稀酸',
  collector: '集气装置',
};

const materialOrder: MaterialId[] = ['flask', 'funnel', 'zinc', 'acid', 'collector'];
const hydrogenprepStepOrder: StepId[] = [1, 2, 3, 4, 5];

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

export function HydrogenPreparationLabPlayer({ experiment, onTelemetry }: HydrogenPreparationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [reacting, setReacting] = useState(false);
  const [collected, setCollected] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过锌粒与稀酸反应、排气收集和点燃验纯观察氢气。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const gasValue = clamp(28 + (reacting ? 26 : 0) + (collected ? 24 : 0), 20, 99);
  const purityValue = clamp(26 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 24 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (reacting ? 10 : 0) + (collected ? 14 : 0), 20, 100);
  const flaskLiquidHeight = reacting ? 58 : 40;
  const collectorGasHeight = collected ? 46 : reacting ? 12 : 0;
  const collectorWaterHeight = collected ? 28 : reacting ? 46 : 62;
  const reactionPhase = reacting ? (collected ? 'stable' : 'starting') : 'idle';
  const observationPhase = observationChoice || 'pending';

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
        advanceStep(2, '器材识别完成，下一步让锌粒和稀酸开始反应。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleReact = (choice: 'correct' | 'collector-first') => {
    if (step !== 2 || completed) return;
    if (choice === 'collector-first') {
      markError('请先让发生瓶中的反应开始产生气体，再进行稳定收集。');
      return;
    }
    setReacting(true);
    appendNote('反应启动：锌粒与稀酸接触后出现连续气泡。');
    advanceStep(3, '反应已开始，下一步收集生成的氢气。');
  };

  const handleCollect = (choice: 'correct' | 'mix-air') => {
    if (step !== 3 || completed) return;
    if (!reacting) {
      markError('请先让发生瓶开始反应，再收集气体。');
      return;
    }
    if (choice === 'mix-air') {
      markError('集气前应先让装置排出前段空气，避免与空气大量混合。');
      return;
    }
    setCollected(true);
    setCameraPreset('flame');
    appendNote('气体收集：装置中已得到较稳定的一份氢气样品。');
    advanceStep(4, '已收集气体，请根据点燃现象判断氢气纯度。');
  };

  const handleObserve = (choice: 'correct' | 'big-explosion' | 'no-flame') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!collected) {
      markError('请先完成氢气收集，再进行现象判断。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：点燃较纯净氢气时可听到轻微“噗”声，并见淡蓝色火焰。');
      advanceStep(5, '现象判断正确，最后总结实验室制氢与验纯要点。');
      return;
    }
    if (choice === 'big-explosion') {
      markError('明显剧烈爆鸣说明混有较多空气，不是理想的较纯净氢气现象。');
      return;
    }
    markError('点燃氢气应出现可观察的燃烧现象，不会完全没有火焰。');
  };

  const handleSummary = (choice: 'correct' | 'oxygen' | 'no-check') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：锌粒与稀酸可制取氢气，收集后应先验纯再点燃观察。');
      return;
    }
    if (choice === 'oxygen') {
      markError('本实验制得的是氢气，不是氧气。');
      return;
    }
    markError('氢气点燃前应注意验纯，不能忽略这一关键安全步骤。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setReacting(false);
    setCollected(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新制取并观察氢气。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先让反应稳定产生气体，再收集。', '观察重点是“连续气泡、收集气体、淡蓝火焰与轻微噗声”。', '总结时记住“先验纯，再点燃”。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对氢气现象。',
        '建议按“反应 → 收集 → 验纯观察 → 总结”的顺序重做。',
      ];

  const flameResult = observationChoice === 'correct'
    ? '淡蓝火焰 + 轻微噗声'
    : observationChoice === 'big-explosion'
      ? '爆鸣明显，空气混入过多'
      : observationChoice === 'no-flame'
        ? '无火焰，判断错误'
        : '待观察';
  const hydrogenprepWorkbenchStatus = completed
    ? '制氢流程已闭环：识别、反应、收集、验纯和总结全部完成。'
    : step === 1
      ? '先识别发生瓶、漏斗、锌粒、稀酸和集气装置。'
      : step === 2
        ? '先让锌粒与稀酸开始反应，再考虑收集。'
        : step === 3
          ? '待气体稳定后再收集，避免与空气大量混合。'
          : step === 4
            ? '点燃前先结合现象判断纯度，重点看淡蓝火焰与轻微噗声。'
            : '总结时记住“锌粒与稀酸制氢，先验纯再点燃”。';
  const hydrogenprepCompletionCopy = completed
    ? '实验已完成，当前版本支持制氢反应、稳定收集、点燃验纯与规范总结。'
    : '完成全部 5 个步骤后，这里会输出本次制氢实验的规范总结。';
  const latestLabNote = labNotes[0] ?? '实验已载入：通过锌粒与稀酸反应、排气收集和点燃验纯观察氢气。';

  return (
    <section className="panel playground-panel hydrogenprep-lab-panel hydrogenprep-stage-first-panel hydrogenprep-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把发生瓶、导气通路、集气装置和验纯火焰完整留在中央舞台，操作与复盘统一收回下方工作台。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">得分 {score}</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid hydrogenprep-grid">
        <aside className="playground-side hydrogenprep-side-rail hydrogenprep-side-rail-left">
          <section className="info-card hydrogenprep-rail-card">
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
                  <span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'flask' ? '发生瓶近景' : '验纯观察'}</span>
                </div>
                <span className="badge">{experiment.grade}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>主题</strong>
                  <span>{experiment.curriculum.unit}</span>
                </div>
                <span className="badge">{experiment.durationMinutes} 分钟</span>
              </div>
            </div>
          </section>

          <section className="info-card hydrogenprep-rail-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>产气强度 {gasValue}</span><div className="chem-meter-bar"><i style={{ width: `${gasValue}%` }} /></div></div>
              <div className="chem-meter"><span>纯度判断 {purityValue}</span><div className="chem-meter-bar"><i style={{ width: `${purityValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
        </aside>

        <section className="scene-panel hydrogenprep-workbench-stage">
          <div className="scene-toolbar hydrogenprep-workbench-toolbar">
            <div className="hydrogenprep-toolbar-head">
              <div className="hydrogenprep-toolbar-kicker">制氢工作台</div>
              <strong>{experiment.title}</strong>
              <p className="hydrogenprep-toolbar-copy">舞台中央只保留发生装置与火焰现象，提示、操作、记录和复盘统一放到舞台下方。</p>
            </div>
            <div className="camera-actions hydrogenprep-camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'flask' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flask')} type="button">发生瓶</button>
              <button className={cameraPreset === 'flame' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flame')} type="button">验纯</button>
            </div>
          </div>

          <div className="scene-meta-strip hydrogenprep-stage-meta">
            <div className={`hydrogenprep-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>步骤 {step} · {stepTitles[step]}</strong>
              <p>{prompt}</p>
            </div>
            <div className="hydrogenprep-step-pills" aria-label="实验步骤概览">
              {hydrogenprepStepOrder.map((stepId) => (
                <span className={step === stepId ? 'hydrogenprep-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'hydrogenprep-step-pill done' : 'hydrogenprep-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className={`scene-canvas hydrogenprep-stage preset-${cameraPreset} ${reacting ? 'reacting' : ''} ${collected ? 'collected' : ''} reaction-${reactionPhase} observation-${observationPhase}`}>
            <div className="hydrogenprep-rig">
              <div className="hp-stand-shadow" />
              <div className="hp-stand">
                <div className="hp-stand-base" />
                <div className="hp-stand-pole" />
                <div className="hp-stand-clamp" />
                <div className="hp-stand-ring" />
              </div>

              <div className="hp-flask">
                <div className="hp-flask-foot" />
                <div className="hp-glass-gloss" />
                <div className={reacting ? 'hp-liquid-meniscus active' : 'hp-liquid-meniscus'} style={{ bottom: `calc(${flaskLiquidHeight}% - 6px)` }} />
                <div className={reacting ? 'hp-acid-front active' : 'hp-acid-front'} />
                <div className={reacting ? 'hp-liquid active' : 'hp-liquid'} style={{ height: `${flaskLiquidHeight}%` }} />
                <div className={reacting ? 'hp-zinc active' : 'hp-zinc'}>
                  <span className="hp-zinc-piece hp-zinc-piece-1" />
                  <span className="hp-zinc-piece hp-zinc-piece-2" />
                  <span className="hp-zinc-piece hp-zinc-piece-3" />
                  <span className="hp-zinc-piece hp-zinc-piece-4" />
                  <span className="hp-zinc-piece hp-zinc-piece-5" />
                  <span className="hp-zinc-piece hp-zinc-piece-6" />
                </div>
                <div className={reacting ? 'hp-zinc-halo active' : 'hp-zinc-halo'} />
                <div className={reacting ? 'hp-bubbles active' : 'hp-bubbles'}>
                  <span className="hp-bubble hp-bubble-1" />
                  <span className="hp-bubble hp-bubble-2" />
                  <span className="hp-bubble hp-bubble-3" />
                  <span className="hp-bubble hp-bubble-4" />
                  <span className="hp-bubble hp-bubble-5" />
                  <span className="hp-bubble hp-bubble-6" />
                </div>
                <div className={reacting ? 'hp-bubble-sheet active' : 'hp-bubble-sheet'} />
              </div>

              <div className={reacting ? 'hp-stopper active' : 'hp-stopper'} />
              <div className="hp-funnel-shell">
                <div className={reacting ? 'hp-funnel active' : 'hp-funnel'}>
                  <div className="hp-funnel-mouth" />
                  <div className={reacting ? 'hp-acid-stream active' : 'hp-acid-stream'} />
                </div>
              </div>

              <div className={reacting ? 'hp-tube active' : 'hp-tube'}>
                <span className="hp-tube-joint hp-tube-joint-start" />
                <span className="hp-tube-joint hp-tube-joint-end" />
                <span className="hp-tube-sheen" />
                <span className="hp-flow-dot hp-flow-dot-1" />
                <span className="hp-flow-dot hp-flow-dot-2" />
                <span className="hp-flow-dot hp-flow-dot-3" />
                <span className="hp-flow-dot hp-flow-dot-4" />
              </div>

              <div className="hp-water-bath">
                <div className="hp-water-bath-rim" />
                <div className="hp-water-surface" />
                <div className="hp-bath-caustic" />
                <div className="hp-collector">
                  <div className="hp-collector-gloss" />
                  <div className="hp-collector-water" style={{ height: `${collectorWaterHeight}%` }} />
                  <div className={collected ? 'hp-collector-meniscus active' : 'hp-collector-meniscus'} style={{ bottom: `calc(${collectorWaterHeight}% - 6px)` }} />
                  <div className={collected ? 'hp-gas active' : 'hp-gas'} style={{ height: `${collectorGasHeight}%` }} />
                  <div className={collected ? 'hp-gas-front active' : 'hp-gas-front'} />
                  <div className={collected ? 'hp-gas-swirl active' : 'hp-gas-swirl'} />
                  <span className={reacting ? 'hp-collector-bubble hp-collector-bubble-1 active' : 'hp-collector-bubble hp-collector-bubble-1'} />
                  <span className={reacting ? 'hp-collector-bubble hp-collector-bubble-2 active' : 'hp-collector-bubble hp-collector-bubble-2'} />
                  <span className={reacting ? 'hp-collector-bubble hp-collector-bubble-3 active' : 'hp-collector-bubble hp-collector-bubble-3'} />
                </div>
              </div>

              <div className={collected ? 'hp-igniter active' : 'hp-igniter'} />
              <div className={collected ? 'hp-flame active' : 'hp-flame'} />
              <div className={collected ? 'hp-flame-halo active' : 'hp-flame-halo'} />
              <div className={collected ? 'hp-pop-ring active' : 'hp-pop-ring'} />
            </div>
          </div>

          <div className="workbench-inline-dock hydrogenprep-workbench-dock">
            <div className="hydrogenprep-workbench-status-grid">
              <div className={`info-card hydrogenprep-status-card tone-${promptTone}`}>
                <span>当前进度</span>
                <strong>步骤 {step} · {stepTitles[step]}</strong>
                <p>{hydrogenprepWorkbenchStatus}</p>
              </div>
              <div className={`info-card hydrogenprep-status-card ${reacting ? 'tone-success' : ''}`.trim()}>
                <span>反应与收集</span>
                <strong>{reacting ? '已连续产气' : '待启动反应'} / {collected ? '样品已收集' : '待稳定收集'}</strong>
                <p>发生瓶 {reacting ? '已见连续气泡' : '尚未明显起泡'} · 集气装置 {collected ? '已有氢气样品' : '仍在排气阶段'}</p>
              </div>
              <div className={`info-card hydrogenprep-status-card ${observationChoice === 'correct' ? 'tone-success' : promptTone === 'error' && step >= 4 ? 'tone-error' : ''}`.trim()}>
                <span>验纯现象</span>
                <strong>{flameResult}</strong>
                <p>{observationChoice === 'correct' ? '较纯净氢气点燃时可听到轻微噗声并见淡蓝火焰。' : '重点区分轻微噗声与明显爆鸣。'}</p>
              </div>
              <div className={`info-card hydrogenprep-status-card ${completed ? 'tone-success' : ''}`.trim()}>
                <span>实验指标</span>
                <strong>得分 {score} · 完成度 {readinessValue}%</strong>
                <p>纯度判断 {purityValue} · 最新记录：{latestLabNote}</p>
              </div>
            </div>

            <div className="hydrogenprep-inline-workbench">
              <section className="info-card hydrogenprep-inline-panel hydrogenprep-workbench-actions">
                <span className="eyebrow">Actions</span>
                <h3>当前步骤操作</h3>
                <div className="summary-stack generic-choice-stack">
                  {step === 1 ? materialOrder.map((materialId) => (
                    <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button">
                      <strong>识别 {materialLabels[materialId]}</strong>
                      <span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span>
                    </button>
                  )) : null}

                  {step === 2 ? (
                    <>
                      <button className="summary-choice generic-choice primary" onClick={() => handleReact('correct')} type="button">
                        <strong>让锌粒与稀酸开始反应</strong>
                        <span>先让发生瓶稳定产气，再进入集气环节。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleReact('collector-first')} type="button">
                        <strong>先拿集气装置直接收集</strong>
                        <span>错误演示：反应尚未稳定就开始收集。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 3 ? (
                    <>
                      <button className="summary-choice generic-choice primary" onClick={() => handleCollect('correct')} type="button">
                        <strong>排气后再稳定收集氢气</strong>
                        <span>避免与空气大量混合。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleCollect('mix-air')} type="button">
                        <strong>不排气直接收集</strong>
                        <span>错误演示：样品会混入较多空气。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 4 ? (
                    <>
                      <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button">
                        <strong>记录“淡蓝火焰并伴轻微噗声”</strong>
                        <span>这是较纯净氢气的典型点燃现象。</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('big-explosion')} type="button">
                        <strong>记录“剧烈爆鸣”</strong>
                        <span>错误演示：说明空气混入过多。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleObserve('no-flame')} type="button">
                        <strong>记录“完全没有火焰”</strong>
                        <span>错误演示：与典型现象不符。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 5 ? (
                    <>
                      <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                        <strong>锌粒与稀酸可制氢，收集后应先验纯再点燃观察</strong>
                        <span>同时覆盖制取与安全要点。</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('oxygen')} type="button">
                        <strong>本实验制得的是氧气</strong>
                        <span>错误演示：气体种类判断错误。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-check')} type="button">
                        <strong>可直接点燃，不需要验纯</strong>
                        <span>错误演示：忽略安全步骤。</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="info-card hydrogenprep-inline-panel hydrogenprep-notebook-panel">
                <div className="generic-notebook-head">
                  <div>
                    <span className="eyebrow">Notebook</span>
                    <h3>过程记录与读数</h3>
                  </div>
                  <span className="badge">舞台下工作台</span>
                </div>
                <div className="generic-readout-grid hydrogenprep-readout-grid">
                  <article className={reacting ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>反应状态</span><strong>{reacting ? '连续产气' : '--'}</strong><small>{reacting ? '锌粒与稀酸反应产生气泡。' : '先让反应启动。'}</small></article>
                  <article className={collected ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>集气状态</span><strong>{collected ? '样品已收集' : '--'}</strong><small>{collected ? '已有一份可用于验纯的气体样品。' : '再完成稳定收集。'}</small></article>
                  <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '先验纯再点燃' : '等待总结'}</strong><small>实验室可用锌粒和稀酸制氢。</small></article>
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

        <aside className="playground-side hydrogenprep-side-rail hydrogenprep-side-rail-right">
          <section className="info-card hydrogenprep-rail-card">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{reacting ? '已稳定产气' : '待启动'} / 集气状态：{collected ? '已完成' : '待完成'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先排气后收集，先验纯再点燃'}</li>
            </ul>
          </section>

          <section className="info-card hydrogenprep-rail-card hydrogenprep-rail-prompt">
            <span className="eyebrow">Readout</span>
            <h3>验纯结果板</h3>
            <div className="generic-readout-grid hydrogenprep-readout-grid">
              <article className={reacting ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>产气</span><strong>{reacting ? '连续' : '--'}</strong><small>先让发生瓶持续放气。</small></article>
              <article className={collected ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>收集</span><strong>{collected ? '完成' : '--'}</strong><small>排气后再稳定收集。</small></article>
              <article className={observationChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>点燃</span><strong>{flameResult}</strong><small>重点区分轻微噗声与明显爆鸣。</small></article>
            </div>
          </section>

          <section className="info-card hydrogenprep-rail-card hydrogenprep-rail-prompt">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`info-card hydrogenprep-rail-card hydrogenprep-rail-prompt ${completed ? 'tone-success' : promptTone === 'error' ? 'tone-error' : ''}`.trim()}>
            <span className="eyebrow">Control</span>
            <h3>实验控制</h3>
            <p>{hydrogenprepCompletionCopy}</p>
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
