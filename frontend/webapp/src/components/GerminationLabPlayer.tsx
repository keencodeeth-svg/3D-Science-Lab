import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5 | 6;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'conditions' | 'compare';
type MaterialId = 'dish-a' | 'dish-b' | 'dish-c' | 'cotton' | 'dropper' | 'seeds';
type DishId = 'a' | 'b' | 'c';
type TimelineState = 'done' | 'current' | 'todo';

interface GerminationLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别材料',
  2: '设置水分条件',
  3: '设置温度条件',
  4: '查看对照组差异',
  5: '记录萌发结果',
  6: '总结萌发条件',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别培养皿、棉花、滴管和种子样本。',
  2: '给不同培养皿设置有水或缺水条件。',
  3: '比较适宜温度与不适宜温度条件。',
  4: '切换三组培养皿视角，比较各组萌发差异。',
  5: '记录哪些培养皿中的种子萌发。',
  6: '总结种子萌发需要哪些基本条件。',
};

const materialLabels: Record<MaterialId, string> = {
  'dish-a': '培养皿 A',
  'dish-b': '培养皿 B',
  'dish-c': '培养皿 C',
  cotton: '棉花',
  dropper: '滴管',
  seeds: '种子样本',
};

const materialOrder: MaterialId[] = ['dish-a', 'dish-b', 'dish-c', 'cotton', 'dropper', 'seeds'];

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

