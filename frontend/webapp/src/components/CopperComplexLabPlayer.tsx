import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tube' | 'solution';
type MaterialId = 'cuso4' | 'naoh' | 'ammonia' | 'tube' | 'dropper';
type TimelineState = 'done' | 'current' | 'todo';

interface CopperComplexLabPlayerProps {
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
  2: '滴加氢氧化钠',
  3: '观察蓝色沉淀',
  4: '滴加氨水变深蓝',
  5: '总结颜色变化',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别硫酸铜溶液、氢氧化钠溶液、氨水、试管和滴管。',
  2: '向装有硫酸铜溶液的试管中滴加氢氧化钠。',
  3: '观察试管中是否形成浅蓝色絮状沉淀。',
  4: '继续滴加氨水并轻轻振荡，观察是否变成深蓝色溶液。',
  5: '总结铜离子可以经历“浅蓝沉淀 → 深蓝溶液”的颜色变化。',
};

const materialLabels: Record<MaterialId, string> = {
  cuso4: '硫酸铜溶液',
  naoh: '氢氧化钠溶液',
  ammonia: '氨水',
  tube: '试管',
  dropper: '滴管',
};

const materialOrder: MaterialId[] = ['cuso4', 'naoh', 'ammonia', 'tube', 'dropper'];

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

