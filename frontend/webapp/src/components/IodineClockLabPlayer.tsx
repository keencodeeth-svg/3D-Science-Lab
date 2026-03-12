import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'beaker' | 'timer';
type MaterialId = 'beaker' | 'solution-a' | 'solution-b' | 'starch' | 'timer';
type TimelineState = 'done' | 'current' | 'todo';

interface IodineClockLabPlayerProps {
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
  2: '倒入两种溶液',
  3: '开始混合计时',
  4: '观察瞬间变蓝',
  5: '总结碘钟现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别烧杯、无色溶液 A、无色溶液 B、淀粉指示剂和计时器。',
  2: '将两种无色溶液和淀粉指示剂倒入同一烧杯中。',
  3: '快速搅拌并启动计时，观察短暂等待阶段。',
  4: '观察溶液是否在延迟后突然整体变成深蓝色。',
  5: '总结碘钟反应中“先无色，后突然变蓝”的特点。',
};

const materialLabels: Record<MaterialId, string> = {
  beaker: '烧杯',
  'solution-a': '无色溶液 A',
  'solution-b': '无色溶液 B',
  starch: '淀粉指示剂',
  timer: '计时器',
};

const materialOrder: MaterialId[] = ['beaker', 'solution-a', 'solution-b', 'starch', 'timer'];

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

