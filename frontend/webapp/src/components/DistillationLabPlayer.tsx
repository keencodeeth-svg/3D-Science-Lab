import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'flask' | 'condenser';
type MaterialId = 'flask' | 'thermometer' | 'condenser' | 'receiver' | 'burner';
type TimelineState = 'done' | 'current' | 'todo';

interface DistillationLabPlayerProps {
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
  2: '组装蒸馏装置',
  3: '加热并冷凝收集',
  4: '观察蒸馏现象',
  5: '总结蒸馏作用',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别蒸馏烧瓶、温度计、冷凝管、接收器和酒精灯。',
  2: '按规范连接蒸馏烧瓶、冷凝管和接收器，保证装置稳定密闭。',
  3: '平稳加热，使蒸气进入冷凝管并形成冷凝液。',
  4: '观察蒸馏液和原液在外观与成分上的差异。',
  5: '总结蒸馏适用于利用沸点差异分离或净化液体。',
};

const materialLabels: Record<MaterialId, string> = {
  flask: '蒸馏烧瓶',
  thermometer: '温度计',
  condenser: '冷凝管',
  receiver: '接收烧杯',
  burner: '酒精灯',
};

const materialOrder: MaterialId[] = ['flask', 'thermometer', 'condenser', 'receiver', 'burner'];

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

