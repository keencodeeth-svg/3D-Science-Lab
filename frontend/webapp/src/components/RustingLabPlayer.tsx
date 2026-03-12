import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'tubes' | 'detail';
type MaterialId = 'test-tube' | 'iron-nail' | 'water-dropper' | 'oil-layer' | 'drying-agent';
type TimelineState = 'done' | 'current' | 'todo';

interface RustingLabPlayerProps {
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
  2: '建立三组条件',
  3: '观察锈蚀变化',
  4: '比较试管现象',
  5: '总结生锈条件',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别试管、铁钉、滴管、植物油层和干燥剂。',
  2: '建立“有水有空气”“有水隔绝空气”“干燥有空气”三组条件。',
  3: '观察一段时间后各试管中铁钉锈蚀程度。',
  4: '比较哪一组锈蚀最明显、哪一组几乎不生锈。',
  5: '总结铁生锈需要同时具备水和氧气。',
};

const materialLabels: Record<MaterialId, string> = {
  'test-tube': '试管',
  'iron-nail': '铁钉',
  'water-dropper': '滴管',
  'oil-layer': '植物油层',
  'drying-agent': '干燥剂',
};

const materialOrder: MaterialId[] = ['test-tube', 'iron-nail', 'water-dropper', 'oil-layer', 'drying-agent'];

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

