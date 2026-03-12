import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5 | 6;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'filter' | 'evaporation';
type MaterialId = 'funnel' | 'filter-paper' | 'beaker' | 'glass-rod' | 'evaporating-dish' | 'alcohol-lamp';
type TimelineState = 'done' | 'current' | 'todo';

interface FiltrationLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const stepTitles: Record<StepId, string> = {
  1: '识别仪器',
  2: '完成过滤装置',
  3: '沿玻璃棒过滤',
  4: '加热蒸发滤液',
  5: '记录蒸发结果',
  6: '总结分离方法',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别漏斗、滤纸、烧杯、玻璃棒、蒸发皿和酒精灯。',
  2: '折叠滤纸并放入漏斗，再把玻璃棒和烧杯位置摆好。',
  3: '沿玻璃棒缓慢倒入混合液，完成过滤。',
  4: '将滤液转入蒸发皿，控制酒精灯火力进行蒸发。',
  5: '观察蒸发后是否出现晶体或残留物，并完成记录。',
  6: '总结过滤和蒸发各自解决的分离问题。',
};

const materialLabels: Record<MaterialId, string> = {
  funnel: '漏斗',
  'filter-paper': '滤纸',
  beaker: '烧杯',
  'glass-rod': '玻璃棒',
  'evaporating-dish': '蒸发皿',
  'alcohol-lamp': '酒精灯',
};

const materialOrder: MaterialId[] = ['funnel', 'filter-paper', 'beaker', 'glass-rod', 'evaporating-dish', 'alcohol-lamp'];

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

