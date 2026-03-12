import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'microscope' | 'view';
type MaterialId = 'microscope' | 'slide' | 'onion' | 'salt' | 'water';
type TimelineState = 'done' | 'current' | 'todo';

interface PlasmolysisLabPlayerProps {
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
  2: '滴加浓盐水',
  3: '观察质壁分离',
  4: '滴加清水观察复原',
  5: '总结吸水失水现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别显微镜、载玻片、洋葱表皮、浓盐水和清水。',
  2: '先在洋葱表皮装片上滴加浓盐水，制造细胞失水条件。',
  3: '调清视野并观察细胞膜与细胞壁分离的现象。',
  4: '再滴加清水，观察细胞吸水后是否复原。',
  5: '总结植物细胞失水和吸水时的变化特点。',
};

const materialLabels: Record<MaterialId, string> = {
  microscope: '显微镜',
  slide: '载玻片',
  onion: '洋葱表皮',
  salt: '浓盐水',
  water: '清水',
};

const materialOrder: MaterialId[] = ['microscope', 'slide', 'onion', 'salt', 'water'];

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
function buildTimeline(step: StepId, completed: boolean): TimelineEntry[] {
  return (Object.entries(stepTitles) as [string, string][]).map(([rawStep, title]) => {
    const current = Number(rawStep) as StepId;
    const state: TimelineState = completed || current < step ? 'done' : current === step ? 'current' : 'todo';
    const detail = state === 'done' ? '已完成' : state === 'current' ? '进行中' : '待完成';
    return { title, detail, state };
  });
}

