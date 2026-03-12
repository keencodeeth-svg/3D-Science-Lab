import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5 | 6;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'leaf' | 'bath';
type MaterialId = 'leaf' | 'shade-paper' | 'alcohol-bath' | 'iodine' | 'forceps';
type ViewMode = 'compare' | 'detail';
type TimelineState = 'done' | 'current' | 'todo';

interface PhotosynthesisLabPlayerProps {
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
  2: '查看遮光与对照',
  3: '完成脱色处理',
  4: '滴加碘液',
  5: '记录颜色变化',
  6: '总结实验结论',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别叶片、遮光纸、酒精水浴装置、碘液和镊子。',
  2: '切换视角比较叶片遮光部分和见光部分的差异。',
  3: '将叶片放入酒精水浴完成脱色处理。',
  4: '脱色后向叶片滴加碘液进行淀粉检验。',
  5: '记录遮光与见光部分的颜色差异，并判断淀粉分布。',
  6: '结合对照关系和颜色变化，总结绿叶在光下制造淀粉。',
};

const materialLabels: Record<MaterialId, string> = {
  leaf: '叶片',
  'shade-paper': '遮光纸',
  'alcohol-bath': '酒精水浴装置',
  iodine: '碘液',
  forceps: '镊子',
};

const materialOrder: MaterialId[] = ['leaf', 'shade-paper', 'alcohol-bath', 'iodine', 'forceps'];

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

