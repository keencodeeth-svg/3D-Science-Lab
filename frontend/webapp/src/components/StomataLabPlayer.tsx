import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'slide' | 'microscope';
type MaterialId = 'leaf-tweezer' | 'slide' | 'dropper' | 'coverslip' | 'microscope';
type TimelineState = 'done' | 'current' | 'todo';

interface StomataLabPlayerProps {
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
  2: '撕取下表皮制片',
  3: '滴加染液并盖片',
  4: '调焦观察气孔',
  5: '总结气孔特点',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别叶片与镊子、载玻片、滴管、盖玻片和显微镜。',
  2: '从叶片下表皮轻轻撕取薄膜，平整放在载玻片上。',
  3: '滴加染液并盖上盖玻片，提高保卫细胞与气孔的可见度。',
  4: '调焦观察成对保卫细胞和中间的气孔。',
  5: '总结叶片气孔的结构与作用。',
};

const materialLabels: Record<MaterialId, string> = {
  'leaf-tweezer': '叶片与镊子',
  slide: '载玻片',
  dropper: '滴管',
  coverslip: '盖玻片',
  microscope: '显微镜',
};

const materialOrder: MaterialId[] = ['leaf-tweezer', 'slide', 'dropper', 'coverslip', 'microscope'];

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

export function StomataLabPlayer({ experiment, onTelemetry }: StomataLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [samplePrepared, setSamplePrepared] = useState(false);
  const [stained, setStained] = useState(false);
  const [focused, setFocused] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先取叶片下表皮制片，再通过显微镜观察气孔与保卫细胞。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const apertureValue = clamp(38 + (samplePrepared ? 14 : 0) + (stained ? 18 : 0) + (focused ? 24 : 0), 24, 99);
  const clarityValue = clamp(40 + (focused ? 26 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 24, 99);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const readinessValue = clamp(progressPercent + (samplePrepared ? 14 : 0) + (stained ? 16 : 0) + (focused ? 16 : 0), 20, 100);

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
        setCameraPreset('slide');
        advanceStep(2, '器材识别完成，先撕取叶片下表皮制片。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePrepare = (choice: 'correct' | 'upper') => {
    if (step !== 2 || completed) return;
    if (choice === 'upper') {
      markError('本实验更适合观察叶片下表皮，那里气孔通常更容易找到。');
      return;
    }
    setSamplePrepared(true);
    appendNote('制片记录：叶片下表皮已平整放在载玻片中央。');
    advanceStep(3, '装片已准备，下一步滴加染液并覆盖盖玻片。');
  };

  const handleStain = (choice: 'correct' | 'skip') => {
    if (step !== 3 || completed) return;
    if (!samplePrepared) {
      markError('请先完成下表皮制片，再滴加染液。');
      return;
    }
    if (choice === 'skip') {
      markError('跳过染色会让保卫细胞和气孔边界不够清楚。');
      return;
    }
    setStained(true);
    setCameraPreset('microscope');
    appendNote('染色记录：已滴加染液并盖片，显微图像对比度提高。');
    advanceStep(4, '染色完成，开始调焦观察气孔结构。');
  };

  const handleFocus = (choice: 'correct' | 'blur') => {
    if (step !== 4 || completed) return;
    if (!stained) {
      markError('请先完成染色和盖片，再调焦观察。');
      return;
    }
    if (choice === 'blur') {
      markError('请继续调焦，直到成对保卫细胞和中央气孔都清晰可见。');
      return;
    }
    setFocused(true);
    appendNote('显微观察：已看清成对保卫细胞以及中间狭缝状气孔。');
    advanceStep(5, '图像已清晰，最后总结叶片气孔的特点和作用。');
  };

  const handleSummary = (choice: 'correct' | 'solid-hole' | 'only-upper') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：气孔由成对保卫细胞围成，是植物蒸腾作用和气体交换的重要通道。');
      return;
    }
    if (choice === 'solid-hole') {
      markError('气孔不是一个“固定死孔”，而是由保卫细胞围成并能调节开闭。');
      return;
    }
    markError('叶片并不是只有上表皮才有气孔，很多叶片下表皮更容易观察到。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSamplePrepared(false);
    setStained(false);
    setFocused(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新取叶片下表皮并观察气孔结构。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '优先取叶片下表皮，现象更明显。',
        '染色和调焦后更容易看清保卫细胞。',
        '总结时记住气孔与蒸腾、气体交换有关。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对气孔结构。',
        '建议重新执行“制片 → 染色 → 调焦 → 判断作用”的流程。',
      ];

  return (
    <section className="panel playground-panel stomata-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>把叶片下表皮、保卫细胞和气孔放进清晰显微视野里，让“蒸腾与气体交换”真正有图有真相。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid stomata-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'slide' ? '装片制备' : '显微视野'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>结构度 {apertureValue}</span><div className="chem-meter-bar"><i style={{ width: `${apertureValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card stomata-data-card"><span className="eyebrow">Readout</span><h3>气孔读数板</h3><div className="generic-readout-grid stomata-readout-grid"><article className={samplePrepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装片状态</span><strong>{samplePrepared ? '下表皮已取样' : '待取样'}</strong><small>{samplePrepared ? '叶片下表皮已平整放片。' : '先从叶片下表皮取样。'}</small></article><article className={focused ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>显微图像</span><strong>{focused ? '保卫细胞清晰' : stained ? '待调焦' : '待染色'}</strong><small>{focused ? '可见成对保卫细胞和中央气孔。' : '染色调焦后再观察。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '气孔参与蒸腾与气体交换' : '等待总结'}</strong><small>气孔由保卫细胞围成，是蒸腾作用和气体交换的重要通道。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '叶片气孔实验装置'} · 当前重点：{step <= 3 ? '制片与染色' : step === 4 ? '观察保卫细胞' : '总结功能'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'slide' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('slide')} type="button">装片</button><button className={cameraPreset === 'microscope' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('microscope')} type="button">显微镜</button></div></div>

          <div className={`scene-canvas stomata-stage preset-${cameraPreset} ${samplePrepared ? 'prepared' : ''} ${stained ? 'stained' : ''} ${focused ? 'focused' : ''}`}>
            <div className="stomata-rig">
              <div className="stomata-slide">
                <div className={samplePrepared ? 'stomata-film active' : 'stomata-film'} />
                <div className={stained ? 'stomata-droplet active' : 'stomata-droplet'} />
                <div className={stained ? 'stomata-coverslip active' : 'stomata-coverslip'} />
              </div>
              <div className="stomata-tweezer" />
              <div className="stomata-dropper" />
              <div className="stomata-microscope">
                <div className="stomata-scope-arm" />
                <div className="stomata-scope-stage" />
                <div className="stomata-view">
                  <span className={focused ? 'stomata-guard guard-a clear' : 'stomata-guard guard-a'} />
                  <span className={focused ? 'stomata-guard guard-b clear' : 'stomata-guard guard-b'} />
                  <span className={focused ? 'stomata-guard guard-c clear' : 'stomata-guard guard-c'} />
                </div>
              </div>
            </div>
          </div>

          <div className="observation-ribbon stomata-observation-row"><article className={samplePrepared ? 'observation-chip active' : 'observation-chip calm'}><strong>取样制片</strong><span>{samplePrepared ? '叶片下表皮已成功制片。' : '先完成下表皮装片。'}</span></article><article className={stained ? 'observation-chip active' : 'observation-chip calm'}><strong>染色状态</strong><span>{stained ? '染色后边界更清晰。' : '等待滴加染液。'}</span></article><article className={focused ? 'observation-chip active' : 'observation-chip calm'}><strong>显微观察</strong><span>{focused ? '成对保卫细胞和中央气孔已清晰可见。' : '继续调焦直到视野清晰。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePrepare('correct')} type="button"><strong>撕取下表皮并平整制片</strong><span>便于后续显微观察。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePrepare('upper')} type="button"><strong>只取上表皮</strong><span>错误演示：现象不够典型。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleStain('correct')} type="button"><strong>滴加染液并盖上盖玻片</strong><span>提高保卫细胞可见度。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleStain('skip')} type="button"><strong>跳过染色直接观察</strong><span>错误演示：图像不清楚。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFocus('correct')} type="button"><strong>调焦到保卫细胞和气孔清晰</strong><span>形成可判断图像。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFocus('blur')} type="button"><strong>保持模糊视野</strong><span>错误演示：无法准确判断。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>气孔由成对保卫细胞围成，是蒸腾作用和气体交换的重要通道</strong><span>完整总结气孔特点。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('solid-hole')} type="button"><strong>气孔只是一个固定的死孔</strong><span>错误演示：忽略保卫细胞作用。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('only-upper')} type="button"><strong>叶片只有上表皮才有气孔</strong><span>错误演示：与常见叶片情况不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{samplePrepared ? '已完成下表皮制片' : '待制片'} / {focused ? '视野清晰' : stained ? '待调焦' : '待染色'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意选择下表皮并看清保卫细胞'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“叶片气孔观察”升级成下表皮制片 + 显微观察专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
