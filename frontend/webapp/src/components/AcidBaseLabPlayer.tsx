import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'solutions' | 'comparison';
type MaterialId = 'litmus-paper' | 'indicator' | 'dropper' | 'solution-a' | 'solution-b';
type CupId = 'a' | 'b';
type TimelineState = 'done' | 'current' | 'todo';

interface AcidBaseLabPlayerProps {
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
  2: '加入指示剂',
  3: '观察颜色变化',
  4: '比较两种溶液',
  5: '总结判断方法',
};

const acidStepOrder: StepId[] = [1, 2, 3, 4, 5];

const stepPrompts: Record<StepId, string> = {
  1: '先识别试纸、指示剂、滴管和待测溶液，明确本实验要比较的对象。',
  2: '依次给待测溶液 A 和待测溶液 B 加入指示剂，保持加样顺序规范。',
  3: '观察两种溶液的颜色变化，再分别判断酸碱性。',
  4: '根据颜色结果比较两种溶液的酸碱性差异。',
  5: '总结指示剂检验酸碱性的操作流程和判断依据。',
};

const materialLabels: Record<MaterialId, string> = {
  'litmus-paper': '石蕊试纸',
  indicator: '酸碱指示剂',
  dropper: '滴管',
  'solution-a': '待测溶液 A',
  'solution-b': '待测溶液 B',
};

const identifyOrder: MaterialId[] = ['litmus-paper', 'indicator', 'dropper', 'solution-a', 'solution-b'];

const cupFinalState: Record<CupId, { color: string; label: string; ph: number; note: string }> = {
  a: { color: '#ff6f86', label: '红色', ph: 3, note: '指示剂显红，判断为酸性溶液。' },
  b: { color: '#6ea6ff', label: '蓝色', ph: 10, note: '指示剂显蓝，判断为碱性溶液。' },
};

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

