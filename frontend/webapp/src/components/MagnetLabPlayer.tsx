import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'desk' | 'poles' | 'barrier';
type MaterialId = 'bar-magnet' | 'paper-clips' | 'coin-set' | 'wood-block' | 'glass-sheet';
type TestItemId = 'clips' | 'coin' | 'wood';
type TimelineState = 'done' | 'current' | 'todo';

interface MagnetLabPlayerProps {
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
  2: '测试吸引现象',
  3: '观察磁极现象',
  4: '隔物吸铁',
  5: '总结规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别条形磁铁、回形针、硬币、木块和透明隔板。',
  2: '用磁铁逐个测试不同物体，比较哪些会被吸引。',
  3: '重点比较磁铁两端和中间的吸附效果。',
  4: '切换到隔物实验，观察隔着透明板是否仍能吸铁。',
  5: '把吸引对象、磁极现象和隔物吸铁三点归纳成结论。',
};

const materialLabels: Record<MaterialId, string> = {
  'bar-magnet': '条形磁铁',
  'paper-clips': '回形针',
  'coin-set': '硬币组',
  'wood-block': '木块',
  'glass-sheet': '透明隔板',
};

const materialOrder: MaterialId[] = ['bar-magnet', 'paper-clips', 'coin-set', 'wood-block', 'glass-sheet'];
const testLabels: Record<TestItemId, string> = { clips: '回形针', coin: '硬币组', wood: '木块' };

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

