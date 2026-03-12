import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'cells' | 'microscope';
type MaterialId = 'sample-a' | 'sample-b' | 'solution-low' | 'solution-high' | 'microscope';
type TimelineState = 'done' | 'current' | 'todo';

interface OsmosisLabPlayerProps {
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
  2: '设置实验组与对照组',
  3: '切换观察视角',
  4: '记录细胞变化',
  5: '总结渗透规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别样本、低浓度溶液、高浓度溶液和显微镜。',
  2: '把样本分别置于不同浓度溶液中，形成明确对照。',
  3: '切换到显微观察视角，对比细胞状态变化。',
  4: '根据显微现象记录吸水和失水结果。',
  5: '把浓度差和细胞吸水、失水方向联系起来总结。',
};

const materialLabels: Record<MaterialId, string> = {
  'sample-a': '样本 A',
  'sample-b': '样本 B',
  'solution-low': '低浓度溶液',
  'solution-high': '高浓度溶液',
  microscope: '显微镜',
};

const materialOrder: MaterialId[] = ['sample-a', 'sample-b', 'solution-low', 'solution-high', 'microscope'];

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

export function OsmosisLabPlayer({ experiment, onTelemetry }: OsmosisLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [groupsReady, setGroupsReady] = useState(false);
  const [viewSwitched, setViewSwitched] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先建立不同浓度对照，再切到显微视角比较细胞变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const lowState = viewSwitched ? '吸水膨胀' : groupsReady ? '待显微观察' : '待设置';
  const highState = viewSwitched ? '失水皱缩' : groupsReady ? '待显微观察' : '待设置';
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const compareValue = clamp(42 + (groupsReady ? 20 : 0) + (viewSwitched ? 22 : 0), 24, 99);
  const clarityValue = clamp(48 + (viewSwitched ? 20 : 0), 34, 99);
  const readinessValue = clamp(progressPercent + (groupsReady ? 16 : 0) + (viewSwitched ? 18 : 0), 22, 100);

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
        setCameraPreset('cells');
        advanceStep(2, '材料识别完成，下一步把样本分别置于不同浓度溶液中。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个材料，请继续。`);
      }
      return next;
    });
  };

  const handleGroup = (choice: 'correct' | 'same') => {
    if (step !== 2 || completed) return;
    if (choice === 'same') {
      markError('实验组和对照组必须有清晰浓度差，不能放在同一种条件里。');
      return;
    }
    setGroupsReady(true);
    appendNote('对照设置：样本 A 放入低浓度溶液，样本 B 放入高浓度溶液。');
    setCameraPreset('microscope');
    advanceStep(3, '实验组与对照组已设置完成，下一步切到显微镜视角观察细胞。');
  };

  const handleView = (choice: 'switch' | 'skip') => {
    if (step !== 3 || completed) return;
    if (!groupsReady) {
      markError('请先建立不同浓度的实验组与对照组。');
      return;
    }
    if (choice === 'skip') {
      markError('需要先切换到显微观察视角，才能看清细胞变化。');
      return;
    }
    setViewSwitched(true);
    appendNote('显微观察：低浓度组细胞更饱满，高浓度组细胞出现失水现象。');
    advanceStep(4, '显微观察完成，下一步记录细胞吸水和失水结果。');
  };

  const handleRecord = (choice: 'correct' | 'same' | 'reverse') => {
    if (step !== 4 || completed) return;
    if (!viewSwitched) {
      markError('请先切换到显微观察视角，再记录细胞变化。');
      return;
    }
    if (choice === 'correct') {
      appendNote('结果记录：低浓度组细胞吸水，高浓度组细胞失水。');
      advanceStep(5, '记录完成，下一步总结浓度差与水分移动方向。');
      return;
    }
    if (choice === 'same') {
      markError('两组细胞变化并不相同，必须根据显微现象区分吸水和失水。');
      return;
    }
    markError('结果不能记反：低浓度组吸水，高浓度组失水。');
  };

  const handleSummary = (choice: 'correct' | 'same-direction' | 'high-water') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：细胞周围溶液浓度不同，会导致水分通过渗透作用进出细胞。');
      return;
    }
    if (choice === 'same-direction') {
      markError('不同浓度条件下水分移动方向并不相同，要根据浓度差判断。');
      return;
    }
    markError('高浓度环境通常会让细胞失水，不是继续大量吸水。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setGroupsReady(false);
    setViewSwitched(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先建立不同浓度对照，再切到显微视角比较细胞变化。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '要先建立高低浓度两组条件，才能形成有效对照。',
        '显微视角是观察细胞吸水和失水的关键环节。',
        '总结时要把浓度差和水分移动方向对应起来。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对浓度差和结果。',
        '建议重新观察低浓度组和高浓度组的显微现象，再记录。',
      ];

  return (
    <section className="panel playground-panel osmosis-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属高中生物实验页</h2>
          <p>把“浓度差—显微观察—吸水失水结论”打通到一个连续场景里，让渗透规律更容易理解和回忆。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid osmosis-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'cells' ? '样本视角' : '显微视角'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>比较度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card osmosis-data-card"><span className="eyebrow">Readout</span><h3>细胞变化板</h3><div className="osmosis-data-grid"><div className="osmosis-data-item"><span>低浓度组</span><strong>{lowState}</strong><small>细胞更容易吸水，状态更饱满。</small></div><div className="osmosis-data-item"><span>高浓度组</span><strong>{highState}</strong><small>细胞更容易失水，出现皱缩现象。</small></div></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '渗透装置'} · 当前重点：{step === 2 ? '浓度对照' : step === 3 ? '显微视角' : step === 4 ? '吸水失水' : '渗透规律'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'cells' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('cells')} type="button">样本</button><button className={cameraPreset === 'microscope' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('microscope')} type="button">显微</button></div></div>

          <div className={`scene-canvas osmosis-stage preset-${cameraPreset}`}>
            <div className="osmosis-stage-head"><div><span className="eyebrow">Live Biology</span><h3>{experiment.curriculum.theme}</h3><p>{promptTone === 'error' ? '当前对照或显微判断有偏差，请先回到细胞现象本身。' : '把高低浓度两组和显微结果放在一起看，帮助学生理解水分进出细胞的方向。'}</p></div><div className="status-pill-row"><span className="status-pill ready">进度 {progressPercent}%</span><span className="status-pill">显微观察 {viewSwitched ? '已完成' : '待切换'}</span></div></div>
            <div className="osmosis-stage-grid">
              <article className={groupsReady ? 'osmosis-card active' : 'osmosis-card'}><div className="reaction-card-head"><strong>高低浓度对照</strong><small>{groupsReady ? '对照已建立' : '等待设置'}</small></div><div className="osmosis-cup-row"><div className="osmosis-cup low"><span>低浓度</span><i className={groupsReady ? 'sample-chip active' : 'sample-chip'} /></div><div className="osmosis-cup high"><span>高浓度</span><i className={groupsReady ? 'sample-chip active' : 'sample-chip'} /></div></div></article>
              <article className={viewSwitched ? 'osmosis-card active' : 'osmosis-card'}><div className="reaction-card-head"><strong>显微观察区</strong><small>{viewSwitched ? '细胞变化已清晰呈现' : '等待切换'}</small></div><div className="cell-compare-panel"><div className="cell-frame turgid"><div className={viewSwitched ? 'cell-wall active' : 'cell-wall'} /><div className={viewSwitched ? 'cell-core turgid active' : 'cell-core'} /></div><div className="cell-frame plasmolyzed"><div className={viewSwitched ? 'cell-wall active' : 'cell-wall'} /><div className={viewSwitched ? 'cell-core plasmolyzed active' : 'cell-core'} /></div></div></article>
            </div>
            <div className="osmosis-insight-row"><article className="lab-readout-card active"><span>对照设置</span><strong>{groupsReady ? '高低浓度已分组' : '待建立'}</strong><small>清晰的浓度差是观察渗透作用的前提。</small></article><article className="lab-readout-card calm"><span>显微现象</span><strong>{viewSwitched ? '吸水与失水差异已出现' : '待观察'}</strong><small>显微镜能帮助看清细胞形态变化。</small></article><article className={viewSwitched ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>核心规律</span><strong>{viewSwitched ? '低浓度吸水 / 高浓度失水' : '先完成显微观察'}</strong><small>浓度差会决定细胞周围水分移动方向。</small></article></div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别材料'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleGroup('correct')} type="button"><strong>样本 A 放低浓度，样本 B 放高浓度</strong><span>建立清晰的实验组与对照组。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleGroup('same')} type="button"><strong>两个样本放同一种浓度</strong><span>错误演示：没有形成对照。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleView('switch')} type="button"><strong>切到显微镜视角</strong><span>观察细胞吸水和失水的差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleView('skip')} type="button"><strong>不看显微镜直接下结论</strong><span>错误演示：缺少关键证据。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button"><strong>记录“低浓度吸水，高浓度失水”</strong><span>这是本实验的正确结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleRecord('same')} type="button"><strong>记录“两组变化一样”</strong><span>错误演示：忽略显微差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRecord('reverse')} type="button"><strong>记录“低浓度失水，高浓度吸水”</strong><span>错误演示：把方向记反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>不同浓度条件会让水分通过渗透作用进出细胞，导致吸水或失水</strong><span>把浓度差和细胞变化完整对应起来。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('same-direction')} type="button"><strong>不管浓度如何，水分总是朝同一方向移动</strong><span>错误演示：忽略条件差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('high-water')} type="button"><strong>高浓度环境会让细胞吸更多水</strong><span>错误演示：与观察结果相反。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>对照状态：{groupsReady ? '已建立' : '待建立'} / 显微状态：{viewSwitched ? '已观察' : '待观察'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意浓度对照'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“植物细胞吸水和失水”升级成浓度对照、显微观察和规律总结一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
