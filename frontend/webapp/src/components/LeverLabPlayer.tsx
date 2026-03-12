import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'fulcrum' | 'scale';
type MaterialId = 'lever-ruler' | 'fulcrum' | 'left-hook' | 'right-hook' | 'weights';
type HookPosition = 'none' | 'near' | 'middle' | 'far';
type TimelineState = 'done' | 'current' | 'todo';

interface LeverLabPlayerProps {
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
  2: '挂上阻力砝码',
  3: '调节动力臂',
  4: '观察杠杆平衡',
  5: '总结省力规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先认识杠杆尺、支点、左右挂钩和金属砝码。',
  2: '先在左侧挂上阻力砝码，建立需要平衡的初始状态。',
  3: '把右侧砝码逐步外移，找到能让杠杆恢复平衡的位置。',
  4: '观察两侧力臂变化与杠杆姿态，判断什么时候重新平衡。',
  5: '总结杠杆平衡与动力臂、阻力臂之间的关系。',
};

const materialLabels: Record<MaterialId, string> = {
  'lever-ruler': '杠杆尺',
  fulcrum: '支点',
  'left-hook': '左挂钩',
  'right-hook': '右挂钩',
  weights: '金属砝码',
};

const materialOrder: MaterialId[] = ['lever-ruler', 'fulcrum', 'left-hook', 'right-hook', 'weights'];

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

