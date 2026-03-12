import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'balance' | 'flask';
type MaterialId = 'balance' | 'beaker' | 'glass-rod' | 'flask' | 'funnel';
type MassMode = 'correct' | 'low' | null;
type VolumeMode = 'correct' | 'over' | null;
type TimelineState = 'done' | 'current' | 'todo';

interface SolutionPreparationLabPlayerProps {
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
  2: '称量溶质',
  3: '溶解并转移',
  4: '定容到刻度线',
  5: '总结配制流程',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别天平、烧杯、玻璃棒、容量瓶和漏斗。',
  2: '准确称量所需质量的溶质，建立正确配制基础。',
  3: '先在烧杯中充分溶解，再沿玻璃棒转移到容量瓶。',
  4: '继续加水到刻度线，使凹液面最低处与刻度线相切。',
  5: '总结配制一定质量分数溶液的规范流程。',
};

const materialLabels: Record<MaterialId, string> = {
  balance: '天平',
  beaker: '烧杯',
  'glass-rod': '玻璃棒',
  flask: '容量瓶',
  funnel: '漏斗',
};

const materialOrder: MaterialId[] = ['balance', 'beaker', 'glass-rod', 'flask', 'funnel'];

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

export function SolutionPreparationLabPlayer({ experiment, onTelemetry }: SolutionPreparationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [massMode, setMassMode] = useState<MassMode>(null);
  const [transferred, setTransferred] = useState(false);
  const [volumeMode, setVolumeMode] = useState<VolumeMode>(null);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先准确称量，再溶解、转移、定容。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const measuredMass = massMode === 'correct' ? 5.0 : massMode === 'low' ? 4.0 : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const accuracyValue = clamp(44 + (massMode === 'correct' ? 18 : 0) + (transferred ? 16 : 0) + (volumeMode === 'correct' ? 18 : 0), 24, 99);
  const clarityValue = clamp(40 + (cameraPreset !== 'bench' ? 10 : 0) + (transferred ? 16 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (massMode ? 12 : 0) + (volumeMode === 'correct' ? 18 : 0), 20, 100);

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
        setCameraPreset('balance');
        advanceStep(2, '器材识别完成，下一步准确称量溶质。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleWeigh = (choice: 'correct' | 'low') => {
    if (step !== 2 || completed) return;
    setMassMode(choice);
    if (choice === 'low') {
      markError('称量不足会直接导致所配溶液浓度偏低。');
      return;
    }
    appendNote('称量完成：已准确称取 5.0 g 溶质。');
    setCameraPreset('bench');
    advanceStep(3, '称量正确，下一步先溶解，再转移到容量瓶。');
  };

  const handleTransfer = (choice: 'correct' | 'dry') => {
    if (step !== 3 || completed) return;
    if (massMode !== 'correct') {
      markError('请先完成准确称量，再进入溶解与转移步骤。');
      return;
    }
    if (choice === 'dry') {
      markError('不能把未充分溶解的固体直接倒入容量瓶。');
      return;
    }
    setTransferred(true);
    appendNote('溶解转移：烧杯中已充分溶解，并沿玻璃棒转移到容量瓶。');
    setCameraPreset('flask');
    advanceStep(4, '转移完成，下一步加水并定容到刻度线。');
  };

  const handleVolume = (choice: 'correct' | 'over') => {
    if (step !== 4 || completed) return;
    setVolumeMode(choice);
    if (!transferred) {
      markError('请先完成溶解和转移，再进行定容。');
      return;
    }
    if (choice === 'over') {
      markError('液面超过刻度线会导致溶液浓度偏低。');
      return;
    }
    appendNote('定容完成：凹液面最低处与刻度线相切。');
    advanceStep(5, '定容正确，最后总结规范配制流程。');
  };

  const handleSummary = (choice: 'correct' | 'skip' | 'reverse') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：称量 → 溶解 → 转移 → 定容 → 摇匀，是规范的配制流程。');
      return;
    }
    if (choice === 'skip') {
      markError('不能跳过转移或定容步骤，否则配制结果不准确。');
      return;
    }
    markError('流程不能颠倒，应先称量和溶解，再转移定容。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setMassMode(null);
    setTransferred(false);
    setVolumeMode(null);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新称量、溶解、转移并定容。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '称量一定要准确，这是浓度正确的前提。',
        '应先在烧杯中溶解，再转移到容量瓶。',
        '定容时看凹液面最低处与刻度线相切。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对配制流程。',
        '建议重新执行“称量 → 溶解 → 转移 → 定容”的流程。',
      ];

  return (
    <section className="panel playground-panel solutionprep-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把天平读数、转移引流和容量瓶定容做成连续步骤，让配液流程更接近真实实验室操作。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid solutionprep-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'balance' ? '称量观察' : '容量瓶细节'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>准确度 {accuracyValue}</span><div className="chem-meter-bar"><i style={{ width: `${accuracyValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card solutionprep-data-card"><span className="eyebrow">Readout</span><h3>配液读数板</h3><div className="generic-readout-grid solutionprep-readout-grid"><article className={massMode === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>称量质量</span><strong>{massMode ? `${measuredMass.toFixed(1)} g` : '--'}</strong><small>{massMode === 'correct' ? '称量准确。' : massMode === 'low' ? '质量偏低。' : '先完成称量。'}</small></article><article className={transferred ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>转移状态</span><strong>{transferred ? '已溶解并转移' : '待转移'}</strong><small>{transferred ? '已沿玻璃棒顺利进入容量瓶。' : '先在烧杯中充分溶解。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>定容结果</span><strong>{volumeMode === 'correct' ? '凹液面对线' : volumeMode === 'over' ? '超过刻度线' : '待定容'}</strong><small>定容时应看凹液面最低处与刻度线相切。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '配制溶液装置'} · 当前重点：{step <= 2 ? '准确称量' : step === 3 ? '溶解转移' : '容量瓶定容'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'balance' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('balance')} type="button">天平</button><button className={cameraPreset === 'flask' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flask')} type="button">容量瓶</button></div></div>

          <div className={`scene-canvas solutionprep-stage preset-${cameraPreset} ${massMode ?? 'none'} ${transferred ? 'transferred' : ''} ${volumeMode ?? 'volume-none'}`}>
            <div className="solutionprep-rig">
              <div className={`sp-balance ${massMode ?? 'idle'}`}>
                <div className="sp-balance-screen">{massMode ? `${measuredMass.toFixed(1)} g` : '--'}</div>
                <div className={massMode ? 'sp-weigh-boat active' : 'sp-weigh-boat'} />
              </div>
              <div className="sp-beaker">
                <div className={massMode ? 'sp-liquid active' : 'sp-liquid'} />
                <div className={transferred ? 'sp-rod active' : 'sp-rod'} />
              </div>
              <div className={transferred ? 'sp-funnel active' : 'sp-funnel'} />
              <div className={transferred ? 'sp-flask active' : 'sp-flask'}>
                <div className={transferred ? 'sp-solution active' : 'sp-solution'} />
                <div className={volumeMode === 'correct' ? 'sp-meniscus correct' : volumeMode === 'over' ? 'sp-meniscus over' : 'sp-meniscus'} />
                <div className="sp-mark-line" />
              </div>
            </div>
          </div>

          <div className="observation-ribbon solutionprep-observation-row"><article className={massMode === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>称量结果</strong><span>{massMode === 'correct' ? '溶质质量称量准确。' : massMode === 'low' ? '当前质量偏低。' : '先准确称量。'}</span></article><article className={transferred ? 'observation-chip active' : 'observation-chip calm'}><strong>溶解转移</strong><span>{transferred ? '已完成溶解并转移到容量瓶。' : '等待完成溶解与转移。'}</span></article><article className={volumeMode === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>定容状态</strong><span>{volumeMode === 'correct' ? '凹液面最低处已对准刻度线。' : '等待完成定容判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleWeigh('correct')} type="button"><strong>准确称取 5.0 g 溶质</strong><span>为后续配液建立正确浓度基础。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleWeigh('low')} type="button"><strong>只称取 4.0 g 溶质</strong><span>错误演示：会导致浓度偏低。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleTransfer('correct')} type="button"><strong>先溶解，再沿玻璃棒转移</strong><span>规范完成烧杯到容量瓶转移。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleTransfer('dry')} type="button"><strong>未溶解就直接倒入容量瓶</strong><span>错误演示：流程不规范。</span></button></> : null}{step === 4 ? <><button className={volumeMode === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleVolume('correct')} type="button"><strong>加水到凹液面最低处与刻度线相切</strong><span>这是本实验的正确定容方式。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleVolume('over')} type="button"><strong>把液面加到超过刻度线</strong><span>错误演示：浓度将偏低。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>称量 → 溶解 → 转移 → 定容 → 摇匀</strong><span>完整总结规范的配液流程。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('skip')} type="button"><strong>可以跳过转移或定容</strong><span>错误演示：会影响最终浓度。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('reverse')} type="button"><strong>先定容再称量也可以</strong><span>错误演示：流程颠倒。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{massMode ? '已称量' : '待称量'} / {transferred ? '已转移' : '待转移'} / {volumeMode === 'correct' ? '已定容' : '待定容'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意溶解、转移、定容顺序'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“配制一定溶质质量分数的溶液”升级成带称量、转移和定容细节的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
