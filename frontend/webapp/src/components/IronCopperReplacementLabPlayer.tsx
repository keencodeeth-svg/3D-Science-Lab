import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'nail' | 'solution';
type MaterialId = 'nail' | 'cuso4' | 'tube' | 'sandpaper' | 'tweezers';
type TimelineState = 'done' | 'current' | 'todo';

interface IronCopperReplacementLabPlayerProps {
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
  2: '处理并放入铁钉',
  3: '观察铁钉析铜',
  4: '比较溶液颜色',
  5: '总结置换反应',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别铁钉、硫酸铜溶液、试管、砂纸和镊子。',
  2: '用砂纸打磨铁钉表面后，将其放入盛有硫酸铜溶液的试管中。',
  3: '观察铁钉表面是否逐渐附着红色铜层。',
  4: '比较溶液颜色是否由较深蓝色变得更浅。',
  5: '总结铁能够置换出铜，伴随铁钉表面和溶液颜色变化。',
};

const materialLabels: Record<MaterialId, string> = {
  nail: '铁钉',
  cuso4: '硫酸铜溶液',
  tube: '试管',
  sandpaper: '砂纸',
  tweezers: '镊子',
};

const materialOrder: MaterialId[] = ['nail', 'cuso4', 'tube', 'sandpaper', 'tweezers'];

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

