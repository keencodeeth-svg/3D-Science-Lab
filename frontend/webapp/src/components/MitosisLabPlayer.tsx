import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';
import { MitosisPrepThreeScene } from './MitosisPrepThreeScene';
import { MitosisScopeThreeScene } from './MitosisScopeThreeScene';

type StepId = 1 | 2 | 3 | 4 | 5 | 6;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'slide' | 'microscope';
type MaterialId = 'root-tip' | 'stain' | 'slide' | 'cover-slip' | 'microscope';
type TimelineState = 'done' | 'current' | 'todo';

interface MitosisLabPlayerProps {
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
  2: '完成染色',
  3: '制作装片',
  4: '调焦观察',
  5: '记录分裂时期',
  6: '总结观察要点',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别根尖、染色液、载玻片、盖玻片和显微镜。',
  2: '向样本滴加染色液，为后续观察做准备。',
  3: '把样本、载玻片和盖玻片按规范做成装片。',
  4: '切到显微镜视角并把图像调清晰。',
  5: '根据显微图像记录典型有丝分裂时期。',
  6: '总结染色、装片、调焦和时期识别的关键点。',
};

const materialLabels: Record<MaterialId, string> = {
  'root-tip': '洋葱根尖',
  stain: '染色液',
  slide: '载玻片',
  'cover-slip': '盖玻片',
  microscope: '显微镜',
};

const materialOrder: MaterialId[] = ['root-tip', 'stain', 'slide', 'cover-slip', 'microscope'];

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

