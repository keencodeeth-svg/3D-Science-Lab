import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'mirror' | 'meter';
type MaterialId = 'laser-box' | 'plane-mirror' | 'normal-line' | 'protractor' | 'screen-card';
type AngleId = '30' | '45' | '60';
type TimelineState = 'done' | 'current' | 'todo';

interface ReflectionLawLabPlayerProps {
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
  2: '发出入射光线',
  3: '调节入射角',
  4: '比较反射角',
  5: '总结反射规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别激光盒、平面镜、法线、量角器和接收卡。',
  2: '让激光照向平面镜，建立清晰的入射光线和反射光线。',
  3: '改变入射角，再观察反射角如何变化。',
  4: '比较入射角和反射角的大小关系。',
  5: '总结光的反射规律和三线关系。',
};

const materialLabels: Record<MaterialId, string> = {
  'laser-box': '激光盒',
  'plane-mirror': '平面镜',
  'normal-line': '法线',
  protractor: '量角器',
  'screen-card': '接收卡',
};

const materialOrder: MaterialId[] = ['laser-box', 'plane-mirror', 'normal-line', 'protractor', 'screen-card'];
const angleMap: Record<AngleId, number> = { '30': 30, '45': 45, '60': 60 };

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

export function ReflectionLawLabPlayer({ experiment, onTelemetry }: ReflectionLawLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [beamActive, setBeamActive] = useState(false);
  const [selectedAngle, setSelectedAngle] = useState<AngleId | null>(null);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先建立反射光路，再调节入射角比较反射角。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const incidentAngle = selectedAngle ? angleMap[selectedAngle] : 0;
  const reflectionAngle = selectedAngle ? angleMap[selectedAngle] : 0;
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const compareValue = clamp(40 + (beamActive ? 18 : 0) + (selectedAngle ? 18 : 0) + (observationChoice === 'correct' ? 16 : 0), 24, 99);
  const clarityValue = clamp(42 + (beamActive ? 12 : 0) + (selectedAngle ? 12 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (beamActive ? 14 : 0) + (selectedAngle ? 14 : 0), 20, 100);

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
        setCameraPreset('mirror');
        advanceStep(2, '器材识别完成，先发出入射光线。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleBeam = (choice: 'emit' | 'away') => {
    if (step !== 2 || completed) return;
    if (choice === 'away') {
      markError('光线需要照向平面镜，才能形成清晰的反射现象。');
      return;
    }
    setBeamActive(true);
    appendNote('光路建立：已形成入射光线和反射光线。');
    advanceStep(3, '光路建立完成，下一步调节入射角。');
  };

  const handleAngle = (angle: AngleId) => {
    if (step !== 3 || completed) return;
    if (!beamActive) {
      markError('请先发出入射光线。');
      return;
    }
    setSelectedAngle(angle);
    setCameraPreset('meter');
    appendNote(`角度调节：入射角已设为 ${angleMap[angle]}°。`);
    advanceStep(4, '角度已设定，开始比较入射角和反射角。');
  };

  const handleObserve = (choice: 'correct' | 'larger' | 'smaller') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!selectedAngle) {
      markError('请先设定入射角，再比较角度关系。');
      return;
    }
    if (choice === 'correct') {
      appendNote(`结果记录：入射角 ${incidentAngle}°，反射角 ${reflectionAngle}°，两者相等。`);
      advanceStep(5, '角度关系已明确，最后总结反射规律。');
      return;
    }
    if (choice === 'larger') {
      markError('本实验中反射角不会比入射角更大。');
      return;
    }
    markError('本实验中反射角也不会比入射角更小。');
  };

  const handleSummary = (choice: 'correct' | 'random' | 'different-plane') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：反射光线、入射光线和法线在同一平面内，反射角等于入射角。');
      return;
    }
    if (choice === 'random') {
      markError('反射角并不是随机的，它与入射角有明确关系。');
      return;
    }
    markError('三线并不在不同平面内，本实验强调它们共面。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setBeamActive(false);
    setSelectedAngle(null);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新建立光路并比较入射角与反射角。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先形成光路，再调角度，最后比较结果。',
        '重点读入射角和反射角，不要忽略法线。',
        '总结时记住“三线共面、两角相等”。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对角度关系。',
        '建议重新执行“出光 → 调角 → 比较角度”的流程。',
      ];

  const beamTilt = selectedAngle ? 14 + angleMap[selectedAngle] * 0.56 : 36;

  return (
    <section className="panel playground-panel reflection-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属物理实验页</h2>
          <p>把光路、法线、角度读数做成同一实验场景，让“反射角等于入射角”直接可见、可调、可比较。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>

      <div className="playground-grid reflection-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'mirror' ? '镜面光路' : '角度读数'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>对照值 {compareValue}</span><div className="chem-meter-bar"><i style={{ width: `${compareValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card reflection-data-card"><span className="eyebrow">Readout</span><h3>反射读数板</h3><div className="generic-readout-grid reflection-readout-grid"><article className={beamActive ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>入射角</span><strong>{selectedAngle ? `${incidentAngle}°` : '--'}</strong><small>{beamActive ? '法线一侧读入射角。' : '先建立光路。'}</small></article><article className={beamActive ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>反射角</span><strong>{selectedAngle ? `${reflectionAngle}°` : '--'}</strong><small>{selectedAngle ? '镜面另一侧读反射角。' : '调节角度后再比较。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心规律</span><strong>{summaryChoice === 'correct' ? '两角相等，三线共面' : '等待总结'}</strong><small>反射光线、入射光线和法线在同一平面内，且反射角等于入射角。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '反射光路'} · 当前重点：{step <= 2 ? '建立光路' : step === 3 ? '调节角度' : '比较两角'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'mirror' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('mirror')} type="button">镜面</button><button className={cameraPreset === 'meter' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('meter')} type="button">角度</button></div></div>

          <div className={`scene-canvas reflection-stage preset-${cameraPreset} ${beamActive ? 'active' : ''}`}>
            <div className="reflection-rig">
              <div className="reflection-protractor" />
              <div className="reflection-normal" />
              <div className="reflection-mirror" />
              <div className="reflection-laser" />
              <div className={beamActive ? 'reflection-beam incident active' : 'reflection-beam incident'} style={{ transform: `translateX(-50%) rotate(${-beamTilt}deg)` }} />
              <div className={beamActive ? 'reflection-beam reflected active' : 'reflection-beam reflected'} style={{ transform: `translateX(-50%) rotate(${beamTilt}deg)` }} />
              <div className={beamActive ? 'reflection-hit active' : 'reflection-hit'} />
            </div>
          </div>

          <div className="observation-ribbon reflection-observation-row"><article className={beamActive ? 'observation-chip active' : 'observation-chip calm'}><strong>光路建立</strong><span>{beamActive ? '入射光线和反射光线已经可见。' : '先让激光照向平面镜。'}</span></article><article className={selectedAngle ? 'observation-chip active' : 'observation-chip calm'}><strong>角度调节</strong><span>{selectedAngle ? `当前比较角度为 ${incidentAngle}°。` : '先调节一个清晰的入射角。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>比较结果</strong><span>{observationChoice === 'correct' ? '反射角与入射角相等。' : '等待完成角度关系判断。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleBeam('emit')} type="button"><strong>让激光照向平面镜</strong><span>建立入射光线和反射光线。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleBeam('away')} type="button"><strong>把激光照向别处</strong><span>错误演示：不会形成有效反射光路。</span></button></> : null}{step === 3 ? (['30', '45', '60'] as AngleId[]).map((angle) => (<button className={selectedAngle === angle ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} key={angle} onClick={() => handleAngle(angle)} type="button"><strong>设入射角 {angle}°</strong><span>观察另一侧的反射角变化。</span></button>)) : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“反射角等于入射角”</strong><span>这是本实验的正确关系。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('larger')} type="button"><strong>记录“反射角更大”</strong><span>错误演示：与读数不符。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('smaller')} type="button"><strong>记录“反射角更小”</strong><span>错误演示：与读数不符。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>反射角等于入射角，且入射光线、反射光线、法线在同一平面内</strong><span>完整总结光的反射规律。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('random')} type="button"><strong>反射角大小是随机的</strong><span>错误演示：忽略规律性。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('different-plane')} type="button"><strong>三条线不在同一平面内</strong><span>错误演示：与实验规律相反。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{beamActive ? '光路已建立' : '待建立光路'} / {selectedAngle ? `当前角度 ${incidentAngle}°` : '待调角度'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先调角再总结'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“反射规律”升级成可调光路与可读角度的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