export function DistillationLabPlayer({ experiment, onTelemetry }: DistillationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [assembled, setAssembled] = useState(false);
  const [heated, setHeated] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过蒸发、冷凝和收集蒸馏液观察蒸馏分离过程。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const purityValue = clamp(34 + (assembled ? 18 : 0) + (heated ? 26 : 0) + (observationChoice === 'correct' ? 14 : 0), 24, 99);
  const condensationValue = clamp(30 + (cameraPreset !== 'bench' ? 12 : 0) + (heated ? 34 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (assembled ? 12 : 0) + (heated ? 16 : 0), 20, 100);

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
        advanceStep(2, '器材识别完成，下一步规范组装蒸馏装置。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleAssemble = (choice: 'correct' | 'loose') => {
    if (step !== 2 || completed) return;
    if (choice === 'loose') {
      markError('蒸馏装置应稳定连接，冷凝管和接收器不能松散错位。');
      return;
    }
    setAssembled(true);
    appendNote('装置组装：蒸馏烧瓶、温度计、冷凝管和接收器已规范连接。');
    advanceStep(3, '装置组装完成，下一步加热并观察冷凝收集。');
  };

  const handleHeat = (choice: 'correct' | 'burn-top') => {
    if (step !== 3 || completed) return;
    if (!assembled) {
      markError('请先完成蒸馏装置组装，再开始加热。');
      return;
    }
    if (choice === 'burn-top') {
      markError('加热时应加热液体所在的烧瓶部位，不是对着冷凝管顶部灼烧。');
      return;
    }
    setHeated(true);
    setCameraPreset('condenser');
    appendNote('蒸馏进行：蒸气进入冷凝管并逐渐形成无色冷凝液滴。');
    advanceStep(4, '蒸馏液开始收集，请观察原液和蒸馏液的差异。');
  };

  const handleObserve = (choice: 'correct' | 'salt-pass' | 'no-change') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!heated) {
      markError('请先完成加热和冷凝收集，再观察蒸馏现象。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：接收器中得到较纯净的无色蒸馏液，食盐等难挥发物留在原烧瓶中。');
      advanceStep(5, '现象判断正确，最后总结蒸馏的分离作用。');
      return;
    }
    if (choice === 'salt-pass') {
      markError('食盐等难挥发性物质不会随蒸气大量进入接收器。');
      return;
    }
    markError('蒸馏过程中会发生明显的蒸发、冷凝和蒸馏液收集。');
  };

  const handleSummary = (choice: 'correct' | 'evaporate-all' | 'same-liquid') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：蒸馏利用物质沸点差异实现液体的分离或净化。');
      return;
    }
    if (choice === 'evaporate-all') {
      markError('蒸馏不是简单把所有液体完全蒸干，而是蒸发后再冷凝收集。');
      return;
    }
    markError('蒸馏液和原液并不完全相同，蒸馏过程具有分离和净化作用。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setAssembled(false);
    setHeated(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新完成蒸馏装置组装和蒸馏观察。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先规范组装，再平稳加热。', '观察重点是“蒸气进入冷凝管并形成蒸馏液”。', '总结时抓住“沸点差异、蒸发、冷凝、净化”。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对蒸馏现象。',
        '建议按“组装 → 加热 → 冷凝收集 → 观察 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel distillation-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把玻璃仪器、蒸汽路径、冷凝水套和接收蒸馏液做成连续场景，让蒸馏过程更接近真实实验台。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid distillation-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'flask' ? '烧瓶与温度计' : '冷凝与接收'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>纯净度 {purityValue}</span><div className="chem-meter-bar"><i style={{ width: `${purityValue}%` }} /></div></div><div className="chem-meter"><span>冷凝强度 {condensationValue}</span><div className="chem-meter-bar"><i style={{ width: `${condensationValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card distillation-data-card"><span className="eyebrow">Readout</span><h3>蒸馏读数板</h3><div className="generic-readout-grid distillation-readout-grid"><article className={assembled ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装置状态</span><strong>{assembled ? '已规范组装' : '--'}</strong><small>{assembled ? '玻璃仪器连接稳定，蒸汽路径清晰。' : '先完成蒸馏装置组装。'}</small></article><article className={heated ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>蒸馏液收集</span><strong>{heated ? '接收器有液滴' : '--'}</strong><small>{heated ? '蒸气在冷凝管后形成较纯净蒸馏液。' : '再完成平稳加热与冷凝。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '沸点差异实现分离' : '等待总结'}</strong><small>蒸馏利用蒸发和冷凝完成液体分离或净化。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '蒸馏装置'} · 当前重点：{step <= 2 ? '组装玻璃装置' : step === 3 ? '形成蒸气并冷凝' : '比较蒸馏液与原液'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'flask' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flask')} type="button">烧瓶</button><button className={cameraPreset === 'condenser' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('condenser')} type="button">冷凝</button></div></div>

          <div className={`scene-canvas distillation-stage preset-${cameraPreset} ${assembled ? 'assembled' : ''} ${heated ? 'heated' : ''}`}>
            <div className="distillation-rig">
              <div className="ds-stand" />
              <div className="ds-flask"><div className={heated ? 'ds-liquid active' : 'ds-liquid'} /></div>
              <div className={assembled ? 'ds-thermometer active' : 'ds-thermometer'} />
              <div className={assembled ? 'ds-condenser active' : 'ds-condenser'}><div className={heated ? 'ds-jacket active' : 'ds-jacket'} /><div className={heated ? 'ds-vapor active' : 'ds-vapor'} /></div>
              <div className={heated ? 'ds-drip active' : 'ds-drip'} />
              <div className="ds-receiver"><div className={heated ? 'ds-distillate active' : 'ds-distillate'} /></div>
              <div className={heated ? 'ds-burner active' : 'ds-burner'}><div className={heated ? 'ds-flame active' : 'ds-flame'} /></div>
            </div>
          </div>

          <div className="observation-ribbon distillation-observation-row"><article className={assembled ? 'observation-chip active' : 'observation-chip calm'}><strong>连接状态</strong><span>{assembled ? '装置已连通，蒸汽路径完整。' : '先完成装置组装。'}</span></article><article className={heated ? 'observation-chip active' : 'observation-chip calm'}><strong>冷凝状态</strong><span>{heated ? '冷凝管内已有蒸汽与液滴变化。' : '等待平稳加热与冷凝。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>结果判断</strong><span>{observationChoice === 'correct' ? '已判断蒸馏液更纯净。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAssemble('correct')} type="button"><strong>规范连接烧瓶、冷凝管和接收器</strong><span>形成稳定的蒸馏装置。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAssemble('loose')} type="button"><strong>把冷凝管和接收器松散搭在一起</strong><span>错误演示：装置不稳定、蒸气易泄漏。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleHeat('correct')} type="button"><strong>平稳加热烧瓶并观察冷凝液滴</strong><span>开始形成真实蒸馏过程。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleHeat('burn-top')} type="button"><strong>对着冷凝管顶部猛烧</strong><span>错误演示：加热位置错误。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“接收器中得到较纯净的无色蒸馏液，食盐主要留在原烧瓶中”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('salt-pass')} type="button"><strong>记录“食盐会跟着蒸气一起大量进入接收器”</strong><span>错误演示：忽略难挥发物特点。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('no-change')} type="button"><strong>记录“整个蒸馏过程几乎没有明显变化”</strong><span>错误演示：忽略蒸发与冷凝现象。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>蒸馏利用沸点差异实现液体的分离或净化</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('evaporate-all')} type="button"><strong>蒸馏只是把液体全部蒸干</strong><span>错误演示：忽略冷凝收集过程。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('same-liquid')} type="button"><strong>蒸馏前后得到的液体完全一样</strong><span>错误演示：忽略净化作用。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{assembled ? '已组装' : '待组装'} / {heated ? '已蒸馏' : '待蒸馏'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意装置规范连接并平稳加热'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“蒸馏”升级成玻璃仪器、蒸汽和冷凝液的专属仿真页。</small></section>
        </aside>
      </div>
    </section>
  );
}
