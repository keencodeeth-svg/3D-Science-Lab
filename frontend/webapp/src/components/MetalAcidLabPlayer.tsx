import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tube' | 'flame';
type MaterialId = 'test-tube' | 'zinc-granule' | 'acid-dropper' | 'burning-splint' | 'tube-rack';
type TimelineState = 'done' | 'current' | 'todo';

interface MetalAcidLabPlayerProps {
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
  2: '向金属中滴加酸',
  3: '观察气泡现象',
  4: '检验生成气体',
  5: '总结金属与酸反应',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别试管、锌粒、滴管、燃着木条和试管架。',
  2: '向装有锌粒的试管中滴加稀酸，观察是否有气泡产生。',
  3: '记录试管内是否持续放出气泡。',
  4: '用燃着木条检验生成气体。',
  5: '总结活泼金属和酸反应生成的气体与规律。',
};

const materialLabels: Record<MaterialId, string> = {
  'test-tube': '试管',
  'zinc-granule': '锌粒',
  'acid-dropper': '滴管',
  'burning-splint': '燃着木条',
  'tube-rack': '试管架',
};

const materialOrder: MaterialId[] = ['test-tube', 'zinc-granule', 'acid-dropper', 'burning-splint', 'tube-rack'];

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

export function MetalAcidLabPlayer({ experiment, onTelemetry }: MetalAcidLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [reacting, setReacting] = useState(false);
  const [observed, setObserved] = useState(false);
  const [gasTestChoice, setGasTestChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先向锌粒中滴加稀酸，再观察气泡并检验生成气体。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const bubbleValue = clamp(42 + (reacting ? 18 : 0) + (observed ? 18 : 0) + (gasTestChoice === 'correct' ? 16 : 0), 24, 99);
  const clarityValue = clamp(42 + (reacting ? 14 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (reacting ? 14 : 0) + (observed ? 16 : 0), 20, 100);

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
        setCameraPreset('tube');
        advanceStep(2, '器材识别完成，下一步向锌粒中滴加稀酸。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleReact = (choice: 'correct' | 'water') => {
    if (step !== 2 || completed) return;
    if (choice === 'water') {
      markError('请滴加稀酸而不是清水，才能明显观察到反应。');
      return;
    }
    setReacting(true);
    appendNote('操作记录：锌粒与稀酸接触后，试管中开始持续放出气泡。');
    advanceStep(3, '反应已开始，下一步观察气泡是否持续产生。');
  };

  const handleObserve = (choice: 'correct' | 'none' | 'solid') => {
    if (step !== 3 || completed) return;
    setObserved(choice === 'correct');
    if (!reacting) {
      markError('请先让锌粒和稀酸反应，再观察现象。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：试管内持续有气泡放出，说明有气体生成。');
      advanceStep(4, '气泡现象已观察到，下一步检验生成气体。');
      return;
    }
    if (choice === 'none') {
      markError('试管中并不是没有现象，正确操作后应能看到明显气泡。');
      return;
    }
    markError('观察重点不是“出现固体”，而是有气泡持续放出。');
  };

  const handleGasTest = (choice: 'correct' | 'steady' | 'extinguish') => {
    if (step !== 4 || completed) return;
    setGasTestChoice(choice);
    if (!observed) {
      markError('请先确认有气泡产生，再进行气体检验。');
      return;
    }
    if (choice === 'correct') {
      setCameraPreset('flame');
      appendNote('检验记录：生成气体遇火有轻微爆鸣，说明是氢气。');
      advanceStep(5, '气体检验完成，最后总结金属与酸反应规律。');
      return;
    }
    if (choice === 'steady') {
      markError('如果一直稳定燃烧，更像氧气支持燃烧，不符合本实验现象。');
      return;
    }
    markError('并不是使木条熄灭，正确现象是点燃时有轻微爆鸣。');
  };

  const handleSummary = (choice: 'correct' | 'oxygen' | 'co2') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：活泼金属与酸反应通常会生成盐和氢气。');
      return;
    }
    if (choice === 'oxygen') {
      markError('本实验生成的不是氧气，气体检验结果说明它是氢气。');
      return;
    }
    markError('本实验也不是二氧化碳，燃着木条的现象与二氧化碳不符。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setReacting(false);
    setObserved(false);
    setGasTestChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新向锌粒中滴加稀酸并检验生成气体。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先滴加稀酸，再观察气泡是否持续放出。',
        '检验气体时重点记住“轻微爆鸣”。',
        '总结时要说清楚生成物里有氢气。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对反应现象。',
        '建议重新执行“滴加稀酸 → 观察气泡 → 检验气体”的流程。',
      ];

  return (
    <section className="panel playground-panel metalacid-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把气泡生成、气体检验和结论串在一页里，让“金属与酸反应”既能看现象，也能得结论。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid metalacid-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tube' ? '试管观察' : '点燃检验'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>反应强度 {bubbleValue}</span><div className="chem-meter-bar"><i style={{ width: `${bubbleValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card metalacid-data-card"><span className="eyebrow">Readout</span><h3>反应读数板</h3><div className="generic-readout-grid metalacid-readout-grid"><article className={reacting ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>反应状态</span><strong>{reacting ? '已开始放气' : '待反应'}</strong><small>{reacting ? '锌粒与稀酸接触后开始产气。' : '先向金属中滴加稀酸。'}</small></article><article className={gasTestChoice ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>气体检验</span><strong>{gasTestChoice === 'correct' ? '轻微爆鸣' : gasTestChoice ? '判断错误' : '--'}</strong><small>{gasTestChoice === 'correct' ? '该现象对应氢气。' : '先完成木条检验。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '生成氢气和盐' : '等待总结'}</strong><small>活泼金属与酸反应通常会生成盐和氢气。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '金属与酸反应装置'} · 当前重点：{step <= 2 ? '建立反应' : step === 3 ? '看气泡' : step === 4 ? '检验气体' : '总结规律'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'tube' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tube')} type="button">试管</button><button className={cameraPreset === 'flame' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flame')} type="button">检验</button></div></div>

          <div className={`scene-canvas metalacid-stage preset-${cameraPreset} ${reacting ? 'reacting' : ''} ${gasTestChoice === 'correct' ? 'tested' : ''}`}>
            <div className="metalacid-rig">
              <div className="ma-rack" />
              <div className="ma-tube">
                <div className={reacting ? 'ma-liquid active' : 'ma-liquid'} />
                <div className="ma-zinc" />
                <div className={reacting ? 'ma-bubble bubble-1 active' : 'ma-bubble bubble-1'} />
                <div className={reacting ? 'ma-bubble bubble-2 active' : 'ma-bubble bubble-2'} />
                <div className={reacting ? 'ma-bubble bubble-3 active' : 'ma-bubble bubble-3'} />
              </div>
              <div className="ma-dropper" />
              <div className={gasTestChoice === 'correct' ? 'ma-splint active' : 'ma-splint'} />
              <div className={gasTestChoice === 'correct' ? 'ma-spark active' : 'ma-spark'} />
            </div>
          </div>

          <div className="observation-ribbon metalacid-observation-row"><article className={reacting ? 'observation-chip active' : 'observation-chip calm'}><strong>反应建立</strong><span>{reacting ? '试管内已持续放出气泡。' : '先滴加稀酸建立反应。'}</span></article><article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>气泡现象</strong><span>{observed ? '说明有气体生成。' : '等待完成现象观察。'}</span></article><article className={gasTestChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>气体检验</strong><span>{gasTestChoice === 'correct' ? '点燃时有轻微爆鸣。' : '等待完成木条检验。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleReact('correct')} type="button"><strong>向锌粒中滴加稀酸</strong><span>让金属和酸开始反应。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleReact('water')} type="button"><strong>滴加清水</strong><span>错误演示：现象不明显。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleObserve('correct')} type="button"><strong>记录“持续有气泡放出”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('none')} type="button"><strong>记录“没有明显现象”</strong><span>错误演示：忽略反应变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('solid')} type="button"><strong>记录“只生成固体，没有气泡”</strong><span>错误演示：观察重点错误。</span></button></> : null}{step === 4 ? <><button className={gasTestChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleGasTest('correct')} type="button"><strong>记录“点燃时有轻微爆鸣”</strong><span>对应氢气的检验现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleGasTest('steady')} type="button"><strong>记录“木条燃烧更旺”</strong><span>错误演示：更像氧气现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleGasTest('extinguish')} type="button"><strong>记录“木条熄灭”</strong><span>错误演示：与本实验不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>活泼金属与酸反应通常会生成盐和氢气</strong><span>完整总结反应规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('oxygen')} type="button"><strong>生成的是氧气</strong><span>错误演示：与检验现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('co2')} type="button"><strong>生成的是二氧化碳</strong><span>错误演示：与点燃现象不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{reacting ? '已建立反应' : '待反应'} / {gasTestChoice === 'correct' ? '已检验出氢气' : '待检验'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先看气泡，再做气体检验'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“金属与酸反应”升级成气泡与气体检验联动的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
