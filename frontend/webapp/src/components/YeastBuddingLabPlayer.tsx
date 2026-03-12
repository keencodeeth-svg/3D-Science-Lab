import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'microscope' | 'view';
type MaterialId = 'microscope' | 'slide' | 'dropper' | 'coverslip' | 'yeast';
type TimelineState = 'done' | 'current' | 'todo';

interface YeastBuddingLabPlayerProps {
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
  2: '制作酵母临时装片',
  3: '调焦观察',
  4: '识别出芽现象',
  5: '总结出芽生殖特点',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别显微镜、载玻片、滴管、盖玻片和酵母培养液。',
  2: '在载玻片上滴加酵母液并盖上盖玻片，形成观察样本。',
  3: '调节显微镜焦距，使酵母细胞轮廓清晰。',
  4: '观察母细胞旁边的小突起，识别出芽生殖现象。',
  5: '总结酵母菌主要通过出芽方式进行无性生殖。',
};

const materialLabels: Record<MaterialId, string> = {
  microscope: '显微镜',
  slide: '载玻片',
  dropper: '滴管',
  coverslip: '盖玻片',
  yeast: '酵母培养液',
};

const materialOrder: MaterialId[] = ['microscope', 'slide', 'dropper', 'coverslip', 'yeast'];

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

