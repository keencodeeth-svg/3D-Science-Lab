import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'flask' | 'bubbles';
type MaterialId = 'flask' | 'permanganate' | 'peroxide' | 'acid' | 'dropper';
type TimelineState = 'done' | 'current' | 'todo';

interface PermanganatePeroxideLabPlayerProps {
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
  2: '加入高锰酸钾',
  3: '加入双氧水并酸化',
  4: '观察褪色与气泡',
  5: '总结氧化还原现象',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别锥形瓶、高锰酸钾溶液、双氧水、稀酸和滴管。',
  2: '向锥形瓶中加入紫色高锰酸钾溶液。',
  3: '滴加双氧水并酸化，启动快速褪色反应。',
  4: '观察紫色是否明显褪去，同时是否出现连续气泡。',
  5: '总结该实验中颜色褪去与气泡放出的组合现象。',
};

const materialLabels: Record<MaterialId, string> = {
  flask: '锥形瓶',
  permanganate: '高锰酸钾溶液',
  peroxide: '双氧水',
  acid: '稀酸',
  dropper: '滴管',
};

const materialOrder: MaterialId[] = ['flask', 'permanganate', 'peroxide', 'acid', 'dropper'];

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

export function PermanganatePeroxideLabPlayer({ experiment, onTelemetry }: PermanganatePeroxideLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [prepared, setPrepared] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过高锰酸钾与双氧水反应观察“紫色褪去 + 气泡放出”的强视觉现象。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const oxidationValue = clamp(24 + (prepared ? 16 : 0) + (reacting ? 30 : 0), 20, 99);
  const bubbleValue = clamp(22 + (cameraPreset !== 'bench' ? 12 : 0) + (observationChoice === 'correct' ? 30 : 0), 20, 99);
  const readinessValue = clamp(progressPercent + (prepared ? 10 : 0) + (reacting ? 14 : 0), 20, 100);

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
        setCameraPreset('flask');
        advanceStep(2, '器材识别完成，下一步向锥形瓶中加入高锰酸钾溶液。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handlePrepare = (choice: 'correct' | 'empty') => {
    if (step !== 2 || completed) return;
    if (choice === 'empty') {
      markError('需要先加入紫色高锰酸钾溶液，才会有明显的褪色参照。');
      return;
    }
    setPrepared(true);
    appendNote('装液状态：锥形瓶中已形成稳定的紫色液层。');
    advanceStep(3, '紫色溶液已准备好，下一步滴加双氧水并酸化。');
  };

  const handleReact = (choice: 'correct' | 'water') => {
    if (step !== 3 || completed) return;
    if (!prepared) {
      markError('请先加入高锰酸钾溶液，再启动反应。');
      return;
    }
    if (choice === 'water') {
      markError('本步需要加入双氧水并酸化，清水不会产生明显褪色与放氧现象。');
      return;
    }
    setReacting(true);
    setCameraPreset('bubbles');
    appendNote('反应启动：溶液颜色快速减弱，同时有连续气泡冒出。');
    advanceStep(4, '反应已启动，请记录颜色和气泡的变化。');
  };

  const handleObserve = (choice: 'correct' | 'darker' | 'no-bubbles') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!reacting) {
      markError('请先启动反应，再记录现象。');
      return;
    }
    if (choice === 'correct') {
      appendNote('观察记录：高锰酸钾紫色明显褪去，并伴随连续气泡放出。');
      advanceStep(5, '现象记录完成，请总结原因和结论。');
      return;
    }
    markError(choice === 'darker' ? '正确现象不是颜色更深，而是紫色显著褪去。' : '反应过程中会伴随明显气泡放出，不能忽略。');
  };

  const handleSummary = (choice: 'correct' | 'only-color' | 'no-reaction') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      appendNote('结论形成：高锰酸钾在该体系中发生明显褪色，并伴随氧气放出。');
      advanceStep(null, experiment.feedback.successSummary);
      return;
    }
    markError(choice === 'only-color' ? '本实验不只是颜色变化，还能观察到明显气泡。' : '该体系会发生明显反应，并非没有变化。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setPrepared(false);
    setReacting(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新观察高锰酸钾溶液的褪色放氧现象。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先形成稳定的紫色液面，再启动反应。', '观察重点是“颜色快速变浅 + 连续气泡”。', '注意褪色和放氧是同时出现的。']
    : [
        stepConfig?.failureHints[0] ?? '请按当前步骤重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对试剂顺序。',
        '建议按“识别 → 加紫液 → 启动反应 → 记褪色与气泡 → 总结”的顺序重做。',
      ];

  return (
    <section className="panel playground-panel permanganate-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把高锰酸钾的深紫液面、褪色轨迹和连续放氧气泡做成更有冲击力的反应场景。</p>
        </div>
        <div className="badge-row"><span className="badge badge-demo">专属实验场景</span><span className="badge">Step {step} / 5</span><span className="badge">{experiment.productization.status}</span></div>
      </div>
      <div className="playground-grid permanganate-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'flask' ? '锥形瓶近景' : '反应近景'}</span></div><span className="badge">{experiment.grade}</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div>
            </div>
          </section>
          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>反应强度 {oxidationValue}</span><div className="chem-meter-bar"><i style={{ width: `${oxidationValue}%` }} /></div></div>
              <div className="chem-meter"><span>气泡活跃 {bubbleValue}</span><div className="chem-meter-bar"><i style={{ width: `${bubbleValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
          <section className="info-card permanganate-data-card">
            <span className="eyebrow">Readout</span>
            <h3>反应读数板</h3>
            <div className="generic-readout-grid permanganate-readout-grid">
              <article className={prepared ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>紫色液面</span><strong>{prepared ? '已建立' : '--'}</strong><small>{prepared ? '锥形瓶中已有稳定的高锰酸钾溶液。' : '先加入高锰酸钾溶液。'}</small></article>
              <article className={reacting ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>褪色放氧</span><strong>{reacting ? '进行中' : '--'}</strong><small>{reacting ? '液体正在褪色并产生连续气泡。' : '等待启动反应。'}</small></article>
              <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '褪色并放氧' : '等待总结'}</strong><small>颜色变化和气泡释放一起构成该实验的关键证据。</small></article>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '高锰酸钾褪色装置'} · 当前重点：{step <= 2 ? '建立紫色液面' : step === 3 ? '启动反应' : '观察褪色与气泡'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'flask' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('flask')} type="button">锥形瓶</button>
              <button className={cameraPreset === 'bubbles' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bubbles')} type="button">气泡</button>
            </div>
          </div>

          <div className={`scene-canvas permanganate-stage preset-${cameraPreset} ${prepared ? 'prepared' : ''} ${reacting ? 'reacting' : ''}`}>
            <div className="permanganate-rig">
              <div className="pmx-bench-shadow" />
              <div className="pmx-bench-caustic" />
              <div className="pmx-base" />
              <div className={prepared ? 'pmx-flask active' : 'pmx-flask'}>
                <div className="pmx-flask-foot" />
                <div className="pmx-flask-rim" />
                <div className="pmx-flask-neck" />
                <div className="pmx-flask-gloss" />
                <div className={prepared ? 'pmx-meniscus active' : 'pmx-meniscus'} />
                <div className={reacting ? 'pmx-reaction-front active' : 'pmx-reaction-front'} />
                <div className={reacting ? 'pmx-liquid active faded' : prepared ? 'pmx-liquid active' : 'pmx-liquid'}>
                  <span className="pmx-liquid-surface" />
                  <span className={prepared ? 'pmx-purple-plume active' : 'pmx-purple-plume'} />
                  <span className={reacting ? 'pmx-peroxide-plume active' : 'pmx-peroxide-plume'} />
                </div>
                <div className={reacting ? 'pmx-bubbles active' : 'pmx-bubbles'}>
                  <span className="pmx-bubble-stream" />
                  <span className={reacting ? 'pmx-bubble-mist active' : 'pmx-bubble-mist'} />
                </div>
                <div className={reacting ? 'pmx-foam active' : 'pmx-foam'}>
                  <span className="pmx-foam-crown" />
                  <span className={reacting ? 'pmx-foam-front active' : 'pmx-foam-front'} />
                </div>
              </div>
              <div className={step >= 2 ? 'pmx-bottle permanganate active' : 'pmx-bottle permanganate'}>
                <span className="pmx-bottle-rim" />
                <span className="pmx-bottle-glass" />
                <span className="pmx-bottle-cap" />
                <span className="pmx-bottle-fill" />
              </div>
              <div className={step >= 3 ? 'pmx-bottle peroxide active' : 'pmx-bottle peroxide'}>
                <span className="pmx-bottle-rim" />
                <span className="pmx-bottle-glass" />
                <span className="pmx-bottle-cap" />
                <span className="pmx-bottle-fill" />
              </div>
              <div className={step >= 3 ? 'pmx-dropper acid active' : 'pmx-dropper acid'}>
                <span className="pmx-dropper-bulb" />
                <span className="pmx-dropper-glass" />
                <span className="pmx-dropper-meniscus" />
                <span className={reacting ? 'pmx-drop active' : 'pmx-drop'} />
              </div>
            </div>
          </div>

          <div className="observation-ribbon permanganate-observation-row">
            <article className={prepared ? 'observation-chip active' : 'observation-chip calm'}><strong>装液</strong><span>{prepared ? '紫色液面已建立。' : '等待加入高锰酸钾。'}</span></article>
            <article className={reacting ? 'observation-chip active' : 'observation-chip calm'}><strong>反应</strong><span>{reacting ? '褪色与放氧正在进行。' : '等待加入双氧水并酸化。'}</span></article>
            <article className={observationChoice === 'correct' ? 'observation-chip active' : 'observation-chip calm'}><strong>记录</strong><span>{observationChoice === 'correct' ? '已记录褪色和气泡。' : '等待完成观察记录。'}</span></article>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}>
            <span className="eyebrow">Lab Prompt</span>
            <h3>{completed ? '实验已完成' : stepTitles[step]}</h3>
            <p>{prompt}</p>
          </div>

          <section className="info-card generic-notebook-card">
            <div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>实验记录</h3></div><span className="badge">过程留痕</span></div>
            <div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div>
            <div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div>
          </section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>当前步骤操作</h3>
            <div className="summary-stack generic-choice-stack">
              {step === 1 ? materialOrder.map((materialId) => (
                <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>
              )) : null}
              {step === 2 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handlePrepare('correct')} type="button"><strong>向锥形瓶中加入高锰酸钾溶液</strong><span>建立深紫色起始液面。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handlePrepare('empty')} type="button"><strong>空瓶状态下直接判断反应结果</strong><span>错误演示：没有反应基线。</span></button>
              </> : null}
              {step === 3 ? <>
                <button className="summary-choice generic-choice primary" onClick={() => handleReact('correct')} type="button"><strong>滴加双氧水并酸化，启动褪色放氧</strong><span>触发强烈的颜色和气泡变化。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleReact('water')} type="button"><strong>改用清水代替反应液</strong><span>错误演示：现象不明显。</span></button>
              </> : null}
              {step === 4 ? <>
                <button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“紫色明显褪去，并伴随连续气泡放出”</strong><span>这是本实验的正确现象。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleObserve('darker')} type="button"><strong>记录“反应后颜色变得更深更紫”</strong><span>错误演示：与真实现象相反。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleObserve('no-bubbles')} type="button"><strong>记录“只有颜色变化，没有任何气泡”</strong><span>错误演示：忽略放氧现象。</span></button>
              </> : null}
              {step === 5 ? <>
                <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>该体系会出现高锰酸钾褪色并伴随氧气气泡放出</strong><span>完整总结本实验结论。</span></button>
                <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('only-color')} type="button"><strong>这只是单纯的颜色变化，和放氧无关</strong><span>错误演示：遗漏气泡证据。</span></button>
                <button className="summary-choice generic-choice danger" onClick={() => handleSummary('no-reaction')} type="button"><strong>高锰酸钾和双氧水混合后几乎没有明显反应</strong><span>错误演示：忽略整体现象。</span></button>
              </> : null}
            </div>
          </section>
          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li>
              <li>装置状态：{prepared ? '紫液已准备' : '紫液待准备'} / {reacting ? '反应已启动' : '反应待启动'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先建立紫色液面，再启动反应'}</li>
            </ul>
          </section>
          <section className="info-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul>
          </section>
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>实验控制</h3>
            <div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div>
            <small>这页已把“褪色放氧”升级成颜色轨迹和气泡动态都更明显的专属实验页。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
