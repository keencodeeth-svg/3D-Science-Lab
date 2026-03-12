import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'slide' | 'microscope';
type MaterialId = 'cotton-swab' | 'slide' | 'dropper' | 'coverslip' | 'microscope';
type TimelineState = 'done' | 'current' | 'todo';

interface OralCellLabPlayerProps {
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
  2: '制作口腔涂片',
  3: '滴加染液',
  4: '调焦观察',
  5: '判断细胞结构',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别棉签、载玻片、滴管、盖玻片和显微镜。',
  2: '用棉签取样后在载玻片上轻轻涂抹。',
  3: '滴加碘液并盖上盖玻片，提高细胞结构辨识度。',
  4: '调焦后观察细胞轮廓和细胞核。',
  5: '判断口腔上皮细胞的主要结构特点。',
};

const materialLabels: Record<MaterialId, string> = {
  'cotton-swab': '棉签',
  slide: '载玻片',
  dropper: '滴管',
  coverslip: '盖玻片',
  microscope: '显微镜',
};

const materialOrder: MaterialId[] = ['cotton-swab', 'slide', 'dropper', 'coverslip', 'microscope'];

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

export function OralCellLabPlayer({ experiment, onTelemetry }: OralCellLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [samplePrepared, setSamplePrepared] = useState(false);
  const [stained, setStained] = useState(false);
  const [focused, setFocused] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先制作口腔涂片，再染色调焦观察细胞。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const clarityLevel = focused ? 92 : stained ? 66 : samplePrepared ? 40 : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const prepValue = clamp(42 + (samplePrepared ? 18 : 0) + (stained ? 18 : 0) + (focused ? 18 : 0), 24, 99);
  const clarityValue = clamp(38 + clarityLevel, 26, 99);
  const readinessValue = clamp(progressPercent + (samplePrepared ? 14 : 0) + (stained ? 16 : 0) + (focused ? 16 : 0), 20, 100);

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
        setCameraPreset('slide');
        advanceStep(2, '器材识别完成，下一步开始制作口腔上皮细胞涂片。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleSample = (choice: 'correct' | 'too-thick') => {
    if (step !== 2 || completed) return;
    if (choice === 'too-thick') {
      markError('涂片应均匀轻薄，不能涂得过厚影响透光观察。');
      return;
    }
    setSamplePrepared(true);
    appendNote('制片记录：口腔上皮细胞样本已均匀涂抹在载玻片上。');
    advanceStep(3, '涂片完成，下一步滴加染液并覆盖盖玻片。');
  };

  const handleStain = (choice: 'correct' | 'skip') => {
    if (step !== 3 || completed) return;
    if (!samplePrepared) {
      markError('请先制作涂片，再滴加染液。');
      return;
    }
    if (choice === 'skip') {
      markError('跳过染色会让细胞核不清晰，不利于观察。');
      return;
    }
    setStained(true);
    setCameraPreset('microscope');
    appendNote('染色记录：已滴加碘液并盖好盖玻片，视野对比度提升。');
    advanceStep(4, '染色完成，开始调焦观察细胞轮廓和细胞核。');
  };

  const handleFocus = (choice: 'correct' | 'blur') => {
    if (step !== 4 || completed) return;
    if (!stained) {
      markError('请先完成染色，再调焦观察。');
      return;
    }
    if (choice === 'blur') {
      markError('当前图像仍然模糊，请继续调焦直到边界和细胞核清晰。');
      return;
    }
    setFocused(true);
    appendNote('显微观察：已看清细胞边界与染成较深颜色的细胞核。');
    advanceStep(5, '图像已清晰，最后判断口腔上皮细胞结构特点。');
  };

  const handleSummary = (choice: 'correct' | 'wall' | 'chloroplast') => {
    if (step !== 5 || completed) return;
    setObservationChoice(choice);
    if (!focused) {
      markError('请先把图像调清楚，再进行结构判断。');
      return;
    }
    if (choice === 'correct') {
      advanceStep(null, '总结正确：口腔上皮细胞有细胞膜、细胞质和细胞核，没有细胞壁和叶绿体。');
      return;
    }
    if (choice === 'wall') {
      markError('口腔上皮细胞属于动物细胞，没有植物细胞那样明显的细胞壁。');
      return;
    }
    markError('口腔上皮细胞没有叶绿体，不能按植物细胞判断。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSamplePrepared(false);
    setStained(false);
    setFocused(false);
    setObservationChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新制作口腔涂片并调焦观察细胞结构。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '涂片一定要薄而均匀，避免重叠。',
        '染色后更容易看清细胞核。',
        '判断时记住口腔上皮细胞属于动物细胞。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对细胞结构。',
        '建议重新执行“涂片 → 染色 → 调焦 → 判断结构”的流程。',
      ];

  return (
    <section className="panel playground-panel oralcell-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>把制片、染色和显微观察串成一条连续流程，让学生真正看清口腔上皮细胞的结构特征。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid oralcell-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'slide' ? '玻片制备' : '显微观察'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>制片度 {prepValue}</span><div className="chem-meter-bar"><i style={{ width: `${prepValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card oralcell-data-card"><span className="eyebrow">Readout</span><h3>显微读数板</h3><div className="generic-readout-grid oralcell-readout-grid"><article className={samplePrepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>制片状态</span><strong>{samplePrepared ? '已制片' : '待制片'}</strong><small>{samplePrepared ? '样本已经均匀涂在载玻片上。' : '先制作薄而均匀的涂片。'}</small></article><article className={focused ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>图像清晰度</span><strong>{focused ? '细胞核清晰' : stained ? '可继续调焦' : '待染色'}</strong><small>{focused ? '可辨认细胞膜、细胞质和细胞核。' : '染色和调焦后再观察。'}</small></article><article className={observationChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{observationChoice === 'correct' ? '动物细胞特征明确' : '等待判断'}</strong><small>口腔上皮细胞没有细胞壁和叶绿体，能看到细胞膜、细胞质和细胞核。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '口腔上皮细胞实验装置'} · 当前重点：{step <= 3 ? '制片与染色' : step === 4 ? '调焦观察' : '判断细胞结构'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'slide' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('slide')} type="button">玻片</button><button className={cameraPreset === 'microscope' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('microscope')} type="button">显微镜</button></div></div>

          <div className={`scene-canvas oralcell-stage preset-${cameraPreset} ${samplePrepared ? 'prepared' : ''} ${stained ? 'stained' : ''} ${focused ? 'focused' : ''}`}>
            <div className="oralcell-rig">
              <div className="oral-slide">
                <div className={samplePrepared ? 'oral-smear active' : 'oral-smear'} />
                <div className={stained ? 'oral-droplet active' : 'oral-droplet'} />
                <div className={stained ? 'oral-coverslip active' : 'oral-coverslip'} />
              </div>
              <div className="oral-dropper" />
              <div className="oral-microscope">
                <div className="oral-scope-arm" />
                <div className="oral-scope-stage" />
                <div className="oral-eyepiece-view">
                  <span className={focused ? 'oral-cell cell-a clear' : 'oral-cell cell-a'} />
                  <span className={focused ? 'oral-cell cell-b clear' : 'oral-cell cell-b'} />
                  <span className={focused ? 'oral-cell cell-c clear' : 'oral-cell cell-c'} />
                </div>
              </div>
            </div>
          </div>

          <div className="observation-ribbon oralcell-observation-row"><article className={samplePrepared ? 'observation-chip active' : 'observation-chip calm'}><strong>涂片制作</strong><span>{samplePrepared ? '样本已均匀涂抹。' : '先完成口腔涂片。'}</span></article><article className={stained ? 'observation-chip active' : 'observation-chip calm'}><strong>染色状态</strong><span>{stained ? '已滴加染液，结构更易辨认。' : '等待滴加染液。'}</span></article><article className={focused ? 'observation-chip active' : 'observation-chip calm'}><strong>显微观察</strong><span>{focused ? '细胞边界和细胞核已清晰可见。' : '继续调焦直到视野清晰。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleSample('correct')} type="button"><strong>轻薄均匀地制作涂片</strong><span>保证样本透光，便于观察。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSample('too-thick')} type="button"><strong>把样本涂得很厚</strong><span>错误演示：影响显微观察。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleStain('correct')} type="button"><strong>滴加染液并盖上盖玻片</strong><span>提高细胞核对比度。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleStain('skip')} type="button"><strong>跳过染色直接观察</strong><span>错误演示：结构不清楚。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFocus('correct')} type="button"><strong>调焦到细胞边界与细胞核清晰</strong><span>形成可判读图像。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFocus('blur')} type="button"><strong>保持模糊图像</strong><span>错误演示：无法准确判断。</span></button></> : null}{step === 5 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>口腔上皮细胞有细胞膜、细胞质和细胞核，没有细胞壁和叶绿体</strong><span>完整总结动物细胞特征。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('wall')} type="button"><strong>口腔上皮细胞有明显细胞壁</strong><span>错误演示：把它当成植物细胞。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('chloroplast')} type="button"><strong>口腔上皮细胞有叶绿体</strong><span>错误演示：与动物细胞不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{samplePrepared ? '已完成制片' : '待制片'} / {focused ? '视野清晰' : stained ? '待调焦' : '待染色'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意涂片均匀与视野清晰'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“口腔上皮细胞观察”升级成制片到显微观察一体化专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