export function YeastBuddingLabPlayer({ experiment, onTelemetry }: YeastBuddingLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [slidePrepared, setSlidePrepared] = useState(false);
  const [focused, setFocused] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过临时装片和显微镜视野观察酵母菌出芽生殖。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const focusValue = clamp(30 + (slidePrepared ? 18 : 0) + (focused ? 28 : 0), 20, 99);
  const clarityValue = clamp(34 + (cameraPreset !== 'bench' ? 12 : 0) + (focused ? 20 : 0) + (observationChoice === 'correct' ? 10 : 0), 22, 99);
  const readinessValue = clamp(progressPercent + (slidePrepared ? 10 : 0) + (focused ? 14 : 0), 20, 100);

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
        setCameraPreset('microscope');
        advanceStep(2, '器材识别完成，下一步制作酵母临时装片。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePrepareSlide = (choice: 'correct' | 'dry') => {
    if (step !== 2 || completed) return;
    if (choice === 'dry') {
      markError('观察酵母应先滴加培养液并盖上盖玻片，不能空片干看。');
      return;
    }
    setSlidePrepared(true);
    appendNote('装片完成：酵母培养液和盖玻片已放置到位，样本可供显微观察。');
    advanceStep(3, '装片已制好，下一步调焦使视野清晰。');
  };

  const handleFocus = (choice: 'correct' | 'blur') => {
    if (step !== 3 || completed) return;
    if (!slidePrepared) {
      markError('请先完成临时装片制作，再进行调焦。');
      return;
    }
    if (choice === 'blur') {
      markError('当前焦距不清晰，无法准确辨认细胞和芽体。');
      return;
    }
    setFocused(true);
    setCameraPreset('view');
    appendNote('视野调清：酵母细胞轮廓清晰，可观察到母细胞周围的小芽体。');
    advanceStep(4, '视野已清晰，请识别酵母菌的出芽现象。');
  };

  const handleObserve = (choice: 'correct' | 'same-cell' | 'equal-split') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!focused) {
      markError('请先把显微镜视野调清，再识别出芽现象。');
      return;
    }
    if (choice === 'correct') {
      appendNote('显微观察：可见较大的母细胞旁长出较小芽体，这是酵母菌出芽生殖特征。');
      advanceStep(5, '观察正确，最后总结酵母菌的生殖方式。');
      return;
    }
    if (choice === 'same-cell') {
      markError('视野中并非所有细胞都完全一样，关键是要看到母细胞旁的小芽体。');
      return;
    }
    markError('酵母菌此处表现为出芽，不是两个完全相等个体的简单均分。');
  };

  const handleSummary = (choice: 'correct' | 'sexual' | 'binary') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：酵母菌可通过出芽方式进行无性生殖。');
      return;
    }
    if (choice === 'sexual') {
      markError('本实验观察到的是出芽现象，不是有性生殖。');
      return;
    }
    markError('这里的关键特征是芽体长出，不是把一个细胞均分成两个相等个体。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSlidePrepared(false);
    setFocused(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察酵母菌出芽生殖。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先制作装片，再调焦观察。', '观察重点是“母细胞旁长出较小芽体”。', '总结时抓住“出芽、无性生殖”。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对显微镜视野。',
        '建议按“制片 → 调焦 → 观察芽体 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel yeastbudding-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属生物实验页</h2><p>把载玻片、显微镜金属结构、旋钮调焦和视野中的芽体细胞做成一体化场景，提升显微观察真实感。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>

      <div className="playground-grid yeastbudding-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'microscope' ? '显微镜装片' : '显微视野'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>调焦度 {focusValue}</span><div className="chem-meter-bar"><i style={{ width: `${focusValue}%` }} /></div></div><div className="chem-meter"><span>视野清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card yeastbudding-data-card"><span className="eyebrow">Readout</span><h3>显微读数板</h3><div className="generic-readout-grid yeastbudding-readout-grid"><article className={slidePrepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装片状态</span><strong>{slidePrepared ? '已制作完成' : '--'}</strong><small>{slidePrepared ? '酵母液已滴加并盖片。' : '先制作临时装片。'}</small></article><article className={focused ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>调焦状态</span><strong>{focused ? '视野清晰' : '--'}</strong><small>{focused ? '细胞边缘与芽体已可辨认。' : '再调焦使视野清晰。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '出芽进行无性生殖' : '等待总结'}</strong><small>酵母菌母细胞可长出较小芽体。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '酵母菌装片'} · 当前重点：{step <= 2 ? '完成装片' : step === 3 ? '显微调焦' : '识别芽体'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'microscope' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('microscope')} type="button">显微镜</button><button className={cameraPreset === 'view' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('view')} type="button">视野</button></div></div>

          <div className={`scene-canvas yeastbudding-stage preset-${cameraPreset} ${slidePrepared ? 'slide-prepared' : ''} ${focused ? 'focused' : ''}`}><div className="yeastbudding-rig"><div className="yb-microscope"><div className="yb-body" /><div className="yb-stage" /><div className={slidePrepared ? 'yb-slide active' : 'yb-slide'} /></div><div className={focused ? 'yb-focus-knob active' : 'yb-focus-knob'} /><div className={focused ? 'yb-view active' : 'yb-view'}><div className="yb-cell a" /><div className="yb-cell b budded" /><div className="yb-cell c" /><div className="yb-cell d budded" /><div className="yb-cell e" /></div></div></div>

          <div className="observation-ribbon yeastbudding-observation-row"><article className={slidePrepared ? 'observation-chip active' : 'observation-chip calm'}><strong>制片状态</strong><span>{slidePrepared ? '临时装片已制作完成。' : '先完成装片制作。'}</span></article><article className={focused ? 'observation-chip active' : 'observation-chip calm'}><strong>调焦状态</strong><span>{focused ? '显微视野已清晰。' : '等待调焦清晰。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>芽体识别</strong><span>{observationChoice === 'correct' ? '已识别母细胞旁的小芽体。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePrepareSlide('correct')} type="button"><strong>滴加酵母液并盖上盖玻片</strong><span>形成可观察的临时装片。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePrepareSlide('dry')} type="button"><strong>空着载玻片直接观察</strong><span>错误演示：样本准备不完整。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFocus('correct')} type="button"><strong>调节焦距直到细胞轮廓清晰</strong><span>为识别芽体创造条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFocus('blur')} type="button"><strong>保持模糊视野直接判断</strong><span>错误演示：容易误判。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“母细胞旁长出较小芽体”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same-cell')} type="button"><strong>记录“所有细胞都完全一样，没有明显差异”</strong><span>错误演示：忽略芽体。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('equal-split')} type="button"><strong>记录“一个细胞均分成两个完全一样的细胞”</strong><span>错误演示：与出芽现象不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>酵母菌可通过出芽方式进行无性生殖</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('sexual')} type="button"><strong>酵母菌这里表现的是有性生殖</strong><span>错误演示：类型判断错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('binary')} type="button"><strong>酵母菌这里只是把自己均分成两个完全相等的个体</strong><span>错误演示：忽略芽体特征。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{slidePrepared ? '已制片' : '待制片'} / {focused ? '已调焦' : '待调焦'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先制片，再调焦观察芽体'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“观察酵母菌出芽生殖”升级成显微镜视野与装片操作的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
