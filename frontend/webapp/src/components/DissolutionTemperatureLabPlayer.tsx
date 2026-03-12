import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beaker' | 'compare';
type MaterialId = 'beaker-a' | 'beaker-b' | 'solute' | 'thermometer' | 'glass-rod';
type TempMode = 'hot' | 'cold' | null;
type TimelineState = 'done' | 'current' | 'todo';

interface DissolutionTemperatureLabPlayerProps {
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
  2: '设置冷热两杯水',
  3: '加入等量溶质',
  4: '比较溶解快慢',
  5: '总结温度影响',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别两个烧杯、溶质、温度计和玻璃棒。',
  2: '先建立一杯热水和一杯冷水的对照条件。',
  3: '向两杯水中加入等量溶质，观察谁先溶解。',
  4: '比较热水和冷水中的溶解速度。',
  5: '总结温度对溶解快慢的影响。',
};

const materialLabels: Record<MaterialId, string> = {
  'beaker-a': 'A 烧杯',
  'beaker-b': 'B 烧杯',
  solute: '溶质颗粒',
  thermometer: '温度计',
  'glass-rod': '玻璃棒',
};

const materialOrder: MaterialId[] = ['beaker-a', 'beaker-b', 'solute', 'thermometer', 'glass-rod'];

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

export function DissolutionTemperatureLabPlayer({ experiment, onTelemetry }: DissolutionTemperatureLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [tempMode, setTempMode] = useState<TempMode>(null);
  const [soluteAdded, setSoluteAdded] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先建立冷热水对照，再加入等量溶质比较溶解快慢。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const hotTemp = tempMode === 'hot' ? 62 : 24;
  const coldTemp = tempMode === 'hot' ? 18 : 24;
  const hotDissolve = soluteAdded ? 86 : 0;
  const coldDissolve = soluteAdded ? 46 : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const compareValue = clamp(42 + (tempMode === 'hot' ? 18 : 0) + (soluteAdded ? 18 : 0) + (observationChoice === 'correct' ? 16 : 0), 24, 99);
  const clarityValue = clamp(40 + (soluteAdded ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (tempMode === 'hot' ? 14 : 0) + (soluteAdded ? 18 : 0), 20, 100);

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
        setCameraPreset('beaker');
        advanceStep(2, '器材识别完成，先建立冷热两杯水的对照条件。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleTemp = (choice: TempMode) => {
    if (step !== 2 || completed) return;
    setTempMode(choice);
    if (choice === 'hot') {
      appendNote(`条件设置：A 杯热水约 ${hotTemp}°C，B 杯冷水约 ${coldTemp}°C。`);
      advanceStep(3, '冷热对照已建立，下一步向两杯中加入等量溶质。');
      return;
    }
    markError('两杯水温不能相同，本实验需要冷热对照。');
  };

  const handleSolute = (choice: 'correct' | 'unequal') => {
    if (step !== 3 || completed) return;
    if (!tempMode) {
      markError('请先建立冷热水对照，再加入溶质。');
      return;
    }
    if (choice === 'unequal') {
      markError('两杯必须加入等量溶质，才能公平比较溶解速度。');
      return;
    }
    setSoluteAdded(true);
    setCameraPreset('compare');
    appendNote('实验记录：两杯加入等量溶质后，热水中的颗粒消失得更快。');
    advanceStep(4, '现象已出现，请比较热水和冷水中的溶解快慢。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'cold-faster') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!soluteAdded) {
      markError('请先向两杯加入等量溶质，再比较。');
      return;
    }
    if (choice === 'correct') {
      appendNote('比较结果：在其他条件相近时，热水中的溶质溶解得更快。');
      advanceStep(5, '比较完成，最后总结温度对溶解快慢的影响。');
      return;
    }
    if (choice === 'same') {
      markError('冷热两杯的溶解速度并不相同，热水中通常更快。');
      return;
    }
    markError('通常不是冷水更快，热水更容易加快溶解。');
  };

  const handleSummary = (choice: 'correct' | 'no-effect' | 'cold-faster') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：在其他条件相近时，温度升高通常会加快固体在水中的溶解。');
      return;
    }
    if (choice === 'no-effect') {
      markError('温度对溶解快慢有明显影响，不能说“没有影响”。');
      return;
    }
    markError('并不是冷水更快，实验现象说明热水通常更快。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setTempMode(null);
    setSoluteAdded(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新建立冷热水对照并比较溶解快慢。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先保证一杯热水、一杯冷水，形成清晰对照。',
        '两杯加的溶质要等量。',
        '总结时记住热水通常能加快溶解。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对对照条件。',
        '建议重新执行“建立冷热水 → 加等量溶质 → 比较溶解”的流程。',
      ];

  return (
    <section className="panel playground-panel dissolutiontemp-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把冷热两杯溶解进度做成同屏对照，让“温度越高通常溶解越快”不再只是结论，而是过程可见。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid dissolutiontemp-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'beaker' ? '烧杯观察' : '对照比较'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>对照度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card dissolutiontemp-data-card"><span className="eyebrow">Readout</span><h3>溶解读数板</h3><div className="generic-readout-grid dissolutiontemp-readout-grid"><article className={tempMode === 'hot' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>水温对照</span><strong>{tempMode === 'hot' ? `${hotTemp}°C / ${coldTemp}°C` : '--'}</strong><small>{tempMode === 'hot' ? '冷热条件已建立。' : '先建立热水和冷水对照。'}</small></article><article className={soluteAdded ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>溶解进度</span><strong>{soluteAdded ? `${hotDissolve}% / ${coldDissolve}%` : '--'}</strong><small>{soluteAdded ? '热水中的溶质消失更快。' : '加入等量溶质后再比较。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '升温通常加快溶解' : '等待总结'}</strong><small>在其他条件相近时，温度升高通常会加快固体的溶解。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '溶解快慢实验装置'} · 当前重点：{step <= 2 ? '建立冷热对照' : step === 3 ? '加等量溶质' : '比较溶解速度'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'beaker' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('beaker')} type="button">烧杯</button><button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对照</button></div></div>

          <div className={`scene-canvas dissolutiontemp-stage preset-${cameraPreset} ${tempMode ?? 'none'} ${soluteAdded ? 'added' : ''}`}>
            <div className="dissolutiontemp-rig">
              <div className="dt-beaker hot">
                <div className={tempMode === 'hot' ? 'dt-water hot active' : 'dt-water hot'} />
                <div className={soluteAdded ? 'dt-solute hot active' : 'dt-solute hot'} />
                <div className="dt-label">热水 {tempMode === 'hot' ? `${hotTemp}°C` : '--'}</div>
              </div>
              <div className="dt-beaker cold">
                <div className={tempMode === 'hot' ? 'dt-water cold active' : 'dt-water cold'} />
                <div className={soluteAdded ? 'dt-solute cold active' : 'dt-solute cold'} />
                <div className="dt-label">冷水 {tempMode === 'hot' ? `${coldTemp}°C` : '--'}</div>
              </div>
              <div className="dt-thermometer" />
              <div className="dt-rod" />
            </div>
          </div>

          <div className="observation-ribbon dissolutiontemp-observation-row"><article className={tempMode === 'hot' ? 'observation-chip active' : 'observation-chip calm'}><strong>对照条件</strong><span>{tempMode === 'hot' ? '冷热两杯已建立。' : '先建立冷热水对照。'}</span></article><article className={soluteAdded ? 'observation-chip active' : 'observation-chip calm'}><strong>溶质加入</strong><span>{soluteAdded ? '两杯已加入等量溶质。' : '等待加入等量溶质。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>比较结果</strong><span>{observationChoice === 'correct' ? '热水中的溶质溶解更快。' : '等待完成快慢比较。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleTemp('hot')} type="button"><strong>建立热水与冷水对照</strong><span>保证两杯温度明显不同。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleTemp('cold')} type="button"><strong>两杯都用室温水</strong><span>错误演示：没有温度变量。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleSolute('correct')} type="button"><strong>向两杯中加入等量溶质</strong><span>保证比较公平。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSolute('unequal')} type="button"><strong>加入不等量溶质</strong><span>错误演示：失去对照意义。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“热水中的溶质溶解更快”</strong><span>这是本实验的正确结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“两杯溶解速度相同”</strong><span>错误演示：忽略温度影响。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('cold-faster')} type="button"><strong>记录“冷水更快”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>在其他条件相近时，温度升高通常会加快固体的溶解</strong><span>完整总结温度影响。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-effect')} type="button"><strong>温度对溶解快慢没有影响</strong><span>错误演示：与实验不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('cold-faster')} type="button"><strong>冷水总比热水溶得快</strong><span>错误演示：结论相反。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{tempMode === 'hot' ? '冷热对照已建立' : '待建立对照'} / {soluteAdded ? '已加等量溶质' : '待加溶质'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意两杯条件要公平对照'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“温度对溶解快慢的影响”升级成冷热双杯对照的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