export function PlasmolysisLabPlayer({ experiment, onTelemetry }: PlasmolysisLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [salted, setSalted] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [saltObservationChoice, setSaltObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过浓盐水和清水前后对比观察植物细胞的失水与吸水变化。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const osmoticValue = clamp(28 + (salted ? 24 : 0) + (recovered ? 24 : 0), 20, 99);
  const clarityValue = clamp(24 + (cameraPreset !== 'bench' ? 14 : 0) + (saltObservationChoice === 'correct' ? 24 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (salted ? 10 : 0) + (recovered ? 14 : 0), 20, 100);

  const { reportReset } = useLabTelemetryReporter({ experiment, step, totalSteps: 5, score, errors, prompt, completed, stepLabels: stepTitles, onTelemetry });
  const appendNote = (note: string) => setLabNotes((current) => [note, ...current].slice(0, 6));
  const markError = (message: string) => { setErrors((current) => current + 1); setPromptTone('error'); setPrompt(message); appendNote(`错误修正：${message}`); };
  const advanceStep = (nextStep: StepId | null, message: string) => { setPromptTone('success'); setPrompt(message); if (nextStep === null) { setCompleted(true); appendNote(`实验完成：${experiment.feedback.successSummary}`); return; } setStep(nextStep); appendNote(`步骤推进：进入「${stepTitles[nextStep]}」`); };

  const handleIdentify = (materialId: MaterialId) => {
    if (step !== 1 || completed) return;
    setIdentifiedMaterials((current) => {
      if (current.includes(materialId)) return current;
      const next = [...current, materialId];
      appendNote(`材料识别：${materialLabels[materialId]}`);
      if (next.length === materialOrder.length) { setCameraPreset('microscope'); advanceStep(2, '器材识别完成，下一步滴加浓盐水。'); }
      else { setPromptTone('success'); setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`); }
      return next;
    });
  };
  const handleSalt = (choice: 'correct' | 'water') => {
    if (step !== 2 || completed) return;
    if (choice === 'water') { markError('本步应先滴加浓盐水，制造细胞失水条件。'); return; }
    setSalted(true); setCameraPreset('view'); appendNote('处理完成：洋葱表皮细胞处于失水环境。'); advanceStep(3, '浓盐水已加入，请观察质壁分离现象。');
  };
  const handleObserveSalt = (choice: 'correct' | 'swollen' | 'no-change') => {
    if (step !== 3 || completed) return;
    setSaltObservationChoice(choice);
    if (!salted) { markError('请先滴加浓盐水，再观察细胞变化。'); return; }
    if (choice === 'correct') { appendNote('显微观察：细胞原生质层向内收缩，与细胞壁出现分离。'); advanceStep(4, '已识别质壁分离，下一步滴加清水观察复原。'); return; }
    if (choice === 'swollen') { markError('在浓盐水中细胞通常失水收缩，而不是膨胀。'); return; }
    markError('浓盐水处理后应能观察到明显变化，不会完全没有变化。');
  };
  const handleRecover = (choice: 'correct' | 'stay-shrunk') => {
    if (step !== 4 || completed) return;
    if (saltObservationChoice !== 'correct') { markError('请先正确识别质壁分离现象，再继续复原实验。'); return; }
    if (choice === 'stay-shrunk') { markError('滴加清水后，细胞通常会重新吸水并逐渐复原。'); return; }
    setRecovered(true); appendNote('复原观察：滴加清水后，原生质层重新贴近细胞壁。'); advanceStep(5, '吸水复原现象已出现，最后总结植物细胞吸水失水特点。');
  };
  const handleSummary = (choice: 'correct' | 'salt-swells' | 'no-change') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') { advanceStep(null, '总结正确：植物细胞在高浓度溶液中失水发生质壁分离，在清水中又可吸水复原。'); return; }
    if (choice === 'salt-swells') { markError('高浓度溶液通常使细胞失水，不是让它先膨胀。'); return; }
    markError('植物细胞吸水失水会引起明显变化，并不是完全没有区别。');
  };
  const handleReset = () => { setStep(1); setIdentifiedMaterials([]); setSalted(false); setRecovered(false); setSaltObservationChoice(''); setSummaryChoice(''); setCameraPreset('bench'); setPromptTone('info'); setPrompt(stepPrompts[1]); setErrors(0); setCompleted(false); setLabNotes(['实验已重置：重新观察植物细胞吸水失水现象。']); reportReset(); };

  const recoveryList = errors === 0 ? ['先滴加浓盐水，再滴加清水。', '先看“原生质层收缩”，再看“贴壁复原”。', '总结时抓住“高浓度失水，清水吸水”。'] : [stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。', experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对细胞变化。', '建议按“盐水 → 质壁分离 → 清水 → 复原 → 总结”的顺序重做。'];

  return (
    <section className="panel playground-panel plasmolysis-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属生物实验页</h2><p>把显微镜、洋葱表皮细胞壁和原生质层收缩/复原做成更逼真的细胞视野仿真。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>
      <div className="playground-grid plasmolysis-grid">
        <aside className="playground-side"><section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">生物</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'microscope' ? '显微镜近景' : '细胞视野'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section><section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>渗透变化 {osmoticValue}</span><div className="chem-meter-bar"><i style={{ width: `${osmoticValue}%` }} /></div></div><div className="chem-meter"><span>视野清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section><section className="info-card plasmolysis-data-card"><span className="eyebrow">Readout</span><h3>细胞读数板</h3><div className="generic-readout-grid plasmolysis-readout-grid"><article className={salted ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>盐水处理</span><strong>{salted ? '失水环境已建立' : '--'}</strong><small>{salted ? '细胞已处在高浓度溶液环境。' : '先滴加浓盐水。'}</small></article><article className={recovered ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>清水复原</span><strong>{recovered ? '细胞已复原' : '--'}</strong><small>{recovered ? '原生质层重新贴近细胞壁。' : '再滴加清水观察复原。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '失水分离，吸水复原' : '等待总结'}</strong><small>植物细胞在不同浓度液体中会发生吸水失水变化。</small></article></div></section></aside>
        <section className="scene-panel"><div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '植物细胞装片'} · 当前重点：{step <= 2 ? '制造失水环境' : step === 3 ? '识别质壁分离' : '观察吸水复原'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'microscope' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('microscope')} type="button">显微镜</button><button className={cameraPreset === 'view' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('view')} type="button">视野</button></div></div><div className={`scene-canvas plasmolysis-stage preset-${cameraPreset} ${salted ? 'salted' : ''} ${recovered ? 'recovered' : ''}`}><div className="plasmolysis-rig"><div className="pl-microscope"><div className="pl-body" /><div className="pl-stage" /><div className={salted ? 'pl-slide active' : 'pl-slide'} /></div><div className={cameraPreset === 'view' ? 'pl-view active' : 'pl-view'}><div className={recovered ? 'pl-cell recovered' : salted ? 'pl-cell plasmolysis' : 'pl-cell'} /></div></div></div><div className="observation-ribbon plasmolysis-observation-row"><article className={salted ? 'observation-chip active' : 'observation-chip calm'}><strong>盐水处理</strong><span>{salted ? '高浓度环境已建立。' : '先滴加浓盐水。'}</span></article><article className={saltObservationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>质壁分离</strong><span>{saltObservationChoice === 'correct' ? '已识别原生质层收缩。' : '等待完成分离观察。'}</span></article><article className={recovered ? 'observation-chip active' : 'observation-chip calm'}><strong>复原现象</strong><span>{recovered ? '已观察到细胞吸水复原。' : '等待滴加清水观察复原。'}</span></article></div><div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div><section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section></section>
        <aside className="playground-side"><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleSalt('correct')} type="button"><strong>向装片边缘滴加浓盐水</strong><span>建立细胞失水条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSalt('water')} type="button"><strong>一开始就滴加清水</strong><span>错误演示：不会先出现质壁分离。</span></button></> : null}{step === 3 ? <><button className={saltObservationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserveSalt('correct')} type="button"><strong>记录“原生质层向内收缩，与细胞壁分离”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserveSalt('swollen')} type="button"><strong>记录“细胞在浓盐水中更饱满膨胀”</strong><span>错误演示：方向相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserveSalt('no-change')} type="button"><strong>记录“细胞几乎没有任何变化”</strong><span>错误演示：忽略分离现象。</span></button></> : null}{step === 4 ? <><button className="summary-choice generic-choice primary" onClick={() => handleRecover('correct')} type="button"><strong>滴加清水后观察原生质层重新贴壁</strong><span>形成吸水复原现象。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRecover('stay-shrunk')} type="button"><strong>记录“滴加清水后仍一直保持收缩”</strong><span>错误演示：忽略复原现象。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>植物细胞在高浓度溶液中失水发生质壁分离，在清水中又可吸水复原</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('salt-swells')} type="button"><strong>植物细胞在浓盐水中会先吸水膨胀</strong><span>错误演示：与实验相反。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-change')} type="button"><strong>植物细胞在盐水和清水中都几乎没有区别</strong><span>错误演示：忽略吸水失水变化。</span></button></> : null}</div></section><section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{salted ? '盐水已加' : '待加盐水'} / {recovered ? '已复原' : '待复原'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先盐水再清水，先分离再复原'}</li></ul></section><section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section><section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“观察植物细胞吸水失水”升级成显微镜视野变化的专属页。</small></section></aside>
      </div>
    </section>
  );
}