export function LeverLabPlayer({ experiment, onTelemetry }: LeverLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [leftLoaded, setLeftLoaded] = useState(false);
  const [rightPosition, setRightPosition] = useState<HookPosition>('none');
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先建立左侧阻力，再通过延长右侧力臂找回平衡。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const balanced = leftLoaded && rightPosition === 'far';
  const beamState = !leftLoaded ? 'idle' : balanced ? 'balanced' : rightPosition === 'middle' ? 'mid' : 'left-heavy';
  const balanceLabel = balanced ? '已平衡' : leftLoaded ? '左端下沉' : '待挂砝码';
  const armLength = rightPosition === 'far' ? '长动力臂' : rightPosition === 'middle' ? '中等动力臂' : rightPosition === 'near' ? '短动力臂' : '未设置';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const balanceValue = clamp(38 + (leftLoaded ? 18 : 0) + (balanced ? 26 : rightPosition === 'middle' ? 12 : rightPosition === 'near' ? 4 : 0), 20, 99);
  const clarityValue = clamp(44 + (rightPosition !== 'none' ? 12 : 0) + (observationChoice === 'correct' ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 28, 99);
  const readinessValue = clamp(progressPercent + (leftLoaded ? 12 : 0) + (balanced ? 18 : 0), 20, 100);

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
        setCameraPreset('fulcrum');
        advanceStep(2, '器材识别完成，先把左侧阻力砝码挂好。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleLoad = (choice: 'correct' | 'wrong') => {
    if (step !== 2 || completed) return;
    if (choice === 'wrong') {
      markError('需要先建立左侧阻力端，再去调节右侧动力臂。');
      return;
    }
    setLeftLoaded(true);
    appendNote('装置准备：左侧已挂上两枚阻力砝码。');
    advanceStep(3, '阻力端已建立，下一步外移右侧砝码寻找平衡点。');
  };

  const handlePosition = (position: HookPosition) => {
    if (step !== 3 || completed || position === 'none') return;
    setRightPosition(position);
    setCameraPreset(position === 'far' ? 'scale' : 'fulcrum');
    appendNote(`位置调节：右侧砝码已移到${position === 'near' ? '近端' : position === 'middle' ? '中间' : '远端'}。`);
    if (position === 'far') {
      advanceStep(4, '已延长动力臂，杠杆恢复平衡，开始观察现象。');
      return;
    }
    markError(position === 'middle' ? '还差一点，再把右侧砝码外移一些。' : '动力臂太短，右侧力矩不足，继续外移砝码。');
  };

  const handleObserve = (choice: 'correct' | 'weight' | 'same') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!balanced) {
      markError('请先把右侧砝码移到能让杠杆平衡的位置。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：右侧力臂变长后，单个砝码也能与左侧阻力平衡。');
      advanceStep(5, '观察完成，最后总结杠杆省力规律。');
      return;
    }
    if (choice === 'weight') {
      markError('本次平衡主要靠改变力臂长度，不是单纯增加右侧砝码数量。');
      return;
    }
    markError('左右并不是任何位置都一样，关键在于力和力臂的乘积。');
  };

  const handleSummary = (choice: 'correct' | 'heavier' | 'shorter') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：动力臂变长时，较小的力也可能让杠杆重新平衡。');
      return;
    }
    if (choice === 'heavier') {
      markError('杠杆省力不是永远加大动力，而是要考虑力臂长度。');
      return;
    }
    markError('动力臂越短通常越费力，不利于用较小的力实现平衡。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setLeftLoaded(false);
    setRightPosition('none');
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新通过调节力臂长度观察杠杆平衡。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先建立左侧阻力端，再去调节右侧砝码。',
        '右侧砝码越向外，动力臂越长，更容易恢复平衡。',
        '观察时重点比较两侧力臂和杠杆姿态变化。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对操作顺序。',
        '建议先把右侧砝码移到远端，再观察平衡是否恢复。',
      ];

  return (
    <section className="panel playground-panel lever-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属小学科学实验页</h2>
          <p>把“挂砝码—调力臂—看平衡”做成可操作的杠杆台，让孩子真正理解什么叫省力与平衡。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid lever-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>环境</strong>
                  <span>{experiment.scene.environment}</span>
                </div>
                <span className="badge">科学</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜头</strong>
                  <span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'fulcrum' ? '支点观察' : '刻度观察'}</span>
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

          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>平衡值 {balanceValue}</span><div className="chem-meter-bar"><i style={{ width: `${balanceValue}%` }} /></div></div>
              <div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>

          <section className="info-card lever-data-card">
            <span className="eyebrow">Readout</span>
            <h3>杠杆读数板</h3>
            <div className="generic-readout-grid lever-readout-grid">
              <article className={balanced ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>杠杆姿态</span>
                <strong>{balanceLabel}</strong>
                <small>{balanced ? '两侧力矩接近，杠杆恢复水平。' : '继续外移右侧砝码，增大动力臂。'}</small>
              </article>
              <article className={rightPosition !== 'none' ? 'lab-readout-card active' : 'lab-readout-card warn'}>
                <span>动力臂</span>
                <strong>{armLength}</strong>
                <small>{rightPosition === 'far' ? '远端位置更有利于用较小的力平衡。' : '当前力臂还不足以完全平衡。'}</small>
              </article>
              <article className={observationChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>核心现象</span>
                <strong>{observationChoice === 'correct' ? '力臂变长，重新平衡' : '等待记录'}</strong>
                <small>观察重点不是重量数量，而是力和力臂的共同作用。</small>
              </article>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '杠杆尺'} · 当前重点：{step <= 2 ? '装置建立' : step === 3 ? '调节力臂' : '观察平衡'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'fulcrum' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('fulcrum')} type="button">支点</button>
              <button className={cameraPreset === 'scale' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('scale')} type="button">刻度</button>
            </div>
          </div>

          <div className={`scene-canvas lever-stage preset-${cameraPreset}`}>
            <div className="lever-rig">
              <div className="lever-shadow" />
              <div className="lever-scale" />
              <div className={`lever-beam-shell ${beamState}`}>
                <div className="lever-beam">
                  <span className="lever-mark mark-left" />
                  <span className="lever-mark mark-center" />
                  <span className="lever-mark mark-right" />
                </div>
              </div>
              <div className="lever-fulcrum" />
              <div className={`lever-hook left ${leftLoaded ? 'active' : ''}`}>
                <div className="lever-chain" />
                <div className="lever-weight-stack">
                  <span className={leftLoaded ? 'lever-weight active' : 'lever-weight'} />
                  <span className={leftLoaded ? 'lever-weight active secondary' : 'lever-weight secondary'} />
                </div>
              </div>
              <div className={`lever-hook right ${rightPosition !== 'none' ? `active ${rightPosition}` : ''}`}>
                <div className="lever-chain" />
                <div className="lever-weight-stack single">
                  <span className={rightPosition !== 'none' ? 'lever-weight active copper' : 'lever-weight copper'} />
                </div>
              </div>
              <div className={balanced ? 'lever-pointer active' : 'lever-pointer'} />
              <div className="lever-base-glow" />
            </div>
          </div>

          <div className="observation-ribbon lever-observation-row">
            <article className={leftLoaded ? 'observation-chip active' : 'observation-chip calm'}>
              <strong>阻力端</strong>
              <span>{leftLoaded ? '左侧两枚砝码已挂好，形成阻力端。' : '先建立左侧阻力端。'}</span>
            </article>
            <article className={rightPosition === 'far' ? 'observation-chip active' : rightPosition === 'none' ? 'observation-chip calm' : 'observation-chip warn'}>
              <strong>动力端</strong>
              <span>{rightPosition === 'far' ? '右侧砝码在远端，动力臂足够长。' : rightPosition === 'none' ? '等待调节右侧位置。' : '继续外移砝码以增加力臂。'}</span>
            </article>
            <article className={balanced ? 'observation-chip active' : 'observation-chip calm'}>
              <strong>平衡结论</strong>
              <span>{balanced ? '力臂调整后杠杆恢复水平。' : '平衡尚未建立。'}</span>
            </article>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}>
            <span className="eyebrow">Lab Prompt</span>
            <h3>{completed ? '实验已完成' : stepTitles[step]}</h3>
            <p>{prompt}</p>
          </div>

          <section className="info-card generic-notebook-card">
            <div className="generic-notebook-head">
              <div>
                <span className="eyebrow">Notebook</span>
                <h3>实验记录</h3>
              </div>
              <span className="badge">过程留痕</span>
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
                <div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>
              ))}
            </div>
          </section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block">
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
                  <button className="summary-choice generic-choice primary" onClick={() => handleLoad('correct')} type="button">
                    <strong>先挂左侧两枚阻力砝码</strong>
                    <span>建立需要平衡的初始状态。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleLoad('wrong')} type="button">
                    <strong>直接拖右侧砝码乱试</strong>
                    <span>错误演示：没有先建立阻力端。</span>
                  </button>
                </>
              ) : null}
              {step === 3 ? (
                <>
                  <button className={rightPosition === 'near' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handlePosition('near')} type="button">
                    <strong>挂到近端</strong>
                    <span>动力臂最短，通常无法平衡。</span>
                  </button>
                  <button className={rightPosition === 'middle' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handlePosition('middle')} type="button">
                    <strong>挂到中间</strong>
                    <span>接近平衡，但还不够稳定。</span>
                  </button>
                  <button className={rightPosition === 'far' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handlePosition('far')} type="button">
                    <strong>挂到远端</strong>
                    <span>延长动力臂，找到正确平衡点。</span>
                  </button>
                </>
              ) : null}
              {step === 4 ? (
                <>
                  <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button">
                    <strong>右侧力臂变长后，单个砝码也能平衡左侧</strong>
                    <span>这是本实验要记录的核心现象。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('weight')} type="button">
                    <strong>右侧只是因为砝码更多才平衡</strong>
                    <span>错误演示：忽略了力臂变化。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleObserve('same')} type="button">
                    <strong>右侧挂在哪都一样</strong>
                    <span>错误演示：与实验现象不符。</span>
                  </button>
                </>
              ) : null}
              {step === 5 ? (
                <>
                  <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                    <strong>动力臂越长，越可能用较小的力实现平衡</strong>
                    <span>把杠杆平衡和省力规律联系起来。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('heavier')} type="button">
                    <strong>省力就是永远把动力变得更大</strong>
                    <span>错误演示：忽略力臂条件。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleSummary('shorter')} type="button">
                    <strong>动力臂越短越省力</strong>
                    <span>错误演示：结论方向相反。</span>
                  </button>
                </>
              ) : null}
            </div>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{leftLoaded ? '左侧阻力已建立' : '待建立阻力端'} / {balanceLabel}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先比较再总结'}</li>
            </ul>
          </section>

          <section className="info-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>实验控制</h3>
            <div className="button-stack">
              <button className="action-button ghost" onClick={handleReset} type="button">重新开始</button>
            </div>
            <small>这页已把“杠杆平衡”从静态知识点升级成真实可操作的力臂调节场景。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
