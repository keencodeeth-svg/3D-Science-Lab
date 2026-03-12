import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'circuit' | 'bulb';
type MaterialId = 'battery-pack' | 'bulb' | 'wire' | 'test-gap' | 'material-set';
type TestMaterial = 'none' | 'metal' | 'wood' | 'plastic';
type TimelineState = 'done' | 'current' | 'todo';

interface ConductivityLabPlayerProps {
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
  2: '测试金属片',
  3: '测试绝缘体',
  4: '比较灯泡亮灭',
  5: '总结导体绝缘体',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别电池盒、小灯泡、导线、测试夹口和材料组。',
  2: '先把金属片接入测试夹口，观察小灯泡是否发亮。',
  3: '再把木片或塑料片接入夹口，比较灯泡状态变化。',
  4: '根据两次实验结果判断哪些材料容易导电。',
  5: '总结导体与绝缘体的区别。',
};

const materialLabels: Record<MaterialId, string> = {
  'battery-pack': '电池盒',
  bulb: '小灯泡',
  wire: '导线',
  'test-gap': '测试夹口',
  'material-set': '材料组',
};

const materialOrder: MaterialId[] = ['battery-pack', 'bulb', 'wire', 'test-gap', 'material-set'];

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

export function ConductivityLabPlayer({ experiment, onTelemetry }: ConductivityLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [testMaterial, setTestMaterial] = useState<TestMaterial>('none');
  const [insulatorTested, setInsulatorTested] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先测试金属导电，再测试木片或塑料的绝缘效果。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const bulbOn = testMaterial === 'metal';
  const materialLabel = testMaterial === 'metal' ? '金属片' : testMaterial === 'wood' ? '木片' : testMaterial === 'plastic' ? '塑料片' : '待接入';
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const circuitValue = clamp(40 + (testMaterial === 'metal' ? 18 : 0) + (insulatorTested ? 18 : 0), 24, 99);
  const clarityValue = clamp(42 + (testMaterial !== 'none' ? 12 : 0) + (observationChoice === 'correct' ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (testMaterial === 'metal' ? 14 : 0) + (insulatorTested ? 16 : 0), 20, 100);

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
        setCameraPreset('circuit');
        advanceStep(2, '器材识别完成，先把金属片接入电路。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleMetal = (choice: 'metal' | 'wood') => {
    if (step !== 2 || completed) return;
    if (choice === 'wood') {
      markError('请先测试金属导电现象，再去比较绝缘体。');
      return;
    }
    setTestMaterial('metal');
    appendNote('材料测试：金属片接入后，小灯泡点亮。');
    advanceStep(3, '金属导电现象已出现，下一步改测绝缘体。');
  };

  const handleInsulator = (choice: 'wood' | 'plastic' | 'metal') => {
    if (step !== 3 || completed) return;
    if (testMaterial !== 'metal') {
      markError('请先完成金属测试，再测试绝缘体。');
      return;
    }
    if (choice === 'metal') {
      markError('现在要换成绝缘材料，而不是继续用金属。');
      return;
    }
    setTestMaterial(choice);
    setInsulatorTested(true);
    setCameraPreset('bulb');
    appendNote(`材料测试：${choice === 'wood' ? '木片' : '塑料片'}接入后，小灯泡熄灭。`);
    advanceStep(4, '两组材料测试已完成，开始比较灯泡亮灭差异。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'reverse') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!insulatorTested) {
      markError('请先完成绝缘体测试，再比较亮灭变化。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：金属接入时灯泡发亮，木片/塑料接入时灯泡不亮。');
      advanceStep(5, '比较完成，最后总结导体和绝缘体的区别。');
      return;
    }
    if (choice === 'same') {
      markError('灯泡亮灭并不相同，材料导电性不同会导致不同结果。');
      return;
    }
    markError('结果不能记反，金属通常比木片和塑料更容易导电。');
  };

  const handleSummary = (choice: 'correct' | 'wood-conducts' | 'plastic-bright') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：金属等导体容易导电，木材和塑料等绝缘体不易导电。');
      return;
    }
    if (choice === 'wood-conducts') {
      markError('本实验中木片不能让小灯泡点亮，不属于容易导电的材料。');
      return;
    }
    markError('塑料片接入时灯泡不会发亮，不能据此判断塑料容易导电。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setTestMaterial('none');
    setInsulatorTested(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新比较导体与绝缘体对灯泡亮灭的影响。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先接入金属，再换绝缘体，才能形成对照。',
        '观察重点是小灯泡亮不亮，不是材料颜色。',
        '总结时要把“容易导电”和“不易导电”说清楚。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对材料现象。',
        '建议重新执行“金属 → 木片/塑料 → 比较亮灭”的流程。',
      ];

  return (
    <section className="panel playground-panel conductivity-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属小学科学实验页</h2><p>把材料接入电路和灯泡亮灭做成真实操作流程，让“导体/绝缘体”从定义变成看得见的现象。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>

      <div className="playground-grid conductivity-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">科学</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'circuit' ? '电路观察' : '灯泡观察'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>电路值 {circuitValue}</span><div className="chem-meter-bar"><i style={{ width: `${circuitValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card conductivity-data-card"><span className="eyebrow">Readout</span><h3>导电读数板</h3><div className="generic-readout-grid conductivity-readout-grid"><article className={testMaterial !== 'none' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>当前材料</span><strong>{materialLabel}</strong><small>{testMaterial === 'metal' ? '金属接入后电路闭合。' : testMaterial === 'wood' || testMaterial === 'plastic' ? '绝缘体接入后电路不易导通。' : '先选择待测材料。'}</small></article><article className={bulbOn ? 'lab-readout-card active' : testMaterial !== 'none' ? 'lab-readout-card warn' : 'lab-readout-card calm'}><span>灯泡状态</span><strong>{bulbOn ? '发亮' : testMaterial === 'none' ? '待测试' : '不亮'}</strong><small>{bulbOn ? '说明电路被导体接通。' : '说明当前材料不易让电流通过。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '导体亮，绝缘体灭' : '等待总结'}</strong><small>观察灯泡亮灭是判断材料是否容易导电的直接方式。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '电路与材料夹口'} · 当前重点：{step <= 2 ? '接入导体' : step === 3 ? '接入绝缘体' : '比较亮灭'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'circuit' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('circuit')} type="button">电路</button><button className={cameraPreset === 'bulb' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bulb')} type="button">灯泡</button></div></div>

          <div className={`scene-canvas conductivity-stage preset-${cameraPreset} ${testMaterial}`}>
            <div className="conductivity-rig">
              <div className="conductivity-bench-shadow" />
              <div className="conductivity-battery">
                <div className="battery-reflection" />
                <div className="battery-label" />
                <span className="battery-terminal positive" />
                <span className="battery-terminal negative" />
              </div>
              <div className={bulbOn ? 'conductivity-bulb active' : 'conductivity-bulb'}>
                <div className="bulb-glass" />
                <div className="bulb-reflection" />
                <div className="bulb-base" />
                <div className="bulb-filament" />
                <div className="bulb-glow" />
                <div className={bulbOn ? 'bulb-halo-ring active' : 'bulb-halo-ring'} />
              </div>
              <div className={bulbOn ? 'conductivity-wire left active' : 'conductivity-wire left'}>
                <span className={bulbOn ? 'wire-glow active' : 'wire-glow'} />
              </div>
              <div className={bulbOn ? 'conductivity-wire right active' : 'conductivity-wire right'}>
                <span className={bulbOn ? 'wire-glow active' : 'wire-glow'} />
              </div>
              <div className="test-clamp">
                <div className="clamp-joint" />
                <div className="clamp-arm left" />
                <div className="clamp-arm right" />
                <div className={bulbOn ? 'test-gap-glow active' : 'test-gap-glow'} />
                <div className={`test-material ${testMaterial !== 'none' ? `${testMaterial} active` : ''}`}>
                  <span className={testMaterial !== 'none' ? 'test-material-gloss active' : 'test-material-gloss'} />
                </div>
              </div>
              <div className="material-tray">
                <span className={testMaterial === 'metal' ? 'material-chip active' : 'material-chip'}>金属</span>
                <span className={testMaterial === 'wood' ? 'material-chip active' : 'material-chip'}>木片</span>
                <span className={testMaterial === 'plastic' ? 'material-chip active' : 'material-chip'}>塑料</span>
              </div>
            </div>
          </div>

          <div className="observation-ribbon conductivity-observation-row"><article className={testMaterial === 'metal' ? 'observation-chip active' : 'observation-chip calm'}><strong>导体测试</strong><span>{testMaterial === 'metal' ? '金属接入后灯泡发亮。' : '先完成金属测试。'}</span></article><article className={insulatorTested ? 'observation-chip active' : 'observation-chip calm'}><strong>绝缘体测试</strong><span>{insulatorTested ? '木片或塑料片接入后灯泡不亮。' : '再测试绝缘材料形成对照。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>亮灭比较</strong><span>{observationChoice === 'correct' ? '亮灭差异已经明确记录。' : '等待完成现象判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleMetal('metal')} type="button"><strong>接入金属片</strong><span>观察小灯泡是否点亮。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleMetal('wood')} type="button"><strong>先接木片</strong><span>错误演示：需要先建立导体现象。</span></button></> : null}{step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleInsulator('wood')} type="button"><strong>接入木片</strong><span>观察灯泡是否熄灭。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleInsulator('plastic')} type="button"><strong>接入塑料片</strong><span>同样属于绝缘材料。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleInsulator('metal')} type="button"><strong>继续接金属片</strong><span>错误演示：无法形成绝缘体对照。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“金属接入时亮，木片/塑料接入时不亮”</strong><span>这是本实验的正确对照结果。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“材料不同但亮度一样”</strong><span>错误演示：忽略导电性差异。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('reverse')} type="button"><strong>记录“木片比金属更容易点亮灯泡”</strong><span>错误演示：结果颠倒。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>金属等导体容易导电，木片和塑料等绝缘体不易导电</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('wood-conducts')} type="button"><strong>木片是容易导电的导体</strong><span>错误演示：与实验现象不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('plastic-bright')} type="button"><strong>塑料片接入时灯泡会更亮</strong><span>错误演示：与实验现象相反。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：当前材料 {materialLabel} / 灯泡 {bulbOn ? '发亮' : testMaterial === 'none' ? '待测试' : '不亮'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先导体后绝缘体'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“导体和绝缘体检测”升级成材料插入、灯泡亮灭和结论判断一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
