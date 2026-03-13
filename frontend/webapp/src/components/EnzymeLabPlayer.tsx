import { useEffect, useMemo, useRef, useState } from 'react';
import { AmbientLight, BoxGeometry, CircleGeometry, Color, CylinderGeometry, DirectionalLight, Fog, Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import { createSimulationRuntimeSnapshot, type SimulationRuntimeSnapshot } from '../lib/simulationRuntime';
import type { ExperimentConfig } from '../types/experiment';
import { attachLabRealism, createLabCeramicMaterial, createLabCoatedMetalMaterial, createLabGlassMaterial, createLabLiquidMaterial, createLabLiquidSurfaceMaterial, createLabPlasticMaterial, createLabWoodMaterial } from '../lib/threeRealism';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'wide' | 'top' | 'focus';
type VariableChoice = 'temperature' | 'ph';
type RackSlotId = 'control' | 'experiment_low' | 'experiment_high';
type ReagentId = 'substrate' | 'enzyme';

interface EnzymeLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
  onSimulationRuntimeChange?: (snapshot: SimulationRuntimeSnapshot | null) => void;
}

interface HitInfo {
  role?: string;
  id?: string;
}

interface TubeVisual {
  group: Group;
  liquid: Mesh;
  foam: Mesh;
  foamCap: Mesh;
  bubbles: Group;
}

const stepCopy: Record<StepId, string> = {
  1: '先选择一个单一变量，只研究温度或 pH 其中之一。',
  2: '点击试管架中的三个位置，放置对照组和实验组。',
  3: '点击底物瓶和酶液瓶，把反应液加入各组试管。',
  4: '点击计时器开始反应，观察不同条件下泡沫高度变化。',
  5: '根据结果记录并总结，提交酶活性结论。',
};

const stepTitles: Record<StepId, string> = {
  1: '选择实验变量',
  2: '设置对照组',
  3: '加入反应液',
  4: '观察反应变化',
  5: '记录并总结',
};

const slotLabels: Record<RackSlotId, string> = {
  control: '对照组',
  experiment_low: '实验组 A',
  experiment_high: '实验组 B',
};

const reagentLabels: Record<ReagentId, string> = {
  substrate: '底物',
  enzyme: '酶液',
};

const variableChoiceLabels: Record<VariableChoice, string> = {
  temperature: '温度',
  ph: 'pH',
};

const cameraPresetLabels: Record<CameraPreset, string> = {
  wide: '台面全景',
  top: '俯视分组',
  focus: '聚焦试管',
};

const summaryChoiceLabels: Record<string, string> = {
  '': '未选择',
  'multiple-variables': '同时改变多个变量',
  'optimum-condition': '适宜条件活性最高',
  'always-increase': '条件越极端活性越高',
};

const enzymeStepOrder: StepId[] = [1, 2, 3, 4, 5];
const slotOrder: RackSlotId[] = ['control', 'experiment_low', 'experiment_high'];
const reagentOrder: ReagentId[] = ['substrate', 'enzyme'];

const enzymeHoverCopy: Record<string, { title: string; detail: string }> = {
  control: { title: '对照组', detail: '对照组保持适宜条件，用来作为判断酶活性强弱的基准。' },
  experiment_low: { title: '实验组 A', detail: '通过降低目标变量，比较酶活性是否下降。' },
  experiment_high: { title: '实验组 B', detail: '通过升高目标变量，观察酶活性是否被抑制。' },
  substrate: { title: '底物瓶', detail: '各组底物应保持一致，避免额外变量干扰结果。' },
  enzyme: { title: '酶液瓶', detail: '酶液加入后才会启动分解反应，产生更明显的泡沫。' },
  timer: { title: '计时器', detail: '同一时长下比较泡沫高度，才能公平评估不同条件下的反应速率。' },
};

