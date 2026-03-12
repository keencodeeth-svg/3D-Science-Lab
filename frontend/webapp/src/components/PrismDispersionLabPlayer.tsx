import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'prism' | 'spectrum';
type MaterialId = 'light-box' | 'slit' | 'prism' | 'screen' | 'support';
type TimelineState = 'done' | 'current' | 'todo';

interface PrismDispersionLabPlayerProps {
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
  2: '调整三棱镜位置',
  3: '让白光通过棱镜',
  4: '观察色散现象',
  5: '总结白光组成',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别光源盒、狭缝、三棱镜、光屏和支架。',
  2: '把三棱镜放到光路中合适的位置，保证光能通过。',
  3: '用白光照射三棱镜，让光线投到光屏上。',
  4: '观察光屏上的彩色光带顺序和范围。',
  5: '总结白光经过三棱镜后发生色散的规律。',
};

const materialLabels: Record<MaterialId, string> = {
  'light-box': '光源盒',
  slit: '狭缝',
  prism: '三棱镜',
  screen: '光屏',
  support: '支架',
};

const materialOrder: MaterialId[] = ['light-box', 'slit', 'prism', 'screen', 'support'];

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

export function PrismDispersionLabPlayer({ experiment, onTelemetry }: PrismDispersionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [aligned, setAligned] = useState(false);
  const [lightMode, setLightMode] = useState<'white' | null>(null);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先调好三棱镜，再观察白光色散形成的彩色光带。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const spectrumValue = clamp(40 + (aligned ? 18 : 0) + (lightMode ? 20 : 0) + (observationChoice === 'correct' ? 16 : 0), 24, 99);
  const clarityValue = clamp(38 + (cameraPreset !== 'bench' ? 10 : 0) + (lightMode ? 18 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (aligned ? 12 : 0) + (lightMode ? 16 : 0), 20, 100);

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
        setCameraPreset('prism');
        advanceStep(2, '器材识别完成，下一步把三棱镜放到合适光路中。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleAlign = (choice: 'correct' | 'off-path') => {
    if (step !== 2 || completed) return;
    if (choice === 'off-path') {
      markError('三棱镜应进入光路中央，否则光屏上不会出现完整色散光带。');
      return;
    }
    setAligned(true);
    appendNote('装置调整：三棱镜已对准白光通路，光屏位置合适。');
    advanceStep(3, '三棱镜位置已调好，下一步让白光通过棱镜。');
  };

  const handleLight = (choice: 'white' | 'dark') => {
    if (step !== 3 || completed) return;
    if (!aligned) {
      markError('请先调整好三棱镜位置，再通光观察。');
      return;
    }
    if (choice === 'dark') {
      markError('需要让白光通过三棱镜，光屏上才会形成色散光带。');
      return;
    }
    setLightMode('white');
    setCameraPreset('spectrum');
    appendNote('光路建立：白光已穿过棱镜，光屏上开始出现连续彩色光带。');
    advanceStep(4, '白光已通过棱镜，请观察色散光带。');
  };

  const handleObserve = (choice: 'correct' | 'one-color' | 'random') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!lightMode) {
      markError('请先让白光通过棱镜，再观察光屏现象。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：白光被分解成连续彩色光带，红光和紫光偏折程度不同。');
      advanceStep(5, '现象判断正确，最后总结白光的组成。');
      return;
    }
    if (choice === 'one-color') {
      markError('经过三棱镜后不会只剩一种颜色，而会形成连续彩色光带。');
      return;
    }
    markError('色散光带不是随机色块，而是连续且有顺序的彩色光带。');
  };

  const handleSummary = (choice: 'correct' | 'single' | 'mirror') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：白光是由多种色光组成的复色光，经过三棱镜会发生色散。');
      return;
    }
    if (choice === 'single') {
      markError('白光不是单色光，而是由多种色光混合形成。');
      return;
    }
    markError('三棱镜产生的是色散，不是平面镜反射成像。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setAligned(false);
    setLightMode(null);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新调整棱镜并观察光的色散。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先把三棱镜放进光路，再让白光通过。', '观察光屏上连续彩色光带，而不是单一颜色。', '总结时记住“白光是复色光”。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对色散现象。',
        '建议重新执行“调棱镜 → 通白光 → 观察光屏”的流程。',
      ];

  return (
    <section className="panel playground-panel prismdispersion-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把白光、三棱镜和光屏做成连续光路，让色散光带像真实光学实验一样直接出现。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid prismdispersion-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'prism' ? '三棱镜观察' : '光屏色带'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>色散值 {spectrumValue}</span><div className="chem-meter-bar"><i style={{ width: `${spectrumValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card prismdispersion-data-card"><span className="eyebrow">Readout</span><h3>色散读数板</h3><div className="generic-readout-grid prismdispersion-readout-grid"><article className={aligned ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>棱镜位置</span><strong>{aligned ? '已对准光路' : '待调整'}</strong><small>{aligned ? '白光可稳定射入棱镜。' : '先把棱镜放进光路中央。'}</small></article><article className={lightMode ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>光路状态</span><strong>{lightMode ? '白光已入射' : '--'}</strong><small>{lightMode ? '光屏已出现彩色光带。' : '先让白光通过棱镜。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '白光是复色光' : '等待总结'}</strong><small>三棱镜能把白光分解成连续的彩色光带。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '三棱镜色散装置'} · 当前重点：{step <= 2 ? '调整光路' : step === 3 ? '白光入射' : '观察彩色光带'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'prism' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('prism')} type="button">三棱镜</button><button className={cameraPreset === 'spectrum' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('spectrum')} type="button">光屏</button></div></div>

          <div className={`scene-canvas prismdispersion-stage preset-${cameraPreset} ${aligned ? 'aligned' : ''} ${lightMode ? 'lit' : 'dark'}`}>
            <div className="prismdispersion-rig">
              <div className="pd-lightbox" />
              <div className={lightMode ? 'pd-beam active' : 'pd-beam'} />
              <div className={aligned ? 'pd-prism active' : 'pd-prism'} />
              <div className={lightMode ? 'pd-spectrum active' : 'pd-spectrum'} />
              <div className="pd-screen" />
            </div>
          </div>

          <div className="observation-ribbon prismdispersion-observation-row"><article className={aligned ? 'observation-chip active' : 'observation-chip calm'}><strong>光路校准</strong><span>{aligned ? '三棱镜已放入合适光路。' : '先调好三棱镜位置。'}</span></article><article className={lightMode ? 'observation-chip active' : 'observation-chip calm'}><strong>通光状态</strong><span>{lightMode ? '白光已稳定入射。' : '等待建立白光入射。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>色散现象</strong><span>{observationChoice === 'correct' ? '已看到连续彩色光带。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAlign('correct')} type="button"><strong>把三棱镜放进光路中央</strong><span>让白光稳定通过棱镜。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAlign('off-path')} type="button"><strong>把三棱镜移到光路外</strong><span>错误演示：不会出现完整色散。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleLight('white')} type="button"><strong>让白光通过三棱镜</strong><span>在光屏上形成彩色光带。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleLight('dark')} type="button"><strong>不通光直接观察</strong><span>错误演示：无法出现色散。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“白光被分解成连续彩色光带”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('one-color')} type="button"><strong>记录“只剩下一种颜色”</strong><span>错误演示：与色散不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('random')} type="button"><strong>记录“光屏上是随机色块”</strong><span>错误演示：忽略连续光带。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>白光是复色光，经过三棱镜会发生色散</strong><span>完整总结色散规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('single')} type="button"><strong>白光本来就是单色光</strong><span>错误演示：概念错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('mirror')} type="button"><strong>三棱镜只是把白光反射回去</strong><span>错误演示：机理错误。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{aligned ? '棱镜已对准' : '待对准'} / {lightMode ? '已通白光' : '待通光'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意让白光稳定通过棱镜'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“光的色散”升级成连续光路和真实彩带的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
