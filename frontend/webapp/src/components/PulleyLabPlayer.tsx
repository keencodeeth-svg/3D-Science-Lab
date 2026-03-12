import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'fixed' | 'movable';
type MaterialId = 'fixed-pulley' | 'movable-pulley' | 'rope' | 'weight' | 'spring-scale';
type SetupId = 'none' | 'fixed' | 'movable';
type TimelineState = 'done' | 'current' | 'todo';

interface PulleyLabPlayerProps {
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
  2: '体验定滑轮',
  3: '体验动滑轮',
  4: '比较测力计读数',
  5: '总结滑轮作用',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别定滑轮、动滑轮、绳子、重物和弹簧测力计。',
  2: '先使用定滑轮提起重物，观察拉力方向和读数。',
  3: '再切换到动滑轮，比较是否更省力。',
  4: '根据两次测力计读数比较它们的不同作用。',
  5: '总结定滑轮和动滑轮分别能带来什么效果。',
};

const materialLabels: Record<MaterialId, string> = {
  'fixed-pulley': '定滑轮',
  'movable-pulley': '动滑轮',
  rope: '绳子',
  weight: '重物',
  'spring-scale': '弹簧测力计',
};

const materialOrder: MaterialId[] = ['fixed-pulley', 'movable-pulley', 'rope', 'weight', 'spring-scale'];

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

