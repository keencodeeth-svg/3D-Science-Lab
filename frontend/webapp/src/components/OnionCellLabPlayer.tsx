import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { getRecommendedApparatusIds } from '../lib/apparatusEngine';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import { createSimulationRuntimeFromApparatus } from '../lib/simulationRuntimeAdapter';
import type { SimulationRuntimeSnapshot } from '../lib/simulationRuntime';
import type { ApparatusRuntimeContext } from '../types/apparatus';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'bench' | 'slide' | 'microscope';
type MaterialId = 'onion-tweezer' | 'slide' | 'dropper' | 'coverslip' | 'microscope';
type TimelineState = 'done' | 'current' | 'todo';

interface OnionCellLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
  onSimulationRuntimeChange?: (snapshot: SimulationRuntimeSnapshot | null) => void;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

interface OnionFilmStripSpec {
  id: string;
  left: string;
  width: string;
  rotate: number;
  opacity: number;
}

interface OnionViewfinderCellSpec {
  id: string;
  left: string;
  top: string;
  width: string;
  height: string;
  rotate: number;
  wallTone: string;
  fillTone: string;
  vacuoleTone: string;
  nucleusX: string;
  nucleusY: string;
  nucleusScale: number;
}

interface OnionViewfinderDustSpec {
  id: string;
  left: string;
  top: string;
  size: number;
  opacity: number;
  delay: number;
  duration: number;
}

const stepTitles: Record<StepId, string> = {
  1: '识别器材',
  2: '制作洋葱表皮装片',
  3: '滴加染液并盖片',
  4: '调焦观察细胞',
  5: '判断植物细胞结构',
};

const stepPrompts: Record<StepId, string> = {
  1: '先识别镊子、载玻片、滴管、盖玻片和显微镜。',
  2: '用镊子撕取薄而透明的洋葱表皮并平铺在载玻片上。',
  3: '滴加染液后盖上盖玻片，提升细胞结构对比度。',
  4: '调焦后观察细胞排列、细胞壁和细胞核。',
  5: '总结洋葱表皮细胞的主要结构特点。',
};

const materialLabels: Record<MaterialId, string> = {
  'onion-tweezer': '镊子与洋葱表皮',
  slide: '载玻片',
  dropper: '滴管',
  coverslip: '盖玻片',
  microscope: '显微镜',
};

const materialOrder: MaterialId[] = ['onion-tweezer', 'slide', 'dropper', 'coverslip', 'microscope'];
const onionStepOrder: StepId[] = [1, 2, 3, 4, 5];

const onionFilmStrips: OnionFilmStripSpec[] = [
  { id: 'strip-a', left: '8%', width: '22%', rotate: -7, opacity: 0.76 },
  { id: 'strip-b', left: '29%', width: '18%', rotate: 3, opacity: 0.62 },
  { id: 'strip-c', left: '48%', width: '21%', rotate: -4, opacity: 0.7 },
  { id: 'strip-d', left: '68%', width: '15%', rotate: 8, opacity: 0.56 },
];

