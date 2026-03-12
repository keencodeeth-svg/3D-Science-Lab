import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'desk' | 'compare' | 'close';
type MaterialId = 'beaker-a' | 'beaker-b' | 'salt' | 'sand' | 'stirrer';
type TimelineState = 'done' | 'current' | 'todo';

interface SolubilityLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别材料',
  2: '加入待测物质',
  3: '搅拌并比较',
  4: '记录结果',
  5: '总结溶解现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别烧杯 A、烧杯 B、食盐、沙子和玻璃棒。',
  2: '把食盐和沙子分别加入不同烧杯，形成清晰对照。',
  3: '搅拌后比较两种物质在水中的变化。',
  4: '根据现象记录哪些物质能溶解、哪些不能。',
  5: '把溶解结果和搅拌影响总结成完整结论。',
};

const materialLabels: Record<MaterialId, string> = {
  'beaker-a': '烧杯 A',
  'beaker-b': '烧杯 B',
  salt: '食盐',
  sand: '沙子',
  stirrer: '玻璃棒',
};

const materialOrder: MaterialId[] = ['beaker-a', 'beaker-b', 'salt', 'sand', 'stirrer'];

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

export function SolubilityLabPlayer({ experiment, onTelemetry }: SolubilityLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [saltAdded, setSaltAdded] = useState(false);
  const [sandAdded, setSandAdded] = useState(false);
  const [stirred, setStirred] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('desk');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先形成盐和沙子的对照，再用搅拌比较溶解现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const comparisonReady = saltAdded && sandAdded;
  const saltState = stirred ? '已溶解' : saltAdded ? '正在溶解' : '待加入';
  const sandState = stirred ? '未溶解，沉底' : sandAdded ? '待比较' : '待加入';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const compareValue = clamp(42 + (comparisonReady ? 20 : 0) + (stirred ? 18 : 0), 28, 99);
  const clarityValue = clamp(46 + (saltAdded ? 10 : 0) + (sandAdded ? 10 : 0) + (stirred ? 16 : 0), 34, 99);
  const readinessValue = clamp(progressPercent + (comparisonReady ? 18 : 0) + (stirred ? 14 : 0), 22, 100);

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
        setCameraPreset('compare');
        advanceStep(2, '材料识别完成，下一步把食盐和沙子分别加入不同烧杯。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个材料，请继续。`);
      }
      return next;
    });
  };

  const handleAdd = (action: 'salt' | 'sand' | 'same') => {
    if (step !== 2 || completed) return;
    if (action === 'same') {
      markError('两只烧杯需要加入不同物质，才能形成清晰对照。');
      return;
    }

    if (action === 'salt') {
      if (!saltAdded) {
        setSaltAdded(true);
        appendNote('加样记录：食盐已加入烧杯 A。');
      }
    }

    if (action === 'sand') {
      if (!sandAdded) {
        setSandAdded(true);
        appendNote('加样记录：沙子已加入烧杯 B。');
      }
    }


    const nextReady = (action === 'salt' ? true : saltAdded) && (action === 'sand' ? true : sandAdded);
    if (nextReady) {
      setCameraPreset('close');
      advanceStep(3, '两组材料已加入，下一步搅拌并比较溶解情况。');
      return;
    }

    setPromptTone('success');
    setPrompt('已加入一组材料，请继续完成另一组对照。');
  };

  const handleStir = (choice: 'correct' | 'skip') => {
    if (step !== 3 || completed) return;
    if (!comparisonReady) {
      markError('请先把食盐和沙子分别加入不同烧杯。');
      return;
    }
    if (choice === 'skip') {
      markError('请先搅拌并观察，再根据现象下结论。');
      return;
    }
    setStirred(true);
    appendNote('比较观察：搅拌后食盐逐渐消失，沙子仍沉在杯底。');
    advanceStep(4, '搅拌比较完成，下一步记录哪种物质能溶解。');
  };

  const handleRecord = (choice: 'correct' | 'both' | 'reverse') => {
    if (step !== 4 || completed) return;
    if (!stirred) {
      markError('请先完成搅拌和比较，再记录结果。');
      return;
    }
    if (choice === 'correct') {
      appendNote('结果记录：食盐能溶解，沙子不能溶解。');
      advanceStep(5, '结果记录完成，下一步总结溶解现象和搅拌作用。');
      return;
    }
    if (choice === 'both') {
      markError('不是两种物质都会完全溶解，沙子仍然能看到沉底现象。');
      return;
    }
    markError('溶解结果不能记反，食盐能溶解、沙子不溶解。');
  };

  const handleSummary = (choice: 'correct' | 'stir-only' | 'same-result') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：不同物质在水中的溶解情况不同，搅拌会影响溶解快慢。');
      return;
    }
    if (choice === 'stir-only') {
      markError('不能只总结搅拌作用，还要说明食盐和沙子的溶解差异。');
      return;
    }
    markError('不同物质在水中的结果并不相同，食盐和沙子的现象明显不同。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSaltAdded(false);
    setSandAdded(false);
    setStirred(false);
    setSummaryChoice('');
    setCameraPreset('desk');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先形成盐和沙子的对照，再用搅拌比较溶解现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '要先形成“食盐 vs 沙子”的对照，再观察结果。',
        '搅拌能帮助比较溶解快慢，但不能改变“不溶解”的物质性质。',
        '记录时注意区分“看不见了”和“沉到底部”两种现象。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对实验现象。',
        '建议回到对照设置，再重新搅拌并观察烧杯变化。',
      ];

  return (
    <section className="panel playground-panel solubility-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属小学科学实验页</h2><p>把“形成对照—搅拌比较—记录溶解”做成一套完整流程，让溶解现象不再只是静态配置卡片。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>

      <div className="playground-grid solubility-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">小学科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'desk' ? '桌面总览' : cameraPreset === 'compare' ? '对照视角' : '烧杯特写'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>比较度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card solubility-data-card"><span className="eyebrow">Readout</span><h3>溶解结果板</h3><div className="solubility-data-grid"><div className="solubility-data-item"><span>烧杯 A</span><strong>{saltState}</strong><small>食盐在水中会逐渐看不见。</small></div><div className="solubility-data-item"><span>烧杯 B</span><strong>{sandState}</strong><small>沙子通常仍能看到颗粒并沉底。</small></div></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '烧杯对照'} · 当前重点：{step === 2 ? '形成对照' : step === 3 ? '搅拌比较' : step === 4 ? '结果判断' : '结论总结'}</small></div><div className="camera-actions"><button className={cameraPreset === 'desk' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('desk')} type="button">桌面</button><button className={cameraPreset === 'compare' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('compare')} type="button">对照</button><button className={cameraPreset === 'close' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('close')} type="button">特写</button></div></div>

          <div className={`scene-canvas solubility-stage preset-${cameraPreset}`}>
            <div className="solubility-stage-head"><div><span className="eyebrow">Live Science</span><h3>{experiment.curriculum.theme}</h3><p>{promptTone === 'error' ? '当前对照设置或结果判断有偏差，请先修正。' : '把两只烧杯的变化放到同一画面里，帮助学生直接比较“能溶解”和“不能溶解”的差别。'}</p></div><div className="status-pill-row"><span className="status-pill ready">进度 {progressPercent}%</span><span className="status-pill">对照 {comparisonReady ? '已建立' : '待建立'}</span></div></div>
            <div className="solubility-stage-grid">
              <article className={saltAdded ? 'solubility-card active' : 'solubility-card'}><div className="reaction-card-head"><strong>烧杯 A · 食盐</strong><small>{saltState}</small></div><div className="solubility-beaker"><div className="solubility-liquid" /><div className={stirred ? 'solute-cloud active' : saltAdded ? 'solute-cloud partial' : 'solute-cloud'} /><div className={stirred ? 'stirrer-shaft active' : 'stirrer-shaft'} /></div></article>
              <article className={sandAdded ? 'solubility-card active' : 'solubility-card'}><div className="reaction-card-head"><strong>烧杯 B · 沙子</strong><small>{sandState}</small></div><div className="solubility-beaker"><div className="solubility-liquid" /><div className={sandAdded ? 'sand-sediment active' : 'sand-sediment'} /><div className={stirred ? 'stirrer-shaft active' : 'stirrer-shaft'} /></div></article>
            </div>
            <div className="solubility-insight-row"><article className="lab-readout-card active"><span>对照组</span><strong>{comparisonReady ? '食盐 / 沙子已分开' : '待设置'}</strong><small>两只烧杯加入不同物质，现象才有比较价值。</small></article><article className="lab-readout-card calm"><span>搅拌结果</span><strong>{stirred ? '食盐消失更快，沙子仍沉底' : '待搅拌观察'}</strong><small>搅拌有助于比较溶解快慢，但不改变物质本性。</small></article><article className={stirred ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>核心现象</span><strong>{saltState} / {sandState}</strong><small>食盐能溶解，沙子通常不能溶解。</small></article></div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别材料'}</span></button>)) : null}{step === 2 ? <><button className={saltAdded ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleAdd('salt')} type="button"><strong>给烧杯 A 加食盐</strong><span>形成可溶物对照组。</span></button><button className={sandAdded ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleAdd('sand')} type="button"><strong>给烧杯 B 加沙子</strong><span>形成不易溶解对照组。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleAdd('same')} type="button"><strong>两杯都加同一种物质</strong><span>错误演示：没有形成有效对照。</span></button></> : null}{step === 3 ? <><button className={stirred ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleStir('correct')} type="button"><strong>同时搅拌并比较</strong><span>观察食盐和沙子在水中的不同变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleStir('skip')} type="button"><strong>不搅拌直接下结论</strong><span>错误演示：观察不充分。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button"><strong>记录“食盐能溶解，沙子不能溶解”</strong><span>这是本实验的正确结果。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleRecord('both')} type="button"><strong>记录“两种都能完全溶解”</strong><span>错误演示：忽略沉底现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRecord('reverse')} type="button"><strong>记录“沙子能溶解，食盐不能”</strong><span>错误演示：把结果记反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>不同物质在水中的溶解情况不同，搅拌会影响溶解快慢</strong><span>同时覆盖对照结果和搅拌作用。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('stir-only')} type="button"><strong>只要搅拌，所有物质都会溶解</strong><span>错误演示：忽略物质差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('same-result')} type="button"><strong>食盐和沙子的结果是一样的</strong><span>错误演示：与观察结果不符。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>对照状态：{comparisonReady ? '已建立' : '待建立'} / 搅拌状态：{stirred ? '已完成' : '待完成'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请先形成清晰对照'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“物质在水中的溶解”升级成双烧杯对照、搅拌比较和结果判断一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
