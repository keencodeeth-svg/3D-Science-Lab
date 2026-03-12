import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'cell' | 'gas';
type MaterialId = 'power' | 'cell' | 'electrode' | 'water' | 'tube';
type TimelineState = 'done' | 'current' | 'todo';

interface ElectrolysisWaterLabPlayerProps {
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
  2: '连接电解装置',
  3: '启动电解过程',
  4: '比较两侧气体体积',
  5: '总结电解水规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别电源、电解槽、电极、水和集气管。',
  2: '把电极、电解槽和电源规范连接。',
  3: '通电后观察两侧气泡和集气量变化。',
  4: '比较两侧气体体积多少关系。',
  5: '总结水电解产生氢气和氧气的规律。',
};

const materialLabels: Record<MaterialId, string> = {
  power: '电源',
  cell: '电解槽',
  electrode: '电极',
  water: '水',
  tube: '集气管',
};

const materialOrder: MaterialId[] = ['power', 'cell', 'electrode', 'water', 'tube'];

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

export function ElectrolysisWaterLabPlayer({ experiment, onTelemetry }: ElectrolysisWaterLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [assembled, setAssembled] = useState(false);
  const [powered, setPowered] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先连接电解水装置，再比较两侧产气体积。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const hydrogenVolume = powered ? 24 : 0;
  const oxygenVolume = powered ? 12 : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const gasValue = clamp(42 + (assembled ? 18 : 0) + (powered ? 22 : 0) + (observationChoice === 'correct' ? 12 : 0), 24, 99);
  const clarityValue = clamp(38 + (cameraPreset !== 'bench' ? 10 : 0) + (powered ? 18 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (assembled ? 12 : 0) + (powered ? 18 : 0), 20, 100);

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
        setCameraPreset('cell');
        advanceStep(2, '器材识别完成，下一步连接电解槽和电源。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleAssemble = (choice: 'correct' | 'open') => {
    if (step !== 2 || completed) return;
    if (choice === 'open') {
      markError('电极和集气装置需要规范连接，否则无法稳定收集气体。');
      return;
    }
    setAssembled(true);
    appendNote('装置连接：电极、电源和集气管已规范接好。');
    advanceStep(3, '电解装置已连接好，下一步开始通电。');
  };

  const handlePower = (choice: 'on' | 'off') => {
    if (step !== 3 || completed) return;
    if (!assembled) {
      markError('请先完成装置连接，再开始通电。');
      return;
    }
    if (choice === 'off') {
      markError('不通电就不会发生明显电解现象。');
      return;
    }
    setPowered(true);
    setCameraPreset('gas');
    appendNote('电解开始：两侧出现气泡，其中阴极侧产气更快更多。');
    advanceStep(4, '电解已进行，请比较两侧气体体积。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'oxygen-more') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!powered) {
      markError('请先通电完成电解，再比较两侧气体体积。');
      return;
    }
    if (choice === 'correct') {
      appendNote('实验观察：阴极侧气体体积约为阳极侧的 2 倍。');
      advanceStep(5, '现象判断正确，最后总结电解水的规律。');
      return;
    }
    if (choice === 'same') {
      markError('两侧产气体积并不相同。');
      return;
    }
    markError('氧气不会更多，通常氢气体积约是氧气的 2 倍。');
  };

  const handleSummary = (choice: 'correct' | 'single-gas' | 'same-ratio') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：水通电后分解生成氢气和氧气，体积比约为 2:1。');
      return;
    }
    if (choice === 'single-gas') {
      markError('电解水不会只生成一种气体，而是同时得到氢气和氧气。');
      return;
    }
    markError('两侧产气体积并不是 1:1，而约为 2:1。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setAssembled(false);
    setPowered(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新连接装置并观察电解水产气。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先规范连接电源、电极和集气管。', '通电后重点看哪一侧气泡更多。', '总结时记住“氢氧体积比约 2:1”。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对产气体积。',
        '建议重新执行“连装置 → 通电 → 比较体积”的流程。',
      ];

  return (
    <section className="panel playground-panel electrolysis-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把电极起泡、集气管液位和气体体积比做成连续变化，让电解水更像真实电解实验。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid electrolysis-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'cell' ? '电解槽观察' : '产气对比'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>产气值 {gasValue}</span><div className="chem-meter-bar"><i style={{ width: `${gasValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card electrolysis-data-card"><span className="eyebrow">Readout</span><h3>电解读数板</h3><div className="generic-readout-grid electrolysis-readout-grid"><article className={assembled ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>装置状态</span><strong>{assembled ? '已规范连接' : '待连接'}</strong><small>{assembled ? '电极和集气装置已就位。' : '先完成电解槽连接。'}</small></article><article className={powered ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>氢气体积</span><strong>{powered ? `${hydrogenVolume} mL` : '--'}</strong><small>{powered ? '阴极侧产气明显更多。' : '先通电再观察。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>氧气体积</span><strong>{powered ? `${oxygenVolume} mL` : '--'}</strong><small>水电解时氢气和氧气体积约为 2:1。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '电解水装置'} · 当前重点：{step <= 2 ? '连接电解槽' : step === 3 ? '通电起泡' : '比较两侧集气量'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'cell' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('cell')} type="button">电解槽</button><button className={cameraPreset === 'gas' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('gas')} type="button">产气</button></div></div>

          <div className={`scene-canvas electrolysis-stage preset-${cameraPreset} ${assembled ? 'assembled' : ''} ${powered ? 'powered' : ''}`}>
            <div className="electrolysis-rig">
              <div className="el-bench-shadow" />
              <div className={assembled ? 'el-power active' : 'el-power'}>
                <span className="el-power-panel" />
                <span className="el-power-highlight" />
                <span className={powered ? 'el-power-screen active' : 'el-power-screen'} />
                <span className="el-power-terminal red" />
                <span className="el-power-terminal blue" />
                <span className={powered ? 'el-power-glow active' : 'el-power-glow'} />
              </div>
              <div className={assembled ? 'el-wire left active' : 'el-wire left'} />
              <div className={assembled ? 'el-wire right active' : 'el-wire right'} />
              <div className={powered ? 'el-cell active' : 'el-cell'}>
                <div className="el-cell-rim" />
                <div className="el-cell-gloss" />
                <div className={powered ? 'el-cell-caustic active' : 'el-cell-caustic'} />
                <div className={powered ? 'el-liquid active' : 'el-liquid'}>
                  <span className="el-liquid-surface" />
                  <span className="el-liquid-depth" />
                  <span className={powered ? 'el-liquid-caustic active' : 'el-liquid-caustic'} />
                  <span className={powered ? 'el-electrolyte-sheen active' : 'el-electrolyte-sheen'} />
                </div>
                <div className={assembled ? 'el-electrode left active' : 'el-electrode left'}>
                  <span className={powered ? 'el-electrode-glow left active' : 'el-electrode-glow left'} />
                </div>
                <div className={assembled ? 'el-electrode right active' : 'el-electrode right'}>
                  <span className={powered ? 'el-electrode-glow right active' : 'el-electrode-glow right'} />
                </div>
                <div className={powered ? 'el-bubble left a active' : 'el-bubble left a'} />
                <div className={powered ? 'el-bubble left b active' : 'el-bubble left b'} />
                <div className={powered ? 'el-bubble left c active' : 'el-bubble left c'} />
                <div className={powered ? 'el-bubble right a active' : 'el-bubble right a'} />
                <div className={powered ? 'el-bubble right b active' : 'el-bubble right b'} />
                <div className={powered ? 'el-bubble-curtain left active' : 'el-bubble-curtain left'} />
                <div className={powered ? 'el-bubble-curtain right active' : 'el-bubble-curtain right'} />
                <div className={powered ? 'el-gas-haze left active' : 'el-gas-haze left'} />
                <div className={powered ? 'el-gas-haze right active' : 'el-gas-haze right'} />
              </div>
              <div className={powered ? 'el-tube hydrogen active' : 'el-tube hydrogen'}>
                <span className="el-tube-rim" />
                <span className="el-tube-gloss" />
                <span className="el-tube-scale" />
                <span className={powered ? 'el-tube-gas active' : 'el-tube-gas'} />
                <span className="el-tube-meniscus" />
                <span className="el-tube-readout">{powered ? `${hydrogenVolume}` : '--'}</span>
              </div>
              <div className={powered ? 'el-tube oxygen active' : 'el-tube oxygen'}>
                <span className="el-tube-rim" />
                <span className="el-tube-gloss" />
                <span className="el-tube-scale" />
                <span className={powered ? 'el-tube-gas active' : 'el-tube-gas'} />
                <span className="el-tube-meniscus" />
                <span className="el-tube-readout">{powered ? `${oxygenVolume}` : '--'}</span>
              </div>
            </div>
          </div>

          <div className="observation-ribbon electrolysis-observation-row"><article className={assembled ? 'observation-chip active' : 'observation-chip calm'}><strong>装置连接</strong><span>{assembled ? '电解装置已连接好。' : '先规范连接装置。'}</span></article><article className={powered ? 'observation-chip active' : 'observation-chip calm'}><strong>通电状态</strong><span>{powered ? '两侧电极已持续产生气泡。' : '等待通电起泡。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>体积比较</strong><span>{observationChoice === 'correct' ? '已观察到氢气体积约为氧气的两倍。' : '等待完成体积判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleAssemble('correct')} type="button"><strong>连接电源、电极和集气管</strong><span>形成规范电解装置。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAssemble('open')} type="button"><strong>装置连接松散不完整</strong><span>错误演示：无法稳定收气。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePower('on')} type="button"><strong>接通电源开始电解</strong><span>观察两侧电极冒泡。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePower('off')} type="button"><strong>不通电直接等待</strong><span>错误演示：不会出现明显电解。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“氢气体积约为氧气的 2 倍”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“两侧体积相同”</strong><span>错误演示：与实验不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('oxygen-more')} type="button"><strong>记录“氧气更多”</strong><span>错误演示：方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>水通电后分解生成氢气和氧气，体积比约为 2:1</strong><span>完整总结电解水规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('single-gas')} type="button"><strong>电解水只会产生一种气体</strong><span>错误演示：与实验不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('same-ratio')} type="button"><strong>氢气和氧气体积始终相同</strong><span>错误演示：结论错误。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{assembled ? '已连接' : '待连接'} / {powered ? '已通电' : '待通电'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先连好装置，再通电观察'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“电解水”升级成带双侧产气和体积对比的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