export function PhotosynthesisLabPlayer({ experiment, onTelemetry }: PhotosynthesisLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('compare');
  const [controlCompared, setControlCompared] = useState(false);
  const [decolorized, setDecolorized] = useState(false);
  const [iodineAdded, setIodineAdded] = useState(false);
  const [colorRecorded, setColorRecorded] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先比较遮光与见光，再完成脱色、碘液检验和颜色判断。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 6) * 100);
  const safetyValue = clamp(95 - errors * 4 - (step === 3 ? 3 : 0), 62, 99);
  const clarityValue = clamp(48 + (controlCompared ? 12 : 0) + (decolorized ? 14 : 0) + (iodineAdded ? 12 : 0) + (colorRecorded ? 16 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 36, 99);
  const readinessValue = clamp(progressPercent + (controlCompared ? 10 : 0) + (decolorized ? 12 : 0) + (colorRecorded ? 18 : 0), 20, 100);
  const visibleHalfState = iodineAdded ? '蓝黑色' : decolorized ? '黄白色' : '绿色';
  const shadedHalfState = iodineAdded ? '黄褐色' : decolorized ? '黄白色' : '深绿色';

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
        setCameraPreset('leaf');
        advanceStep(2, '识别完成，下一步先比较叶片遮光部分和见光部分。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 项材料，继续检查实验台。`);
      }
      return next;
    });
  };

  const handleCompareView = (mode: ViewMode, compare = false) => {
    if (step !== 2 || completed) return;
    setViewMode(mode);
    setCameraPreset('leaf');
    if (compare && mode === 'detail') {
      setControlCompared(true);
      appendNote('对照比较：已比较遮光部分与见光部分');
      advanceStep(3, '遮光与见光对照已完成，下一步进行酒精水浴脱色处理。');
    } else {
      setPromptTone('info');
      setPrompt(mode === 'compare' ? '当前查看整片叶片，请继续切到细节视图比较两部分差异。' : '当前查看叶片细节，请明确遮光部分和见光部分差异。');
    }
  };

  const handleDecolorize = (mode: 'correct' | 'insufficient') => {
    if (step !== 3 || completed) return;
    if (!controlCompared) {
      markError('请先完成遮光与见光部分的对照比较，再进行脱色。');
      return;
    }
    if (mode === 'insufficient') {
      markError('脱色处理不充分会影响后续碘液显色，请完成充分脱色。');
      return;
    }
    setDecolorized(true);
    setCameraPreset('bath');
    appendNote('脱色处理：叶片已完成酒精水浴，颜色由绿色变浅');
    advanceStep(4, '脱色完成，下一步向叶片滴加碘液检验淀粉。');
  };

  const handleAddIodine = (mode: 'correct' | 'too-early') => {
    if (step !== 4 || completed) return;
    if (mode === 'too-early' || !decolorized) {
      markError('请在完成脱色后再进行碘液检验。');
      return;
    }
    setIodineAdded(true);
    setCameraPreset('leaf');
    appendNote('检验步骤：叶片已滴加碘液，等待显色对比');
    advanceStep(5, '碘液已滴加，观察遮光与见光部分的颜色变化。');
  };

  const handleRecord = (choice: 'correct' | 'same-color' | 'wrong-side') => {
    if (step !== 5 || completed) return;
    if (!iodineAdded) {
      markError('请先滴加碘液，再记录颜色变化。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'same-color' ? '遮光与见光部分颜色应有差异，不能记录成完全相同。' : '见光部分更容易显蓝黑色，遮光部分不会同样显色。');
      return;
    }
    setColorRecorded(true);
    appendNote('颜色记录：见光部分蓝黑，遮光部分黄褐');
    advanceStep(6, '颜色变化已记录，最后总结绿叶在光下制造淀粉的依据。');
  };

  const handleSummary = (choice: 'correct' | 'ignore-control' | 'color-only') => {
    if (step !== 6 || completed) return;
    setSummaryChoice(choice);
    if (!colorRecorded) {
      markError('请先完成颜色记录，再提交实验结论。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'ignore-control' ? '总结必须体现遮光部分和见光部分的对照关系。' : '不能只报颜色变化，还要说明颜色变化背后的淀粉分布和光照关系。');
      return;
    }
    advanceStep(null, experiment.feedback.successSummary);
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setViewMode('compare');
    setControlCompared(false);
    setDecolorized(false);
    setIodineAdded(false);
    setColorRecorded(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先比较遮光与见光，再完成脱色、碘液检验和颜色判断。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先看遮光 / 见光对照，再做后续处理，避免只记结果不看实验设计。',
        '脱色后再滴加碘液，否则叶片原有绿色会干扰判断。',
        '见光部分显蓝黑说明有淀粉，遮光部分不显同样颜色说明没有淀粉积累。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对对照关系和显色情况。',
        '建议先锁定“见光 / 遮光”两部分，再继续进行脱色、检验和总结。',
      ];

  return (
    <section className="panel playground-panel photosynthesis-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物探究页</h2>
          <p>围绕遮光对照、酒精脱色和碘液显色重做专属页，让光合作用实验更像真正的生物探究过程。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 6</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid photosynthesis-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>环境</strong>
                  <span>{experiment.scene.environment}</span>
                </div>
                <span className="badge">生物</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜头</strong>
                  <span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'leaf' ? '叶片视角' : '水浴视角'}</span>
                </div>
                <span className="badge">{experiment.grade}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>主题</strong>
                  <span>{experiment.curriculum.theme}</span>
                </div>
                <span className="badge">{experiment.durationMinutes} 分钟</span>
              </div>
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

          <section className="info-card photosynthesis-data-card">
            <span className="eyebrow">Readout</span>
            <h3>叶片结果板</h3>
            <div className="photosynthesis-data-grid">
              <div className="photosynthesis-data-item">
                <span>见光部分</span>
                <strong>{visibleHalfState}</strong>
                <small>{iodineAdded ? '见光部分显蓝黑，说明有淀粉。' : '等待脱色和碘液显色。'}</small>
              </div>
              <div className="photosynthesis-data-item">
                <span>遮光部分</span>
                <strong>{shadedHalfState}</strong>
                <small>{iodineAdded ? '遮光部分未同样显色，说明未形成同量淀粉。' : '对照结果待锁定。'}</small>
              </div>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '叶片样本'} · 当前重点：{step === 2 ? '遮光对照' : step === 3 ? '脱色处理' : step === 4 ? '碘液检验' : step === 5 ? '颜色判断' : '结论归纳'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'leaf' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('leaf')} type="button">叶片</button>
              <button className={cameraPreset === 'bath' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bath')} type="button">水浴</button>
            </div>
          </div>

          <div className={`scene-canvas photosynthesis-stage preset-${cameraPreset}`}>
            <div className="photosynthesis-stage-head">
              <div>
                <span className="eyebrow">Live Biology</span>
                <h3>{experiment.curriculum.unit}</h3>
                <p>{promptTone === 'error' ? '当前对照或处理顺序存在偏差，请先修正再继续。' : '重点关注遮光 / 见光差异，以及脱色后碘液显色结果。'}</p>
              </div>
              <div className="status-pill-row">
                <span className="status-pill ready">进度 {progressPercent}%</span>
                <span className="status-pill">当前视图 {viewMode === 'compare' ? '对照' : '细节'}</span>
              </div>
            </div>

            <div className="photosynthesis-stage-grid">
              <article className={viewMode === 'compare' ? 'leaf-card active' : 'leaf-card'}>
                <div className="leaf-card-head">
                  <strong>叶片对照</strong>
                  <small>{controlCompared ? '对照已完成' : '等待比较'}</small>
                </div>
                <div className="leaf-board">
                  <div className={decolorized ? 'leaf-shape decolorized' : 'leaf-shape'}>
                    <div className={iodineAdded ? 'leaf-half visible-half stained' : 'leaf-half visible-half'} />
                    <div className={iodineAdded ? 'leaf-half shaded-half stained-light' : 'leaf-half shaded-half'} />
                    <div className="shade-mask" />
                  </div>
                </div>
                <div className="leaf-meta-row">
                  <span>见光部分 {visibleHalfState}</span>
                  <span>遮光部分 {shadedHalfState}</span>
                </div>
              </article>

              <article className={cameraPreset === 'bath' ? 'leaf-card active' : 'leaf-card'}>
                <div className="leaf-card-head">
                  <strong>酒精水浴</strong>
                  <small>{decolorized ? '已完成脱色' : '等待处理'}</small>
                </div>
                <div className="bath-rig">
                  <div className="bath-container">
                    <div className={decolorized ? 'bath-liquid active' : 'bath-liquid'} />
                    <div className={decolorized ? 'bath-leaf active' : 'bath-leaf'} />
                  </div>
                  <div className="bath-status">{decolorized ? '叶片已褪绿' : '等待脱色'}</div>
                </div>
              </article>
            </div>

            <div className="photosynthesis-insight-row">
              <article className="lab-readout-card active">
                <span>对照状态</span>
                <strong>{controlCompared ? '遮光 / 见光已比较' : '等待对照比较'}</strong>
                <small>先做对照，后做处理，才能知道颜色差异来自光照而非其他因素。</small>
              </article>
              <article className="lab-readout-card calm">
                <span>处理顺序</span>
                <strong>{decolorized ? '已脱色' : '待脱色'} / {iodineAdded ? '已加碘液' : '待加碘液'}</strong>
                <small>脱色后再检验，是为了更清楚地看见淀粉显色结果。</small>
              </article>
              <article className={colorRecorded ? 'lab-readout-card active' : 'lab-readout-card warn'}>
                <span>结论信号</span>
                <strong>{colorRecorded ? '见光蓝黑 / 遮光黄褐' : '等待颜色记录'}</strong>
                <small>颜色差异是“绿叶在光下制造淀粉”的直接证据。</small>
              </article>
            </div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}>
            <span className="eyebrow">Lab Prompt</span>
            <h3>{completed ? '实验已完成' : stepTitles[step]}</h3>
            <p>{prompt}</p>
          </div>

          <section className="info-card generic-notebook-card">
            <div className="generic-notebook-head">
              <div>
                <span className="eyebrow">Notebook</span>
                <h3>实验记录</h3>
              </div>
              <span className="badge">过程留痕</span>
            </div>

            <div className="timeline-list">
              {timeline.map((entry) => (
                <div className={`timeline-item ${entry.state}`} key={entry.title}>
                  <span className="timeline-marker" />
                  <div className="timeline-copy">
                    <strong>{entry.title}</strong>
                    <small>{entry.detail}</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="lab-note-stack">
              {labNotes.map((note, index) => (
                <div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>
                  {note}
                </div>
              ))}
            </div>
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
                  <span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别材料'}</span>
                </button>
              )) : null}

              {step === 2 ? (
                <>
                  <button className={viewMode === 'compare' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleCompareView('compare')} type="button">
                    <strong>看整片叶片</strong>
                    <span>先确认遮光和见光区域位置。</span>
                  </button>
                  <button className={viewMode === 'detail' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleCompareView('detail', true)} type="button">
                    <strong>切到细节并完成对照</strong>
                    <span>比较遮光部分和见光部分差异。</span>
                  </button>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <button className={decolorized ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleDecolorize('correct')} type="button">
                    <strong>完成酒精水浴脱色</strong>
                    <span>让叶片褪绿，便于后续显色观察。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleDecolorize('insufficient')} type="button">
                    <strong>稍微加热就停止</strong>
                    <span>错误演示：脱色不充分。</span>
                  </button>
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <button className={iodineAdded ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleAddIodine('correct')} type="button">
                    <strong>滴加碘液</strong>
                    <span>开始进行淀粉检验。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleAddIodine('too-early')} type="button">
                    <strong>未脱色直接滴加碘液</strong>
                    <span>错误演示：顺序不规范。</span>
                  </button>
                </>
              ) : null}

              {step === 5 ? (
                <>
                  <button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button">
                    <strong>记录“见光部分蓝黑，遮光部分黄褐”</strong>
                    <span>根据颜色差异判断淀粉分布。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleRecord('same-color')} type="button">
                    <strong>记录“两部分颜色相同”</strong>
                    <span>错误演示：忽略颜色差异。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleRecord('wrong-side')} type="button">
                    <strong>记录“遮光部分蓝黑”</strong>
                    <span>错误演示：把显色区域记反了。</span>
                  </button>
                </>
              ) : null}

              {step === 6 ? (
                <>
                  <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                    <strong>见光部分显蓝黑，遮光部分不显同样颜色，说明绿叶在光下制造并积累淀粉</strong>
                    <span>完整体现了对照关系、显色现象和结论。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('ignore-control')} type="button">
                    <strong>叶片显色了，所以肯定都产生了淀粉</strong>
                    <span>错误演示：忽略遮光 / 见光对照关系。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleSummary('color-only')} type="button">
                    <strong>叶片颜色变了，所以实验结束</strong>
                    <span>错误演示：只描述颜色，不说明淀粉和光照关系。</span>
                  </button>
                </>
              ) : null}
            </div>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>处理状态：{controlCompared ? '已对照' : '待对照'} / {decolorized ? '已脱色' : '待脱色'} / {iodineAdded ? '已检验' : '待检验'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意实验规范'}</li>
            </ul>
          </section>

          <section className="info-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>实验控制</h3>
            <div className="button-stack">
              <button className="action-button ghost" onClick={handleReset} type="button">重新开始</button>
            </div>
            <small>这页已把“绿叶在光下制造淀粉”升级成对照、处理、显色一体化的专属生物探究页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
