import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'coil' | 'clips';
type MaterialId = 'battery' | 'coil' | 'iron-core' | 'switch' | 'paper-clips';
type CoilLevel = 'none' | 'few' | 'many';
type TimelineState = 'done' | 'current' | 'todo';

interface ElectromagnetLabPlayerProps {
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
  2: '闭合电路',
  3: '增加线圈匝数',
  4: '比较吸起回形针数量',
  5: '总结磁性规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别电池、线圈、铁芯、开关和回形针。',
  2: '先闭合电路，让电磁铁具备吸引回形针的能力。',
  3: '增加线圈匝数，再比较磁性是否增强。',
  4: '根据吸起回形针数量判断强弱变化。',
  5: '总结电磁铁通电与匝数变化对磁性的影响。',
};

const materialLabels: Record<MaterialId, string> = {
  battery: '电池',
  coil: '线圈',
  'iron-core': '铁芯',
  switch: '开关',
  'paper-clips': '回形针',
};

const materialOrder: MaterialId[] = ['battery', 'coil', 'iron-core', 'switch', 'paper-clips'];

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

export function ElectromagnetLabPlayer({ experiment, onTelemetry }: ElectromagnetLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [powered, setPowered] = useState(false);
  const [coilLevel, setCoilLevel] = useState<CoilLevel>('none');
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先通电，再增加匝数比较电磁铁吸附能力。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const clipCount = !powered ? 0 : coilLevel === 'many' ? 6 : 3;
  const magnetState = !powered ? '无明显磁性' : coilLevel === 'many' ? '磁性增强' : '已具磁性';
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const fieldValue = clamp(42 + (powered ? 18 : 0) + (coilLevel === 'many' ? 22 : coilLevel === 'few' ? 10 : 0), 24, 99);
  const clarityValue = clamp(40 + (powered ? 12 : 0) + (observationChoice === 'correct' ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 26, 99);
  const readinessValue = clamp(progressPercent + (powered ? 14 : 0) + (coilLevel === 'many' ? 16 : 0), 20, 100);

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
        setCameraPreset('coil');
        advanceStep(2, '器材识别完成，先闭合电路让电磁铁通电。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePower = (choice: 'on' | 'off') => {
    if (step !== 2 || completed) return;
    if (choice === 'off') {
      markError('电磁铁必须通电，才会对回形针产生明显吸引。');
      return;
    }
    setPowered(true);
    setCoilLevel('few');
    appendNote('通电记录：电路已闭合，电磁铁开始吸附回形针。');
    advanceStep(3, '通电成功，下一步增加线圈匝数比较磁性强弱。');
  };

  const handleCoil = (choice: CoilLevel) => {
    if (step !== 3 || completed || choice === 'none') return;
    if (!powered) {
      markError('请先让电磁铁通电，再比较匝数影响。');
      return;
    }
    setCoilLevel(choice);
    setCameraPreset(choice === 'many' ? 'clips' : 'coil');
    appendNote(`变量调节：线圈已切换到${choice === 'many' ? '较多匝数' : '较少匝数'}。`);
    if (choice === 'many') {
      advanceStep(4, '匝数已增加，开始比较吸起回形针数量。');
      return;
    }
    markError('先把匝数增加到更明显的水平，才能看出磁性增强。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'weaker') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (coilLevel !== 'many') {
      markError('请先把线圈匝数增加后再比较吸附数量。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：线圈匝数增多后，电磁铁吸起的回形针数量明显增加。');
      advanceStep(5, '现象比较完成，最后总结电磁铁磁性大小规律。');
      return;
    }
    if (choice === 'same') {
      markError('匝数增多后吸附数量并不会完全不变。');
      return;
    }
    markError('匝数增多后磁性不会减弱，本实验中回形针数量会增加。');
  };

  const handleSummary = (choice: 'correct' | 'powerless' | 'turns-less') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：电磁铁通电才有磁性，匝数增多时磁性增强。');
      return;
    }
    if (choice === 'powerless') {
      markError('断电后电磁铁不会持续保持同样的磁性，通电是关键条件。');
      return;
    }
    markError('匝数减少通常不会让磁性更强，本实验比较结果正好相反。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPowered(false);
    setCoilLevel('none');
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新比较通电和匝数对电磁铁磁性的影响。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先闭合电路，再比较匝数变化，顺序不要颠倒。',
        '观察重点是回形针数量变化，而不是只看线圈外观。',
        '总结时要同时说出“通电”和“匝数变化”两个条件。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对变量。',
        '建议重新执行“通电 → 增加匝数 → 比较回形针数量”的流程。',
      ];

  return (
    <section className="panel playground-panel electromagnet-lab-panel">
      <div className="panel-head"><div><span className="eyebrow">Dedicated Lab</span><h2>{experiment.title} · 专属物理实验页</h2><p>把通电、增大匝数和吸附回形针数量变化做成一条完整操作链，让电磁铁更像真实实验台。</p></div><div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div></div>

      <div className="playground-grid electromagnet-grid">
        <aside className="playground-side">
          <section className="info-card"><span className="eyebrow">Scene</span><h3>实验环境</h3><div className="detail-list compact-detail-list"><div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">物理</span></div><div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'coil' ? '线圈观察' : '回形针观察'}</span></div><span className="badge">{experiment.grade}</span></div><div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div></div></section>
          <section className="info-card"><span className="eyebrow">Meters</span><h3>实验状态</h3><div className="chem-meter-stack generic-meter-stack"><div className="chem-meter"><span>磁场值 {fieldValue}</span><div className="chem-meter-bar"><i style={{ width: `${fieldValue}%` }} /></div></div><div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div><div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div><div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div></div></section>
          <section className="info-card electromagnet-data-card"><span className="eyebrow">Readout</span><h3>磁性读数板</h3><div className="generic-readout-grid electromagnet-readout-grid"><article className={powered ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>通电状态</span><strong>{powered ? '已通电' : '未通电'}</strong><small>{powered ? '电磁铁已开始表现出吸引能力。' : '断路时难以吸附回形针。'}</small></article><article className={coilLevel === 'many' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>磁性强弱</span><strong>{magnetState}</strong><small>{coilLevel === 'many' ? '增加匝数后磁性明显增强。' : '继续调高匝数比较效果。'}</small></article><article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>吸附数量</span><strong>{clipCount} 枚</strong><small>回形针数量越多，说明吸附能力越强。</small></article></div></section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar"><div><strong>当前步骤：</strong> {stepTitles[step]}<small className="selector-note">目标对象：{stepConfig?.targetObject ?? '电磁铁'} · 当前重点：{step <= 2 ? '建立磁性' : step === 3 ? '调节匝数' : '比较吸附数量'}</small></div><div className="camera-actions"><button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button><button className={cameraPreset === 'coil' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('coil')} type="button">线圈</button><button className={cameraPreset === 'clips' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('clips')} type="button">回形针</button></div></div>

          <div className={`scene-canvas electromagnet-stage preset-${cameraPreset} ${powered ? 'powered' : ''} ${coilLevel}`}>
            <div className="electromagnet-rig">
              <div className="electromagnet-battery" />
              <div className={powered ? 'electromagnet-switch active' : 'electromagnet-switch'} />
              <div className={powered ? `electromagnet-coil ${coilLevel} active` : `electromagnet-coil ${coilLevel}`}>
                <div className="electromagnet-core" />
                {Array.from({ length: coilLevel === 'many' ? 8 : 5 }).map((_, index) => <span className="coil-wrap" key={`wrap-${index}`} />)}
                <div className={powered ? 'magnetic-field active' : 'magnetic-field'}><span className="field-arc arc-1" /><span className="field-arc arc-2" /><span className="field-arc arc-3" /></div>
              </div>
              <div className="electromagnet-wire left" />
              <div className="electromagnet-wire right" />
              <div className={`clip-cluster ${powered ? 'active' : ''} ${coilLevel}`}>
                {Array.from({ length: 6 }).map((_, index) => <span className={`clip-item clip-${index + 1}`} key={`clip-${index}`} />)}
              </div>
            </div>
          </div>

          <div className="observation-ribbon electromagnet-observation-row"><article className={powered ? 'observation-chip active' : 'observation-chip calm'}><strong>通电效果</strong><span>{powered ? '闭合开关后，铁芯开始吸附回形针。' : '先通电，电磁铁才会表现磁性。'}</span></article><article className={coilLevel === 'many' ? 'observation-chip active' : 'observation-chip calm'}><strong>匝数变量</strong><span>{coilLevel === 'many' ? '线圈匝数增加后磁场更明显。' : '继续增加线圈匝数比较强弱。'}</span></article><article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>数量比较</strong><span>{observationChoice === 'correct' ? '吸起回形针数量明显增多。' : '等待记录正确比较结果。'}</span></article></div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}><span className="eyebrow">Lab Prompt</span><h3>{completed ? '实验已完成' : stepTitles[step]}</h3><p>{prompt}</p></div>
          <section className="info-card generic-notebook-card"><div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div><div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div><div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div></section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>当前步骤操作</h3><div className="summary-stack generic-choice-stack">{step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}{step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handlePower('on')} type="button"><strong>闭合开关通电</strong><span>让电磁铁开始吸引回形针。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePower('off')} type="button"><strong>保持断路状态</strong><span>错误演示：没有通电不会出现明显磁性。</span></button></> : null}{step === 3 ? <><button className={coilLevel === 'few' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleCoil('few')} type="button"><strong>保持较少匝数</strong><span>对比组，磁性较弱。</span></button><button className={coilLevel === 'many' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleCoil('many')} type="button"><strong>增加线圈匝数</strong><span>比较磁性是否增强。</span></button></> : null}{step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“匝数增多后吸起回形针更多”</strong><span>这是本实验的正确比较结果。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button"><strong>记录“数量没有变化”</strong><span>错误演示：忽略变量效果。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('weaker')} type="button"><strong>记录“匝数越多吸附越弱”</strong><span>错误演示：结论方向相反。</span></button></> : null}{step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>电磁铁通电才有磁性，匝数增多时磁性增强</strong><span>把两条核心规律一起总结完整。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('powerless')} type="button"><strong>断电后磁性仍和通电时一样强</strong><span>错误演示：忽略通电条件。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('turns-less')} type="button"><strong>匝数减少会更强</strong><span>错误演示：与比较结果相反。</span></button></> : null}</div></section>
          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{powered ? '已通电' : '待通电'} / 匝数 {coilLevel === 'many' ? '较多' : coilLevel === 'few' ? '较少' : '未设置'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先通电再比较'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“电磁铁磁性”升级成通电、匝数调节和吸附数量对比一体化的专属页。</small></section>
        </aside>
      </div>
    </section>
  );
}
