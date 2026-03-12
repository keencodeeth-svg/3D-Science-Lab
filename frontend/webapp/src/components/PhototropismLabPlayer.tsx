import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'plant' | 'light';
type MaterialId = 'seedling-pot' | 'light-box' | 'shade-card' | 'record-ruler' | 'growth-board';
type LightMode = 'none' | 'single' | 'all';
type TimelineState = 'done' | 'current' | 'todo';

interface PhototropismLabPlayerProps {
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
  2: '设置单侧光照',
  3: '观察幼苗变化',
  4: '比较生长方向',
  5: '总结向光现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别幼苗盆、光照箱、遮光板、记录尺和观察板。',
  2: '让光线从一侧照射幼苗，建立向光生长条件。',
  3: '观察一段时间后幼苗茎的弯曲方向。',
  4: '比较幼苗最终朝向与光源位置的关系。',
  5: '总结植物向光生长对生存有什么意义。',
};

const materialLabels: Record<MaterialId, string> = {
  'seedling-pot': '幼苗盆',
  'light-box': '光照箱',
  'shade-card': '遮光板',
  'record-ruler': '记录尺',
  'growth-board': '观察板',
};

const materialOrder: MaterialId[] = ['seedling-pot', 'light-box', 'shade-card', 'record-ruler', 'growth-board'];

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