export function MitosisLabPlayer({ experiment, onTelemetry }: MitosisLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [stainAdded, setStainAdded] = useState(false);
  const [slideReady, setSlideReady] = useState(false);
  const [focused, setFocused] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先完成染色和装片，再切到显微镜视角识别典型分裂时期。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 6) * 100);
  const prepValue = clamp(42 + (stainAdded ? 16 : 0) + (slideReady ? 18 : 0) + (focused ? 16 : 0), 24, 99);
  const clarityValue = clamp(44 + (focused ? 24 : 0), 30, 99);
  const readinessValue = clamp(progressPercent + (stainAdded ? 10 : 0) + (slideReady ? 14 : 0) + (focused ? 18 : 0), 20, 100);

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
        advanceStep(2, '材料识别完成，下一步向样本滴加染色液。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个材料，请继续。`);
      }
      return next;
    });
  };

  const handleStain = (choice: 'correct' | 'skip') => {
    if (step !== 2 || completed) return;
    if (choice === 'skip') {
      markError('未染色会影响后续显微图像识别，请先完成染色。');
      return;
    }
    setStainAdded(true);
    appendNote('制片准备：已向根尖样本滴加染色液。');
    advanceStep(3, '染色完成，下一步规范完成装片。');
  };

  const handleSlide = (choice: 'correct' | 'rough') => {
    if (step !== 3 || completed) return;
    if (!stainAdded) {
      markError('请先完成染色，再进行装片操作。');
      return;
    }
    if (choice === 'rough') {
      markError('装片不规范会影响后续显微观察，请先规范放置载玻片和盖玻片。');
      return;
    }
    setSlideReady(true);
    setCameraPreset('microscope');
    appendNote('装片完成：样本、载玻片和盖玻片已规范就位。');
    advanceStep(4, '装片完成，下一步切到显微镜并将图像调清晰。');
  };

  const handleFocus = (choice: 'fine' | 'blur') => {
    if (step !== 4 || completed) return;
    if (!slideReady) {
      markError('请先完成装片，再调焦观察。');
      return;
    }
    if (choice === 'blur') {
      markError('图像未清晰前不要急于记录，需要通过细调获得清晰图像。');
      return;
    }
    setFocused(true);
    appendNote('显微观察：图像已调清晰，可辨认典型分裂细胞。');
    advanceStep(5, '图像清晰后，下一步记录典型有丝分裂时期。');
  };

  const handleRecord = (choice: 'correct' | 'random' | 'unclear') => {
    if (step !== 5 || completed) return;
    if (!focused) {
      markError('请先把显微图像调清晰，再记录分裂时期。');
      return;
    }
    if (choice === 'correct') {
      appendNote('结果记录：已识别出典型中期细胞，染色体排列较为清晰。');
      advanceStep(6, '时期识别完成，下一步总结制片、调焦和识别要点。');
      return;
    }
    if (choice === 'random') {
      markError('分裂时期识别要根据显微图像特征，不能随意判断。');
      return;
    }
    markError('图像已经可以调清晰，请先基于清晰图像识别典型时期。');
  };

  const handleSummary = (choice: 'correct' | 'focus-only' | 'no-stain') => {
    if (step !== 6 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：有丝分裂观察要重视染色、规范装片、细调清晰图像，并结合图像特征识别时期。');
      return;
    }
    if (choice === 'focus-only') {
      markError('不能只说调焦，还要同时覆盖染色、装片和时期识别依据。');
      return;
    }
    markError('不染色会降低图像辨识度，染色是有丝分裂观察的重要步骤之一。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setStainAdded(false);
    setSlideReady(false);
    setFocused(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先完成染色和装片，再切到显微镜视角识别典型分裂时期。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先染色、再装片、后调焦，流程不要乱。',
        '显微图像清晰后再记录分裂时期。',
        '总结时同时覆盖制片、调焦和时期识别依据。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对观察流程。',
        '建议回到装片或调焦步骤，获得清晰图像后再记录。',
      ];

  return (
    <section className="panel playground-panel mitosis-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属高中生物实验页</h2>
          <p>把“染色—装片—调焦—识别时期”串成一条完整观察链，减少只会背流程、不会看图像的割裂感。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 6</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid mitosis-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'slide' ? '装片视角' : '显微视角'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>准备度 {prepValue}</span><div className="chem-meter-bar"><i style={{ width: `${prepValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card mitosis-data-card"><span className="eyebrow">Readout</span><h3>观察结果板</h3><div className="mitosis-data-grid"><div className="mitosis-data-item"><span>染色与装片</span><strong>{slideReady ? '已完成' : stainAdded ? '已染色，待装片' : '待准备'}</strong><small>规范前处理决定后续图像质量。</small></div><div className="mitosis-data-item"><span>显微图像</span><strong>{focused ? '已清晰，可识别时期' : '待调清晰'}</strong><small>只有在图像清晰时，时期判断才可靠。</small></div></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '有丝分裂观察装置'} · 当前重点：{step === 2 ? '染色' : step === 3 ? '装片' : step === 4 ? '调焦' : step === 5 ? '时期识别' : '流程总结'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'slide' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('slide')} type="button">装片</button><button className={cameraPreset === 'microscope' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('microscope')} type="button">显微</button></div></div>

          <div className={`scene-canvas mitosis-stage preset-${cameraPreset}`}>
            <div className="mitosis-stage-head"><div><span className="eyebrow">Live Biology</span><h3>{experiment.curriculum.theme}</h3><p>{promptTone === 'error' ? '当前制片或显微判断有偏差，请先回到规范观察流程。' : '把样本处理和显微识别放进同一条流程里，让学生既记得操作，也看得懂细胞图像。'}</p></div><div className="status-pill-row"><span className="status-pill ready">进度 {progressPercent}%</span><span className="status-pill">图像 {focused ? '已清晰' : '待调清晰'}</span></div></div>
            <div className="mitosis-stage-grid">
              <article className={slideReady ? 'mitosis-card mitosis-three-card active' : 'mitosis-card mitosis-three-card'}><div className="reaction-card-head"><strong>3D 制片区</strong><small>{slideReady ? '装片已完成，可自由旋转查看' : stainAdded ? '已染色，待完成盖片' : '等待染色与制片'}</small></div><MitosisPrepThreeScene cameraPreset={cameraPreset} stainAdded={stainAdded} slideReady={slideReady} /></article>
              <article className={focused ? 'mitosis-card scope-three-card active' : 'mitosis-card scope-three-card'}><div className="reaction-card-head"><strong>3D 显微视野</strong><small>{focused ? '细胞图像已清晰，可观察中期特征' : '等待调焦，当前视野仍不稳定'}</small></div><MitosisScopeThreeScene cameraPreset={cameraPreset} slideReady={slideReady} focused={focused} /></article>
            </div>
            <div className="mitosis-insight-row"><article className="lab-readout-card active"><span>前处理</span><strong>{slideReady ? '染色和装片已完成' : stainAdded ? '已染色' : '待准备'}</strong><small>有丝分裂观察要先保证样本处理规范。</small></article><article className="lab-readout-card calm"><span>显微观察</span><strong>{focused ? '图像清晰' : '待调焦'}</strong><small>清晰图像是识别典型分裂时期的前提。</small></article><article className={focused ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>识别结果</span><strong>{focused ? '可识别典型中期细胞' : '先完成调焦'}</strong><small>要结合图像特征，而不是凭感觉判断分裂时期。</small></article></div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别材料'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleStain('correct')} type="button"><strong>向样本滴加染色液</strong><span>提高后续显微图像辨识度。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleStain('skip')} type="button"><strong>不染色直接观察</strong><span>错误演示：图像特征不清晰。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleSlide('correct')} type="button"><strong>规范完成装片</strong><span>让后续显微观察更稳定清晰。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSlide('rough')} type="button"><strong>随意压片</strong><span>错误演示：影响观察质量。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFocus('fine')} type="button"><strong>细调至图像清晰</strong><span>看清细胞图像后再进行识别。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFocus('blur')} type="button"><strong>图像模糊就开始记录</strong><span>错误演示：证据不足。</span></button></> : null}{step === 5 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button"><strong>记录“识别到典型中期细胞”</strong><span>基于清晰图像完成时期记录。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleRecord('random')} type="button"><strong>随意判断分裂时期</strong><span>错误演示：没有依据。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRecord('unclear')} type="button"><strong>不调清晰就记不出来</strong><span>错误演示：应先完成调焦。</span></button></> : null}{step === 6 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>观察有丝分裂要重视染色、规范装片、细调图像，并结合图像特征识别时期</strong><span>覆盖完整观察流程和识别依据。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('focus-only')} type="button"><strong>只要会调焦就够了</strong><span>错误演示：忽略前处理和时期识别。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-stain')} type="button"><strong>染不染色都没有影响</strong><span>错误演示：与实际观察流程不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>前处理状态：{slideReady ? '已完成' : stainAdded ? '已染色' : '待准备'} / 调焦状态：{focused ? '已完成' : '待调焦'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意规范观察流程'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“观察植物细胞有丝分裂”升级成染色、装片、调焦和时期识别一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
