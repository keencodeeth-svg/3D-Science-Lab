import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'filter' | 'evaporate';
type MaterialId = 'beaker' | 'salt' | 'rod' | 'funnel' | 'dish';
type TimelineState = 'done' | 'current' | 'todo';

interface RoughSaltLabPlayerProps {
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
  2: '溶解粗盐',
  3: '过滤不溶物',
  4: '蒸发结晶并观察',
  5: '总结提纯流程',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别烧杯、粗盐、玻璃棒、漏斗和蒸发皿。',
  2: '把粗盐加入水中搅拌，使可溶部分先溶解。',
  3: '用漏斗和滤纸过滤，分离出不溶性杂质。',
  4: '蒸发滤液，观察白色晶体重新析出。',
  5: '总结粗盐提纯的标准实验流程。',
};

const materialLabels: Record<MaterialId, string> = {
  beaker: '烧杯',
  salt: '粗盐样品',
  rod: '玻璃棒',
  funnel: '漏斗与滤纸',
  dish: '蒸发皿',
};

const materialOrder: MaterialId[] = ['beaker', 'salt', 'rod', 'funnel', 'dish'];
const roughsaltStepOrder: StepId[] = [1, 2, 3, 4, 5];

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

export function RoughSaltLabPlayer({ experiment, onTelemetry }: RoughSaltLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [dissolved, setDissolved] = useState(false);
  const [filtered, setFiltered] = useState(false);
  const [crystallized, setCrystallized] = useState(false);
  const [observationChoice, setObservationChoice] = useState('');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：通过溶解、过滤和蒸发结晶完成粗盐提纯。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const purityValue = clamp(32 + (dissolved ? 18 : 0) + (filtered ? 24 : 0) + (crystallized ? 20 : 0), 22, 99);
  const clarityValue = clamp(36 + (cameraPreset !== 'bench' ? 12 : 0) + (filtered ? 18 : 0), 24, 99);
  const readinessValue = clamp(progressPercent + (dissolved ? 10 : 0) + (filtered ? 12 : 0), 20, 100);

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
        advanceStep(2, '器材识别完成，先把粗盐加入水中搅拌溶解。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }
      return next;
    });
  };

  const handleDissolve = (choice: 'correct' | 'dry-heat') => {
    if (step !== 2 || completed) return;
    if (choice === 'dry-heat') {
      markError('粗盐提纯应先溶解，不要直接干烧原样品。');
      return;
    }
    setDissolved(true);
    setCameraPreset('filter');
    appendNote('溶解完成：可溶性盐进入溶液，泥沙等杂质仍未溶解。');
    advanceStep(3, '已形成含杂质盐溶液，下一步过滤不溶物。');
  };

  const handleFilter = (choice: 'correct' | 'skip') => {
    if (step !== 3 || completed) return;
    if (!dissolved) {
      markError('请先完成溶解，再进行过滤。');
      return;
    }
    if (choice === 'skip') {
      markError('不过滤会把不溶性杂质直接带入后续蒸发步骤。');
      return;
    }
    setFiltered(true);
    setCameraPreset('evaporate');
    appendNote('过滤完成：不溶物留在滤纸上，滤液转入蒸发皿。');
    advanceStep(4, '滤液已获得，请蒸发并观察白色晶体析出。');
  };

  const handleObserve = (choice: 'correct' | 'muddy' | 'no-change') => {
    if (step !== 4 || completed) return;
    setObservationChoice(choice);
    if (!filtered) {
      markError('请先完成过滤，再蒸发观察晶体。');
      return;
    }
    if (choice === 'correct') {
      setCrystallized(true);
      appendNote('蒸发观察：滤液减少后出现较纯净的白色盐晶体。');
      advanceStep(5, '现象判断正确，最后总结粗盐提纯流程。');
      return;
    }
    if (choice === 'muddy') {
      markError('过滤后的蒸发产物不应仍是明显浑浊泥浆状。');
      return;
    }
    markError('蒸发后会有晶体析出，不会完全没有变化。');
  };

  const handleSummary = (choice: 'correct' | 'heat-only' | 'filter-only') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (choice === 'correct') {
      advanceStep(null, '总结正确：粗盐提纯的一般流程是溶解、过滤、蒸发结晶。');
      return;
    }
    if (choice === 'heat-only') {
      markError('仅靠加热不能去除不溶性杂质，步骤不完整。');
      return;
    }
    markError('只有过滤也不够，还需要蒸发滤液得到晶体。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setDissolved(false);
    setFiltered(false);
    setCrystallized(false);
    setObservationChoice('');
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新完成粗盐提纯流程。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? ['先溶解再过滤，最后蒸发结晶。', '过滤的目标是去除不溶性杂质。', '总结时记住“三步法”：溶解、过滤、蒸发。']
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对粗盐提纯流程。',
        '建议按“溶解 → 过滤 → 蒸发结晶 → 总结”的顺序重做。',
      ];

  const roughsaltObservationResult = observationChoice === 'correct'
    ? '白色晶体重新析出'
    : observationChoice === 'muddy'
      ? '误判为浑浊杂质'
      : observationChoice === 'no-change'
        ? '误判为无变化'
        : crystallized
          ? '正在结晶'
          : '待观察';
  const roughsaltWorkbenchStatus = completed
    ? '提纯流程已闭环：识别、溶解、过滤、蒸发结晶和总结全部完成。'
    : step === 1
      ? '先识别烧杯、粗盐、玻璃棒、漏斗和蒸发皿。'
      : step === 2
        ? '先让可溶部分进入溶液，再处理不溶杂质。'
        : step === 3
          ? '过滤的目标是分离不溶物，滤液要更澄清。'
          : step === 4
            ? '蒸发滤液后应观察到白色晶体重新析出。'
            : '总结时记住三步法：溶解、过滤、蒸发结晶。';
  const roughsaltCompletionCopy = completed
    ? '实验已完成，当前版本支持粗盐溶解、漏斗过滤、蒸发结晶与规范总结。'
    : '完成全部 5 个步骤后，这里会输出本次粗盐提纯实验的总结结果。';
  const latestLabNote = labNotes[0] ?? '实验已载入：通过溶解、过滤和蒸发结晶完成粗盐提纯。';

  return (
    <section className="panel playground-panel roughsalt-lab-panel roughsalt-stage-first-panel roughsalt-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学实验页</h2>
          <p>把烧杯、漏斗和蒸发皿完整留在中央舞台，操作、记录和总结统一收回下方工作台，不再压住提纯流程。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">得分 {score}</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid roughsalt-grid">
        <aside className="playground-side roughsalt-side-rail roughsalt-side-rail-left">
          <section className="info-card roughsalt-rail-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'filter' ? '过滤近景' : '蒸发结晶'}</span></div><span className="badge">{experiment.grade}</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.unit}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div>
            </div>
          </section>
          <section className="info-card roughsalt-rail-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>纯净度 {purityValue}</span><div className="chem-meter-bar"><i style={{ width: `${purityValue}%` }} /></div></div>
              <div className="chem-meter"><span>液体清澈度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>
        </aside>

        <section className="scene-panel roughsalt-workbench-stage">
          <div className="scene-toolbar roughsalt-workbench-toolbar">
            <div className="roughsalt-toolbar-head">
              <div className="roughsalt-toolbar-kicker">提纯工作台</div>
              <strong>{experiment.title}</strong>
              <p className="roughsalt-toolbar-copy">中央舞台只保留溶解、过滤和蒸发器材，提示、操作和复盘统一下沉到底部工作台。</p>
            </div>
            <div className="camera-actions roughsalt-camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'filter' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('filter')} type="button">过滤</button>
              <button className={cameraPreset === 'evaporate' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('evaporate')} type="button">结晶</button>
            </div>
          </div>

          <div className="scene-meta-strip roughsalt-stage-meta">
            <div className={`roughsalt-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>步骤 {step} · {stepTitles[step]}</strong>
              <p>{prompt}</p>
            </div>
            <div className="roughsalt-step-pills" aria-label="实验步骤概览">
              {roughsaltStepOrder.map((stepId) => (
                <span className={step === stepId ? 'roughsalt-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'roughsalt-step-pill done' : 'roughsalt-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className={`scene-canvas roughsalt-stage preset-${cameraPreset} ${dissolved ? 'dissolved' : ''} ${filtered ? 'filtered' : ''} ${crystallized ? 'crystallized' : ''}`}><div className="roughsalt-rig" /></div>

          <div className="workbench-inline-dock roughsalt-workbench-dock">
            <div className="roughsalt-workbench-status-grid">
              <div className={`info-card roughsalt-status-card tone-${promptTone}`}><span>当前进度</span><strong>步骤 {step} · {stepTitles[step]}</strong><p>{roughsaltWorkbenchStatus}</p></div>
              <div className={`info-card roughsalt-status-card ${dissolved ? 'tone-success' : ''}`.trim()}><span>溶解与过滤</span><strong>{dissolved ? '已形成盐溶液' : '待溶解'} / {filtered ? '滤液已分离' : '待过滤'}</strong><p>先让可溶盐进入溶液，再去除不溶性杂质。</p></div>
              <div className={`info-card roughsalt-status-card ${crystallized ? 'tone-success' : promptTone === 'error' && step >= 4 ? 'tone-error' : ''}`.trim()}><span>结晶结果</span><strong>{roughsaltObservationResult}</strong><p>{crystallized ? '蒸发后已出现白色晶体。' : '重点看蒸发皿内是否重新析出白色晶体。'}</p></div>
              <div className={`info-card roughsalt-status-card ${completed ? 'tone-success' : ''}`.trim()}><span>实验指标</span><strong>得分 {score} · 完成度 {readinessValue}%</strong><p>清澈度 {clarityValue} · 最新记录：{latestLabNote}</p></div>
            </div>

            <div className="roughsalt-inline-workbench">
              <section className="info-card roughsalt-inline-panel roughsalt-workbench-actions">
                <span className="eyebrow">Actions</span>
                <h3>当前步骤操作</h3>
                <div className="summary-stack generic-choice-stack">
                  {step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span></button>)) : null}
                  {step === 2 ? <><button className="summary-choice generic-choice primary" onClick={() => handleDissolve('correct')} type="button"><strong>把粗盐加入水中搅拌溶解</strong><span>先让可溶部分进入溶液。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleDissolve('dry-heat')} type="button"><strong>直接干烧粗盐</strong><span>错误演示：顺序错误。</span></button></> : null}
                  {step === 3 ? <><button className="summary-choice generic-choice primary" onClick={() => handleFilter('correct')} type="button"><strong>用漏斗过滤不溶物</strong><span>分离出更澄清的滤液。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleFilter('skip')} type="button"><strong>不过滤直接蒸发</strong><span>错误演示：杂质会被带入后续步骤。</span></button></> : null}
                  {step === 4 ? <><button className={observationChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleObserve('correct')} type="button"><strong>记录“蒸发后重新析出白色晶体”</strong><span>这是本实验的正确现象。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleObserve('muddy')} type="button"><strong>记录“最后变成浑浊泥浆”</strong><span>错误演示：忽略结晶特征。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleObserve('no-change')} type="button"><strong>记录“没有任何变化”</strong><span>错误演示：与结晶现象不符。</span></button></> : null}
                  {step === 5 ? <><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>粗盐提纯的一般流程是溶解、过滤、蒸发结晶</strong><span>完整总结本实验结论。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('heat-only')} type="button"><strong>提纯粗盐只需要一直加热</strong><span>错误演示：步骤过度简化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('filter-only')} type="button"><strong>提纯粗盐只要过滤一次就结束</strong><span>错误演示：缺少得到晶体的步骤。</span></button></> : null}
                </div>
              </section>

              <section className="info-card roughsalt-inline-panel roughsalt-notebook-panel">
                <div className="generic-notebook-head"><div><span className="eyebrow">Notebook</span><h3>过程记录与读数</h3></div><span className="badge">舞台下工作台</span></div>
                <div className="generic-readout-grid roughsalt-readout-grid">
                  <article className={dissolved ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>溶解状态</span><strong>{dissolved ? '已形成盐溶液' : '--'}</strong><small>{dissolved ? '可溶部分进入溶液，不溶杂质仍保留。' : '先完成粗盐溶解。'}</small></article>
                  <article className={filtered ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>过滤状态</span><strong>{filtered ? '滤液已分离' : '--'}</strong><small>{filtered ? '不溶物留在滤纸上，滤液更澄清。' : '再完成漏斗过滤。'}</small></article>
                  <article className={summaryChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>核心结论</span><strong>{summaryChoice === 'correct' ? '三步法已掌握' : '等待总结'}</strong><small>提纯流程要覆盖溶解、过滤、蒸发结晶。</small></article>
                </div>
                <div className="timeline-list">{timeline.map((entry) => (<div className={`timeline-item ${entry.state}`} key={entry.title}><span className="timeline-marker" /><div className="timeline-copy"><strong>{entry.title}</strong><small>{entry.detail}</small></div></div>))}</div>
                <div className="lab-note-stack">{labNotes.map((note, index) => (<div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>{note}</div>))}</div>
              </section>
            </div>
          </div>
        </section>

        <aside className="playground-side roughsalt-side-rail roughsalt-side-rail-right">
          <section className="info-card roughsalt-rail-card"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{dissolved ? '已溶解' : '待溶解'} / {filtered ? '已过滤' : '待过滤'} / {crystallized ? '已结晶' : '待结晶'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '注意先溶解后过滤，最后蒸发结晶'}</li></ul></section>
          <section className="info-card roughsalt-rail-card roughsalt-rail-prompt"><span className="eyebrow">Readout</span><h3>提纯结果板</h3><div className="generic-readout-grid roughsalt-readout-grid"><article className={dissolved ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>溶解</span><strong>{dissolved ? '完成' : '--'}</strong><small>先形成含杂盐溶液。</small></article><article className={filtered ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>过滤</span><strong>{filtered ? '完成' : '--'}</strong><small>不溶物应留在滤纸上。</small></article><article className={observationChoice === 'correct' ? 'lab-readout-card active' : 'lab-readout-card calm'}><span>结晶</span><strong>{roughsaltObservationResult}</strong><small>蒸发后看白色晶体是否重新析出。</small></article></div></section>
          <section className="info-card roughsalt-rail-card roughsalt-rail-prompt"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className={`info-card roughsalt-rail-card roughsalt-rail-prompt ${completed ? 'tone-success' : promptTone === 'error' ? 'tone-error' : ''}`.trim()}><span className="eyebrow">Control</span><h3>实验控制</h3><p>{roughsaltCompletionCopy}</p><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>{latestLabNote}</small></section>
        </aside>
      </div>
    </section>
  );
}
