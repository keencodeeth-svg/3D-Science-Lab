import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'balance' | 'cylinder';
type EquipmentId = 'balance' | 'metal-block' | 'graduated-cylinder';
type TimelineState = 'done' | 'current' | 'todo';

interface DensityLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const identifyOrder: EquipmentId[] = ['balance', 'metal-block', 'graduated-cylinder'];
const equipmentLabels: Record<EquipmentId, string> = {
  balance: '托盘天平',
  'metal-block': '金属块',
  'graduated-cylinder': '量筒',
};
const stepTitles: Record<StepId, string> = {
  1: '识别器材',
  2: '测量质量',
  3: '测量体积',
  4: '计算密度',
  5: '总结方法',
};
const stepPrompts: Record<StepId, string> = {
  1: '先点击托盘天平、金属块和量筒，完成器材识别。',
  2: '先校零，再把金属块放上托盘天平，读取质量。',
  3: '先观察初始液面，再把金属块浸入量筒，用排水法读取体积。',
  4: '根据质量和排开水的体积计算密度，注意使用正确公式。',
  5: '总结测量固体密度的步骤与注意事项。',
};

const MASS_VALUE = 54.2;
const INITIAL_LEVEL = 35.0;
const FINAL_LEVEL = 42.0;
const VOLUME_VALUE = Number((FINAL_LEVEL - INITIAL_LEVEL).toFixed(1));
const DENSITY_VALUE = Number((MASS_VALUE / VOLUME_VALUE).toFixed(2));

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