export function AcidBaseLabPlayer({ experiment, onTelemetry }: AcidBaseLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [selectedCup, setSelectedCup] = useState<CupId | null>(null);
  const [indicatorDrops, setIndicatorDrops] = useState<Record<CupId, number>>({ a: 0, b: 0 });
  const [colorObserved, setColorObserved] = useState(false);
  const [comparisonChoice, setComparisonChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先识别材料，再按 A / B 两杯溶液依次完成加样与判断。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const indicatorReady = indicatorDrops.a > 0 && indicatorDrops.b > 0;
  const score = Math.max(78, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const safetyValue = clamp(96 - errors * 5, 58, 99);
  const clarityValue = clamp(48 + (indicatorDrops.a > 0 ? 12 : 0) + (indicatorDrops.b > 0 ? 12 : 0) + (colorObserved ? 12 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 34, 99);
  const readinessValue = clamp(progressPercent + (indicatorReady ? 18 : 0) + (comparisonChoice === 'correct' ? 18 : 0), 20, 100);
  const observationQuality = colorObserved ? '现象锁定' : indicatorReady ? '颜色渐显' : '等待加样';
  const aVisual = indicatorDrops.a > 0 ? cupFinalState.a.color : 'rgba(255,255,255,0.14)';
  const bVisual = indicatorDrops.b > 0 ? cupFinalState.b.color : 'rgba(255,255,255,0.14)';

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
      if (next.length === identifyOrder.length) {
        setCameraPreset('solutions');
        advanceStep(2, '识别完成，下一步用滴管向 A、B 两种溶液中规范加入指示剂。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${identifyOrder.length} 项材料，继续检查实验台。`);
      }
      return next;
    });
  };

  const handleSelectCup = (cup: CupId) => {
    if (step !== 2 || completed) return;
    setSelectedCup(cup);
    setPromptTone('info');
    setPrompt(`已选中待测溶液 ${cup.toUpperCase()}，请继续用滴管加入指示剂。`);
  };

  const handleAddIndicator = (mode: 'correct' | 'wrong-order') => {
    if (step !== 2 || completed) return;
    if (!selectedCup) {
      markError('请先选中待测溶液，再加入指示剂。');
      return;
    }
    if (mode === 'wrong-order') {
      markError('加入对象或顺序不规范，请先确认当前杯体再加样。');
      return;
    }

    setIndicatorDrops((current) => {
      const next = { ...current, [selectedCup]: current[selectedCup] + 1 };
      appendNote(`加样记录：向溶液 ${selectedCup.toUpperCase()} 加入指示剂`);
      if (next.a > 0 && next.b > 0) {
        setCameraPreset('comparison');
        advanceStep(3, '两种溶液均已完成加样，观察颜色变化并判断酸碱性。');
      } else {
        setPromptTone('success');
        setPrompt(`溶液 ${selectedCup.toUpperCase()} 已加样，请继续处理另一杯待测溶液。`);
      }
      return next;
    });
  };

  const handleObserve = (choice: 'correct' | 'wrong') => {
    if (step !== 3 || completed) return;
    if (!indicatorReady) {
      markError('请先完成 A、B 两杯溶液的加样，再进行观察。');
      return;
    }
    if (choice === 'wrong') {
      markError('请根据颜色变化分别判断酸性和碱性，不要只记颜色不下判断。');
      return;
    }
    setColorObserved(true);
    appendNote('观察记录：A 显红、B 显蓝，已完成酸碱性判断');
    advanceStep(4, '颜色变化已锁定，现在比较两种溶液的酸碱性差异。');
  };

  const handleCompare = (choice: 'correct' | 'reverse' | 'color-only') => {
    if (step !== 4 || completed) return;
    setComparisonChoice(choice);
    if (!colorObserved) {
      markError('请先完成颜色观察，再比较两种溶液。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'reverse' ? '判断方向反了：A 为酸性，B 为碱性。' : '比较时不能只写颜色，需要把颜色与酸碱性对应起来。');
      return;
    }
    appendNote('比较结论：溶液 A 为酸性，溶液 B 为碱性');
    advanceStep(5, '比较完成，最后总结指示剂检验酸碱性的标准流程。');
  };

  const handleSummary = (choice: 'correct' | 'missing-judge' | 'wrong-method') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (comparisonChoice !== 'correct') {
      markError('请先完成酸碱性比较，再提交总结。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'missing-judge' ? '总结不完整：需要把加样、观察和判断三部分都说清楚。' : '方法错误：不能跳过观察现象直接判断酸碱性。');
      return;
    }
    advanceStep(null, experiment.feedback.successSummary);
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSelectedCup(null);
    setIndicatorDrops({ a: 0, b: 0 });
    setColorObserved(false);
    setComparisonChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先识别材料，再按 A / B 两杯溶液依次完成加样与判断。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先确认杯体，再用滴管加样，避免把 A / B 溶液顺序混淆。',
        '颜色记录必须转换成酸碱性判断，不能停留在“红色 / 蓝色”。',
        '比较两种溶液时要形成 A 对 A、B 对 B 的对应关系。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对颜色和判断关系。',
        '建议先锁定 A、B 两杯的颜色结果，再继续提交比较或总结。',
      ];
  const acidWorkbenchStatus =
    step === 1
      ? '先识别试纸、指示剂、滴管和两杯待测溶液，明确比较对象。'
      : step === 2
        ? '先选中 A 或 B，再用滴管规范加样，保持顺序清晰。'
        : step === 3
          ? '观察 A 红、B 蓝的显色结果，并把颜色转换成酸碱性判断。'
          : step === 4
            ? '根据显色结果输出比较结论，不能只停留在颜色描述。'
            : completed
              ? '实验完成，可继续复盘加样、观察、判断和比较的完整流程。'
              : '总结时要把加样、显色、判断和比较四步说完整。';
  const acidCompletionCopy = completed
    ? '实验已完成，当前版本支持材料识别、双杯加样、显色判断、酸碱比较和方法总结。'
    : '当前还未完成最终总结，请先把颜色结果和酸碱结论建立对应关系。';
  const selectedCupLabel = selectedCup ? selectedCup.toUpperCase() : '未选择';
  const latestLabNote = labNotes[0] ?? '实验已载入：先识别材料，再按 A / B 两杯溶液依次完成加样与判断。';

  return (
    <section className="panel playground-panel acid-lab-panel acid-stage-first-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学检验页</h2>
          <p>把加样、显色、比较和记录收回到舞台下方工作台，让化学实验更像真实检验流程。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid acid-grid">
        <aside className="playground-side acid-side-rail acid-side-rail-left">
          <section className="info-card acid-rail-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>环境</strong>
                  <span>{experiment.scene.environment}</span>
                </div>
                <span className="badge">化学</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜头</strong>
                  <span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'solutions' ? '加样视角' : '比较视角'}</span>
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

          <section className="info-card acid-rail-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>安全值 {safetyValue}</span><div className="chem-meter-bar"><i style={{ width: `${safetyValue}%` }} /></div></div>
              <div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
        </aside>

        <section className="scene-panel acid-workbench-stage">
          <div className="scene-toolbar acid-workbench-toolbar">
            <div className="acid-toolbar-head">
              <div className="acid-toolbar-kicker">酸碱检验工作台</div>
              <strong>{experiment.title}</strong>
              <p className="acid-toolbar-copy">顶部只保留轻量步骤信息，所有关键操作和记录都放到实验台下方，不遮挡双杯显色台。</p>
            </div>
            <div className="camera-actions acid-camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'solutions' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('solutions')} type="button">加样</button>
              <button className={cameraPreset === 'comparison' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('comparison')} type="button">比较</button>
            </div>
          </div>

          <div className="scene-meta-strip acid-stage-meta">
            <div className={`acid-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>
                步骤 {step} · {stepTitles[step]}
              </strong>
              <p>{prompt}</p>
            </div>
            <div className="acid-step-pills" aria-label="实验步骤概览">
              {acidStepOrder.map((stepId) => (
                <span className={step === stepId ? 'acid-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'acid-step-pill done' : 'acid-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className={`scene-canvas acid-stage preset-${cameraPreset}`}>
            <div className="acid-bench-caustic" />
            <div className="acid-stage-grid">
              <article className={selectedCup === 'a' ? 'solution-station active' : 'solution-station'}>
                <div className="solution-station-head">
                  <strong>待测溶液 A</strong>
                  <small>{selectedCup === 'a' ? '当前选中' : '待操作'}</small>
                </div>
                <div className={indicatorDrops.a > 0 ? 'solution-cup-shell active' : 'solution-cup-shell'}>
                  <div className="solution-rim" />
                  <div className="solution-inner-glass" />
                  <div className="solution-reflection" />
                  <div className={indicatorDrops.a > 0 ? 'solution-caustic active' : 'solution-caustic'} />
                  <div className="solution-liquid" style={{ background: aVisual, height: `${indicatorDrops.a > 0 ? 62 : 46}%` }} />
                  <div className={indicatorDrops.a > 0 ? 'solution-meniscus active' : 'solution-meniscus'} />
                  <div className={selectedCup === 'a' || indicatorDrops.a > 0 ? 'solution-ripple active' : 'solution-ripple'} />
                  <div className={indicatorDrops.a > 0 ? 'solution-glow active' : 'solution-glow'} />
                </div>
                <div className="solution-meta-row">
                  <span>滴加次数 {indicatorDrops.a}</span>
                  <span>{indicatorDrops.a > 0 ? cupFinalState.a.label : '未显色'}</span>
                </div>
              </article>

              <article className={selectedCup === 'b' ? 'solution-station active' : 'solution-station'}>
                <div className="solution-station-head">
                  <strong>待测溶液 B</strong>
                  <small>{selectedCup === 'b' ? '当前选中' : '待操作'}</small>
                </div>
                <div className={indicatorDrops.b > 0 ? 'solution-cup-shell active' : 'solution-cup-shell'}>
                  <div className="solution-rim" />
                  <div className="solution-inner-glass" />
                  <div className="solution-reflection" />
                  <div className={indicatorDrops.b > 0 ? 'solution-caustic active' : 'solution-caustic'} />
                  <div className="solution-liquid" style={{ background: bVisual, height: `${indicatorDrops.b > 0 ? 62 : 46}%` }} />
                  <div className={indicatorDrops.b > 0 ? 'solution-meniscus active' : 'solution-meniscus'} />
                  <div className={selectedCup === 'b' || indicatorDrops.b > 0 ? 'solution-ripple active' : 'solution-ripple'} />
                  <div className={indicatorDrops.b > 0 ? 'solution-glow active' : 'solution-glow'} />
                </div>
                <div className="solution-meta-row">
                  <span>滴加次数 {indicatorDrops.b}</span>
                  <span>{indicatorDrops.b > 0 ? cupFinalState.b.label : '未显色'}</span>
                </div>
              </article>

              <article className={indicatorReady ? 'solution-station tool-tray active' : 'solution-station tool-tray'}>
                <div className="solution-station-head">
                  <strong>加样工作位</strong>
                  <small>{selectedCup ? `当前对准 ${selectedCup.toUpperCase()} 杯` : '等待选择杯体'}</small>
                </div>
                <div className="acid-tool-tray">
                  <div className="acid-tool-gloss" />
                  <div className={selectedCup ? 'dropper-tool active' : 'dropper-tool'}>
                    <span className="dropper-bulb" />
                    <span className="dropper-stem" />
                    <span className={selectedCup ? 'dropper-front active' : 'dropper-front'} />
                    <span className={selectedCup ? 'dropper-tip active' : 'dropper-tip'} />
                  </div>
                  <div className={indicatorReady ? 'indicator-vial active' : 'indicator-vial'}>
                    <span className="indicator-rim" />
                    <span className="indicator-glass" />
                    <span className="indicator-cap" />
                    <span className="indicator-fill" />
                    <span className="indicator-meniscus" />
                  </div>
                  <div className="litmus-rack">
                    <span className="litmus-rack-shadow" />
                    <span className="litmus-strip left" />
                    <span className="litmus-strip right" />
                  </div>
                  <div className={indicatorReady ? 'droplet-cluster titration-drops active' : 'droplet-cluster titration-drops'}>
                    <span className="droplet-dot dot-1" />
                    <span className="droplet-dot dot-2" />
                    <span className="droplet-dot dot-3" />
                    <span className="droplet-dot dot-4" />
                  </div>
                </div>
                <div className="solution-meta-row">
                  <span>{indicatorReady ? '指示剂已完成双杯滴加' : '保持 A / B 分杯加样'}</span>
                  <span>{colorObserved ? '显色已锁定' : '等待显色'}</span>
                </div>
              </article>
            </div>
          </div>

          <div className="workbench-inline-dock acid-workbench-dock">
            <div className="acid-status-grid">
              <div className={`info-card acid-status-card tone-${promptTone}`}>
                <span>当前进度</span>
                <strong>
                  步骤 {step} · {stepTitles[step]}
                </strong>
                <p>{acidWorkbenchStatus}</p>
              </div>
              <div className="info-card acid-status-card">
                <span>加样状态</span>
                <strong>{indicatorReady ? 'A / B 都已完成' : '等待双杯加样'}</strong>
                <p>当前杯体 {selectedCupLabel} · A {indicatorDrops.a} 次 / B {indicatorDrops.b} 次</p>
              </div>
              <div className={`info-card acid-status-card ${comparisonChoice === 'correct' ? 'tone-success' : ''}`.trim()}>
                <span>显色与判断</span>
                <strong>{colorObserved ? 'A 红 / B 蓝' : observationQuality}</strong>
                <p>{comparisonChoice === 'correct' ? 'A 酸 / B 碱' : '等待完成比较结论'}</p>
              </div>
              <div className="info-card acid-status-card">
                <span>实验指标</span>
                <strong>完成度 {readinessValue}% · 得分 {score}</strong>
                <p>安全值 {safetyValue} · 清晰度 {clarityValue}</p>
              </div>
            </div>

            <div className="acid-inline-workbench">
              <section className="info-card acid-inline-panel acid-workbench-actions">
                <span className="eyebrow">Actions</span>
                <h3>当前步骤操作</h3>
                <div className="summary-stack generic-choice-stack">
                  {step === 1 ? identifyOrder.map((materialId) => (
                    <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button">
                      <strong>识别 {materialLabels[materialId]}</strong>
                      <span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别材料'}</span>
                    </button>
                  )) : null}

                  {step === 2 ? (
                    <>
                      <button className={selectedCup === 'a' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleSelectCup('a')} type="button">
                        <strong>选中溶液 A</strong>
                        <span>先选杯体，再开始加样。</span>
                      </button>
                      <button className={selectedCup === 'b' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleSelectCup('b')} type="button">
                        <strong>选中溶液 B</strong>
                        <span>保持 A / B 加样顺序清晰。</span>
                      </button>
                      <button className="summary-choice generic-choice primary" onClick={() => handleAddIndicator('correct')} type="button">
                        <strong>用滴管加入指示剂</strong>
                        <span>规范完成当前杯体加样。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleAddIndicator('wrong-order')} type="button">
                        <strong>随意加样</strong>
                        <span>错误演示：对象和顺序不规范。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 3 ? (
                    <>
                      <button className="summary-choice generic-choice primary" onClick={() => handleObserve('correct')} type="button">
                        <strong>记录 A 红、B 蓝</strong>
                        <span>完成显色观察并判断酸碱性。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleObserve('wrong')} type="button">
                        <strong>只记“颜色变化明显”</strong>
                        <span>错误演示：只有现象，没有判断。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 4 ? (
                    <>
                      <button className={comparisonChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleCompare('correct')} type="button">
                        <strong>溶液 A 为酸性，溶液 B 为碱性</strong>
                        <span>根据显色结果输出正确比较结论。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleCompare('reverse')} type="button">
                        <strong>溶液 A 为碱性，溶液 B 为酸性</strong>
                        <span>错误演示：把酸碱性方向判断反了。</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleCompare('color-only')} type="button">
                        <strong>A 红、B 蓝</strong>
                        <span>只说颜色，不完成酸碱性比较。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 5 ? (
                    <>
                      <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                        <strong>先加指示剂，再看颜色变化，最后判断并比较酸碱性</strong>
                        <span>完整覆盖了加样、观察、判断和比较。</span>
                      </button>
                      <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('missing-judge')} type="button">
                        <strong>向溶液中滴加指示剂，看颜色就结束</strong>
                        <span>缺少酸碱性判断和比较结论。</span>
                      </button>
                      <button className="summary-choice generic-choice danger" onClick={() => handleSummary('wrong-method')} type="button">
                        <strong>不加指示剂，直接凭颜色判断酸碱性</strong>
                        <span>方法错误，不符合实验规范。</span>
                      </button>
                    </>
                  ) : null}
                </div>
                <div className="button-stack">
                  <button className="action-button ghost" onClick={handleReset} type="button">重新开始</button>
                </div>
              </section>

              <section className="info-card acid-inline-panel acid-log-panel">
                <span className="eyebrow">Notebook</span>
                <h3>实验记录</h3>
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
            </div>
          </div>
        </section>

        <aside className="playground-side acid-side-rail acid-side-rail-right">
          <section className="info-card acid-rail-card acid-data-card">
            <span className="eyebrow">Readout</span>
            <h3>检验结果板</h3>
            <div className="acid-data-grid">
              <div className="acid-data-item">
                <span>溶液 A</span>
                <strong>{indicatorDrops.a > 0 ? `${cupFinalState.a.label} · pH ${cupFinalState.a.ph}` : '待加样'}</strong>
                <small>{indicatorDrops.a > 0 ? cupFinalState.a.note : '先加入指示剂后再观察。'}</small>
              </div>
              <div className="acid-data-item">
                <span>溶液 B</span>
                <strong>{indicatorDrops.b > 0 ? `${cupFinalState.b.label} · pH ${cupFinalState.b.ph}` : '待加样'}</strong>
                <small>{indicatorDrops.b > 0 ? cupFinalState.b.note : '保持 A / B 的加样对应关系。'}</small>
              </div>
            </div>
            <div className="acid-mini-metrics">
              <div className="acid-mini-metric">
                <span>当前杯体</span>
                <strong>{selectedCupLabel}</strong>
              </div>
              <div className="acid-mini-metric">
                <span>最新记录</span>
                <strong>{latestLabNote}</strong>
              </div>
            </div>
          </section>

          <section className="info-card acid-rail-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>核心状态：A {indicatorDrops.a > 0 ? '已加样' : '待加样'} / B {indicatorDrops.b > 0 ? '已加样' : '待加样'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意实验规范'}</li>
            </ul>
          </section>

          <section className="info-card acid-rail-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={completed ? 'info-card success-card acid-rail-card' : 'info-card acid-rail-card'}>
            <strong>完成状态</strong>
            <p>{acidCompletionCopy}</p>
          </section>
        </aside>
      </div>
    </section>
  );
}
