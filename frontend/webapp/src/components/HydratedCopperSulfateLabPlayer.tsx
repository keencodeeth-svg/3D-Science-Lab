import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'heating' | 'reaction';
type MaterialId = 'crystal' | 'tube' | 'lamp' | 'dropper' | 'water';
type TimelineState = 'done' | 'current' | 'todo';

interface HydratedCopperSulfateLabPlayerProps {
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
  2: '加热蓝色晶体',
  3: '观察失水变白',
  4: '滴水恢复蓝色',
  5: '总结失水吸水',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别硫酸铜晶体、试管、酒精灯、滴管和清水。',
  2: '加热蓝色硫酸铜晶体。',
  3: '观察晶体是否由蓝色变成白色粉末。',
  4: '向白色粉末滴加少量水。',
  5: '总结硫酸铜晶体失水变白、吸水又恢复蓝色。',
};

const materialLabels: Record<MaterialId, string> = {
  crystal: '硫酸铜晶体',
  tube: '试管',
  lamp: '酒精灯',
  dropper: '滴管',
  water: '清水',
};

const materialOrder: MaterialId[] = ['crystal', 'tube', 'lamp', 'dropper', 'water'];

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

export function HydratedCopperSulfateLabPlayer({ experiment, onTelemetry }: HydratedCopperSulfateLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [heated, setHeated] = useState(false);
  const [rehydrated, setRehydrated] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过加热与滴水观察硫酸铜晶体失水和吸水的颜色变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const heatValue = clamp(28 + (heated ? 22 : 0) + (rehydrated ? 20 : 0), 20, 99);
  const colorValue = clamp(24 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 26 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (heated ? 10 : 0) + (rehydrated ? 14 : 0), 20, 100);

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
        setCameraPreset('heating');
        advanceStep(2, '器材识别完成，先加热蓝色晶体。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleHeat = (choice: 'correct' | 'skip') => {
    if (step !== 2 || completed) return;
    if (choice === 'skip') {
      markError('需要先加热蓝色硫酸铜晶体，才能观察失水现象。');
      return;
    }
    setHeated(true);
    appendNote('加热状态：蓝色晶体开始失水并逐渐褪色。');
    advanceStep(3, '晶体已加热，下一步观察颜色变化。');
  };

  const handleObserve = (choice: 'correct' | 'stay-blue' | 'black') => {
    if (step !== 3 || completed) return;
    setObservationChoice(choice);
    if (!heated) {
      markError('请先加热蓝色晶体，再观察颜色变化。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：晶体失水后由蓝色变为白色粉末。');
      advanceStep(4, '白色粉末已出现，下一步滴加清水。');
      return;
    }
    markError(choice === 'stay-blue' ? '加热后不会一直保持原来的蓝色，而会因失水变白。' : '典型现象不是变黑，而是由蓝变白。');
  };

  const handleAddWater = (choice: 'correct' | 'none') => {
    if (step !== 4 || completed) return;
    if (!heated || observationChoice !== 'correct') {
      markError('请先完成加热并确认白色粉末现象。');
      return;
    }
    if (choice === 'none') {
      markError('需要向白色粉末滴加少量水，才能观察吸水恢复颜色。');
      return;
    }
    setRehydrated(true);
    setCameraPreset('reaction');
    appendNote('反应记录：白色粉末吸水后重新呈现蓝色。');
    advanceStep(5, '颜色已恢复，下一步总结失水吸水规律。');
  };

  const handleSummary = (choice: 'correct' | 'irreversible' | 'flame-only') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：硫酸铜晶体失水后由蓝变白，吸水后又恢复蓝色。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'irreversible' ? '该现象不是完全不可逆，滴水后会恢复蓝色。' : '颜色变化不是单纯火焰照射造成，而与失水吸水有关。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setHeated(false);
    setRehydrated(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察硫酸铜晶体失水吸水。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先加热蓝色晶体，再观察变白。', '确认白色粉末后再滴水。', '结论关键词是“失水变白、吸水返蓝”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对是否先完成了加热。',
        '建议按“识别 → 加热 → 观察变白 → 滴水返蓝 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel cuso4hydrate-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把蓝色晶体、加热失水、白色粉末和滴水返蓝做成更接近真实化学演示的场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid cuso4hydrate-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'heating' ? '加热近景' : '返蓝近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>失水程度 {heatValue}</span><div className="chem-meter-bar"><i style={{ width: `${heatValue}%` }} /></div></div><div className="chem-meter"><span>颜色变化 {colorValue}</span><div className="chem-meter-bar"><i style={{ width: `${colorValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card cuso4hydrate-data-card"><span className="eyebrow">Readout</span><h3>晶体读数板</h3><div className="generic-readout-grid cuso4hydrate-readout-grid"><article className={heated ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>加热状态</span><strong>{heated ? '已失水' : '--'}</strong><small>{heated ? '蓝色晶体已变浅。' : '先加热晶体。'}</small></article><article className={rehydrated ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>吸水状态</span><strong>{rehydrated ? '已返蓝' : '--'}</strong><small>{rehydrated ? '滴水后颜色已恢复。' : '等待滴水返蓝。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '失水变白 吸水返蓝' : '等待总结'}</strong><small>硫酸铜晶体能通过失水与吸水产生明显颜色变化。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '硫酸铜晶体装置'} · 当前重点：{step <= 2 ? '加热晶体失水' : step === 3 ? '观察蓝白变化' : '滴水返蓝'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'heating' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('heating')} type="button">加热</button><button className={cameraPreset === 'reaction' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('reaction')} type="button">返蓝</button></div></div><div className={`scene-canvas cuso4hydrate-stage preset-${cameraPreset} ${heated ? 'heated' : ''} ${rehydrated ? 'rehydrated' : ''}`}>
            <div className="cuso4hydrate-rig">
              <div className="cu-bench-shadow" />
              <div className={heated ? 'cu-tube active' : 'cu-tube'}>
                <div className="cu-tube-mouth" />
                <div className={rehydrated ? 'cu-crystal blue active' : heated ? 'cu-crystal white active' : 'cu-crystal blue'}>
                  <span className="cu-crystal-bed" />
                  <span className="cu-crystal-grains" />
                  <span className={heated ? 'cu-dehydration-front active' : 'cu-dehydration-front'} />
                  <span className={rehydrated ? 'cu-rehydration-plume active' : 'cu-rehydration-plume'} />
                </div>
                <div className={heated ? 'cu-vapor active' : 'cu-vapor'} />
              </div>
              <div className={heated ? 'cu-flame active' : 'cu-flame'} />
              <div className={rehydrated ? 'cu-dropper active' : 'cu-dropper'}>
                <span className="cu-dropper-glass" />
                <span className={rehydrated ? 'cu-drop active' : 'cu-drop'} />
              </div>
            </div>
          </div>

          <div className="observation-ribbon cuso4hydrate-observation-row"><article className={heated ? 'observation-chip active' : 'observation-chip calm'}><strong>加热</strong><span>{heated ? '晶体已完成失水处理。' : '待加热晶体。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>变白</strong><span>{observationChoice === 'correct' ? '已观察到白色粉末。' : '等待完成观察。'}</span></article><article className={rehydrated ? 'observation-chip active' : 'observation-chip calm'}><strong>返蓝</strong><span>{rehydrated ? '已观察到吸水返蓝。' : '等待滴水返蓝。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleHeat('correct')} type="button"><strong>用酒精灯加热蓝色硫酸铜晶体</strong><span>触发失水过程。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleHeat('skip')} type="button"><strong>跳过加热直接判断结果</strong><span>错误演示：不会出现完整变化。</span></button></> : null}{step === 3 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“蓝色晶体加热后变成白色粉末”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('stay-blue')} type="button"><strong>记录“加热后仍一直保持蓝色”</strong><span>错误演示：忽略失水现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('black')} type="button"><strong>记录“加热后会变黑”</strong><span>错误演示：颜色判断错误。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAddWater('correct')} type="button"><strong>向白色粉末滴加少量清水</strong><span>观察吸水返蓝。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAddWater('none')} type="button"><strong>不加水直接结束实验</strong><span>错误演示：缺少返蓝步骤。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>硫酸铜晶体失水后由蓝色变白，吸水后又恢复蓝色</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('irreversible')} type="button"><strong>晶体一旦变白就再也不能恢复蓝色</strong><span>错误演示：与实验相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('flame-only')} type="button"><strong>颜色变化只是火焰照到样品造成的视觉效果</strong><span>错误演示：原理错误。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{heated ? '已加热' : '待加热'} / {rehydrated ? '已返蓝' : '待返蓝'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先观察变白，再滴水返蓝'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“硫酸铜晶体失水吸水”升级成可见蓝白返蓝变化的专属页。</small></section></aside>
      </div>
    </section>
  );
}