export function DensityLabPlayer({ experiment, onTelemetry }: DensityLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedEquipment, setIdentifiedEquipment] = useState<EquipmentId[]>([]);
  const [balanceZeroed, setBalanceZeroed] = useState(false);
  const [blockOnBalance, setBlockOnBalance] = useState(false);
  const [massRecorded, setMassRecorded] = useState(false);
  const [initialLevelSeen, setInitialLevelSeen] = useState(false);
  const [blockInCylinder, setBlockInCylinder] = useState(false);
  const [volumeRecorded, setVolumeRecorded] = useState(false);
  const [densityChoice, setDensityChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先识别器材，再按质量 → 体积 → 密度的顺序操作。']);

  const score = Math.max(78, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const safetyValue = clamp(96 - errors * 6, 56, 99);
  const clarityValue = clamp(52 + (massRecorded ? 12 : 0) + (initialLevelSeen ? 6 : 0) + (volumeRecorded ? 14 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 36, 99);
  const readinessValue = clamp(progressPercent + (massRecorded ? 10 : 0) + (volumeRecorded ? 15 : 0) + (densityChoice === 'correct' ? 18 : 0), 20, 100);

  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const currentLevel = blockInCylinder ? FINAL_LEVEL : INITIAL_LEVEL;
  const waterHeightPercent = (currentLevel / 50) * 100;
  const blockDepthPercent = blockInCylinder ? 54 : 12;
  const canRecordMass = balanceZeroed && blockOnBalance;
  const canRecordVolume = initialLevelSeen && blockInCylinder;
  const currentStepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const summaryReady = densityChoice === 'correct';

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

      if (next.length === identifyOrder.length) {
        advanceStep(2, '器材识别完成，下一步去天平区完成质量测量。');
        setCameraPreset('balance');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${identifyOrder.length} 个核心器材，继续检查实验台。`);
      }

      return next;
    });
  };

  const handleZeroBalance = () => {
    if (step !== 2 || completed) return;
    setBalanceZeroed(true);
    setPromptTone('success');
    setPrompt('天平已校零，现在可以把金属块放上去。');
    appendNote('质量测量：托盘天平已校零');
  };

  const handlePlaceBlockOnBalance = () => {
    if (step !== 2 || completed) return;
    if (!balanceZeroed) {
      markError('请先校零天平，再放置金属块。');
      return;
    }
    setBlockOnBalance(true);
    setPromptTone('success');
    setPrompt('金属块已放稳，请平视读数并记录质量。');
    appendNote('质量测量：金属块已放上天平');
  };

  const handleRecordMass = (mode: 'correct' | 'incorrect') => {
    if (step !== 2 || completed) return;
    if (!canRecordMass) {
      markError('请先完成校零并把金属块放上天平。');
      return;
    }
    if (mode === 'incorrect') {
      markError('该质量读数不规范，请平视并记录正确示数。');
      return;
    }
    setMassRecorded(true);
    appendNote(`质量记录：m = ${MASS_VALUE} g`);
    setCameraPreset('cylinder');
    advanceStep(3, `质量记录完成：金属块质量为 ${MASS_VALUE} g，下一步用排水法测体积。`);
  };

  const handleInspectInitialLevel = () => {
    if (step !== 3 || completed) return;
    setInitialLevelSeen(true);
    setPromptTone('success');
    setPrompt(`已读取初始液面：${INITIAL_LEVEL.toFixed(1)} mL，接着把金属块缓慢浸入量筒。`);
    appendNote(`体积测量：初始液面 ${INITIAL_LEVEL.toFixed(1)} mL`);
  };

  const handleImmerseBlock = () => {
    if (step !== 3 || completed) return;
    if (!initialLevelSeen) {
      markError('请先读取量筒初始液面，再放入金属块。');
      return;
    }
    setBlockInCylinder(true);
    setPromptTone('success');
    setPrompt('金属块已浸入量筒，请平视新的液面位置并计算体积差。');
    appendNote(`体积测量：液面升至 ${FINAL_LEVEL.toFixed(1)} mL`);
  };

  const handleRecordVolume = (mode: 'correct' | 'incorrect') => {
    if (step !== 3 || completed) return;
    if (!canRecordVolume) {
      markError('请先读取初始液面并完成排水操作。');
      return;
    }
    if (mode === 'incorrect') {
      markError('量筒读数不正确，请保持视线与凹液面最低点相平。');
      return;
    }
    setVolumeRecorded(true);
    appendNote(`体积记录：V = ${VOLUME_VALUE.toFixed(1)} cm³`);
    advanceStep(4, `体积记录完成：金属块体积为 ${VOLUME_VALUE.toFixed(1)} cm³，下一步计算密度。`);
  };

  const handleDensityChoice = (choice: 'correct' | 'wrong-formula' | 'wrong-number') => {
    if (step !== 4 || completed) return;
    setDensityChoice(choice);
    if (!massRecorded || !volumeRecorded) {
      markError('请先完成质量和体积测量，再进行密度计算。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'wrong-formula' ? '公式使用错误，密度应使用质量除以体积。' : '结果代入错误，请重新核对数据。');
      return;
    }
    appendNote(`密度计算：ρ = ${DENSITY_VALUE.toFixed(2)} g/cm³`);
    advanceStep(5, `计算正确：ρ = ${MASS_VALUE} ÷ ${VOLUME_VALUE.toFixed(1)} = ${DENSITY_VALUE.toFixed(2)} g/cm³。`);
  };

  const handleSummary = (choice: 'correct' | 'missing-step' | 'wrong-relation') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (!summaryReady) {
      markError('请先完成密度计算，再总结实验方法。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'missing-step' ? '总结不完整，缺少质量、体积和密度的完整关系。' : '结论关系错误，密度并不是质量和体积的简单相加。');
      return;
    }
    advanceStep(null, experiment.feedback.successSummary);
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedEquipment([]);
    setBalanceZeroed(false);
    setBlockOnBalance(false);
    setMassRecorded(false);
    setInitialLevelSeen(false);
    setBlockInCylinder(false);
    setVolumeRecorded(false);
    setDensityChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先识别器材，再按质量 → 体积 → 密度的顺序操作。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '天平读数前先校零，再放置金属块。',
        '量筒体积要先看初始液面，再看浸没后的最终液面。',
        `密度公式固定为 ρ = m / V，本实验结果应接近 ${DENSITY_VALUE.toFixed(2)} g/cm³。`,
      ]
    : [
        currentStepConfig?.failureHints[0] ?? '请回到当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对读数和公式。',
        '先修正读数流程，再继续后续计算，避免把前一步错误带到结论里。',
      ];

  return (
    <section className="panel playground-panel density-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属密度实验页</h2>
          <p>围绕“天平读数 + 排水法液面 + 公式计算”重做专属交互，把高频物理实验从通用页升级成更接近产品级的实验体验。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid density-grid">
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
                  <span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'balance' ? '天平特写' : '量筒特写'}</span>
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

          <section className="info-card density-data-card">
            <span className="eyebrow">Data</span>
            <h3>实验数据板</h3>
            <div className="density-data-grid">
              <div className="density-data-item">
                <span>质量 m</span>
                <strong>{massRecorded ? `${MASS_VALUE.toFixed(1)} g` : '--'}</strong>
              </div>
              <div className="density-data-item">
                <span>初始液面</span>
                <strong>{initialLevelSeen ? `${INITIAL_LEVEL.toFixed(1)} mL` : '--'}</strong>
              </div>
              <div className="density-data-item">
                <span>最终液面</span>
                <strong>{blockInCylinder ? `${FINAL_LEVEL.toFixed(1)} mL` : '--'}</strong>
              </div>
              <div className="density-data-item">
                <span>体积 V</span>
                <strong>{volumeRecorded ? `${VOLUME_VALUE.toFixed(1)} cm³` : '--'}</strong>
              </div>
              <div className="density-data-item wide">
                <span>密度 ρ</span>
                <strong>{densityChoice === 'correct' ? `${DENSITY_VALUE.toFixed(2)} g/cm³` : '--'}</strong>
              </div>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{currentStepConfig?.targetObject ?? '实验台'} · 当前重点：{step === 2 ? '质量读数' : step === 3 ? '液面差值' : step === 4 ? '公式计算' : '规范流程'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'balance' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('balance')} type="button">天平</button>
              <button className={cameraPreset === 'cylinder' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('cylinder')} type="button">量筒</button>
            </div>
          </div>

          <div className={`scene-canvas density-stage preset-${cameraPreset}`}>
            <div className="density-stage-head">
              <div>
                <span className="eyebrow">Live Measurement</span>
                <h3>{experiment.curriculum.unit}</h3>
                <p>{promptTone === 'error' ? '当前步骤存在操作偏差，请先修正再继续。' : '围绕质量、体积和密度三个核心数据完成实验。'}</p>
              </div>
              <div className="status-pill-row">
                <span className="status-pill ready">进度 {progressPercent}%</span>
                <span className="status-pill">错误 {errors}</span>
              </div>
            </div>

            <div className="density-stage-grid">
              <article className={cameraPreset === 'balance' ? 'density-stage-card focus' : 'density-stage-card'}>
                <div className="density-stage-card-head">
                  <strong>托盘天平</strong>
                  <small>{balanceZeroed ? '已校零' : '待校零'}</small>
                </div>
                <div className="balance-rig">
                  <div className="balance-display">{canRecordMass ? MASS_VALUE.toFixed(1) : balanceZeroed ? '0.0' : '--'} g</div>
                  <div className="balance-beam">
                    <div className={blockOnBalance ? 'balance-plate loaded' : 'balance-plate'} />
                    <div className={blockOnBalance ? 'balance-plate loaded' : 'balance-plate'} />
                  </div>
                  <div className={blockOnBalance ? 'metal-block-chip active' : 'metal-block-chip'}>金属块</div>
                </div>
                <div className="measurement-strip">
                  <div className="measurement-card">
                    <span>校零</span>
                    <strong>{balanceZeroed ? '完成' : '未完成'}</strong>
                  </div>
                  <div className="measurement-card">
                    <span>读数</span>
                    <strong>{massRecorded ? `${MASS_VALUE.toFixed(1)} g` : '--'}</strong>
                  </div>
                </div>
              </article>

              <article className={cameraPreset === 'cylinder' ? 'density-stage-card focus' : 'density-stage-card'}>
                <div className="density-stage-card-head">
                  <strong>量筒与排水法</strong>
                  <small>{blockInCylinder ? '金属块已浸没' : '等待排水操作'}</small>
                </div>
                <div className="cylinder-rig">
                  <div className="cylinder-scale">
                    <span>50</span>
                    <span>40</span>
                    <span>30</span>
                    <span>20</span>
                    <span>10</span>
                  </div>
                  <div className="cylinder-shell">
                    <div className="cylinder-water" style={{ height: `${waterHeightPercent}%` }} />
                    <div className={blockInCylinder ? 'cylinder-block immersed' : 'cylinder-block'} style={{ bottom: `${blockDepthPercent}%` }} />
                    <div className="cylinder-meniscus" style={{ bottom: `${waterHeightPercent}%` }} />
                  </div>
                  <div className="cylinder-readout">{currentLevel.toFixed(1)} mL</div>
                </div>
                <div className="measurement-strip">
                  <div className="measurement-card">
                    <span>初始液面</span>
                    <strong>{initialLevelSeen ? `${INITIAL_LEVEL.toFixed(1)} mL` : '--'}</strong>
                  </div>
                  <div className="measurement-card">
                    <span>排水体积</span>
                    <strong>{volumeRecorded ? `${VOLUME_VALUE.toFixed(1)} cm³` : '--'}</strong>
                  </div>
                </div>
              </article>
            </div>

            <div className="density-insight-row">
              <article className="lab-readout-card active">
                <span>质量读数</span>
                <strong>{massRecorded ? `${MASS_VALUE.toFixed(1)} g` : '等待读数'}</strong>
                <small>先校零，再放置金属块，读数时保持视线稳定。</small>
              </article>
              <article className="lab-readout-card calm">
                <span>液面差值</span>
                <strong>{volumeRecorded ? `${INITIAL_LEVEL.toFixed(1)} → ${FINAL_LEVEL.toFixed(1)} mL` : '等待排水法操作'}</strong>
                <small>体积来自最终液面减去初始液面，不是直接读取某一个高度。</small>
              </article>
              <article className={densityChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card warn'}>
                <span>密度计算</span>
                <strong>{densityChoice === 'correct' ? `${DENSITY_VALUE.toFixed(2)} g/cm³` : '等待计算'}</strong>
                <small>使用公式 ρ = m / V，把前两步的有效数据代入即可。</small>
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
              {step === 1 ? (
                identifyOrder.map((equipmentId) => (
                  <button className="summary-choice generic-choice primary" key={equipmentId} onClick={() => handleIdentify(equipmentId)} type="button">
                    <strong>识别 {equipmentLabels[equipmentId]}</strong>
                    <span>{identifiedEquipment.includes(equipmentId) ? '已完成识别' : '点击后将其标记为已识别器材'}</span>
                  </button>
                ))
              ) : null}

              {step === 2 ? (
                <>
                  <button className="summary-choice generic-choice primary" onClick={handleZeroBalance} type="button">
                    <strong>校零天平</strong>
                    <span>先归零再开始质量测量。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={handlePlaceBlockOnBalance} type="button">
                    <strong>放上金属块</strong>
                    <span>把金属块平稳放置在托盘上。</span>
                  </button>
                  <button className="summary-choice generic-choice primary" onClick={() => handleRecordMass('correct')} type="button">
                    <strong>记录 54.2 g</strong>
                    <span>平视示数并记录正确质量。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleRecordMass('incorrect')} type="button">
                    <strong>记录 45.2 g</strong>
                    <span>错误示数，用来校验读数规范。</span>
                  </button>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <button className="summary-choice generic-choice secondary" onClick={handleInspectInitialLevel} type="button">
                    <strong>读取初始液面 35.0 mL</strong>
                    <span>先记录量筒内初始水量。</span>
                  </button>
                  <button className="summary-choice generic-choice primary" onClick={handleImmerseBlock} type="button">
                    <strong>浸入金属块</strong>
                    <span>缓慢放入量筒，观察液面上升。</span>
                  </button>
                  <button className="summary-choice generic-choice primary" onClick={() => handleRecordVolume('correct')} type="button">
                    <strong>记录体积 7.0 cm³</strong>
                    <span>用 42.0 - 35.0 得到金属块体积。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleRecordVolume('incorrect')} type="button">
                    <strong>记录体积 6.0 cm³</strong>
                    <span>斜视或误读液面会得到错误体积。</span>
                  </button>
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <button className={densityChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleDensityChoice('correct')} type="button">
                    <strong>ρ = 54.2 ÷ 7.0 = 7.74</strong>
                    <span>使用质量除以体积，得到正确密度。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleDensityChoice('wrong-formula')} type="button">
                    <strong>ρ = 7.0 ÷ 54.2</strong>
                    <span>公式颠倒，不能用体积除以质量。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleDensityChoice('wrong-number')} type="button">
                    <strong>ρ = 6.20 g/cm³</strong>
                    <span>公式看似正确，但代入结果错误。</span>
                  </button>
                </>
              ) : null}

              {step === 5 ? (
                <>
                  <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                    <strong>先测质量，再用排水法测体积，最后用 ρ = m / V 计算密度</strong>
                    <span>完整概括了规范步骤与核心关系。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('missing-step')} type="button">
                    <strong>只要量筒读数正确，就能直接写出密度</strong>
                    <span>缺少质量测量，步骤不完整。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleSummary('wrong-relation')} type="button">
                    <strong>密度等于质量加体积</strong>
                    <span>结论关系错误，不符合物理定义。</span>
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
              <li>关键能力：{currentStepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>核心数据：质量 {massRecorded ? `${MASS_VALUE.toFixed(1)} g` : '待记录'} / 体积 {volumeRecorded ? `${VOLUME_VALUE.toFixed(1)} cm³` : '待记录'}</li>
              <li>风险提醒：{currentStepConfig?.failureHints[0] ?? '请注意实验规范'}</li>
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
            <small>本页聚焦中学高频实验“测量固体密度”，后续可以继续把酸碱检验、光的折射等实验逐步升级为同级别专属页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
