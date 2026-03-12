import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tube' | 'compare';
type MaterialId = 'limewater' | 'tube' | 'straw' | 'air-bag' | 'mouthpiece';
type TimelineState = 'done' | 'current' | 'todo';

interface BreathGasLabPlayerProps {
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
  2: '准备两支澄清石灰水',
  3: '分别通入空气和呼出气体',
  4: '比较浑浊程度',
  5: '总结气体差异',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别澄清石灰水、试管、导管、空气袋和吹气口。',
  2: '保证两支试管中石灰水体积相同。',
  3: '一支通入环境空气，另一支通入呼出气体。',
  4: '比较两支石灰水的浑浊程度。',
  5: '总结呼出气体与吸入气体的成分差异。',
};

const materialLabels: Record<MaterialId, string> = {
  limewater: '澄清石灰水',
  tube: '试管',
  straw: '导管',
  'air-bag': '空气袋',
  mouthpiece: '吹气口',
};

const materialOrder: MaterialId[] = ['limewater', 'tube', 'straw', 'air-bag', 'mouthpiece'];

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

export function BreathGasLabPlayer({ experiment, onTelemetry }: BreathGasLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [prepared, setPrepared] = useState(false);
  const [bubbled, setBubbled] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先准备两支等量石灰水，再比较空气和呼出气体的作用。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const exhaledTurbidity = bubbled ? 82 : 0;
  const airTurbidity = bubbled ? 24 : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const contrastValue = clamp(42 + (prepared ? 18 : 0) + (bubbled ? 20 : 0) + (observationChoice === 'correct' ? 12 : 0), 24, 99);
  const clarityValue = clamp(38 + (cameraPreset !== 'bench' ? 10 : 0) + (bubbled ? 18 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 12 : 0) + (bubbled ? 18 : 0), 20, 100);

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
        setCameraPreset('tube');
        advanceStep(2, '器材识别完成，下一步准备两支等量石灰水。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePrepare = (choice: 'correct' | 'unequal') => {
    if (step !== 2 || completed) return;
    if (choice === 'unequal') {
      markError('两支试管石灰水体积应相同，才能公平比较浑浊程度。');
      return;
    }
    setPrepared(true);
    appendNote('对照建立：两支试管均已加入等量澄清石灰水。');
    advanceStep(3, '石灰水已准备好，下一步分别通入空气和呼出气体。');
  };

  const handleBubble = (choice: 'correct' | 'same') => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError('请先准备两支等量石灰水，再进行通气比较。');
      return;
    }
    if (choice === 'same') {
      markError('实验组和对照组不能都通入同一种气体。');
      return;
    }
    setBubbled(true);
    setCameraPreset('compare');
    appendNote('通气完成：一支通入空气，一支通入呼出气体，出现明显浑浊差异。');
    advanceStep(4, '通气完成，请比较两支石灰水的浑浊程度。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'air-more') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!bubbled) {
      markError('请先分别通入空气和呼出气体，再比较浑浊程度。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：通入呼出气体的试管浑浊更明显。');
      advanceStep(5, '现象判断正确，最后总结吸入与呼出气体差异。');
      return;
    }
    if (choice === 'same') {
      markError('两支试管浑浊程度并不相同。');
      return;
    }
    markError('通入环境空气的试管不会比呼出气体组更浑浊。');
  };

  const handleSummary = (choice: 'correct' | 'same' | 'more-oxygen') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：呼出气体中二氧化碳更多，因此更容易使石灰水变浑浊。');
      return;
    }
    if (choice === 'same') {
      markError('吸入与呼出气体成分并不完全相同。');
      return;
    }
    markError('呼出气体不会含有更多氧气，通常氧气相对更少、二氧化碳更多。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPrepared(false);
    setBubbled(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新准备石灰水并比较空气与呼出气体。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['两支试管石灰水体积要相同。', '分别通入空气和呼出气体，不能混淆。', '重点看哪支石灰水更浑浊。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对石灰水浑浊变化。',
        '建议重新执行“等量石灰水 → 分别通气 → 比较浑浊”的流程。',
      ];

  return (
    <section className="panel playground-panel breathgas-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>把双试管石灰水的浑浊差异做成明显对照，让吸入和呼出气体成分区别更直观。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid breathgas-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tube' ? '试管观察' : '浑浊对比'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>对比值 {contrastValue}</span><div className="chem-meter-bar"><i style={{ width: `${contrastValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card breathgas-data-card"><span className="eyebrow">Readout</span><h3>气体读数板</h3><div className="generic-readout-grid breathgas-readout-grid"><article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>对照准备</span><strong>{prepared ? '石灰水等量' : '待准备'}</strong><small>{prepared ? '两支试管已形成公平对照。' : '先加入等量石灰水。'}</small></article><article className={bubbled ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>空气组浑浊</span><strong>{bubbled ? `${airTurbidity}%` : '--'}</strong><small>{bubbled ? '空气组变化较轻。' : '先分别通气。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>呼气组浑浊</span><strong>{bubbled ? `${exhaledTurbidity}%` : '--'}</strong><small>呼出气体组通常浑浊更明显。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '吸入呼出气体比较装置'} · 当前重点：{step <= 2 ? '建立双试管对照' : step === 3 ? '分别通气' : '比较浑浊程度'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'tube' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tube')} type="button">试管</button><button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对比</button></div></div>

          <div className={`scene-canvas breathgas-stage preset-${cameraPreset} ${prepared ? 'prepared' : ''} ${bubbled ? 'bubbled' : ''}`}>
            <div className="breathgas-rig">
              <div className={prepared ? 'bg-tube air active' : 'bg-tube air'}><div className={prepared ? 'bg-limewater air active' : 'bg-limewater air'} /><div className={bubbled ? 'bg-stream air active' : 'bg-stream air'} /></div>
              <div className={prepared ? 'bg-tube exhaled active' : 'bg-tube exhaled'}><div className={prepared ? 'bg-limewater exhaled active' : 'bg-limewater exhaled'} /><div className={bubbled ? 'bg-stream exhaled active' : 'bg-stream exhaled'} /></div>
              <div className={bubbled ? 'bg-bag active' : 'bg-bag'} />
              <div className={bubbled ? 'bg-mouthpiece active' : 'bg-mouthpiece'} />
            </div>
          </div>

          <div className="observation-ribbon breathgas-observation-row"><article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>双试管对照</strong><span>{prepared ? '两支石灰水试管已准备好。' : '先建立等量石灰水对照。'}</span></article><article className={bubbled ? 'observation-chip active' : 'observation-chip calm'}><strong>通气状态</strong><span>{bubbled ? '空气组和呼气组都已完成通气。' : '等待分别通入两种气体。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>浑浊差异</strong><span>{observationChoice === 'correct' ? '已观察到呼气组更浑浊。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePrepare('correct')} type="button"><strong>两支试管加入等量石灰水</strong><span>建立公平对照。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePrepare('unequal')} type="button"><strong>两支试管液量明显不同</strong><span>错误演示：无法公平比较。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleBubble('correct')} type="button"><strong>一支通空气，一支通呼出气体</strong><span>比较两者对石灰水的影响。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleBubble('same')} type="button"><strong>两支都通入同一种气体</strong><span>错误演示：失去对照意义。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“呼出气体组更浑浊”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“两组一样浑浊”</strong><span>错误演示：与实验不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('air-more')} type="button"><strong>记录“空气组更浑浊”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>呼出气体中二氧化碳更多，因此更容易使石灰水变浑浊</strong><span>完整总结气体差异。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('same')} type="button"><strong>吸入和呼出气体成分完全相同</strong><span>错误演示：与实验不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('more-oxygen')} type="button"><strong>呼出气体含有更多氧气</strong><span>错误演示：结论错误。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? '已设等量石灰水' : '待设石灰水'} / {bubbled ? '已分别通气' : '待通气'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意两支试管石灰水体积一致'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“比较吸入气体和呼出气体”升级成石灰水浑浊双试管对照页。</small></section>
        </aside>
      </div>
    </section>
  );
}
