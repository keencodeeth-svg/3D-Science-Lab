import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';
import { SoundVibrationThreeScene } from './SoundVibrationThreeScene';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'close' | 'compare';
type MaterialId = 'rubber-band-box' | 'tuning-fork' | 'drum' | 'paper-bits';
type InstrumentId = 'band' | 'fork' | 'drum';
type TimelineState = 'done' | 'current' | 'todo';

interface SoundVibrationLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别发声器材',
  2: '让器材发声',
  3: '切换近景视角',
  4: '记录振动现象',
  5: '总结声音来源',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别皮筋盒、音叉、小鼓和纸屑。',
  2: '让不同器材发声，准备观察振动现象。',
  3: '切换到近景视角，观察纸屑、皮筋和音叉的振动。',
  4: '根据看到的振动现象完成记录。',
  5: '把振动现象和声音来源联系起来总结。',
};

const materialLabels: Record<MaterialId, string> = {
  'rubber-band-box': '皮筋盒',
  'tuning-fork': '音叉',
  drum: '小鼓',
  'paper-bits': '纸屑',
};

const materialOrder: MaterialId[] = ['rubber-band-box', 'tuning-fork', 'drum', 'paper-bits'];
const soundStepOrder: StepId[] = [1, 2, 3, 4, 5];
const instrumentLabels: Record<InstrumentId, string> = {
  band: '皮筋盒',
  fork: '音叉',
  drum: '小鼓',
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

export function SoundVibrationLabPlayer({ experiment, onTelemetry }: SoundVibrationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [triggeredInstruments, setTriggeredInstruments] = useState<InstrumentId[]>([]);
  const [viewSwitched, setViewSwitched] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先让器材发声，再切近景观察振动现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const allTriggered = triggeredInstruments.length === 3;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const triggerValue = clamp(42 + triggeredInstruments.length * 16 + (viewSwitched ? 14 : 0), 24, 99);
  const clarityValue = clamp(48 + (viewSwitched ? 20 : 0), 34, 99);
  const readinessValue = clamp(progressPercent + triggeredInstruments.length * 10 + (viewSwitched ? 14 : 0), 22, 100);

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
      appendNote(`器材识别：${materialLabels[materialId]}`);
      if (next.length === materialOrder.length) {
        advanceStep(2, '器材识别完成，下一步让不同器材发声。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleTrigger = (instrumentId: InstrumentId) => {
    if (step !== 2 || completed) return;
    setTriggeredInstruments((current) => {
      if (current.includes(instrumentId)) return current;
      const next = [...current, instrumentId];
      appendNote(`发声触发：已让${instrumentLabels[instrumentId]}发声。`);
      if (next.length === 3) {
        setCameraPreset('close');
        advanceStep(3, '三种器材均已发声，下一步切到近景视角看振动。');
      } else {
        setPromptTone('success');
        setPrompt(`已触发 ${next.length}/3 个发声器材，请继续。`);
      }
      return next;
    });
  };

  const handleView = (choice: 'switch' | 'skip') => {
    if (step !== 3 || completed) return;
    if (!allTriggered) {
      markError('请先让不同器材发声，再切换到近景视角。');
      return;
    }
    if (choice === 'skip') {
      markError('近景视角更容易看到皮筋、音叉和纸屑的振动现象。');
      return;
    }
    setViewSwitched(true);
    setCameraPreset('compare');
    appendNote('近景观察：已看清皮筋、音叉和鼓面附近纸屑的振动。');
    advanceStep(4, '近景视角已打开，下一步根据振动现象完成记录。');
  };

  const handleRecord = (choice: 'correct' | 'sound-only' | 'still') => {
    if (step !== 4 || completed) return;
    if (!viewSwitched) {
      markError('请先切换到近景视角，再记录振动现象。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：发声时皮筋、音叉和鼓面都出现了明显振动。');
      advanceStep(5, '记录完成，下一步总结声音与振动的关系。');
      return;
    }
    if (choice === 'sound-only') {
      markError('不能只听声音不看现象，本实验重点是把声音和振动对应起来。');
      return;
    }
    markError('发声时器材并不是静止的，近景视角可以看到明显振动。');
  };

  const handleSummary = (choice: 'correct' | 'air-only' | 'no-vibration') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：声音通常由物体振动产生，看到振动现象就能帮助理解声音来源。');
      return;
    }
    if (choice === 'air-only') {
      markError('空气能传播声音，但本实验重点是“声音由物体振动产生”。');
      return;
    }
    markError('发声器材并不是不振动，而是要通过近景观察把振动看出来。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setTriggeredInstruments([]);
    setViewSwitched(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先让器材发声，再切近景观察振动现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先让不同器材发声，再去看振动。',
        '近景视角可以帮助看清纸屑、皮筋和音叉的抖动。',
        '总结时要把“看到的振动”与“听到的声音”连起来。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对振动现象。',
        '建议重新触发器材发声，再到近景视角观察。',
      ];

  const soundWorkbenchStatus = completed
    ? '声音与振动的关系已经完成闭环：发声、近景观察、记录与归纳全部完成。'
    : step === 1
      ? '先识别实验台上的器材和观察材料。'
      : step === 2
        ? '先让不同器材发声，再进入近景观察。'
        : step === 3
          ? '切到近景视角，把“听见声音”转成“看见振动”。'
          : step === 4
            ? '根据近景现象记录振动，不要只写“听到了声音”。'
            : '把振动现象和声音来源连起来，完成最终总结。';
  const soundCompletionCopy = completed
    ? '实验已完成，当前版本支持器材识别、发声触发、近景对照、振动记录与声音来源总结。'
    : '完成全部 5 个步骤后，这里会生成本次声音实验的总结结果。';
  const latestLabNote = labNotes[0] ?? '实验已载入：先让器材发声，再切近景观察振动现象。';

  return (
    <section className="panel playground-panel sound-lab-panel sound-stage-first-panel sound-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属小学科学实验页</h2>
          <p>把 3D 发声舞台放大，把提示和记录收回下方工作台，让孩子更容易把“声音来自振动”看清楚。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">得分 {score}</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid sound-grid">
        <aside className="playground-side sound-side-rail sound-side-rail-left">
          <section className="info-card sound-rail-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>环境</strong>
                  <span>{experiment.scene.environment}</span>
                </div>
                <span className="badge">小学科学</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜头</strong>
                  <span>{cameraPreset === 'bench' ? '器材总览' : cameraPreset === 'close' ? '近景视角' : '对照视角'}</span>
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

          <section className="info-card sound-rail-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>触发度 {triggerValue}</span><div className="chem-meter-bar"><i style={{ width: `${triggerValue}%` }} /></div></div>
              <div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
        </aside>

        <section className="scene-panel sound-workbench-stage">
          <div className="scene-toolbar sound-workbench-toolbar">
            <div className="sound-toolbar-head">
              <div className="sound-toolbar-kicker">声音观察工作台</div>
              <strong>{experiment.title}</strong>
              <p className="sound-toolbar-copy">中央舞台只保留发声器材与近景对照，提示、操作和记录统一收纳到舞台下方。</p>
            </div>
            <div className="camera-actions sound-camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">总览</button>
              <button className={cameraPreset === 'close' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('close')} type="button">近景</button>
              <button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对照</button>
            </div>
          </div>

          <div className="scene-meta-strip sound-stage-meta">
            <div className={`sound-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>步骤 {step} · {stepTitles[step]}</strong>
              <p>{prompt}</p>
            </div>
            <div className="sound-step-pills" aria-label="实验步骤概览">
              {soundStepOrder.map((stepId) => (
                <span className={step === stepId ? 'sound-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'sound-step-pill done' : 'sound-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className={`scene-canvas sound-stage preset-${cameraPreset}`}>
            <div className="sound-stage-grid">
              <article className={allTriggered ? 'sound-card sound-three-card active' : 'sound-card sound-three-card'}>
                <div className="reaction-card-head"><strong>3D 发声器材台</strong><small>{allTriggered ? '三种器材均已发声，可自由旋转观察' : '等待触发，可先从总览视角认识器材'}</small></div>
                <SoundVibrationThreeScene cameraPreset={cameraPreset} triggeredInstruments={triggeredInstruments} viewSwitched={viewSwitched} />
              </article>
              <article className={viewSwitched ? 'sound-card active' : 'sound-card'}>
                <div className="reaction-card-head"><strong>近景对照区</strong><small>{viewSwitched ? '振动细节已可见' : '等待切换近景'}</small></div>
                <div className="sound-close-panel"><div className="close-panel-ring" /><div className={viewSwitched ? 'close-wave-line active' : 'close-wave-line'} /><div className={viewSwitched ? 'close-wave-line secondary active' : 'close-wave-line secondary'} /><div className="close-panel-readout">振动近景放大观察</div></div>
              </article>
            </div>
          </div>

          <div className="workbench-inline-dock sound-workbench-dock">
            <div className="sound-workbench-status-grid">
              <div className={`info-card sound-status-card tone-${promptTone}`}>
                <span>当前进度</span>
                <strong>步骤 {step} · {stepTitles[step]}</strong>
                <p>{soundWorkbenchStatus}</p>
              </div>
              <div className={`info-card sound-status-card ${allTriggered ? 'tone-success' : ''}`.trim()}>
                <span>器材触发</span>
                <strong>{allTriggered ? '三种器材都已发声' : `已触发 ${triggeredInstruments.length}/3`}</strong>
                <p>皮筋盒、音叉和小鼓都要先发声，才能开始比较振动。</p>
              </div>
              <div className={`info-card sound-status-card ${viewSwitched ? 'tone-success' : ''}`.trim()}>
                <span>近景观察</span>
                <strong>{viewSwitched ? '振动细节清晰' : '待切近景'}</strong>
                <p>镜头 {cameraPreset === 'bench' ? '总览' : cameraPreset === 'close' ? '近景' : '对照'} · 当前{viewSwitched ? '已建立振动证据' : '尚未完成近景确认'}</p>
              </div>
              <div className={`info-card sound-status-card ${completed ? 'tone-success' : ''}`.trim()}>
                <span>实验指标</span>
                <strong>得分 {score} · 完成度 {readinessValue}%</strong>
                <p>清晰度 {clarityValue} · 最新记录：{latestLabNote}</p>
              </div>
            </div>

            <div className="sound-inline-workbench">
              <section className="info-card sound-inline-panel sound-workbench-actions">
                <span className="eyebrow">Actions</span>
                <h3>当前步骤操作</h3>
                <div className="summary-stack generic-choice-stack">
                  {step === 1 ? materialOrder.map((materialId) => (
                    <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button">
                      <strong>识别 {materialLabels[materialId]}</strong>
                      <span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span>
                    </button>
                  )) : null}

                  {step === 2 ? (['band', 'fork', 'drum'] as InstrumentId[]).map((instrumentId) => (
                    <button className={triggeredInstruments.includes(instrumentId) ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} key={instrumentId} onClick={() => handleTrigger(instrumentId)} type="button">
                      <strong>让{instrumentLabels[instrumentId]}发声</strong>
                      <span>{triggeredInstruments.includes(instrumentId) ? '已完成触发' : '准备观察振动现象'}</span>
                    </button>
                  )) : null}

                  {step === 3 ? (
                    <>
                      <button className="summary-choice generic-choice primary" onClick={() => handleView('switch')} type="button">
                        <strong>切到近景视角</strong>
                        <span>更清楚观察皮筋、音叉和纸屑振动。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleView('skip')} type="button">
                        <strong>不看近景直接记录</strong>
                        <span>错误演示：现象证据不足。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 4 ? (
                    <>
                      <button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button">
                        <strong>记录“发声时器材都在振动”</strong>
                        <span>根据近景现象完成正确记录。</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleRecord('sound-only')} type="button">
                        <strong>只记录“听到了声音”</strong>
                        <span>错误演示：缺少振动观察。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleRecord('still')} type="button">
                        <strong>记录“器材并未振动”</strong>
                        <span>错误演示：与现象不符。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 5 ? (
                    <>
                      <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                        <strong>声音通常由物体振动产生，看到振动现象能帮助解释声音来源</strong>
                        <span>把现象和科学结论准确连起来。</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('air-only')} type="button">
                        <strong>声音只是空气自己产生的</strong>
                        <span>错误演示：偏离本实验观察对象。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-vibration')} type="button">
                        <strong>发声器材其实不需要振动</strong>
                        <span>错误演示：与观察结果矛盾。</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="info-card sound-inline-panel sound-notebook-panel">
                <div className="generic-notebook-head">
                  <div>
                    <span className="eyebrow">Notebook</span>
                    <h3>现象记录</h3>
                  </div>
                  <span className="badge">舞台下工作台</span>
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

        <aside className="playground-side sound-side-rail sound-side-rail-right">
          <section className="info-card sound-rail-card">
            <span className="eyebrow">Readout</span>
            <h3>振动结果板</h3>
            <div className="sound-data-grid">
              <div className="sound-data-item"><span>皮筋盒</span><strong>{triggeredInstruments.includes('band') ? '已发声并振动' : '待触发'}</strong><small>拨动皮筋能看到明显抖动。</small></div>
              <div className="sound-data-item"><span>音叉</span><strong>{triggeredInstruments.includes('fork') ? '已发声并振动' : '待触发'}</strong><small>近景视角更容易观察音叉振动。</small></div>
              <div className="sound-data-item"><span>小鼓</span><strong>{triggeredInstruments.includes('drum') ? '已发声并振动' : '待触发'}</strong><small>鼓面振动会带动纸屑跳动。</small></div>
            </div>
          </section>

          <section className="info-card sound-rail-card">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>触发状态：{triggeredInstruments.length}/3 / 近景状态：{viewSwitched ? '已切换' : '待切换'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意先触发再观察'}</li>
            </ul>
          </section>

          <section className="info-card sound-rail-card sound-rail-prompt">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`info-card sound-rail-card sound-rail-prompt ${completed ? 'tone-success' : promptTone === 'error' ? 'tone-error' : ''}`.trim()}>
            <span className="eyebrow">Control</span>
            <h3>实验控制</h3>
            <p>{soundCompletionCopy}</p>
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
