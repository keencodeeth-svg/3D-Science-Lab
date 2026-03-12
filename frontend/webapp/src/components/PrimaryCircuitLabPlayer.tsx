import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'desk' | 'circuit' | 'bulb';
type MaterialId = 'battery' | 'bulb' | 'wire' | 'holder';
type ConnectionId = 'battery-to-bulb' | 'bulb-to-return';
type TimelineState = 'done' | 'current' | 'todo';

interface PrimaryCircuitLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '认识器材',
  2: '连接回路',
  3: '观察现象',
  4: '总结条件',
};

const stepPrompts: Record<StepId, string> = {
  1: '先认识电池、小灯泡、导线和灯座。',
  2: '连接电池、导线和小灯泡，形成闭合回路。',
  3: '观察小灯泡是否亮起，并判断原因。',
  4: '总结让小灯泡亮起来的必要条件。',
};

const materialLabels: Record<MaterialId, string> = {
  battery: '电池',
  bulb: '小灯泡',
  wire: '导线',
  holder: '灯座',
};

const materialOrder: MaterialId[] = ['battery', 'bulb', 'wire', 'holder'];
const connectionLabels: Record<ConnectionId, string> = {
  'battery-to-bulb': '把电池一端接到灯泡接线点',
  'bulb-to-return': '把灯泡另一端接回电池另一极',
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

export function PrimaryCircuitLabPlayer({ experiment, onTelemetry }: PrimaryCircuitLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [connections, setConnections] = useState<ConnectionId[]>([]);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('desk');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先认识器材，再把导线连成闭合回路点亮小灯泡。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const circuitClosed = connections.length === 2;
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 4) * 100);
  const closureValue = clamp(42 + connections.length * 24, 22, 99);
  const accuracyValue = clamp(94 - errors * 6, 52, 99);
  const readinessValue = clamp(progressPercent + connections.length * 16, 22, 100);

  const { reportReset } = useLabTelemetryReporter({
    experiment,
    step,
    totalSteps: 4,
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
        setCameraPreset('circuit');
        advanceStep(2, '器材识别完成，下一步连接导线形成闭合回路。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleConnect = (connectionId: ConnectionId | 'wrong') => {
    if (step !== 2 || completed) return;
    if (connectionId === 'wrong') {
      markError('只接一个点或接错极性，回路就无法闭合。');
      return;
    }
    setConnections((current) => {
      if (current.includes(connectionId)) return current;
      const next = [...current, connectionId];
      appendNote(`导线连接：${connectionLabels[connectionId]}`);
      if (next.length === 2) {
        setCameraPreset('bulb');
        advanceStep(3, '闭合回路已形成，下一步观察小灯泡是否亮起。');
      } else {
        setPromptTone('success');
        setPrompt('已完成一段连接，请继续把回路闭合。');
      }
      return next;
    });
  };

  const handleObserve = (choice: 'correct' | 'not-lit') => {
    if (step !== 3 || completed) return;
    if (!circuitClosed) {
      markError('请先把回路连接闭合，再观察灯泡现象。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：小灯泡亮起，说明电路已经闭合。');
      advanceStep(4, '现象记录完成，下一步总结点亮小灯泡的条件。');
      return;
    }
    markError('当前回路已经闭合，小灯泡应当亮起。');
  };

  const handleSummary = (choice: 'correct' | 'one-side' | 'no-loop') => {
    if (step !== 4 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：电池、导线和灯泡要正确连接成闭合回路，小灯泡才会亮。');
      return;
    }
    if (choice === 'one-side') {
      markError('只接一个接线点不能让灯泡亮，必须形成完整回路。');
      return;
    }
    markError('没有闭合回路，电流不能连续通过，小灯泡就不会亮。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setConnections([]);
    setSummaryChoice('');
    setCameraPreset('desk');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先认识器材，再把导线连成闭合回路点亮小灯泡。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '要把电池、导线和灯泡连成完整闭合回路。',
        '导线需要连接到正确接线点，不能只连一头。',
        '先观察灯泡亮灭，再总结点亮条件。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对闭合回路。',
        '建议先补全第二段连接，再重新观察灯泡状态。',
      ];

  return (
    <section className="panel playground-panel primary-circuit-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属小学科学实验页</h2>
          <p>把“认识器材—闭合回路—灯泡亮起”做成可操作的一条线，让小学生更容易理解简单电路的关键条件。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 4</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid primary-circuit-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">小学科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'desk' ? '桌面总览' : cameraPreset === 'circuit' ? '电路视角' : '灯泡视角'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>闭合度 {closureValue}</span><div className="chem-meter-bar"><i style={{ width: `${closureValue}%` }} /></div></div><div className="chem-meter"><span>准确率 {accuracyValue}</span><div className="chem-meter-bar"><i style={{ width: `${accuracyValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card primary-circuit-data-card"><span className="eyebrow">Readout</span><h3>电路状态板</h3><div className="primary-circuit-data-grid"><div className="primary-circuit-data-item"><span>连接段数</span><strong>{connections.length} / 2</strong><small>{circuitClosed ? '回路已闭合。' : '还需要继续补全回路。'}</small></div><div className="primary-circuit-data-item"><span>灯泡状态</span><strong>{circuitClosed ? '已点亮' : '未点亮'}</strong><small>{circuitClosed ? '电流可以通过完整回路。' : '先形成闭合回路。'}</small></div></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '简单电路'} · 当前重点：{step === 2 ? '闭合回路' : step === 3 ? '观察亮灭' : step === 4 ? '点亮条件' : '器材识别'}</small></div><div className="camera-actions"><button className={cameraPreset === 'desk' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('desk')} type="button">桌面</button><button className={cameraPreset === 'circuit' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('circuit')} type="button">电路</button><button className={cameraPreset === 'bulb' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bulb')} type="button">灯泡</button></div></div>

          <div className={`scene-canvas primary-circuit-stage preset-${cameraPreset}`}>
            <div className="primary-circuit-stage-head"><div><span className="eyebrow">Live Science</span><h3>{experiment.curriculum.theme}</h3><p>{promptTone === 'error' ? '当前连接方式有偏差，请回到回路结构重新检查。' : '让孩子看到“闭合回路”不是一句话，而是需要两段完整连接才会点亮灯泡。'}</p></div><div className="status-pill-row"><span className="status-pill ready">进度 {progressPercent}%</span><span className="status-pill">回路 {circuitClosed ? '已闭合' : '未闭合'}</span></div></div>
            <div className="primary-circuit-stage-grid">
              <article className={connections.length > 0 ? 'primary-circuit-card active' : 'primary-circuit-card'}><div className="reaction-card-head"><strong>简单电路台</strong><small>{connections.length > 0 ? '连接进行中' : '等待连接'}</small></div><div className="primary-circuit-board"><div className="battery-pack"><span className="polarity plus">+</span><span className="polarity minus">-</span></div><div className={connections.includes('battery-to-bulb') ? 'circuit-wire top active' : 'circuit-wire top'} /><div className={connections.includes('bulb-to-return') ? 'circuit-wire bottom active' : 'circuit-wire bottom'} /><div className="bulb-holder" /><div className={circuitClosed ? 'primary-bulb-shell lit' : 'primary-bulb-shell'}><div className={circuitClosed ? 'primary-bulb-glow active' : 'primary-bulb-glow'} /></div></div></article>
              <article className={circuitClosed ? 'primary-circuit-card active' : 'primary-circuit-card'}><div className="reaction-card-head"><strong>点亮结果区</strong><small>{circuitClosed ? '灯泡已亮' : '等待闭合'}</small></div><div className="primary-bulb-stage"><div className={circuitClosed ? 'bulb-spot active' : 'bulb-spot'} /><div className={circuitClosed ? 'bulb-rays active' : 'bulb-rays'} /></div></article>
            </div>
            <div className="primary-circuit-insight-row"><article className="lab-readout-card active"><span>连接状态</span><strong>{connections.length === 2 ? '两段导线已连接' : `已连 ${connections.length}/2`}</strong><small>至少要有两段正确连接，才可能形成闭合回路。</small></article><article className="lab-readout-card calm"><span>电路结果</span><strong>{circuitClosed ? '闭合回路形成' : '回路未闭合'}</strong><small>闭合回路是电流连续通过的关键条件。</small></article><article className={circuitClosed ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>核心现象</span><strong>{circuitClosed ? '小灯泡亮起' : '小灯泡不亮'}</strong><small>连接正确后，灯泡会亮起来。</small></article></div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className={connections.includes('battery-to-bulb') ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleConnect('battery-to-bulb')} type="button"><strong>连接电池到灯泡接线点</strong><span>完成第一段关键连接。</span></button><button className={connections.includes('bulb-to-return') ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleConnect('bulb-to-return')} type="button"><strong>连接灯泡回到电池另一极</strong><span>完成回路闭合。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleConnect('wrong')} type="button"><strong>只连一头就停止</strong><span>错误演示：回路不会闭合。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleObserve('correct')} type="button"><strong>记录“小灯泡亮起”</strong><span>闭合回路形成后的正确现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('not-lit')} type="button"><strong>记录“小灯泡不亮”</strong><span>错误演示：与现有连接状态不符。</span></button></> : null}{step === 4 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>电池、导线和灯泡要正确连接成闭合回路，小灯泡才会亮</strong><span>完整总结点亮条件。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('one-side')} type="button"><strong>只接一个接线点也能亮</strong><span>错误演示：回路不完整。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-loop')} type="button"><strong>不需要闭合回路也能亮</strong><span>错误演示：忽略电流通路。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>连接状态：{connections.length}/2 / 灯泡状态：{circuitClosed ? '已点亮' : '未点亮'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意闭合回路'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“让小灯泡亮起来”升级成回路连接、亮灯反馈和条件总结一体化的专属小学页。</small></section>
        </aside>
      </div>
    </section>
  );
}
