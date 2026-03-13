import { useEffect, useMemo, useRef, useState } from 'react';
import { AmbientLight, BoxGeometry, CatmullRomCurve3, CircleGeometry, Color, ConeGeometry, CylinderGeometry, DirectionalLight, DoubleSide, Fog, GridHelper, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PointLight, Raycaster, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, TubeGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import { createSimulationRuntimeSnapshot, type SimulationRuntimeSnapshot } from '../lib/simulationRuntime';
import type { ExperimentConfig } from '../types/experiment';
import { attachLabRealism, createLabCeramicMaterial, createLabCoatedMetalMaterial, createLabGlassMaterial, createLabLiquidMaterial, createLabLiquidSurfaceMaterial, createLabMetalMaterial, createLabPlasticMaterial, createLabRubberMaterial, createLabWoodMaterial } from '../lib/threeRealism';
import { loadLabModelAssetFromManifest } from '../lib/labModelAsset';

type BasePartId = 'stand' | 'test-tube' | 'delivery-tube';
type MaterialId = 'reagent' | 'cotton';
type StepId = 1 | 2 | 3 | 4 | 5 | 6;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'wide' | 'assembly' | 'collection';

type BubbleLane = 'water' | 'bottle';

interface OxygenLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
  onSimulationRuntimeChange?: (snapshot: SimulationRuntimeSnapshot | null) => void;
}

interface HitInfo {
  role?: string;
  id?: string;
}

interface BubbleParticle {
  mesh: Mesh;
  offset: number;
  lane: BubbleLane;
  speed: number;
  sway: number;
  drift: number;
  scale: number;
  phase: number;
}

interface OxygenSceneObjects {
  stand: Group | null;
  testTube: Group | null;
  deliveryTube: Group | null;
  reagentJar: Group | null;
  cottonBox: Group | null;
  sealBulb: Mesh | null;
  lamp: Group | null;
  flameOuter: Mesh | null;
  flameInner: Mesh | null;
  burnerLight: PointLight | null;
  waterTank: Mesh | null;
  waterSurface: Mesh | null;
  waterTop: Mesh | null;
  gasBottle: Group | null;
  bottleFill: Mesh | null;
  bottleMeniscus: Mesh | null;
  heatGlow: Mesh | null;
  stopper: Mesh | null;
  powder: Group | null;
  cottonPlug: Group | null;
}

const basePartOrder: BasePartId[] = ['stand', 'test-tube', 'delivery-tube'];
const materialOrder: MaterialId[] = ['reagent', 'cotton'];
const partLabels: Record<BasePartId, string> = {
  stand: '铁架台',
  'test-tube': '试管',
  'delivery-tube': '导管',
};
const materialLabels: Record<MaterialId, string> = {
  reagent: '药品',
  cotton: '棉花',
};
const stepCopy: Record<StepId, string> = {
  1: '先点击铁架台、试管和导管，完成制氧装置搭建。',
  2: '点击药品瓶和棉花盒，把药品和棉花加入试管。',
  3: '加热前先检查气密性，点击黑色橡胶球完成检查。',
  4: '点击酒精灯开始加热，先观察气泡是否稳定连续。',
  5: '当气泡连续均匀后，再点击集气瓶放入水槽开始收集。',
  6: '选择正确操作结论并提交，完成本次化学实验。',
};

const stepTitles: Record<StepId, string> = {
  1: '搭建制气装置',
  2: '加入药品',
  3: '检查气密性',
  4: '开始加热',
  5: '收集氧气',
  6: '总结规范',
};

const cameraPresetLabels: Record<CameraPreset, string> = {
  wide: '全景台面',
  assembly: '装置近景',
  collection: '集气近景',
};

const summaryChoiceLabels: Record<string, string> = {
  '': '未选择',
  'lamp-first': '先点酒精灯再说',
  'stable-bubbles-then-collect': '气泡连续均匀后再收集',
  'skip-seal': '可跳过气密性检查',
};

const oxygenStepOrder: StepId[] = [1, 2, 3, 4, 5, 6];

const oxygenHoverCopy: Record<string, { title: string; detail: string }> = {
  stand: { title: '铁架台', detail: '铁架台负责稳定整个制气装置，先固定骨架再放试管和导管。' },
  'test-tube': { title: '试管', detail: '药品加在试管中受热分解，试管倾斜能避免冷凝液倒流。' },
  'delivery-tube': { title: '导管', detail: '导管把生成的氧气引入水槽和集气瓶，是观察气泡稳定性的关键。' },
  reagent: { title: '药品瓶', detail: '先装药品再塞棉花，避免粉末受热飞散。' },
  cotton: { title: '棉花盒', detail: '棉花能固定药品并阻挡粉末进入导管。' },
  'seal-check': { title: '气密性检查球', detail: '正式加热前必须先检漏，确保后续气泡连续稳定。' },
  lamp: { title: '酒精灯', detail: '应先预热再正式加热，观察导管口气泡是否已连续均匀。' },
  'gas-bottle': { title: '集气瓶', detail: '只有气泡稳定后再收集，才能减少混入空气，提高氧气纯度。' },
};

function isVisibleObject(object: Object3D) {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function setInteractive(object: Object3D, id: string, role = 'equipment') {
  object.userData = { ...object.userData, role, id };
  object.traverse((child) => {
    child.userData = { ...child.userData, role, id };
  });
}

function applyGlow(object: Object3D | null, color: number, intensity: number) {
  if (!object) return;
  object.traverse((child) => {
    const mesh = child as Mesh;
    const material = mesh.material;
    if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
      material.emissive = new Color(color);
      material.emissiveIntensity = intensity;
    }
  });
}

