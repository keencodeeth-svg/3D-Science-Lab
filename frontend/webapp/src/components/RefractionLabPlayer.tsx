import { useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'top' | 'detail';
type EquipmentId = 'laser' | 'semicircle-block' | 'protractor' | 'ray-screen';
type AngleOption = 15 | 30 | 45;
type TimelineState = 'done' | 'current' | 'todo';

interface RefractionLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

interface AngleMeasurement {
  incident: AngleOption;
  refracted: number;
}

const stepTitles: Record<StepId, string> = {
  1: '识别器材',
  2: '搭建光路',
  3: '改变入射角',
  4: '记录光路现象',
  5: '总结折射规律',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别激光光源、半圆玻璃砖、量角器和光路板。',
  2: '搭好玻璃砖、量角器和光路板，形成规范折射实验装置。',
  3: '改变入射角并比较折射角，至少形成两组有效对照。',
  4: '记录入射光线、法线和折射光线在光路板上的位置关系。',
  5: '总结当光从空气射入玻璃时入射角和折射角的关系。',
};

const equipmentLabels: Record<EquipmentId, string> = {
  laser: '激光光源',
  'semicircle-block': '半圆玻璃砖',
  protractor: '量角器',
  'ray-screen': '光路板',
};

const equipmentOrder: EquipmentId[] = ['laser', 'semicircle-block', 'protractor', 'ray-screen'];
const angleMap: Record<AngleOption, number> = {
  15: 10,
  30: 19,
  45: 28,
};

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

export function RefractionLabPlayer({ experiment, onTelemetry }: RefractionLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedEquipment, setIdentifiedEquipment] = useState<EquipmentId[]>([]);
  const [placedEquipment, setPlacedEquipment] = useState<EquipmentId[]>([]);
  const [angleMeasurements, setAngleMeasurements] = useState<AngleMeasurement[]>([]);
  const [selectedAngle, setSelectedAngle] = useState<AngleOption>(30);
  const [rayRecorded, setRayRecorded] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先识别光学器材，再搭建光路并比较入射角、折射角。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const score = Math.max(78, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const safetyValue = clamp(96 - errors * 4, 64, 99);
  const clarityValue = clamp(50 + (placedEquipment.length >= 3 ? 12 : 0) + angleMeasurements.length * 8 + (rayRecorded ? 12 : 0) + (cameraPreset !== 'bench' ? 8 : 0), 36, 99);
  const readinessValue = clamp(progressPercent + angleMeasurements.length * 10 + (rayRecorded ? 15 : 0), 20, 100);
  const currentMeasurement = angleMeasurements.find((item) => item.incident === selectedAngle) ?? { incident: selectedAngle, refracted: angleMap[selectedAngle] };
  const compareReady = angleMeasurements.length >= 2;
  const refractionTrend = angleMeasurements.length
    ? `${Math.min(...angleMeasurements.map((item) => item.incident))}° → ${Math.max(...angleMeasurements.map((item) => item.incident))}°`
    : '等待角度对照';

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

  const handleIdentify = (equipmentId: EquipmentId) => {
    if (step !== 1 || completed) return;
    setIdentifiedEquipment((current) => {
      if (current.includes(equipmentId)) return current;
      const next = [...current, equipmentId];
      appendNote(`器材识别：${equipmentLabels[equipmentId]}`);
      if (next.length === equipmentOrder.length) {
        setCameraPreset('top');
        advanceStep(2, '器材识别完成，下一步搭建折射实验装置。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${equipmentOrder.length} 个器材，继续检查光学实验台。`);
      }
      return next;
    });
  };

  const handlePlaceEquipment = (equipmentId: EquipmentId) => {
    if (step !== 2 || completed) return;
    setPlacedEquipment((current) => {
      if (current.includes(equipmentId)) return current;
      const next = [...current, equipmentId];
      appendNote(`装置搭建：已放置${equipmentLabels[equipmentId]}`);
      if (next.length >= 3) {
        setCameraPreset('detail');
        advanceStep(3, '光路装置已搭好，开始改变入射角并比较折射角变化。');
      } else {
        setPromptTone('success');
        setPrompt('继续完成玻璃砖、量角器和光路板的位置校准。');
      }
      return next;
    });
  };

  const handleAngle = (angle: AngleOption, mode: 'correct' | 'wrong') => {
    if (step !== 3 || completed) return;
    setSelectedAngle(angle);
    if (placedEquipment.length < 3) {
      markError('请先搭好实验装置，再改变入射角。');
      return;
    }
    if (mode === 'wrong') {
      markError('只改变入射角但不比较折射角，无法形成有效结论。');
      return;
    }
    setAngleMeasurements((current) => {
      if (current.some((item) => item.incident === angle)) {
        setPromptTone('success');
        setPrompt(`已存在 ${angle}° 的测量记录，可继续选择另一组角度进行对照。`);
        return current;
      }
      const next = [...current, { incident: angle, refracted: angleMap[angle] }].sort((a, b) => a.incident - b.incident);
      appendNote(`角度测量：入射角 ${angle}°，折射角 ${angleMap[angle]}°`);
      if (next.length >= 2) {
        advanceStep(4, '已形成多组角度对照，请记录法线、入射光和折射光的位置关系。');
      } else {
        setPromptTone('success');
        setPrompt(`已记录入射角 ${angle}°，请再选择另一组角度做对照。`);
      }
      return next;
    });
  };

  const handleRecord = (choice: 'correct' | 'missing-normal' | 'incident-only') => {
    if (step !== 4 || completed) return;
    if (!compareReady) {
      markError('请先至少形成两组入射角与折射角对照，再记录光路。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'missing-normal' ? '记录光路时必须明确法线位置。' : '只看入射光不足以归纳折射规律，请同时比较折射光。');
      return;
    }
    setRayRecorded(true);
    appendNote('光路记录：已标注入射光线、法线和折射光线位置');
    advanceStep(5, '光路记录完成，最后总结折射规律。');
  };

  const handleSummary = (choice: 'correct' | 'equal' | 'larger') => {
    if (step !== 5 || completed) return;
    setSummaryChoice(choice);
    if (!rayRecorded) {
      markError('请先完成光路记录，再提交规律总结。');
      return;
    }
    if (choice !== 'correct') {
      markError(choice === 'equal' ? '折射角并不总等于入射角，尤其在空气射入玻璃时。' : '空气射入玻璃时，折射角通常小于入射角。');
      return;
    }
    advanceStep(null, experiment.feedback.successSummary);
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedEquipment([]);
    setPlacedEquipment([]);
    setAngleMeasurements([]);
    setSelectedAngle(30);
    setRayRecorded(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：先识别光学器材，再搭建光路并比较入射角、折射角。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '先明确法线，再比较入射光线与折射光线，避免方向关系混乱。',
        '改变入射角时至少保留两组对照数据，才能归纳趋势。',
        '空气射入玻璃时，折射角通常小于入射角。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求重新操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请先核对法线与角度关系。',
        '建议先锁定每组入射角对应的折射角，再继续记录光路或总结规律。',
      ];

  return (
    <section className="panel playground-panel refraction-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属光学实验页</h2>
          <p>围绕角度对照、法线标记和光路记录做专属升级，让折射实验真正具备“可看、可比、可归纳”的物理体验。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid refraction-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>环境</strong>
                  <span>{experiment.scene.environment}</span>
                </div>
                <span className="badge">物理</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜头</strong>
                  <span>{cameraPreset === 'bench' ? '实验台总览' : cameraPreset === 'top' ? '俯视光路' : '光路细节'}</span>
                </div>
                <span className="badge">{experiment.grade}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>主题</strong>
                  <span>{experiment.curriculum.theme}</span>
                </div>
                <span className="badge">{experiment.durationMinutes} 分钟</span>
              </div>
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

          <section className="info-card refraction-data-card">
            <span className="eyebrow">Data</span>
            <h3>角度记录板</h3>
            <div className="angle-record-grid">
              {([15, 30, 45] as AngleOption[]).map((angle) => {
                const record = angleMeasurements.find((item) => item.incident === angle);
                return (
                  <div className={selectedAngle === angle ? 'angle-record-card active' : 'angle-record-card'} key={angle}>
                    <span>入射角 {angle}°</span>
                    <strong>{record ? `折射角 ${record.refracted}°` : '待记录'}</strong>
                    <small>{record ? '已形成有效对照' : '可继续选择该角度做测量'}</small>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">目标对象：{stepConfig?.targetObject ?? '光路板'} · 当前重点：{step === 3 ? '角度对照' : step === 4 ? '法线与光路' : '折射规律'}</small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'top' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('top')} type="button">俯视</button>
              <button className={cameraPreset === 'detail' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('detail')} type="button">细节</button>
            </div>
          </div>

          <div className={`scene-canvas refraction-stage preset-${cameraPreset}`}>
            <div className="refraction-stage-head">
              <div>
                <span className="eyebrow">Live Optics</span>
                <h3>{experiment.curriculum.unit}</h3>
                <p>{promptTone === 'error' ? '当前角度或记录存在偏差，请先修正再继续。' : '重点观察法线两侧的入射光和折射光偏折关系。'}</p>
              </div>
              <div className="status-pill-row">
                <span className="status-pill ready">进度 {progressPercent}%</span>
                <span className="status-pill">角度对照 {angleMeasurements.length} 组</span>
              </div>
            </div>

            <div className="optics-board">
              <div className="optics-interface" />
              <div className="optics-normal" />
              <div className="semicircle-glass" />
              <div className="incident-ray" style={{ transform: `translateX(-50%) rotate(${-selectedAngle}deg)` }} />
              <div className="refracted-ray" style={{ transform: `translateX(-50%) rotate(${angleMap[selectedAngle]}deg)` }} />
              <div className="ray-origin" />
              <div className="angle-label incident">i = {selectedAngle}°</div>
              <div className="angle-label refracted">r = {angleMap[selectedAngle]}°</div>
            </div>

            <div className="refraction-insight-row">
              <article className="lab-readout-card active">
                <span>当前测量</span>
                <strong>i = {currentMeasurement.incident}° / r = {currentMeasurement.refracted}°</strong>
                <small>入射角改变后，折射角也会改变，但进入玻璃时通常更小。</small>
              </article>
              <article className="lab-readout-card calm">
                <span>对照范围</span>
                <strong>{refractionTrend}</strong>
                <small>至少保留两组以上数据，才能从现象归纳变化规律。</small>
              </article>
              <article className={rayRecorded ? 'lab-readout-card active' : 'lab-readout-card warn'}>
                <span>记录状态</span>
                <strong>{rayRecorded ? '法线与光路已记录' : '等待光路记录'}</strong>
                <small>记录时要同时标出入射光线、法线和折射光线。</small>
              </article>
            </div>
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}>
            <span className="eyebrow">Lab Prompt</span>
            <h3>{completed ? '实验已完成' : stepTitles[step]}</h3>
            <p>{prompt}</p>
          </div>

          <section className="info-card generic-notebook-card">
            <div className="generic-notebook-head">
              <div>
                <span className="eyebrow">Notebook</span>
                <h3>实验记录</h3>
              </div>
              <span className="badge">过程留痕</span>
            </div>

            <div className="timeline-list">
              {timeline.map((entry) => (
                <div className={`timeline-item ${entry.state}`} key={entry.title}>
                  <span className="timeline-marker" />
                  <div className="timeline-copy">
                    <strong>{entry.title}</strong>
                    <small>{entry.detail}</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="lab-note-stack">
              {labNotes.map((note, index) => (
                <div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>
                  {note}
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>当前步骤操作</h3>
            <div className="summary-stack generic-choice-stack">
              {step === 1 ? equipmentOrder.map((equipmentId) => (
                <button className="summary-choice generic-choice primary" key={equipmentId} onClick={() => handleIdentify(equipmentId)} type="button">
                  <strong>识别 {equipmentLabels[equipmentId]}</strong>
                  <span>{identifiedEquipment.includes(equipmentId) ? '已完成识别' : '点击后标记为已识别器材'}</span>
                </button>
              )) : null}

              {step === 2 ? (
                <>
                  <button className="summary-choice generic-choice primary" onClick={() => handlePlaceEquipment('semicircle-block')} type="button">
                    <strong>放置半圆玻璃砖</strong>
                    <span>确定界面位置，准备观察偏折。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handlePlaceEquipment('protractor')} type="button">
                    <strong>放置量角器</strong>
                    <span>为入射角与折射角读数提供刻度。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handlePlaceEquipment('ray-screen')} type="button">
                    <strong>摆正光路板</strong>
                    <span>保证光路和法线位置清晰可见。</span>
                  </button>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  {([15, 30, 45] as AngleOption[]).map((angle) => (
                    <button className={selectedAngle === angle ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} key={angle} onClick={() => handleAngle(angle, 'correct')} type="button">
                      <strong>记录入射角 {angle}°</strong>
                      <span>对应折射角为 {angleMap[angle]}°，加入对照组。</span>
                    </button>
                  ))}
                  <button className="summary-choice generic-choice danger" onClick={() => handleAngle(selectedAngle, 'wrong')} type="button">
                    <strong>只改角度不做比较</strong>
                    <span>错误演示：没有形成有效对照。</span>
                  </button>
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <button className="summary-choice generic-choice primary" onClick={() => handleRecord('correct')} type="button">
                    <strong>记录入射光、法线和折射光</strong>
                    <span>完整记录三条关键线的位置关系。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleRecord('missing-normal')} type="button">
                    <strong>只记入射光和折射光</strong>
                    <span>错误演示：缺少法线，无法准确判断角度。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleRecord('incident-only')} type="button">
                    <strong>只记录入射光</strong>
                    <span>错误演示：只看单侧光线不能归纳折射规律。</span>
                  </button>
                </>
              ) : null}

              {step === 5 ? (
                <>
                  <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                    <strong>空气射入玻璃时，入射角增大，折射角也增大，但折射角小于入射角</strong>
                    <span>完整概括了角度变化趋势和大小规律。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('equal')} type="button">
                    <strong>折射角总等于入射角</strong>
                    <span>错误演示：忽略了介质差异带来的偏折。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleSummary('larger')} type="button">
                    <strong>空气射入玻璃时折射角大于入射角</strong>
                    <span>错误演示：方向关系判断反了。</span>
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
              <li>已记录对照：{angleMeasurements.length} 组</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '请注意实验规范'}</li>
            </ul>
          </section>

          <section className="info-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>实验控制</h3>
            <div className="button-stack">
              <button className="action-button ghost" onClick={handleReset} type="button">重新开始</button>
            </div>
            <small>这页已把“光的折射规律”升级成可比对、可记录的专属光学页，后续还能继续补反射、透镜等整套光学实验。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