export function MagnetLabPlayer({ experiment, onTelemetry }: MagnetLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [testedItems, setTestedItems] = useState<Record<TestItemId, boolean>>({ clips: false, coin: false, wood: false });
  const [selectedItem, setSelectedItem] = useState<TestItemId | null>(null);
  const [poleObserved, setPoleObserved] = useState(false);
  const [barrierObserved, setBarrierObserved] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('desk');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先测试哪些物体会被吸引，再观察磁极和隔物吸铁现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const testedCount = Object.values(testedItems).filter(Boolean).length;
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const coverageValue = clamp(42 + testedCount * 14 + (poleObserved ? 14 : 0) + (barrierObserved ? 12 : 0), 26, 99);
  const accuracyValue = clamp(94 - errors * 6, 52, 99);
  const readinessValue = clamp(progressPercent + testedCount * 8 + (poleObserved ? 12 : 0) + (barrierObserved ? 12 : 0), 22, 100);

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
      appendNote(`器材识别：${materialLabels[materialId]}`);
      if (next.length === materialOrder.length) {
        advanceStep(2, '器材识别完成，下一步逐个测试不同物体是否会被磁铁吸引。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个对象，请继续。`);
      }
      return next;
    });
  };

  const handleTest = (item: TestItemId) => {
    if (step !== 2 || completed) return;
    setSelectedItem(item);
    setTestedItems((current) => {
      const next = { ...current, [item]: true };
      appendNote(`测试记录：已比较磁铁对${testLabels[item]}的作用。`);
      const nextCount = Object.values(next).filter(Boolean).length;
      if (nextCount === 3) {
        setCameraPreset('poles');
        advanceStep(3, '三种物体已测试完成，下一步比较磁铁两端和中间的吸附差异。');
      } else {
        setPromptTone('success');
        setPrompt(`已完成 ${nextCount}/3 项测试，请继续比较其余物体。`);
      }
      return next;
    });
  };

  const handlePoles = (choice: 'ends' | 'middle') => {
    if (step !== 3 || completed) return;
    if (choice === 'ends') {
      setPoleObserved(true);
      setCameraPreset('barrier');
      appendNote('规律观察：磁铁两端更容易吸住回形针。');
      advanceStep(4, '磁极现象已确认，下一步观察隔着透明板是否仍能吸铁。');
      return;
    }
    markError('磁铁通常在两端磁性更明显，不是中间最强。');
  };

  const handleBarrier = (choice: 'through' | 'blocked') => {
    if (step !== 4 || completed) return;
    if (choice === 'through') {
      setBarrierObserved(true);
      appendNote('隔物观察：隔着透明板仍能吸住回形针。');
      advanceStep(5, '隔物吸铁已观察完成，下一步总结磁铁的基本性质。');
      return;
    }
    markError('透明隔板不会完全阻断磁铁对回形针的吸引作用。');
  };

  const handleSummary = (choice: 'correct' | 'all-metals' | 'middle') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：磁铁能吸引部分物体，两端磁性更明显，还能隔着透明板吸铁。');
      return;
    }
    if (choice === 'all-metals') {
      markError('不是所有物体都会被磁铁吸引，本实验中木块就不会被吸引。');
      return;
    }
    markError('结论应强调“两端更明显”，而不是中间最强。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setTestedItems({ clips: false, coin: false, wood: false });
    setSelectedItem(null);
    setPoleObserved(false);
    setBarrierObserved(false);
    setSummaryChoice('');
    setCameraPreset('desk');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先测试哪些物体会被吸引，再观察磁极和隔物吸铁现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '测试时要逐个比较不同物体，不能只看一种。',
        '观察磁极时，把注意力放在条形磁铁两端。',
        '隔物实验要记得比较“有隔板”和“无隔板”的结果。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对实验现象。',
        '建议重新完成比较，再根据观察结果总结规律。',
      ];

  return (
    <section className="panel playground-panel magnet-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属小学科学实验页</h2><p>把“能不能吸、哪里更强、隔着还能不能吸”串成一条完整探索链，让小学科学更像可玩的产品。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>

      <div className="playground-grid magnet-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">小学科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'desk' ? '桌面总览' : cameraPreset === 'poles' ? '磁极视角' : '隔物视角'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>覆盖度 {coverageValue}</span><div className="chem-meter-bar"><i style={{ width: `${coverageValue}%` }} /></div></div><div className="chem-meter"><span>准确率 {accuracyValue}</span><div className="chem-meter-bar"><i style={{ width: `${accuracyValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card magnet-data-card"><span className="eyebrow">Readout</span><h3>测试结果板</h3><div className="magnet-data-grid"><div className="magnet-data-item"><span>回形针</span><strong>{testedItems.clips ? '被吸引' : '待测试'}</strong><small>磁铁靠近后会明显被吸住。</small></div><div className="magnet-data-item"><span>硬币组</span><strong>{testedItems.coin ? '吸引不明显' : '待测试'}</strong><small>需根据实验结果区分，不要想当然。</small></div><div className="magnet-data-item"><span>木块</span><strong>{testedItems.wood ? '不被吸引' : '待测试'}</strong><small>木块通常不会被磁铁吸引。</small></div></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '磁铁实验台'} · 当前重点：{step === 2 ? '逐个测试' : step === 3 ? '磁极差异' : step === 4 ? '隔物吸铁' : '基本性质'}</small></div><div className="camera-actions"><button className={cameraPreset === 'desk' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('desk')} type="button">桌面</button><button className={cameraPreset === 'poles' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('poles')} type="button">磁极</button><button className={cameraPreset === 'barrier' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('barrier')} type="button">隔板</button></div></div>

          <div className={`scene-canvas magnet-stage preset-${cameraPreset}`}>
            <div className="magnet-stage-head"><div><span className="eyebrow">Live Science</span><h3>{experiment.curriculum.theme}</h3><p>{promptTone === 'error' ? '当前比较或规律判断有偏差，请根据现象修正。' : '把“吸得住什么”“哪里吸得更强”“隔着还能不能吸”做成连续探索。'}</p></div><div className="status-pill-row"><span className="status-pill ready">进度 {progressPercent}%</span><span className="status-pill">已测 {testedCount}/3</span></div></div>
            <div className="magnet-stage-grid">
              <article className={testedCount > 0 ? 'magnet-card active' : 'magnet-card'}><div className="reaction-card-head"><strong>桌面对比区</strong><small>{selectedItem ? `当前对象：${testLabels[selectedItem]}` : '等待测试'}</small></div><div className="magnet-bench"><div className={poleObserved ? 'bar-magnet-body observed' : 'bar-magnet-body'}><span className="pole-cap left" /><span className="pole-cap right" /></div><div className={testedItems.clips ? 'test-chip clips attracted' : 'test-chip clips'}>回形针</div><div className={testedItems.coin ? 'test-chip coin tested' : 'test-chip coin'}>硬币</div><div className={testedItems.wood ? 'test-chip wood tested' : 'test-chip wood'}>木块</div></div></article>
              <article className={barrierObserved ? 'magnet-card active' : 'magnet-card'}><div className="reaction-card-head"><strong>隔物吸铁区</strong><small>{barrierObserved ? '现象已确认' : '等待观察'}</small></div><div className="barrier-bench"><div className="barrier-magnet" /><div className="glass-barrier" /><div className={barrierObserved ? 'clip-chain active' : 'clip-chain'} /></div></article>
            </div>
            <div className="magnet-insight-row"><article className="lab-readout-card active"><span>吸引对象</span><strong>{testedCount === 3 ? '三类物体已比较' : '待完成对比'}</strong><small>先逐个测试，才知道哪些物体会被吸引。</small></article><article className="lab-readout-card calm"><span>磁极现象</span><strong>{poleObserved ? '两端更明显' : '待比较'}</strong><small>条形磁铁两端通常更容易吸附回形针。</small></article><article className={barrierObserved ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>隔物吸铁</span><strong>{barrierObserved ? '隔板后仍能吸住' : '待观察'}</strong><small>透明隔板不会完全阻断磁铁对回形针的吸引。</small></article></div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别材料'}</span></button>)) : null}{step === 2 ? <><button className={testedItems.clips ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleTest('clips')} type="button"><strong>测试回形针</strong><span>观察是否会被磁铁吸住。</span></button><button className={testedItems.coin ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleTest('coin')} type="button"><strong>测试硬币组</strong><span>比较硬币与磁铁的作用结果。</span></button><button className={testedItems.wood ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleTest('wood')} type="button"><strong>测试木块</strong><span>比较非金属材料的结果。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePoles('ends')} type="button"><strong>记录“两端更容易吸住回形针”</strong><span>正确观察磁极现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePoles('middle')} type="button"><strong>记录“中间最强”</strong><span>错误演示：忽略两端差异。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleBarrier('through')} type="button"><strong>记录“隔着透明板仍能吸铁”</strong><span>完成隔物实验观察。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleBarrier('blocked')} type="button"><strong>记录“隔着就完全不能吸”</strong><span>错误演示：与现象不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>磁铁能吸引部分物体，两端磁性更明显，还能隔物吸铁</strong><span>把三个观察点整合成完整结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('all-metals')} type="button"><strong>所有物体都会被磁铁吸引</strong><span>错误演示：没有基于实验结果判断。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('middle')} type="button"><strong>磁铁中间最强</strong><span>错误演示：与磁极观察矛盾。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>实验状态：已测 {testedCount}/3 / 磁极 {poleObserved ? '已观察' : '待观察'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意比较多个对象'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“磁铁的基本性质”升级成物体对比、磁极观察和隔物实验一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
