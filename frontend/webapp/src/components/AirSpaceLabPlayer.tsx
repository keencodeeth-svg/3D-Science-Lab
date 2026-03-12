import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tank' | 'inside';
type MaterialId = 'water-tank' | 'glass-cup' | 'tissue' | 'tray';
type CupMode = 'idle' | 'vertical' | 'tilted';
type TimelineState = 'done' | 'current' | 'todo';

interface AirSpaceLabPlayerProps {
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
  2: '放置纸巾',
  3: '倒扣入水',
  4: '记录纸巾状态',
  5: '总结空气占位',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别水槽、玻璃杯、纸巾和托盘。',
  2: '把纸巾稳稳放到杯底，准备做倒扣杯实验。',
  3: '将杯子倒扣并保持垂直压入水中，避免空气跑出。',
  4: '观察纸巾是否保持干燥，再完成记录。',
  5: '把纸巾状态与“空气占据空间”联系起来，总结结论。',
};

const materialLabels: Record<MaterialId, string> = {
  'water-tank': '水槽',
  'glass-cup': '玻璃杯',
  tissue: '纸巾',
  tray: '托盘',
};

const materialOrder: MaterialId[] = ['water-tank', 'glass-cup', 'tissue', 'tray'];

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

export function AirSpaceLabPlayer({ experiment, onTelemetry }: AirSpaceLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [tissuePlaced, setTissuePlaced] = useState(false);
  const [cupMode, setCupMode] = useState<CupMode>('idle');
  const [cupSubmerged, setCupSubmerged] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先放好纸巾，再用倒扣杯验证空气会占据空间。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const tissueState = cupSubmerged ? (cupMode === 'vertical' ? '保持干燥' : '被水浸湿') : tissuePlaced ? '待入水验证' : '未放入';
  const airState = cupSubmerged ? (cupMode === 'vertical' ? '空气被困在杯内' : '空气逸出') : '待观察';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const stabilityValue = clamp(94 - errors * 6 - (cupMode === 'tilted' ? 10 : 0), 48, 99);
  const clarityValue = clamp(46 + (tissuePlaced ? 12 : 0) + (cupSubmerged ? 18 : 0) + (cupMode === 'vertical' ? 12 : 0), 34, 99);
  const readinessValue = clamp(progressPercent + (tissuePlaced ? 12 : 0) + (cupMode === 'vertical' ? 18 : 0), 22, 100);

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
        setCameraPreset('tank');
        advanceStep(2, '器材识别完成，下一步把纸巾放到杯底。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePlaceTissue = () => {
    if (step !== 2 || completed || tissuePlaced) return;
    setTissuePlaced(true);
    appendNote('装置准备：纸巾已固定在杯底。');
    setCameraPreset('inside');
    advanceStep(3, '纸巾放置完成，下一步把玻璃杯倒扣并保持垂直入水。');
  };

  const handleSubmerge = (mode: 'vertical' | 'tilted') => {
    if (step !== 3 || completed) return;
    if (!tissuePlaced) {
      markError('请先把纸巾放入杯底，再进行倒扣入水。');
      return;
    }

    setCupMode(mode);
    setCupSubmerged(true);
    setCameraPreset('inside');

    if (mode === 'tilted') {
      markError('杯子倾斜会让空气跑出，水就会进入杯内浸湿纸巾。');
      return;
    }

    appendNote('关键操作：玻璃杯已垂直倒扣入水，杯内空气保留。');
    advanceStep(4, '倒扣入水成功，下一步观察纸巾是否保持干燥。');
  };

  const handleRecord = (choice: 'dry' | 'wet') => {
    if (step !== 4 || completed) return;
    if (!cupSubmerged) {
      markError('请先完成倒扣入水，再记录纸巾状态。');
      return;
    }
    if (choice === 'dry' && cupMode === 'vertical') {
      appendNote('观察记录：纸巾保持干燥，说明水没有进入杯内。');
      advanceStep(5, '记录完成，下一步总结空气与纸巾保持干燥的关系。');
      return;
    }
    markError('本实验的正确现象是：杯子垂直倒扣入水后，纸巾保持干燥。');
  };

  const handleSummary = (choice: 'correct' | 'water-block' | 'no-air') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：空气占据空间，所以水不能进入杯内浸湿纸巾。');
      return;
    }
    if (choice === 'water-block') {
      markError('关键不是“水自己停住了”，而是杯内空气占据了空间。');
      return;
    }
    markError('杯子里一直有空气存在，正是它占据空间才让纸巾保持干燥。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setTissuePlaced(false);
    setCupMode('idle');
    setCupSubmerged(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先放好纸巾，再用倒扣杯验证空气会占据空间。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '纸巾要先固定在杯底，避免入水前掉落。',
        '杯口要保持垂直向下，减少空气逸出。',
        '观察纸巾是否干燥，再把现象和“空气占据空间”联系起来。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对操作顺序。',
        '建议先修正杯子姿态，再重新观察纸巾状态。',
      ];

  return (
    <section className="panel playground-panel airspace-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属小学科学实验页</h2>
          <p>把“倒扣杯 + 纸巾干湿”做成更直观的专属页，帮助小学生把现象和空气占据空间建立稳定联系。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid airspace-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">小学科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tank' ? '水槽视角' : '杯内观察'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>规范值 {stabilityValue}</span><div className="chem-meter-bar"><i style={{ width: `${stabilityValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card airspace-data-card"><span className="eyebrow">Readout</span><h3>现象读数板</h3><div className="airspace-data-grid"><div className="airspace-data-item"><span>纸巾状态</span><strong>{tissueState}</strong><small>{cupMode === 'vertical' ? '说明水没有进入杯内。' : '杯子倾斜时空气逸出，纸巾会被浸湿。'}</small></div><div className="airspace-data-item"><span>杯内空气</span><strong>{airState}</strong><small>{cupMode === 'vertical' ? '空气一直占据着杯内空间。' : '观察杯内空气和水的位置变化。'}</small></div></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '倒扣杯'} · 当前重点：{step <= 2 ? '装置准备' : step === 3 ? '杯子姿态' : step === 4 ? '纸巾干湿' : '现象解释'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'tank' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tank')} type="button">水槽</button><button className={cameraPreset === 'inside' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('inside')} type="button">杯内</button></div></div>

          <div className={`scene-canvas airspace-stage preset-${cameraPreset}`}>
            <div className="airspace-stage-head"><div><span className="eyebrow">Live Science</span><h3>{experiment.curriculum.theme}</h3><p>{promptTone === 'error' ? '当前杯子姿态或现象判断有偏差，请先修正。' : '聚焦纸巾是否被浸湿，让学生把“看得见的结果”和“看不见的空气”连起来。'}</p></div><div className="status-pill-row"><span className="status-pill ready">进度 {progressPercent}%</span><span className="status-pill">杯子 {cupMode === 'vertical' ? '垂直倒扣' : cupMode === 'tilted' ? '发生倾斜' : '待入水'}</span></div></div>
            <div className="airspace-stage-grid">
              <article className={cupSubmerged ? 'airspace-card active' : 'airspace-card'}><div className="reaction-card-head"><strong>水槽观察区</strong><small>{cupSubmerged ? '已入水' : '等待操作'}</small></div><div className="air-tank"><div className="tank-water" /><div className={cupMode === 'vertical' ? 'inverted-cup vertical' : cupMode === 'tilted' ? 'inverted-cup tilted' : 'inverted-cup'}><div className={cupMode === 'vertical' ? 'cup-tissue dry' : cupMode === 'tilted' ? 'cup-tissue wet' : 'cup-tissue'} /></div><div className={cupMode === 'tilted' ? 'bubble-stream active' : 'bubble-stream'} /></div></article>
              <article className={cupMode === 'vertical' ? 'airspace-card active' : 'airspace-card'}><div className="reaction-card-head"><strong>杯内剖面</strong><small>{cupMode === 'vertical' ? '空气保留在杯内' : cupMode === 'tilted' ? '空气正在逸出' : '待观察'}</small></div><div className="cup-window"><div className={cupMode === 'vertical' ? 'air-pocket active' : 'air-pocket'} /><div className={cupMode === 'vertical' ? 'inner-tissue dry' : cupMode === 'tilted' ? 'inner-tissue wet' : 'inner-tissue'} /></div></article>
            </div>
            <div className="airspace-insight-row"><article className="lab-readout-card active"><span>关键操作</span><strong>{tissuePlaced ? '纸巾已放好' : '待放纸巾'}</strong><small>纸巾位置稳定，才能准确观察干湿变化。</small></article><article className="lab-readout-card calm"><span>空气状态</span><strong>{airState}</strong><small>看不见的空气会影响看得见的纸巾结果。</small></article><article className={cupMode === 'vertical' ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>核心现象</span><strong>{tissueState}</strong><small>杯子垂直倒扣时，纸巾应保持干燥。</small></article></div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <button className={tissuePlaced ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={handlePlaceTissue} type="button"><strong>把纸巾放到杯底</strong><span>为倒扣入水做准备。</span></button> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleSubmerge('vertical')} type="button"><strong>垂直倒扣入水</strong><span>正确操作：尽量不让空气跑出。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSubmerge('tilted')} type="button"><strong>倾斜压入水中</strong><span>错误演示：空气会逸出。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRecord('dry')} type="button"><strong>记录“纸巾保持干燥”</strong><span>这是本实验的正确观察结果。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRecord('wet')} type="button"><strong>记录“纸巾被浸湿”</strong><span>错误演示：忽略了垂直倒扣条件。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>纸巾保持干燥，是因为空气占据空间，水进不去</strong><span>把实验现象和科学概念联系起来。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('water-block')} type="button"><strong>纸巾没湿，只是因为水自己停住了</strong><span>错误演示：没有解释空气的作用。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-air')} type="button"><strong>杯子里面其实没有空气</strong><span>错误演示：与实验条件矛盾。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{tissuePlaced ? '纸巾已放' : '待放纸巾'} / {cupSubmerged ? '已入水' : '待入水'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意操作规范'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“空气占据空间”升级为可见现象、装置姿态和结论解释三合一的专属小学页。</small></section>
        </aside>
      </div>
    </section>
  );
}
