import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'coil' | 'meter';
type MaterialId = 'coil' | 'bar-magnet' | 'meter' | 'wire' | 'switch';
type MotionState = 'idle' | 'insert' | 'pullout';
type SpeedState = 'slow' | 'fast';
type TimelineState = 'done' | 'current' | 'todo';

interface InductionLabPlayerProps {
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
  2: '磁铁插入线圈',
  3: '磁铁抽出线圈',
  4: '比较快慢偏转',
  5: '总结感应条件',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别线圈、条形磁铁、电流计、导线和开关。',
  2: '将磁铁沿线圈轴线缓慢插入，观察指针第一次偏转。',
  3: '再把磁铁抽出线圈，对比电流计偏转方向。',
  4: '加快磁铁运动速度，比较偏转幅度是否更大。',
  5: '总结感应电流产生的条件和方向变化。',
};

const materialLabels: Record<MaterialId, string> = {
  coil: '线圈',
  'bar-magnet': '条形磁铁',
  meter: '电流计',
  wire: '导线',
  switch: '开关',
};

const materialOrder: MaterialId[] = ['coil', 'bar-magnet', 'meter', 'wire', 'switch'];

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

export function InductionLabPlayer({ experiment, onTelemetry }: InductionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [motion, setMotion] = useState<MotionState>('idle');
  const [speed, setSpeed] = useState<SpeedState>('slow');
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先让磁铁进出线圈，再比较指针偏转方向与幅度。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const needleAngle = motion === 'insert' ? (speed === 'fast' ? 26 : 14) : motion === 'pullout' ? (speed === 'fast' ? -26 : -14) : 0;
  const directionLabel = motion === 'insert' ? '向右偏' : motion === 'pullout' ? '向左偏' : '零位';
  const fluxState = motion === 'idle' ? '未变化' : speed === 'fast' ? '快速变化' : '缓慢变化';
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const inductionValue = clamp(42 + (motion !== 'idle' ? 18 : 0) + (motion === 'pullout' ? 12 : 0) + (speed === 'fast' ? 12 : 0), 24, 99);
  const clarityValue = clamp(40 + (motion !== 'idle' ? 16 : 0) + (observationChoice === 'correct' ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (motion !== 'idle' ? 14 : 0) + (speed === 'fast' ? 14 : 0), 20, 100);

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
        setCameraPreset('coil');
        advanceStep(2, '器材识别完成，让磁铁缓慢插入线圈。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleInsert = (choice: 'insert' | 'still') => {
    if (step !== 2 || completed) return;
    if (choice === 'still') {
      markError('磁铁静止时穿过线圈的磁场不变，电流计不会明显偏转。');
      return;
    }
    setMotion('insert');
    setSpeed('slow');
    appendNote('现象记录：磁铁插入线圈时，电流计指针向右偏。');
    advanceStep(3, '第一次偏转已出现，接着把磁铁抽出线圈比较方向。');
  };

  const handlePullout = (choice: 'pullout' | 'still') => {
    if (step !== 3 || completed) return;
    if (choice === 'still') {
      markError('需要改变磁铁与线圈的相对运动，才能继续产生感应电流。');
      return;
    }
    setMotion('pullout');
    setSpeed('slow');
    setCameraPreset('meter');
    appendNote('现象记录：磁铁抽出线圈时，电流计指针改为向左偏。');
    advanceStep(4, '方向变化已经出现，下一步比较快慢对偏转幅度的影响。');
  };

  const handleSpeed = (choice: 'fast' | 'slow' | 'random') => {
    if (step !== 4 || completed) return;
    if (motion !== 'pullout') {
      markError('请先完成插入和抽出两次方向比较。');
      return;
    }
    if (choice === 'random') {
      markError('要形成可比较的数据，需要明确快慢变量，而不是随意晃动磁铁。');
      return;
    }
    setSpeed(choice);
    appendNote(`速度比较：已切换到${choice === 'fast' ? '快速' : '缓慢'}抽出。`);
    if (choice === 'fast') {
      advanceStep(5, '偏转幅度增大，最后总结感应电流产生的条件。');
      return;
    }
    markError('先使用快速运动，才能明显比较出偏转幅度更大。');
  };

  const handleSummary = (choice: 'correct' | 'static' | 'same') => {
    if (step !== 5 || completed) return;
    setObservationChoice(choice);
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：闭合回路中磁场变化会产生感应电流，变化越快偏转越大，进出方向不同偏转方向相反。');
      return;
    }
    if (choice === 'static') {
      markError('磁铁静止在线圈旁边并不会持续产生感应电流，关键是磁场变化。');
      return;
    }
    markError('磁铁插入和抽出时指针偏转方向并不相同。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setMotion('idle');
    setSpeed('slow');
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新比较磁铁进出线圈时的偏转变化。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '磁铁必须与线圈发生相对运动，电流计才会偏转。',
        '插入和抽出方向不同，指针偏转方向也会相反。',
        '运动越快，磁场变化越快，偏转幅度通常越大。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对运动方式。',
        '建议按“插入 → 抽出 → 加快速度”顺序重新完成比较。',
      ];

  return (
    <section className="panel playground-panel induction-lab-panel">
      <div className="panel-head">
        <div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属高中物理实验页</h2><p>把磁铁进出线圈、电流计偏转和快慢比较做成同一条操作链，更接近真正的电磁感应实验台。</p></div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid induction-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'coil' ? '线圈视角' : '电流计视角'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>感应值 {inductionValue}</span><div className="chem-meter-bar"><i style={{ width: `${inductionValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card induction-data-card"><span className="eyebrow">Readout</span><h3>感应读数板</h3><div className="generic-readout-grid induction-readout-grid"><article className={motion !== 'idle' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>指针方向</span><strong>{directionLabel}</strong><small>{motion === 'idle' ? '等待磁铁运动。' : '进出方向不同，偏转方向会变化。'}</small></article><article className={speed === 'fast' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>偏转幅度</span><strong>{Math.abs(needleAngle)}°</strong><small>{speed === 'fast' ? '快速运动时偏转更大。' : '可继续比较快速运动。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>磁场变化</span><strong>{fluxState}</strong><small>闭合回路中磁场变化是产生感应电流的关键。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '线圈与电流计'} · 当前重点：{step <= 3 ? '比较方向' : step === 4 ? '比较幅度' : '总结条件'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'coil' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('coil')} type="button">线圈</button><button className={cameraPreset === 'meter' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('meter')} type="button">电流计</button></div></div>

          <div className={`scene-canvas induction-stage preset-${cameraPreset}`}>
            <div className="induction-rig">
              <div className="induction-wire left" />
              <div className="induction-wire right" />
              <div className="induction-coil">
                {Array.from({ length: 8 }).map((_, index) => <span className="coil-loop" key={`coil-${index}`} />)}
                <div className="coil-core" />
              </div>
              <div className={motion !== 'idle' ? 'induction-field active' : 'induction-field'}><span className="field-ring ring-1" /><span className="field-ring ring-2" /><span className="field-ring ring-3" /></div>
              <div className={`bar-magnet ${motion}`}>
                <span className="magnet-n">N</span>
                <span className="magnet-s">S</span>
              </div>
              <div className="induction-meter">
                <div className="meter-dial" />
                <div className="induction-needle" style={{ transform: `translateX(-50%) rotate(${needleAngle}deg)` }} />
                <div className="meter-pivot" />
              </div>
            </div>
          </div>

          <div className="observation-ribbon induction-observation-row"><article className={motion === 'insert' ? 'observation-chip active' : motion === 'idle' ? 'observation-chip calm' : 'observation-chip warn'}><strong>插入线圈</strong><span>{motion === 'insert' ? '指针向右偏，第一次偏转已出现。' : '先让磁铁插入线圈。'}</span></article><article className={motion === 'pullout' ? 'observation-chip active' : 'observation-chip calm'}><strong>抽出线圈</strong><span>{motion === 'pullout' ? '抽出后指针改为反向偏转。' : '等待比较第二次偏转方向。'}</span></article><article className={speed === 'fast' && motion === 'pullout' ? 'observation-chip active' : 'observation-chip calm'}><strong>速度比较</strong><span>{speed === 'fast' && motion === 'pullout' ? '快速抽出时偏转幅度更大。' : '等待快慢变量比较。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleInsert('insert')} type="button"><strong>缓慢插入磁铁</strong><span>观察第一次偏转方向。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleInsert('still')} type="button"><strong>把磁铁停在线圈旁边</strong><span>错误演示：静止时不易产生偏转。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePullout('pullout')} type="button"><strong>把磁铁抽出线圈</strong><span>比较第二次偏转方向。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePullout('still')} type="button"><strong>继续静止不动</strong><span>错误演示：没有形成新的磁场变化。</span></button></> : null}{step === 4 ? <><button className={speed === 'fast' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSpeed('fast')} type="button"><strong>快速抽出磁铁</strong><span>观察偏转幅度明显增大。</span></button><button className={speed === 'slow' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleSpeed('slow')} type="button"><strong>继续缓慢抽出</strong><span>错误演示：幅度变化不明显。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSpeed('random')} type="button"><strong>随意晃动磁铁</strong><span>错误演示：变量不清晰。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>磁场变化会产生感应电流，变化越快偏转越大</strong><span>同时总结进出方向不同会导致偏转方向相反。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('static')} type="button"><strong>磁铁静止也会持续产生感应电流</strong><span>错误演示：忽略磁场变化条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('same')} type="button"><strong>插入和抽出时指针总是同向偏转</strong><span>错误演示：与实验现象不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{directionLabel} / 幅度 {Math.abs(needleAngle)}°</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先比较方向再比较幅度'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“电磁感应”升级成进出方向、偏转方向和偏转幅度都可比较的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