export function PhototropismLabPlayer({ experiment, onTelemetry }: PhototropismLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [lightMode, setLightMode] = useState<LightMode>('none');
  const [observed, setObserved] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先设置单侧光照，再观察幼苗向光弯曲。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const bendState = observed ? '向光源一侧弯曲' : lightMode === 'single' ? '等待生长变化' : '待设置光照';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const growthValue = clamp(40 + (lightMode === 'single' ? 18 : 0) + (observed ? 18 : 0) + (observationChoice === 'correct' ? 16 : 0), 24, 99);
  const clarityValue = clamp(42 + (lightMode === 'single' ? 12 : 0) + (observed ? 12 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (lightMode === 'single' ? 14 : 0) + (observed ? 16 : 0), 20, 100);

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
        setCameraPreset('light');
        advanceStep(2, '器材识别完成，先设置单侧光照。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleLight = (choice: LightMode) => {
    if (step !== 2 || completed || choice === 'none') return;
    if (choice === 'all') {
      markError('请使用单侧光照，才能更明显观察向光弯曲。');
      return;
    }
    setLightMode('single');
    appendNote('条件设置：已建立单侧光照环境。');
    advanceStep(3, '光照条件已建立，开始观察幼苗生长方向。');
  };

  const handleObserve = (choice: 'watch' | 'skip') => {
    if (step !== 3 || completed) return;
    if (lightMode !== 'single') {
      markError('请先设置单侧光照。');
      return;
    }
    if (choice === 'skip') {
      markError('需要先观察一段时间，才能判断幼苗的弯曲方向。');
      return;
    }
    setObserved(true);
    setCameraPreset('plant');
    appendNote('观察记录：幼苗茎逐渐向有光的一侧弯曲。');
    advanceStep(4, '现象已出现，开始比较幼苗朝向与光源位置。');
  };

  const handleCompare = (choice: 'correct' | 'away' | 'random') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!observed) {
      markError('请先观察幼苗变化。');
      return;
    }
    if (choice === 'correct') {
      appendNote('结果记录：幼苗朝向有光一侧生长，表现出向光性。');
      advanceStep(5, '方向关系已明确，最后总结向光现象的意义。');
      return;
    }
    if (choice === 'away') {
      markError('幼苗并不是背离光源弯曲，而是向有光的一侧生长。');
      return;
    }
    markError('弯曲方向不是随机的，本实验中与光源位置明确相关。');
  };

  const handleSummary = (choice: 'correct' | 'avoid-light' | 'no-benefit') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：植物向光生长有利于获得更多光照，促进光合作用和生长。');
      return;
    }
    if (choice === 'avoid-light') {
      markError('向光性不是为了躲避光，而是为了更好获得光照。');
      return;
    }
    markError('向光生长对植物获取光能和正常生长是有意义的。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setLightMode('none');
    setObserved(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新设置单侧光照并观察向光弯曲。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '一定用单侧光照，现象会更明显。',
        '先观察生长方向，再下结论。',
        '总结时把“获得更多光照、促进光合作用”说出来。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对方向关系。',
        '建议重新执行“单侧光照 → 观察弯曲 → 比较朝向”的流程。',
      ];

  return (
    <section className="panel playground-panel phototropism-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>把单侧光照、幼苗弯曲和生长意义做成连续观察场景，让“向光性”真正变成能看见的生长过程。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid phototropism-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'plant' ? '幼苗观察' : '光照观察'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>生长值 {growthValue}</span><div className="chem-meter-bar"><i style={{ width: `${growthValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card phototropism-data-card"><span className="eyebrow">Readout</span><h3>向光读数板</h3><div className="generic-readout-grid phototropism-readout-grid"><article className={lightMode === 'single' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>光照条件</span><strong>{lightMode === 'single' ? '单侧光照' : '待设置'}</strong><small>{lightMode === 'single' ? '光线只从一侧进入，利于观察向光弯曲。' : '先建立光照条件。'}</small></article><article className={observed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>生长方向</span><strong>{bendState}</strong><small>{observed ? '幼苗茎向有光的一侧弯曲。' : '观察一段时间后再判断。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心意义</span><strong>{summaryChoice === 'correct' ? '利于获取更多光照' : '等待总结'}</strong><small>向光生长有利于植物进行光合作用和正常生长。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '幼苗与光照箱'} · 当前重点：{step <= 2 ? '建立单侧光照' : step === 3 ? '观察弯曲' : '比较方向'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'plant' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('plant')} type="button">幼苗</button><button className={cameraPreset === 'light' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('light')} type="button">光照</button></div></div>

          <div className={`scene-canvas phototropism-stage preset-${cameraPreset} ${lightMode} ${observed ? 'observed' : ''}`}>
            <div className="phototropism-rig">
              <div className="photo-box">
                <div className="photo-soil" />
                <div className={observed ? 'seedling left bent' : 'seedling left'}>
                  <span className="stem" />
                  <span className="leaf leaf-a" />
                  <span className="leaf leaf-b" />
                </div>
                <div className={observed ? 'seedling right bent' : 'seedling right'}>
                  <span className="stem" />
                  <span className="leaf leaf-a" />
                  <span className="leaf leaf-b" />
                </div>
              </div>
              <div className={lightMode === 'single' ? 'photo-light single active' : lightMode === 'all' ? 'photo-light all active' : 'photo-light'}>
                <span className="light-ray ray-1" />
                <span className="light-ray ray-2" />
                <span className="light-ray ray-3" />
              </div>
            </div>
          </div>

          <div className="observation-ribbon phototropism-observation-row"><article className={lightMode === 'single' ? 'observation-chip active' : 'observation-chip calm'}><strong>光照条件</strong><span>{lightMode === 'single' ? '单侧光照已建立。' : '先把光线设置为单侧照射。'}</span></article><article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>生长现象</strong><span>{observed ? '幼苗逐渐向有光的一侧弯曲。' : '等待观察幼苗变化。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>方向关系</strong><span>{observationChoice === 'correct' ? '弯曲方向与光源位置一致。' : '等待完成方向判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleLight('single')} type="button"><strong>设置单侧光照</strong><span>为向光弯曲创造条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleLight('all')} type="button"><strong>四周都均匀照亮</strong><span>错误演示：向光现象不明显。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleObserve('watch')} type="button"><strong>观察一段时间后的幼苗</strong><span>记录茎的弯曲方向。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('skip')} type="button"><strong>不观察直接下结论</strong><span>错误演示：缺少过程现象。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleCompare('correct')} type="button"><strong>记录“幼苗向有光的一侧弯曲”</strong><span>这是本实验的正确方向关系。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleCompare('away')} type="button"><strong>记录“幼苗背离光源弯曲”</strong><span>错误演示：方向相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCompare('random')} type="button"><strong>记录“弯曲方向是随机的”</strong><span>错误演示：忽略光照影响。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>向光生长有利于植物获得更多光照并促进生长</strong><span>完整总结向光现象的生物学意义。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('avoid-light')} type="button"><strong>植物向光是为了躲避光</strong><span>错误演示：意义说反了。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-benefit')} type="button"><strong>向光生长对植物没有意义</strong><span>错误演示：与生长需要不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{lightMode === 'single' ? '已设单侧光照' : '待设单侧光照'} / {observed ? '已观察弯曲' : '待观察弯曲'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先观察再总结'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“植物向光性”升级成单侧光照与生长方向联动的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