const onionViewfinderCells: OnionViewfinderCellSpec[] = [
  { id: 'cell-a', left: '8%', top: '12%', width: '28%', height: '22%', rotate: -6, wallTone: '#8bbd81', fillTone: '#d7efc8', vacuoleTone: 'rgba(245, 255, 240, 0.58)', nucleusX: '72%', nucleusY: '34%', nucleusScale: 0.96 },
  { id: 'cell-b', left: '34%', top: '10%', width: '27%', height: '23%', rotate: 4, wallTone: '#7fb474', fillTone: '#cde8be', vacuoleTone: 'rgba(244, 255, 236, 0.52)', nucleusX: '36%', nucleusY: '64%', nucleusScale: 0.88 },
  { id: 'cell-c', left: '61%', top: '14%', width: '22%', height: '20%', rotate: -8, wallTone: '#8ec788', fillTone: '#d8efc8', vacuoleTone: 'rgba(248, 255, 242, 0.62)', nucleusX: '62%', nucleusY: '50%', nucleusScale: 1.02 },
  { id: 'cell-d', left: '11%', top: '37%', width: '24%', height: '18%', rotate: 6, wallTone: '#82b87b', fillTone: '#d1eabf', vacuoleTone: 'rgba(245, 255, 240, 0.48)', nucleusX: '40%', nucleusY: '42%', nucleusScale: 0.84 },
  { id: 'cell-e', left: '37%', top: '36%', width: '29%', height: '20%', rotate: -2, wallTone: '#78ae72', fillTone: '#c8e3ba', vacuoleTone: 'rgba(241, 255, 235, 0.54)', nucleusX: '66%', nucleusY: '54%', nucleusScale: 1.08 },
  { id: 'cell-f', left: '66%', top: '39%', width: '18%', height: '17%', rotate: 7, wallTone: '#7eb476', fillTone: '#c6e2b7', vacuoleTone: 'rgba(240, 255, 234, 0.48)', nucleusX: '34%', nucleusY: '60%', nucleusScale: 0.86 },
  { id: 'cell-g', left: '7%', top: '61%', width: '31%', height: '19%', rotate: -10, wallTone: '#8cc284', fillTone: '#d8efca', vacuoleTone: 'rgba(247, 255, 241, 0.56)', nucleusX: '62%', nucleusY: '40%', nucleusScale: 0.92 },
  { id: 'cell-h', left: '41%', top: '61%', width: '26%', height: '18%', rotate: 5, wallTone: '#7cb474', fillTone: '#cfe8bf', vacuoleTone: 'rgba(243, 255, 237, 0.52)', nucleusX: '46%', nucleusY: '58%', nucleusScale: 0.9 },
  { id: 'cell-i', left: '66%', top: '63%', width: '20%', height: '19%', rotate: -4, wallTone: '#82bb7c', fillTone: '#d5edc8', vacuoleTone: 'rgba(246, 255, 241, 0.58)', nucleusX: '68%', nucleusY: '48%', nucleusScale: 0.98 },
];

