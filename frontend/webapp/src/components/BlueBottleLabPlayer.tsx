import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'flask' | 'shake';
type MaterialId = 'flask' | 'glucose' | 'alkali' | 'indicator' | 'stopper';
type TimelineState = 'done' | 'current' | 'todo';

interface BlueBottleLabPlayerProps {
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
  2: '配制无色反应液',
  3: '摇动后变蓝',
  4: '静置后褪色',
  5: '总结循环变色',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别锥形瓶、葡萄糖溶液、碱液、亚甲蓝指示剂和瓶塞。',
  2: '把各试剂加入锥形瓶，形成初始无色反应液。',
  3: '盖好瓶塞并摇动，观察液体是否迅速变成蓝色。',
  4: '将锥形瓶静置，观察蓝色是否逐渐褪去。',
  5: '总结该反应可通过摇动和静置实现蓝色与无色的循环变化。',
};

const materialLabels: Record<MaterialId, string> = {
  flask: '锥形瓶',
  glucose: '葡萄糖溶液',
  alkali: '碱液',
  indicator: '亚甲蓝指示剂',
  stopper: '瓶塞',
};

const materialOrder: MaterialId[] = ['flask', 'glucose', 'alkali', 'indicator', 'stopper'];

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

export function BlueBottleLabPlayer({ experiment, onTelemetry }: BlueBottleLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [prepared, setPrepared] = useState(false);
  const [blueShown, setBlueShown] = useState(false);
  const [faded, setFaded] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过摇动和静置观察“蓝瓶子反应”的循环变色。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const oxygenValue = clamp(24 + (prepared ? 18 : 0) + (blueShown ? 26 : 0) + (faded ? 16 : 0), 20, 99);
  const colorValue = clamp(20 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 30 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 10 : 0) + (blueShown ? 10 : 0) + (faded ? 14 : 0), 20, 100);

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
        setCameraPreset('flask');
        advanceStep(2, '器材识别完成，下一步配制初始无色反应液。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePrepare = (choice: 'correct' | 'skip-indicator') => {
    if (step !== 2 || completed) return;
    if (choice === 'skip-indicator') {
      markError('需要加入指示剂，后续摇动后才会出现明显蓝色变化。');
      return;
    }
    setPrepared(true);
    appendNote('配液记录：锥形瓶中已建立初始无色反应液。');
    advanceStep(3, '无色体系已建立，下一步摇动瓶体观察变蓝。');
  };

  const handleShake = (choice: 'correct' | 'no-stopper') => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError('请先配制好反应液，再摇动观察。');
      return;
    }
    if (choice === 'no-stopper') {
      markError('应先盖好瓶塞再摇动，避免操作不规范且不利于稳定观察。');
      return;
    }
    setBlueShown(true);
    setCameraPreset('shake');
    appendNote('摇动记录：液体迅速由无色转为鲜明蓝色。');
    advanceStep(4, '蓝色已出现，下一步静置观察褪色。');
  };

  const handleFade = (choice: 'correct' | 'stay-blue') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!blueShown) {
      markError('请先摇动让液体变蓝，再观察静置后的变化。');
      return;
    }
    if (choice === 'stay-blue') {
      markError('静置后蓝色不会永久保持，典型现象是逐渐褪回接近无色。');
      return;
    }
    setFaded(true);
    appendNote('静置记录：蓝色逐渐减弱并回到近无色状态。');
    advanceStep(5, '循环变色现象已建立，请完成总结。');
  };

  const handleSummary = (choice: 'correct' | 'only-blue' | 'reverse') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：该反应可通过摇动和静置实现蓝色与无色的循环变化。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'only-blue' ? '该实验不是只变蓝不回退，静置后会再褪色。' : '顺序不能说反，正确是摇动变蓝、静置褪色。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPrepared(false);
    setBlueShown(false);
    setFaded(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察蓝瓶子反应。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先配制无色反应液。', '摇动后注意看液体瞬间变蓝。', '静置时再观察蓝色逐渐褪去。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对摇动与静置顺序。',
        '建议按“识别 → 配液 → 摇动变蓝 → 静置褪色 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel bluebottle-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属化学实验页</h2><p>把摇一摇变蓝、放一放褪色的循环显色过程做成更有互动感的化学演示场景。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid bluebottle-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'flask' ? '锥形瓶近景' : '摇动近景'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>反应活跃 {oxygenValue}</span><div className="chem-meter-bar"><i style={{ width: `${oxygenValue}%` }} /></div></div><div className="chem-meter"><span>颜色对比 {colorValue}</span><div className="chem-meter-bar"><i style={{ width: `${colorValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card bluebottle-data-card"><span className="eyebrow">Readout</span><h3>循环读数板</h3><div className="generic-readout-grid bluebottle-readout-grid"><article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>初始体系</span><strong>{prepared ? '已配好' : '--'}</strong><small>{prepared ? '锥形瓶中已形成无色反应液。' : '先配制反应液。'}</small></article><article className={faded ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>循环变化</span><strong>{faded ? '蓝→无色' : '--'}</strong><small>{faded ? '摇动变蓝、静置褪色的循环已完成。' : '等待完整循环。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '可循环变色' : '等待总结'}</strong><small>该实验最有趣的地方是同一体系可多次反复变色。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '蓝瓶子反应装置'} · 当前重点：{step <= 2 ? '建立无色体系' : step === 3 ? '摇动变蓝' : '静置褪色'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'flask' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flask')} type="button">锥形瓶</button><button className={cameraPreset === 'shake' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('shake')} type="button">摇动</button></div></div><div className={`scene-canvas bluebottle-stage preset-${cameraPreset} ${prepared ? 'prepared' : ''} ${blueShown ? 'blue-shown' : ''} ${faded ? 'faded' : ''}`}>
            <div className="bluebottle-rig">
              <div className="bbb-shadow" />
              <div className="bbb-bench-caustic" />
              <div className={prepared ? 'bbb-bottle left active' : 'bbb-bottle left'}>
                <span className="bbb-bottle-rim" />
                <span className="bbb-bottle-glass" />
                <span className="bbb-bottle-cap" />
                <span className="bbb-bottle-label glucose" />
                <span className="bbb-bottle-fill glucose" />
              </div>
              <div className={prepared ? 'bbb-flask active' : 'bbb-flask'}>
                <div className="bbb-flask-foot" />
                <div className="bbb-neck" />
                <div className="bbb-rim" />
                <div className="bbb-shoulder-gloss" />
                <div className="bbb-flask-gloss" />
                <div className={prepared ? 'bbb-meniscus active' : 'bbb-meniscus'} />
                <div className={blueShown ? 'bbb-oxygen-sheet active' : 'bbb-oxygen-sheet'} />
                <div className={faded ? 'bbb-liquid active faded' : blueShown ? 'bbb-liquid active blue' : prepared ? 'bbb-liquid active clear' : 'bbb-liquid'}>
                  <span className="bbb-liquid-surface" />
                  <span className={blueShown ? 'bbb-oxygen-plume active' : 'bbb-oxygen-plume'} />
                  <span className={blueShown ? 'bbb-bubble bubble-1 active' : 'bbb-bubble bubble-1'} />
                  <span className={blueShown ? 'bbb-bubble bubble-2 active' : 'bbb-bubble bubble-2'} />
                  <span className={blueShown ? 'bbb-bubble bubble-3 active' : 'bbb-bubble bubble-3'} />
                </div>
                <div className={blueShown ? 'bbb-degassing-ring active' : 'bbb-degassing-ring'} />
                <div className={blueShown ? 'bbb-swirl active' : 'bbb-swirl'} />
                <div className={blueShown ? 'bbb-shake-ring ring-1 active' : 'bbb-shake-ring ring-1'} />
                <div className={blueShown ? 'bbb-shake-ring ring-2 active' : 'bbb-shake-ring ring-2'} />
                <div className={blueShown ? 'bbb-air-highlight active' : 'bbb-air-highlight'} />
              </div>
              <div className={prepared ? 'bbb-stopper active' : 'bbb-stopper'}>
                <span className="bbb-stopper-top" />
                <span className="bbb-stopper-reflection" />
              </div>
              <div className={prepared ? 'bbb-bottle right active' : 'bbb-bottle right'}>
                <span className="bbb-bottle-rim" />
                <span className="bbb-bottle-glass" />
                <span className="bbb-bottle-cap" />
                <span className="bbb-bottle-label alkali" />
                <span className="bbb-bottle-fill alkali" />
              </div>
            </div>
          </div>

          <div className="observation-ribbon bluebottle-observation-row"><article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>配液</strong><span>{prepared ? '无色反应液已建立。' : '等待配液。'}</span></article><article className={blueShown ? 'observation-chip active' : 'observation-chip calm'}><strong>摇动</strong><span>{blueShown ? '摇动后已观察到明显蓝色。' : '等待摇动显色。'}</span></article><article className={faded ? 'observation-chip active' : 'observation-chip calm'}><strong>静置</strong><span>{faded ? '静置后颜色已逐渐褪去。' : '等待静置褪色。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePrepare('correct')} type="button"><strong>把葡萄糖、碱液和指示剂加入锥形瓶，形成无色体系</strong><span>为后续循环变色做准备。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePrepare('skip-indicator')} type="button"><strong>不加指示剂直接期待明显变色</strong><span>错误演示：颜色反馈不足。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleShake('correct')} type="button"><strong>盖好瓶塞并摇动，观察液体迅速变蓝</strong><span>建立第一阶段显色。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleShake('no-stopper')} type="button"><strong>不盖瓶塞直接随意晃动</strong><span>错误演示：操作不规范。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleFade('correct')} type="button"><strong>静置后记录“蓝色逐渐褪回接近无色”</strong><span>这是本实验完整循环的一半。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFade('stay-blue')} type="button"><strong>记录“只要变蓝就会一直保持蓝色”</strong><span>错误演示：忽略褪色阶段。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>该体系可通过摇动和静置实现蓝色与无色的循环变化</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('only-blue')} type="button"><strong>它只会越来越蓝，不会再褪色</strong><span>错误演示：与循环现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('reverse')} type="button"><strong>静置会变蓝，摇动会褪色</strong><span>错误演示：顺序说反。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{prepared ? '体系已配好' : '体系待配好'} / {faded ? '循环已完成' : '循环待完成'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先配液，再摇动，后静置'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“蓝瓶子反应”升级成更有互动乐趣的循环变色实验页。</small></section></aside>
      </div>
    </section>
  );
}
