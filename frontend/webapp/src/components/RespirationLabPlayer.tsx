import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'chamber' | 'close';
type MaterialId = 'bell-jar' | 'balloons' | 'branch-tube' | 'membrane' | 'stand';
type DiaphragmState = 'rest' | 'down' | 'up';
type TimelineState = 'done' | 'current' | 'todo';

interface RespirationLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别模型器材',
  2: '装好呼吸模型',
  3: '下拉膈膜',
  4: '观察球囊变化',
  5: '总结吸气原理',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别钟罩、球囊、Y 形导管、橡皮膜和支架。',
  2: '将装置密封好，确保钟罩内的体积变化能被完整传递。',
  3: '向下拉动底部橡皮膜，模拟膈肌收缩下移。',
  4: '观察球囊和钟罩内体积变化，判断模型在模拟什么过程。',
  5: '把膈肌运动、胸腔容积变化和吸气现象对应起来。',
};

const materialLabels: Record<MaterialId, string> = {
  'bell-jar': '钟罩',
  balloons: '球囊',
  'branch-tube': 'Y 形导管',
  membrane: '橡皮膜',
  stand: '支架',
};

const materialOrder: MaterialId[] = ['bell-jar', 'balloons', 'branch-tube', 'membrane', 'stand'];

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

export function RespirationLabPlayer({ experiment, onTelemetry }: RespirationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [assembled, setAssembled] = useState(false);
  const [diaphragmState, setDiaphragmState] = useState<DiaphragmState>('rest');
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先密封模型，再通过下拉膈膜观察球囊胀大。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const inhaling = diaphragmState === 'down';
  const chestVolume = inhaling ? '增大' : diaphragmState === 'up' ? '减小' : '待变化';
  const balloonState = inhaling ? '胀大' : diaphragmState === 'up' ? '回缩' : '待变化';
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const sealValue = clamp(40 + (assembled ? 22 : 0) + (inhaling ? 12 : 0), 24, 99);
  const clarityValue = clamp(42 + (diaphragmState !== 'rest' ? 14 : 0) + (observationChoice === 'correct' ? 18 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 28, 99);
  const readinessValue = clamp(progressPercent + (assembled ? 16 : 0) + (inhaling ? 16 : 0), 20, 100);

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
        setCameraPreset('chamber');
        advanceStep(2, '器材识别完成，下一步装好并密封呼吸模型。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleAssemble = (choice: 'sealed' | 'leak') => {
    if (step !== 2 || completed) return;
    if (choice === 'leak') {
      markError('模型必须保持相对密封，钟罩内压强变化才能传递到球囊。');
      return;
    }
    setAssembled(true);
    appendNote('装置准备：钟罩、导管和橡皮膜已密封连接。');
    advanceStep(3, '装置就绪，向下拉动橡皮膜模拟膈肌下移。');
  };

  const handleDiaphragm = (choice: DiaphragmState) => {
    if (step !== 3 || completed) return;
    if (!assembled) {
      markError('请先装好并密封模型，再进行膈膜操作。');
      return;
    }
    setDiaphragmState(choice);
    setCameraPreset(choice === 'down' ? 'close' : 'chamber');
    appendNote(`膈膜操作：已${choice === 'down' ? '向下拉动' : '向上推回'}橡皮膜。`);
    if (choice === 'down') {
      advanceStep(4, '钟罩内容积增大，继续观察球囊变化。');
      return;
    }
    markError('本步骤要先模拟吸气过程，应先下拉橡皮膜。');
  };

  const handleObserve = (choice: 'correct' | 'same' | 'reverse') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (diaphragmState !== 'down') {
      markError('请先下拉橡皮膜，让模型进入吸气状态。');
      return;
    }
    if (choice === 'correct') {
      appendNote('现象记录：橡皮膜下拉后球囊胀大，说明钟罩内容积增大。');
      advanceStep(5, '观察完成，最后总结吸气过程对应的生理原理。');
      return;
    }
    if (choice === 'same') {
      markError('球囊并不是毫无变化，体积变化正是本模型要呈现的关键现象。');
      return;
    }
    markError('橡皮膜下拉时球囊应胀大，不是回缩。');
  };

  const handleSummary = (choice: 'correct' | 'oxygen' | 'muscle') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：膈肌下移使胸腔容积增大，空气进入肺，模型球囊胀大。');
      return;
    }
    if (choice === 'oxygen') {
      markError('球囊胀大不是因为氧气主动把它撑开，而是压强变化使空气进入。');
      return;
    }
    markError('吸气时膈肌应收缩下移，不是上提。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setAssembled(false);
    setDiaphragmState('rest');
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新通过呼吸模型观察膈膜与球囊变化。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先保证装置密封，否则球囊不会出现明显变化。',
        '下拉橡皮膜模拟膈肌收缩下移，对应吸气过程。',
        '观察重点是容积变化和球囊状态，而不是器材名称本身。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对模型变化。',
        '建议先密封模型，再下拉橡皮膜观察球囊是否胀大。',
      ];

  return (
    <section className="panel playground-panel respiration-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>把钟罩呼吸模型做成可操作的透明装置，让“膈肌下移—容积增大—球囊胀大”形成稳定认知链。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid respiration-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row">
                <div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div>
                <span className="badge">生物</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'chamber' ? '钟罩观察' : '球囊细节'}</span></div>
                <span className="badge">{experiment.grade}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div>
                <span className="badge">{experiment.durationMinutes} 分钟</span>
              </div>
            </div>
          </section>

          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>密封值 {sealValue}</span><div className="chem-meter-bar"><i style={{ width: `${sealValue}%` }} /></div></div>
              <div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>

          <section className="info-card respiration-data-card">
            <span className="eyebrow">Readout</span>
            <h3>呼吸读数板</h3>
            <div className="generic-readout-grid respiration-readout-grid">
              <article className={assembled ? 'lab-readout-card active' : 'lab-readout-card warn'}>
                <span>装置状态</span>
                <strong>{assembled ? '已密封' : '待密封'}</strong>
                <small>{assembled ? '钟罩内压强变化能够传递到球囊。' : '漏气会让模型现象不明显。'}</small>
              </article>
              <article className={diaphragmState !== 'rest' ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>胸腔容积</span>
                <strong>{chestVolume}</strong>
                <small>{inhaling ? '橡皮膜下移后，钟罩内容积增大。' : '先做膈膜操作再观察。'}</small>
              </article>
              <article className={observationChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>球囊状态</span>
                <strong>{balloonState}</strong>
                <small>模型中的球囊对应肺，体积变化会跟随钟罩压强变化。</small>
              </article>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '呼吸模型'} · 当前重点：{step <= 2 ? '装置密封' : step === 3 ? '膈膜动作' : '观察吸气'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'chamber' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('chamber')} type="button">钟罩</button>
              <button className={cameraPreset === 'close' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('close')} type="button">球囊</button>
            </div>
          </div>

          <div className={`scene-canvas respiration-stage preset-${cameraPreset} ${assembled ? 'assembled' : ''} ${diaphragmState}`}>
            <div className="respiration-rig">
              <div className="respiration-stand" />
              <div className="respiration-cap" />
              <div className="respiration-chamber">
                <div className="respiration-reflection" />
                <div className="respiration-tube" />
                <div className="respiration-branch left" />
                <div className="respiration-branch right" />
                <div className={inhaling ? 'respiration-balloon left expanded' : diaphragmState === 'up' ? 'respiration-balloon left contracted' : 'respiration-balloon left'} />
                <div className={inhaling ? 'respiration-balloon right expanded' : diaphragmState === 'up' ? 'respiration-balloon right contracted' : 'respiration-balloon right'} />
                <div className={inhaling ? 'respiration-airflow active' : 'respiration-airflow'}>
                  <span className="respiration-arrow arrow-1" />
                  <span className="respiration-arrow arrow-2" />
                  <span className="respiration-arrow arrow-3" />
                </div>
              </div>
              <div className={`respiration-membrane ${diaphragmState}`} />
            </div>
          </div>

          <div className="observation-ribbon respiration-observation-row">
            <article className={assembled ? 'observation-chip active' : 'observation-chip calm'}>
              <strong>模型密封</strong>
              <span>{assembled ? '装置密封良好，适合观察压强变化。' : '请先完成密封组装。'}</span>
            </article>
            <article className={diaphragmState === 'down' ? 'observation-chip active' : diaphragmState === 'up' ? 'observation-chip warn' : 'observation-chip calm'}>
              <strong>膈膜动作</strong>
              <span>{diaphragmState === 'down' ? '已模拟膈肌下移。' : diaphragmState === 'up' ? '当前更像呼气状态。' : '等待进行膈膜操作。'}</span>
            </article>
            <article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}>
              <strong>肺部表现</strong>
              <span>{observationChoice === 'correct' ? '球囊随吸气过程明显胀大。' : '等待记录球囊变化。'}</span>
            </article>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}>
            <span className="eyebrow">Lab Prompt</span>
            <h3>{completed ? '实验已完成' : stepTitles[step]}</h3>
            <p>{prompt}</p>
          </div>

          <section className="info-card generic-notebook-card">
            <div className="generic-notebook-head">
              <div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div>
              <span className="badge">过程留痕</span>
            </div>
            <div className="timeline-list">
              {timeline.map((entry) => (
                <div className={`timeline-item ${entry.state}`} key={entry.title}>
                  <span className="timeline-marker" />
                  <div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div>
                </div>
              ))}
            </div>
            <div className="lab-note-stack">
              {labNotes.map((note, index) => (
                <div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>
              ))}
            </div>
          </section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>当前步骤操作</h3>
            <div className="summary-stack generic-choice-stack">
              {step === 1 ? materialOrder.map((materialId) => (
                <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button">
                  <strong>识别 {materialLabels[materialId]}</strong>
                  <span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span>
                </button>
              )) : null}
              {step === 2 ? (
                <>
                  <button className="summary-choice generic-choice primary" onClick={() => handleAssemble('sealed')} type="button">
                    <strong>密封连接钟罩和橡皮膜</strong>
                    <span>让内部压强变化能够传递到球囊。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleAssemble('leak')} type="button">
                    <strong>留一处漏气缝隙</strong>
                    <span>错误演示：现象会变得不明显。</span>
                  </button>
                </>
              ) : null}
              {step === 3 ? (
                <>
                  <button className={diaphragmState === 'down' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleDiaphragm('down')} type="button">
                    <strong>向下拉橡皮膜</strong>
                    <span>模拟膈肌收缩下移，对应吸气。</span>
                  </button>
                  <button className={diaphragmState === 'up' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleDiaphragm('up')} type="button">
                    <strong>先向上推橡皮膜</strong>
                    <span>错误演示：更接近呼气状态。</span>
                  </button>
                </>
              ) : null}
              {step === 4 ? (
                <>
                  <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button">
                    <strong>橡皮膜下拉后球囊胀大，说明胸腔容积增大</strong>
                    <span>这是模型要表达的核心现象。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('same')} type="button">
                    <strong>球囊大小没有变化</strong>
                    <span>错误演示：忽略体积变化。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleObserve('reverse')} type="button">
                    <strong>橡皮膜下拉后球囊回缩</strong>
                    <span>错误演示：把现象记反。</span>
                  </button>
                </>
              ) : null}
              {step === 5 ? (
                <>
                  <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                    <strong>膈肌下移使胸腔容积增大，空气进入肺</strong>
                    <span>把模型变化与真实吸气过程对应起来。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('oxygen')} type="button">
                    <strong>球囊胀大只是因为氧气主动把它顶开</strong>
                    <span>错误演示：忽略压强变化。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleSummary('muscle')} type="button">
                    <strong>吸气时膈肌上提</strong>
                    <span>错误演示：肌肉动作方向错误。</span>
                  </button>
                </>
              ) : null}
            </div>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{assembled ? '模型已密封' : '待密封'} / 球囊 {balloonState}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意观察球囊变化'}</li>
            </ul>
          </section>

          <section className="info-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>实验控制</h3>
            <div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div>
            <small>这页已把“呼吸模型”升级成透明钟罩、球囊胀缩和膈膜动作联动的专属页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
