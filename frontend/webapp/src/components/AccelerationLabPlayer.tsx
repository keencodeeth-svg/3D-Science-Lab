import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5 | 6;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'track' | 'data';
type EquipmentId = 'track' | 'cart' | 'pulley' | 'weights' | 'timer';
type VariableMode = 'force' | 'mass';
type TimelineState = 'done' | 'current' | 'todo';

interface AccelerationLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

interface RunRecord {
  id: string;
  label: string;
  force: number;
  mass: number;
  acceleration: number;
}

const stepTitles: Record<StepId, string> = {
  1: '识别器材',
  2: '搭建实验装置',
  3: '加入拉力砝码',
  4: '调整变量',
  5: '记录加速度变化',
  6: '总结关系',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别导轨、小车、滑轮、砝码组和计时读数面板。',
  2: '完成导轨、小车和滑轮的装置搭建。',
  3: '加入砝码，为小车提供牵引力。',
  4: '选择改变受力或改变质量，保持其余条件尽量不变。',
  5: '比较不同条件下的加速度读数，形成至少两组有效对照。',
  6: '根据控制变量法，总结力、质量与加速度的关系。',
};

const equipmentLabels: Record<EquipmentId, string> = {
  track: '导轨',
  cart: '小车',
  pulley: '滑轮',
  weights: '砝码组',
  timer: '计时读数面板',
};

const equipmentOrder: EquipmentId[] = ['track', 'cart', 'pulley', 'weights', 'timer'];

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