export function OxygenLabPlayer({ experiment, onTelemetry, onSimulationRuntimeChange }: OxygenLabPlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameRef = useRef<number | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const interactiveObjectsRef = useRef<Object3D[]>([]);
  const bubbleParticlesRef = useRef<BubbleParticle[]>([]);
  const condensationDropsRef = useRef<Mesh[]>([]);
  const gasLevelRef = useRef(0);
  const collectionLevelRef = useRef(0);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const sceneObjectsRef = useRef<OxygenSceneObjects>({
    stand: null,
    testTube: null,
    deliveryTube: null,
    reagentJar: null,
    cottonBox: null,
    sealBulb: null,
    lamp: null,
    flameOuter: null,
    flameInner: null,
    burnerLight: null,
    waterTank: null,
    waterSurface: null,
    waterTop: null,
    gasBottle: null,
    bottleFill: null,
    bottleMeniscus: null,
    heatGlow: null,
    stopper: null,
    powder: null,
    cottonPlug: null,
  });
  const stepRef = useRef<StepId>(1);
  const heatingRef = useRef(false);
  const sealPulseRef = useRef(false);
  const bottlePlacedRef = useRef(false);

  const [step, setStep] = useState<StepId>(1);
  const [assembledParts, setAssembledParts] = useState<BasePartId[]>([]);
  const [addedMaterials, setAddedMaterials] = useState<MaterialId[]>([]);
  const [sealChecked, setSealChecked] = useState(false);
  const [sealPulse, setSealPulse] = useState(false);
  const [heating, setHeating] = useState(false);
  const [gasLevel, setGasLevel] = useState(0);
  const [bottlePlaced, setBottlePlaced] = useState(false);
  const [collectionLevel, setCollectionLevel] = useState(0);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [prompt, setPrompt] = useState(stepCopy[1]);
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('wide');
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);

  const assemblyReady = assembledParts.length === basePartOrder.length;
  const materialsReady = addedMaterials.length === materialOrder.length;
  const gasStable = gasLevel >= 36;
  const canCollect = heating && gasStable;
  const collectionDone = collectionLevel >= 100;
  const score = Math.max(72, 100 - errors * 5);
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

  const sceneTone = useMemo<'neutral' | 'valid' | 'invalid'>(() => {
    if (promptTone === 'error') return 'invalid';
    if (step === 5 && canCollect) return 'valid';
    if (step === 6 && completed) return 'valid';
    return 'neutral';
  }, [canCollect, completed, promptTone, step]);
  const hoveredPartCopy = hoveredPart ? oxygenHoverCopy[hoveredPart] : null;
  const assemblyStatusLabel = assemblyReady ? '装置已搭建' : `装置 ${assembledParts.length}/${basePartOrder.length}`;
  const materialStatusLabel = materialsReady ? '药品与棉花已就位' : `加药 ${addedMaterials.length}/${materialOrder.length}`;
  const purgeProgress = heating ? Math.min(100, Math.round((gasLevel / 36) * 100)) : 0;
  const bubbleVisualLabel = !heating
    ? '未见气泡'
    : gasLevel < 12
      ? '零散大泡'
      : gasLevel < 24
        ? '断续上浮'
        : gasLevel < 36
          ? '逐渐连贯'
          : '连续细密';
  const purgePhaseLabel = !heating
    ? '未开始排空气'
    : gasStable
      ? '排空气完成'
      : gasLevel < 12
        ? '试管预热'
        : gasLevel < 24
          ? '排空气初段'
          : '排空气末段';
  const gasReadoutLabel = !heating
    ? '酒精灯未点燃，导管口暂时无稳定气泡。'
    : gasLevel < 12
      ? '试管刚进入预热，导管口只出现零散大泡，暂不能收集。'
      : gasLevel < 24
        ? '导管口仍在排出原有空气，气泡断续且偏大，继续观察。'
        : gasLevel < 36
          ? '气泡已开始变得连贯，但还没完全稳定，仍需等待。'
          : gasLevel < 72
            ? '导管口气泡已连续细密，已达到开始排水集气的时机。'
            : '气流输出保持稳定，可以继续维持收集直到瓶内充满。';
  const collectionPhaseLabel = !bottlePlaced
    ? canCollect
      ? '待放集气瓶'
      : '未开始收集'
    : collectionDone
      ? '收集完成'
      : collectionLevel < 35
        ? '排水置换初段'
        : collectionLevel < 75
          ? '持续集气中'
          : '接近收满';
  const collectionReadoutLabel = !bottlePlaced
    ? canCollect
      ? '当前条件已满足，集气瓶可以入水开始排水集气。'
      : '集气瓶尚未入水，应先把注意力放在导管口气泡是否连续均匀。'
    : collectionDone
      ? '瓶内氧气已基本收满，可转入结束规范和结论判断。'
      : collectionLevel < 35
        ? '瓶内正在以排水方式置换空气，液面变化刚开始明显。'
        : collectionLevel < 75
          ? '瓶内氧气体积分数持续提高，保持加热与装置稳定。'
          : '集气瓶已接近收满，保持规范操作并准备结束流程。';
  const operationDecisionLabel = completed
    ? '流程闭环完成，记住结束时应先移导管再熄灭酒精灯。'
    : step <= 3
      ? '先补齐装置、药品和检漏，再进入加热观察。'
      : step === 4
        ? gasStable
          ? '气泡已稳定，可以把集气瓶放入水槽开始收集。'
          : '继续观察导管口，当前还不应过早收集。'
        : step === 5
          ? collectionDone
            ? '收集已完成，下一步整理规范结论。'
            : '保持加热并持续收集，收满前不要打断流程。'
          : summaryChoice === 'stable-bubbles-then-collect'
            ? '当前结论正确，可以提交。'
            : '提交前要同时覆盖检漏、收集时机与结束顺序。';
  const oxygenReadoutRows = [
    {
      label: '导管口判断',
      detail: gasReadoutLabel,
      badge: bubbleVisualLabel,
      tone: gasStable ? 'ready' : heating ? 'watch' : 'idle',
    },
    {
      label: '集气瓶状态',
      detail: collectionReadoutLabel,
      badge: collectionPhaseLabel,
      tone: collectionDone ? 'ready' : bottlePlaced || canCollect ? 'watch' : 'idle',
    },
    {
      label: '当前操作判定',
      detail: operationDecisionLabel,
      badge: completed ? '已闭环' : stepTitles[step],
      tone: promptTone === 'error' ? 'error' : completed || collectionDone || canCollect ? 'ready' : 'watch',
    },
  ] as const;

  const oxygenSimulationRuntime = useMemo(() => {
    const phaseProgress = (() => {
      if (step === 1) return (assembledParts.length / basePartOrder.length) * 0.16;
      if (step === 2) return (addedMaterials.length / materialOrder.length) * 0.16;
      if (step === 3) return sealChecked ? 0.16 : sealPulse ? 0.1 : 0;
      if (step === 4) return (gasLevel / 100) * 0.16;
      if (step === 5) return (bottlePlaced ? 0.05 : 0) + ((collectionLevel / 100) * 0.11);
      if (!summaryChoice) return 0;
      return summaryChoice === 'stable-bubbles-then-collect' ? 0.16 : 0.08;
    })();

    return createSimulationRuntimeSnapshot({
      playerId: 'oxygen-lab-player',
      phaseLabel: stepTitles[step],
      phaseState: completed ? 'completed' : 'active',
      progress: completed ? 1 : Math.min(0.97, ((step - 1) / 6) + phaseProgress),
      focusTarget: hoveredPartCopy?.title ?? (cameraPreset === 'collection' ? (bottlePlaced ? '水槽中的集气瓶' : '导管出气端') : cameraPreset === 'assembly' ? '试管与导管连接处' : '制氧实验台'),
      focusLens: cameraPreset === 'wide' ? 'macro' : 'meso',
      stateSummary: `${assemblyStatusLabel} · ${purgePhaseLabel} · ${collectionPhaseLabel}`,
      observables: [
        { key: 'purge-progress', label: '排空气稳定度', value: purgeProgress, unit: '%', status: gasStable ? 'nominal' : heating ? 'warning' : 'critical' },
        { key: 'gas-flow', label: '导管口气泡', value: bubbleVisualLabel, status: gasStable ? 'nominal' : heating ? 'warning' : 'critical' },
        { key: 'collection-level', label: '收集进度', value: Math.round(collectionLevel), unit: '%', status: collectionDone ? 'nominal' : bottlePlaced ? 'warning' : 'critical' },
        { key: 'collection-phase', label: '集气瓶状态', value: collectionPhaseLabel, status: collectionDone ? 'nominal' : bottlePlaced || canCollect ? 'warning' : 'critical' },
        { key: 'seal-state', label: '气密性', value: sealChecked ? '通过' : step >= 3 ? '未检查' : '未开始', status: sealChecked ? 'nominal' : step >= 4 ? 'critical' : 'warning' },
        { key: 'operation-judgement', label: '操作判定', value: canCollect ? '可收集' : step >= 4 ? '继续观察' : '先完成前置步骤', status: completed ? 'nominal' : promptTone === 'error' ? 'critical' : 'warning' },
      ],
      controls: [
        { key: 'camera-preset', label: '镜头机位', value: cameraPresetLabels[cameraPreset], kind: 'discrete' },
        { key: 'heating-toggle', label: '酒精灯', value: heating ? '已点燃' : '未点燃', kind: 'toggle' },
        { key: 'bottle-placement', label: '集气瓶放置', value: bottlePlaced ? '已入水槽' : '未放置', kind: 'discrete' },
        { key: 'material-stage', label: '加药状态', value: materialStatusLabel, kind: 'discrete' },
        { key: 'summary-choice', label: '结论选择', value: summaryChoiceLabels[summaryChoice] ?? '未选择', kind: 'discrete' },
      ],
      phases: oxygenStepOrder.map((stepId) => ({
        key: `step-${stepId}`,
        label: stepTitles[stepId],
        state: completed || step > stepId || (stepId === 6 && completed) ? 'completed' : step === stepId ? 'active' : 'pending',
      })),
      failureRisks: [
        !assemblyReady ? '装置仍未搭完整，后续加药、检漏和导气都没有稳定基座。' : '',
        heating && !sealChecked ? '未完成气密性检查就加热，会让导管读数失真并带来操作风险。' : '',
        heating && !gasStable ? '当前仍处在排空气阶段，导管口只会给出零散或断续气泡，过早收集会混入空气。' : '',
        step >= 5 && gasStable && !bottlePlaced ? '气体已稳定但尚未放入集气瓶，流程停在规范收集前。' : '',
        bottlePlaced && !collectionDone ? '当前仍在排水集气过程中，过早结束会让瓶内氧气体积分数不稳定。' : '',
        step === 6 && summaryChoice && summaryChoice !== 'stable-bubbles-then-collect' ? '当前结论没有覆盖先检漏、等气泡稳定再收集、结束时先移导管再熄灯的关键规范。' : '',
      ],
      trace: [
        '铁架台 -> 试管 -> 导管 -> 药品/棉花 -> 气密性检查 -> 加热 -> 稳定排气 -> 排水集气',
        sealChecked ? '气密性检查已通过' : '加热前必须先完成检漏',
        heating ? (gasStable ? '导管口气泡已连续细密，可开始规范收集' : `当前处在${purgePhaseLabel}，继续观察气泡形态`) : '尚未开始加热',
        bottlePlaced ? (collectionDone ? '集气瓶已完成氧气收集' : `集气瓶已入水，当前处在${collectionPhaseLabel}`) : '集气瓶尚未放入水槽',
        completed ? '结束判断已闭环：先检漏，等气泡稳定后收集，先移导管再熄灯' : operationDecisionLabel,
      ],
    });
  }, [
    addedMaterials.length,
    assembledParts.length,
    assemblyStatusLabel,
    assemblyReady,
    bottlePlaced,
    bubbleVisualLabel,
    cameraPreset,
    collectionDone,
    collectionLevel,
    collectionPhaseLabel,
    completed,
    gasLevel,
    gasStable,
    heating,
    hoveredPartCopy?.title,
    materialStatusLabel,
    operationDecisionLabel,
    promptTone,
    purgePhaseLabel,
    purgeProgress,
    sealChecked,
    sealPulse,
    step,
    summaryChoice,
  ]);

  useEffect(() => {
    stepRef.current = step;
    heatingRef.current = heating;
    sealPulseRef.current = sealPulse;
    bottlePlacedRef.current = bottlePlaced;
    gasLevelRef.current = gasLevel;
    collectionLevelRef.current = collectionLevel;
  }, [bottlePlaced, collectionLevel, gasLevel, heating, sealPulse, step]);

  useEffect(() => {
    onSimulationRuntimeChange?.(oxygenSimulationRuntime);
  }, [onSimulationRuntimeChange, oxygenSimulationRuntime]);

  useEffect(() => () => {
    onSimulationRuntimeChange?.(null);
  }, [onSimulationRuntimeChange]);

  const applyCameraPreset = (preset: CameraPreset) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = new Vector3(1.4, 1.9, 0);
    const position = new Vector3(8.4, 6.4, 8.8);

    if (preset === 'assembly') {
      target.set(0.2, 2.2, 0);
      position.set(4.8, 5.8, 6.6);
    }

    if (preset === 'collection') {
      target.set(4.3, 1.7, 0);
      position.set(8.4, 4.5, 3.8);
    }

    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  };

  const handleAssemblePart = (partId: BasePartId) => {
    if (stepRef.current !== 1) return;
    setAssembledParts((current) => {
      if (current.includes(partId)) return current;
      const next = [...current, partId];
      if (next.length === basePartOrder.length) {
        setPrompt('装置已搭好，继续加入药品和棉花。');
        setPromptTone('success');
      } else {
        setPrompt('继续点击剩余器材，完成装置搭建。');
        setPromptTone('info');
      }
      return next;
    });
  };

  const handleAddMaterial = (materialId: MaterialId) => {
    if (stepRef.current !== 2) return;
    setAddedMaterials((current) => {
      if (current.includes(materialId)) return current;
      const next = [...current, materialId];
      if (next.length === materialOrder.length) {
        setPrompt('药品与棉花已加入，下一步先检查气密性。');
        setPromptTone('success');
      } else {
        setPrompt('材料加入了一部分，继续补全。');
        setPromptTone('info');
      }
      return next;
    });
  };

  const handleSealCheck = () => {
    if (step !== 3) return;
    if (!materialsReady) {
      setErrors((value) => value + 1);
      setPrompt('请先把药品和棉花加入试管，再检查气密性。');
      setPromptTone('error');
      return;
    }

    setSealChecked(true);
    setSealPulse(true);
    setPrompt('气密性检查通过，可以开始加热。');
    setPromptTone('success');
    setCameraPreset('assembly');
  };

  const handleStartHeating = () => {
    if (step < 4) {
      setErrors((value) => value + 1);
      setPrompt('请先完成前面的装置、加药和气密性检查，再开始加热。');
      setPromptTone('error');
      return;
    }
    if (!sealChecked) {
      setErrors((value) => value + 1);
      setPrompt('必须先检查气密性，再进行加热。');
      setPromptTone('error');
      return;
    }

    if (heating) return;
    setHeating(true);
    setPrompt('已开始加热，请先观察导管口气泡，等其连续均匀后再收集。');
    setPromptTone('success');
  };

  const handlePlaceBottle = () => {
    if (bottlePlaced) return;
    if (step < 5) {
      setErrors((value) => value + 1);
      setPrompt('现在还不能放入集气瓶，请先等待导管口气泡连续均匀。');
      setPromptTone('error');
      return;
    }
    if (!gasStable) {
      setErrors((value) => value + 1);
      setPrompt('现在气泡还不稳定，不能过早收集氧气。');
      setPromptTone('error');
      return;
    }

    setBottlePlaced(true);
    setPrompt('集气瓶已放入水槽，保持加热并等待收集完成。');
    setPromptTone('success');
    setCameraPreset('collection');
  };

  const handleResetLab = () => {
    reportReset('化学实验已重置，开始新的制氧与收集尝试。');
    setStep(1);
    setAssembledParts([]);
    setAddedMaterials([]);
    setSealChecked(false);
    setSealPulse(false);
    setHeating(false);
    setGasLevel(0);
    setBottlePlaced(false);
    setCollectionLevel(0);
    setSummaryChoice('');
    setErrors(0);
    setCompleted(false);
    setPrompt(stepCopy[1]);
    setPromptTone('info');
    setCameraPreset('wide');
  };

  const handleSubmitSummary = () => {
    if (step !== 6) return;
    if (summaryChoice !== 'stable-bubbles-then-collect') {
      setErrors((value) => value + 1);
      setPrompt('结论不完整。请同时关注检查气密性、收集时机和结束顺序。');
      setPromptTone('error');
      return;
    }

    setCompleted(true);
    setPrompt('实验完成。你已完成氧气制备、观察与规范收集。');
    setPromptTone('success');
    setCameraPreset('collection');
  };

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    interactiveObjectsRef.current = [];
    bubbleParticlesRef.current = [];
    condensationDropsRef.current = [];
    sceneObjectsRef.current = {
      stand: null,
      testTube: null,
      deliveryTube: null,
      reagentJar: null,
      cottonBox: null,
      sealBulb: null,
      lamp: null,
      flameOuter: null,
      flameInner: null,
      burnerLight: null,
      waterTank: null,
      waterSurface: null,
      waterTop: null,
      gasBottle: null,
      bottleFill: null,
      bottleMeniscus: null,
      heatGlow: null,
      stopper: null,
      powder: null,
      cottonPlug: null,
    };

    const scene = new Scene();
    scene.background = new Color(0x08131e);
    scene.fog = new Fog(0x08131e, 12, 28);
    sceneRef.current = scene;

    const camera = new PerspectiveCamera(40, mountNode.clientWidth / mountNode.clientHeight, 0.1, 100);
    camera.position.set(8.4, 6.4, 8.8);
    camera.lookAt(1.4, 1.9, 0);
    cameraRef.current = camera;

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    rendererRef.current = renderer;
    mountNode.appendChild(renderer.domElement);

    const realism = attachLabRealism(renderer, scene, { exposure: 1.1, environmentIntensity: 0.96 });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(1.4, 1.9, 0);
    controls.update();
    controlsRef.current = controls;

    const ambient = new AmbientLight(0xffffff, 1.26);
    const directional = new DirectionalLight(0xcfe2ff, 1.66);
    directional.position.set(6, 10, 5);
    directional.castShadow = true;
    directional.shadow.mapSize.set(1536, 1536);
    directional.shadow.bias = -0.00008;
    const rim = new DirectionalLight(0x38e0c1, 0.48);
    rim.position.set(-6, 6, -6);
    const glow = new PointLight(0x3d66ff, 0.62, 24, 2);
    glow.position.set(2, 6, 0);
    scene.add(ambient, directional, rim, glow);

    const table = new Mesh(
      new BoxGeometry(14, 0.6, 8),
      createLabWoodMaterial({ color: 0x6d4a34, roughness: 0.72 }),
    );
    table.position.set(0.8, -0.35, 0);
    table.receiveShadow = true;
    scene.add(table);

    const frame = new Mesh(
      new BoxGeometry(14.3, 0.1, 8.3),
      createLabCoatedMetalMaterial({ color: 0x314e6c, roughness: 0.24, metalness: 0.42 }),
    );
    frame.position.set(0.8, -0.02, 0);
    scene.add(frame);

    const tableInset = new Mesh(
      new BoxGeometry(13.35, 0.05, 7.35),
      createLabPlasticMaterial({ color: 0x122638, roughness: 0.44, clearcoat: 0.28 }),
    );
    tableInset.position.set(0.8, 0.02, 0);
    scene.add(tableInset);

    const backPanel = new Mesh(
      new PlaneGeometry(18, 10),
      createLabPlasticMaterial({ color: 0x0b1621, roughness: 0.74, clearcoat: 0.04 }),
    );
    backPanel.position.set(0.8, 4.4, -4.2);
    scene.add(backPanel);

    const grid = new GridHelper(12.5, 18, 0x27486c, 0x13263d);
    grid.position.y = -0.01;
    scene.add(grid);

    const metalMaterial = createLabMetalMaterial({ color: 0xb6c7d7, roughness: 0.18, metalness: 0.96 });
    const darkMaterial = createLabCoatedMetalMaterial({ color: 0x24364a, roughness: 0.3, metalness: 0.4 });
    const glassMaterial = createLabGlassMaterial({ color: 0xdaf2ff, opacity: 0.18, thickness: 0.64, attenuationDistance: 3.1, attenuationColor: 0xdaf2ff });
    const ceramicMaterial = createLabCeramicMaterial({ color: 0xf5f7fb, roughness: 0.46 });
    const rubberMaterial = createLabRubberMaterial({ color: 0x263344, roughness: 0.84 });
    const waterMaterial = createLabLiquidMaterial({ color: 0x5aa8ff, opacity: 0.38, transmission: 0.84, thickness: 1.7, attenuationDistance: 1.6, attenuationColor: 0x6bb5ff });
    const waterSurfaceMaterial = createLabLiquidSurfaceMaterial({ color: 0x78c4ff, opacity: 0.48, attenuationColor: 0x7ac7ff });
    const deliveryTubeMaterial = createLabGlassMaterial({ color: 0xc7ebff, opacity: 0.22, transmission: 0.94, thickness: 0.22, attenuationDistance: 1.4, attenuationColor: 0xd7f1ff });
    const lampGlassMaterial = createLabGlassMaterial({ color: 0x8fd4ff, opacity: 0.24, transmission: 0.84, thickness: 0.42, attenuationDistance: 1.2, attenuationColor: 0x7bb1ff });
    const lampFuelMaterial = createLabLiquidMaterial({ color: 0x579cff, opacity: 0.44, transmission: 0.72, thickness: 0.48, attenuationDistance: 0.92, attenuationColor: 0x4579ff });
    const bubbleMaterial = createLabGlassMaterial({ color: 0xf4feff, opacity: 0.36, transmission: 0.98, thickness: 0.08, roughness: 0.01, attenuationDistance: 0.36, attenuationColor: 0xe4fbff });

    const stand = new Group();
    stand.position.set(-4.8, 0, -2.4);
    const standBase = new Mesh(new BoxGeometry(1.2, 0.18, 0.85), darkMaterial);
    standBase.position.y = 0.09;
    const standBasePad = new Mesh(new BoxGeometry(0.94, 0.04, 0.56), rubberMaterial);
    standBasePad.position.y = 0.2;
    const standPole = new Mesh(new CylinderGeometry(0.08, 0.08, 3.5, 20), metalMaterial);
    standPole.position.set(0, 1.85, 0);
    const bossHead = new Mesh(new CylinderGeometry(0.14, 0.14, 0.22, 20), darkMaterial);
    bossHead.position.set(0.06, 2.55, 0);
    bossHead.rotation.z = Math.PI / 2;
    const clampBar = new Mesh(new BoxGeometry(0.82, 0.08, 0.16), metalMaterial);
    clampBar.position.set(0.48, 2.55, 0);
    const clampJawTop = new Mesh(new BoxGeometry(0.16, 0.1, 0.22), metalMaterial);
    clampJawTop.position.set(0.9, 2.72, 0);
    const clampJawBottom = new Mesh(new BoxGeometry(0.16, 0.1, 0.22), metalMaterial);
    clampJawBottom.position.set(0.9, 2.42, 0);
    const clampRubberTop = new Mesh(new BoxGeometry(0.12, 0.04, 0.18), rubberMaterial);
    clampRubberTop.position.set(0.96, 2.67, 0);
    const clampRubberBottom = new Mesh(new BoxGeometry(0.12, 0.04, 0.18), rubberMaterial);
    clampRubberBottom.position.set(0.96, 2.47, 0);
    stand.add(standBase, standBasePad, standPole, bossHead, clampBar, clampJawTop, clampJawBottom, clampRubberTop, clampRubberBottom);
    stand.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    setInteractive(stand, 'stand');
    interactiveObjectsRef.current.push(stand);
    scene.add(stand);
    sceneObjectsRef.current.stand = stand;

    const testTube = new Group();
    testTube.position.set(-2.9, 0.66, -2.3);
    testTube.rotation.z = 0.12;
    const tubeBody = new Mesh(new CylinderGeometry(0.24, 0.24, 1.68, 24, 1, true), glassMaterial);
    tubeBody.position.y = 0.9;
    const tubeRim = new Mesh(new TorusGeometry(0.24, 0.018, 12, 28), glassMaterial);
    tubeRim.position.y = 1.74;
    tubeRim.rotation.x = Math.PI / 2;
    const tubeCap = new Mesh(new SphereGeometry(0.24, 24, 24, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), glassMaterial);
    tubeCap.position.y = 0.06;

    const powder = new Group();
    powder.position.y = 0.18;
    powder.visible = false;
    const powderBed = new Mesh(
      new CylinderGeometry(0.18, 0.2, 0.18, 18),
      new MeshStandardMaterial({ color: 0x5b2f76, metalness: 0.08, roughness: 0.74 }),
    );
    powder.add(powderBed);
    Array.from({ length: 9 }).forEach((_, index) => {
      const granule = new Mesh(
        new IcosahedronGeometry(index % 3 === 0 ? 0.036 : 0.028, 0),
        new MeshStandardMaterial({ color: index % 2 === 0 ? 0x6d3e89 : 0x71428e, metalness: 0.05, roughness: 0.82 }),
      );
      granule.position.set(-0.1 + (index % 3) * 0.1, 0.07 + (index % 2) * 0.02, -0.06 + Math.floor(index / 3) * 0.05);
      powder.add(granule);
    });

    const stopper = new Mesh(new CylinderGeometry(0.17, 0.21, 0.16, 18), rubberMaterial);
    stopper.position.y = 1.72;
    stopper.visible = false;

    const cottonPlug = new Group();
    cottonPlug.position.y = 1.66;
    cottonPlug.visible = false;
    Array.from({ length: 5 }).forEach((_, index) => {
      const tuft = new Mesh(
        new SphereGeometry(index === 0 ? 0.09 : 0.07, 16, 16),
        new MeshStandardMaterial({ color: 0xfafcff, metalness: 0.02, roughness: 0.92 }),
      );
      tuft.scale.set(1.1 + index * 0.04, 0.9, 1.05);
      tuft.position.set(-0.05 + index * 0.025, 0.02 + (index % 2) * 0.03, -0.02 + (index % 3) * 0.02);
      cottonPlug.add(tuft);
    });

    const heatGlow = new Mesh(
      new CylinderGeometry(0.23, 0.27, 0.36, 20, 1, true),
      new MeshBasicMaterial({ color: 0xff8f36, transparent: true, opacity: 0, depthWrite: false }),
    );
    heatGlow.position.y = 0.34;
    testTube.add(heatGlow);

    testTube.add(tubeBody, tubeRim, tubeCap, powder, stopper, cottonPlug);
    Array.from({ length: 6 }).forEach((_, index) => {
      const drop = new Mesh(
        new SphereGeometry(index % 2 === 0 ? 0.036 : 0.028, 12, 12),
        createLabGlassMaterial({ color: 0xeaf7ff, opacity: 0.28, transmission: 0.98, thickness: 0.04, attenuationDistance: 0.14, attenuationColor: 0xf1fcff }),
      );
      drop.position.set(-0.08 + (index % 3) * 0.08, 1.16 + Math.floor(index / 3) * 0.22, -0.02 + (index % 2) * 0.06);
      drop.visible = false;
      testTube.add(drop);
      condensationDropsRef.current.push(drop);
    });
    testTube.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    setInteractive(testTube, 'test-tube');
    interactiveObjectsRef.current.push(testTube);
    scene.add(testTube);
    sceneObjectsRef.current.testTube = testTube;
    sceneObjectsRef.current.powder = powder;
    sceneObjectsRef.current.cottonPlug = cottonPlug;
    sceneObjectsRef.current.heatGlow = heatGlow;
    sceneObjectsRef.current.stopper = stopper;

    const deliveryTube = new Group();
    deliveryTube.position.set(-1.4, 0.3, -2.2);
    const tubeCurve = new CatmullRomCurve3([
      new Vector3(0, 0.3, 0),
      new Vector3(0.8, 0.45, 0),
      new Vector3(1.3, 0.2, 0.2),
      new Vector3(1.9, -0.1, 0.2),
    ]);
    const tubeMesh = new Mesh(
      new TubeGeometry(tubeCurve, 48, 0.06, 12, false),
      deliveryTubeMaterial,
    );
    tubeMesh.castShadow = true;
    const tubeSleeve = new Mesh(new CylinderGeometry(0.09, 0.09, 0.18, 16), rubberMaterial);
    tubeSleeve.position.set(0.02, 0.3, 0);
    tubeSleeve.rotation.z = Math.PI / 2;
    const tubeOutlet = new Mesh(new SphereGeometry(0.07, 16, 16), deliveryTubeMaterial);
    tubeOutlet.position.set(1.9, -0.1, 0.2);
    tubeOutlet.scale.set(1.1, 0.7, 1.1);
    deliveryTube.add(tubeMesh, tubeSleeve, tubeOutlet);
    setInteractive(deliveryTube, 'delivery-tube');
    interactiveObjectsRef.current.push(deliveryTube);
    scene.add(deliveryTube);
    sceneObjectsRef.current.deliveryTube = deliveryTube;

    const reagentJar = new Group();
    reagentJar.position.set(-4.8, 0, 2.15);
    const jarBody = new Mesh(new CylinderGeometry(0.42, 0.48, 0.82, 20, 1, true), glassMaterial);
    jarBody.position.y = 0.48;
    const jarBase = new Mesh(new CylinderGeometry(0.44, 0.5, 0.08, 20), glassMaterial);
    jarBase.position.y = 0.08;
    const jarCap = new Mesh(new CylinderGeometry(0.28, 0.28, 0.18, 20), darkMaterial);
    jarCap.position.y = 0.97;
    const jarLabel = new Mesh(new PlaneGeometry(0.34, 0.2), createLabCeramicMaterial({ color: 0xfafcff, roughness: 0.54 }));
    jarLabel.position.set(0, 0.46, 0.43);
    const reagentShadow = new Mesh(new CylinderGeometry(0.24, 0.28, 0.42, 16), new MeshStandardMaterial({ color: 0x74429b, roughness: 0.82, metalness: 0.04 }));
    reagentShadow.position.y = 0.28;
    reagentJar.add(jarBody, jarBase, jarCap, jarLabel, reagentShadow);
    reagentJar.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    setInteractive(reagentJar, 'reagent');
    interactiveObjectsRef.current.push(reagentJar);
    scene.add(reagentJar);
    sceneObjectsRef.current.reagentJar = reagentJar;

    const cottonBox = new Group();
    cottonBox.position.set(-3.25, 0, 2.15);
    const boxBody = new Mesh(new BoxGeometry(0.9, 0.28, 0.72), ceramicMaterial);
    boxBody.position.y = 0.16;
    const boxLid = new Mesh(new BoxGeometry(0.82, 0.04, 0.64), createLabCoatedMetalMaterial({ color: 0xadb7c2, roughness: 0.3, metalness: 0.32 }));
    boxLid.position.set(0, 0.32, 0);
    const cotton = new Group();
    cotton.position.set(0, 0.38, 0);
    Array.from({ length: 4 }).forEach((_, index) => {
      const tuft = new Mesh(new SphereGeometry(index === 0 ? 0.16 : 0.12, 16, 16), new MeshStandardMaterial({ color: 0xfafcff, roughness: 0.95 }));
      tuft.position.set(-0.08 + index * 0.06, 0.02 + (index % 2) * 0.03, -0.04 + (index % 3) * 0.03);
      tuft.scale.set(1.12, 0.88, 1.06);
      cotton.add(tuft);
    });
    cottonBox.add(boxBody, boxLid, cotton);
    cottonBox.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    setInteractive(cottonBox, 'cotton');
    interactiveObjectsRef.current.push(cottonBox);
    scene.add(cottonBox);
    sceneObjectsRef.current.cottonBox = cottonBox;

    const lamp = new Group();
    lamp.position.set(0.25, 0, 1.15);
    const lampBody = new Mesh(new CylinderGeometry(0.42, 0.5, 0.82, 24), lampGlassMaterial);
    lampBody.position.y = 0.42;
    const lampFuel = new Mesh(new CylinderGeometry(0.32, 0.38, 0.34, 20), lampFuelMaterial);
    lampFuel.position.y = 0.22;
    const lampBaseRing = new Mesh(new TorusGeometry(0.34, 0.04, 12, 26), darkMaterial);
    lampBaseRing.position.y = 0.12;
    lampBaseRing.rotation.x = Math.PI / 2;
    const lampNeck = new Mesh(new CylinderGeometry(0.12, 0.14, 0.34, 16), metalMaterial);
    lampNeck.position.y = 0.98;
    const wick = new Mesh(new CylinderGeometry(0.03, 0.04, 0.18, 12), createLabRubberMaterial({ color: 0xceb38b, roughness: 0.96, metalness: 0 }));
    wick.position.y = 1.16;
    const flameOuter = new Mesh(
      new ConeGeometry(0.18, 0.58, 20),
      new MeshBasicMaterial({ color: 0xffb648, transparent: true, opacity: 0.9 }),
    );
    flameOuter.position.y = 1.42;
    flameOuter.visible = false;
    const flameHalo = new Mesh(
      new SphereGeometry(0.2, 18, 18),
      new MeshBasicMaterial({ color: 0xffc76b, transparent: true, opacity: 0.24 }),
    );
    flameHalo.position.y = 1.42;
    flameHalo.scale.set(1.2, 1.6, 1.2);
    flameHalo.visible = false;
    const flameInner = new Mesh(
      new ConeGeometry(0.1, 0.34, 20),
      new MeshBasicMaterial({ color: 0x5ce8ff, transparent: true, opacity: 0.82 }),
    );
    flameInner.position.y = 1.35;
    flameInner.visible = false;
    const burnerLight = new PointLight(0xffbf69, 0, 7.2, 2);
    burnerLight.position.set(0, 1.36, 0);
    lamp.add(lampBody, lampFuel, lampBaseRing, lampNeck, wick, flameOuter, flameHalo, flameInner, burnerLight);
    lamp.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    setInteractive(lamp, 'lamp');
    interactiveObjectsRef.current.push(lamp);
    scene.add(lamp);
    sceneObjectsRef.current.lamp = lamp;
    sceneObjectsRef.current.flameOuter = flameOuter;
    sceneObjectsRef.current.flameInner = flameInner;
    sceneObjectsRef.current.burnerLight = burnerLight;

    const waterTank = new Mesh(new BoxGeometry(2.6, 2.25, 2.1), createLabGlassMaterial({ color: 0xd8f1ff, opacity: 0.16, thickness: 0.92, attenuationDistance: 3.4, attenuationColor: 0xe3f7ff }));
    waterTank.position.set(4.2, 1.15, 0);
    waterTank.castShadow = true;
    waterTank.receiveShadow = true;
    scene.add(waterTank);
    sceneObjectsRef.current.waterTank = waterTank;

    const waterSurface = new Mesh(
      new BoxGeometry(2.34, 1.75, 1.84),
      waterMaterial,
    );
    waterSurface.position.set(4.2, 0.95, 0);
    scene.add(waterSurface);
    const waterTop = new Mesh(new CircleGeometry(1.05, 32), waterSurfaceMaterial);
    waterTop.rotation.x = -Math.PI / 2;
    waterTop.position.set(4.2, 1.84, 0);
    scene.add(waterTop);
    sceneObjectsRef.current.waterSurface = waterSurface;
    sceneObjectsRef.current.waterTop = waterTop;

    const gasBottle = new Group();
    gasBottle.position.set(5.65, 0.1, -1.5);
    const bottleShell = new Mesh(
      new CylinderGeometry(0.5, 0.56, 2.3, 28, 1, true),
      createLabGlassMaterial({ color: 0xb6ebff, opacity: 0.18, transmission: 0.94, thickness: 0.64, side: DoubleSide, attenuationDistance: 2.2, attenuationColor: 0xc7f2ff }),
    );
    bottleShell.position.y = 1.15;
    const bottleRim = new Mesh(new TorusGeometry(0.5, 0.04, 12, 28), glassMaterial);
    bottleRim.position.y = 2.28;
    bottleRim.rotation.x = Math.PI / 2;
    const bottleFill = new Mesh(
      new CylinderGeometry(0.42, 0.48, 1.95, 24),
      createLabLiquidMaterial({ color: 0x9fdcff, opacity: 0.28, transmission: 0.82, thickness: 0.68, attenuationDistance: 0.9, attenuationColor: 0xb7e6ff }),
    );
    bottleFill.position.y = 0.12;
    bottleFill.scale.y = 0.02;
    const bottleMeniscus = new Mesh(
      new CircleGeometry(0.42, 28),
      createLabLiquidSurfaceMaterial({ color: 0xb4e3ff, opacity: 0.42, attenuationColor: 0xc6eeff }),
    );
    bottleMeniscus.rotation.x = -Math.PI / 2;
    bottleMeniscus.position.y = 0.98;
    bottleFill.add(bottleMeniscus);
    gasBottle.add(bottleShell, bottleRim, bottleFill);
    gasBottle.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    setInteractive(gasBottle, 'gas-bottle');
    interactiveObjectsRef.current.push(gasBottle);
    scene.add(gasBottle);
    sceneObjectsRef.current.gasBottle = gasBottle;
    sceneObjectsRef.current.bottleFill = bottleFill;
    sceneObjectsRef.current.bottleMeniscus = bottleMeniscus;

    const sealBulb = new Mesh(new SphereGeometry(0.22, 18, 18), rubberMaterial);
    sealBulb.position.set(2.35, 2.2, 0.18);
    sealBulb.castShadow = true;
    sealBulb.userData = { role: 'equipment', id: 'seal-check' };
    interactiveObjectsRef.current.push(sealBulb);
    scene.add(sealBulb);
    sceneObjectsRef.current.sealBulb = sealBulb;

    let testTubeModelDispose: (() => void) | null = null;
    let lampModelDispose: (() => void) | null = null;
    let oxygenModelsReleased = false;

    void loadLabModelAssetFromManifest('test_tube_standard', {
      scale: 0.74,
      position: [0, 0.06, 0],
    }).then((asset) => {
      if (!asset) return;
      if (oxygenModelsReleased) {
        asset.dispose();
        return;
      }
      testTubeModelDispose = asset.dispose;
      testTube.add(asset.root);
    });

    void loadLabModelAssetFromManifest('alcohol_lamp', {
      scale: 0.76,
      position: [0, 0.02, 0],
    }).then((asset) => {
      if (!asset) return;
      if (oxygenModelsReleased) {
        asset.dispose();
        return;
      }
      lampModelDispose = asset.dispose;
      lamp.add(asset.root);
    });

    Array.from({ length: 28 }).forEach((_, index) => {
      const inWater = index < 18;
      const bubble = new Mesh(
        new SphereGeometry(inWater ? (index % 3 === 0 ? 0.068 : 0.05 + (index % 4) * 0.004) : 0.042 + (index % 3) * 0.006, 14, 14),
        bubbleMaterial,
      );
      bubble.visible = false;
      scene.add(bubble);
      bubbleParticlesRef.current.push({
        mesh: bubble,
        offset: index * 0.09,
        lane: inWater ? 'water' : 'bottle',
        speed: inWater ? 0.00052 + (index % 5) * 0.00004 : 0.00066 + (index % 4) * 0.00005,
        sway: inWater ? 0.1 + (index % 4) * 0.02 : 0.06 + (index % 3) * 0.016,
        drift: inWater ? -0.12 + (index % 6) * 0.05 : -0.08 + (index % 5) * 0.04,
        scale: 0.82 + (index % 6) * 0.08,
        phase: index * 0.62,
      });
    });

    const updateRayFromEvent = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
    };

    const getHitInfo = (): HitInfo | null => {
      const hits = raycasterRef.current.intersectObjects(interactiveObjectsRef.current, true);
      const visibleHit = hits.find((item) => isVisibleObject(item.object));
      if (!visibleHit) return null;
      let object: Object3D | null = visibleHit.object;
      while (object && !object.userData.role && object.parent) {
        object = object.parent;
      }
      if (!object) return null;
      return {
        role: object.userData.role,
        id: object.userData.id,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateRayFromEvent(event);
      const hitInfo = getHitInfo();
      setHoveredPart(hitInfo?.id ?? null);
      renderer.domElement.style.cursor = hitInfo ? 'pointer' : 'default';
    };

    const handlePointerDown = (event: PointerEvent) => {
      updateRayFromEvent(event);
      const hitInfo = getHitInfo();
      if (!hitInfo?.id) return;

      if (hitInfo.id === 'stand' || hitInfo.id === 'test-tube' || hitInfo.id === 'delivery-tube') {
        handleAssemblePart(hitInfo.id as BasePartId);
        return;
      }

      if (hitInfo.id === 'reagent' || hitInfo.id === 'cotton') {
        handleAddMaterial(hitInfo.id as MaterialId);
        return;
      }

      if (hitInfo.id === 'seal-check') {
        handleSealCheck();
        return;
      }

      if (hitInfo.id === 'lamp') {
        handleStartHeating();
        return;
      }

      if (hitInfo.id === 'gas-bottle') {
        handlePlaceBottle();
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    applyCameraPreset('wide');

    const animate = (time: number) => {
      frameRef.current = window.requestAnimationFrame(animate);
      controls.update();

      if (sceneObjectsRef.current.flameOuter && sceneObjectsRef.current.flameInner) {
        const flameVisible = heatingRef.current;
        sceneObjectsRef.current.flameOuter.visible = flameVisible;
        sceneObjectsRef.current.flameInner.visible = flameVisible;
        const flameHalo = sceneObjectsRef.current.lamp?.children[6] as Mesh | undefined;
        const burnerLight = sceneObjectsRef.current.burnerLight;
        if (flameHalo) flameHalo.visible = flameVisible;
        if (burnerLight) burnerLight.intensity = flameVisible ? 1.58 + Math.sin(time * 0.018) * 0.16 : 0;
        if (flameVisible) {
          const outerScale = 1 + Math.sin(time * 0.012) * 0.08;
          const innerScale = 1 + Math.cos(time * 0.015) * 0.06;
          sceneObjectsRef.current.flameOuter.scale.set(1, outerScale, 1);
          sceneObjectsRef.current.flameInner.scale.set(1, innerScale, 1);
          if (flameHalo) {
            flameHalo.scale.set(1.14 + Math.sin(time * 0.011) * 0.08, 1.52 + Math.sin(time * 0.009) * 0.1, 1.14);
          }
        }
      }

      const heatGlow = sceneObjectsRef.current.heatGlow;
      if (heatGlow) {
        const gasFactor = gasLevelRef.current / 100;
        const material = heatGlow.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = heatingRef.current ? 0.16 + gasFactor * 0.12 + Math.sin(time * 0.01) * 0.05 : 0;
        }
        heatGlow.visible = heatingRef.current;
        heatGlow.scale.set(1 + gasFactor * 0.08 + Math.sin(time * 0.008) * 0.06, 1 + gasFactor * 0.12 + Math.cos(time * 0.008) * 0.08, 1);
      }

      condensationDropsRef.current.forEach((drop, index) => {
        const active = heatingRef.current;
        const gasFactor = gasLevelRef.current / 100;
        drop.visible = active;
        if (!active) return;
        drop.position.x = -0.08 + (index % 3) * 0.08 + Math.sin(time * 0.0012 + index) * 0.01;
        drop.position.y = 1.14 + Math.floor(index / 3) * 0.22 + Math.sin(time * 0.0015 + index * 0.8) * 0.04;
        drop.scale.setScalar(0.78 + gasFactor * 0.44 + Math.sin(time * 0.0014 + index) * 0.08);
      });

      bubbleParticlesRef.current.forEach((particle) => {
        const gasFactor = gasLevelRef.current / 100;
        const collectionFactor = collectionLevelRef.current / 100;
        const waterActive = heatingRef.current || sealPulseRef.current;
        const bottleActive = heatingRef.current && bottlePlacedRef.current;
        const active = particle.lane === 'water' ? waterActive : bottleActive;
        particle.mesh.visible = active;
        if (!active) return;

        const boost = particle.lane === 'water'
          ? (heatingRef.current ? 0.9 + gasFactor * 0.8 : 0.42)
          : 0.94 + collectionFactor * 0.76;
        const progress = (time * particle.speed * boost + particle.offset) % 1;
        const wobble = Math.sin(progress * Math.PI * 2 + particle.phase);
        const pulse = particle.scale * (0.8 + Math.sin(time * 0.0038 + particle.phase) * 0.12 + progress * 0.22);
        particle.mesh.scale.setScalar(pulse);
        const material = particle.mesh.material;
        if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
          material.opacity = particle.lane === 'water'
            ? 0.18 + (1 - progress) * 0.34
            : 0.16 + (1 - progress) * 0.26 + collectionFactor * 0.14;
        }

        if (particle.lane === 'water') {
          particle.mesh.position.set(
            3.34 + progress * 1.14 + wobble * 0.04,
            0.78 + progress * 1.24 + Math.sin(progress * Math.PI * 3 + particle.phase) * 0.04,
            particle.drift + wobble * particle.sway,
          );
          return;
        }

        particle.mesh.position.set(
          4.25 + Math.sin(time * 0.0028 + particle.phase) * 0.03,
          0.9 + progress * 1.72,
          particle.drift * 0.8 + wobble * particle.sway,
        );
      });

      const waterSurface = sceneObjectsRef.current.waterSurface;
      if (waterSurface) {
        waterSurface.position.y = 0.95 + Math.sin(time * 0.0021) * 0.018;
      }
      const waterTop = sceneObjectsRef.current.waterTop;
      if (waterTop) {
        waterTop.position.y = 1.84 + Math.sin(time * 0.0021) * 0.016;
        waterTop.scale.set(1 + Math.sin(time * 0.0018) * 0.012, 1 + Math.cos(time * 0.0017) * 0.012, 1);
      }

      const bottleFill = sceneObjectsRef.current.bottleFill;
      if (bottleFill) {
        const collectionFactor = collectionLevelRef.current / 100;
        const material = bottleFill.material;
        if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
          material.opacity = 0.12 + (1 - collectionFactor) * 0.18 + Math.sin(time * 0.004) * 0.02;
        }
      }
      const bottleMeniscus = sceneObjectsRef.current.bottleMeniscus;
      if (bottleMeniscus) {
        const collectionFactor = collectionLevelRef.current / 100;
        bottleMeniscus.position.y = 0.98 + collectionFactor * 0.04 + Math.sin(time * 0.0046) * 0.02;
        bottleMeniscus.scale.set(1 - collectionFactor * 0.04 + Math.sin(time * 0.0034) * 0.01, 1 - collectionFactor * 0.02, 1);
      }

      renderer.render(scene, camera);
    };

    animate(0);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      setHoveredPart(null);
      controls.dispose();
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      oxygenModelsReleased = true;
      testTubeModelDispose?.();
      lampModelDispose?.();
      realism.dispose();
      renderer.dispose();
      if (mountNode.contains(renderer.domElement)) {
        mountNode.removeChild(renderer.domElement);
      }
      scene.clear();
      interactiveObjectsRef.current = [];
      bubbleParticlesRef.current = [];
      condensationDropsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!assemblyReady || step !== 1) return;
    setStep(2);
    setPrompt(stepCopy[2]);
    setPromptTone('success');
    setCameraPreset('assembly');
  }, [assemblyReady, step]);

  useEffect(() => {
    if (!materialsReady || step !== 2) return;
    setStep(3);
    setPrompt(stepCopy[3]);
    setPromptTone('success');
  }, [materialsReady, step]);

  useEffect(() => {
    if (!sealChecked || step !== 3) return;
    setStep(4);
    setPrompt(stepCopy[4]);
    setPromptTone('success');
  }, [sealChecked, step]);

  useEffect(() => {
    if (!(heating && gasStable) || step !== 4) return;
    setStep(5);
    setPrompt(stepCopy[5]);
    setPromptTone('success');
    setCameraPreset('collection');
  }, [gasStable, heating, step]);

  useEffect(() => {
    if (!(bottlePlaced && collectionDone) || step !== 5) return;
    setStep(6);
    setPrompt(stepCopy[6]);
    setPromptTone('success');
  }, [bottlePlaced, collectionDone, step]);

  useEffect(() => {
    if (!sealPulse) return;
    const timer = window.setTimeout(() => setSealPulse(false), 1200);
    return () => window.clearTimeout(timer);
  }, [sealPulse]);

  useEffect(() => {
    if (!heating || completed) return;
    const timer = window.setInterval(() => {
      setGasLevel((current) => Math.min(100, current + 2.6));
      setCollectionLevel((current) => {
        if (!bottlePlacedRef.current || !gasStable) return current;
        return Math.min(100, current + 3.8);
      });
    }, 140);
    return () => window.clearInterval(timer);
  }, [completed, gasStable, heating]);

  useEffect(() => {
    applyCameraPreset(cameraPreset);
  }, [cameraPreset]);

  useEffect(() => {
    const { stand, testTube, deliveryTube, reagentJar, cottonBox, sealBulb, lamp, burnerLight, waterSurface, waterTop, gasBottle, bottleFill, bottleMeniscus, heatGlow, stopper, powder, cottonPlug } = sceneObjectsRef.current;

    if (stand) {
      stand.position.set(assembledParts.includes('stand') ? -1.5 : -4.8, 0, assembledParts.includes('stand') ? 0 : -2.4);
    }

    if (testTube) {
      if (assembledParts.includes('test-tube')) {
        testTube.position.set(-0.2, 2.18, 0.02);
        testTube.rotation.z = 1.18;
      } else {
        testTube.position.set(-2.9, 0.66, -2.3);
        testTube.rotation.z = 0.12;
      }
    }

    if (deliveryTube) {
      if (assembledParts.includes('delivery-tube')) {
        deliveryTube.position.set(0.12, 1.86, 0.04);
        deliveryTube.rotation.y = 0;
        deliveryTube.scale.setScalar(1.24);
      } else {
        deliveryTube.position.set(-1.4, 0.3, -2.2);
        deliveryTube.rotation.y = -0.35;
        deliveryTube.scale.setScalar(1);
      }
    }

    if (powder) {
      powder.visible = addedMaterials.includes('reagent');
      powder.scale.setScalar(addedMaterials.includes('reagent') ? 1 : 0.92);
    }

    if (cottonPlug) {
      cottonPlug.visible = addedMaterials.includes('cotton');
    }

    if (stopper) {
      stopper.visible = assembledParts.includes('delivery-tube');
    }

    if (gasBottle) {
      if (bottlePlaced) {
        gasBottle.position.set(4.28, 0.06, 0.02);
        gasBottle.rotation.z = Math.PI;
      } else {
        gasBottle.position.set(5.65, 0.1, -1.5);
        gasBottle.rotation.z = 0;
      }
    }

    if (bottleFill) {
      const scaleY = Math.max(0.02, collectionLevel / 100);
      bottleFill.scale.y = scaleY;
      bottleFill.position.y = -0.87 + 0.98 * scaleY;
    }

    if (bottleMeniscus) {
      bottleMeniscus.visible = bottlePlaced;
    }

    if (waterSurface) {
      const material = waterSurface.material;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        material.opacity = bottlePlaced ? 0.36 : 0.3;
      }
    }

    if (waterTop) {
      const material = waterTop.material;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        material.opacity = bottlePlaced ? 0.52 : 0.46;
      }
    }

    if (heatGlow) {
      heatGlow.visible = heating;
    }

    if (burnerLight) {
      burnerLight.color.set(heating ? 0xffc875 : 0xb2d1ff);
    }

    applyGlow(stand, hoveredPart === 'stand' ? 0x72f5ff : step === 1 && !assembledParts.includes('stand') ? 0x103149 : assembledParts.includes('stand') ? 0x1e5b4e : 0x000000, hoveredPart === 'stand' ? 0.94 : step === 1 && !assembledParts.includes('stand') ? 0.35 : assembledParts.includes('stand') ? 0.65 : 0.06);
    applyGlow(testTube, hoveredPart === 'test-tube' ? 0x72f5ff : step === 1 && !assembledParts.includes('test-tube') ? 0x103149 : assembledParts.includes('test-tube') ? 0x1e5b4e : heating ? 0x5c2400 : 0x000000, hoveredPart === 'test-tube' ? 0.94 : step === 1 && !assembledParts.includes('test-tube') ? 0.35 : assembledParts.includes('test-tube') ? 0.65 : heating ? 0.18 : 0.06);
    applyGlow(deliveryTube, hoveredPart === 'delivery-tube' ? 0x72f5ff : step === 1 && !assembledParts.includes('delivery-tube') ? 0x103149 : assembledParts.includes('delivery-tube') ? 0x1e5b4e : heating ? 0x0d4966 : 0x000000, hoveredPart === 'delivery-tube' ? 0.94 : step === 1 && !assembledParts.includes('delivery-tube') ? 0.35 : assembledParts.includes('delivery-tube') ? 0.6 : heating ? 0.34 : 0.06);
    applyGlow(reagentJar, hoveredPart === 'reagent' ? 0x72f5ff : step === 2 && !addedMaterials.includes('reagent') ? 0x15485a : addedMaterials.includes('reagent') ? 0x1e5b4e : 0x000000, hoveredPart === 'reagent' ? 0.94 : step === 2 && !addedMaterials.includes('reagent') ? 0.4 : addedMaterials.includes('reagent') ? 0.62 : 0.06);
    applyGlow(cottonBox, hoveredPart === 'cotton' ? 0x72f5ff : step === 2 && !addedMaterials.includes('cotton') ? 0x15485a : addedMaterials.includes('cotton') ? 0x1e5b4e : 0x000000, hoveredPart === 'cotton' ? 0.94 : step === 2 && !addedMaterials.includes('cotton') ? 0.4 : addedMaterials.includes('cotton') ? 0.62 : 0.06);
    applyGlow(lamp, hoveredPart === 'lamp' ? 0xffd26a : step >= 4 ? (heating ? 0x6d3f00 : 0x103149) : 0x000000, hoveredPart === 'lamp' ? 0.96 : step >= 4 ? (heating ? 0.7 : 0.3) : 0.06);
    applyGlow(gasBottle, hoveredPart === 'gas-bottle' ? 0x72f5ff : step === 5 && !bottlePlaced ? 0x15485a : bottlePlaced ? 0x1e5b4e : 0x000000, hoveredPart === 'gas-bottle' ? 0.96 : step === 5 && !bottlePlaced ? 0.4 : bottlePlaced ? 0.72 : 0.06);

    if (sealBulb) {
      const material = sealBulb.material;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        const active = step === 3 || sealChecked;
        material.emissive = new Color(sealChecked ? 0x1e5b4e : active ? 0x103149 : 0x000000);
        material.emissiveIntensity = sealChecked ? 0.7 : active ? 0.32 : 0.08;
        sealBulb.scale.setScalar(sealPulse ? 1.12 : 1);
      }
    }
  }, [addedMaterials, assembledParts, bottlePlaced, collectionLevel, heating, hoveredPart, sealChecked, sealPulse, step]);

  const oxygenSceneHint = step <= 3
    ? '先按规范完成装置、加药和气密性检查；气密性不过关时不能直接加热。'
    : step === 4
      ? '开始加热后先观察导管口气泡，只有当气泡连续均匀时才适合开始收集。'
      : '收集时保持装置稳定，完成后再根据规范总结关键注意事项。';
  const oxygenWorkbenchStatus = completed
    ? '制氧流程已闭环：装置、加药、检漏、加热、收集与规范总结全部完成。'
    : step === 1
      ? '先搭好铁架台、试管和导管，再进入后续步骤。'
      : step === 2
        ? '药品和棉花都要加入，才能继续检查气密性。'
        : step === 3
          ? '正式加热前必须完成检漏，确保后续气泡连续稳定。'
          : step === 4
            ? '开始加热后先盯气泡，不要过早把集气瓶放入水槽。'
            : step === 5
              ? '只有导管口气泡连续均匀后，才适合开始收集氧气。'
              : '请同时总结检漏、收集时机与结束顺序三个关键点。';
  const oxygenCompletionCopy = completed
    ? '实验已完成，当前版本支持装置搭建、加药、气密性检查、加热观察、排水集气和规范总结。'
    : '完成全部 6 个步骤后，这里会输出本次制氧实验的规范总结。';
  const oxygenRecoveryList = errors === 0
    ? [
        '先完成装置搭建与加药，再做气密性检查。',
        '加热后先观察导管口气泡，连续均匀再开始收集。',
        '结束时应先移导管再熄灭酒精灯，避免倒吸。',
      ]
    : [
        step <= 2 ? '请先补齐当前装置或材料，后续步骤会自动解锁。' : step === 3 ? '气密性不过关时不能加热。' : step === 4 ? '先观察气泡稳定度，再决定是否开始收集。' : '重新核对气泡稳定、收集时机和结束顺序。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请按规范完成制氧流程。',
        '舞台支持直接点击器材推进，也可使用下方工作台按钮。',
      ];

  return (
    <section className="playground-panel panel oxygen-stage-first-panel oxygen-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属化学制氧页</h2>
          <p>把 3D 制氧装置完整保留在中央舞台，按钮、结论和辅助信息统一下沉到工作台，不再压住实验台面。</p>
        </div>
        <div className="badge-row compact">
          <span className="badge badge-demo">真实可操作 3D</span>
          <span className="badge">步骤 {step}/6</span>
          <span className="badge">产气 {Math.round(gasLevel)}%</span>
          <span className="badge">收集 {Math.round(collectionLevel)}%</span>
          <span className="badge">得分 {score}</span>
        </div>
      </div>

      <div className="playground-grid chemistry-grid oxygen-grid">
        <aside className="playground-side oxygen-side-rail oxygen-side-rail-left">
          <section className="info-card oxygen-rail-card">
            <span className="eyebrow">Assembly</span>
            <h3>装置搭建</h3>
            <div className="equipment-list">
              {basePartOrder.map((part) => (
                <span className={assembledParts.includes(part) ? 'equipment-tag identified' : 'equipment-tag'} key={part}>
                  {partLabels[part]}
                </span>
              ))}
            </div>
          </section>

          <section className="info-card oxygen-rail-card">
            <span className="eyebrow">Materials</span>
            <h3>药品与辅材</h3>
            <div className="equipment-list">
              {materialOrder.map((item) => (
                <span className={addedMaterials.includes(item) ? 'equipment-tag identified' : 'equipment-tag'} key={item}>
                  {materialLabels[item]}
                </span>
              ))}
            </div>
          </section>
        </aside>

        <section className="scene-panel oxygen-workbench-stage">
          <div className="scene-toolbar oxygen-workbench-toolbar">
            <div className="oxygen-toolbar-head">
              <div className="oxygen-toolbar-kicker">制氧工作台</div>
              <strong>{experiment.title}</strong>
              <p className="oxygen-toolbar-copy">中央舞台只保留制氧装置和收集过程，提示、操作和总结统一下沉到底部工作台。</p>
            </div>
            <div className="camera-actions oxygen-camera-actions">
              <button className={cameraPreset === 'wide' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('wide')} type="button">全景台面</button>
              <button className={cameraPreset === 'assembly' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('assembly')} type="button">装置近景</button>
              <button className={cameraPreset === 'collection' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('collection')} type="button">集气近景</button>
            </div>
          </div>

          <div className="scene-meta-strip oxygen-stage-meta">
            <div className={`oxygen-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>步骤 {step} · {stepTitles[step]}</strong>
              <p>{prompt}</p>
            </div>
            <div className="oxygen-step-pills" aria-label="实验步骤概览">
              {oxygenStepOrder.map((stepId) => (
                <span className={step === stepId ? 'oxygen-step-pill active' : step > stepId || (stepId === 6 && completed) ? 'oxygen-step-pill done' : 'oxygen-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="scene-canvas oxygen-scene-canvas">
            <div className="three-stage-mount oxygen-three-mount" ref={mountRef} />
          </div>

          <div className="workbench-inline-dock oxygen-workbench-dock">
            <div className="oxygen-workbench-status-grid">
              <div className={`info-card oxygen-status-card tone-${promptTone}`}>
                <span>当前进度</span>
                <strong>步骤 {step} · {stepTitles[step]}</strong>
                <p>{oxygenWorkbenchStatus}</p>
              </div>
              <div className={`info-card oxygen-status-card ${assemblyReady && materialsReady ? 'tone-success' : ''}`.trim()}>
                <span>装置与加药</span>
                <strong>{assemblyReady ? '装置完整' : '待补齐'} / {materialsReady ? '药品完成' : '待加药'}</strong>
                <p>铁架台、试管、导管 {assembledParts.length}/3 · 药品、棉花 {addedMaterials.length}/2</p>
              </div>
              <div className={`info-card oxygen-status-card ${collectionDone ? 'tone-success' : sceneTone === 'invalid' ? 'tone-error' : ''}`.trim()}>
                <span>产气与收集</span>
                <strong>{gasStable ? '气泡连续均匀' : '仍在预热观察'} / {collectionDone ? '收集完成' : bottlePlaced ? '正在收集' : '待开始收集'}</strong>
                <p>加热 {heating ? '进行中' : '未开始'} · 集气瓶 {bottlePlaced ? '已放入水槽' : '未放入'}</p>
              </div>
              <div className={`info-card oxygen-status-card ${hoveredPartCopy ? 'tone-success' : ''}`.trim()}>
                <span>舞台提示</span>
                <strong>{hoveredPartCopy?.title ?? '点击舞台推进实验'}</strong>
                <p>{hoveredPartCopy?.detail ?? oxygenSceneHint}</p>
              </div>
            </div>

            <div className="oxygen-inline-workbench">
              <section className="info-card oxygen-inline-panel oxygen-workbench-actions">
                <span className="eyebrow">Actions</span>
                <h3>舞台操作与控制</h3>
                <div className="summary-stack generic-choice-stack">
                  {step === 1 ? basePartOrder.map((part) => (
                    <button className={assembledParts.includes(part) ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} key={part} onClick={() => handleAssemblePart(part)} type="button">
                      <strong>放置{partLabels[part]}</strong>
                      <span>{assembledParts.includes(part) ? '已在实验台就位' : '也可直接点击舞台器材完成'}</span>
                    </button>
                  )) : null}

                  {step === 2 ? materialOrder.map((item) => (
                    <button className={addedMaterials.includes(item) ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} key={item} onClick={() => handleAddMaterial(item)} type="button">
                      <strong>加入{materialLabels[item]}</strong>
                      <span>{addedMaterials.includes(item) ? '已加入试管' : '也可直接点击舞台器材完成'}</span>
                    </button>
                  )) : null}

                  {step === 3 ? (
                    <>
                      <button className={sealChecked ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={handleSealCheck} type="button">
                        <strong>完成气密性检查</strong>
                        <span>{sealChecked ? '已检漏，可进入加热' : '点击黑色橡胶球或这里都可以'}</span>
                      </button>
                      <button className={cameraPreset === 'assembly' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => setCameraPreset('assembly')} type="button">
                        <strong>切到装置近景</strong>
                        <span>查看试管、导管和检漏位置。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 4 ? (
                    <>
                      <button className={heating ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={handleStartHeating} type="button">
                        <strong>点燃酒精灯</strong>
                        <span>{heating ? '已开始加热，继续观察气泡' : '开始加热后不要马上收集'}</span>
                      </button>
                      <button className={cameraPreset === 'assembly' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => setCameraPreset('assembly')} type="button">
                        <strong>盯导管口气泡</strong>
                        <span>先看气泡是否连续均匀，再决定是否收集。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 5 ? (
                    <>
                      <button className={bottlePlaced ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={handlePlaceBottle} type="button">
                        <strong>放入集气瓶</strong>
                        <span>{bottlePlaced ? '已进入收集阶段' : '仅在气泡稳定后执行'}</span>
                      </button>
                      <button className={cameraPreset === 'collection' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => setCameraPreset('collection')} type="button">
                        <strong>切到集气近景</strong>
                        <span>观察集气瓶进气与液面变化。</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="info-card oxygen-inline-panel oxygen-observation-panel">
                <span className="eyebrow">Observation</span>
                <h3>实验观察面板</h3>
                <div className="chem-observation-grid oxygen-observation-grid">
                  <div className={gasStable ? 'observation-pill ready' : 'observation-pill'}>导管口气泡：{bubbleVisualLabel}</div>
                  <div className={heating ? 'observation-pill ready' : 'observation-pill'}>加热状态：{heating ? '进行中' : '未开始'}</div>
                  <div className={gasStable ? 'observation-pill ready' : 'observation-pill'}>排空气：{purgePhaseLabel}</div>
                  <div className={collectionDone ? 'observation-pill ready' : 'observation-pill'}>集气瓶：{collectionPhaseLabel}</div>
                </div>
                <div className="oxygen-meter-grid">
                  <div className="oxygen-meter-card">
                    <div className="oxygen-meter-head">
                      <strong>排空气稳定度</strong>
                      <span>{purgeProgress}%</span>
                    </div>
                    <div className="oxygen-meter-track" aria-hidden="true">
                      <span className="oxygen-meter-fill" style={{ width: `${purgeProgress}%` }} />
                    </div>
                    <p>{gasReadoutLabel}</p>
                  </div>
                  <div className="oxygen-meter-card">
                    <div className="oxygen-meter-head">
                      <strong>收集完成度</strong>
                      <span>{Math.round(collectionLevel)}%</span>
                    </div>
                    <div className="oxygen-meter-track" aria-hidden="true">
                      <span className="oxygen-meter-fill oxygen-meter-fill-success" style={{ width: `${Math.round(collectionLevel)}%` }} />
                    </div>
                    <p>{collectionReadoutLabel}</p>
                  </div>
                </div>
                <div className="oxygen-readout-list">
                  {oxygenReadoutRows.map((row) => (
                    <div className="oxygen-readout-row" data-tone={row.tone} key={row.label}>
                      <div className="oxygen-readout-copy">
                        <strong>{row.label}</strong>
                        <small>{row.detail}</small>
                      </div>
                      <span className={row.tone === 'ready' ? 'status-pill ready' : 'status-pill'}>{row.badge}</span>
                    </div>
                  ))}
                </div>
                <div className="detail-list">
                  <div className="detail-row">
                    <div className="detail-copy">
                      <strong>舞台说明</strong>
                      <small>{oxygenSceneHint}</small>
                    </div>
                    <span className={canCollect ? 'status-pill ready' : 'status-pill'}>{canCollect ? '可收集' : '待观察'}</span>
                  </div>
                  <div className="detail-row">
                    <div className="detail-copy">
                      <strong>悬停部件</strong>
                      <small>{hoveredPartCopy?.detail ?? '把鼠标移到装置、药品、酒精灯或集气瓶上，可查看其在制氧流程中的作用。'}</small>
                    </div>
                    <span className={hoveredPartCopy ? 'status-pill ready' : 'status-pill'}>{hoveredPartCopy?.title ?? '无'}</span>
                  </div>
                </div>
              </section>
            </div>

            {step === 6 ? (
              <section className="oxygen-summary-dock">
                <div className="oxygen-summary-head">
                  <div>
                    <span>Summary</span>
                    <strong>选择正确操作规范</strong>
                  </div>
                  <span className="badge">舞台下提交结论</span>
                </div>
                <div className="oxygen-choice-row">
                  <button className={summaryChoice === 'lamp-first' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => setSummaryChoice('lamp-first')} type="button">
                    <strong>一有气泡就立刻收集，结束时先熄灭酒精灯再移导管</strong>
                    <span>错误演示：收集过早且结束顺序不规范。</span>
                  </button>
                  <button className={summaryChoice === 'stable-bubbles-then-collect' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => setSummaryChoice('stable-bubbles-then-collect')} type="button">
                    <strong>先检查气密性，待气泡连续均匀后再收集，结束时先移导管再熄灯</strong>
                    <span>同时覆盖检漏、收集时机和结束顺序。</span>
                  </button>
                  <button className={summaryChoice === 'skip-seal' ? 'summary-choice generic-choice danger active' : 'summary-choice generic-choice danger'} onClick={() => setSummaryChoice('skip-seal')} type="button">
                    <strong>是否漏气影响不大，只要持续加热就能直接收集纯净氧气</strong>
                    <span>错误演示：忽略检漏会影响气体纯度与实验安全。</span>
                  </button>
                </div>
                <button className="action-button oxygen-submit-button" onClick={handleSubmitSummary} type="button" disabled={step !== 6}>
                  提交实验结论
                </button>
              </section>
            ) : null}
          </div>
        </section>

        <aside className="playground-side oxygen-side-rail oxygen-side-rail-right">
          <section className="info-card oxygen-rail-card oxygen-rail-prompt">
            <span className="eyebrow">Hover</span>
            <h3>器材说明</h3>
            <p>{hoveredPartCopy?.detail ?? '当前无悬停器材。把鼠标移到装置、药品、酒精灯或集气瓶上，可查看其在制氧流程中的作用。'}</p>
          </section>

          <section className="info-card oxygen-rail-card">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>装置进度：{assembledParts.length}/3 / 材料进度：{addedMaterials.length}/2</li>
              <li>排空气：{purgePhaseLabel} / 导管口：{bubbleVisualLabel}</li>
              <li>集气瓶：{collectionPhaseLabel} / 收集 {Math.round(collectionLevel)}%</li>
              <li>当前判定：{step <= 3 ? '先完成前置步骤' : canCollect ? '可以开始收集' : step === 4 ? '继续观察气泡' : step === 5 ? '保持稳定收集' : '核对最终规范'}</li>
            </ul>
          </section>

          <section className="info-card oxygen-rail-card oxygen-rail-prompt">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {oxygenRecoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`info-card oxygen-rail-card oxygen-rail-prompt ${completed ? 'tone-success' : promptTone === 'error' ? 'tone-error' : ''}`.trim()}>
            <span className="eyebrow">Control</span>
            <h3>实验控制</h3>
            <p>{oxygenCompletionCopy}</p>
            <div className="button-stack">
              <button className="action-button ghost" onClick={handleResetLab} type="button">重置化学实验</button>
            </div>
            <small>{oxygenSceneHint}</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