export function FiltrationLabPlayer({ experiment, onTelemetry }: FiltrationLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [filterFolded, setFilterFolded] = useState(false);
  const [filterPlaced, setFilterPlaced] = useState(false);
  const [rodAligned, setRodAligned] = useState(false);
  const [mixtureFiltered, setMixtureFiltered] = useState(false);
  const [heatLevel, setHeatLevel] = useState<'idle' | 'steady' | 'high'>('idle');
  const [evaporationDone, setEvaporationDone] = useState(false);
  const [resultRecorded, setResultRecorded] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先搭好过滤装置，再完成过滤、蒸发和结果判断。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const filterReady = filterFolded && filterPlaced && rodAligned;
  const score = Math.max(80, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 6) * 100);
  const safetyValue = clamp(96 - errors * 5 - (heatLevel === 'high' ? 8 : 0), 54, 99);
  const clarityValue = clamp(46 + (filterReady ? 14 : 0) + (mixtureFiltered ? 12 : 0) + (evaporationDone ? 16 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 36, 99);
  const readinessValue = clamp(progressPercent + (filterReady ? 12 : 0) + (mixtureFiltered ? 12 : 0) + (resultRecorded ? 18 : 0), 20, 100);
  const filtrateClarity = mixtureFiltered ? '澄清滤液' : '待过滤';
  const crystalState = evaporationDone ? '晶体析出' : '等待蒸发';
  const sourceLiquidHeight = mixtureFiltered ? 22 : filterReady ? 54 : 62;
  const filtrateHeight = mixtureFiltered ? 48 : 18;
  const dishLiquidHeight = evaporationDone ? 16 : heatLevel === 'steady' ? 34 : 44;
  const filtrationMode = evaporationDone ? 'finished' : mixtureFiltered ? 'filtered' : filterReady ? 'ready' : 'idle';

  const { reportReset } = useLabTelemetryReporter({
    experiment,
    step,
    totalSteps: 6,
    score,
    errors,
    prompt,
    completed,
    stepLabels: stepTitles,
    onTelemetry,
  });

  const appendNote = (note: string) => {
    setLabNotes((current) => [note, ...current].slice(0, 6));
  };

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
      appendNote(`仪器识别：${materialLabels[materialId]}`);
      if (next.length === materialOrder.length) {
        setCameraPreset('filter');
        advanceStep(2, '识别完成，下一步折滤纸并搭好过滤装置。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 项仪器，继续检查实验台。`);
      }
      return next;
    });
  };

  const handleSetup = (action: 'fold' | 'place' | 'align') => {
    if (step !== 2 || completed) return;
    if (action === 'fold') {
      setFilterFolded(true);
      setPromptTone('success');
      setPrompt('滤纸已折好，请继续放入漏斗并调整玻璃棒位置。');
      appendNote('过滤装置：已完成滤纸折叠');
      return;
    }
    if (action === 'place') {
      if (!filterFolded) {
        markError('请先折好滤纸，再把它贴合放入漏斗。');
        return;
      }
      setFilterPlaced(true);
      setPromptTone('success');
      setPrompt('滤纸已贴合漏斗，请继续调整玻璃棒和烧杯位置。');
      appendNote('过滤装置：滤纸已放入漏斗');
      return;
    }
    if (!filterPlaced) {
      markError('请先完成滤纸贴合，再调整玻璃棒位置。');
      return;
    }
    setRodAligned(true);
    appendNote('过滤装置：玻璃棒与烧杯位置已校准');
    advanceStep(3, '过滤装置已完成，下一步沿玻璃棒缓慢倒液。');
  };

  const handlePour = (mode: 'correct' | 'fast') => {
    if (step !== 3 || completed) return;
    if (!filterReady) {
      markError('请先搭好过滤装置，再开始倒液过滤。');
      return;
    }
    if (mode === 'fast') {
      markError('倒液过快或未沿玻璃棒都会影响操作规范。');
      return;
    }
    setMixtureFiltered(true);
    setCameraPreset('evaporation');
    appendNote('过滤完成：已获得较澄清的滤液');
    advanceStep(4, '过滤完成，下一步将滤液转入蒸发皿并控制加热。');
  };

  const handleHeat = (mode: 'steady' | 'high') => {
    if (step !== 4 || completed) return;
    if (!mixtureFiltered) {
      markError('请先完成过滤，再进行蒸发。');
      return;
    }
    if (mode === 'high') {
      setHeatLevel('high');
      markError('蒸发时应缓慢加热并持续观察液面变化。');
      return;
    }
    setHeatLevel('steady');
    setEvaporationDone(true);
    appendNote('蒸发过程：滤液缓慢蒸发并出现晶体');
    advanceStep(5, '蒸发完成，观察蒸发皿中的晶体或残留物并记录。');
  };

  const handleRecord = (choice: 'correct' | 'empty' | 'wrong-phenomenon') => {
    if (step !== 5 || completed) return;
    if (!evaporationDone) {
      markError('请先完成蒸发，再记录蒸发结果。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'empty' ? '请根据蒸发后的现象完成记录，不能忽略晶体或残留物。' : '蒸发后应关注晶体或固体残留，不是只看液体是否还在。');
      return;
    }
    setResultRecorded(true);
    appendNote('结果记录：蒸发皿中出现晶体 / 固体残留');
    advanceStep(6, '蒸发结果已记录，最后总结过滤和蒸发各自的作用。');
  };

  const handleSummary = (choice: 'correct' | 'mix-up' | 'single-method') => {
    if (step !== 6 || completed) return;
    setSummaryChoice(choice);
    if (!resultRecorded) {
      markError('请先完成蒸发结果记录，再提交总结。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'mix-up' ? '过滤和蒸发作用不同：过滤分离不溶物，蒸发用于得到溶解在液体中的溶质。' : '不能只说一种方法，需要说明过滤和蒸发分别解决什么问题。');
      return;
    }
    advanceStep(null, experiment.feedback.successSummary);
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setFilterFolded(false);
    setFilterPlaced(false);
    setRodAligned(false);
    setMixtureFiltered(false);
    setHeatLevel('idle');
    setEvaporationDone(false);
    setResultRecorded(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先搭好过滤装置，再完成过滤、蒸发和结果判断。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '过滤前先保证滤纸贴合漏斗，玻璃棒和烧杯位置稳定。',
        '倒液时沿玻璃棒缓慢流下，避免冲破滤纸或液体飞溅。',
        '过滤用于分离不溶物，蒸发用于得到溶液中的溶质。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对操作顺序和观察结果。',
        '建议先完成过滤，再转入蒸发，避免把前一步错误带到后续结论中。',
      ];

  return (
    <section className="panel playground-panel filtration-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属分离实验页</h2>
          <p>围绕过滤装置、倒液规范和蒸发结果重做专属页，让“过滤 + 蒸发”形成完整的化学分离流程。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 6</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid filtration-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row"><div className="detail-copy"><strong>环境</strong><span>{experiment.scene.environment}</span></div><span className="badge">化学</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>镜头</strong><span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'filter' ? '过滤视角' : '蒸发视角'}</span></div><span className="badge">{experiment.grade}</span></div>
              <div className="detail-row"><div className="detail-copy"><strong>主题</strong><span>{experiment.curriculum.theme}</span></div><span className="badge">{experiment.durationMinutes} 分钟</span></div>
            </div>
          </section>

          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>安全值 {safetyValue}</span><div className="chem-meter-bar"><i style={{ width: `${safetyValue}%` }} /></div></div>
              <div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
              <div className="chem-meter"><span>得分 {score}</span><div className="chem-meter-bar"><i style={{ width: `${score}%` }} /></div></div>
            </div>
          </section>

          <section className="info-card filtration-data-card">
            <span className="eyebrow">Readout</span>
            <h3>分离结果板</h3>
            <div className="filtration-data-grid">
              <div className="filtration-data-item"><span>过滤状态</span><strong>{filtrateClarity}</strong><small>{mixtureFiltered ? '滤液已较澄清，可进入蒸发步骤。' : '等待沿玻璃棒过滤。'}</small></div>
              <div className="filtration-data-item"><span>蒸发状态</span><strong>{crystalState}</strong><small>{evaporationDone ? '蒸发皿内出现晶体 / 残留物。' : '等待缓慢加热。'}</small></div>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '分离装置'} · 当前重点：{step === 2 ? '过滤装置' : step === 3 ? '倒液规范' : step === 4 ? '蒸发控制' : '结果判断'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'filter' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('filter')} type="button">过滤</button>
              <button className={cameraPreset === 'evaporation' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('evaporation')} type="button">蒸发</button>
            </div>
          </div>

          <div className={`scene-canvas filtration-stage preset-${cameraPreset} mode-${filtrationMode}`}>
            <div className="filtration-stage-head">
              <div>
                <span className="eyebrow">Live Chemistry</span>
                <h3>{experiment.curriculum.unit}</h3>
                <p>{promptTone === 'error' ? '当前装置或操作存在偏差，请先修正再继续。' : '重点关注滤纸贴合、倒液路径和蒸发皿中的变化。'}</p>
              </div>
              <div className="status-pill-row">
                <span className="status-pill ready">进度 {progressPercent}%</span>
                <span className="status-pill">火力 {heatLevel === 'steady' ? '稳定' : heatLevel === 'high' ? '过高' : '待点燃'}</span>
              </div>
            </div>

            <div className="filtration-stage-grid">
              <article className={filterReady ? 'separation-card active' : 'separation-card'}>
                <div className="reaction-card-head"><strong>过滤装置</strong><small>{filterReady ? '已搭好' : '等待完成'}</small></div>
                <div className="filter-rig">
                  <div className="filtration-stand">
                    <div className="filtration-stand-base" />
                    <div className="filtration-stand-pole" />
                    <div className="filtration-stand-ring" />
                    <div className="filtration-stand-clamp" />
                  </div>
                  <div className="source-beaker-shell">
                    <div className="source-beaker-gloss" />
                    <div className="source-beaker-liquid" style={{ height: `${sourceLiquidHeight}%` }}>
                      <div className="source-beaker-surface" />
                      <span className="source-grain source-grain-1" />
                      <span className="source-grain source-grain-2" />
                      <span className="source-grain source-grain-3" />
                      <span className="source-grain source-grain-4" />
                    </div>
                  </div>
                  <div className="funnel-shell">
                    <div className="funnel-gloss" />
                    <div className={filterPlaced ? 'filter-paper-shape active' : 'filter-paper-shape'}>
                      <span className="paper-fold paper-fold-1" />
                      <span className="paper-fold paper-fold-2" />
                    </div>
                    <div className={mixtureFiltered ? 'filter-residue active' : 'filter-residue'}>
                      <span className="residue-grain residue-grain-1" />
                      <span className="residue-grain residue-grain-2" />
                      <span className="residue-grain residue-grain-3" />
                      <span className="residue-grain residue-grain-4" />
                    </div>
                  </div>
                  <div className={rodAligned ? 'glass-rod-shaft active' : 'glass-rod-shaft'}>
                    <span className="glass-rod-tip" />
                  </div>
                  <div className={mixtureFiltered ? 'pour-stream active' : 'pour-stream'}>
                    <span className="pour-drop pour-drop-1" />
                    <span className="pour-drop pour-drop-2" />
                    <span className="pour-drop pour-drop-3" />
                  </div>
                  <div className={mixtureFiltered ? 'beaker-liquid filtered' : 'beaker-liquid'} style={{ ['--filtrate-height' as string]: `${filtrateHeight}%` }}>
                    <div className="beaker-rim" />
                    <div className="beaker-highlight" />
                    <div className="beaker-surface" />
                    <div className={mixtureFiltered ? 'filtrate-ripple active' : 'filtrate-ripple'} />
                  </div>
                </div>
              </article>

              <article className={evaporationDone ? 'separation-card active' : 'separation-card'}>
                <div className="reaction-card-head"><strong>蒸发皿</strong><small>{evaporationDone ? '蒸发完成' : '等待加热'}</small></div>
                <div className="evaporation-rig">
                  <div className="lamp-shell">
                    <div className="lamp-body" />
                    <div className="lamp-cap" />
                    <div className="lamp-wick" />
                  </div>
                  <div className="tripod-shell">
                    <div className="tripod-top" />
                    <div className="tripod-leg tripod-leg-1" />
                    <div className="tripod-leg tripod-leg-2" />
                    <div className="tripod-leg tripod-leg-3" />
                    <div className="gauze-pad" />
                  </div>
                  <div className="dish-shell">
                    <div className="dish-reflection" />
                    <div className={heatLevel === 'steady' ? 'dish-liquid heating' : 'dish-liquid'} style={{ height: `${dishLiquidHeight}%` }} />
                    <div className="dish-meniscus" />
                    <div className={evaporationDone ? 'crystal-specks active' : 'crystal-specks'}>
                      <span className="crystal-speck crystal-speck-1" />
                      <span className="crystal-speck crystal-speck-2" />
                      <span className="crystal-speck crystal-speck-3" />
                      <span className="crystal-speck crystal-speck-4" />
                    </div>
                  </div>
                  <div className={heatLevel !== 'idle' ? 'steam-wisps active' : 'steam-wisps'}>
                    <span className="steam-wisp steam-1" />
                    <span className="steam-wisp steam-2" />
                    <span className="steam-wisp steam-3" />
                  </div>
                  <div className={heatLevel !== 'idle' ? 'heat-wave active' : 'heat-wave'} />
                  <div className={heatLevel === 'steady' ? 'lamp-flame active' : 'lamp-flame'} />
                  <div className={heatLevel === 'steady' ? 'lamp-halo active' : 'lamp-halo'} />
                </div>
              </article>
            </div>

            <div className="filtration-insight-row">
              <article className="lab-readout-card active"><span>过滤装置</span><strong>{filterReady ? '滤纸贴合 / 玻璃棒到位' : '待搭建'}</strong><small>过滤装置稳定，才能获得较清晰滤液。</small></article>
              <article className="lab-readout-card calm"><span>滤液状态</span><strong>{filtrateClarity}</strong><small>过滤后再转入蒸发皿，避免混合液直接蒸发。</small></article>
              <article className={resultRecorded ? 'lab-readout-card active' : 'lab-readout-card warn'}><span>蒸发结果</span><strong>{resultRecorded ? '已记录晶体 / 残留物' : '等待记录'}</strong><small>蒸发得到的固体是溶液中原本溶解的溶质。</small></article>
            </div>
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
              {step === 1 ? materialOrder.map((materialId) => (<button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button"><strong>识别 {materialLabels[materialId]}</strong><span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别仪器'}</span></button>)) : null}
              {step === 2 ? (<><button className={filterFolded ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleSetup('fold')} type="button"><strong>折滤纸</strong><span>先完成滤纸折叠。</span></button><button className={filterPlaced ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSetup('place')} type="button"><strong>把滤纸贴合放入漏斗</strong><span>滤纸需贴合漏斗内壁。</span></button><button className={rodAligned ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleSetup('align')} type="button"><strong>调整玻璃棒与烧杯</strong><span>让液体沿玻璃棒流入漏斗。</span></button></>) : null}
              {step === 3 ? (<><button className="summary-choice generic-choice primary" onClick={() => handlePour('correct')} type="button"><strong>沿玻璃棒缓慢倒液</strong><span>规范完成过滤。</span></button><button className="summary-choice generic-choice danger" onClick={() => handlePour('fast')} type="button"><strong>直接快速倒入</strong><span>错误演示：倒液过快。</span></button></>) : null}
              {step === 4 ? (<><button className="summary-choice generic-choice primary" onClick={() => handleHeat('steady')} type="button"><strong>缓慢稳定加热</strong><span>观察蒸发皿液面变化。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleHeat('high')} type="button"><strong>开大火猛烧</strong><span>错误演示：加热过急。</span></button></>) : null}
              {step === 5 ? (<><button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button"><strong>记录“蒸发后出现晶体 / 残留物”</strong><span>根据蒸发结果完成观察记录。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleRecord('empty')} type="button"><strong>记录“没有现象”</strong><span>错误演示：忽略晶体结果。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleRecord('wrong-phenomenon')} type="button"><strong>只记录“液体变少”</strong><span>错误演示：没有抓住分离结果。</span></button></>) : null}
              {step === 6 ? (<><button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button"><strong>过滤分离不溶物，蒸发得到溶液中的溶质</strong><span>完整说明两种分离方法的作用。</span></button><button className="summary-choice generic-choice secondary" onClick={() => handleSummary('mix-up')} type="button"><strong>过滤得到溶质，蒸发去掉不溶物</strong><span>错误演示：两种方法作用混淆。</span></button><button className="summary-choice generic-choice danger" onClick={() => handleSummary('single-method')} type="button"><strong>只要过滤就够了</strong><span>错误演示：忽略蒸发步骤作用。</span></button></>) : null}
            </div>
          </section>

          <section className="info-card control-block"><span className="eyebrow">Checklist</span><h3>当前步骤要求</h3><ul className="bullet-list compact-list"><li>当前目标：{stepTitles[step]}</li><li>关键能力：{stepConfig?.requiredCapabilities?.join('、') ?? '专属实验交互'}</li><li>装置状态：{filterReady ? '过滤装置已完成' : '待搭建'} / {evaporationDone ? '蒸发完成' : '待蒸发'}</li><li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意实验规范'}</li></ul></section>
          <section className="info-card control-block recovery-card"><span className="eyebrow">Recovery</span><h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3><ul className="bullet-list compact-list recovery-list">{recoveryList.map((item) => (<li key={item}>{item}</li>))}</ul></section>
          <section className="info-card control-block"><span className="eyebrow">Actions</span><h3>实验控制</h3><div className="button-stack"><button className="action-button ghost" onClick={handleReset} type="button">重新开始</button></div><small>这页已把“过滤与蒸发分离混合物”升级成装置、过程、结果一体化的专属化学页。</small></section>
        </aside>
      </div>
    </section>
  );
}