export function IronCopperReplacementLabPlayer({ experiment, onTelemetry }: IronCopperReplacementLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [nailPlaced, setNailPlaced] = useState(false);
  const [copperDeposited, setCopperDeposited] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过铁钉与硫酸铜溶液反应观察析铜与蓝色变浅。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const reactionValue = clamp(24 + (nailPlaced ? 20 : 0) + (copperDeposited ? 24 : 0), 20, 99);
  const compareValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 30 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (nailPlaced ? 10 : 0) + (copperDeposited ? 14 : 0), 20, 100);

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
        setCameraPreset('nail');
        advanceStep(2, '器材识别完成，下一步打磨并放入铁钉。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePlaceNail = (choice: 'correct' | 'rusty') => {
    if (step !== 2 || completed) return;
    if (choice === 'rusty') {
      markError('铁钉表面需要先打磨干净，才能更明显观察到析铜现象。');
      return;
    }
    setNailPlaced(true);
    appendNote('装置状态：已将打磨后的铁钉放入硫酸铜溶液中。');
    advanceStep(3, '铁钉已放入，下一步观察表面析铜。');
  };

  const handleObserveDeposit = (choice: 'correct' | 'silver' | 'none') => {
    if (step !== 3 || completed) return;
    if (!nailPlaced) {
      markError('请先把打磨后的铁钉放入试管，再观察现象。');
      return;
    }
    if (choice === 'correct') {
      setCopperDeposited(true);
      setCameraPreset('solution');
      appendNote('观察记录：铁钉表面逐渐附着红色铜层。');
      advanceStep(4, '析铜现象已出现，下一步比较溶液颜色变化。');
      return;
    }
    markError(choice === 'silver' ? '铁钉表面析出的是红色铜层，不是银白色金属。' : '在正确打磨和浸入后，铁钉表面会出现明显析铜。');
  };

  const handleCompareSolution = (choice: 'correct' | 'darker' | 'same') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!copperDeposited) {
      markError('请先观察到铁钉表面析铜，再比较溶液颜色。');
      return;
    }
    if (choice === 'correct') {
      appendNote('对比记录：溶液蓝色较初始变浅。');
      advanceStep(5, '溶液颜色变化已记录，请完成总结。');
      return;
    }
    markError(choice === 'darker' ? '典型现象不是更深，而是原有蓝色逐渐变浅。' : '溶液颜色会有变化，并非始终完全一样。');
  };

  const handleSummary = (choice: 'correct' | 'copper-replaces-iron' | 'only-color') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：铁能置换出硫酸铜中的铜，铁钉析铜且溶液蓝色变浅。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'copper-replaces-iron' ? '不是铜置换铁，而是铁把铜从溶液中置换出来。' : '该实验不只是颜色变化，还能看到铁钉表面析出红色铜层。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setNailPlaced(false);
    setCopperDeposited(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察铁置换铜。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先打磨铁钉，再放入硫酸铜溶液。', '重点看铁钉表面的红色铜层。', '同时别忽略蓝色溶液会逐渐变浅。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对铁钉处理顺序。',
        '建议按“识别 → 打磨放钉 → 看析铜 → 比颜色 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel ironcopper-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把铁钉表面析铜、蓝色溶液变浅和近景对比做成更适合课堂演示的置换反应场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid ironcopper-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'nail' ? '铁钉近景' : '溶液近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>置换强度 {reactionValue}</span><div className="chem-meter-bar"><i style={{ width: `${reactionValue}%` }} /></div></div><div className="chem-meter"><span>对比清晰度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card ironcopper-data-card"><span className="eyebrow">Readout</span><h3>置换读数板</h3><div className="generic-readout-grid ironcopper-readout-grid"><article className={nailPlaced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>铁钉状态</span><strong>{nailPlaced ? '已浸入' : '--'}</strong><small>{nailPlaced ? '铁钉已进入硫酸铜溶液。' : '先打磨并放入铁钉。'}</small></article><article className={copperDeposited ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>析铜现象</span><strong>{copperDeposited ? '已出现' : '--'}</strong><small>{copperDeposited ? '铁钉表面已附着红色铜层。' : '等待观察析铜。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '铁置换铜' : '等待总结'}</strong><small>该实验同时具有表面析铜和溶液颜色变化两个证据。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '铁与硫酸铜装置'} · 当前重点：{step <= 2 ? '放入打磨后铁钉' : step === 3 ? '观察铁钉析铜' : '比较溶液颜色'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'nail' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('nail')} type="button">铁钉</button><button className={cameraPreset === 'solution' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('solution')} type="button">溶液</button></div></div><div className={`scene-canvas ironcopper-stage preset-${cameraPreset} ${nailPlaced ? 'nail-placed' : ''} ${copperDeposited ? 'copper-deposited' : ''}`}>
            <div className="ironcopper-rig">
              <div className="icp-bench-shadow" />
              <div className={nailPlaced ? 'icp-tube active' : 'icp-tube'}>
                <div className="icp-tube-mouth" />
                <div className={copperDeposited ? 'icp-liquid active faded' : nailPlaced ? 'icp-liquid active' : 'icp-liquid'}>
                  <span className="icp-liquid-surface" />
                  <span className={observationChoice === 'correct' ? 'icp-blue-front active' : 'icp-blue-front'} />
                </div>
                <div className={nailPlaced ? 'icp-nail active' : 'icp-nail'}>
                  <span className="icp-nail-highlight" />
                  <div className={copperDeposited ? 'icp-copper active' : 'icp-copper'}>
                    <span className={copperDeposited ? 'icp-copper-specks active' : 'icp-copper-specks'} />
                    <span className={copperDeposited ? 'icp-copper-crust active' : 'icp-copper-crust'} />
                  </div>
                </div>
              </div>
              <div className={nailPlaced ? 'icp-sandpaper active' : 'icp-sandpaper'}>
                <span className="icp-sandpaper-grit" />
              </div>
              <div className={nailPlaced ? 'icp-tweezers active' : 'icp-tweezers'}>
                <span className="icp-tweezers-jaw" />
              </div>
            </div>
          </div>

          <div className="observation-ribbon ironcopper-observation-row"><article className={nailPlaced ? 'observation-chip active' : 'observation-chip calm'}><strong>放钉</strong><span>{nailPlaced ? '打磨后铁钉已放入溶液。' : '等待放入铁钉。'}</span></article><article className={copperDeposited ? 'observation-chip active' : 'observation-chip calm'}><strong>析铜</strong><span>{copperDeposited ? '铁钉表面已出现红色铜层。' : '等待观察析铜。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>溶液</strong><span>{observationChoice === 'correct' ? '已记录蓝色变浅。' : '等待完成对比。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePlaceNail('correct')} type="button"><strong>先打磨铁钉，再用镊子放入硫酸铜溶液</strong><span>建立更清晰的置换反应表面。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePlaceNail('rusty')} type="button"><strong>不打磨铁钉，直接把生锈铁钉丢进去</strong><span>错误演示：现象不清晰。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleObserveDeposit('correct')} type="button"><strong>记录“铁钉表面逐渐附着红色铜层”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserveDeposit('silver')} type="button"><strong>记录“铁钉表面会出现银白色金属层”</strong><span>错误演示：颜色判断错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserveDeposit('none')} type="button"><strong>记录“铁钉表面不会出现任何新物质”</strong><span>错误演示：忽略析铜现象。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleCompareSolution('correct')} type="button"><strong>记录“溶液蓝色较初始变浅”</strong><span>正确对应铜离子减少的现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleCompareSolution('darker')} type="button"><strong>记录“溶液会越来越深蓝”</strong><span>错误演示：与典型现象相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCompareSolution('same')} type="button"><strong>记录“溶液颜色始终完全不变”</strong><span>错误演示：忽略对比。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>铁能置换出硫酸铜中的铜，铁钉析铜且溶液蓝色变浅</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('copper-replaces-iron')} type="button"><strong>是铜把铁从铁钉中置换出来，所以铁钉才会变红</strong><span>错误演示：置换方向错误。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('only-color')} type="button"><strong>实验只是颜色变化，铁钉表面不会有实质变化</strong><span>错误演示：忽略析铜证据。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{nailPlaced ? '铁钉已放入' : '铁钉待放入'} / {copperDeposited ? '析铜已出现' : '析铜待出现'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先打磨铁钉，再放入硫酸铜溶液'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“铁钉置换铜”升级成析铜和溶液变浅都更可见的专属实验页。</small></section></aside>
      </div>
    </section>
  );
}
