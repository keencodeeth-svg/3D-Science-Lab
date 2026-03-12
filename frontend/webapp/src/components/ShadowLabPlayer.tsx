import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'setup' | 'left' | 'right';
type MaterialId = 'lamp' | 'screen' | 'stick' | 'ruler';
type SetupId = 'lamp' | 'screen' | 'stick';
type LightPosition = 'left' | 'center' | 'right';
type TimelineState = 'done' | 'current' | 'todo';

interface ShadowLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别观察装置',
  2: '搭建观察装置',
  3: '改变光源位置',
  4: '记录影子变化',
  5: '总结规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别光源灯、屏板、立杆和刻度尺。',
  2: '把光源灯、立杆和屏板搭成完整观察装置。',
  3: '改变光源位置，比较影子的方向和长度如何变化。',
  4: '根据不同光源位置，记录影子方向和长短。',
  5: '把影子变化与光源位置变化联系起来，总结规律。',
};

const materialLabels: Record<MaterialId, string> = {
  lamp: '光源灯',
  screen: '屏板',
  stick: '立杆',
  ruler: '刻度尺',
};

const materialOrder: MaterialId[] = ['lamp', 'screen', 'stick', 'ruler'];
const setupOrder: SetupId[] = ['lamp', 'stick', 'screen'];

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

function getShadowLength(position: LightPosition) {
  if (position === 'left') return 86;
  if (position === 'center') return 50;
  return 72;
}

function getShadowDirection(position: LightPosition) {
  if (position === 'left') return '向右';
  if (position === 'center') return '居中偏后';
  return '向左';
}

