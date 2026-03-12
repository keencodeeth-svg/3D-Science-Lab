import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'stage' | 'scope';
type MaterialId = 'microscope' | 'fish-tray' | 'dropper' | 'slide-stage' | 'light-source';
type TimelineState = 'done' | 'current' | 'todo';

interface FishCirculationLabPlayerProps {
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
  2: '固定观察尾鳍区域',
  3: '调光调焦',
  4: '观察血流方向',
  5: '总结血液流动特点',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别显微镜、观察槽、小鱼尾鳍观察区、滴管和光源。',
  2: '把尾鳍观察区放到显微镜载物台中央。',
  3: '调节光线和焦距，让血管与血细胞尽量清晰。',
  4: '观察红细胞在毛细血管中单行通过及不同血管中的流动方向。',
  5: '总结血液在毛细血管中的流动特点。',
};

const materialLabels: Record<MaterialId, string> = {
  microscope: '显微镜',
  'fish-tray': '尾鳍观察槽',
  dropper: '滴管',
  'slide-stage': '载物台',
  'light-source': '光源',
};

const materialOrder: MaterialId[] = ['microscope', 'fish-tray', 'dropper', 'slide-stage', 'light-source'];

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

export function FishCirculationLabPlayer({ experiment, onTelemetry }: FishCirculationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [positioned, setPositioned] = useState(false);
  const [focused, setFocused] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先把尾鳍观察区放到载物台中央，再调焦观察血流。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const clarityValue = clamp(40 + (positioned ? 14 : 0) + (focused ? 24 : 0), 24, 99);
  const flowValue = clamp(42 + (focused ? 18 : 0) + (observationChoice === 'correct' ? 18 : 0), 24, 99);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const readinessValue = clamp(progressPercent + (positioned ? 14 : 0) + (focused ? 18 : 0), 20, 100);

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
        setCameraPreset('stage');
        advanceStep(2, '器材识别完成，先把尾鳍观察区放到载物台中央。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePosition = (choice: 'correct' | 'edge') => {
    if (step !== 2 || completed) return;
    if (choice === 'edge') {
      markError('观察区域要放在载物台中央，边缘位置不利于调焦观察。');
      return;
    }
    setPositioned(true);
    appendNote('观察准备：尾鳍观察区已对准显微镜载物台中央。');
    advanceStep(3, '位置已调整好，下一步调节光线和焦距。');
  };

  const handleFocus = (choice: 'correct' | 'blur') => {
    if (step !== 3 || completed) return;
    if (!positioned) {
      markError('请先把观察区对准载物台中央，再调节焦距。');
      return;
    }
    if (choice === 'blur') {
      markError('请继续调节光线和焦距，直到血管边界与血细胞运动清晰。');
      return;
    }
    setFocused(true);
    setCameraPreset('scope');
    appendNote('显微观察：血管轮廓和移动的血细胞已清晰可见。');
    advanceStep(4, '图像已清晰，下一步观察不同血管中的血流方向。');
  };

  const handleObserve = (choice: 'correct' | 'all-same' | 'no-cells') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!focused) {
      markError('请先把视野调清楚，再观察血流方向。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：血细胞在毛细血管中单行通过，不同血管中的流向和速度存在差异。');
      advanceStep(5, '血流现象已观察到，最后总结血液流动特点。');
      return;
    }
    if (choice === 'all-same') {
      markError('不同类型血管中的血流情况并不完全相同，不能简单记成“都一样”。');
      return;
    }
    markError('显微镜下可以看到血细胞移动，不是完全看不到。');
  };

  const handleSummary = (choice: 'correct' | 'random' | 'no-capillary') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：毛细血管很细，血细胞常单行通过，血液在不同血管中持续流动。');
      return;
    }
    if (choice === 'random') {
      markError('血液流动不是无规律乱动，而是沿着血管持续定向流动。');
      return;
    }
    markError('毛细血管正是本实验中最重要的观察对象之一。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPositioned(false);
    setFocused(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新对准尾鳍观察区并调焦观察血液流动。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '观察区域要放在载物台中央，视野更稳定。',
        '先调光再调焦，更容易看清血细胞。',
        '总结时记住毛细血管里血细胞常单行通过。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对血流现象。',
        '建议重新执行“对准位置 → 调焦 → 观察血流”的流程。',
      ];

  return (
    <section className="panel playground-panel fishcirculation-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>把血细胞运动、毛细血管和显微调焦串成一个连续观察流程，让“血液在微小血管里怎么流”真正看得清。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid fishcirculation-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'stage' ? '载物台' : '显微视野'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>血流度 {flowValue}</span><div className="chem-meter-bar"><i style={{ width: `${flowValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card fishcirculation-data-card"><span className="eyebrow">Readout</span><h3>血流读数板</h3><div className="generic-readout-grid fishcirculation-readout-grid"><article className={positioned ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>观察区位置</span><strong>{positioned ? '已对准中央' : '待对准'}</strong><small>{positioned ? '尾鳍观察区已进入理想位置。' : '先把观察区放在载物台中央。'}</small></article><article className={focused ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>显微视野</span><strong>{focused ? '血细胞清晰' : '待调焦'}</strong><small>{focused ? '可清楚看到血管与血细胞流动。' : '调光调焦后再观察。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '毛细血管中常单行通过' : '等待总结'}</strong><small>血细胞在毛细血管中常单行通过，血液沿血管持续流动。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '血液流动观察装置'} · 当前重点：{step <= 2 ? '定位观察区' : step === 3 ? '调焦显微镜' : '观察血细胞'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'stage' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('stage')} type="button">载物台</button><button className={cameraPreset === 'scope' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('scope')} type="button">显微镜</button></div></div>

          <div className={`scene-canvas fishcirculation-stage preset-${cameraPreset} ${positioned ? 'positioned' : ''} ${focused ? 'focused' : ''}`}>
            <div className="fishcirculation-rig">
              <div className="fc-stage-panel" />
              <div className={positioned ? 'fc-fish-tray active' : 'fc-fish-tray'} />
              <div className="fc-microscope">
                <div className="fc-scope-arm" />
                <div className="fc-scope-stage" />
                <div className="fc-view">
                  <span className={focused ? 'fc-vessel artery clear' : 'fc-vessel artery'} />
                  <span className={focused ? 'fc-vessel capillary clear' : 'fc-vessel capillary'} />
                  <span className={focused ? 'fc-vessel vein clear' : 'fc-vessel vein'} />
                </div>
              </div>
            </div>
          </div>

          <div className="observation-ribbon fishcirculation-observation-row"><article className={positioned ? 'observation-chip active' : 'observation-chip calm'}><strong>观察区定位</strong><span>{positioned ? '尾鳍观察区已对准中央。' : '先把观察区域摆正。'}</span></article><article className={focused ? 'observation-chip active' : 'observation-chip calm'}><strong>视野状态</strong><span>{focused ? '血管和血细胞已清晰可见。' : '等待调光调焦。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>血流现象</strong><span>{observationChoice === 'correct' ? '毛细血管中常见血细胞单行通过。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePosition('correct')} type="button"><strong>把观察区放到载物台中央</strong><span>便于显微镜后续调焦。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePosition('edge')} type="button"><strong>把观察区放到边缘</strong><span>错误演示：视野不稳定。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFocus('correct')} type="button"><strong>调光调焦到血流清晰</strong><span>观察血管与血细胞运动。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFocus('blur')} type="button"><strong>保持模糊视野</strong><span>错误演示：无法准确观察。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“毛细血管中血细胞常单行通过”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('all-same')} type="button"><strong>记录“所有血管流动情况完全相同”</strong><span>错误演示：过度简化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('no-cells')} type="button"><strong>记录“看不到血细胞”</strong><span>错误演示：与清晰视野不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>血细胞在毛细血管中常单行通过，血液沿血管持续流动</strong><span>完整总结血液流动特点。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('random')} type="button"><strong>血液在血管里是无规律乱动</strong><span>错误演示：与实际不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-capillary')} type="button"><strong>毛细血管与观察无关</strong><span>错误演示：忽略关键结构。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{positioned ? '观察区已对准' : '待对准'} / {focused ? '视野清晰' : '待调焦'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先对准，再调焦，再判断血流'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“小鱼尾鳍血液流动”升级成载物台定位和显微观察一体化专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