const onionViewfinderDust: OnionViewfinderDustSpec[] = [
  { id: 'dust-a', left: '18%', top: '22%', size: 6, opacity: 0.14, delay: 0, duration: 9.8 },
  { id: 'dust-b', left: '72%', top: '26%', size: 8, opacity: 0.16, delay: 1.2, duration: 11.2 },
  { id: 'dust-c', left: '30%', top: '67%', size: 5, opacity: 0.12, delay: 2.1, duration: 8.9 },
  { id: 'dust-d', left: '77%', top: '71%', size: 7, opacity: 0.18, delay: 0.6, duration: 10.6 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildTimeline(step: StepId, completed: boolean): TimelineEntry[] {
  return (Object.entries(stepTitles) as [string, string][])
    .map(([rawStep, title]) => {
      const current = Number(rawStep) as StepId;
      const state: TimelineState = completed || current < step ? 'done' : current === step ? 'current' : 'todo';
      const detail = state === 'done' ? '已完成' : state === 'current' ? '进行中' : '待完成';
      return { title, detail, state };
    });
}

function getCameraLabel(cameraPreset: CameraPreset) {
  if (cameraPreset === 'slide') return '玻片制备';
  if (cameraPreset === 'microscope') return '显微视野';
  return '实验台总览';
}

function getOnionActiveApparatusId(apparatusIds: string[], cameraPreset: CameraPreset) {
  if (!apparatusIds.length) return null;

  if (cameraPreset === 'microscope') {
    return apparatusIds.find((id) => id.includes('microscope') || id.includes('scope')) ?? apparatusIds[0];
  }

  if (cameraPreset === 'slide') {
    return apparatusIds.find((id) => id.includes('slide') || id.includes('glass')) ?? apparatusIds[0];
  }

  return apparatusIds.find((id) => id.includes('dropper') || id.includes('pipette') || id.includes('tweezer')) ?? apparatusIds[0];
}

export function OnionCellLabPlayer({ experiment, onTelemetry, onSimulationRuntimeChange }: OnionCellLabPlayerProps) {
  const [step, setStep] = useState<StepId>(1);
  const [identifiedMaterials, setIdentifiedMaterials] = useState<MaterialId[]>([]);
  const [samplePrepared, setSamplePrepared] = useState(false);
  const [stained, setStained] = useState(false);
  const [focused, setFocused] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('bench');
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [prompt, setPrompt] = useState(stepPrompts[1]);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [labNotes, setLabNotes] = useState<string[]>(['实验已载入：先制作洋葱表皮装片，再染色调焦观察植物细胞。']);

  const stepConfig = experiment.steps[Math.min(step - 1, experiment.steps.length - 1)];
  const timeline = useMemo(() => buildTimeline(step, completed), [completed, step]);
  const apparatusIds = useMemo(() => getRecommendedApparatusIds(experiment), [experiment]);
  const activeApparatusId = useMemo(
    () => getOnionActiveApparatusId(apparatusIds, cameraPreset),
    [apparatusIds, cameraPreset],
  );

  const clarityValue = clamp(38 + (samplePrepared ? 14 : 0) + (stained ? 18 : 0) + (focused ? 24 : 0), 24, 99);
  const structureValue = clamp(40 + (focused ? 24 : 0) + (summaryChoice === 'correct' ? 18 : 0), 24, 99);
  const stainCoverageValue = clamp((samplePrepared ? 46 : 12) + (stained ? 34 : 0) + (focused ? 10 : 0), 12, 98);
  const contrastValue = clamp(18 + (stained ? 42 : 0) + (focused ? 18 : 0), 12, 96);
  const hydrationValue = clamp((samplePrepared ? 56 : 24) + (stained ? 18 : 0) + (focused ? 8 : 0), 24, 96);
  const focusConfidence = clamp((samplePrepared ? 28 : 6) + (stained ? 24 : 0) + (focused ? 34 : 0) - errors * 4, 6, 98);
  const score = Math.max(82, 100 - errors * 4);
  const progressPercent = completed ? 100 : Math.round(((step - 1) / 5) * 100);
  const readinessValue = clamp(progressPercent + (samplePrepared ? 14 : 0) + (stained ? 16 : 0) + (focused ? 16 : 0), 20, 100);

  const magnificationLabel = focused ? '400x' : stained ? '100x' : samplePrepared ? '40x' : '--';
  const fieldScaleLabel = focused ? '0.38 mm' : stained ? '0.96 mm' : samplePrepared ? '1.85 mm' : '2.60 mm';
  const sampleStatusLabel = samplePrepared ? '薄片已平整铺片' : '玻片仍为空载';
  const stainStatusLabel = stained ? '碘液已渗入并形成均匀染色层' : samplePrepared ? '待滴染液并盖片' : '尚未进入染色';
  const focusStatusLabel = focused ? '细胞壁与细胞核已分离清楚' : stained ? '视野已进入细调阶段' : '尚未形成有效显微图像';

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

  const runtimeContext = useMemo<ApparatusRuntimeContext>(
    () => ({
      experimentId: experiment.id,
      step,
      progress: completed ? 1 : Math.min(0.96, ((step - 1) / 4) + (focused ? 0.18 : stained ? 0.1 : samplePrepared ? 0.06 : 0)),
      completed,
      focusId: activeApparatusId,
      flags: {
        samplePrepared,
        stained,
        focused,
      },
      metrics: {
        clarityValue,
        contrastValue,
        focusConfidence,
        hydrationValue,
        stainCoverageValue,
        structureValue,
      },
      values: {
        镜头机位: getCameraLabel(cameraPreset),
        装片状态: samplePrepared ? '已铺片' : '未制片',
        染色状态: stained ? '已染色盖片' : '待染色',
        对焦状态: focused ? '清晰成像' : stained ? '待细调' : '未对焦',
        当前倍率: magnificationLabel,
      },
    }),
    [
      activeApparatusId,
      cameraPreset,
      clarityValue,
      completed,
      contrastValue,
      experiment.id,
      focusConfidence,
      focused,
      hydrationValue,
      magnificationLabel,
      samplePrepared,
      stainCoverageValue,
      stained,
      step,
      structureValue,
    ],
  );

  const onionSimulationRuntime = useMemo(
    () => createSimulationRuntimeFromApparatus({
      playerId: 'onion-cell-lab-player',
      apparatusIds,
      runtimeContext,
      activeApparatusId,
      phaseLabel: stepTitles[step],
      phaseState: completed ? 'completed' : 'active',
      progress: completed ? 1 : Math.min(0.96, ((step - 1) / 4) + (focused ? 0.18 : stained ? 0.1 : samplePrepared ? 0.06 : 0)),
      focusTarget: cameraPreset === 'microscope' ? '洋葱表皮显微视野' : cameraPreset === 'slide' ? '载玻片样本区' : '实验台器材',
      focusLens: cameraPreset === 'bench' ? 'macro' : cameraPreset === 'slide' ? 'meso' : focused ? 'micro' : 'meso',
      stateSummary: `${sampleStatusLabel} · ${stainStatusLabel} · 对焦 ${focusConfidence}% · ${magnificationLabel}`,
      observables: [
        { key: 'clarity', label: '视野清晰度', value: clarityValue, unit: '%', status: focused ? 'nominal' : stained ? 'warning' : 'critical' },
        { key: 'focus-confidence', label: '对焦可信度', value: focusConfidence, unit: '%', status: focusConfidence >= 78 ? 'nominal' : focusConfidence >= 48 ? 'warning' : 'critical' },
        { key: 'contrast', label: '染色反差', value: contrastValue, unit: '%', status: stained ? 'nominal' : 'warning' },
        { key: 'stain-coverage', label: '染液覆盖', value: stainCoverageValue, unit: '%', status: stained ? 'nominal' : 'warning' },
        { key: 'hydration', label: '样本水合', value: hydrationValue, unit: '%', status: samplePrepared ? 'nominal' : 'warning' },
        { key: 'magnification', label: '镜下倍率', value: magnificationLabel },
      ],
      controls: [
        { key: 'camera-preset', label: '镜头机位', value: getCameraLabel(cameraPreset), kind: 'discrete' },
        { key: 'sample-state', label: '装片状态', value: samplePrepared ? '已铺片' : '未制片', kind: 'discrete' },
        { key: 'stain-state', label: '染色状态', value: stained ? '已染色' : '待染色', kind: 'discrete' },
        { key: 'focus-state', label: '对焦阶段', value: focused ? '清晰' : stained ? '细调中' : '未对焦', kind: 'discrete' },
      ],
      phases: onionStepOrder.map((stepId) => ({
        key: `step-${stepId}`,
        label: stepTitles[stepId],
        state: completed || step > stepId ? 'completed' : step === stepId ? 'active' : 'pending',
      })),
      failureRisks: [
        !samplePrepared ? '表皮样本未铺平，后续透光和观察都会失真。' : '',
        samplePrepared && !stained ? '未染色时细胞核与液泡反差不足，AI 和学生都缺少可靠可见证据。' : '',
        stained && !focused ? '已染色但尚未细调，容易把模糊边缘误判成细胞壁。' : '',
      ],
      trace: [
        '取薄表皮 -> 平铺装片 -> 滴加染液 -> 45°盖片 -> 低倍定位 -> 细调成像',
        focused ? '规则细胞壁 -> 染色较深的细胞核 -> 大液泡轮廓' : '先保证样本薄、透光足，再进入显微细调',
      ],
    }),
    [
      activeApparatusId,
      apparatusIds,
      cameraPreset,
      clarityValue,
      completed,
      contrastValue,
      focusConfidence,
      focused,
      getCameraLabel,
      hydrationValue,
      magnificationLabel,
      runtimeContext,
      samplePrepared,
      sampleStatusLabel,
      stainCoverageValue,
      stainStatusLabel,
      stained,
      step,
    ],
  );

  useEffect(() => {
    onSimulationRuntimeChange?.(onionSimulationRuntime);
  }, [onSimulationRuntimeChange, onionSimulationRuntime]);

  useEffect(() => () => {
    onSimulationRuntimeChange?.(null);
  }, [onSimulationRuntimeChange]);

  const viewfinderGlassStyle = useMemo(
    () =>
      ({
        '--onion-viewfinder-halo': (0.16 + contrastValue / 180).toFixed(2),
        '--onion-viewfinder-vignette': (0.72 - focusConfidence / 200).toFixed(2),
        '--onion-reticle-opacity': (0.1 + focusConfidence / 300).toFixed(2),
      }) as CSSProperties,
    [contrastValue, focusConfidence],
  );

  const onionFieldStyle = useMemo(
    () =>
      ({
        filter: `blur(${focused ? 0.2 : stained ? 1.4 : 2.8}px) brightness(${(samplePrepared ? 0.88 + stainCoverageValue / 180 : 0.42).toFixed(2)}) saturate(${(0.58 + contrastValue / 100).toFixed(2)}) contrast(${(0.7 + focusConfidence / 140).toFixed(2)})`,
        opacity: samplePrepared ? Math.max(0.3, 0.44 + focusConfidence / 150) : 0.12,
        transform: `translate(${focused ? '-2px' : '0px'}, ${focused ? '-1px' : '0px'}) scale(${focused ? 1.26 : stained ? 1.12 : 0.98})`,
      }) as CSSProperties,
    [contrastValue, focusConfidence, focused, samplePrepared, stainCoverageValue, stained],
  );

  const slideFilmStyle = useMemo(
    () =>
      ({
        '--onion-film-opacity': (0.44 + stainCoverageValue / 140).toFixed(2),
        '--onion-film-saturate': (0.72 + contrastValue / 100).toFixed(2),
        '--onion-film-brightness': (0.84 + hydrationValue / 170).toFixed(2),
      }) as CSSProperties,
    [contrastValue, hydrationValue, stainCoverageValue],
  );

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
        setCameraPreset('slide');
        advanceStep(2, '器材识别完成，下一步制作洋葱表皮临时装片。');
      } else {
        setPromptTone('success');
        setPrompt(`已识别 ${next.length}/${materialOrder.length} 个器材，请继续。`);
      }

      return next;
    });
  };

  const handlePrepare = (choice: 'correct' | 'thick') => {
    if (step !== 2 || completed) return;

    if (choice === 'thick') {
      markError('应撕取薄而透明的表皮，不能叠得太厚。');
      return;
    }

    setSamplePrepared(true);
    appendNote('制片记录：洋葱表皮已平整铺在载玻片中央。');
    advanceStep(3, '装片已准备，下一步滴加染液并覆盖盖玻片。');
  };

  const handleStain = (choice: 'correct' | 'skip') => {
    if (step !== 3 || completed) return;

    if (!samplePrepared) {
      markError('请先制作洋葱表皮装片，再进行染色。');
      return;
    }

    if (choice === 'skip') {
      markError('跳过染色会让细胞核不够明显，不利于结构观察。');
      return;
    }

    setStained(true);
    setCameraPreset('microscope');
    appendNote('染色记录：已滴加染液并盖好盖玻片，视野对比度提升。');
    advanceStep(4, '染色完成，开始调焦观察细胞排列和结构。');
  };

  const handleFocus = (choice: 'correct' | 'blur') => {
    if (step !== 4 || completed) return;

    if (!stained) {
      markError('请先完成染色和盖片，再调焦观察。');
      return;
    }

    if (choice === 'blur') {
      markError('当前视野仍然模糊，请继续调焦直到细胞壁和细胞核清晰。');
      return;
    }

    setFocused(true);
    appendNote('显微观察：已看清规则排列的细胞壁以及染色较深的细胞核。');
    advanceStep(5, '图像已清晰，最后判断洋葱表皮细胞的结构特点。');
  };

  const handleSummary = (choice: 'correct' | 'no-wall' | 'chloroplast') => {
    if (step !== 5 || completed) return;

    setSummaryChoice(choice);

    if (!focused) {
      markError('请先把图像调清楚，再进行结构判断。');
      return;
    }

    if (choice === 'correct') {
      advanceStep(null, '总结正确：洋葱表皮细胞呈规则排列，可观察到细胞壁、细胞膜、细胞质、细胞核和液泡。');
      return;
    }

    if (choice === 'no-wall') {
      markError('洋葱表皮细胞属于植物细胞，最明显的特征之一就是有细胞壁。');
      return;
    }

    markError('洋葱鳞片叶内表皮细胞通常看不到叶绿体，不能按绿色植物叶肉细胞判断。');
  };

  const handleReset = () => {
    setStep(1);
    setIdentifiedMaterials([]);
    setSamplePrepared(false);
    setStained(false);
    setFocused(false);
    setSummaryChoice('');
    setCameraPreset('bench');
    setPromptTone('info');
    setPrompt(stepPrompts[1]);
    setErrors(0);
    setCompleted(false);
    setLabNotes(['实验已重置：重新制作洋葱表皮装片并调焦观察植物细胞。']);
    reportReset();
  };

  const recoveryList = errors === 0
    ? [
        '表皮一定要薄而平整，避免重叠，否则镜下会像多层玻璃一样发灰。',
        '碘液要覆盖样本并及时盖片，才能把细胞核和液泡反差拉开。',
        '先让规则细胞壁清晰，再去判断植物细胞结构。',
      ]
    : [
        stepConfig?.failureHints[0] ?? '请回到本步骤要求继续操作。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请重新核对细胞结构。',
        '建议重新执行“装片 → 染色 → 调焦 → 判断结构”的流程。',
      ];

  return (
    <section className="panel playground-panel onioncell-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属生物实验页</h2>
          <p>把洋葱表皮临时装片、染色层和镜下细胞壁做成更接近真实观察的显微实验，而不是停留在示意格子图。</p>
        </div>
        <div className="badge-row">
          <span className="badge badge-demo">专属实验场景</span>
          <span className="badge">Step {step} / 5</span>
          <span className="badge">{experiment.productization.status}</span>
        </div>
      </div>

      <div className="playground-grid onioncell-grid">
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
                <span className="badge">生物</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜头</strong>
                  <span>{getCameraLabel(cameraPreset)}</span>
                </div>
                <span className="badge">{experiment.grade}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>主题</strong>
                  <span>{experiment.curriculum.unit}</span>
                </div>
                <span className="badge">{experiment.durationMinutes} 分钟</span>
              </div>
            </div>
          </section>

          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter">
                <span>结构度 {structureValue}</span>
                <div className="chem-meter-bar">
                  <i style={{ width: `${structureValue}%` }} />
                </div>
              </div>
              <div className="chem-meter">
                <span>清晰度 {clarityValue}</span>
                <div className="chem-meter-bar">
                  <i style={{ width: `${clarityValue}%` }} />
                </div>
              </div>
              <div className="chem-meter">
                <span>染色反差 {contrastValue}</span>
                <div className="chem-meter-bar">
                  <i style={{ width: `${contrastValue}%` }} />
                </div>
              </div>
              <div className="chem-meter">
                <span>得分 {score}</span>
                <div className="chem-meter-bar">
                  <i style={{ width: `${score}%` }} />
                </div>
              </div>
            </div>
          </section>

          <section className="info-card onioncell-data-card">
            <span className="eyebrow">Readout</span>
            <h3>植物细胞读数板</h3>
            <div className="generic-readout-grid onioncell-readout-grid">
              <article className={samplePrepared ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>装片状态</span>
                <strong>{samplePrepared ? '薄片已就位' : '待制片'}</strong>
                <small>{samplePrepared ? '表皮已铺平，载片透光开始稳定。' : '先制作薄而平整的临时装片。'}</small>
              </article>
              <article className={stained ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>染色层</span>
                <strong>{stained ? '反差已建立' : '待染色'}</strong>
                <small>{stained ? '碘液已把核区和细胞壁对比拉开。' : '未盖片前镜下结构仍然偏淡。'}</small>
              </article>
              <article className={focused ? 'lab-readout-card active' : 'lab-readout-card calm'}>
                <span>显微图像</span>
                <strong>{focused ? '细胞壁清晰' : '待调焦'}</strong>
                <small>{focused ? '规则排列的植物细胞边界已经稳定可见。' : '继续细调直到边界与细胞核同时清楚。'}</small>
              </article>
            </div>
            <div className="detail-list compact-detail-list onioncell-runtime-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜下倍率</strong>
                  <span>{magnificationLabel} · 视野 {fieldScaleLabel}</span>
                </div>
                <span className="badge">{focusConfidence}%</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>染色渗透</strong>
                  <span>{stainStatusLabel}</span>
                </div>
                <span className="badge">{stainCoverageValue}%</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>样本水合</strong>
                  <span>{focusStatusLabel}</span>
                </div>
                <span className="badge">{hydrationValue}%</span>
              </div>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {stepTitles[step]}
              <small className="selector-note">
                目标对象：{stepConfig?.targetObject ?? '洋葱表皮细胞实验装置'} · 当前重点：
                {step <= 3 ? '装片与染色' : step === 4 ? '显微调焦' : '判断植物细胞结构'}
              </small>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'bench' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('bench')} type="button">实验台</button>
              <button className={cameraPreset === 'slide' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('slide')} type="button">玻片</button>
              <button className={cameraPreset === 'microscope' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('microscope')} type="button">显微镜</button>
            </div>
          </div>

          <div className={`scene-canvas onioncell-stage preset-${cameraPreset} ${samplePrepared ? 'prepared' : ''} ${stained ? 'stained' : ''} ${focused ? 'focused' : ''}`}>
            <div className="onioncell-rig">
              <div className="onion-slide">
                <div className="onion-slide-sheen" />
                <div className={samplePrepared ? 'onion-film active' : 'onion-film'} style={slideFilmStyle}>
                  {onionFilmStrips.map((strip) => (
                    <span
                      className="onion-film-strip"
                      key={strip.id}
                      style={{
                        '--film-strip-left': strip.left,
                        '--film-strip-width': strip.width,
                        '--film-strip-rotate': `${strip.rotate}deg`,
                        '--film-strip-opacity': strip.opacity.toFixed(2),
                      } as CSSProperties}
                    />
                  ))}
                  <span className="onion-film-vein" />
                </div>
                <div className={stained ? 'onion-stain-front active' : 'onion-stain-front'} />
                <div className={stained ? 'onion-droplet active' : 'onion-droplet'} />
                <div className={stained ? 'onion-meniscus active' : 'onion-meniscus'} />
                <div className={stained ? 'onion-coverslip active' : 'onion-coverslip'}>
                  <span className="onion-coverslip-glint" />
                </div>
                <span className="onion-slide-caption">{sampleStatusLabel}</span>
              </div>

              <div className="onion-tweezer" />
              <div className="onion-dropper" />

              <div className="onion-microscope">
                <div className="onion-scope-base" />
                <div className="onion-scope-column" />
                <div className="onion-scope-arm" />
                <div className="onion-scope-head" />
                <div className="onion-scope-stage" />
                <div className="onion-scope-objective" />
                <div className="onion-scope-focus-knob major" />
                <div className="onion-scope-focus-knob minor" />
                <div className={stained ? 'onion-scope-lamp active' : 'onion-scope-lamp'} />

                <div className="onion-eyepiece-view" style={viewfinderGlassStyle}>
                  <span className="onion-viewfinder-haze" />
                  <span className="onion-viewfinder-reticle" />
                  <span className="onion-viewfinder-scale">{magnificationLabel}</span>
                  <span className="onion-viewfinder-focus">对焦 {focusConfidence}%</span>
                  <span className="onion-viewfinder-field" style={onionFieldStyle}>
                    {onionViewfinderCells.map((cell) => (
                      <span
                        className={focused ? 'onion-viewfinder-cell clear' : 'onion-viewfinder-cell'}
                        key={cell.id}
                        style={{
                          '--onion-cell-left': cell.left,
                          '--onion-cell-top': cell.top,
                          '--onion-cell-width': cell.width,
                          '--onion-cell-height': cell.height,
                          '--onion-cell-rotate': `${cell.rotate}deg`,
                          '--onion-cell-wall': cell.wallTone,
                          '--onion-cell-fill': cell.fillTone,
                          '--onion-cell-vacuole': cell.vacuoleTone,
                          '--onion-cell-nucleus-x': cell.nucleusX,
                          '--onion-cell-nucleus-y': cell.nucleusY,
                          '--onion-cell-nucleus-scale': `${cell.nucleusScale}`,
                        } as CSSProperties}
                      />
                    ))}
                  </span>
                  <span className="onion-viewfinder-dust-layer">
                    {onionViewfinderDust.map((dust) => (
                      <span
                        className="onion-viewfinder-dust"
                        key={dust.id}
                        style={{
                          '--onion-dust-left': dust.left,
                          '--onion-dust-top': dust.top,
                          '--onion-dust-size': `${dust.size}px`,
                          '--onion-dust-opacity': `${dust.opacity}`,
                          '--onion-dust-delay': `${dust.delay}s`,
                          '--onion-dust-duration': `${dust.duration}s`,
                        } as CSSProperties}
                      />
                    ))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="observation-ribbon onioncell-observation-row">
            <article className={samplePrepared ? 'observation-chip active' : 'observation-chip calm'}>
              <strong>装片制作</strong>
              <span>{samplePrepared ? `薄片已铺开，透光就绪 ${stainCoverageValue}%` : '先完成临时装片。'}</span>
            </article>
            <article className={stained ? 'observation-chip active' : 'observation-chip calm'}>
              <strong>染色状态</strong>
              <span>{stained ? `碘液已渗入，镜下反差 ${contrastValue}%` : '等待滴加染液并盖片。'}</span>
            </article>
            <article className={focused ? 'observation-chip active' : 'observation-chip calm'}>
              <strong>显微观察</strong>
              <span>{focused ? `${magnificationLabel} 下细胞壁和细胞核清晰可辨。` : `当前对焦可信度 ${focusConfidence}%`}</span>
            </article>
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
              {step === 1 ? materialOrder.map((materialId) => (
                <button className="summary-choice generic-choice primary" key={materialId} onClick={() => handleIdentify(materialId)} type="button">
                  <strong>识别 {materialLabels[materialId]}</strong>
                  <span>{identifiedMaterials.includes(materialId) ? '已完成识别' : '点击后标记为已识别器材'}</span>
                </button>
              )) : null}

              {step === 2 ? (
                <>
                  <button className="summary-choice generic-choice primary" onClick={() => handlePrepare('correct')} type="button">
                    <strong>撕取薄表皮并平整铺片</strong>
                    <span>为显微观察建立清晰样本。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handlePrepare('thick')} type="button">
                    <strong>叠成较厚样本</strong>
                    <span>错误演示：影响透光观察。</span>
                  </button>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <button className="summary-choice generic-choice primary" onClick={() => handleStain('correct')} type="button">
                    <strong>滴加染液并盖上盖玻片</strong>
                    <span>提升细胞结构对比度。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleStain('skip')} type="button">
                    <strong>跳过染色直接观察</strong>
                    <span>错误演示：细胞核不清晰。</span>
                  </button>
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <button className="summary-choice generic-choice primary" onClick={() => handleFocus('correct')} type="button">
                    <strong>调焦到细胞壁和细胞核清晰</strong>
                    <span>形成可判断的显微图像。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleFocus('blur')} type="button">
                    <strong>保持模糊视野</strong>
                    <span>错误演示：无法准确判断结构。</span>
                  </button>
                </>
              ) : null}

              {step === 5 ? (
                <>
                  <button className={summaryChoice === 'correct' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleSummary('correct')} type="button">
                    <strong>洋葱表皮细胞有细胞壁、细胞膜、细胞质、细胞核和液泡</strong>
                    <span>完整总结植物细胞结构。</span>
                  </button>
                  <button className="summary-choice generic-choice secondary" onClick={() => handleSummary('no-wall')} type="button">
                    <strong>洋葱表皮细胞没有细胞壁</strong>
                    <span>错误演示：与植物细胞特征相反。</span>
                  </button>
                  <button className="summary-choice generic-choice danger" onClick={() => handleSummary('chloroplast')} type="button">
                    <strong>洋葱表皮细胞一定能看到大量叶绿体</strong>
                    <span>错误演示：与当前材料不符。</span>
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
              <li>装置状态：{samplePrepared ? '已完成装片' : '待装片'} / {focused ? '视野清晰' : stained ? '待调焦' : '待染色'}</li>
              <li>风险提醒：{stepConfig?.failureHints[0] ?? '注意薄片、染色和显微调焦'}</li>
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
            <small>这页现在会同步输出更细粒度的装片、染色和显微运行态，便于 Copilot 只围绕当前步骤给出 grounded 提示。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