export function ShadowLabPlayer({ experiment, onTelemetry }: ShadowLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [setupParts, setSetupParts] = useState<SetupId[]>([]);
  const [lightPosition, setLightPosition] = useState<LightPosition>('center');
  const [comparedPositions, setComparedPositions] = useState<LightPosition[]>([]);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('setup');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先搭装置，再改变光源位置比较影子的方向和长度。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const setupReady = setupParts.length === setupOrder.length;
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const compareValue = clamp(42 + comparedPositions.length * 18 + (setupReady ? 14 : 0), 24, 99);
  const accuracyValue = clamp(94 - errors * 6, 52, 99);
  const readinessValue = clamp(progressPercent + comparedPositions.length * 10 + (setupReady ? 14 : 0), 20, 100);
  const shadowLength = getShadowLength(lightPosition);
  const shadowDirection = getShadowDirection(lightPosition);

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
        advanceStep(2, '器材识别完成，下一步搭建光源、立杆和屏板。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleSetup = (part: SetupId) => {
    if (step !== 2 || completed) return;
    setSetupParts((current) => {
      if (current.includes(part)) return current;
      const next = [...current, part];
      appendNote(`装置搭建：已摆好${materialLabels[part]}`);
      if (next.length === setupOrder.length) {
        setCameraPreset('left');
        advanceStep(3, '观察装置已搭好，下一步移动光源比较影子变化。');
      } else {
        setPromptTone('success');
        setPrompt(`已搭好 ${next.length}/${setupOrder.length} 个关键部件，请继续。`);
      }
      return next;
    });
  };

  const handleLightChange = (position: LightPosition) => {
    if (step !== 3 || completed) return;
    if (!setupReady) {
      markError('请先完成观察装置搭建，再改变光源位置。');
      return;
    }
    setLightPosition(position);
    setCameraPreset(position === 'right' ? 'right' : 'left');
    setComparedPositions((current) => {
      const next = current.includes(position) ? current : [...current, position];
      appendNote(`光源比较：已观察${position === 'left' ? '左侧低位' : position === 'center' ? '正前高位' : '右侧侧位'}光源下的影子。`);
      if (next.length === 3) {
        advanceStep(4, '三种光源位置已比较完成，下一步记录影子的方向和长度变化。');
      } else {
        setPromptTone('success');
        setPrompt(`已比较 ${next.length}/3 个光源位置，请继续切换位置。`);
      }
      return next;
    });
  };

  const handleRecord = (choice: 'correct' | 'length-only' | 'same') => {
    if (step !== 4 || completed) return;
    if (comparedPositions.length < 3) {
      markError('请先比较三种光源位置，再记录影子变化。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：光源位置变化会同时影响影子的方向和长度。');
      advanceStep(5, '记录完成，下一步总结影子与光源位置的关系。');
      return;
    }
    if (choice === 'length-only') {
      markError('不能只看长短，还要同时比较影子的方向变化。');
      return;
    }
    markError('不同光源位置下，影子的方向和长度都可能发生变化。');
  };

  const handleSummary = (choice: 'correct' | 'near-short' | 'same-direction') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：光源位置变化会让影子的方向改变，光源越低或越偏，影子通常越长。');
      return;
    }
    if (choice === 'near-short') {
      markError('光源更低或更偏侧时，影子往往会更长，不是更短。');
      return;
    }
    markError('影子方向会随着光源位置改变，不会始终朝同一方向。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSetupParts([]);
    setLightPosition('center');
    setComparedPositions([]);
    setSummaryChoice('');
    setCameraPreset('setup');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先搭装置，再改变光源位置比较影子的方向和长度。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '要先搭好光源、立杆和屏板，影子才会清晰。',
        '至少比较多个光源位置，才能总结规律。',
        '记录时同时关注“方向”和“长度”两个维度。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对影子变化。',
        '建议重新切换不同光源位置，再比较影子的方向和长度。',
      ];

  return (
    <section className="panel playground-panel shadow-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属小学科学实验页</h2><p>把光源位置变化、影子方向和长度变化做成可切换的观察舞台，让“影子规律”更容易看懂、记住、复述。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>

      <div className="playground-grid shadow-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">小学科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'setup' ? '装置总览' : cameraPreset === 'left' ? '左侧视角' : '右侧视角'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>比较度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>准确率 {accuracyValue}</span><div className="chem-meter-bar"><i style={{ width: `${accuracyValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card shadow-data-card"><span className="eyebrow">Readout</span><h3>影子读数板</h3><div className="shadow-data-grid"><div className="shadow-data-item"><span>当前方向</span><strong>{shadowDirection}</strong><small>影子方向与光源位置相反。</small></div><div className="shadow-data-item"><span>当前长度</span><strong>{shadowLength} cm</strong><small>光源越低或越偏侧，影子通常越长。</small></div><div className="shadow-data-item"><span>已比较位置</span><strong>{comparedPositions.length}/3</strong><small>要比较多个位置，才能总结规律。</small></div></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '影子装置'} · 当前重点：{step === 2 ? '搭建装置' : step === 3 ? '改变光源位置' : step === 4 ? '记录方向和长度' : '规律总结'}</small></div><div className="camera-actions"><button className={cameraPreset === 'setup' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('setup')} type="button">装置</button><button className={cameraPreset === 'left' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('left')} type="button">左侧</button><button className={cameraPreset === 'right' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('right')} type="button">右侧</button></div></div>

          <div className={`scene-canvas shadow-stage preset-${cameraPreset}`}>
            <div className="shadow-stage-head"><div><span className="eyebrow">Live Science</span><h3>{experiment.curriculum.theme}</h3><p>{promptTone === 'error' ? '当前记录或概括有偏差，请回到现象重新比较。' : '把光源位置和影子变化绑在同一块观察舞台上，帮助学生建立稳定的空间关系。'}</p></div><div className="status-pill-row"><span className="status-pill ready">进度 {progressPercent}%</span><span className="status-pill">当前光源 {lightPosition === 'left' ? '左侧低位' : lightPosition === 'center' ? '正前高位' : '右侧侧位'}</span></div></div>
            <div className="shadow-stage-grid">
              <article className={setupReady ? 'shadow-card active' : 'shadow-card'}><div className="reaction-card-head"><strong>观察舞台</strong><small>{setupReady ? '装置已搭好' : '等待搭建'}</small></div><div className="shadow-stage-area"><div className={`lamp-head ${lightPosition}`} /><div className={`light-beam ${lightPosition}`} /><div className="stick-pole" /><div className="screen-board" /><div className={`shadow-cast ${lightPosition}`} /></div></article>
              <article className={comparedPositions.length > 0 ? 'shadow-card active' : 'shadow-card'}><div className="reaction-card-head"><strong>长度测量板</strong><small>{comparedPositions.length > 0 ? '读数已刷新' : '等待比较'}</small></div><div className="shadow-measure-card"><div className="shadow-ruler" /><div className="shadow-measure-track"><div className="shadow-measure-fill" style={{ width: `${shadowLength}%` }} /></div><div className="shadow-measure-meta"><span>方向：{shadowDirection}</span><span>长度：{shadowLength} cm</span></div></div></article>
            </div>
            <div className="shadow-insight-row"><article className="lab-readout-card active"><span>装置状态</span><strong>{setupReady ? '已完成搭建' : '待搭建'}</strong><small>器材位置正确，影子才会清晰可见。</small></article><article className="lab-readout-card calm"><span>位置比较</span><strong>{comparedPositions.length === 3 ? '三组位置已完成' : `已比较 ${comparedPositions.length}/3`}</strong><small>要形成规律，必须比较多个光源位置。</small></article><article className={comparedPositions.length === 3 ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>核心规律</span><strong>{shadowDirection} / {shadowLength} cm</strong><small>光源位置变化会影响影子的方向和长度。</small></article></div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? setupOrder.map((part) => (<button className={setupParts.includes(part) ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} key={part} onClick={() => handleSetup(part)} type="button"><strong>摆好{materialLabels[part]}</strong><span>{setupParts.includes(part) ? '已摆放完成' : '完成观察装置搭建'}</span></button>)) : null}{step === 3 ? <><button className={comparedPositions.includes('left') ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleLightChange('left')} type="button"><strong>切到左侧低位光源</strong><span>观察影子向右且更长的变化。</span></button><button className={comparedPositions.includes('center') ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleLightChange('center')} type="button"><strong>切到正前高位光源</strong><span>观察较短、更居中的影子。</span></button><button className={comparedPositions.includes('right') ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleLightChange('right')} type="button"><strong>切到右侧侧位光源</strong><span>观察影子向左的变化。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button"><strong>记录“光源位置变化会让影子方向和长度都变化”</strong><span>这是对比后的正确记录。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleRecord('length-only')} type="button"><strong>只记录影子变长变短</strong><span>错误演示：忽略方向变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRecord('same')} type="button"><strong>记录“影子始终一样”</strong><span>错误演示：与比较结果不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>光源位置改变，影子方向会改变；光源越低或越偏，影子通常越长</strong><span>完整概括影子和光源位置的关系。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('near-short')} type="button"><strong>光源越低，影子越短</strong><span>错误演示：与观察结果相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('same-direction')} type="button"><strong>无论光源怎么动，影子都朝同一方向</strong><span>错误演示：忽略方向变化。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{setupReady ? '已搭建完成' : '待搭建'} / 已比较 {comparedPositions.length}/3</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请先比较多个位置'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“影子的方向与长度”升级成可比较、可测量、可总结的专属小学页。</small></section>
        </aside>
      </div>
    </section>
  );
}
