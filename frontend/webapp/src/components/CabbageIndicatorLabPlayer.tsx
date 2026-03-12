import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'cups' | 'palette';
type MaterialId = 'cups' | 'indicator' | 'acid' | 'alkali' | 'stirrer';
type TimelineState = 'done' | 'current' | 'todo';

interface CabbageIndicatorLabPlayerProps {
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
  2: '倒入紫甘蓝汁',
  3: '酸性杯显红',
  4: '碱性杯显绿',
  5: '总结多色变化',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别三只透明烧杯、紫甘蓝指示剂、白醋、小苏打溶液和玻璃棒。',
  2: '向三只烧杯中倒入等量紫甘蓝指示剂。',
  3: '给左侧酸性杯滴加白醋，观察颜色向红色方向变化。',
  4: '给右侧碱性杯滴加小苏打溶液，并比较三杯颜色差异。',
  5: '总结紫甘蓝汁在酸、碱、近中性条件下会呈现不同颜色。',
};

const materialLabels: Record<MaterialId, string> = {
  cups: '三只透明烧杯',
  indicator: '紫甘蓝指示剂',
  acid: '白醋',
  alkali: '小苏打溶液',
  stirrer: '玻璃棒',
};

const materialOrder: MaterialId[] = ['cups', 'indicator', 'acid', 'alkali', 'stirrer'];

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

