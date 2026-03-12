import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'jar' | 'gauge';
type MaterialId = 'bell' | 'jar' | 'pump' | 'hose' | 'gauge';
type AirMode = 'normal' | 'vacuum' | null;
type TimelineState = 'done' | 'current' | 'todo';

interface SoundMediumLabPlayerProps {
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
  2: '组装真空罩装置',
  3: '启动抽气过程',
  4: '比较铃声变化',
  5: '总结传声条件',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别电铃、玻璃罩、抽气泵、导管和压力表。',
  2: '把玻璃罩、导管和抽气泵按规范连接好。',
  3: '先听常压下铃声，再继续抽气到低压。',
  4: '比较空气减少前后铃声强弱变化。',
  5: '总结声音传播需要介质，真空不能传声。',
};

const materialLabels: Record<MaterialId, string> = {
  bell: '电铃',
  jar: '玻璃罩',
  pump: '抽气泵',
  hose: '导管',
  gauge: '压力表',
};

const materialOrder: MaterialId[] = ['bell', 'jar', 'pump', 'hose', 'gauge'];

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

export function SoundMediumLabPlayer({ experiment, onTelemetry }: SoundMediumLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [assembled, setAssembled] = useState(false);
  const [airMode, setAirMode] = useState<AirMode>(null);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先连接真空罩，再比较抽气前后铃声变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const pressure = airMode === 'vacuum' ? 18 : 101;
  const loudness = airMode === 'vacuum' ? 16 : airMode === 'normal' ? 92 : 88;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const transmissionValue = clamp(44 + (assembled ? 16 : 0) + (airMode === 'normal' ? 10 : 0) + (airMode === 'vacuum' ? 24 : 0) + (observationChoice === 'correct' ? 8 : 0), 24, 99);
  const clarityValue = clamp(40 + (cameraPreset !== 'bench' ? 10 : 0) + (airMode ? 16 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (assembled ? 12 : 0) + (airMode === 'vacuum' ? 18 : 0), 20, 100);

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
        setCameraPreset('jar');
        advanceStep(2, '器材识别完成，下一步组装真空罩装置。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleAssemble = (choice: 'correct' | 'open-jar') => {
    if (step !== 2 || completed) return;
    if (choice === 'open-jar') {
      markError('若玻璃罩没有密封，抽气后就无法形成明显低压对照。');
      return;
    }
    setAssembled(true);
    appendNote('装置搭建：真空罩、导管和抽气泵已连接完成。');
    advanceStep(3, '装置已连接好，下一步先听常压，再抽气到低压。');
  };

  const handlePump = (choice: 'normal' | 'vacuum') => {
    if (step !== 3 || completed) return;
    if (!assembled) {
      markError('请先完成装置连接，再进行抽气。');
      return;
    }
    setAirMode(choice);
    if (choice === 'normal') {
      appendNote('实验记录：常压下电铃声音清晰，声波传播明显。');
      setPromptTone('success');
      setPrompt('已记录常压下铃声，请继续抽气到低压状态。');
      setCameraPreset('gauge');
      return;
    }
    appendNote('抽气过程：罩内空气减少，压力下降，铃声明显减弱。');
    setCameraPreset('jar');
    advanceStep(4, '已抽气到低压，请比较空气减少前后的铃声变化。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'louder') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (airMode !== 'vacuum') {
      markError('请先继续抽气到低压状态，再比较铃声变化。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：空气越少，铃声越弱，说明传声依赖介质。');
      advanceStep(5, '现象判断正确，最后总结声音传播条件。');
      return;
    }
    if (choice === 'same') {
      markError('抽气后铃声不会与常压下完全相同。');
      return;
    }
    markError('空气减少后铃声不会更大，而是明显减弱。');
  };

  const handleSummary = (choice: 'correct' | 'glass' | 'light') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：声音传播需要介质，真空不能传声。');
      return;
    }
    if (choice === 'glass') {
      markError('玻璃罩只是实验装置，关键变量是罩内是否有空气介质。');
      return;
    }
    markError('本实验讨论的是声音，不是光的传播条件。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setAssembled(false);
    setAirMode(null);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新连接真空罩并比较抽气前后铃声。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先保证玻璃罩密封，再进行抽气。',
        '先记录常压声音，再看低压后的变化。',
        '结论要围绕“声音需要介质”。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对声音变化。',
        '建议重新执行“常压记录 → 抽气低压 → 比较铃声”的流程。',
      ];

  return (
    <section className="panel playground-panel soundmedium-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把真空罩内的声波衰减、低压表盘和抽气过程做成连续反馈，让“传声需要介质”更有说服力。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid soundmedium-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'jar' ? '玻璃罩观察' : '压力读数'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>传声值 {transmissionValue}</span><div className="chem-meter-bar"><i style={{ width: `${transmissionValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card soundmedium-data-card"><span className="eyebrow">Readout</span><h3>传声读数板</h3><div className="generic-readout-grid soundmedium-readout-grid"><article className={assembled ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装置状态</span><strong>{assembled ? '密封已完成' : '待连接'}</strong><small>{assembled ? '玻璃罩和抽气泵已连好。' : '先完成规范连接。'}</small></article><article className={airMode ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>罩内压力</span><strong>{airMode ? `${pressure} kPa` : '--'}</strong><small>{airMode === 'vacuum' ? '已处于明显低压状态。' : airMode === 'normal' ? '当前仍为常压附近。' : '先启动实验。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>铃声强度</span><strong>{airMode ? `${loudness}%` : '--'}</strong><small>{summaryChoice === 'correct' ? '空气越少，铃声越弱。' : '比较抽气前后声音强弱。'}</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '真空传声装置'} · 当前重点：{step <= 2 ? '密封装置' : step === 3 ? '抽气降压' : '比较铃声强弱'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'jar' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('jar')} type="button">玻璃罩</button><button className={cameraPreset === 'gauge' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('gauge')} type="button">压力表</button></div></div>

          <div className={`scene-canvas soundmedium-stage preset-${cameraPreset} ${assembled ? 'assembled' : ''} ${airMode ?? 'none'}`}>
            <div className="soundmedium-rig">
              <div className="sm-base" />
              <div className={assembled ? 'sm-jar active' : 'sm-jar'}>
                <div className="sm-bell" />
                <div className={airMode === 'vacuum' ? 'sm-wave wave-a quiet' : 'sm-wave wave-a active'} />
                <div className={airMode === 'vacuum' ? 'sm-wave wave-b quiet' : 'sm-wave wave-b active'} />
                <div className={airMode === 'vacuum' ? 'sm-wave wave-c quiet' : 'sm-wave wave-c active'} />
              </div>
              <div className={assembled ? 'sm-hose active' : 'sm-hose'} />
              <div className={airMode ? 'sm-pump active' : 'sm-pump'} />
              <div className={airMode ? `sm-gauge ${airMode}` : 'sm-gauge'}>
                <span>{airMode ? `${pressure}` : '--'}</span>
              </div>
              <div className={airMode === 'vacuum' ? 'sm-airflow active' : 'sm-airflow'} />
            </div>
          </div>

          <div className="observation-ribbon soundmedium-observation-row"><article className={assembled ? 'observation-chip active' : 'observation-chip calm'}><strong>密封状态</strong><span>{assembled ? '真空罩装置已连接好。' : '先连接并密封装置。'}</span></article><article className={airMode === 'vacuum' ? 'observation-chip active' : 'observation-chip calm'}><strong>抽气结果</strong><span>{airMode === 'vacuum' ? '罩内空气已明显减少。' : airMode === 'normal' ? '已完成常压记录。' : '等待启动实验。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>声音变化</strong><span>{observationChoice === 'correct' ? '空气越少，铃声明显越弱。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAssemble('correct')} type="button"><strong>密封连接玻璃罩与抽气泵</strong><span>形成可比的低压环境。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAssemble('open-jar')} type="button"><strong>让玻璃罩敞开不密封</strong><span>错误演示：无法形成真空对照。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice secondary" onClick={() => handlePump('normal')} type="button"><strong>先记录常压下铃声</strong><span>建立初始对照。</span></button><button className="summary-choice generic-choice primary" onClick={() => handlePump('vacuum')} type="button"><strong>继续抽气到明显低压</strong><span>观察声波衰减。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“空气减少后铃声明显减弱”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“抽气前后铃声一样大”</strong><span>错误演示：忽略低压影响。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('louder')} type="button"><strong>记录“抽气后铃声更大”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>声音传播需要介质，真空不能传声</strong><span>完整总结传声条件。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('glass')} type="button"><strong>声音靠玻璃罩本身传播</strong><span>错误演示：混淆核心变量。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('light')} type="button"><strong>这是光传播的规律</strong><span>错误演示：概念错位。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{assembled ? '真空罩已连接' : '待连接'} / {airMode === 'vacuum' ? '已低压' : airMode === 'normal' ? '常压已记录' : '待抽气'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先记录常压，再抽气低压'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“真空不能传声”升级成带抽气和低压反馈的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