export function RustingLabPlayer({ experiment, onTelemetry }: RustingLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [conditionReady, setConditionReady] = useState(false);
  const [observed, setObserved] = useState(false);
  const [comparisonChoice, setComparisonChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先建立三组铁钉条件，再比较哪组最易生锈。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const rustA = observed ? 86 : 0;
  const rustB = observed ? 18 : 0;
  const rustC = observed ? 6 : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const compareValue = clamp(42 + (conditionReady ? 18 : 0) + (observed ? 22 : 0) + (comparisonChoice === 'correct' ? 14 : 0), 24, 99);
  const clarityValue = clamp(40 + (observed ? 20 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (conditionReady ? 16 : 0) + (observed ? 16 : 0), 20, 100);

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
        setCameraPreset('tubes');
        advanceStep(2, '器材识别完成，下一步建立三组不同的生锈条件。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleCondition = (choice: 'correct' | 'all-water') => {
    if (step !== 2 || completed) return;
    if (choice === 'all-water') {
      markError('三组必须形成不同条件，不能都只加水。');
      return;
    }
    setConditionReady(true);
    appendNote('实验设置：A 组有水有空气，B 组有水并加油隔绝空气，C 组干燥保留空气。');
    advanceStep(3, '条件已建立，开始观察各试管中铁钉锈蚀差异。');
  };

  const handleObserve = (choice: 'timelapse' | 'skip') => {
    if (step !== 3 || completed) return;
    if (!conditionReady) {
      markError('请先完成三组条件设置，再进行观察。');
      return;
    }
    if (choice === 'skip') {
      markError('请先观察各试管变化，不能直接跳到结论。');
      return;
    }
    setObserved(true);
    setCameraPreset('detail');
    appendNote('现象记录：A 组铁钉表面出现明显红褐色锈斑，B、C 组变化很小。');
    advanceStep(4, '锈蚀变化已出现，请比较哪组最明显。');
  };

  const handleCompare = (choice: 'correct' | 'b' | 'c') => {
    if (step !== 4 || completed) return;
    setComparisonChoice(choice);
    if (!observed) {
      markError('请先观察锈蚀现象，再做比较判断。');
      return;
    }
    if (choice === 'correct') {
      appendNote('比较结果：A 组锈蚀最明显，说明有水有空气时更易生锈。');
      advanceStep(5, '比较完成，最后总结铁生锈需要满足的条件。');
      return;
    }
    markError('请重新比较，锈蚀最明显的不是你当前选择的这一组。');
  };

  const handleSummary = (choice: 'correct' | 'water-only' | 'air-only') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：铁生锈通常需要同时接触水和氧气。');
      return;
    }
    if (choice === 'water-only') {
      markError('只有水并不足以解释全部现象，隔绝空气后锈蚀显著减弱。');
      return;
    }
    markError('只有空气也不够，干燥条件下铁钉几乎不生锈。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setConditionReady(false);
    setObserved(false);
    setComparisonChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新建立三组条件比较铁钉锈蚀差异。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '一定要让三组条件不同，才有对照意义。',
        '重点看哪组同时接触水和空气。',
        '总结时记住“水和氧气”两个条件都重要。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对试管现象。',
        '建议重新执行“建立条件 → 观察锈蚀 → 比较结果”的流程。',
      ];

  return (
    <section className="panel playground-panel rusting-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把三组铁钉条件放到同一视野里对照展示，让“水和氧气共同作用”更容易讲清楚。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid rusting-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'tubes' ? '试管观察' : '锈蚀细节'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>对照度 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card rusting-data-card"><span className="eyebrow">Readout</span><h3>锈蚀对照板</h3><div className="generic-readout-grid rusting-readout-grid"><article className={conditionReady ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>A 组</span><strong>{conditionReady ? '有水 + 有空气' : '--'}</strong><small>{observed ? `锈蚀程度 ${rustA}%` : '通常最容易生锈。'}</small></article><article className={observed ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>B / C 组</span><strong>{observed ? '变化较小' : '--'}</strong><small>{observed ? '隔绝空气或保持干燥后锈蚀明显减少。' : '观察后再比较。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '需要水和氧气' : '等待总结'}</strong><small>铁生锈通常需要同时接触水和氧气。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '铁钉锈蚀装置'} · 当前重点：{step <= 2 ? '建立对照条件' : step === 3 ? '观察锈斑' : '比较三组差异'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'tubes' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('tubes')} type="button">试管</button><button className={cameraPreset === 'detail' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('detail')} type="button">细节</button></div></div>

          <div className={`scene-canvas rusting-stage preset-${cameraPreset} ${conditionReady ? 'ready' : ''} ${observed ? 'observed' : ''}`}>
            <div className="rusting-rig">
              <div className="rusting-tube tube-a"><div className="tube-liquid water" /><div className={observed ? 'rusting-nail rust-high' : 'rusting-nail'} /><div className="rusting-tag">A</div></div>
              <div className="rusting-tube tube-b"><div className="tube-liquid water" /><div className="tube-liquid oil" /><div className={observed ? 'rusting-nail rust-low' : 'rusting-nail'} /><div className="rusting-tag">B</div></div>
              <div className="rusting-tube tube-c"><div className="tube-dry-base" /><div className={observed ? 'rusting-nail rust-none' : 'rusting-nail'} /><div className="rusting-tag">C</div></div>
            </div>
          </div>

          <div className="observation-ribbon rusting-observation-row"><article className={conditionReady ? 'observation-chip active' : 'observation-chip calm'}><strong>条件建立</strong><span>{conditionReady ? '三组对照条件已设置。' : '先建立三组不同条件。'}</span></article><article className={observed ? 'observation-chip active' : 'observation-chip calm'}><strong>锈蚀现象</strong><span>{observed ? 'A 组锈斑最明显。' : '等待进入观察阶段。'}</span></article><article className={comparisonChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>比较结果</strong><span>{comparisonChoice === 'correct' ? '已判断出有水有空气时最易生锈。' : '等待完成三组比较。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleCondition('correct')} type="button"><strong>建立三组对照条件</strong><span>A 组有水有空气，B 组加油隔绝空气，C 组保持干燥。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCondition('all-water')} type="button"><strong>三组都只加水</strong><span>错误演示：失去变量对照。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleObserve('timelapse')} type="button"><strong>观察一段时间后的锈蚀变化</strong><span>对比三组铁钉表面变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('skip')} type="button"><strong>跳过观察直接下结论</strong><span>错误演示：没有实验依据。</span></button></> : null}{step === 4 ? <><button className={comparisonChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleCompare('correct')} type="button"><strong>记录“A 组锈蚀最明显”</strong><span>正确对应“有水有空气”。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleCompare('b')} type="button"><strong>记录“B 组锈蚀最明显”</strong><span>错误演示：忽略油层隔绝空气。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleCompare('c')} type="button"><strong>记录“C 组锈蚀最明显”</strong><span>错误演示：干燥条件几乎不生锈。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>铁生锈通常需要同时接触水和氧气</strong><span>完整总结锈蚀条件。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('water-only')} type="button"><strong>铁生锈只需要水</strong><span>错误演示：忽略氧气条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('air-only')} type="button"><strong>铁生锈只需要空气</strong><span>错误演示：忽略水分条件。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{conditionReady ? '三组条件已建立' : '待建立对照'} / {observed ? '已出现锈蚀差异' : '待观察'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意保持变量对照'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“铁生锈条件”做成三组试管并列对照的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