export function CopperComplexLabPlayer({ experiment, onTelemetry }: CopperComplexLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [precipitated, setPrecipitated] = useState(false);
  const [complexed, setComplexed] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过加碱与加氨水观察铜离子由浅蓝沉淀到深蓝溶液的变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const reactionValue = clamp(26 + (precipitated ? 24 : 0) + (complexed ? 24 : 0), 20, 99);
  const saturationValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 28 : 0) + (complexed ? 16 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (precipitated ? 10 : 0) + (complexed ? 14 : 0), 20, 100);

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
        setCameraPreset('tube');
        advanceStep(2, '器材识别完成，下一步向试管中滴加氢氧化钠。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleAddNaOH = (choice: 'correct' | 'water') => {
    if (step !== 2 || completed) return;
    if (choice === 'water') {
      markError('本步需要滴加氢氧化钠，才能看到浅蓝色沉淀。');
      return;
    }
    setPrecipitated(true);
    appendNote('加碱状态：试管内出现浅蓝色絮状沉淀。');
    advanceStep(3, '沉淀已形成，下一步记录观察结果。');
  };

  const handleObserve = (choice: 'correct' | 'clear' | 'yellow') => {
    if (step !== 3 || completed) return;
    setObservationChoice(choice);
    if (!precipitated) {
      markError('请先滴加氢氧化钠，再观察沉淀。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：铜离子与碱反应后形成浅蓝色沉淀。');
      setCameraPreset('solution');
      advanceStep(4, '现象记录完成，下一步滴加氨水观察深蓝色。');
      return;
    }
    markError(choice === 'clear' ? '试管不会保持澄清，滴加氢氧化钠后会形成沉淀。' : '颜色不是黄色，正确现象是浅蓝色沉淀。');
  };

  const handleAddAmmonia = (choice: 'correct' | 'skip') => {
    if (step !== 4 || completed) return;
    if (!precipitated) {
      markError('请先形成浅蓝色沉淀，再继续滴加氨水。');
      return;
    }
    if (choice === 'skip') {
      markError('需要继续滴加氨水并轻轻振荡，才会看到深蓝色溶液。');
      return;
    }
    setComplexed(true);
    appendNote('络合显色：沉淀逐渐消失并转为深蓝色透明溶液。');
    advanceStep(5, '深蓝色溶液已出现，请完成总结。');
  };

  const handleSummary = (choice: 'correct' | 'irreversible' | 'same') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：铜离子可先形成浅蓝沉淀，再在氨水作用下转为深蓝溶液。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'irreversible' ? '浅蓝沉淀不是终点，继续滴加氨水还能转成深蓝溶液。' : '两步现象不会相同，颜色和状态都会明显改变。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPrecipitated(false);
    setComplexed(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察铜离子的分步显色。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先形成浅蓝色沉淀，再继续观察深蓝色络合。', '观察重点是“沉淀出现 → 沉淀消失 → 深蓝溶液”。', '注意氨水步骤带来的是更深、更通透的蓝色。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对加液顺序。',
        '建议按“识别 → 加碱 → 记浅蓝沉淀 → 加氨水 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel coppercomplex-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把试管显色、絮状沉淀与深蓝络合液做成层次更丰富、颜色更有冲击力的专属化学场景。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>
      <div className="playground-grid coppercomplex-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tube' ? '试管近景' : '显色近景'}</span></div><span className="badge">{experiment.grade}</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div>
            </div>
          </section>
          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>反应推进 {reactionValue}</span><div className="chem-meter-bar"><i style={{ width: `${reactionValue}%` }} /></div></div>
              <div className="chem-meter"><span>显色强度 {saturationValue}</span><div className="chem-meter-bar"><i style={{ width: `${saturationValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
          <section className="info-card coppercomplex-data-card">
            <span className="eyebrow">Readout</span>
            <h3>络合读数板</h3>
            <div className="generic-readout-grid coppercomplex-readout-grid">
              <article className={precipitated ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>浅蓝沉淀</span><strong>{precipitated ? '已形成' : '--'}</strong><small>{precipitated ? '絮状浅蓝沉淀已出现。' : '先滴加氢氧化钠。'}</small></article>
              <article className={complexed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>深蓝溶液</span><strong>{complexed ? '已显色' : '--'}</strong><small>{complexed ? '沉淀已转为深蓝色溶液。' : '等待继续滴加氨水。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '浅蓝到深蓝' : '等待总结'}</strong><small>铜离子的颜色和状态会随试剂不同发生连续变化。</small></article>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '铜离子显色装置'} · 当前重点：{step <= 2 ? '建立试管反应' : step === 3 ? '观察浅蓝沉淀' : '完成深蓝络合'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'tube' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tube')} type="button">试管</button>
              <button className={cameraPreset === 'solution' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('solution')} type="button">深蓝</button>
            </div>
          </div>
            <div className={`scene-canvas coppercomplex-stage preset-${cameraPreset} ${precipitated ? 'precipitated' : ''} ${complexed ? 'complexed' : ''}`}>
              <div className="coppercomplex-rig">
                <div className="cpx-bench-shadow" />
                <div className="cpx-bench-caustic" />
                <div className="cpx-stand-shadow" />
                <div className="cpx-stand">
                  <span className="cpx-stand-hole hole-1" />
                  <span className="cpx-stand-hole hole-2" />
                </div>
                <div className={complexed ? 'cpx-tube active deep' : precipitated ? 'cpx-tube active' : 'cpx-tube'}>
                  <div className="cpx-tube-rim" />
                  <div className="cpx-tube-mouth" />
                  <div className="cpx-tube-gloss" />
                  <div className={step >= 2 ? 'cpx-meniscus active' : 'cpx-meniscus'} />
                  <div className={precipitated && !complexed ? 'cpx-cloud active' : 'cpx-cloud'} />
                  <div className={complexed ? 'cpx-complex-front active' : 'cpx-complex-front'} />
                  <div className={complexed ? 'cpx-solution active deep' : 'cpx-solution active'}>
                    <span className="cpx-solution-surface" />
                    <span className={precipitated ? 'cpx-plume precip active' : 'cpx-plume precip'} />
                    <span className={complexed ? 'cpx-plume complex active' : 'cpx-plume complex'} />
                  </div>
                  <div className={precipitated && !complexed ? 'cpx-precipitate active' : 'cpx-precipitate'}>
                    <span className="cpx-precip-specks" />
                  </div>
                  <div className={complexed ? 'cpx-sheen active' : 'cpx-sheen'} />
                </div>
                <div className={step >= 2 ? 'cpx-bottle naoh active' : 'cpx-bottle naoh'}>
                  <span className="cpx-bottle-glass" />
                  <span className="cpx-bottle-cap" />
                  <span className="cpx-bottle-fill naoh" />
                </div>
                <div className={step >= 4 ? 'cpx-bottle ammonia active' : 'cpx-bottle ammonia'}>
                  <span className="cpx-bottle-glass" />
                  <span className="cpx-bottle-cap" />
                  <span className="cpx-bottle-fill ammonia" />
                </div>
                <div className={step === 2 || precipitated ? 'cpx-dropper naoh active' : 'cpx-dropper naoh'}>
                  <span className="cpx-dropper-bulb" />
                  <span className="cpx-dropper-glass" />
                  <span className={step === 2 || precipitated ? 'cpx-drop naoh active' : 'cpx-drop naoh'} />
                </div>
                <div className={step === 4 || complexed ? 'cpx-dropper ammonia active' : 'cpx-dropper ammonia'}>
                  <span className="cpx-dropper-bulb" />
                  <span className="cpx-dropper-glass" />
                  <span className={step === 4 || complexed ? 'cpx-drop ammonia active' : 'cpx-drop ammonia'} />
                </div>
              </div>
            </div>

          <div className="observation-ribbon coppercomplex-observation-row">
            <article className={precipitated ? 'observation-chip active' : 'observation-chip calm'}><strong>加碱</strong><span>{precipitated ? '浅蓝沉淀已出现。' : '等待滴加氢氧化钠。'}</span></article>
            <article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>沉淀</strong><span>{observationChoice === 'correct' ? '已记录浅蓝絮状沉淀。' : '等待完成观察记录。'}</span></article>
            <article className={complexed ? 'observation-chip active' : 'observation-chip calm'}><strong>深蓝</strong><span>{complexed ? '已显深蓝透明溶液。' : '等待滴加氨水。'}</span></article>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}>
            <span className="eyebrow">Lab Prompt</span>
            <h3>{completed ? '实验已完成' : stepTitles[step]}</h3>
            <p>{prompt}</p>
          </div>

          <section className="info-card generic-notebook-card">
            <div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div>
            <div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div>
            <div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div>
          </section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>当前步骤操作</h3>
            <div className="summary-stack generic-choice-stack">
              {step === 1 ? materialOrder.map((materialId) => (
                <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              )) : null}
              {step === 2 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleAddNaOH('correct')} type="button"><strong>向硫酸铜溶液中滴加氢氧化钠</strong><span>触发浅蓝色沉淀形成。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleAddNaOH('water')} type="button"><strong>改为滴加清水后直接下结论</strong><span>错误演示：无法形成目标现象。</span></button>
              </> : null}
              {step === 3 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“试管中出现浅蓝色絮状沉淀”</strong><span>这是本实验的正确现象。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('clear')} type="button"><strong>记录“溶液始终澄清透明”</strong><span>错误演示：忽略沉淀生成。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleObserve('yellow')} type="button"><strong>记录“试管中出现黄色沉淀”</strong><span>错误演示：颜色判断错误。</span></button>
              </> : null}
              {step === 4 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleAddAmmonia('correct')} type="button"><strong>继续滴加氨水并轻轻振荡</strong><span>观察沉淀逐渐消失并转为深蓝溶液。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleAddAmmonia('skip')} type="button"><strong>跳过氨水步骤直接结束实验</strong><span>错误演示：缺少第二段显色。</span></button>
              </> : null}
              {step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>铜离子可先形成浅蓝沉淀，再在氨水作用下转为深蓝色溶液</strong><span>完整总结显色过程。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('irreversible')} type="button"><strong>一旦出现沉淀就不可能再发生明显变化</strong><span>错误演示：忽略络合显色。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleSummary('same')} type="button"><strong>前后两步看到的其实是完全一样的蓝色</strong><span>错误演示：忽略颜色深浅和状态差异。</span></button>
              </> : null}
            </div>
          </section>
          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{precipitated ? '沉淀已形成' : '沉淀待形成'} / {complexed ? '深蓝已显色' : '深蓝待显色'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先加碱形成沉淀，再加氨水观察深蓝'}</li>
            </ul>
          </section>
          <section className="info-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul>
          </section>
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>实验控制</h3>
            <div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div>
            <small>这页已把“铜离子分步显色”升级成沉淀与络合连续可见的专属实验页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