function isVisibleObject(object: Object3D) {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
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

export function EnzymeLabPlayer({ experiment, onTelemetry, onSimulationRuntimeChange }: EnzymeLabPlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameRef = useRef<number | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const interactiveObjectsRef = useRef<Object3D[]>([]);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const slotMeshesRef = useRef<Record<RackSlotId, Mesh | null>>({
    control: null,
    experiment_low: null,
    experiment_high: null,
  });
  const bottleObjectsRef = useRef<Record<ReagentId, Group | null>>({
    substrate: null,
    enzyme: null,
  });
  const tubeVisualsRef = useRef<Record<RackSlotId, TubeVisual | null>>({
    control: null,
    experiment_low: null,
    experiment_high: null,
  });
  const timerObjectRef = useRef<Group | null>(null);
  const panelObjectRef = useRef<Group | null>(null);
  const stepRef = useRef<StepId>(1);
  const timerRunningRef = useRef(false);
  const variableChoiceRef = useRef<VariableChoice | null>(null);
  const placedSlotsRef = useRef<RackSlotId[]>([]);
  const addedReagentsRef = useRef<ReagentId[]>([]);
  const reactionFinishedRef = useRef(false);

  const [step, setStep] = useState<StepId>(1);
  const [variableChoice, setVariableChoice] = useState<VariableChoice | null>(null);
  const [placedSlots, setPlacedSlots] = useState<RackSlotId[]>([]);
  const [addedReagents, setAddedReagents] = useState<ReagentId[]>([]);
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('wide');
  const [prompt, setPrompt] = useState(stepCopy[1]);
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);

  const score = Math.max(74, 100 - errors * 5);
  const rackReady = placedSlots.length === slotOrder.length;
  const reagentsReady = addedReagents.length === reagentOrder.length;
  const reactionProgress = Math.min(1, elapsedSeconds / 8);
  const reactionFinished = reactionProgress >= 1;
  const reactionResults = useMemo(() => {
    if (variableChoice === 'temperature') {
      return {
        control: 0.92,
        experiment_low: 0.48,
        experiment_high: 0.2,
      } as Record<RackSlotId, number>;
    }

    return {
      control: 0.88,
      experiment_low: 0.28,
      experiment_high: 0.34,
    } as Record<RackSlotId, number>;
  }, [variableChoice]);

  const conditionLabels = useMemo(() => {
    if (variableChoice === 'temperature') {
      return {
        control: '37°C',
        experiment_low: '20°C',
        experiment_high: '60°C',
      } as Record<RackSlotId, string>;
    }

    return {
      control: 'pH 7',
      experiment_low: 'pH 3',
      experiment_high: 'pH 10',
    } as Record<RackSlotId, string>;
  }, [variableChoice]);

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
  const hoveredPartCopy = hoveredPart ? enzymeHoverCopy[hoveredPart] : null;
  const variableLabel = variableChoice ? variableChoiceLabels[variableChoice] : '未选择';
  const groupingStatusLabel = rackReady ? '分组完成' : `分组 ${placedSlots.length}/${slotOrder.length}`;
  const reagentStatusLabel = reagentsReady ? '加样完成' : `加样 ${addedReagents.length}/${reagentOrder.length}`;
  const reactionStatusLabel = reactionFinished ? '结果已稳定' : timerRunning ? '反应进行中' : step >= 4 ? '待启动计时' : '未开始反应';

  const enzymeSimulationRuntime = useMemo(() => {
    const phaseProgress = (() => {
      if (step === 1) return variableChoice ? 0.18 : 0;
      if (step === 2) return (placedSlots.length / slotOrder.length) * 0.18;
      if (step === 3) return (addedReagents.length / reagentOrder.length) * 0.18;
      if (step === 4) return reactionProgress * 0.18;
      if (!summaryChoice) return 0;
      return summaryChoice === 'optimum-condition' ? 0.18 : 0.09;
    })();
    const highestActivitySlot = slotOrder.reduce<RackSlotId>((best, slotId) => (reactionResults[slotId] > reactionResults[best] ? slotId : best), 'control');

    return createSimulationRuntimeSnapshot({
      playerId: 'enzyme-lab-player',
      phaseLabel: stepTitles[step],
      phaseState: completed ? 'completed' : 'active',
      progress: completed ? 1 : Math.min(0.97, ((step - 1) / 5) + phaseProgress),
      focusTarget: hoveredPartCopy?.title ?? (cameraPreset === 'top' ? '三组试管架布局' : cameraPreset === 'focus' ? '三组试管泡沫对比' : '酶活性实验台'),
      focusLens: cameraPreset === 'wide' ? 'macro' : 'meso',
      stateSummary: `${variableLabel}变量 · ${groupingStatusLabel} · ${reactionStatusLabel}`,
      observables: [
        { key: 'selected-variable', label: '单一变量', value: variableLabel, status: variableChoice ? 'nominal' : 'critical' },
        { key: 'reaction-progress', label: '反应进度', value: Math.round(reactionProgress * 100), unit: '%', status: reactionFinished ? 'nominal' : timerRunning ? 'warning' : 'critical' },
        { key: 'control-foam', label: `${slotLabels.control}泡沫`, value: Math.round(reactionResults.control * reactionProgress * 100), unit: '%', status: reactionFinished ? 'nominal' : timerRunning ? 'warning' : 'critical' },
        { key: 'experiment-low-foam', label: `${slotLabels.experiment_low}泡沫`, value: Math.round(reactionResults.experiment_low * reactionProgress * 100), unit: '%', status: reactionFinished ? 'nominal' : timerRunning ? 'warning' : 'critical' },
        { key: 'experiment-high-foam', label: `${slotLabels.experiment_high}泡沫`, value: Math.round(reactionResults.experiment_high * reactionProgress * 100), unit: '%', status: reactionFinished ? 'nominal' : timerRunning ? 'warning' : 'critical' },
        { key: 'timer-state', label: '计时器', value: reactionStatusLabel, status: reactionFinished ? 'nominal' : timerRunning ? 'warning' : 'critical' },
      ],
      controls: [
        { key: 'variable-selection', label: '变量选择', value: variableLabel, kind: 'discrete' },
        { key: 'grouping-state', label: '分组状态', value: groupingStatusLabel, kind: 'discrete' },
        { key: 'reagent-state', label: '加样状态', value: reagentStatusLabel, kind: 'discrete' },
        { key: 'timer-toggle', label: '计时器', value: timerRunning ? '运行中' : reactionFinished ? '已完成' : '待启动', kind: 'toggle' },
        { key: 'camera-preset', label: '镜头机位', value: cameraPresetLabels[cameraPreset], kind: 'discrete' },
        { key: 'summary-choice', label: '结论选择', value: summaryChoiceLabels[summaryChoice] ?? '未选择', kind: 'discrete' },
      ],
      phases: enzymeStepOrder.map((stepId) => ({
        key: `step-${stepId}`,
        label: stepTitles[stepId],
        state: completed || step > stepId || (stepId === 5 && completed) ? 'completed' : step === stepId ? 'active' : 'pending',
      })),
      failureRisks: [
        !variableChoice ? '尚未锁定单一变量，后续结果无法被解释为有效对照。' : '',
        step >= 2 && !rackReady ? '对照组和实验组尚未完整摆放，变量控制还不成立。' : '',
        step >= 3 && !reagentsReady ? '各组尚未同步加入底物与酶液，反应不能公平比较。' : '',
        timerRunning && !reactionFinished ? '计时尚未结束，当前泡沫高度还不是最终读数。' : '',
        step === 5 && summaryChoice && summaryChoice !== 'optimum-condition' ? '当前结论与实验结果不一致，适宜条件组才是最高活性。' : '',
      ],
      trace: [
        '选择单一变量 -> 建立对照组/实验组 -> 同步加底物和酶液 -> 统一计时 -> 比较泡沫高度',
        variableChoice ? `当前研究变量：${variableLabel}` : '尚未锁定单一变量',
        reactionFinished ? `最高泡沫出现在${slotLabels[highestActivitySlot]}（${conditionLabels[highestActivitySlot]}）` : timerRunning ? '反应进行中，三组泡沫高度仍在变化' : '尚未开始统一计时',
        completed ? '结论已提交：适宜条件下酶活性最高' : summaryChoice ? `当前结论选择：${summaryChoiceLabels[summaryChoice]}` : '等待选择实验结论',
      ],
    });
  }, [
    addedReagents.length,
    cameraPreset,
    completed,
    conditionLabels,
    groupingStatusLabel,
    hoveredPartCopy?.title,
    placedSlots.length,
    reactionFinished,
    reactionProgress,
    reactionResults,
    reactionStatusLabel,
    reagentStatusLabel,
    summaryChoice,
    step,
    timerRunning,
    variableChoice,
    variableLabel,
  ]);

  useEffect(() => {
    stepRef.current = step;
    timerRunningRef.current = timerRunning;
    variableChoiceRef.current = variableChoice;
    placedSlotsRef.current = placedSlots;
    addedReagentsRef.current = addedReagents;
    reactionFinishedRef.current = reactionFinished;
  }, [addedReagents, placedSlots, reactionFinished, step, timerRunning, variableChoice]);

  useEffect(() => {
    onSimulationRuntimeChange?.(enzymeSimulationRuntime);
  }, [enzymeSimulationRuntime, onSimulationRuntimeChange]);

  useEffect(() => () => {
    onSimulationRuntimeChange?.(null);
  }, [onSimulationRuntimeChange]);

  const applyCameraPreset = (preset: CameraPreset) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = new Vector3(0, 1.75, 0);
    const position = new Vector3(7.8, 6.5, 8.2);

    if (preset === 'top') {
      target.set(0, 1.45, 0);
      position.set(0.01, 12.6, 0.01);
    }

    if (preset === 'focus') {
      target.set(0, 2.2, 0.3);
      position.set(4.4, 4.8, 5.2);
    }

    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  };

  const handleChooseVariable = (next: VariableChoice) => {
    if (step !== 1) return;
    setVariableChoice(next);
    setPrompt(next === 'temperature' ? '已选择温度作为单一变量，接下来布置对照组和实验组。' : '已选择 pH 作为单一变量，接下来布置对照组和实验组。');
    setPromptTone('success');
    setCameraPreset('top');
    setStep(2);
  };

  const handlePlaceSlot = (slotId: RackSlotId) => {
    if (stepRef.current !== 2) return;
    setPlacedSlots((current) => {
      if (current.includes(slotId)) return current;
      const next = [...current, slotId];
      if (next.length === slotOrder.length) {
        setPrompt('三组试管已就位，继续加入底物和酶液。');
        setPromptTone('success');
        setCameraPreset('focus');
      } else {
        setPrompt('继续点击其余空位，完整建立对照组和实验组。');
        setPromptTone('info');
      }
      return next;
    });
  };

  const handleAddReagent = (reagentId: ReagentId) => {
    if (stepRef.current !== 3) return;
    if (placedSlotsRef.current.length !== slotOrder.length) {
      setErrors((value) => value + 1);
      setPrompt('请先完成对照组和实验组摆放，再加入反应液。');
      setPromptTone('error');
      return;
    }

    setAddedReagents((current) => {
      if (current.includes(reagentId)) return current;
      const next = [...current, reagentId];
      if (next.length === reagentOrder.length) {
        setPrompt('反应液加入完成，点击计时器开始观察泡沫变化。');
        setPromptTone('success');
      } else {
        setPrompt(`已加入${reagentLabels[reagentId]}，继续补全另外一种反应液。`);
        setPromptTone('info');
      }
      return next;
    });
  };

  const handleStartReaction = () => {
    if (stepRef.current !== 4) return;
    if (!variableChoiceRef.current || placedSlotsRef.current.length !== slotOrder.length || addedReagentsRef.current.length !== reagentOrder.length) {
      setErrors((value) => value + 1);
      setPrompt('开始反应前，请先完成变量选择、分组和反应液加入。');
      setPromptTone('error');
      return;
    }
    if (timerRunningRef.current || reactionFinishedRef.current) return;

    setTimerRunning(true);
    setPrompt('反应已开始。观察三组泡沫高度差异，并比较适宜条件下的酶活性。');
    setPromptTone('success');
    setCameraPreset('focus');
  };

  const handleResetLab = () => {
    reportReset('酶实验已重置，开始新的变量控制尝试。');
    setStep(1);
    setVariableChoice(null);
    setPlacedSlots([]);
    setAddedReagents([]);
    setTimerRunning(false);
    setElapsedSeconds(0);
    setCameraPreset('wide');
    setPrompt(stepCopy[1]);
    setPromptTone('info');
    setSummaryChoice('');
    setErrors(0);
    setCompleted(false);
  };

  const handleSubmitSummary = () => {
    if (step !== 5) return;
    if (summaryChoice !== 'optimum-condition') {
      setErrors((value) => value + 1);
      setPrompt('结论还不准确。提示：酶活性在适宜条件最高，过高或过低都会下降。');
      setPromptTone('error');
      return;
    }

    setCompleted(true);
    setPrompt('实验完成。你已完成单一变量控制、观察记录和结论总结。');
    setPromptTone('success');
    setCameraPreset('focus');
  };

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    interactiveObjectsRef.current = [];
    slotMeshesRef.current = { control: null, experiment_low: null, experiment_high: null };
    bottleObjectsRef.current = { substrate: null, enzyme: null };
    tubeVisualsRef.current = { control: null, experiment_low: null, experiment_high: null };
    timerObjectRef.current = null;
    panelObjectRef.current = null;

    const scene = new Scene();
    scene.background = new Color(0x08141f);
    scene.fog = new Fog(0x08141f, 12, 26);
    sceneRef.current = scene;

    const camera = new PerspectiveCamera(40, mountNode.clientWidth / mountNode.clientHeight, 0.1, 100);
    camera.position.set(7.8, 6.5, 8.2);
    camera.lookAt(0, 1.75, 0);
    cameraRef.current = camera;

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    rendererRef.current = renderer;
    mountNode.appendChild(renderer.domElement);

    const realism = attachLabRealism(renderer, scene, { exposure: 1.1, environmentIntensity: 0.94 });

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, 1.75, 0);
    controls.update();
    controlsRef.current = controls;

    scene.add(new AmbientLight(0xffffff, 1.26));
    const directional = new DirectionalLight(0xcfe3ff, 1.5);
    directional.position.set(6, 10, 5);
    directional.castShadow = true;
    directional.shadow.mapSize.set(1536, 1536);
    directional.shadow.bias = -0.00008;
    scene.add(directional);
    const rim = new DirectionalLight(0x38e0c1, 0.4);
    rim.position.set(-6, 6, -6);
    scene.add(rim);

    const table = new Mesh(
      new BoxGeometry(12, 0.6, 7.6),
      createLabWoodMaterial({ color: 0x674633, roughness: 0.74 }),
    );
    table.position.set(0, -0.35, 0);
    table.receiveShadow = true;
    scene.add(table);

    const frame = new Mesh(
      new BoxGeometry(12.3, 0.1, 7.9),
      createLabCoatedMetalMaterial({ color: 0x314e6c, roughness: 0.24, metalness: 0.42 }),
    );
    frame.position.set(0, -0.02, 0);
    scene.add(frame);

    const benchInset = new Mesh(
      new BoxGeometry(11.3, 0.05, 6.9),
      createLabPlasticMaterial({ color: 0x112435, roughness: 0.42, clearcoat: 0.22 }),
    );
    benchInset.position.set(0, 0.02, 0);
    scene.add(benchInset);

    const rack = new Group();
    scene.add(rack);

    const rackBase = new Mesh(
      new BoxGeometry(4.8, 0.24, 1.6),
      createLabCoatedMetalMaterial({ color: 0x324860, roughness: 0.3, metalness: 0.34 }),
    );
    rackBase.position.set(0, 0.2, 0.1);
    rackBase.castShadow = true;
    rack.add(rackBase);

    const slotPositions: Record<RackSlotId, [number, number, number]> = {
      control: [-1.6, 0.34, 0.1],
      experiment_low: [0, 0.34, 0.1],
      experiment_high: [1.6, 0.34, 0.1],
    };

    const createTubeVisual = (slotId: RackSlotId, position: [number, number, number]) => {
      const group = new Group();
      group.position.set(...position);
      const glassMaterial = createLabGlassMaterial({ color: 0xd8f2ff, opacity: 0.18, transmission: 0.96, thickness: 0.44, attenuationDistance: 2.2, attenuationColor: 0xd7f3ff });
      const liquidMaterial = createLabLiquidMaterial({ color: 0x69a7ff, opacity: 0.44, transmission: 0.8, thickness: 0.7, attenuationDistance: 0.96, attenuationColor: 0x7db4ff });
      const foamMaterial = createLabLiquidSurfaceMaterial({ color: 0xf4ffff, opacity: 0.74, transmission: 0.58, thickness: 0.24, roughness: 0.48, attenuationDistance: 0.42, attenuationColor: 0xf6ffff });
      const glass = new Mesh(
        new CylinderGeometry(0.28, 0.28, 2.2, 24, 1, true),
        glassMaterial,
      );
      glass.position.y = 1.1;
      const rim = new Mesh(new TorusGeometry(0.28, 0.02, 12, 24), glassMaterial);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 2.2;
      const liquid = new Mesh(
        new CylinderGeometry(0.22, 0.22, 0.82, 18),
        liquidMaterial,
      );
      liquid.position.y = 0.56;
      liquid.visible = false;
      const liquidTop = new Mesh(
        new CircleGeometry(0.21, 24),
        createLabLiquidSurfaceMaterial({ color: 0x7eb7ff, opacity: 0.52, attenuationColor: 0x8bc0ff }),
      );
      liquidTop.rotation.x = -Math.PI / 2;
      liquidTop.position.y = 0.41;
      liquid.add(liquidTop);
      const foam = new Mesh(
        new CylinderGeometry(0.22, 0.22, 0.8, 18),
        foamMaterial,
      );
      foam.position.y = 1.02;
      foam.scale.y = 0.02;
      foam.visible = false;
      const foamCap = new Mesh(
        new SphereGeometry(0.24, 18, 18),
        foamMaterial.clone(),
      );
      foamCap.scale.set(1, 0.4, 1);
      foamCap.position.y = 1.44;
      foamCap.visible = false;
      const bubbles = new Group();
      Array.from({ length: 5 }).forEach((_, index) => {
        const bubble = new Mesh(
          new SphereGeometry(index % 2 === 0 ? 0.06 : 0.045, 14, 14),
          createLabGlassMaterial({ color: 0xf6ffff, opacity: 0.34, transmission: 0.98, thickness: 0.08, roughness: 0.01, attenuationDistance: 0.28, attenuationColor: 0xf6ffff }),
        );
        bubble.position.set(Math.sin(index) * 0.08, 0.5 + index * 0.14, Math.cos(index) * 0.08);
        bubbles.add(bubble);
      });
      bubbles.visible = false;
      group.add(glass, rim, liquid, foam, foamCap, bubbles);
      group.traverse((child) => {
        child.castShadow = true;
        child.receiveShadow = true;
      });
      rack.add(group);
      tubeVisualsRef.current[slotId] = { group, liquid, foam, foamCap, bubbles };
    };

    slotOrder.forEach((slotId) => {
      const position = slotPositions[slotId];
      const slotMesh = new Mesh(
        new CylinderGeometry(0.4, 0.4, 0.08, 24),
        createLabCoatedMetalMaterial({ color: 0x17314a, roughness: 0.34, metalness: 0.28 }),
      );
      slotMesh.position.set(position[0], position[1], position[2]);
      slotMesh.userData = { role: 'slot', id: slotId };
      slotMesh.castShadow = true;
      slotMesh.receiveShadow = true;
      interactiveObjectsRef.current.push(slotMesh);
      slotMeshesRef.current[slotId] = slotMesh;
      rack.add(slotMesh);
      createTubeVisual(slotId, [position[0], position[1], position[2]]);
    });

    const createBottle = (id: ReagentId, x: number, color: number) => {
      const group = new Group();
      group.position.set(x, 0, 2.3);
      const body = new Mesh(
        new CylinderGeometry(0.42, 0.46, 0.9, 22, 1, true),
        createLabGlassMaterial({ color: 0xd8f2ff, opacity: 0.18, transmission: 0.94, thickness: 0.4, attenuationDistance: 1.8, attenuationColor: 0xd5f0ff }),
      );
      body.position.y = 0.5;
      const base = new Mesh(
        new CylinderGeometry(0.36, 0.4, 0.08, 20),
        createLabGlassMaterial({ color: 0xd8f2ff, opacity: 0.2, transmission: 0.94, thickness: 0.18, attenuationDistance: 1.2, attenuationColor: 0xd5f0ff }),
      );
      base.position.y = 0.08;
      const fill = new Mesh(
        new CylinderGeometry(0.34, 0.34, 0.46, 18),
        createLabLiquidMaterial({ color, opacity: 0.52, transmission: 0.74, thickness: 0.42, attenuationDistance: 0.68, attenuationColor: color }),
      );
      fill.position.y = 0.3;
      const fillTop = new Mesh(
        new CircleGeometry(0.33, 24),
        createLabLiquidSurfaceMaterial({ color, opacity: 0.6, attenuationColor: color }),
      );
      fillTop.rotation.x = -Math.PI / 2;
      fillTop.position.y = 0.23;
      fill.add(fillTop);
      const cap = new Mesh(
        new CylinderGeometry(0.22, 0.22, 0.16, 18),
        createLabPlasticMaterial({ color: 0x243549, roughness: 0.46, clearcoat: 0.16 }),
      );
      cap.position.y = 1.02;
      const label = new Mesh(
        new PlaneGeometry(0.28, 0.18),
        createLabCeramicMaterial({ color: 0xfafcff, roughness: 0.54 }),
      );
      label.position.set(0, 0.52, 0.37);
      group.add(body, base, fill, cap, label);
      group.userData = { role: 'reagent', id };
      group.traverse((child) => {
        child.castShadow = true;
        child.receiveShadow = true;
        child.userData = { role: 'reagent', id };
      });
      bottleObjectsRef.current[id] = group;
      interactiveObjectsRef.current.push(group);
      scene.add(group);
    };

    createBottle('substrate', -2.8, 0xf2d36b);
    createBottle('enzyme', 2.8, 0x59f6b2);

    const timer = new Group();
    const timerBody = new Mesh(
      new BoxGeometry(1.6, 0.38, 1.04),
      createLabPlasticMaterial({ color: 0x243649, roughness: 0.34, clearcoat: 0.22 }),
    );
    timerBody.position.set(4.3, 0.24, -1.8);
    const timerScreen = new Mesh(
      new BoxGeometry(1.18, 0.08, 0.52),
      createLabGlassMaterial({ color: 0x7de8ff, emissive: new Color(0x1f8aa2), emissiveIntensity: 0.6, opacity: 0.42, transmission: 0.88, thickness: 0.12, attenuationDistance: 0.9, attenuationColor: 0x7de8ff }),
    );
    timerScreen.position.set(4.3, 0.38, -1.8);
    timer.add(timerBody, timerScreen);
    timer.userData = { role: 'timer', id: 'timer' };
    timer.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData = { role: 'timer', id: 'timer' };
    });
    interactiveObjectsRef.current.push(timer);
    scene.add(timer);
    timerObjectRef.current = timer;

    const panel = new Group();
    const panelMesh = new Mesh(
      new BoxGeometry(2.2, 1.28, 0.14),
      createLabPlasticMaterial({ color: 0x1d3046, roughness: 0.4, clearcoat: 0.2 }),
    );
    panelMesh.position.set(-4.4, 1.5, -1.6);
    const panelGlow = new Mesh(
      new BoxGeometry(1.7, 0.8, 0.04),
      createLabGlassMaterial({ color: 0x65d9ff, emissive: new Color(0x1d7196), emissiveIntensity: 0.5, opacity: 0.34, transmission: 0.88, thickness: 0.08, attenuationDistance: 0.8, attenuationColor: 0x65d9ff }),
    );
    panelGlow.position.set(-4.4, 1.5, -1.5);
    panel.add(panelMesh, panelGlow);
    scene.add(panel);
    panelObjectRef.current = panel;

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

      if (hitInfo.role === 'slot') {
        handlePlaceSlot(hitInfo.id as RackSlotId);
        return;
      }

      if (hitInfo.role === 'reagent') {
        handleAddReagent(hitInfo.id as ReagentId);
        return;
      }

      if (hitInfo.role === 'timer') {
        handleStartReaction();
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

      Object.values(tubeVisualsRef.current).forEach((visual, visualIndex) => {
        if (!visual) return;
        visual.bubbles.children.forEach((child, index) => {
          child.position.y = 0.44 + ((time * 0.00075 + index * 0.17) % 1) * 0.92;
          child.position.x = Math.sin(time * 0.003 + index * 0.9 + visualIndex) * 0.08;
          child.position.z = Math.cos(time * 0.0025 + index * 0.7 + visualIndex) * 0.08;
        });
        const liquidMaterial = visual.liquid.material;
        if ((liquidMaterial instanceof MeshStandardMaterial || liquidMaterial instanceof MeshPhysicalMaterial) && visual.liquid.visible) {
          liquidMaterial.opacity = 0.38 + Math.sin(time * 0.004 + visualIndex) * 0.04;
        }
        if (visual.foamCap.visible) {
          visual.foamCap.position.y = visual.foam.position.y + Math.max(0.16, visual.foam.scale.y * 0.42);
          visual.foamCap.scale.y = 0.34 + Math.sin(time * 0.006 + visualIndex) * 0.04;
        }
      });

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
      realism.dispose();
      renderer.dispose();
      if (mountNode.contains(renderer.domElement)) {
        mountNode.removeChild(renderer.domElement);
      }
      scene.clear();
      interactiveObjectsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!rackReady || step !== 2) return;
    setStep(3);
    setPrompt(stepCopy[3]);
    setPromptTone('success');
  }, [rackReady, step]);

  useEffect(() => {
    if (!reagentsReady || step !== 3) return;
    setStep(4);
    setPrompt(stepCopy[4]);
    setPromptTone('success');
  }, [reagentsReady, step]);

  useEffect(() => {
    if (timerRunning && reactionFinished) {
      setTimerRunning(false);
      if (step === 4) {
        setStep(5);
        setPrompt('结果已经稳定，请记录各组差异并完成结论。');
        setPromptTone('success');
      }
      return;
    }

    if (!timerRunning) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((current) => Math.min(8, current + 0.2));
    }, 120);
    return () => window.clearInterval(timer);
  }, [reactionFinished, step, timerRunning]);

  useEffect(() => {
    applyCameraPreset(cameraPreset);
  }, [cameraPreset]);

  useEffect(() => {
    slotOrder.forEach((slotId) => {
      const slotMesh = slotMeshesRef.current[slotId];
      const tubeVisual = tubeVisualsRef.current[slotId];
      if (!slotMesh || !tubeVisual) return;

      const placed = placedSlots.includes(slotId);
      const material = slotMesh.material;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        const hovered = hoveredPart === slotId;
        material.color = new Color(hovered ? 0x86f4ff : placed ? 0x2ed47a : step === 2 ? 0x65d9ff : 0x16324d);
        material.emissive = new Color(hovered ? 0x18485b : placed ? 0x0f493d : step === 2 ? 0x103149 : 0x000000);
        material.emissiveIntensity = hovered ? 0.94 : placed ? 0.9 : step === 2 ? 0.36 : 0.08;
      }
      tubeVisual.group.visible = placed;
      tubeVisual.liquid.visible = placed && reagentsReady;
      tubeVisual.foam.visible = placed && (timerRunning || reactionFinished);
      tubeVisual.foamCap.visible = tubeVisual.foam.visible;
      tubeVisual.bubbles.visible = placed && timerRunning;
      if (tubeVisual.foam.visible) {
        const target = reactionResults[slotId] * reactionProgress;
        tubeVisual.foam.scale.y = Math.max(0.04, target);
        tubeVisual.foam.position.y = 1.02 + target * 0.34;
        tubeVisual.foamCap.position.y = tubeVisual.foam.position.y + Math.max(0.16, target * 0.26);
      } else {
        tubeVisual.foam.scale.y = 0.02;
      }
    });

    reagentOrder.forEach((reagentId) => {
      const bottle = bottleObjectsRef.current[reagentId];
      if (!bottle) return;
      const hovered = hoveredPart === reagentId;
      applyGlow(bottle, hovered ? 0x72f5ff : addedReagents.includes(reagentId) ? 0x1e5b4e : step === 3 ? 0x103149 : 0x000000, hovered ? 0.94 : addedReagents.includes(reagentId) ? 0.7 : step === 3 ? 0.34 : 0.08);
    });

    if (timerObjectRef.current) {
      applyGlow(timerObjectRef.current, hoveredPart === 'timer' ? 0x72f5ff : timerRunning || reactionFinished ? 0x1d6b79 : step === 4 ? 0x103149 : 0x000000, hoveredPart === 'timer' ? 0.96 : timerRunning || reactionFinished ? 0.72 : step === 4 ? 0.34 : 0.08);
    }

    if (panelObjectRef.current) {
      applyGlow(panelObjectRef.current, variableChoice ? 0x1d6b79 : step === 1 ? 0x103149 : 0x000000, variableChoice ? 0.5 : step === 1 ? 0.34 : 0.08);
    }
  }, [addedReagents, cameraPreset, hoveredPart, placedSlots, reactionFinished, reactionProgress, reactionResults, reagentsReady, step, timerRunning, variableChoice]);

  const sceneNoteTone = promptTone === 'error' ? 'invalid' : reactionFinished || completed ? 'valid' : 'neutral';
  const highestResultSlot = slotOrder.reduce<RackSlotId>((best, slotId) => (reactionResults[slotId] > reactionResults[best] ? slotId : best), 'control');
  const enzymeSceneHint = step <= 2
    ? '先锁定单一变量，再完整建立对照组和实验组。'
    : step === 3
      ? '加样阶段要保证三组都加入同样的底物和酶液，只改变目标变量。'
      : step === 4
        ? '统一计时后再比较三组泡沫高度，避免提前下结论。'
        : '根据最终泡沫差异总结：适宜条件下酶活性最高。';
  const enzymeWorkbenchStatus = completed
    ? '变量控制、分组、加样、计时观察与结论总结都已完成。'
    : step === 1
      ? '先从温度或 pH 中选定一个单一变量。'
      : step === 2
        ? '先把对照组和两组实验组放齐，再进入加样。'
        : step === 3
          ? '底物和酶液都要同步加入，才能形成公平比较。'
          : step === 4
            ? '启动统一计时，盯三组泡沫高度的分化过程。'
            : '结果已稳定，进入记录和结论总结。';
  const enzymeCompletionCopy = completed
    ? '实验已完成，当前版本支持单一变量控制、三组对照、连续泡沫变化和结论归纳。'
    : '完成全部 5 个步骤后，这里会输出本次酶活性实验的完整总结。';
  const enzymeRecoveryList = errors === 0
    ? [
        '每次只研究一个变量，先确定温度或 pH 其中之一。',
        '三组都要加入相同底物和酶液，再启动统一计时。',
        '最终要比较适宜条件与偏高、偏低条件下的泡沫差异。',
      ]
    : [
        step <= 2 ? '先完成单一变量选择和三组摆放，再继续推进实验。' : step === 3 ? '不要漏加任一种反应液，三组必须同步加样。' : step === 4 ? '计时结束前不要提前下结论。' : '重新核对哪一组在适宜条件下泡沫最高。',
        experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请按变量控制原则重新检查实验流程。',
        '舞台支持直接点击试管位、试剂瓶和计时器，也可使用下方工作台按钮。',
      ];
  const getConditionLabel = (slotId: RackSlotId) => (variableChoice ? conditionLabels[slotId] : '待选择变量');
  const getFoamPercent = (slotId: RackSlotId) => Math.round(reactionResults[slotId] * reactionProgress * 100);
  const bestConditionCopy = reactionFinished
    ? `${slotLabels[highestResultSlot]}在${getConditionLabel(highestResultSlot)}时泡沫最高，说明更接近酶的适宜条件。`
    : timerRunning
      ? '反应仍在进行，继续比较三组泡沫高度变化。'
      : '等待启动计时反应后，再比较三组泡沫差异。';

  return (
    <section className="playground-panel panel enzyme-stage-first-panel enzyme-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Dedicated Lab</span>
          <h2>{experiment.title} · 专属酶活性实验页</h2>
          <p>把变量控制、三组对照和泡沫结果对比集中到中央舞台与下方工作台，减少信息分散和长页切换。</p>
        </div>
        <div className="badge-row compact">
          <span className="badge badge-demo">真实可操作 3D</span>
          <span className="badge">步骤 {step}/5</span>
          <span className="badge">变量 {variableLabel}</span>
          <span className="badge">反应 {Math.round(reactionProgress * 100)}%</span>
          <span className="badge">得分 {score}</span>
        </div>
      </div>

      <div className="playground-grid chemistry-grid enzyme-grid">
        <aside className="playground-side enzyme-side-rail enzyme-side-rail-left">
          <section className="info-card enzyme-rail-card">
            <span className="eyebrow">Variable</span>
            <h3>变量选择</h3>
            <div className="camera-actions split-actions">
              <button className={variableChoice === 'temperature' ? 'scene-action active' : 'scene-action'} onClick={() => handleChooseVariable('temperature')} type="button" disabled={step !== 1}>
                温度变量
              </button>
              <button className={variableChoice === 'ph' ? 'scene-action active' : 'scene-action'} onClick={() => handleChooseVariable('ph')} type="button" disabled={step !== 1}>
                pH 变量
              </button>
            </div>
          </section>

          <section className="info-card enzyme-rail-card">
            <span className="eyebrow">Groups</span>
            <h3>三组条件</h3>
            <div className="enzyme-tube-list">
              {slotOrder.map((slotId) => (
                <div className="enzyme-row" key={slotId}>
                  <strong>{slotLabels[slotId]}</strong>
                  <small>{placedSlots.includes(slotId) ? getConditionLabel(slotId) : variableChoice ? '待放置' : '先选变量'}</small>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="scene-panel enzyme-workbench-stage">
          <div className="scene-toolbar enzyme-workbench-toolbar">
            <div className="enzyme-toolbar-head">
              <div className="enzyme-toolbar-kicker">酶活性工作台</div>
              <strong>{experiment.title}</strong>
              <p className="enzyme-toolbar-copy">中央舞台聚焦分组、加样和泡沫变化，步骤、结论和复盘统一下沉到底部工作台。</p>
            </div>
            <div className="camera-actions">
              <button className={cameraPreset === 'wide' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('wide')} type="button">
                台面全景
              </button>
              <button className={cameraPreset === 'top' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('top')} type="button">
                俯视分组
              </button>
              <button className={cameraPreset === 'focus' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('focus')} type="button">
                聚焦试管
              </button>
            </div>
          </div>

          <div className="scene-meta-strip enzyme-stage-meta">
            <div className={`enzyme-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>步骤 {step} · {stepTitles[step]}</strong>
              <p>{prompt}</p>
            </div>
            <div className="enzyme-step-pills" aria-label="实验步骤概览">
              {enzymeStepOrder.map((stepId) => (
                <span className={step === stepId ? 'enzyme-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'enzyme-step-pill done' : 'enzyme-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="scene-canvas enzyme-scene-canvas">
            <div className="three-stage-overlay enzyme-three-overlay">
              <div className="three-stage-chip-row">
                <span className="three-stage-chip">酶促反应 3D 台面</span>
                <span className="three-stage-chip">对照 + 实验组</span>
                <span className="three-stage-chip strong">进度 {Math.round(reactionProgress * 100)}%</span>
              </div>
              <div className="enzyme-three-hint">俯视适合看分组，聚焦适合盯泡沫高度、液面变化和气泡上浮。</div>
            </div>
            <div className="three-stage-mount enzyme-three-mount" ref={mountRef} />
            {hoveredPart ? (
              <div className="enzyme-three-hovercard">
                <strong>{hoveredPartCopy?.title ?? '实验部件'}</strong>
                <p>{hoveredPartCopy?.detail ?? '悬停可查看当前部件在变量控制实验中的意义。'}</p>
              </div>
            ) : null}
          </div>

          <div className="workbench-inline-dock enzyme-workbench-dock">
            <div className="enzyme-workbench-status-grid">
              <div className={`info-card enzyme-status-card tone-${promptTone}`}>
                <span>当前进度</span>
                <strong>步骤 {step} · {stepTitles[step]}</strong>
                <p>{enzymeWorkbenchStatus}</p>
              </div>
              <div className={`info-card enzyme-status-card ${variableChoice && rackReady ? 'tone-success' : ''}`.trim()}>
                <span>变量与分组</span>
                <strong>{variableChoice ? `${variableLabel}变量已锁定` : '待锁定变量'} / {rackReady ? '三组已就位' : '待补齐分组'}</strong>
                <p>对照组与实验组 {placedSlots.length}/3 · 当前主变量 {variableLabel}</p>
              </div>
              <div className={`info-card enzyme-status-card ${reactionFinished ? 'tone-success' : sceneNoteTone === 'invalid' ? 'tone-error' : ''}`.trim()}>
                <span>反应与结果</span>
                <strong>{reactionFinished ? '结果已稳定' : timerRunning ? '反应进行中' : '待启动计时'} / {reagentsReady ? '加样完成' : '待补加样'}</strong>
                <p>计时 {timerRunning ? '运行中' : reactionFinished ? '已完成' : '未开始'} · 最优趋势 {reactionFinished ? slotLabels[highestResultSlot] : '待观察'}</p>
              </div>
              <div className={`info-card enzyme-status-card ${hoveredPartCopy ? 'tone-success' : ''}`.trim()}>
                <span>舞台提示</span>
                <strong>{hoveredPartCopy?.title ?? '点击舞台推进实验'}</strong>
                <p>{hoveredPartCopy?.detail ?? enzymeSceneHint}</p>
              </div>
            </div>

            <div className="enzyme-inline-workbench">
              <section className="info-card enzyme-inline-panel">
                <span className="eyebrow">Actions</span>
                <h3>舞台操作与控制</h3>
                <div className="summary-stack generic-choice-stack">
                  {step === 1 ? (
                    <>
                      <button className={variableChoice === 'temperature' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleChooseVariable('temperature')} type="button">
                        <strong>选择温度变量</strong>
                        <span>只改变温度，比较适宜与偏高、偏低条件下的泡沫差异。</span>
                      </button>
                      <button className={variableChoice === 'ph' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleChooseVariable('ph')} type="button">
                        <strong>选择 pH 变量</strong>
                        <span>只改变酸碱度，其他条件保持一致。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 2 ? (
                    <>
                      {slotOrder.map((slotId) => (
                        <button className={placedSlots.includes(slotId) ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} key={slotId} onClick={() => handlePlaceSlot(slotId)} type="button">
                          <strong>放置{slotLabels[slotId]}</strong>
                          <span>{placedSlots.includes(slotId) ? `已设置为 ${getConditionLabel(slotId)}` : '也可直接点击舞台试管位完成'}</span>
                        </button>
                      ))}
                      <button className={cameraPreset === 'top' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => setCameraPreset('top')} type="button">
                        <strong>切到俯视分组</strong>
                        <span>从上方核对三组摆放是否完整。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 3 ? (
                    <>
                      <button className={addedReagents.includes('substrate') ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => handleAddReagent('substrate')} type="button">
                        <strong>加入底物</strong>
                        <span>{addedReagents.includes('substrate') ? '三组底物已同步加入' : '三组都要保持相同底物量'}</span>
                      </button>
                      <button className={addedReagents.includes('enzyme') ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => handleAddReagent('enzyme')} type="button">
                        <strong>加入酶液</strong>
                        <span>{addedReagents.includes('enzyme') ? '三组酶液已同步加入' : '加入后才能进入统一计时'}</span>
                      </button>
                      <button className={cameraPreset === 'focus' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => setCameraPreset('focus')} type="button">
                        <strong>切到试管近景</strong>
                        <span>方便确认液面和后续泡沫变化。</span>
                      </button>
                    </>
                  ) : null}

                  {step === 4 ? (
                    <>
                      <button className={timerRunning ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={handleStartReaction} type="button">
                        <strong>启动统一计时</strong>
                        <span>{timerRunning ? '正在同步比较三组反应' : '开始后再比较泡沫高低'}</span>
                      </button>
                      <button className={cameraPreset === 'focus' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => setCameraPreset('focus')} type="button">
                        <strong>盯泡沫高度</strong>
                        <span>聚焦试管，观察哪组泡沫上升更快、更高。</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </section>

              <section className="info-card enzyme-inline-panel enzyme-observation-panel">
                <span className="eyebrow">Observation</span>
                <h3>实验观察面板</h3>
                <div className="chem-observation-grid enzyme-observation-grid">
                  <div className={variableChoice ? 'observation-pill ready' : 'observation-pill'}>单一变量：{variableLabel}</div>
                  <div className={rackReady ? 'observation-pill ready' : 'observation-pill'}>三组分组：{rackReady ? '完成' : '未完成'}</div>
                  <div className={reagentsReady ? 'observation-pill ready' : 'observation-pill'}>反应液：{reagentsReady ? '全部加入' : '待补齐'}</div>
                  <div className={reactionFinished ? 'observation-pill ready' : 'observation-pill'}>计时结果：{reactionFinished ? '已稳定' : timerRunning ? '进行中' : '未开始'}</div>
                </div>
                <div className="result-stack">
                  {slotOrder.map((slotId) => (
                    <div className="result-row" key={slotId}>
                      <div>
                        <strong>{slotLabels[slotId]}</strong>
                        <small>{getConditionLabel(slotId)}</small>
                      </div>
                      <div className="result-bar"><i style={{ width: `${getFoamPercent(slotId)}%` }} /></div>
                    </div>
                  ))}
                </div>
                <div className="detail-list">
                  <div className="detail-row">
                    <div className="detail-copy">
                      <strong>当前提示</strong>
                      <small>{enzymeSceneHint}</small>
                    </div>
                    <span className={reactionFinished ? 'status-pill ready' : 'status-pill'}>{reactionFinished ? '可总结' : '继续观察'}</span>
                  </div>
                  <div className="detail-row">
                    <div className="detail-copy">
                      <strong>结果判断</strong>
                      <small>{bestConditionCopy}</small>
                    </div>
                    <span className={reactionFinished ? 'status-pill ready' : 'status-pill'}>{reactionFinished ? slotLabels[highestResultSlot] : '待完成'}</span>
                  </div>
                  <div className="detail-row">
                    <div className="detail-copy">
                      <strong>悬停部件</strong>
                      <small>{hoveredPartCopy?.detail ?? '把鼠标移到试管位、试剂瓶或计时器上，可查看它们在变量控制实验中的作用。'}</small>
                    </div>
                    <span className={hoveredPartCopy ? 'status-pill ready' : 'status-pill'}>{hoveredPartCopy?.title ?? '无'}</span>
                  </div>
                </div>
              </section>
            </div>

            {step === 5 ? (
              <section className="enzyme-summary-dock">
                <div className="enzyme-summary-head">
                  <div>
                    <span>Summary</span>
                    <strong>选择正确实验结论</strong>
                  </div>
                  <span className="badge">舞台下提交结论</span>
                </div>
                <div className="enzyme-choice-row">
                  <button className={summaryChoice === 'multiple-variables' ? 'summary-choice generic-choice secondary active' : 'summary-choice generic-choice secondary'} onClick={() => setSummaryChoice('multiple-variables')} type="button">
                    <strong>同时改变多个变量，才能更快比较酶活性差异</strong>
                    <span>错误演示：失去单一变量控制，实验无法解释。</span>
                  </button>
                  <button className={summaryChoice === 'optimum-condition' ? 'summary-choice generic-choice primary active' : 'summary-choice generic-choice primary'} onClick={() => setSummaryChoice('optimum-condition')} type="button">
                    <strong>酶活性在适宜条件最高，温度或 pH 过高过低都会使反应减弱</strong>
                    <span>与三组泡沫高度差异一致的正确结论。</span>
                  </button>
                  <button className={summaryChoice === 'always-increase' ? 'summary-choice generic-choice danger active' : 'summary-choice generic-choice danger'} onClick={() => setSummaryChoice('always-increase')} type="button">
                    <strong>条件越极端，酶活性越高，泡沫总会更多</strong>
                    <span>错误演示：忽略适宜条件与失活抑制现象。</span>
                  </button>
                </div>
                <button className="action-button enzyme-submit-button" onClick={handleSubmitSummary} type="button" disabled={step !== 5}>
                  提交实验结论
                </button>
              </section>
            ) : null}
          </div>
        </section>

        <aside className="playground-side enzyme-side-rail enzyme-side-rail-right">
          <section className="info-card enzyme-rail-card enzyme-rail-prompt">
            <span className="eyebrow">Hover</span>
            <h3>器材说明</h3>
            <p>{hoveredPartCopy?.detail ?? '当前无悬停器材。把鼠标移到试管位、试剂瓶或计时器上，可查看其在变量控制实验中的作用。'}</p>
          </section>

          <section className="info-card enzyme-rail-card">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>当前目标：{stepTitles[step]}</li>
              <li>主变量：{variableLabel} / 分组进度：{placedSlots.length}/3</li>
              <li>加样进度：{addedReagents.length}/2 / 计时：{timerRunning ? '运行中' : reactionFinished ? '已完成' : '未开始'}</li>
              <li>最优趋势：{reactionFinished ? `${slotLabels[highestResultSlot]} · ${getConditionLabel(highestResultSlot)}` : '等待结果稳定'}</li>
            </ul>
          </section>

          <section className="info-card enzyme-rail-card enzyme-rail-prompt">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '纠错建议' : '操作提示'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {enzymeRecoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className={`info-card enzyme-rail-card enzyme-rail-prompt ${completed ? 'tone-success' : promptTone === 'error' ? 'tone-error' : ''}`.trim()}>
            <span className="eyebrow">Control</span>
            <h3>实验控制</h3>
            <p>{enzymeCompletionCopy}</p>
            <div className="button-stack">
              <button className="action-button ghost" onClick={handleResetLab} type="button">重置酶实验</button>
            </div>
            <small>{enzymeSceneHint}</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