export function AccelerationLabPlayer({ experiment, onTelemetry }: AccelerationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedEquipment, setIdentifiedEquipment] = useState<EquipmentId[]>([]);
  const [assembledParts, setAssembledParts] = useState<string[]>([]);
  const [weightsAdded, setWeightsAdded] = useState(false);
  const [variableMode, setVariableMode] = useState<VariableMode | null>(null);
  const [runRecords, setRunRecords] = useState<RunRecord[]>([]);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先搭好装置，再用控制变量法比较受力或质量变化带来的加速度变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const setupReady = assembledParts.includes('track') && assembledParts.includes('cart') && assembledParts.includes('pulley');
  const compareReady = runRecords.length >= 2;
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 6) * 100);
  const safetyValue = clamp(96 - errors * 4, 66, 99);
  const clarityValue = clamp(48 + (setupReady ? 12 : 0) + (weightsAdded ? 12 : 0) + (variableMode ? 14 : 0) + runRecords.length * 8 + (cameraPreset !== 'bench' ? 8 : 0), 36, 99);
  const readinessValue = clamp(progressPercent + (setupReady ? 10 : 0) + (variableMode ? 10 : 0) + runRecords.length * 10, 20, 100);
  const trackOffset = compareReady ? 64 : runRecords.length === 1 ? 40 : 18;

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

  const handleIdentify = (equipmentId: EquipmentId) => {
    if (step !== 1 || completed) return;
    setIdentifiedEquipment((current) => {
      if (current.includes(equipmentId)) return current;
      const next = [...current, equipmentId];
      appendNote(`器材识别：${equipmentLabels[equipmentId]}`);
      if (next.length === equipmentOrder.length) {
        setCameraPreset('track');
        advanceStep(2, '识别完成，下一步搭建导轨、小车和滑轮实验装置。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${equipmentOrder.length} 个器材，继续检查动力学实验台。`);
      }
      return next;
    });
  };

  const handleAssemble = (part: 'track' | 'cart' | 'pulley') => {
    if (step !== 2 || completed) return;
    setAssembledParts((current) => {
      if (current.includes(part)) return current;
      const next = [...current, part];
      appendNote(`装置搭建：已放置${equipmentLabels[part]}`);
      if (next.includes('track') && next.includes('cart') && next.includes('pulley')) {
        advanceStep(3, '实验装置已搭好，下一步加入拉力砝码。');
      } else {
        setPromptTone('success');
        setPrompt('继续完成导轨、小车和滑轮的连接。');
      }
      return next;
    });
  };

  const handleWeights = (mode: 'correct' | 'missing') => {
    if (step !== 3 || completed) return;
    if (!setupReady) {
      markError('请先搭好导轨、小车和滑轮，再加入砝码。');
      return;
    }
    if (mode === 'missing') {
      markError('没有提供牵引力就无法比较加速度变化，请先加入砝码。');
      return;
    }
    setWeightsAdded(true);
    appendNote('实验准备：已加入拉力砝码');
    advanceStep(4, '拉力砝码已加入，下一步明确本轮控制变量。');
  };

  const handleVariable = (mode: VariableMode | 'mixed') => {
    if (step !== 4 || completed) return;
    if (!weightsAdded) {
      markError('请先完成砝码加入，再设置控制变量。');
      return;
    }
    if (mode === 'mixed') {
      markError('同一轮实验不能同时随意改变多个变量，请明确控制受力或质量中的一个。');
      return;
    }
    setVariableMode(mode);
    setCameraPreset('data');
    appendNote(`控制变量：本轮选择比较${mode === 'force' ? '受力' : '质量'}变化`);
    advanceStep(5, `已确定控制变量：比较${mode === 'force' ? '受力' : '质量'}变化，开始记录加速度。`);
  };

  const handleRun = (runKey: 'force-a' | 'force-b' | 'mass-a' | 'mass-b' | 'wrong') => {
    if (step !== 5 || completed) return;
    if (!variableMode) {
      markError('请先选择控制变量，再记录加速度。');
      return;
    }
    if (runKey === 'wrong') {
      markError('只做一次测量不足以下结论，请至少形成两组有效对照。');
      return;
    }

    const recordMap: Record<Exclude<typeof runKey, 'wrong'>, RunRecord> = {
      'force-a': { id: 'force-a', label: '小拉力', force: 1, mass: 1, acceleration: 1.2 },
      'force-b': { id: 'force-b', label: '大拉力', force: 2, mass: 1, acceleration: 2.4 },
      'mass-a': { id: 'mass-a', label: '标准质量', force: 1, mass: 1, acceleration: 1.8 },
      'mass-b': { id: 'mass-b', label: '增大质量', force: 1, mass: 2, acceleration: 0.9 },
    };

    const record = recordMap[runKey];
    const matchesMode = variableMode === 'force' ? runKey.startsWith('force') : runKey.startsWith('mass');
    if (!matchesMode) {
      markError(`当前轮次比较的是${variableMode === 'force' ? '受力' : '质量'}，请不要混入另一类数据。`);
      return;
    }

    setRunRecords((current) => {
      if (current.some((item) => item.id === record.id)) {
        setPromptTone('success');
        setPrompt(`已存在「${record.label}」的数据，可继续补充另一组对照。`);
        return current;
      }
      const next = [...current, record];
      appendNote(`读数记录：${record.label} -> 加速度 ${record.acceleration.toFixed(1)} m/s²`);
      if (next.length >= 2) {
        advanceStep(6, '已形成两组有效对照，最后总结力、质量与加速度之间的关系。');
      } else {
        setPromptTone('success');
        setPrompt('已记录第一组数据，请继续补充另一组对照。');
      }
      return next;
    });
  };

  const handleSummary = (choice: 'force-correct' | 'mass-correct' | 'wrong') => {
    if (step !== 6 || completed) return;
    setSummaryChoice(choice);
    if (!compareReady || !variableMode) {
      markError('请先完成至少两组有效对照，再总结规律。');
      return;
    }

    if (variableMode === 'force') {
      if (choice !== 'force-correct') {
        markError('在质量不变时，受力越大，加速度越大。');
        return;
      }
    } else if (choice !== 'mass-correct') {
      markError('在受力不变时，质量越大，加速度越小。');
      return;
    }

    advanceStep(null, experiment.feedback.successSummary);
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedEquipment([]);
    setAssembledParts([]);
    setWeightsAdded(false);
    setVariableMode(null);
    setRunRecords([]);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先搭好装置，再用控制变量法比较受力或质量变化带来的加速度变化。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先固定一种变量，再改变另一种变量，避免控制变量法失效。',
        '至少做两组有效测量，才能从数据趋势而不是单点结果下结论。',
        '质量不变时受力越大加速度越大；受力不变时质量越大加速度越小。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对变量和对照数据。',
        '建议先明确本轮实验只比较“力”或“质量”其中一个变量，再继续记录数据。',
      ];

  return (
    <section className="panel playground-panel acceleration-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属动力学实验页</h2>
          <p>围绕控制变量、多组读数和关系归纳做专属升级，让加速度实验真正具备数据对照和规律总结的物理体验。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 6</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid acceleration-grid">
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
                <span className="badge">物理</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜头</strong>
                  <span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'track' ? '导轨视角' : '数据视角'}</span>
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

          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>安全值 {safetyValue}</span><div className="chem-meter-bar"><i style={{ width: `${safetyValue}%` }} /></div></div>
              <div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>

          <section className="info-card acceleration-data-card">
            <span className="eyebrow">Data</span>
            <h3>控制变量记录板</h3>
            <div className="acceleration-data-grid">
              {runRecords.length ? runRecords.map((record) => (
                <div className="acceleration-data-item" key={record.id}>
                  <span>{record.label}</span>
                  <strong>{record.acceleration.toFixed(1)} m/s²</strong>
                  <small>F={record.force} / m={record.mass}</small>
                </div>
              )) : (
                <div className="acceleration-data-item wide">
                  <span>当前暂无记录</span>
                  <strong>等待对照数据</strong>
                  <small>先明确变量模式，再补两组有效读数。</small>
                </div>
              )}
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '导轨装置'} · 当前重点：{step === 4 ? '控制变量' : step === 5 ? '对照记录' : step === 6 ? '规律总结' : '装置准备'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'track' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('track')} type="button">导轨</button>
              <button className={cameraPreset === 'data' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('data')} type="button">数据</button>
            </div>
          </div>

          <div className={`scene-canvas acceleration-stage preset-${cameraPreset}`}>
            <div className="acceleration-stage-head">
              <div>
                <span className="eyebrow">Live Physics</span>
                <h3>{experiment.curriculum.unit}</h3>
                <p>{promptTone === 'error' ? '当前变量控制或读数策略存在偏差，请先修正再继续。' : '重点关注导轨装置、变量选择和多组加速度对照。'}</p>
              </div>
              <div className="status-pill-row">
                <span className="status-pill ready">进度 {progressPercent}%</span>
                <span className="status-pill">模式 {variableMode ? (variableMode === 'force' ? '受力对照' : '质量对照') : '待选择'}</span>
              </div>
            </div>

            <div className="acceleration-track-card">
              <div className="track-rig">
                <div className="track-line" />
                <div className="pulley-wheel" />
                <div className="cart-block" style={{ left: `${trackOffset}%` }} />
                <div className="weight-stack">
                  <span className={weightsAdded ? 'weight-chip active' : 'weight-chip'} />
                  <span className={weightsAdded ? 'weight-chip active' : 'weight-chip'} />
                  {variableMode === 'force' && runRecords.some((item) => item.force === 2) ? <span className="weight-chip active" /> : null}
                </div>
              </div>
            </div>

            <div className="acceleration-insight-row">
              <article className="lab-readout-card active">
                <span>装置状态</span>
                <strong>{setupReady ? '导轨 + 小车 + 滑轮已就位' : '等待搭建'}</strong>
                <small>控制变量实验首先要有稳定、完整的动力学装置。</small>
              </article>
              <article className="lab-readout-card calm">
                <span>变量模式</span>
                <strong>{variableMode ? (variableMode === 'force' ? '质量不变，比较受力' : '受力不变，比较质量') : '待选择'}</strong>
                <small>同一轮只改变一个变量，其他条件保持尽量不变。</small>
              </article>
              <article className={compareReady ? 'lab-readout-card active' : 'lab-readout-card warn'}>
                <span>数据对照</span>
                <strong>{compareReady ? `${runRecords.length} 组有效数据` : '等待两组对照'}</strong>
                <small>至少要有两组数据，才能把读数转化成规律判断。</small>
              </article>
            </div>
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
                <div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>
                  {note}
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>当前步骤操作</h3>
            <div className="summary-stack generic-choice-stack">
              {step === 1 ? equipmentOrder.map((equipmentId) => (
                <button className="summary-choice generic-choice primary" key={equipmentId} onClick={() => handleIdentify(equipmentId)} type="button">
                  <strong>识别 {equipmentLabels[equipmentId]}</strong>
                  <span>{identifiedEquipment.includes(equipmentId) ? '已完成识别' : '点击后标记为已识别器材'}</span>
                </button>
              )) : null}

              {step === 2 ? (
                <>
                  <button className={assembledParts.includes('track') ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleAssemble('track')} type="button">
                    <strong>摆好导轨</strong>
                    <span>建立小车运动路径。</span>
                  </button>
                  <button className={assembledParts.includes('cart') ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleAssemble('cart')} type="button">
                    <strong>放置小车</strong>
                    <span>小车作为被研究对象进入装置。</span>
                  </button>
                  <button className={assembledParts.includes('pulley') ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleAssemble('pulley')} type="button">
                    <strong>接入滑轮</strong>
                    <span>形成砝码牵引路径。</span>
                  </button>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <button className={weightsAdded ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleWeights('correct')} type="button">
                    <strong>加入拉力砝码</strong>
                    <span>为小车提供牵引力。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleWeights('missing')} type="button">
                    <strong>不加砝码直接测量</strong>
                    <span>错误演示：没有驱动力。</span>
                  </button>
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <button className={variableMode === 'force' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleVariable('force')} type="button">
                    <strong>选择“受力对照”</strong>
                    <span>保持质量不变，比较不同拉力。</span>
                  </button>
                  <button className={variableMode === 'mass' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleVariable('mass')} type="button">
                    <strong>选择“质量对照”</strong>
                    <span>保持受力不变，比较不同质量。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleVariable('mixed')} type="button">
                    <strong>同时乱改两个变量</strong>
                    <span>错误演示：控制变量法失效。</span>
                  </button>
                </>
              ) : null}

              {step === 5 ? (
                <>
                  {variableMode === 'force' ? (
                    <>
                      <button className="summary-choice generic-choice primary" onClick={() => handleRun('force-a')} type="button">
                        <strong>记录“小拉力”数据</strong>
                        <span>F=1, m=1, a=1.2 m/s²</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleRun('force-b')} type="button">
                        <strong>记录“大拉力”数据</strong>
                        <span>F=2, m=1, a=2.4 m/s²</span>
                      </button>
                    </>
                  ) : null}
                  {variableMode === 'mass' ? (
                    <>
                      <button className="summary-choice generic-choice primary" onClick={() => handleRun('mass-a')} type="button">
                        <strong>记录“标准质量”数据</strong>
                        <span>F=1, m=1, a=1.8 m/s²</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleRun('mass-b')} type="button">
                        <strong>记录“增大质量”数据</strong>
                        <span>F=1, m=2, a=0.9 m/s²</span>
                      </button>
                    </>
                  ) : null}
                  <button className="summary-choice generic-choice danger" onClick={() => handleRun('wrong')} type="button">
                    <strong>只做一组就总结</strong>
                    <span>错误演示：对照数据不足。</span>
                  </button>
                </>
              ) : null}

              {step === 6 ? (
                <>
                  <button className={summaryChoice === 'force-correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('force-correct')} type="button">
                    <strong>质量不变时，受力越大，加速度越大</strong>
                    <span>适用于当前“受力对照”模式。</span>
                  </button>
                  <button className={summaryChoice === 'mass-correct' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleSummary('mass-correct')} type="button">
                    <strong>受力不变时，质量越大，加速度越小</strong>
                    <span>适用于当前“质量对照”模式。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleSummary('wrong')} type="button">
                    <strong>加速度与力、质量都没有明确关系</strong>
                    <span>错误演示：忽略控制变量下的数据趋势。</span>
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
              <li>对照状态：{variableMode ? (variableMode === 'force' ? '比较受力' : '比较质量') : '待选模式'} / 已记录 {runRecords.length} 组</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意实验规范'}</li>
            </ul>
          </section>

          <section className="info-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>实验控制</h3>
            <div className="button-stack">
              <button className="action-button ghost" onClick={handleReset} type="button">重新开始</button>
            </div>
            <small>这页已把“加速度与力、质量的关系”升级成可做对照、可记数据、可总结规律的专属物理实验页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
