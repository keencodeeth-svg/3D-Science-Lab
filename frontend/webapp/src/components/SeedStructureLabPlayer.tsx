import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'seed' | 'macro';
type MaterialId = 'dish' | 'bean' | 'tweezers' | 'lens' | 'needle';
type TimelineState = 'done' | 'current' | 'todo';

interface SeedStructureLabPlayerProps {
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
  2: '浸泡并软化种皮',
  3: '剥去种皮并分开子叶',
  4: '观察胚的结构',
  5: '总结菜豆种子结构',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别培养皿、菜豆、镊子、放大镜和解剖针。',
  2: '先把菜豆浸泡软化，便于完整剥去种皮。',
  3: '轻轻剥去种皮，再分开两片肥厚子叶。',
  4: '观察内部胚芽、胚轴和胚根所在的位置。',
  5: '总结菜豆种子的基本结构组成。',
};

const materialLabels: Record<MaterialId, string> = {
  dish: '培养皿',
  bean: '菜豆种子',
  tweezers: '镊子',
  lens: '放大镜',
  needle: '解剖针',
};

const materialOrder: MaterialId[] = ['dish', 'bean', 'tweezers', 'lens', 'needle'];

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

export function SeedStructureLabPlayer({ experiment, onTelemetry }: SeedStructureLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [soaked, setSoaked] = useState(false);
  const [opened, setOpened] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过浸泡、剥皮和分开子叶观察菜豆种子内部结构。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const soakingValue = clamp(36 + (soaked ? 28 : 0) + (opened ? 12 : 0), 22, 99);
  const clarityValue = clamp(34 + (cameraPreset === 'macro' ? 22 : 0) + (opened ? 24 : 0) + (observationChoice === 'correct' ? 8 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (soaked ? 12 : 0) + (opened ? 14 : 0), 20, 100);

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
        setCameraPreset('seed');
        advanceStep(2, '器材识别完成，先浸泡菜豆，让种皮变软。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleSoak = (choice: 'correct' | 'dry') => {
    if (step !== 2 || completed) return;
    if (choice === 'dry') {
      markError('干种子不易完整剥离种皮，请先浸泡软化。');
      return;
    }
    setSoaked(true);
    appendNote('预处理完成：菜豆吸水膨胀，种皮更容易剥离。');
    advanceStep(3, '浸泡完成，下一步剥去种皮并分开子叶。');
  };

  const handleOpen = (choice: 'correct' | 'cut') => {
    if (step !== 3 || completed) return;
    if (!soaked) {
      markError('请先完成浸泡，再进行剥皮和分开子叶。');
      return;
    }
    if (choice === 'cut') {
      markError('不要随意切碎种子，应轻轻剥去种皮并分开子叶。');
      return;
    }
    setOpened(true);
    setCameraPreset('macro');
    appendNote('结构展开：两片子叶分开后，内部胚结构显露出来。');
    advanceStep(4, '子叶已分开，请观察胚芽、胚轴和胚根。');
  };

  const handleObserve = (choice: 'correct' | 'cotyledon-only' | 'root-only') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!opened) {
      markError('请先剥去种皮并分开子叶，再观察内部结构。');
      return;
    }
    if (choice === 'correct') {
      appendNote('显微观察：胚位于子叶连接处，可辨认胚芽、胚轴和胚根。');
      advanceStep(5, '观察正确，最后总结菜豆种子的结构组成。');
      return;
    }
    if (choice === 'cotyledon-only') {
      markError('子叶不是胚的全部，还要看到胚芽、胚轴和胚根。');
      return;
    }
    markError('不能只看到胚根，菜豆种子内部应辨认完整胚的多个部分。');
  };

  const handleSummary = (choice: 'correct' | 'coat-food' | 'single-part') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：菜豆种子由种皮、子叶和胚组成，胚包括胚芽、胚轴和胚根。');
      return;
    }
    if (choice === 'coat-food') {
      markError('储存营养的主要是子叶，不是种皮。');
      return;
    }
    markError('菜豆种子结构不只一个部分，应包含种皮、子叶和胚。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSoaked(false);
    setOpened(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察菜豆种子的内部结构。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先浸泡再剥皮，能避免损伤内部结构。', '分开两片子叶后再观察胚的位置。', '总结时抓住“种皮、子叶、胚”三个层次。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对菜豆种子结构。',
        '建议按“浸泡 → 剥皮分叶 → 观察胚 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel seedstructure-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>把菜豆种子从浸泡到剥皮、分叶、观察胚的过程拆成真实场景，便于学生看清内部结构。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid seedstructure-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'seed' ? '种子处理' : '放大观察'}</span></div><span className="badge">{experiment.grade}</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div>
            </div>
          </section>
          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>浸润度 {soakingValue}</span><div className="chem-meter-bar"><i style={{ width: `${soakingValue}%` }} /></div></div>
              <div className="chem-meter"><span>结构清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
          <section className="info-card seedstructure-data-card">
            <span className="eyebrow">Readout</span>
            <h3>结构读数板</h3>
            <div className="generic-readout-grid seedstructure-readout-grid">
              <article className={soaked ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>浸泡状态</span>
                <strong>{soaked ? '种皮已软化' : '--'}</strong>
                <small>{soaked ? '菜豆已吸水膨胀，便于完整剥皮。' : '先进行浸泡预处理。'}</small>
              </article>
              <article className={opened ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>结构展开</span>
                <strong>{opened ? '子叶已分开' : '--'}</strong>
                <small>{opened ? '内部胚已露出，可继续放大观察。' : '先剥去种皮并分开子叶。'}</small>
              </article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>核心结论</span>
                <strong>{summaryChoice === 'correct' ? '种皮 + 子叶 + 胚' : '等待总结'}</strong>
                <small>胚进一步包括胚芽、胚轴和胚根。</small>
              </article>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '菜豆种子结构'} · 当前重点：{step <= 2 ? '浸泡软化种皮' : step === 3 ? '展开子叶' : '观察胚结构'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'seed' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('seed')} type="button">种子</button>
              <button className={cameraPreset === 'macro' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('macro')} type="button">放大</button>
            </div>
          </div>

          <div className={`scene-canvas seedstructure-stage preset-${cameraPreset} ${soaked ? 'soaked' : ''} ${opened ? 'opened' : ''}`}>
            <div className="seedstructure-rig">
              <div className="ss-dish"><div className={soaked ? 'ss-water active' : 'ss-water'} /></div>
              <div className={soaked ? 'ss-seed active' : 'ss-seed'} />
              <div className={opened ? 'ss-coat active' : 'ss-coat'} />
              <div className={opened ? 'ss-cotyledon left active' : 'ss-cotyledon left'} />
              <div className={opened ? 'ss-cotyledon right active' : 'ss-cotyledon right'} />
              <div className={opened ? 'ss-embryo active' : 'ss-embryo'} />
              <div className={cameraPreset === 'macro' ? 'ss-lens active' : 'ss-lens'} />
            </div>
          </div>

          <div className="observation-ribbon seedstructure-observation-row">
            <article className={soaked ? 'observation-chip active' : 'observation-chip calm'}><strong>浸泡状态</strong><span>{soaked ? '种皮已软化，种子膨胀。' : '先完成浸泡。'}</span></article>
            <article className={opened ? 'observation-chip active' : 'observation-chip calm'}><strong>展开状态</strong><span>{opened ? '子叶已分开，胚已显露。' : '等待分开子叶。'}</span></article>
            <article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>结构识别</strong><span>{observationChoice === 'correct' ? '已辨认胚芽、胚轴和胚根。' : '等待完成结构判断。'}</span></article>
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
                <button className="summary-choice generic-choice primary" onClick={() => handleSoak('correct')} type="button"><strong>先将菜豆浸泡后再处理</strong><span>种皮变软，更容易完整剥离。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleSoak('dry')} type="button"><strong>直接掰开干种子</strong><span>错误演示：容易损伤内部结构。</span></button>
              </> : null}
              {step === 3 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleOpen('correct')} type="button"><strong>轻剥种皮并分开两片子叶</strong><span>显露内部完整胚结构。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleOpen('cut')} type="button"><strong>随意切碎种子</strong><span>错误演示：破坏观察对象。</span></button>
              </> : null}
              {step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“胚位于子叶连接处，可见胚芽、胚轴和胚根”</strong><span>这是本实验的正确观察。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('cotyledon-only')} type="button"><strong>记录“菜豆内部只有两片子叶”</strong><span>错误演示：忽略胚结构。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleObserve('root-only')} type="button"><strong>记录“只看到胚根，其他结构不存在”</strong><span>错误演示：观察不完整。</span></button>
              </> : null}
              {step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>菜豆种子由种皮、子叶和胚组成，胚包括胚芽、胚轴和胚根</strong><span>完整总结本实验结论。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('coat-food')} type="button"><strong>种皮是主要储存营养的结构</strong><span>错误演示：功能判断错误。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleSummary('single-part')} type="button"><strong>菜豆种子只有一个主要结构</strong><span>错误演示：概念过于片面。</span></button>
              </> : null}
            </div>
          </section>
          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{soaked ? '已浸泡' : '待浸泡'} / {opened ? '已展开' : '待展开'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先浸泡，再剥皮和观察胚'}</li>
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
            <small>这页已把“观察菜豆种子结构”升级成浸泡、剥皮和放大观察的专属页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