export function PulleyLabPlayer({ experiment, onTelemetry }: PulleyLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [setup, setSetup] = useState<SetupId>('none');
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先体验定滑轮，再切换动滑轮比较是否省力。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const fixedForce = 10;
  const movableForce = 5;
  const currentForce = setup === 'movable' ? movableForce : setup === 'fixed' ? fixedForce : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const compareValue = clamp(42 + (setup === 'fixed' ? 12 : 0) + (setup === 'movable' ? 22 : 0), 24, 99);
  const clarityValue = clamp(42 + (setup !== 'none' ? 12 : 0) + (observationChoice === 'correct' ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (setup === 'fixed' ? 12 : 0) + (setup === 'movable' ? 16 : 0), 20, 100);

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
        setCameraPreset('fixed');
        advanceStep(2, '器材识别完成，先体验定滑轮提起重物。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleFixed = (choice: 'fixed' | 'movable') => {
    if (step !== 2 || completed) return;
    if (choice === 'movable') {
      markError('请先完成定滑轮体验，再切换到动滑轮进行对比。');
      return;
    }
    setSetup('fixed');
    appendNote('操作记录：已用定滑轮提起重物，测力计读数约为 10 N。');
    advanceStep(3, '定滑轮体验完成，下一步改用动滑轮比较是否更省力。');
  };

  const handleMovable = (choice: 'movable' | 'fixed') => {
    if (step !== 3 || completed) return;
    if (setup !== 'fixed') {
      markError('请先体验定滑轮，再切换动滑轮做对照。');
      return;
    }
    if (choice === 'fixed') {
      markError('现在需要改用动滑轮，才能比较是否更省力。');
      return;
    }
    setSetup('movable');
    setCameraPreset('movable');
    appendNote('操作记录：已换成动滑轮，测力计读数下降到约 5 N。');
    advanceStep(4, '两种滑轮都已体验，开始比较测力计读数。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'reverse') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (setup !== 'movable') {
      markError('请先完成动滑轮体验，再比较两次读数。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：定滑轮主要改变拉力方向，动滑轮能减小拉力读数。');
      advanceStep(5, '读数比较完成，最后总结两种滑轮的作用。');
      return;
    }
    if (choice === 'same') {
      markError('两次测力计读数并不相同，动滑轮明显更省力。');
      return;
    }
    markError('读数方向不能记反，定滑轮不比动滑轮更省力。');
  };

  const handleSummary = (choice: 'correct' | 'fixed-saves' | 'movable-direction') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：定滑轮改变用力方向，动滑轮可以省力。');
      return;
    }
    if (choice === 'fixed-saves') {
      markError('本实验中定滑轮主要改变方向，不体现明显省力。');
      return;
    }
    markError('动滑轮的主要特点是省力，不是单纯改变方向。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSetup('none');
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新比较定滑轮和动滑轮的不同作用。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先做定滑轮，再做动滑轮，形成清晰对照。',
        '重点比较的是测力计读数与拉力方向，不只是滑轮名称。',
        '总结时要区分“改变方向”和“省力”这两个不同作用。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对读数。',
        '建议重新执行“定滑轮 → 动滑轮 → 比较读数”的流程。',
      ];

  return (
    <section className="panel playground-panel pulley-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属小学科学实验页</h2><p>把定滑轮和动滑轮做成同台对照实验，让孩子直接看到“改变方向”和“省力”不是一回事。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>

      <div className="playground-grid pulley-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'fixed' ? '定滑轮观察' : '动滑轮观察'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>对照值 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card pulley-data-card"><span className="eyebrow">Readout</span><h3>滑轮读数板</h3><div className="generic-readout-grid pulley-readout-grid"><article className={setup === 'fixed' || setup === 'movable' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>当前装置</span><strong>{setup === 'movable' ? '动滑轮' : setup === 'fixed' ? '定滑轮' : '待选择'}</strong><small>{setup === 'fixed' ? '定滑轮主要改变用力方向。' : setup === 'movable' ? '动滑轮读数更低，更省力。' : '先完成两种装置体验。'}</small></article><article className={setup === 'movable' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>测力计读数</span><strong>{currentForce} N</strong><small>{setup === 'movable' ? '与定滑轮相比，动滑轮读数更低。' : '完成两组体验后再比较。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心规律</span><strong>{summaryChoice === 'correct' ? '定改方向，动更省力' : '等待总结'}</strong><small>同样的重物，在不同滑轮装置中的读数和体验会不同。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '滑轮装置'} · 当前重点：{step <= 2 ? '体验定滑轮' : step === 3 ? '体验动滑轮' : '比较读数'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'fixed' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('fixed')} type="button">定滑轮</button><button className={cameraPreset === 'movable' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('movable')} type="button">动滑轮</button></div></div>

          <div className={`scene-canvas pulley-stage preset-${cameraPreset} ${setup}`}>
            <div className="pulley-rig">
              <div className={`pulley-tower fixed ${setup === 'fixed' || setup === 'movable' ? 'active' : ''}`}>
                <div className="pulley-wheel fixed" />
                <div className="pulley-rope fixed" />
                <div className="pulley-weight fixed" />
                <div className={`pulley-gauge fixed ${setup === 'fixed' ? 'active' : ''}`}><span>{fixedForce}N</span></div>
              </div>
              <div className={`pulley-tower movable ${setup === 'movable' ? 'active' : ''}`}>
                <div className="pulley-wheel top" />
                <div className="pulley-wheel bottom" />
                <div className="pulley-rope movable" />
                <div className="pulley-weight movable" />
                <div className={`pulley-gauge movable ${setup === 'movable' ? 'active' : ''}`}><span>{movableForce}N</span></div>
              </div>
            </div>
          </div>

          <div className="observation-ribbon pulley-observation-row"><article className={setup === 'fixed' || setup === 'movable' ? 'observation-chip active' : 'observation-chip calm'}><strong>定滑轮</strong><span>{setup === 'fixed' || setup === 'movable' ? '定滑轮体验已完成，可用于方向对照。' : '先体验定滑轮。'}</span></article><article className={setup === 'movable' ? 'observation-chip active' : 'observation-chip calm'}><strong>动滑轮</strong><span>{setup === 'movable' ? '动滑轮读数更低，省力效果明显。' : '完成动滑轮体验后再对比。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>结论比较</strong><span>{observationChoice === 'correct' ? '两种滑轮作用差异已锁定。' : '等待记录正确比较结果。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFixed('fixed')} type="button"><strong>先体验定滑轮</strong><span>记录拉力方向和读数。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFixed('movable')} type="button"><strong>直接跳到动滑轮</strong><span>错误演示：没有形成对照。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleMovable('movable')} type="button"><strong>改用动滑轮</strong><span>比较是否能减小拉力读数。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleMovable('fixed')} type="button"><strong>继续只看定滑轮</strong><span>错误演示：无法比较省力效果。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“定滑轮改方向，动滑轮更省力”</strong><span>根据两次测力计读数完成对照。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“两者读数一样”</strong><span>错误演示：忽略读数差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('reverse')} type="button"><strong>记录“定滑轮更省力”</strong><span>错误演示：结论方向反了。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>定滑轮改变方向，动滑轮可以省力</strong><span>完整总结两种滑轮的不同作用。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('fixed-saves')} type="button"><strong>定滑轮的主要作用是省力</strong><span>错误演示：本实验不支持这个结论。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('movable-direction')} type="button"><strong>动滑轮主要只是改变方向</strong><span>错误演示：忽略省力效果。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{setup === 'none' ? '待选择滑轮' : setup === 'fixed' ? '定滑轮已完成' : '动滑轮已完成'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先对照再总结'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“滑轮提重比较”升级成定滑轮/动滑轮同台读数对照的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
