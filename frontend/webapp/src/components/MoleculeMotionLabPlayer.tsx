import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beaker' | 'plume';
type MaterialId = 'beaker' | 'water' | 'crystal' | 'dropper' | 'tweezers';
type TimelineState = 'done' | 'current' | 'todo';

interface MoleculeMotionLabPlayerProps {
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
  2: '放入高锰酸钾晶体',
  3: '静置观察扩散',
  4: '判断颜色变化',
  5: '总结分子运动',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别烧杯、水、高锰酸钾晶体、滴管和镊子。',
  2: '把晶体轻放入水中，不要剧烈搅拌。',
  3: '静置一段时间，观察紫色逐渐扩散。',
  4: '判断颜色扩散范围和浓淡变化。',
  5: '总结分子在不停地做无规则运动。',
};

const materialLabels: Record<MaterialId, string> = {
  beaker: '烧杯',
  water: '清水',
  crystal: '高锰酸钾晶体',
  dropper: '滴管',
  tweezers: '镊子',
};

const materialOrder: MaterialId[] = ['beaker', 'water', 'crystal', 'dropper', 'tweezers'];

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

export function MoleculeMotionLabPlayer({ experiment, onTelemetry }: MoleculeMotionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [added, setAdded] = useState(false);
  const [diffused, setDiffused] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：轻放晶体并静置，观察紫色扩散。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const plumePercent = diffused ? 82 : added ? 28 : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const diffusionValue = clamp(42 + (added ? 18 : 0) + (diffused ? 20 : 0) + (observationChoice === 'correct' ? 14 : 0), 24, 99);
  const clarityValue = clamp(38 + (cameraPreset !== 'bench' ? 10 : 0) + (diffused ? 16 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (added ? 12 : 0) + (diffused ? 18 : 0), 20, 100);

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
        setCameraPreset('beaker');
        advanceStep(2, '器材识别完成，下一步轻放高锰酸钾晶体。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleAdd = (choice: 'correct' | 'stir') => {
    if (step !== 2 || completed) return;
    if (choice === 'stir') {
      markError('本实验需要静置观察扩散，不能一开始就剧烈搅拌。');
      return;
    }
    setAdded(true);
    appendNote('操作完成：高锰酸钾晶体已轻放入清水底部。');
    advanceStep(3, '晶体已放入，下一步静置观察颜色扩散。');
  };

  const handleDiffuse = (choice: 'still' | 'shake') => {
    if (step !== 3 || completed) return;
    if (!added) {
      markError('请先放入高锰酸钾晶体，再观察扩散。');
      return;
    }
    if (choice === 'shake') {
      markError('摇晃会掩盖分子自然扩散的现象，应保持静置。');
      return;
    }
    setDiffused(true);
    setCameraPreset('plume');
    appendNote('扩散进行：紫色从局部逐渐向周围扩散，范围越来越大。');
    advanceStep(4, '扩散现象已出现，请判断颜色变化。');
  };

  const handleObserve = (choice: 'correct' | 'stay' | 'sink-only') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!diffused) {
      markError('请先静置观察到扩散现象，再进行判断。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：紫色区域不断扩大，说明微粒在不停运动。');
      advanceStep(5, '现象判断正确，最后总结分子运动规律。');
      return;
    }
    if (choice === 'stay') {
      markError('颜色不会始终停留在原处，而会逐渐向周围扩散。');
      return;
    }
    markError('现象不只是下沉，关键是紫色会逐渐向四周扩散。');
  };

  const handleSummary = (choice: 'correct' | 'still' | 'gravity-only') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：构成物质的微粒在不停地做无规则运动，因此会发生扩散。');
      return;
    }
    if (choice === 'still') {
      markError('若分子静止不动，就不会看到颜色自动扩散。');
      return;
    }
    markError('本实验不能只用重力解释，更关键的是分子本身在运动。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setAdded(false);
    setDiffused(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新放入晶体并观察扩散。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['轻放晶体后要静置，不要立刻搅拌。', '观察紫色范围是否逐渐扩大。', '总结时记住“分子在不停运动”。']
    : [stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。', experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对扩散现象。', '建议重新执行“放晶体 → 静置 → 看扩散”的流程。'];

  return (
    <section className="panel playground-panel moleculemotion-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把高锰酸钾在水中的扩散云团做成渐变流动，让“分子不断运动”真正可视化。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid moleculemotion-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'beaker' ? '烧杯观察' : '扩散云团'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>扩散值 {diffusionValue}</span><div className="chem-meter-bar"><i style={{ width: `${diffusionValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card moleculemotion-data-card"><span className="eyebrow">Readout</span><h3>扩散读数板</h3><div className="generic-readout-grid moleculemotion-readout-grid"><article className={added ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>晶体状态</span><strong>{added ? '已放入水中' : '待放入'}</strong><small>{added ? '晶体已到水底开始溶散。' : '先轻放高锰酸钾晶体。'}</small></article><article className={diffused ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>扩散范围</span><strong>{diffused ? `${plumePercent}%` : '--'}</strong><small>{diffused ? '紫色范围已明显向四周扩大。' : '先静置等待扩散。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '分子在不停运动' : '等待总结'}</strong><small>微粒的无规则运动会导致扩散现象。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '分子运动实验装置'} · 当前重点：{step <= 2 ? '轻放晶体' : step === 3 ? '静置观察' : '判断扩散范围'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'beaker' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('beaker')} type="button">烧杯</button><button className={cameraPreset === 'plume' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('plume')} type="button">扩散</button></div></div>

          <div className={`scene-canvas moleculemotion-stage preset-${cameraPreset} ${added ? 'added' : ''} ${diffused ? 'diffused' : ''}`}>
            <div className="moleculemotion-rig">
              <div className="mm-beaker"><div className={added ? 'mm-water active' : 'mm-water'} /><div className={added ? 'mm-crystal active' : 'mm-crystal'} /><div className={diffused ? 'mm-plume active' : 'mm-plume'} /></div>
            </div>
          </div>

          <div className="observation-ribbon moleculemotion-observation-row"><article className={added ? 'observation-chip active' : 'observation-chip calm'}><strong>晶体放置</strong><span>{added ? '高锰酸钾晶体已轻放入水中。' : '先放入晶体。'}</span></article><article className={diffused ? 'observation-chip active' : 'observation-chip calm'}><strong>扩散状态</strong><span>{diffused ? '紫色范围已明显扩大。' : '等待静置扩散。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>颜色变化</strong><span>{observationChoice === 'correct' ? '已判断颜色会逐渐向四周扩散。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAdd('correct')} type="button"><strong>轻放高锰酸钾晶体</strong><span>为观察自然扩散做好准备。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAdd('stir')} type="button"><strong>一放入就剧烈搅拌</strong><span>错误演示：破坏自然扩散观察。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleDiffuse('still')} type="button"><strong>静置观察颜色扩散</strong><span>看紫色范围逐渐扩大。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleDiffuse('shake')} type="button"><strong>端起烧杯反复摇晃</strong><span>错误演示：掩盖自然扩散。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“紫色会逐渐向四周扩散”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('stay')} type="button"><strong>记录“颜色始终停在原处”</strong><span>错误演示：与扩散不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('sink-only')} type="button"><strong>记录“只是一直往下沉，不会扩散”</strong><span>错误演示：忽略关键变化。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>构成物质的微粒在不停地做无规则运动，因此会发生扩散</strong><span>完整总结分子运动现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('still')} type="button"><strong>分子是静止不动的</strong><span>错误演示：与扩散矛盾。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('gravity-only')} type="button"><strong>扩散只是重力造成的</strong><span>错误演示：解释不完整。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{added ? '晶体已放入' : '待放入'} / {diffused ? '已扩散' : '待扩散'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意静置，不要剧烈搅拌'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“分子运动现象”升级成带扩散云团的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