export function GerminationLabPlayer({ experiment, onTelemetry }: GerminationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [waterConfigured, setWaterConfigured] = useState(false);
  const [temperatureConfigured, setTemperatureConfigured] = useState(false);
  const [focusedDish, setFocusedDish] = useState<DishId>('a');
  const [groupsCompared, setGroupsCompared] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过 A、B、C 三组对照比较水分和温度对萌发的影响。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 6) * 100);
  const safetyValue = clamp(97 - errors * 3, 72, 99);
  const clarityValue = clamp(48 + (waterConfigured ? 14 : 0) + (temperatureConfigured ? 14 : 0) + (groupsCompared ? 12 : 0) + (recorded ? 14 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 36, 99);
  const readinessValue = clamp(progressPercent + (waterConfigured ? 10 : 0) + (temperatureConfigured ? 10 : 0) + (recorded ? 18 : 0), 20, 100);

  const dishState = {
    a: { water: '适量', temp: '适宜', sprout: waterConfigured && temperatureConfigured },
    b: { water: '缺水', temp: '适宜', sprout: false },
    c: { water: '适量', temp: '低温', sprout: false },
  } as const;

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

  const handleIdentify = (materialId: MaterialId) => {
    if (step !== 1 || completed) return;
    setIdentifiedMaterials((current) => {
      if (current.includes(materialId)) return current;
      const next = [...current, materialId];
      appendNote(`材料识别：${materialLabels[materialId]}`);
      if (next.length === materialOrder.length) {
        setCameraPreset('conditions');
        advanceStep(2, '识别完成，下一步给不同培养皿设置水分条件。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 项材料，继续检查实验台。`);
      }
      return next;
    });
  };

  const handleWater = (mode: 'correct' | 'same') => {
    if (step !== 2 || completed) return;
    if (mode === 'same') {
      markError('不同组需要有清晰的水分差异，不能全部设置成同样条件。');
      return;
    }
    setWaterConfigured(true);
    appendNote('条件设置：A / C 适量水分，B 缺水');
    advanceStep(3, '水分条件已设好，下一步设置温度条件。');
  };

  const handleTemperature = (mode: 'correct' | 'same') => {
    if (step !== 3 || completed) return;
    if (!waterConfigured) {
      markError('请先完成水分条件设置，再设置温度条件。');
      return;
    }
    if (mode === 'same') {
      markError('请明确对照组与实验组的温度差异。');
      return;
    }
    setTemperatureConfigured(true);
    setCameraPreset('compare');
    appendNote('条件设置：A / B 适宜温度，C 低温');
    advanceStep(4, '温度条件已设好，下一步逐组比较萌发差异。');
  };

  const handleView = (dish: DishId, compare = false) => {
    if (step !== 4 || completed) return;
    if (!temperatureConfigured) {
      markError('请先完成温度条件设置，再查看各组差异。');
      return;
    }
    setFocusedDish(dish);
    if (compare) {
      setGroupsCompared(true);
      appendNote(`对照比较：已比较 A / B / C 三组萌发差异，当前聚焦 ${dish.toUpperCase()} 组`);
      advanceStep(5, '已比较各组差异，下一步记录哪些培养皿中的种子萌发。');
    } else {
      setPromptTone('info');
      setPrompt(`当前查看培养皿 ${dish.toUpperCase()}，请继续切换其他组完成比较。`);
    }
  };

  const handleRecord = (choice: 'correct' | 'all' | 'single') => {
    if (step !== 5 || completed) return;
    if (!groupsCompared) {
      markError('请先比较不同培养皿的差异，再记录萌发结果。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'all' ? '并不是所有组都会萌发，请结合水分和温度条件判断。' : '不能只看单组，要比较三组对照结果。');
      return;
    }
    setRecorded(true);
    appendNote('结果记录：只有 A 组明显萌发，B 缺水、C 低温未萌发');
    advanceStep(6, '萌发结果已记录，最后总结种子萌发所需的基本条件。');
  };

  const handleSummary = (choice: 'correct' | 'water-only' | 'ignore-control') => {
    if (step !== 6 || completed) return;
    setSummaryChoice(choice);
    if (!recorded) {
      markError('请先完成萌发结果记录，再提交总结。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'water-only' ? '种子萌发不仅需要水分，还需要适宜温度等条件。' : '总结时必须结合三组对照现象，而不是只说单一结果。');
      return;
    }
    advanceStep(null, experiment.feedback.successSummary);
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setWaterConfigured(false);
    setTemperatureConfigured(false);
    setFocusedDish('a');
    setGroupsCompared(false);
    setRecorded(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：通过 A、B、C 三组对照比较水分和温度对萌发的影响。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '三组培养皿必须形成清晰差异，才能体现对照实验意义。',
        'A 组适量水分且温度适宜，B 组缺水，C 组低温，是本实验的核心设置。',
        '记录结果时不能只看单组，要比较三组现象再下结论。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对三组条件和现象。',
        '建议先把三组水分和温度条件理清，再继续记录萌发结果或提交结论。',
      ];

  return (
    <section className="panel playground-panel germination-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物对照实验页</h2>
          <p>围绕三组培养皿、水分和温度对照重做专属页，让“种子萌发条件”真正具备探究式实验的感觉。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 6</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid germination-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'conditions' ? '条件设置视角' : '对照比较视角'}</span></div><span className="badge">{experiment.grade}</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.theme}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div>
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

          <section className="info-card germination-data-card">
            <span className="eyebrow">Readout</span>
            <h3>萌发结果板</h3>
            <div className="germination-data-grid">
              {(['a', 'b', 'c'] as DishId[]).map((dish) => (
                <div className={focusedDish === dish ? 'germination-data-item active' : 'germination-data-item'} key={dish}>
                  <span>培养皿 {dish.toUpperCase()}</span>
                  <strong>{dishState[dish].sprout ? '已萌发' : '未萌发'}</strong>
                  <small>{dishState[dish].water} / {dishState[dish].temp}</small>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '培养皿组'} · 当前重点：{step === 2 ? '水分差异' : step === 3 ? '温度差异' : step === 4 ? '对照比较' : '萌发结论'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'conditions' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('conditions')} type="button">条件</button>
              <button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对照</button>
            </div>
          </div>

          <div className={`scene-canvas germination-stage preset-${cameraPreset}`}>
            <div className="germination-stage-head">
              <div>
                <span className="eyebrow">Live Biology</span>
                <h3>{experiment.curriculum.unit}</h3>
                <p>{promptTone === 'error' ? '当前条件设置或比较方式存在偏差，请先修正再继续。' : '重点比较三组培养皿在水分、温度和萌发表现上的差异。'}</p>
              </div>
              <div className="status-pill-row">
                <span className="status-pill ready">进度 {progressPercent}%</span>
                <span className="status-pill">当前聚焦 {focusedDish.toUpperCase()} 组</span>
              </div>
            </div>

            <div className="dish-compare-grid">
              {(['a', 'b', 'c'] as DishId[]).map((dish) => (
                <article className={focusedDish === dish ? 'dish-card active' : 'dish-card'} key={dish}>
                  <div className="reaction-card-head"><strong>培养皿 {dish.toUpperCase()}</strong><small>{dishState[dish].water} / {dishState[dish].temp}</small></div>
                  <div className="dish-shell">
                    <div className={dishState[dish].water === '适量' && waterConfigured ? 'cotton-pad moist' : 'cotton-pad'} />
                    <div className={dishState[dish].sprout ? 'seed-sprout active' : 'seed-sprout'} />
                    <div className="seed-dot dot-a" />
                    <div className="seed-dot dot-b" />
                    <div className="seed-dot dot-c" />
                  </div>
                  <div className="dish-meta-row"><span>{dishState[dish].sprout ? '种子已萌发' : '种子未萌发'}</span><span>{dish === 'a' ? '标准组' : dish === 'b' ? '缺水组' : '低温组'}</span></div>
                </article>
              ))}
            </div>

            <div className="germination-insight-row">
              <article className="lab-readout-card active"><span>水分设置</span><strong>{waterConfigured ? 'A/C 有水，B 缺水' : '等待设置'}</strong><small>水分是种子萌发的关键条件之一。</small></article>
              <article className="lab-readout-card calm"><span>温度设置</span><strong>{temperatureConfigured ? 'A/B 适温，C 低温' : '等待设置'}</strong><small>温度对萌发速度和是否萌发有直接影响。</small></article>
              <article className={recorded ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>对照结果</span><strong>{recorded ? 'A 萌发，B/C 未萌发' : '等待记录'}</strong><small>要从多组对照里提炼萌发所需条件，而不是只看一组。</small></article>
            </div>
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
              {step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别材料'}</span></button>)) : null}
              {step === 2 ? (<><button className={waterConfigured ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleWater('correct')} type="button"><strong>设置 A/C 有水，B 缺水</strong><span>形成清晰水分对照。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleWater('same')} type="button"><strong>三组都加同样水量</strong><span>错误演示：没有形成水分差异。</span></button></>) : null}
              {step === 3 ? (<><button className={temperatureConfigured ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleTemperature('correct')} type="button"><strong>设置 A/B 适温，C 低温</strong><span>形成温度对照。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleTemperature('same')} type="button"><strong>三组温度都一样</strong><span>错误演示：温度差异不明确。</span></button></>) : null}
              {step === 4 ? (<><button className={focusedDish === 'a' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleView('a')} type="button"><strong>查看 A 组</strong><span>标准条件组。</span></button><button className={focusedDish === 'b' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleView('b')} type="button"><strong>查看 B 组</strong><span>缺水组。</span></button><button className={focusedDish === 'c' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleView('c', true)} type="button"><strong>查看 C 组并完成比较</strong><span>低温组，完成三组比较。</span></button></>) : null}
              {step === 5 ? (<><button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button"><strong>记录“只有 A 组萌发”</strong><span>根据三组对照完成结果记录。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleRecord('single')} type="button"><strong>只看 A 组就下结论</strong><span>错误演示：没有比较三组。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRecord('all')} type="button"><strong>记录“三组都萌发”</strong><span>错误演示：忽略条件差异。</span></button></>) : null}
              {step === 6 ? (<><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>种子萌发需要适量水分和适宜温度等条件</strong><span>结合 A/B/C 三组对照得出正确结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('water-only')} type="button"><strong>种子萌发只需要水</strong><span>错误演示：忽略温度条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('ignore-control')} type="button"><strong>看到 A 组萌发就够了</strong><span>错误演示：忽略对照实验价值。</span></button></>) : null}
            </div>
          </section>

          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>条件状态：{waterConfigured ? '已设水分' : '待设水分'} / {temperatureConfigured ? '已设温度' : '待设温度'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意实验规范'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“种子萌发条件”升级成三组对照、条件设置和结果比较一体化的专属生物页。</small></section>
        </aside>
      </div>
    </section>
  );
}
