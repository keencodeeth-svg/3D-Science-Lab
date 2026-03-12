import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'top' | 'pattern';
type MaterialId = 'tray' | 'magnet' | 'paper' | 'filings' | 'brush';
type TimelineState = 'done' | 'current' | 'todo';

interface MagneticFieldLinesLabPlayerProps {
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
  2: '放置条形磁铁',
  3: '撒铁屑',
  4: '观察磁感线',
  5: '总结分布特点',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别托盘、条形磁铁、白纸、铁屑和毛刷。',
  2: '把条形磁铁放在白纸下方中央。',
  3: '均匀撒上铁屑，让铁屑在磁场中重新排布。',
  4: '轻轻敲击纸面，观察铁屑形成的弯曲磁感线。',
  5: '总结磁感线在磁铁两极附近更密集。',
};

const materialLabels: Record<MaterialId, string> = {
  tray: '托盘',
  magnet: '条形磁铁',
  paper: '白纸',
  filings: '铁屑',
  brush: '毛刷',
};

const materialOrder: MaterialId[] = ['tray', 'magnet', 'paper', 'filings', 'brush'];

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

export function MagneticFieldLinesLabPlayer({ experiment, onTelemetry }: MagneticFieldLinesLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [magnetPlaced, setMagnetPlaced] = useState(false);
  const [filingsSprinkled, setFilingsSprinkled] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过条形磁铁和铁屑观察磁感线的分布。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const fieldValue = clamp(30 + (magnetPlaced ? 18 : 0) + (filingsSprinkled ? 24 : 0), 20, 99);
  const patternValue = clamp(24 + (cameraPreset !== 'bench' ? 14 : 0) + (observationChoice === 'correct' ? 24 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (magnetPlaced ? 10 : 0) + (filingsSprinkled ? 14 : 0), 20, 100);

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
        setCameraPreset('top');
        advanceStep(2, '器材识别完成，先放置条形磁铁。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleMagnet = (choice: 'correct' | 'outside') => {
    if (step !== 2 || completed) return;
    if (choice === 'outside') {
      markError('条形磁铁应放在白纸中央下方，便于形成完整磁场分布。');
      return;
    }
    setMagnetPlaced(true);
    appendNote('装置状态：条形磁铁已放置在白纸中央下方。');
    advanceStep(3, '磁铁已放好，下一步均匀撒上铁屑。');
  };

  const handleFilings = (choice: 'correct' | 'pile') => {
    if (step !== 3 || completed) return;
    if (!magnetPlaced) {
      markError('请先放好条形磁铁，再撒铁屑。');
      return;
    }
    if (choice === 'pile') {
      markError('铁屑要均匀撒开，堆成一团不利于观察磁感线。');
      return;
    }
    setFilingsSprinkled(true);
    setCameraPreset('pattern');
    appendNote('操作记录：铁屑已均匀撒开并开始沿磁场方向排布。');
    advanceStep(4, '铁屑已撒好，请观察磁感线分布形状。');
  };

  const handleObserve = (choice: 'correct' | 'random' | 'center') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!magnetPlaced || !filingsSprinkled) {
      markError('请先放置磁铁并撒上铁屑，再观察分布。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：铁屑形成弯曲线条，两极附近更密集。');
      advanceStep(5, '已识别磁感线分布，下一步总结其特点。');
      return;
    }
    markError(choice === 'random' ? '铁屑不会随机散落，而会沿磁场方向重新排列。' : '磁感线并不是只有磁铁中央最密，两极附近更明显。');
  };

  const handleSummary = (choice: 'correct' | 'same' | 'none') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：磁感线呈弯曲分布，磁铁两极附近更密。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'same' ? '磁感线疏密并不处处相同，两极附近更密集。' : '磁场不是看不见就不存在，铁屑分布正是磁场存在的证据。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setMagnetPlaced(false);
    setFilingsSprinkled(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察磁感线分布。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先放磁铁，再均匀撒铁屑。', '观察时重点看弯曲线条和两极附近疏密。', '结论关键词是“磁感线”“两极更密”。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对铁屑是否均匀撒在白纸上。',
        '建议按“识别 → 放磁铁 → 撒铁屑 → 观察分布 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel magneticfield-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把条形磁铁、白纸和铁屑纹理做成可见磁感线的真实演示场景。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid magneticfield-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'top' ? '顶视装置' : '磁场纹理'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>磁场建立 {fieldValue}</span><div className="chem-meter-bar"><i style={{ width: `${fieldValue}%` }} /></div></div><div className="chem-meter"><span>纹理清晰度 {patternValue}</span><div className="chem-meter-bar"><i style={{ width: `${patternValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card magneticfield-data-card"><span className="eyebrow">Readout</span><h3>磁场读数板</h3><div className="generic-readout-grid magneticfield-readout-grid"><article className={magnetPlaced ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>磁铁放置</span><strong>{magnetPlaced ? '已到位' : '--'}</strong><small>{magnetPlaced ? '白纸下方磁场已建立。' : '先放置条形磁铁。'}</small></article><article className={filingsSprinkled ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>铁屑分布</span><strong>{filingsSprinkled ? '已显现' : '--'}</strong><small>{filingsSprinkled ? '磁感线纹理开始可见。' : '等待均匀撒上铁屑。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '两极附近更密' : '等待总结'}</strong><small>磁感线能反映磁场方向和疏密变化。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '磁感线装置'} · 当前重点：{step <= 2 ? '放置磁铁' : step === 3 ? '均匀撒铁屑' : '观察弯曲纹理'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'top' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('top')} type="button">顶视</button><button className={cameraPreset === 'pattern' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('pattern')} type="button">纹理</button></div></div>
          <div className={`scene-canvas magneticfield-stage preset-${cameraPreset} ${magnetPlaced ? 'magnet-placed' : ''} ${filingsSprinkled ? 'filings-sprinkled' : ''}`}>
            <div className="magneticfield-rig"><div className="mf-tray"><div className={magnetPlaced ? 'mf-magnet active' : 'mf-magnet'}><span className="north">N</span><span className="south">S</span></div><div className="mf-paper" /><div className={filingsSprinkled ? 'mf-filings active' : 'mf-filings'} /><div className={filingsSprinkled ? 'mf-poles active' : 'mf-poles'} /></div></div>
          </div>
          <div className="observation-ribbon magneticfield-observation-row"><article className={magnetPlaced ? 'observation-chip active' : 'observation-chip calm'}><strong>磁铁</strong><span>{magnetPlaced ? '条形磁铁已放入装置。' : '待放置磁铁。'}</span></article><article className={filingsSprinkled ? 'observation-chip active' : 'observation-chip calm'}><strong>铁屑</strong><span>{filingsSprinkled ? '铁屑已显出磁场纹理。' : '等待撒铁屑。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>现象判断</strong><span>{observationChoice === 'correct' ? '已识别两极更密集。' : '等待完成观察。'}</span></article></div>
          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleMagnet('correct')} type="button"><strong>把条形磁铁放在白纸中央下方</strong><span>形成稳定磁场。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleMagnet('outside')} type="button"><strong>把磁铁放到白纸外侧</strong><span>错误演示：难以形成完整分布。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFilings('correct')} type="button"><strong>均匀撒上铁屑并轻敲纸面</strong><span>让铁屑沿磁场方向排列。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFilings('pile')} type="button"><strong>把铁屑只堆在一个角落</strong><span>错误演示：不利于观察磁感线。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“铁屑形成弯曲线条，两极附近更密集”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('random')} type="button"><strong>记录“铁屑随机散开，没有规律”</strong><span>错误演示：忽略磁场作用。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('center')} type="button"><strong>记录“只有中间最密，两端没什么变化”</strong><span>错误演示：现象判断不准。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>磁感线呈弯曲分布，磁铁两极附近更密集</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('same')} type="button"><strong>磁感线在各处都一样密，没有差别</strong><span>错误演示：忽略疏密变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('none')} type="button"><strong>因为磁场看不见，所以磁铁周围没有磁场</strong><span>错误演示：概念错误。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{magnetPlaced ? '磁铁已放' : '磁铁待放'} / {filingsSprinkled ? '铁屑已撒' : '铁屑待撒'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意铁屑要均匀撒开并轻敲纸面'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“磁感线观察”升级成可见铁屑磁场纹理的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