export function CabbageIndicatorLabPlayer({ experiment, onTelemetry }: CabbageIndicatorLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [poured, setPoured] = useState(false);
  const [acidAdded, setAcidAdded] = useState(false);
  const [alkaliAdded, setAlkaliAdded] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过紫甘蓝指示剂观察酸、碱和近中性溶液的多色变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const colorValue = clamp(24 + (poured ? 18 : 0) + (acidAdded ? 22 : 0) + (alkaliAdded ? 22 : 0), 20, 99);
  const compareValue = clamp(22 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 30 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (poured ? 10 : 0) + (acidAdded ? 10 : 0) + (alkaliAdded ? 12 : 0), 20, 100);

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
        setCameraPreset('cups');
        advanceStep(2, '器材识别完成，下一步向三只烧杯倒入紫甘蓝汁。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePour = (choice: 'correct' | 'one-cup') => {
    if (step !== 2 || completed) return;
    if (choice === 'one-cup') {
      markError('需要给三只烧杯都倒入指示剂，后续才方便比较颜色差异。');
      return;
    }
    setPoured(true);
    appendNote('加样状态：三只烧杯中已形成稳定的紫色指示剂液面。');
    advanceStep(3, '指示剂已倒好，下一步给左侧烧杯加入白醋。');
  };

  const handleAddAcid = (choice: 'correct' | 'center-cup') => {
    if (step !== 3 || completed) return;
    if (!poured) {
      markError('请先向三只烧杯倒入紫甘蓝汁，再进行显色比较。');
      return;
    }
    if (choice === 'center-cup') {
      markError('本步需要先处理左侧酸性杯，便于形成清晰的三色对照。');
      return;
    }
    setAcidAdded(true);
    setCameraPreset('palette');
    appendNote('酸性显色：左杯加入白醋后由紫色转为玫红色。');
    advanceStep(4, '酸性杯已显红，下一步给右侧烧杯加入小苏打溶液。');
  };

  const handleObservePalette = (choice: 'correct' | 'all-red' | 'no-change') => {
    if (step !== 4 || completed) return;
    if (!acidAdded) {
      markError('请先完成左侧酸性杯显色，再建立右侧碱性杯的对照。');
      return;
    }
    setAlkaliAdded(true);
    setObservationChoice(choice);
    if (choice === 'correct') {
      appendNote('颜色比较：左杯偏红，中杯保持紫色，右杯转为蓝绿。');
      advanceStep(5, '三杯颜色差异已建立，请完成最终总结。');
      return;
    }
    markError(choice === 'all-red' ? '碱性杯不会和酸性杯一样变红，通常会向蓝绿方向变化。' : '加酸加碱后颜色会明显变化，不会完全无变化。');
  };

  const handleSummary = (choice: 'correct' | 'same-color' | 'reverse') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：紫甘蓝汁在酸、碱和近中性环境中会呈现不同颜色。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'same-color' ? '指示剂不是所有溶液都同色，酸碱性不同会导致明显颜色差异。' : '酸性和碱性对应的颜色方向不能颠倒。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPoured(false);
    setAcidAdded(false);
    setAlkaliAdded(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察紫甘蓝汁的多色显色。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先让三只烧杯都装有指示剂。', '左杯先加白醋，右杯再加小苏打溶液。', '重点比较“红色、紫色、蓝绿色”三种结果。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对三只烧杯的处理顺序。',
        '建议按“识别 → 倒指示剂 → 加酸 → 加碱比较 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel cabbageindicator-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把三杯并列显色、滴加顺序和酸碱多色变化做成更有操作感、更适合课堂展示的彩色实验场景。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>
      <div className="playground-grid cabbageindicator-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'cups' ? '三杯近景' : '显色近景'}</span></div><span className="badge">{experiment.grade}</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div>
            </div>
          </section>
          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>色彩饱和 {colorValue}</span><div className="chem-meter-bar"><i style={{ width: `${colorValue}%` }} /></div></div>
              <div className="chem-meter"><span>对比清晰度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
          <section className="info-card cabbageindicator-data-card">
            <span className="eyebrow">Readout</span>
            <h3>显色读数板</h3>
            <div className="generic-readout-grid cabbageindicator-readout-grid">
              <article className={poured ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>指示剂</span><strong>{poured ? '三杯已装液' : '--'}</strong><small>{poured ? '三只烧杯已形成基础紫色液面。' : '先把紫甘蓝汁倒入三杯。'}</small></article>
              <article className={alkaliAdded ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>多色对照</span><strong>{alkaliAdded ? '红 / 紫 / 绿' : '--'}</strong><small>{alkaliAdded ? '酸性、近中性和碱性三色对照已出现。' : '等待完成加酸加碱。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '酸碱性可显色' : '等待总结'}</strong><small>紫甘蓝汁可以作为直观的天然酸碱指示剂。</small></article>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '紫甘蓝多色显色装置'} · 当前重点：{step <= 2 ? '建立三杯基础液面' : step === 3 ? '酸性显红' : '碱性显绿并比较'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'cups' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('cups')} type="button">三杯</button>
              <button className={cameraPreset === 'palette' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('palette')} type="button">显色</button>
            </div>
          </div>
            <div className={`scene-canvas cabbageindicator-stage preset-${cameraPreset} ${poured ? 'poured' : ''} ${acidAdded ? 'acid-added' : ''} ${alkaliAdded ? 'alkali-added' : ''}`}>
            <div className="cabbageindicator-rig">
              <div className="cbi-bench-shadow" />
              <div className={alkaliAdded ? 'cbi-spectrum-band active full' : poured ? 'cbi-spectrum-band active' : 'cbi-spectrum-band'} />
              <div className="cbi-tray">
                <span className="cbi-tray-rim" />
                <span className="cbi-tray-shadow" />
                <span className="cbi-tray-gloss" />
              </div>
              <div className="cbi-cup acid">
                <span className="cbi-cup-rim" />
                <span className="cbi-cup-gloss" />
                <span className={poured ? 'cbi-meniscus active' : 'cbi-meniscus'} />
                <div className={acidAdded ? 'cbi-liquid acid active acidic' : poured ? 'cbi-liquid acid active' : 'cbi-liquid acid'}>
                  <span className="cbi-liquid-surface" />
                  <span className={acidAdded ? 'cbi-color-plume acid active' : 'cbi-color-plume acid'} />
                  <span className={poured ? 'cbi-cup-caustic active acid' : 'cbi-cup-caustic acid'} />
                </div>
              </div>
              <div className="cbi-cup neutral">
                <span className="cbi-cup-rim" />
                <span className="cbi-cup-gloss" />
                <span className={poured ? 'cbi-meniscus active' : 'cbi-meniscus'} />
                <div className={poured ? 'cbi-liquid neutral active' : 'cbi-liquid neutral'}>
                  <span className="cbi-liquid-surface" />
                  <span className={poured ? 'cbi-cup-caustic active neutral' : 'cbi-cup-caustic neutral'} />
                </div>
              </div>
              <div className="cbi-cup alkali">
                <span className="cbi-cup-rim" />
                <span className="cbi-cup-gloss" />
                <span className={poured ? 'cbi-meniscus active' : 'cbi-meniscus'} />
                <div className={alkaliAdded ? 'cbi-liquid alkali active basic' : poured ? 'cbi-liquid alkali active' : 'cbi-liquid alkali'}>
                  <span className="cbi-liquid-surface" />
                  <span className={alkaliAdded ? 'cbi-color-plume alkali active' : 'cbi-color-plume alkali'} />
                  <span className={poured ? 'cbi-cup-caustic active alkali' : 'cbi-cup-caustic alkali'} />
                </div>
              </div>
              <div className={acidAdded ? 'cbi-dropper acid active' : step === 3 ? 'cbi-dropper acid active poised' : 'cbi-dropper acid'}>
                <span className="cbi-dropper-bulb" />
                <span className="cbi-dropper-glass" />
                <span className={step === 3 || acidAdded ? 'cbi-drop-front acid active' : 'cbi-drop-front acid'} />
                <span className={acidAdded && !alkaliAdded ? 'cbi-drop acid active' : 'cbi-drop acid'} />
              </div>
              <div className={alkaliAdded ? 'cbi-dropper alkali active' : step === 4 ? 'cbi-dropper alkali active poised' : 'cbi-dropper alkali'}>
                <span className="cbi-dropper-bulb" />
                <span className="cbi-dropper-glass" />
                <span className={step === 4 || alkaliAdded ? 'cbi-drop-front alkali active' : 'cbi-drop-front alkali'} />
                <span className={alkaliAdded ? 'cbi-drop alkali active' : 'cbi-drop alkali'} />
              </div>
              <div className={alkaliAdded ? 'cbi-palette active' : poured ? 'cbi-palette active partial' : 'cbi-palette'}>
                <span className="cbi-palette-sheen" />
              </div>
            </div>
          </div>

          <div className="observation-ribbon cabbageindicator-observation-row">
            <article className={poured ? 'observation-chip active' : 'observation-chip calm'}><strong>装液</strong><span>{poured ? '三只烧杯均已装入指示剂。' : '等待建立三杯液面。'}</span></article>
            <article className={acidAdded ? 'observation-chip active' : 'observation-chip calm'}><strong>酸性杯</strong><span>{acidAdded ? '左杯已转为玫红色。' : '等待白醋显红。'}</span></article>
            <article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>碱性杯</strong><span>{observationChoice === 'correct' ? '右杯已显蓝绿色。' : '等待完成颜色比较。'}</span></article>
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
                <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button">
                  <strong>识别 {materialLabels[materialId]}</strong>
                  <span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span>
                </button>
              )) : null}
              {step === 2 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handlePour('correct')} type="button"><strong>给三只烧杯都倒入紫甘蓝汁</strong><span>建立后续显色对照的基础液面。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handlePour('one-cup')} type="button"><strong>只在一只烧杯里倒入指示剂</strong><span>错误演示：无法形成完整对照。</span></button>
              </> : null}
              {step === 3 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleAddAcid('correct')} type="button"><strong>给左侧烧杯滴加白醋，观察其变红</strong><span>先建立酸性显色结果。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleAddAcid('center-cup')} type="button"><strong>先往中间烧杯里随意加白醋</strong><span>错误演示：会破坏三杯对照。</span></button>
              </> : null}
              {step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObservePalette('correct')} type="button"><strong>给右杯加小苏打溶液，并记录“左红中紫右绿”</strong><span>这是本实验的正确显色结果。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleObservePalette('all-red')} type="button"><strong>记录“三只烧杯最后都会变红”</strong><span>错误演示：忽略碱性显色。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleObservePalette('no-change')} type="button"><strong>记录“加酸加碱后颜色几乎没变化”</strong><span>错误演示：忽略显色现象。</span></button>
              </> : null}
              {step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>紫甘蓝汁在不同酸碱性环境中会呈现不同颜色</strong><span>完整总结本实验结论。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('same-color')} type="button"><strong>紫甘蓝汁不管遇到什么溶液颜色都一样</strong><span>错误演示：忽略显色差异。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleSummary('reverse')} type="button"><strong>酸性会显绿，碱性会显红</strong><span>错误演示：把显色方向说反了。</span></button>
              </> : null}
            </div>
          </section>
          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{poured ? '三杯已装液' : '待装液'} / {alkaliAdded ? '三色对照已建' : '三色对照待建'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意保持左杯酸、右杯碱、中杯对照的顺序'}</li>
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
            <small>这页已把“天然指示剂多色变化”升级成更适合课堂展示和自主操作的专属实验页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