export function IodineClockLabPlayer({ experiment, onTelemetry }: IodineClockLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [solutionsPoured, setSolutionsPoured] = useState(false);
  const [mixed, setMixed] = useState(false);
  const [clockTriggered, setClockTriggered] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过混合、计时和突变显色观察碘钟反应。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const timingValue = clamp(24 + (solutionsPoured ? 16 : 0) + (mixed ? 22 : 0) + (clockTriggered ? 20 : 0), 20, 99);
  const colorValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (clockTriggered ? 34 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (solutionsPoured ? 10 : 0) + (mixed ? 10 : 0) + (clockTriggered ? 14 : 0), 20, 100);

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
        advanceStep(2, '器材识别完成，下一步把无色溶液和淀粉指示剂倒入烧杯。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePour = (choice: 'correct' | 'one-only') => {
    if (step !== 2 || completed) return;
    if (choice === 'one-only') {
      markError('需要把两种反应液和淀粉指示剂都加入，才能观察到完整的“碘钟”现象。');
      return;
    }
    setSolutionsPoured(true);
    appendNote('加液状态：烧杯中已形成澄清混合液，等待开始计时。');
    advanceStep(3, '反应液已全部倒入，下一步搅拌并启动计时。');
  };

  const handleMix = (choice: 'correct' | 'wait') => {
    if (step !== 3 || completed) return;
    if (!solutionsPoured) {
      markError('请先把反应液全部倒入烧杯，再开始搅拌计时。');
      return;
    }
    if (choice === 'wait') {
      markError('碘钟反应需要混合后再计时，不能一直保持静置不混合。');
      return;
    }
    setMixed(true);
    setCameraPreset('timer');
    appendNote('计时开始：溶液暂时保持无色，但反应正在内部推进。');
    advanceStep(4, '计时已启动，请注意观察何时突然变蓝。');
  };

  const handleObserve = (choice: 'correct' | 'gradual' | 'no-change') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!mixed) {
      markError('请先混合并计时，再观察显色突变。');
      return;
    }
    if (choice === 'correct') {
      setClockTriggered(true);
      appendNote('观察记录：溶液在短暂延迟后突然整体变成深蓝色。');
      advanceStep(5, '碘钟现象已记录，请完成总结。');
      return;
    }
    markError(choice === 'gradual' ? '该实验更典型的是“先无色，再突然变蓝”，而不是缓慢渐变。' : '混合计时后会出现明显突变，不是始终没有变化。');
  };

  const handleSummary = (choice: 'correct' | 'immediate' | 'always-blue') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：碘钟反应具有明显延迟，随后会突然出现深蓝色。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'immediate' ? '碘钟反应的关键就是先经历短暂延迟，并不是一混合就立刻变蓝。' : '混合前后不会一直保持蓝色，典型过程是先无色后突变。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSolutionsPoured(false);
    setMixed(false);
    setClockTriggered(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察碘钟反应。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先把两种溶液和淀粉指示剂全部倒入。', '混合后及时启动计时。', '重点看“短暂等待后突然深蓝”这一瞬间变化。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对加液和混合顺序。',
        '建议按“识别 → 倒液 → 混合计时 → 看突变 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel iodineclock-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把烧杯混合、计时等待和突然深蓝的戏剧性显色做成更强视觉冲击的动态场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid iodineclock-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'beaker' ? '烧杯近景' : '计时近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>反应计时 {timingValue}</span><div className="chem-meter-bar"><i style={{ width: `${timingValue}%` }} /></div></div><div className="chem-meter"><span>显色强度 {colorValue}</span><div className="chem-meter-bar"><i style={{ width: `${colorValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card iodineclock-data-card"><span className="eyebrow">Readout</span><h3>碘钟读数板</h3><div className="generic-readout-grid iodineclock-readout-grid"><article className={solutionsPoured ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>混合液</span><strong>{solutionsPoured ? '已建立' : '--'}</strong><small>{solutionsPoured ? '两种无色溶液与淀粉均已就位。' : '先完成全部加液。'}</small></article><article className={clockTriggered ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>显色突变</span><strong>{clockTriggered ? '已变蓝' : '--'}</strong><small>{clockTriggered ? '溶液已由无色突然转为深蓝。' : '等待计时后的突变。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '先延迟后突变' : '等待总结'}</strong><small>碘钟反应最有辨识度的现象是突然整体变蓝。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '碘钟反应装置'} · 当前重点：{step <= 2 ? '建立混合液' : step === 3 ? '开始计时搅拌' : '观察延迟后突然变蓝'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'beaker' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('beaker')} type="button">烧杯</button><button className={cameraPreset === 'timer' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('timer')} type="button">计时</button></div></div><div className={`scene-canvas iodineclock-stage preset-${cameraPreset} ${solutionsPoured ? 'solutions-poured' : ''} ${mixed ? 'mixed' : ''} ${clockTriggered ? 'clock-triggered' : ''}`}>
            <div className="iodineclock-rig">
              <div className="icl-bench-shadow" />
              <div className="icl-bench-caustic" />
              <div className={solutionsPoured ? 'icl-beaker active' : 'icl-beaker'}>
                <div className="icl-beaker-foot" />
                <div className="icl-beaker-rim" />
                <div className="icl-inner-glass" />
                <div className={solutionsPoured ? 'icl-meniscus active' : 'icl-meniscus'} />
                <div className={mixed ? 'icl-induction-front active' : 'icl-induction-front'} />
                <div className={clockTriggered ? 'icl-liquid active blue' : solutionsPoured ? 'icl-liquid active' : 'icl-liquid'}>
                  <span className="icl-liquid-surface" />
                  <span className={mixed ? 'icl-reaction-haze active' : 'icl-reaction-haze'} />
                  <span className={clockTriggered ? 'icl-blue-front active' : 'icl-blue-front'} />
                  <span className={clockTriggered ? 'icl-blue-sheet active' : 'icl-blue-sheet'} />
                </div>
                <div className={mixed ? 'icl-swirl active' : 'icl-swirl'} />
                <div className={mixed ? 'icl-vortex-ring active' : 'icl-vortex-ring'} />
              </div>
              <div className={mixed ? 'icl-timer active' : 'icl-timer'}>
                <span className="icl-timer-reflection" />
                <span className={clockTriggered ? 'icl-timer-glow active' : 'icl-timer-glow'} />
              </div>
              <div className={solutionsPoured ? 'icl-bottle left active' : 'icl-bottle left'}>
                <span className="icl-bottle-rim" />
                <span className="icl-bottle-glass" />
                <span className="icl-bottle-cap" />
                <span className="icl-bottle-fill left" />
              </div>
              <div className={solutionsPoured ? 'icl-bottle right active' : 'icl-bottle right'}>
                <span className="icl-bottle-rim" />
                <span className="icl-bottle-glass" />
                <span className="icl-bottle-cap" />
                <span className="icl-bottle-fill right" />
              </div>
              <div className={mixed ? 'icl-stirrer active' : 'icl-stirrer'}>
                <span className="icl-stirrer-reflection" />
                <span className="icl-stirrer-tip" />
              </div>
              <div className={clockTriggered ? 'icl-clock-halo active' : 'icl-clock-halo'} />
            </div>
          </div>

          <div className="observation-ribbon iodineclock-observation-row"><article className={solutionsPoured ? 'observation-chip active' : 'observation-chip calm'}><strong>加液</strong><span>{solutionsPoured ? '烧杯中已建立混合液。' : '等待完成全部加液。'}</span></article><article className={mixed ? 'observation-chip active' : 'observation-chip calm'}><strong>计时</strong><span>{mixed ? '已开始混合并计时。' : '等待启动计时。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>突变</strong><span>{observationChoice === 'correct' ? '已记录突然变蓝。' : '等待完成观察。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePour('correct')} type="button"><strong>把两种无色溶液和淀粉指示剂倒入同一烧杯</strong><span>建立碘钟反应的混合体系。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePour('one-only')} type="button"><strong>只倒入其中一种溶液后直接观察</strong><span>错误演示：无法形成完整反应。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleMix('correct')} type="button"><strong>快速搅拌并启动计时</strong><span>进入延迟后突变的关键阶段。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleMix('wait')} type="button"><strong>始终静置不混合</strong><span>错误演示：缺少触发步骤。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“先无色，稍后突然整体变成深蓝色”</strong><span>这是本实验最典型的现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('gradual')} type="button"><strong>记录“颜色会一点一点缓慢变深”</strong><span>错误演示：忽略突变特征。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('no-change')} type="button"><strong>记录“混合后一直保持完全无色”</strong><span>错误演示：与现象不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>碘钟反应会先经历短暂延迟，随后突然整体变成深蓝色</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('immediate')} type="button"><strong>所有反应液一接触就会立刻立刻变蓝</strong><span>错误演示：忽略延迟阶段。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('always-blue')} type="button"><strong>烧杯中的液体从一开始就是蓝色，不存在变化</strong><span>错误演示：忽略动态过程。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{solutionsPoured ? '混合液已建' : '混合液待建'} / {clockTriggered ? '深蓝已触发' : '深蓝待触发'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先全部加液，再混合计时'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“碘钟反应”升级成可计时、可等待、可突变显色的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
