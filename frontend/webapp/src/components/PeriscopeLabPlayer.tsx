import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'mirrors' | 'path';
type MaterialId = 'tube' | 'mirror' | 'eyepiece' | 'target' | 'light';
type TimelineState = 'done' | 'current' | 'todo';

interface PeriscopeLabPlayerProps {
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
  2: '安装上方平面镜',
  3: '安装下方平面镜',
  4: '观察潜望镜成像',
  5: '总结改变光路',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别镜筒、平面镜、目镜、观察目标和光线方向。',
  2: '先把上方平面镜按 45° 方向装入潜望镜顶部。',
  3: '再把下方平面镜按对应角度装入底部，让光线继续折向观察者。',
  4: '比较光线在两块平面镜中的传播路径与最终观察效果。',
  5: '总结潜望镜利用两块平面镜改变光路的原理。',
};

const materialLabels: Record<MaterialId, string> = {
  tube: '镜筒',
  mirror: '平面镜',
  eyepiece: '目镜',
  target: '观察目标',
  light: '入射光线',
};

const materialOrder: MaterialId[] = ['tube', 'mirror', 'eyepiece', 'target', 'light'];

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

export function PeriscopeLabPlayer({ experiment, onTelemetry }: PeriscopeLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [upperMirrorMounted, setUpperMirrorMounted] = useState(false);
  const [lowerMirrorMounted, setLowerMirrorMounted] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过两块平面镜的组合观察潜望镜如何改变光路。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const alignmentValue = clamp(30 + (upperMirrorMounted ? 20 : 0) + (lowerMirrorMounted ? 24 : 0), 20, 99);
  const pathValue = clamp(24 + (cameraPreset !== 'bench' ? 14 : 0) + (observationChoice === 'correct' ? 24 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (upperMirrorMounted ? 10 : 0) + (lowerMirrorMounted ? 14 : 0), 20, 100);

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
        setCameraPreset('mirrors');
        advanceStep(2, '器材识别完成，先安装上方 45° 平面镜。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleUpperMirror = (choice: 'correct' | 'flat') => {
    if (step !== 2 || completed) return;
    if (choice === 'flat') {
      markError('上方平面镜应斜置约 45°，才能把来自外部的光线折向镜筒内部。');
      return;
    }
    setUpperMirrorMounted(true);
    appendNote('装置安装：上方平面镜已按 45° 固定在潜望镜顶部。');
    advanceStep(3, '上方平面镜已安装，下一步安装下方平面镜。');
  };

  const handleLowerMirror = (choice: 'correct' | 'wrong-angle') => {
    if (step !== 3 || completed) return;
    if (!upperMirrorMounted) {
      markError('请先装好上方平面镜，再继续下方安装。');
      return;
    }
    if (choice === 'wrong-angle') {
      markError('下方平面镜也要按对应角度放置，否则光线不能折向目镜。');
      return;
    }
    setLowerMirrorMounted(true);
    setCameraPreset('path');
    appendNote('装置安装：下方平面镜已与上方平面镜配合形成完整光路。');
    advanceStep(4, '两块平面镜已安装，请观察潜望镜中的成像与光路。');
  };

  const handleObserve = (choice: 'correct' | 'straight' | 'single') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!upperMirrorMounted || !lowerMirrorMounted) {
      markError('请先完成两块平面镜安装，再观察光路。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：光线先被上镜反射向下，再被下镜反射进入观察者眼中。');
      advanceStep(5, '已完成光路观察，下一步总结潜望镜的工作原理。');
      return;
    }
    markError(choice === 'straight' ? '潜望镜中的光线不是直穿镜筒，而是经过两次反射改变方向。' : '只装一块平面镜无法形成完整潜望观察路径。');
  };

  const handleSummary = (choice: 'correct' | 'no-mirror' | 'same-direction') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：两块平面镜能连续改变光路，使观察者看到被遮挡方向外的物体。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'no-mirror' ? '潜望镜成像依赖平面镜反射，不是没有镜子也能直接看到。' : '潜望镜的关键不是保持原方向，而是通过两次反射重定向光线。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setUpperMirrorMounted(false);
    setLowerMirrorMounted(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新搭建潜望镜并观察光路。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先上镜、后下镜，两镜都要斜放。', '观察时重点看光线的两次反射。', '总结时记住“平面镜改变光路”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对两块平面镜的安装方向。',
        '建议按“识别器材 → 装上镜 → 装下镜 → 观察光路 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel periscope-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属科学实验页</h2>
          <p>把潜望镜镜筒、两块平面镜、观察目标和光线路径做成更直观的真实教具场景。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid periscope-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'mirrors' ? '镜面安装' : '光路观察'}</span></div><span className="badge">{experiment.grade}</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div>
            </div>
          </section>

          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>镜面安装 {alignmentValue}</span><div className="chem-meter-bar"><i style={{ width: `${alignmentValue}%` }} /></div></div>
              <div className="chem-meter"><span>光路清晰度 {pathValue}</span><div className="chem-meter-bar"><i style={{ width: `${pathValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>

          <section className="info-card periscope-data-card">
            <span className="eyebrow">Readout</span>
            <h3>潜望镜读数板</h3>
            <div className="generic-readout-grid periscope-readout-grid">
              <article className={upperMirrorMounted ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>上方平面镜</span>
                <strong>{upperMirrorMounted ? '45° 已安装' : '--'}</strong>
                <small>{upperMirrorMounted ? '外部光线已能折向镜筒。' : '先完成上镜安装。'}</small>
              </article>
              <article className={lowerMirrorMounted ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>下方平面镜</span>
                <strong>{lowerMirrorMounted ? '光路已闭合' : '--'}</strong>
                <small>{lowerMirrorMounted ? '光线已折向目镜。' : '再装下镜形成完整光路。'}</small>
              </article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>核心结论</span>
                <strong>{summaryChoice === 'correct' ? '两次反射改光路' : '等待总结'}</strong>
                <small>潜望镜依靠两块平面镜连续改变光传播方向。</small>
              </article>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '潜望镜装置'} · 当前重点：{step <= 2 ? '安装第一块平面镜' : step === 3 ? '安装第二块平面镜' : '观察两次反射'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'mirrors' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('mirrors')} type="button">镜面</button>
              <button className={cameraPreset === 'path' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('path')} type="button">光路</button>
            </div>
          </div>

          <div className={`scene-canvas periscope-stage preset-${cameraPreset} ${upperMirrorMounted ? 'upper-mounted' : ''} ${lowerMirrorMounted ? 'lower-mounted' : ''}`}>
            <div className="periscope-rig">
              <div className="ps-target">
                <div className="ps-target-pole" />
                <div className="ps-target-flag" />
              </div>
              <div className="ps-body">
                <div className="ps-window top" />
                <div className="ps-window bottom" />
                <div className={upperMirrorMounted ? 'ps-mirror top active' : 'ps-mirror top'} />
                <div className={lowerMirrorMounted ? 'ps-mirror bottom active' : 'ps-mirror bottom'} />
              </div>
              <div className="ps-eye" />
              <div className={upperMirrorMounted && lowerMirrorMounted ? 'ps-ray upper active' : upperMirrorMounted ? 'ps-ray upper partial' : 'ps-ray upper'} />
              <div className={upperMirrorMounted && lowerMirrorMounted ? 'ps-ray tube active' : upperMirrorMounted ? 'ps-ray tube partial' : 'ps-ray tube'} />
              <div className={upperMirrorMounted && lowerMirrorMounted ? 'ps-ray lower active' : 'ps-ray lower'} />
              <div className="ps-stand" />
            </div>
          </div>

          <div className="observation-ribbon periscope-observation-row">
            <article className={upperMirrorMounted ? 'observation-chip active' : 'observation-chip calm'}><strong>上镜安装</strong><span>{upperMirrorMounted ? '上方平面镜已到位。' : '先安装上镜。'}</span></article>
            <article className={lowerMirrorMounted ? 'observation-chip active' : 'observation-chip calm'}><strong>下镜安装</strong><span>{lowerMirrorMounted ? '下方平面镜已闭合光路。' : '等待安装下镜。'}</span></article>
            <article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>光路判断</strong><span>{observationChoice === 'correct' ? '已识别两次反射。' : '等待完成成像观察。'}</span></article>
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
                <button className="summary-choice generic-choice primary" onClick={() => handleUpperMirror('correct')} type="button"><strong>把上方平面镜按 45° 装在顶部窗口处</strong><span>让外部光线折向镜筒内部。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleUpperMirror('flat')} type="button"><strong>把上方平面镜平放不倾斜</strong><span>错误演示：无法正确转向光线。</span></button>
              </> : null}

              {step === 3 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleLowerMirror('correct')} type="button"><strong>把下方平面镜按对应角度装在底部窗口处</strong><span>让光线继续折向观察者眼睛。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleLowerMirror('wrong-angle')} type="button"><strong>让下方平面镜与光线方向不匹配</strong><span>错误演示：无法形成完整光路。</span></button>
              </> : null}

              {step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“光线经上镜反射向下，再经下镜反射进入眼睛”</strong><span>这是本实验的正确光路现象。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('straight')} type="button"><strong>记录“光线直接直穿镜筒，不发生反射”</strong><span>错误演示：忽略了平面镜反射。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleObserve('single')} type="button"><strong>记录“只要一块平面镜就足够完成潜望观察”</strong><span>错误演示：光路不完整。</span></button>
              </> : null}

              {step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>潜望镜利用两块平面镜连续反射光线，从而改变光路并看到遮挡方向外的物体</strong><span>完整总结本实验结论。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('same-direction')} type="button"><strong>潜望镜的作用只是让光线保持原方向前进</strong><span>错误演示：忽略改变光路。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-mirror')} type="button"><strong>潜望镜不需要平面镜也能直接看到目标</strong><span>错误演示：原理错误。</span></button>
              </> : null}
            </div>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{upperMirrorMounted ? '上镜已装' : '上镜待装'} / {lowerMirrorMounted ? '下镜已装' : '下镜待装'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意两块平面镜都要按正确角度安装'}</li>
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
            <small>这页已把“制作并观察潜望镜”升级成可见镜面安装与光路变化的专属页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
