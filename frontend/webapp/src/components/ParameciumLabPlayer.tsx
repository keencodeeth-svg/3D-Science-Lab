import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'stage' | 'scope';
type MaterialId = 'microscope' | 'dropper' | 'slide' | 'cover-slip' | 'light-source';
type TimelineState = 'done' | 'current' | 'todo';

interface ParameciumLabPlayerProps {
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
  2: '制作临时装片',
  3: '调光调焦',
  4: '观察草履虫运动',
  5: '总结草履虫特点',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别显微镜、滴管、载玻片、盖玻片和光源。',
  2: '把样液滴在载玻片上，并规范盖上盖玻片。',
  3: '调节光线和焦距，让草履虫看起来清晰。',
  4: '观察草履虫在水滴中的运动方式和状态。',
  5: '总结草履虫作为单细胞生物的形态与运动特点。',
};

const materialLabels: Record<MaterialId, string> = {
  microscope: '显微镜',
  dropper: '滴管',
  slide: '载玻片',
  'cover-slip': '盖玻片',
  'light-source': '光源',
};

const materialOrder: MaterialId[] = ['microscope', 'dropper', 'slide', 'cover-slip', 'light-source'];

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

export function ParameciumLabPlayer({ experiment, onTelemetry }: ParameciumLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [samplePlaced, setSamplePlaced] = useState(false);
  const [focused, setFocused] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先制作装片，再调焦观察草履虫运动。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const motionValue = clamp(42 + (samplePlaced ? 16 : 0) + (focused ? 18 : 0) + (observationChoice === 'correct' ? 14 : 0), 24, 99);
  const clarityValue = clamp(40 + (cameraPreset !== 'bench' ? 10 : 0) + (focused ? 20 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (samplePlaced ? 12 : 0) + (focused ? 16 : 0), 20, 100);

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
        setCameraPreset('stage');
        advanceStep(2, '器材识别完成，下一步制作草履虫临时装片。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleSample = (choice: 'correct' | 'thick') => {
    if (step !== 2 || completed) return;
    if (choice === 'thick') {
      markError('样液过厚、盖片不规范会让视野变暗且不易对焦。');
      return;
    }
    setSamplePlaced(true);
    appendNote('装片制作：样液和盖玻片已规范放好。');
    advanceStep(3, '装片已放好，下一步调光调焦获取清晰视野。');
  };

  const handleFocus = (choice: 'correct' | 'blur') => {
    if (step !== 3 || completed) return;
    if (!samplePlaced) {
      markError('请先制作好临时装片，再进行调焦。');
      return;
    }
    if (choice === 'blur') {
      markError('视野模糊时无法准确观察草履虫的运动状态。');
      return;
    }
    setFocused(true);
    setCameraPreset('scope');
    appendNote('显微观察：草履虫轮廓和运动轨迹已清晰可见。');
    advanceStep(4, '视野已清晰，请观察草履虫在水滴中的运动。');
  };

  const handleObserve = (choice: 'correct' | 'still' | 'no-cilia') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!focused) {
      markError('请先把视野调清晰，再记录草履虫运动。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：草履虫在水滴中能灵活游动，常呈旋转前进。');
      advanceStep(5, '现象判断正确，最后总结草履虫的形态与运动特点。');
      return;
    }
    if (choice === 'still') {
      markError('在清晰且正常的样液中，草履虫通常不是静止不动。');
      return;
    }
    markError('草履虫的运动与体表纤毛密切相关，不能忽略这一特征。');
  };

  const handleSummary = (choice: 'correct' | 'multi' | 'plant') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：草履虫是单细胞生物，能借助纤毛灵活运动。');
      return;
    }
    if (choice === 'multi') {
      markError('草履虫不是多细胞生物，本实验要抓住“单细胞”这一关键点。');
      return;
    }
    markError('草履虫不是植物细胞，观察重点也不是叶绿体等结构。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSamplePlaced(false);
    setFocused(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新制作装片并观察草履虫运动。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先把装片制作规范，再开始调焦。',
        '观察时重点看草履虫的形态和运动轨迹。',
        '总结时记住“单细胞、纤毛运动”。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对草履虫现象。',
        '建议重新执行“制作装片 → 调焦 → 观察运动”的流程。',
      ];

  return (
    <section className="panel playground-panel paramecium-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>把显微镜视野里的草履虫运动、装片制作和清晰调焦做成连贯流程，让微观观察更像真实课堂。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid paramecium-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'stage' ? '载物台观察' : '显微视野'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>运动值 {motionValue}</span><div className="chem-meter-bar"><i style={{ width: `${motionValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card paramecium-data-card"><span className="eyebrow">Readout</span><h3>观察读数板</h3><div className="generic-readout-grid paramecium-readout-grid"><article className={samplePlaced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装片状态</span><strong>{samplePlaced ? '装片已就位' : '待制作'}</strong><small>{samplePlaced ? '样液和盖玻片已放好。' : '先完成临时装片。'}</small></article><article className={focused ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>显微视野</span><strong>{focused ? '草履虫清晰' : '待调焦'}</strong><small>{focused ? '可清楚看到个体轮廓和运动。' : '调焦后再观察。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '单细胞，纤毛运动' : '等待总结'}</strong><small>草履虫是单细胞生物，能借助纤毛灵活运动。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '草履虫观察装置'} · 当前重点：{step <= 2 ? '制作装片' : step === 3 ? '调光调焦' : '观察运动轨迹'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'stage' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('stage')} type="button">载物台</button><button className={cameraPreset === 'scope' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('scope')} type="button">显微镜</button></div></div>

          <div className={`scene-canvas paramecium-stage preset-${cameraPreset} ${samplePlaced ? 'sample' : ''} ${focused ? 'focused' : ''}`}>
            <div className="paramecium-rig">
              <div className="pc-stage-panel" />
              <div className={samplePlaced ? 'pc-slide active' : 'pc-slide'} />
              <div className="pc-microscope">
                <div className="pc-scope-arm" />
                <div className="pc-scope-stage" />
                <div className="pc-view">
                  <span className={focused ? 'pc-organism org-a clear' : 'pc-organism org-a'} />
                  <span className={focused ? 'pc-organism org-b clear' : 'pc-organism org-b'} />
                  <span className={focused ? 'pc-organism org-c clear' : 'pc-organism org-c'} />
                </div>
              </div>
            </div>
          </div>

          <div className="observation-ribbon paramecium-observation-row"><article className={samplePlaced ? 'observation-chip active' : 'observation-chip calm'}><strong>装片制作</strong><span>{samplePlaced ? '临时装片已规范完成。' : '先制作临时装片。'}</span></article><article className={focused ? 'observation-chip active' : 'observation-chip calm'}><strong>视野状态</strong><span>{focused ? '草履虫轮廓和运动已清晰。' : '等待调光调焦。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>运动现象</strong><span>{observationChoice === 'correct' ? '草履虫能灵活游动并常呈旋转前进。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleSample('correct')} type="button"><strong>滴加样液并规范盖上盖玻片</strong><span>便于后续显微观察。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSample('thick')} type="button"><strong>样液过厚并随意盖片</strong><span>错误演示：不利于观察。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFocus('correct')} type="button"><strong>调光调焦到草履虫清晰</strong><span>观察轮廓和运动轨迹。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFocus('blur')} type="button"><strong>保持模糊视野</strong><span>错误演示：无法准确观察。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“草履虫能灵活游动，常呈旋转前进”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('still')} type="button"><strong>记录“草履虫始终静止不动”</strong><span>错误演示：与正常现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('no-cilia')} type="button"><strong>记录“运动与纤毛无关”</strong><span>错误演示：忽略关键结构。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>草履虫是单细胞生物，能借助纤毛灵活运动</strong><span>完整总结草履虫特点。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('multi')} type="button"><strong>草履虫是多细胞生物</strong><span>错误演示：核心概念错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('plant')} type="button"><strong>草履虫属于植物细胞观察</strong><span>错误演示：类别混淆。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{samplePlaced ? '装片已完成' : '待装片'} / {focused ? '视野清晰' : '待调焦'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先装片，再调焦，再观察运动'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“观察草履虫”升级成带装片制作和显微运动视野的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
