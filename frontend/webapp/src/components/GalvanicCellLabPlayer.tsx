import { useEffect, useMemo, useRef, useState } from 'react';
import { AmbientLight, BoxGeometry, BufferGeometry, CatmullRomCurve3, CircleGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, Fog, Group, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, TubeGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { SimulationRuntimeSnapshot } from '../lib/simulationRuntime';
import { createSimulationRuntimeFromApparatus } from '../lib/simulationRuntimeAdapter';
import type { ExperimentConfig } from '../types/experiment';
import { ReusableApparatusDock } from './ReusableApparatusDock';
import { attachLabRealism, createLabCeramicMaterial, createLabCoatedMetalMaterial, createLabGlassMaterial, createLabLiquidMaterial, createLabLiquidSurfaceMaterial, createLabMetalMaterial, createLabPlasticMaterial, createLabWoodMaterial } from '../lib/threeRealism';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'wide' | 'macro' | 'micro';
type ElectrodeMaterial = 'zn' | 'cu' | 'fe' | 'ag';
type SolutionId = 'znso4' | 'cuso4' | 'feso4' | 'agno3';
type DevicePartId = 'electrode_a' | 'electrode_b' | 'salt_bridge' | 'ammeter';

type MicroParticleLane = 'electron' | 'cation' | 'anion';

interface GalvanicCellLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
  onSimulationRuntimeChange?: (snapshot: SimulationRuntimeSnapshot | null) => void;
}

interface HitInfo {
  role?: string;
  id?: string;
}

interface MicroParticle {
  mesh: Mesh;
  lane: MicroParticleLane;
  offset: number;
}

interface WirePulseNode {
  mesh: Mesh;
  path: Vector3[];
  offset: number;
}

interface DevicePartState {
  electrode_a: boolean;
  electrode_b: boolean;
  salt_bridge: boolean;
  ammeter: boolean;
}

interface SolutionSpec {
  label: string;
  color: number;
  swatch: string;
  opacity: number;
  electrode: ElectrodeMaterial;
  note: string;
}

interface VisualRefs {
  anodePlate: Mesh | null;
  cathodePlate: Mesh | null;
  anodeIonCloud: Group | null;
  cathodeDeposition: Mesh | null;
  saltBridge: Group | null;
  ammeter: Group | null;
  ammeterNeedle: Mesh | null;
  wireGroup: Group | null;
  wirePulseGroup: Group | null;
  macroGroup: Group | null;
  microGroup: Group | null;
  beakerLeftLiquid: Mesh | null;
  beakerRightLiquid: Mesh | null;
  beakerLeftCaustic: Mesh | null;
  beakerRightCaustic: Mesh | null;
  benchCaustic: Mesh | null;
  anodePlateSpecular: Mesh | null;
  cathodePlateSpecular: Mesh | null;
  saltBridgeGlow: Mesh | null;
  ammeterHalo: Mesh | null;
}

const stepCopy: Record<StepId, string> = {
  1: '先选择左右电极材料，并为每个半电池匹配对应的电解质溶液。',
  2: '点击 3D 台面中的电极、盐桥和电流计，把装置搭建完整。',
  3: '点击电流计观察宏观现象，确认指针偏转与电极变化。',
  4: '切换到微观视角，观察电子沿导线移动、离子在盐桥中迁移。',
  5: '根据宏观与微观现象，总结原电池形成条件与电流来源。',
};

const stepTitles: Record<StepId, string> = {
  1: '选择电极与电解质',
  2: '搭建原电池装置',
  3: '观察宏观现象',
  4: '切换微观视角',
  5: '总结形成条件',
};

const galvanicStepOrder: StepId[] = [1, 2, 3, 4, 5];
const anodeMaterialOptions: ElectrodeMaterial[] = ['zn', 'fe', 'cu', 'ag'];
const cathodeMaterialOptions: ElectrodeMaterial[] = ['cu', 'ag', 'fe', 'zn'];
const leftSolutionOptions: SolutionId[] = ['znso4', 'feso4', 'cuso4', 'agno3'];
const rightSolutionOptions: SolutionId[] = ['cuso4', 'agno3', 'feso4', 'znso4'];

const materialLabels: Record<ElectrodeMaterial, string> = {
  zn: 'Zn 锌',
  cu: 'Cu 铜',
  fe: 'Fe 铁',
  ag: 'Ag 银',
};

const materialShortLabels: Record<ElectrodeMaterial, string> = {
  zn: 'Zn',
  cu: 'Cu',
  fe: 'Fe',
  ag: 'Ag',
};

const activityRank: Record<ElectrodeMaterial, number> = {
  zn: 4,
  fe: 3,
  cu: 2,
  ag: 1,
};

const solutionSpecs: Record<SolutionId, SolutionSpec> = {
  znso4: { label: 'ZnSO4 溶液', color: 0xd7efff, swatch: '#d7efff', opacity: 0.22, electrode: 'zn', note: '锌电极应浸入硫酸锌溶液' },
  cuso4: { label: 'CuSO4 溶液', color: 0x5d9fff, swatch: '#5d9fff', opacity: 0.34, electrode: 'cu', note: '铜电极与硫酸铜溶液组成半电池' },
  feso4: { label: 'FeSO4 溶液', color: 0x98c9ab, swatch: '#98c9ab', opacity: 0.28, electrode: 'fe', note: '铁电极应浸入硫酸亚铁溶液' },
  agno3: { label: 'AgNO3 溶液', color: 0xe9f3ff, swatch: '#e9f3ff', opacity: 0.2, electrode: 'ag', note: '银电极与硝酸银溶液组成半电池' },
};

const devicePartLabels: Record<DevicePartId, string> = {
  electrode_a: '左电极片',
  electrode_b: '右电极片',
  salt_bridge: '盐桥',
  ammeter: '电流计',
};

const galvanicHoverCopy: Record<string, { title: string; detail: string }> = {
  electrode_a: { title: '左电极片', detail: '活泼性更强的金属更容易失电子，通常作为负极。' },
  electrode_b: { title: '右电极片', detail: '较不活泼的电极更容易得到电子，表面会出现析出变化。' },
  salt_bridge: { title: '盐桥', detail: '盐桥通过离子迁移维持两侧溶液电中性，是原电池持续工作的关键。' },
  ammeter: { title: '电流计', detail: '电路闭合后应出现明确偏转，偏转越大代表电流越强。' },
};

const devicePartOrder: DevicePartId[] = ['electrode_a', 'electrode_b', 'salt_bridge', 'ammeter'];

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

function disposeThreeObject(object: Object3D) {
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
      return;
    }
    material.dispose();
  });
}

function samplePolyline(points: Vector3[], t: number) {
  if (points.length === 1) return points[0].clone();
  const totalSegments = points.length - 1;
  const normalized = ((t % 1) + 1) % 1;
  const scaled = normalized * totalSegments;
  const segmentIndex = Math.min(totalSegments - 1, Math.floor(scaled));
  const segmentT = scaled - segmentIndex;
  return new Vector3().lerpVectors(points[segmentIndex], points[segmentIndex + 1], segmentT);
}

export function GalvanicCellLabPlayer({ experiment, onTelemetry, onSimulationRuntimeChange }: GalvanicCellLabPlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameRef = useRef<number | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const interactiveObjectsRef = useRef<Object3D[]>([]);
  const visualRefs = useRef<VisualRefs>({
    anodePlate: null,
    cathodePlate: null,
    anodeIonCloud: null,
    cathodeDeposition: null,
    saltBridge: null,
    ammeter: null,
    ammeterNeedle: null,
    wireGroup: null,
    wirePulseGroup: null,
    macroGroup: null,
    microGroup: null,
    beakerLeftLiquid: null,
    beakerRightLiquid: null,
    beakerLeftCaustic: null,
    beakerRightCaustic: null,
    benchCaustic: null,
    anodePlateSpecular: null,
    cathodePlateSpecular: null,
    saltBridgeGlow: null,
    ammeterHalo: null,
  });
  const microParticlesRef = useRef<MicroParticle[]>([]);
  const wirePulseNodesRef = useRef<WirePulseNode[]>([]);
  const galvanicWireMaterialsRef = useRef<LineBasicMaterial[]>([]);
  const stepRef = useRef<StepId>(1);
  const cellValidRef = useRef(false);
  const placedPartsRef = useRef<DevicePartState>({ electrode_a: false, electrode_b: false, salt_bridge: false, ammeter: false });
  const macroObservedRef = useRef(false);
  const microViewRef = useRef(false);
  const reactionProgressRef = useRef(0);

  const [step, setStep] = useState<StepId>(1);
  const [anodeMaterial, setAnodeMaterial] = useState<ElectrodeMaterial | null>(null);
  const [cathodeMaterial, setCathodeMaterial] = useState<ElectrodeMaterial | null>(null);
  const [leftSolution, setLeftSolution] = useState<SolutionId | null>(null);
  const [rightSolution, setRightSolution] = useState<SolutionId | null>(null);
  const [placedParts, setPlacedParts] = useState<DevicePartState>({ electrode_a: false, electrode_b: false, salt_bridge: false, ammeter: false });
  const [macroObserved, setMacroObserved] = useState(false);
  const [microView, setMicroView] = useState(false);
  const [reactionProgress, setReactionProgress] = useState(0);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('wide');
  const [prompt, setPrompt] = useState(stepCopy[1]);
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);

  const activityGap = anodeMaterial && cathodeMaterial ? activityRank[anodeMaterial] - activityRank[cathodeMaterial] : 0;
  const pairValid = Boolean(anodeMaterial && cathodeMaterial && anodeMaterial !== cathodeMaterial && activityGap > 0);
  const leftHalfCellValid = Boolean(anodeMaterial && leftSolution && solutionSpecs[leftSolution].electrode === anodeMaterial);
  const rightHalfCellValid = Boolean(cathodeMaterial && rightSolution && solutionSpecs[rightSolution].electrode === cathodeMaterial);
  const solutionValid = leftHalfCellValid && rightHalfCellValid;
  const cellValid = pairValid && solutionValid;
  const deviceReady = devicePartOrder.every((partId) => placedParts[partId]);
  const theoreticalVoltage = cellValid ? Number((0.34 + activityGap * 0.42).toFixed(2)) : 0;
  const electronFlow = cellValid && anodeMaterial && cathodeMaterial ? `${materialShortLabels[anodeMaterial]} → ${materialShortLabels[cathodeMaterial]}` : '待形成';
  const currentLevel = cellValid && deviceReady && macroObserved ? Number((0.36 + activityGap * 0.18 + reactionProgress * 0.12).toFixed(2)) : 0;
  const anodeDisplay = anodeMaterial ? materialLabels[anodeMaterial] : '左电极';
  const cathodeDisplay = cathodeMaterial ? materialLabels[cathodeMaterial] : '右电极';
  const score = Math.max(74, 100 - errors * 5);

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

  useEffect(() => {
    stepRef.current = step;
    cellValidRef.current = cellValid;
    placedPartsRef.current = placedParts;
    macroObservedRef.current = macroObserved;
    microViewRef.current = microView;
    reactionProgressRef.current = reactionProgress;
  }, [cellValid, macroObserved, microView, placedParts, reactionProgress, step]);

  const applyCameraPreset = (preset: CameraPreset) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = new Vector3(0, 1.85, 0);
    const position = new Vector3(8.4, 6.3, 8.2);

    if (preset === 'macro') {
      target.set(0, 2.0, 0.1);
      position.set(5.4, 4.8, 5.8);
    }

    if (preset === 'micro') {
      target.set(0, 2.4, 0.4);
      position.set(3.9, 4.3, 4.7);
    }

    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  };

  const handleConfirmPair = () => {
    if (step !== 1) return;
    if (!anodeMaterial || !cathodeMaterial || !leftSolution || !rightSolution) {
      setErrors((value) => value + 1);
      setPrompt('请先为左右电极都选择材料，并为两个烧杯都选好对应电解质溶液。');
      setPromptTone('error');
      return;
    }
    if (!pairValid) {
      setErrors((value) => value + 1);
      setPrompt('左电极应比右电极更活泼，才能形成自发原电池。请把更活泼的金属放在左侧。');
      setPromptTone('error');
      return;
    }
    if (!solutionValid) {
      setErrors((value) => value + 1);
      setPrompt('电极必须浸入与自身离子对应的电解质溶液中，请检查左右半电池是否匹配。');
      setPromptTone('error');
      return;
    }

    setStep(2);
    setPrompt(`半电池匹配正确，理论电压约 ${theoreticalVoltage.toFixed(2)} V。继续搭建盐桥与外电路。`);
    setPromptTone('success');
    setCameraPreset('macro');
  };

  const handleToggleMicroView = () => {
    if (step < 4) return;
    const next = !microView;
    setMicroView(next);
    if (next) {
      setPrompt(`微观视角已开启：电子经外电路由${electronFlow}流动，盐桥中的离子迁移维持两侧电荷平衡。`);
      setPromptTone('success');
      setCameraPreset('micro');
      if (step === 4) {
        setStep(5);
      }
    } else {
      setPrompt('已切回宏观视角。你仍可再次切到微观视角复查粒子迁移。');
      setPromptTone('info');
      setCameraPreset('macro');
    }
  };

  const handleObserveMacro = () => {
    if (stepRef.current !== 3) return;
    const partsReady = devicePartOrder.every((partId) => placedPartsRef.current[partId]);
    if (!cellValidRef.current || !partsReady) {
      setErrors((value) => value + 1);
      setPrompt('请先完成活泼性顺序正确的材料选择、半电池溶液匹配和完整装置搭建，再观察宏观现象。');
      setPromptTone('error');
      return;
    }
    if (macroObservedRef.current) return;

    setMacroObserved(true);
    setReactionProgress(0.22);
    setPrompt(`${anodeDisplay}逐渐失电子并发生溶解，${cathodeDisplay}表面开始析出对应金属。下一步请切换微观视角。`);
    setPromptTone('success');
    setStep(4);
    setCameraPreset('macro');
  };

  const handleResetLab = () => {
    reportReset('原电池实验已重置，开始新的材料选择与装置搭建尝试。');
    setStep(1);
    setAnodeMaterial(null);
    setCathodeMaterial(null);
    setLeftSolution(null);
    setRightSolution(null);
    setPlacedParts({ electrode_a: false, electrode_b: false, salt_bridge: false, ammeter: false });
    setMacroObserved(false);
    setMicroView(false);
    setReactionProgress(0);
    setCameraPreset('wide');
    setPrompt(stepCopy[1]);
    setPromptTone('info');
    setSummaryChoice('');
    setErrors(0);
    setCompleted(false);
  };

  const handleSubmitSummary = () => {
    if (step !== 5) return;
    if (summaryChoice !== 'electrons-and-ion-balance') {
      setErrors((value) => value + 1);
      setPrompt('结论还不完整。提示：需要同时提到金属活泼性差异、半电池匹配、电子流动和盐桥维持电中性。');
      setPromptTone('error');
      return;
    }

    setCompleted(true);
    setPrompt('实验完成。你已理解原电池的宏观现象、微观机制、半电池匹配方式和形成条件。');
    setPromptTone('success');
    setCameraPreset('micro');
  };

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    interactiveObjectsRef.current = [];
    microParticlesRef.current = [];
    visualRefs.current = {
      anodePlate: null,
      cathodePlate: null,
      anodeIonCloud: null,
      cathodeDeposition: null,
      saltBridge: null,
      ammeter: null,
      ammeterNeedle: null,
      wireGroup: null,
      wirePulseGroup: null,
      macroGroup: null,
      microGroup: null,
      beakerLeftLiquid: null,
      beakerRightLiquid: null,
      beakerLeftCaustic: null,
      beakerRightCaustic: null,
      benchCaustic: null,
      anodePlateSpecular: null,
      cathodePlateSpecular: null,
      saltBridgeGlow: null,
      ammeterHalo: null,
    };
    wirePulseNodesRef.current = [];
    galvanicWireMaterialsRef.current = [];

    const scene = new Scene();
    scene.background = new Color(0x08131f);
    scene.fog = new Fog(0x08131f, 12, 28);
    sceneRef.current = scene;

    const camera = new PerspectiveCamera(40, mountNode.clientWidth / mountNode.clientHeight, 0.1, 100);
    camera.position.set(8.4, 6.3, 8.2);
    camera.lookAt(0, 1.85, 0);
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
    controls.target.set(0, 1.85, 0);
    controls.update();
    controlsRef.current = controls;

    scene.add(new AmbientLight(0xffffff, 1.24));
    const directional = new DirectionalLight(0xcfe3ff, 1.5);
    directional.position.set(6, 10, 5);
    directional.castShadow = true;
    directional.shadow.mapSize.set(1536, 1536);
    directional.shadow.bias = -0.00008;
    scene.add(directional);
    const rim = new DirectionalLight(0x38e0c1, 0.46);
    rim.position.set(-6, 6, -6);
    scene.add(rim);

    const table = new Mesh(
      new BoxGeometry(12.8, 0.6, 7.8),
      createLabWoodMaterial({ color: 0x674633, roughness: 0.74 }),
    );
    table.position.set(0, -0.35, 0);
    table.receiveShadow = true;
    scene.add(table);

    const frame = new Mesh(
      new BoxGeometry(13.1, 0.1, 8.1),
      createLabCoatedMetalMaterial({ color: 0x324f69, roughness: 0.24, metalness: 0.42 }),
    );
    frame.position.set(0, -0.02, 0);
    scene.add(frame);

    const backPanel = new Mesh(
      new PlaneGeometry(18, 10),
      createLabPlasticMaterial({ color: 0x0d1723, roughness: 0.78, clearcoat: 0.05 }),
    );
    backPanel.position.set(0, 4.6, -4.2);
    scene.add(backPanel);

    const benchGlow = new Mesh(
      new CircleGeometry(4.4, 52),
      new MeshBasicMaterial({ color: 0x38e0c1, transparent: true, opacity: 0.07 }),
    );
    benchGlow.rotation.x = -Math.PI / 2;
    benchGlow.position.y = -0.04;
    scene.add(benchGlow);

    const benchCaustic = new Mesh(
      new CircleGeometry(3.9, 56),
      new MeshBasicMaterial({ color: 0x7bcfff, transparent: true, opacity: 0.08 }),
    );
    benchCaustic.rotation.x = -Math.PI / 2;
    benchCaustic.position.set(0, 0.032, 0);
    scene.add(benchCaustic);
    visualRefs.current.benchCaustic = benchCaustic;

    const macroGroup = new Group();
    const microGroup = new Group();
    scene.add(macroGroup, microGroup);
    visualRefs.current.macroGroup = macroGroup;
    visualRefs.current.microGroup = microGroup;

    const glassMaterial = createLabGlassMaterial({ color: 0xd8f3ff, opacity: 0.18, transmission: 0.94, thickness: 0.56, attenuationDistance: 2.8, attenuationColor: 0xd7f2ff });
    const rackMaterial = createLabCoatedMetalMaterial({ color: 0x2c425f, roughness: 0.3, metalness: 0.34 });
    const darkMaterial = createLabPlasticMaterial({ color: 0x24364a, roughness: 0.46, clearcoat: 0.22 });
    const ceramicMaterial = createLabCeramicMaterial({ color: 0xf5f8fb, roughness: 0.44 });

    const createBeaker = (x: number, liquidColor: number, opacity: number) => {
      const beaker = new Group();
      beaker.position.set(x, 0, 0);
      const beakerGlassMaterial = glassMaterial.clone();
      const innerWallMaterial = createLabGlassMaterial({ color: 0xf3fbff, opacity: 0.11, transmission: 0.96, thickness: 0.28, attenuationDistance: 0.9, attenuationColor: 0xf6fdff });
      const liquidMaterial = createLabLiquidMaterial({ color: liquidColor, opacity, transmission: 0.82, thickness: 0.92, attenuationDistance: 1.2, attenuationColor: liquidColor });
      const liquidTopMaterial = createLabLiquidSurfaceMaterial({ color: liquidColor, opacity: Math.min(0.74, opacity + 0.16), attenuationColor: liquidColor });
      const glass = new Mesh(new CylinderGeometry(1.1, 1.18, 2.8, 28, 1, true), beakerGlassMaterial);
      glass.position.y = 1.45;
      const innerWall = new Mesh(new CylinderGeometry(1.02, 1.08, 2.68, 28, 1, true), innerWallMaterial);
      innerWall.position.y = 1.42;
      const base = new Mesh(new CylinderGeometry(1.02, 1.08, 0.08, 28), beakerGlassMaterial);
      base.position.y = 0.06;
      const rim = new Mesh(new TorusGeometry(1.1, 0.04, 16, 36), beakerGlassMaterial);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 2.84;
      const innerRim = new Mesh(new TorusGeometry(1.02, 0.028, 16, 36), innerWallMaterial);
      innerRim.rotation.x = Math.PI / 2;
      innerRim.position.y = 2.74;
      const glossStrip = new Mesh(
        new PlaneGeometry(0.2, 2.08),
        new MeshBasicMaterial({ color: 0xf8fdff, transparent: true, opacity: 0.16, side: DoubleSide }),
      );
      glossStrip.position.set(0.86, 1.6, 0.62);
      glossStrip.rotation.y = -Math.PI / 7;
      const glossStripRear = glossStrip.clone();
      (glossStripRear.material as MeshBasicMaterial).opacity = 0.08;
      glossStripRear.position.set(-0.78, 1.46, -0.58);
      glossStripRear.rotation.y = Math.PI / 5;
      const scaleMarks = new Group();
      Array.from({ length: 5 }).forEach((_, index) => {
        const tick = new Mesh(
          new BoxGeometry(0.02, 0.04, 0.16),
          createLabCeramicMaterial({ color: 0xeaf6ff, roughness: 0.48 }),
        );
        tick.position.set(1.02, 0.62 + index * 0.34, 0);
        scaleMarks.add(tick);
      });
      const liquid = new Mesh(
        new CylinderGeometry(0.96, 1.0, 1.78, 24),
        liquidMaterial,
      );
      liquid.position.y = 0.9;
      const meniscus = new Mesh(
        new CircleGeometry(0.94, 32),
        liquidTopMaterial,
      );
      meniscus.rotation.x = -Math.PI / 2;
      meniscus.position.y = 1.8;
      const liquidCaustic = new Mesh(
        new CircleGeometry(0.76, 32),
        new MeshBasicMaterial({ color: liquidColor, transparent: true, opacity: 0.14 }),
      );
      liquidCaustic.rotation.x = -Math.PI / 2;
      liquidCaustic.position.y = 0.12;
      beaker.add(glass, innerWall, base, rim, innerRim, glossStrip, glossStripRear, scaleMarks, liquid, meniscus, liquidCaustic);
      beaker.traverse((child) => {
        child.castShadow = true;
        child.receiveShadow = true;
      });
      macroGroup.add(beaker);
      return { beaker, liquid, caustic: liquidCaustic };
    };

    const leftBeaker = createBeaker(-2.25, 0xbfe7ff, 0.18);
    const rightBeaker = createBeaker(2.25, 0x5d9fff, 0.34);
    visualRefs.current.beakerLeftLiquid = leftBeaker.liquid;
    visualRefs.current.beakerRightLiquid = rightBeaker.liquid;
    visualRefs.current.beakerLeftCaustic = leftBeaker.caustic;
    visualRefs.current.beakerRightCaustic = rightBeaker.caustic;

    const createPartTray = (id: DevicePartId, x: number, z: number) => {
      const tray = new Group();
      tray.position.set(x, 0, z);
      const trayBase = new Mesh(new CylinderGeometry(0.84, 0.92, 0.1, 28), ceramicMaterial);
      trayBase.position.y = 0.05;
      const trayRing = new Mesh(new TorusGeometry(0.78, 0.03, 12, 28), rackMaterial);
      trayRing.position.y = 0.11;
      trayRing.rotation.x = Math.PI / 2;
      tray.add(trayBase, trayRing);
      tray.userData = { role: 'part', id };
      tray.traverse((child) => {
        child.userData = { role: 'part', id };
      });
      interactiveObjectsRef.current.push(tray);
      macroGroup.add(tray);
      return tray;
    };

    const anodeTray = createPartTray('electrode_a', -4.6, -2.0);
    const anodePlate = new Mesh(
      new BoxGeometry(0.16, 2.0, 0.72),
      createLabMetalMaterial({ color: 0xaebcc8, roughness: 0.2, metalness: 0.96 }),
    );
    anodePlate.position.y = 1.1;
    const anodePlateSpecular = new Mesh(
      new BoxGeometry(0.024, 1.78, 0.18),
      new MeshBasicMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.18 }),
    );
    anodePlateSpecular.position.set(0.095, 0.02, 0.2);
    anodePlate.add(anodePlateSpecular);
    anodeTray.add(anodePlate);
    visualRefs.current.anodePlate = anodePlate;
    visualRefs.current.anodePlateSpecular = anodePlateSpecular;

    const cathodeTray = createPartTray('electrode_b', 4.6, -2.0);
    const cathodePlate = new Mesh(
      new BoxGeometry(0.16, 2.0, 0.72),
      createLabMetalMaterial({ color: 0xd79362, roughness: 0.18, metalness: 0.97 }),
    );
    cathodePlate.position.y = 1.1;
    const cathodePlateSpecular = new Mesh(
      new BoxGeometry(0.024, 1.78, 0.18),
      new MeshBasicMaterial({ color: 0xfff7f1, transparent: true, opacity: 0.18 }),
    );
    cathodePlateSpecular.position.set(0.095, 0.02, 0.2);
    cathodePlate.add(cathodePlateSpecular);
    cathodeTray.add(cathodePlate);
    visualRefs.current.cathodePlate = cathodePlate;
    visualRefs.current.cathodePlateSpecular = cathodePlateSpecular;

    const saltBridgeTray = createPartTray('salt_bridge', 0, -2.3);
    const saltBridge = new Group();
    const curve = new CatmullRomCurve3([
      new Vector3(-0.95, 0.4, 0),
      new Vector3(-0.55, 1.6, 0),
      new Vector3(0.55, 1.6, 0),
      new Vector3(0.95, 0.4, 0),
    ]);
    const tube = new Mesh(
      new TubeGeometry(curve, 42, 0.13, 12, false),
      createLabGlassMaterial({ color: 0xc7f4ff, opacity: 0.24, transmission: 0.92, thickness: 0.24, attenuationDistance: 1.4, attenuationColor: 0xcff7ff }),
    );
    const saltBridgeGlow = new Mesh(
      new TubeGeometry(curve, 42, 0.07, 10, false),
      new MeshBasicMaterial({ color: 0x8efaff, transparent: true, opacity: 0.12 }),
    );
    saltBridge.add(tube, saltBridgeGlow);
    saltBridgeTray.add(saltBridge);
    visualRefs.current.saltBridge = saltBridge;
    visualRefs.current.saltBridgeGlow = saltBridgeGlow;

    const ammeterTray = createPartTray('ammeter', 0, 2.4);
    const ammeter = new Group();
    const ammeterBody = new Mesh(new CylinderGeometry(0.66, 0.66, 0.42, 24), createLabPlasticMaterial({ color: 0xe6edf5, roughness: 0.34, clearcoat: 0.62 }));
    ammeterBody.position.y = 0.36;
    const ammeterFace = new Mesh(new CylinderGeometry(0.5, 0.5, 0.06, 24), createLabCeramicMaterial({ color: 0xdaf6df, roughness: 0.28 }));
    ammeterFace.rotation.x = Math.PI / 2;
    ammeterFace.position.set(0, 0.42, 0.18);
    const ammeterGlass = new Mesh(
      new CylinderGeometry(0.52, 0.52, 0.03, 24),
      createLabGlassMaterial({ color: 0xffffff, opacity: 0.14, transmission: 0.94, thickness: 0.12, roughness: 0.02, attenuationDistance: 0.8, attenuationColor: 0xf5fbff }),
    );
    ammeterGlass.rotation.x = Math.PI / 2;
    ammeterGlass.position.set(0, 0.45, 0.22);
    const ammeterTicks = new Group();
    Array.from({ length: 9 }).forEach((_, index) => {
      const tick = new Mesh(
        new BoxGeometry(index % 4 === 0 ? 0.12 : 0.08, 0.014, 0.02),
        createLabPlasticMaterial({ color: 0x244154, roughness: 0.42, clearcoat: 0.12 }),
      );
      const angle = -Math.PI * 0.78 + (index / 8) * Math.PI * 0.92;
      tick.position.set(Math.cos(angle) * 0.34, 0.43, 0.18 + Math.sin(angle) * 0.34);
      tick.rotation.y = -angle;
      ammeterTicks.add(tick);
    });
    const ammeterNeedle = new Mesh(new BoxGeometry(0.42, 0.03, 0.02), createLabCoatedMetalMaterial({ color: 0xff6b7a, roughness: 0.18, metalness: 0.52 }));
    ammeterNeedle.position.set(0.14, 0.43, 0.18);
    ammeterNeedle.rotation.y = -1.18;
    const ammeterCenter = new Mesh(new CylinderGeometry(0.04, 0.04, 0.05, 16), createLabMetalMaterial({ color: 0x425161, roughness: 0.26, metalness: 0.92 }));
    ammeterCenter.rotation.x = Math.PI / 2;
    ammeterCenter.position.set(0, 0.44, 0.2);
    const ammeterHalo = new Mesh(
      new TorusGeometry(0.58, 0.032, 14, 48),
      new MeshBasicMaterial({ color: 0x8ff7ff, transparent: true, opacity: 0.08 }),
    );
    ammeterHalo.rotation.x = Math.PI / 2;
    ammeterHalo.position.set(0, 0.44, 0.24);
    ammeter.add(ammeterBody, ammeterFace, ammeterGlass, ammeterTicks, ammeterNeedle, ammeterCenter, ammeterHalo);
    ammeterTray.add(ammeter);
    visualRefs.current.ammeter = ammeter;
    visualRefs.current.ammeterNeedle = ammeterNeedle;
    visualRefs.current.ammeterHalo = ammeterHalo;

    const wireGroup = new Group();
    const wirePulseGroup = new Group();
    macroGroup.add(wireGroup, wirePulseGroup);
    visualRefs.current.wireGroup = wireGroup;
    visualRefs.current.wirePulseGroup = wirePulseGroup;

    const anodeIonCloud = new Group();
    Array.from({ length: 8 }).forEach((_, index) => {
      const ion = new Mesh(
        new SphereGeometry(0.07, 14, 14),
        new MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0.78 }),
      );
      ion.position.set(-2.25 + Math.sin(index * 1.2) * 0.46, 0.8 + (index % 4) * 0.26, Math.cos(index * 0.8) * 0.24);
      anodeIonCloud.add(ion);
    });
    macroGroup.add(anodeIonCloud);
    visualRefs.current.anodeIonCloud = anodeIonCloud;

    const cathodeDeposition = new Mesh(
      new BoxGeometry(0.08, 1.7, 0.54),
      createLabMetalMaterial({ color: 0xe0a06a, roughness: 0.16, metalness: 0.98 }),
    );
    cathodeDeposition.position.set(2.45, 1.2, 0);
    cathodeDeposition.visible = false;
    Array.from({ length: 4 }).forEach((_, index) => {
      const sparkle = new Mesh(
        new SphereGeometry(index % 2 === 0 ? 0.045 : 0.035, 12, 12),
        new MeshBasicMaterial({ color: 0xffe7bf, transparent: true, opacity: 0.16 }),
      );
      sparkle.position.set(0.05, -0.52 + index * 0.34, index % 2 === 0 ? 0.16 : -0.14);
      sparkle.userData.sparkle = true;
      cathodeDeposition.add(sparkle);
    });
    macroGroup.add(cathodeDeposition);
    visualRefs.current.cathodeDeposition = cathodeDeposition;

    Array.from({ length: 14 }).forEach((_, index) => {
      const mesh = new Mesh(
        new SphereGeometry(index % 3 === 0 ? 0.055 : 0.045, 12, 12),
        new MeshBasicMaterial({ color: index < 6 ? 0x7de8ff : index < 10 ? 0xffc66b : 0xb4c6ff, transparent: true, opacity: 0.82 }),
      );
      mesh.visible = false;
      microParticlesRef.current.push({
        mesh,
        lane: index < 6 ? 'electron' : index < 10 ? 'cation' : 'anion',
        offset: index * 0.13,
      });
      microGroup.add(mesh);
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
      return { role: object.userData.role, id: object.userData.id };
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

      if (hitInfo.role === 'part') {
        if (stepRef.current !== 2) return;
        const partId = hitInfo.id as DevicePartId;
        setPlacedParts((current) => {
          if (current[partId]) return current;
          const next = { ...current, [partId]: true };
          const ready = devicePartOrder.every((devicePart) => next[devicePart]);
          setPrompt(ready ? '装置搭建完整。现在点击电流计观察宏观现象。' : `已放置${devicePartLabels[partId]}，继续补全剩余部件。`);
          setPromptTone('success');
          if (ready) {
            setStep(3);
          }
          return next;
        });
        return;
      }

      if (hitInfo.id === 'ammeter') {
        handleObserveMacro();
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

      const progress = reactionProgressRef.current;
      const wirePulse = macroObservedRef.current ? 0.46 + Math.sin(time * 0.008) * 0.24 : 0.12;
      galvanicWireMaterialsRef.current.forEach((material, index) => {
        material.opacity = material.userData.layer === 'pulse' ? Math.max(0.16, wirePulse + index * 0.06) : 0.24 + wirePulse * 0.18;
      });
      wirePulseNodesRef.current.forEach((pulseNode, index) => {
        const active = macroObservedRef.current && placedPartsRef.current.ammeter;
        pulseNode.mesh.visible = active;
        if (!active) return;
        pulseNode.mesh.position.copy(samplePolyline(pulseNode.path, time * 0.00062 + pulseNode.offset));
        const material = pulseNode.mesh.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = 0.24 + Math.sin(time * 0.012 + index * 0.7) * 0.08;
        }
      });
      const saltBridgeGlow = visualRefs.current.saltBridgeGlow;
      if (saltBridgeGlow) {
        const material = saltBridgeGlow.material;
        saltBridgeGlow.visible = placedPartsRef.current.salt_bridge;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = macroObservedRef.current ? 0.16 + Math.sin(time * 0.006) * 0.08 : 0.08;
        }
      }
      [visualRefs.current.beakerLeftCaustic, visualRefs.current.beakerRightCaustic].forEach((caustic, index) => {
        if (!caustic) return;
        const material = caustic.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = 0.09 + progress * 0.08 + Math.sin(time * 0.007 + index * 0.9) * 0.04;
        }
        caustic.scale.setScalar(0.96 + Math.sin(time * 0.005 + index * 0.7) * 0.04);
      });
      const benchCaustic = visualRefs.current.benchCaustic;
      if (benchCaustic) {
        const material = benchCaustic.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = 0.06 + progress * 0.06 + Math.sin(time * 0.004) * 0.02;
        }
      }
      [visualRefs.current.anodePlateSpecular, visualRefs.current.cathodePlateSpecular].forEach((specular, index) => {
        if (!specular) return;
        const material = specular.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = 0.14 + progress * 0.08 + Math.sin(time * 0.01 + index) * 0.03;
        }
      });
      const ammeterHalo = visualRefs.current.ammeterHalo;
      if (ammeterHalo) {
        const material = ammeterHalo.material;
        ammeterHalo.visible = placedPartsRef.current.ammeter;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = macroObservedRef.current ? 0.14 + progress * 0.16 + Math.sin(time * 0.008) * 0.05 : 0.05;
        }
        const scale = macroObservedRef.current ? 1.02 + progress * 0.08 + Math.sin(time * 0.01) * 0.03 : 1;
        ammeterHalo.scale.setScalar(scale);
      }
      const deposition = visualRefs.current.cathodeDeposition;
      if (deposition) {
        deposition.children.forEach((child, index) => {
          const material = (child as Mesh).material;
          if (material instanceof MeshBasicMaterial && child.userData.sparkle) {
            material.opacity = macroObservedRef.current ? 0.18 + Math.sin(time * 0.015 + index) * 0.12 : 0;
            child.position.x = 0.05 + Math.sin(time * 0.003 + index) * 0.02;
          }
        });
      }
      microParticlesRef.current.forEach((particle) => {
        const active = microViewRef.current && macroObservedRef.current;
        particle.mesh.visible = active;
        if (!active) return;
        const t = (time * 0.00075 + particle.offset) % 1;
        if (particle.lane === 'electron') {
          particle.mesh.position.set(-2.2 + t * 4.4, 3.15 + Math.sin(t * Math.PI * 2) * 0.16, 0.06);
          return;
        }
        if (particle.lane === 'cation') {
          particle.mesh.position.set(-0.6 + t * 1.2, 2.65, Math.sin(t * Math.PI * 2) * 0.18);
          return;
        }
        particle.mesh.position.set(0.6 - t * 1.2, 2.42, Math.cos(t * Math.PI * 2) * 0.18);
      });

      const ionCloud = visualRefs.current.anodeIonCloud;
      if (ionCloud) {
        ionCloud.visible = macroObservedRef.current;
        ionCloud.children.forEach((child, index) => {
          child.position.y = 0.9 + ((time * 0.0005 + index * 0.19 + progress * 0.1) % 1) * 1.1;
        });
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
      realism.dispose();
      renderer.dispose();
      if (mountNode.contains(renderer.domElement)) {
        mountNode.removeChild(renderer.domElement);
      }
      scene.clear();
      interactiveObjectsRef.current = [];
      microParticlesRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!macroObserved || completed) return;
    const timer = window.setInterval(() => {
      setReactionProgress((current) => Math.min(1, current + 0.025));
    }, 180);
    return () => window.clearInterval(timer);
  }, [completed, macroObserved]);

  useEffect(() => {
    applyCameraPreset(cameraPreset);
  }, [cameraPreset]);

  useEffect(() => {
    const {
      anodePlate,
      cathodePlate,
      cathodeDeposition,
      saltBridge,
      ammeter,
      ammeterNeedle,
      wireGroup,
      wirePulseGroup,
      macroGroup,
      microGroup,
      beakerLeftLiquid,
      beakerRightLiquid,
      beakerLeftCaustic,
      beakerRightCaustic,
      benchCaustic,
      anodePlateSpecular,
      cathodePlateSpecular,
      ammeterHalo,
    } = visualRefs.current;

    if (anodePlate) {
      anodePlate.position.set(placedParts.electrode_a ? -2.45 : 0, placedParts.electrode_a ? 1.2 : 1.1, 0);
      const material = anodePlate.material;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        material.color = new Color(anodeMaterial === 'zn' ? 0xadb9c4 : anodeMaterial === 'fe' ? 0x90979f : anodeMaterial === 'ag' ? 0xd6dbe2 : 0xd88f5a);
      }
      anodePlate.scale.y = placedParts.electrode_a && macroObserved ? 1 - reactionProgress * 0.18 : 1;
    }

    if (cathodePlate) {
      cathodePlate.position.set(placedParts.electrode_b ? 2.45 : 0, placedParts.electrode_b ? 1.2 : 1.1, 0);
      const material = cathodePlate.material;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        material.color = new Color(cathodeMaterial === 'cu' ? 0xd88f5a : cathodeMaterial === 'ag' ? 0xd6dbe2 : cathodeMaterial === 'fe' ? 0x90979f : 0xadb9c4);
      }
    }

    if (cathodeDeposition) {
      cathodeDeposition.visible = macroObserved;
      cathodeDeposition.scale.x = 0.25 + reactionProgress * 0.9;
      const material = cathodeDeposition.material;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        material.color = new Color(cathodeMaterial === 'ag' ? 0xdfe6f0 : cathodeMaterial === 'fe' ? 0x98a2aa : cathodeMaterial === 'zn' ? 0xb4bec8 : 0xe0a06a);
      }
    }

    if (saltBridge) {
      saltBridge.position.set(placedParts.salt_bridge ? 0 : 0, placedParts.salt_bridge ? 0.85 : 0, placedParts.salt_bridge ? 0 : 0);
    }

    if (ammeter) {
      ammeter.position.set(placedParts.ammeter ? 0 : 0, placedParts.ammeter ? 0.16 : 0, placedParts.ammeter ? 2.0 : 0);
    }

    if (ammeterNeedle) {
      ammeterNeedle.rotation.y = macroObserved ? -1.18 + currentLevel * 1.35 : -1.18;
    }

    if (wireGroup) {
      wireGroup.children.forEach((child) => disposeThreeObject(child));
      wireGroup.clear();
      if (wirePulseGroup) {
        wirePulseGroup.children.forEach((child) => disposeThreeObject(child));
        wirePulseGroup.clear();
      }
      wirePulseNodesRef.current = [];
      galvanicWireMaterialsRef.current = [];
      const addWire = (points: Vector3[], glowColor: number) => {
        const baseGeometry = new BufferGeometry().setFromPoints(points);
        const baseMaterial = new LineBasicMaterial({ color: 0x7de8ff, transparent: true, opacity: 0.26 });
        const pulseGeometry = new BufferGeometry().setFromPoints(points);
        const pulseMaterial = new LineBasicMaterial({ color: glowColor, transparent: true, opacity: 0.18 });
        pulseMaterial.userData = { layer: 'pulse' };
        wireGroup.add(new Line(baseGeometry, baseMaterial), new Line(pulseGeometry, pulseMaterial));
        galvanicWireMaterialsRef.current.push(baseMaterial, pulseMaterial);
        if (wirePulseGroup) {
          Array.from({ length: 4 }).forEach((_, index) => {
            const mesh = new Mesh(
              new SphereGeometry(index % 2 === 0 ? 0.05 : 0.04, 12, 12),
              new MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.22 }),
            );
            wirePulseGroup.add(mesh);
            wirePulseNodesRef.current.push({
              mesh,
              path: points.map((point) => point.clone()),
              offset: index * 0.24,
            });
          });
        }
      };

      if (placedParts.electrode_a && placedParts.ammeter) {
        addWire([
          new Vector3(-2.45, 2.2, 0),
          new Vector3(-2.45, 3.15, 0),
          new Vector3(0, 3.15, 0),
          new Vector3(0, 0.7, 2.0),
        ], 0xa6ffff);
      }
      if (placedParts.electrode_b && placedParts.ammeter) {
        addWire([
          new Vector3(2.45, 2.2, 0),
          new Vector3(2.45, 3.15, 0),
          new Vector3(0.4, 3.15, 0),
          new Vector3(0.4, 0.7, 2.0),
        ], 0xc3f8ff);
      }
    }

    if (beakerLeftCaustic) {
      const material = beakerLeftCaustic.material;
      if (material instanceof MeshBasicMaterial) {
        material.color = new Color(leftSolution ? solutionSpecs[leftSolution].color : 0xbfe7ff);
      }
    }

    if (beakerRightCaustic) {
      const material = beakerRightCaustic.material;
      if (material instanceof MeshBasicMaterial) {
        material.color = new Color(rightSolution ? solutionSpecs[rightSolution].color : 0x5d9fff);
      }
    }

    if (benchCaustic) {
      const material = benchCaustic.material;
      if (material instanceof MeshBasicMaterial) {
        const leftColor = new Color(leftSolution ? solutionSpecs[leftSolution].color : 0xbfe7ff);
        const rightColor = new Color(rightSolution ? solutionSpecs[rightSolution].color : 0x5d9fff);
        material.color = leftColor.lerp(rightColor, 0.5);
      }
    }

    if (anodePlateSpecular) {
      const material = anodePlateSpecular.material;
      anodePlateSpecular.visible = placedParts.electrode_a;
      if (material instanceof MeshBasicMaterial) {
        material.color = new Color(anodeMaterial === 'ag' ? 0xfafcff : anodeMaterial === 'cu' ? 0xffe2c2 : 0xeaf7ff);
      }
    }

    if (cathodePlateSpecular) {
      const material = cathodePlateSpecular.material;
      cathodePlateSpecular.visible = placedParts.electrode_b;
      if (material instanceof MeshBasicMaterial) {
        material.color = new Color(cathodeMaterial === 'ag' ? 0xfafcff : cathodeMaterial === 'cu' ? 0xffdfc4 : 0xe9f6ff);
      }
    }

    if (ammeterHalo) {
      ammeterHalo.visible = placedParts.ammeter;
    }

    if (macroGroup) {
      macroGroup.visible = !microView || step < 4;
    }
    if (microGroup) {
      microGroup.visible = microView;
    }

    if (beakerLeftLiquid) {
      const material = beakerLeftLiquid.material;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        const spec = leftSolution ? solutionSpecs[leftSolution] : null;
        material.color = new Color(spec?.color ?? 0xbfe7ff);
        material.opacity = spec ? spec.opacity + (macroObserved && leftHalfCellValid ? reactionProgress * 0.06 : 0) : 0.16;
      }
    }

    if (beakerRightLiquid) {
      const material = beakerRightLiquid.material;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        const spec = rightSolution ? solutionSpecs[rightSolution] : null;
        const nextColor = new Color(spec?.color ?? 0x5d9fff);
        if (macroObserved && spec) {
          nextColor.lerp(new Color(0xe7f2ff), reactionProgress * (spec.electrode === 'cu' ? 0.32 : 0.18));
        }
        material.color = nextColor;
        material.opacity = spec ? Math.max(0.14, spec.opacity - (macroObserved && rightHalfCellValid ? reactionProgress * 0.05 : 0)) : 0.3;
      }
    }

    applyGlow(visualRefs.current.anodePlate, hoveredPart === 'electrode_a' ? 0x72f5ff : placedParts.electrode_a ? 0x1e5b4e : step === 2 ? 0x103149 : 0x000000, hoveredPart === 'electrode_a' ? 0.92 : placedParts.electrode_a ? 0.62 : step === 2 ? 0.28 : 0.08);
    applyGlow(visualRefs.current.cathodePlate, hoveredPart === 'electrode_b' ? 0x72f5ff : placedParts.electrode_b ? 0x1e5b4e : step === 2 ? 0x103149 : 0x000000, hoveredPart === 'electrode_b' ? 0.92 : placedParts.electrode_b ? 0.62 : step === 2 ? 0.28 : 0.08);
    applyGlow(visualRefs.current.saltBridge, hoveredPart === 'salt_bridge' ? 0x72f5ff : placedParts.salt_bridge ? 0x1e5b4e : step === 2 ? 0x103149 : 0x000000, hoveredPart === 'salt_bridge' ? 0.92 : placedParts.salt_bridge ? 0.62 : step === 2 ? 0.28 : 0.08);
    applyGlow(visualRefs.current.ammeter, hoveredPart === 'ammeter' ? 0x72f5ff : placedParts.ammeter ? (macroObserved ? 0x1d6b79 : 0x1e5b4e) : step >= 2 ? 0x103149 : 0x000000, hoveredPart === 'ammeter' ? 0.96 : placedParts.ammeter ? (macroObserved ? 0.82 : 0.62) : step >= 2 ? 0.28 : 0.08);
  }, [anodeMaterial, cameraPreset, cathodeMaterial, currentLevel, hoveredPart, leftHalfCellValid, leftSolution, macroObserved, microView, placedParts, reactionProgress, rightHalfCellValid, rightSolution, step]);

  const sceneNoteTone = promptTone === 'error' ? 'invalid' : microView || completed ? 'valid' : 'neutral';
  const hoveredPartCopy = hoveredPart ? galvanicHoverCopy[hoveredPart] : null;
  const galvanicApparatusIds = ['beaker', 'electrode-set', 'salt-bridge', 'meter-set', 'wire-set'];
  const galvanicActiveApparatusId = useMemo(() => {
    if (hoveredPart === 'electrode_a' || hoveredPart === 'electrode_b') return 'electrode-set';
    if (hoveredPart === 'salt_bridge') return 'salt-bridge';
    if (hoveredPart === 'ammeter') return 'meter-set';
    if (macroObserved || microView) return 'wire-set';
    return null;
  }, [hoveredPart, macroObserved, microView]);
  const placedPartCount = devicePartOrder.filter((partId) => placedParts[partId]).length;
  const galvanicRuntimeContext = useMemo(
    () => ({
      experimentId: experiment.id,
      step,
      completed,
      progress: reactionProgress,
      focusId: hoveredPart,
      flags: {
        solutionReady: solutionValid,
        deviceReady,
        macroObserved,
        microView,
        electrodePlaced: placedParts.electrode_a || placedParts.electrode_b,
        saltBridgePlaced: placedParts.salt_bridge,
        meterConnected: placedParts.ammeter,
        currentFlowing: currentLevel > 0.05,
      },
      metrics: {
        currentLevel,
        theoreticalVoltage,
        reactionProgressPercent: Math.round(reactionProgress * 100),
        placedPartCount,
      },
      values: {
        leftSolution: leftSolution ? solutionSpecs[leftSolution].label : '未选溶液',
        rightSolution: rightSolution ? solutionSpecs[rightSolution].label : '未选溶液',
        anodeMaterial: anodeMaterial ? materialLabels[anodeMaterial] : '未选电极',
        cathodeMaterial: cathodeMaterial ? materialLabels[cathodeMaterial] : '未选电极',
        electronFlow,
      },
    }),
    [
      anodeMaterial,
      cathodeMaterial,
      completed,
      currentLevel,
      deviceReady,
      electronFlow,
      experiment.id,
      hoveredPart,
      leftSolution,
      macroObserved,
      microView,
      placedPartCount,
      placedParts,
      reactionProgress,
      rightSolution,
      solutionValid,
      step,
      theoreticalVoltage,
    ],
  );
  const galvanicSimulationRuntime = useMemo(
    () => createSimulationRuntimeFromApparatus({
      playerId: 'galvanic-cell-lab-player',
      apparatusIds: galvanicApparatusIds,
      runtimeContext: galvanicRuntimeContext,
      activeApparatusId: galvanicActiveApparatusId,
      phaseLabel: stepTitles[step],
      phaseState: completed ? 'completed' : 'active',
      progress: completed ? 1 : Math.min(0.96, ((step - 1) / 4) + reactionProgress * 0.24),
      focusTarget: hoveredPartCopy?.title ?? '原电池装置',
      focusLens: microView ? 'micro' : macroObserved ? 'meso' : 'macro',
      stateSummary: `${cellValid ? '半电池匹配正确' : '半电池待校验'} · ${macroObserved ? '宏观现象已建立' : '宏观现象待观察'} · ${microView ? '微观离子迁移已开启' : '微观通道未开启'}`,
      observables: [
        { key: 'theoretical-voltage', label: '理论电势', value: theoreticalVoltage, unit: ' V', status: cellValid ? 'nominal' : 'warning' },
        { key: 'current-level', label: '电流强度', value: currentLevel, unit: ' A', status: currentLevel > 0.05 ? 'nominal' : 'warning' },
        { key: 'reaction-progress', label: '反应进度', value: Math.round(reactionProgress * 100), unit: '%' },
        { key: 'electron-flow', label: '电子流向', value: electronFlow },
        { key: 'salt-bridge', label: '盐桥状态', value: placedParts.salt_bridge ? '已接入' : '未接入', status: placedParts.salt_bridge ? 'nominal' : 'warning' },
      ],
      controls: [
        { key: 'left-solution', label: '左槽溶液', value: leftSolution ? solutionSpecs[leftSolution].label : '未选', kind: 'discrete' },
        { key: 'right-solution', label: '右槽溶液', value: rightSolution ? solutionSpecs[rightSolution].label : '未选', kind: 'discrete' },
        { key: 'anode-material', label: '阳极材料', value: anodeMaterial ? materialLabels[anodeMaterial] : '未选', kind: 'discrete' },
        { key: 'cathode-material', label: '阴极材料', value: cathodeMaterial ? materialLabels[cathodeMaterial] : '未选', kind: 'discrete' },
        { key: 'view-mode', label: '视图层级', value: microView ? '微观' : macroObserved ? '宏观现象' : '装置搭建', kind: 'discrete' },
      ],
      phases: [1, 2, 3, 4, 5].map((stepId) => ({
        key: `step-${stepId}`,
        label: stepTitles[stepId as StepId],
        state: completed || step > stepId || (stepId === 5 && completed) ? 'completed' : step === stepId ? 'active' : 'pending',
      })),
      failureRisks: [
        !cellValid ? '金属活泼性顺序或溶液配对错误，理论电势和后续现象都会失真。' : '',
        step >= 2 && !placedParts.salt_bridge ? '盐桥未接入时电中性无法维持，电流与反应过程不会稳定。' : '',
        step >= 3 && !macroObserved ? '还没有完成电流计观察，当前结论缺少宏观证据。' : '',
      ],
      trace: [
        `${leftSolution ? solutionSpecs[leftSolution].label : '左槽'} -> ${electronFlow} -> ${rightSolution ? solutionSpecs[rightSolution].label : '右槽'}`,
        microView ? '外电路电子流 + 盐桥离子迁移同步' : '先建立宏观电流，再切换微观迁移',
      ],
    }),
    [
      anodeMaterial,
      cathodeMaterial,
      cellValid,
      completed,
      currentLevel,
      electronFlow,
      hoveredPartCopy?.title,
      leftSolution,
      macroObserved,
      microView,
      galvanicActiveApparatusId,
      galvanicApparatusIds,
      galvanicRuntimeContext,
      placedParts.salt_bridge,
      reactionProgress,
      rightSolution,
      step,
      theoreticalVoltage,
    ],
  );

  useEffect(() => {
    onSimulationRuntimeChange?.(galvanicSimulationRuntime);
  }, [galvanicSimulationRuntime, onSimulationRuntimeChange]);

  useEffect(() => () => {
    onSimulationRuntimeChange?.(null);
  }, [onSimulationRuntimeChange]);

  const galvanicWorkbenchStatus =
    step === 1
      ? '先让更活泼的金属位于左侧，并让每种金属与对应离子溶液正确配对。'
      : step === 2
        ? '点击 3D 台面中的电极片、盐桥和电流计，把原电池装置补齐。'
        : step === 3
          ? '点击电流计观察宏观现象，确认指针偏转和电极变化。'
          : step === 4
            ? microView
              ? '微观视角已开启，电子沿外电路流动，盐桥中的离子同步迁移。'
              : '切换到微观视角，观察电子流和离子迁移。'
            : completed
              ? '实验完成，可继续在宏观和微观之间切换复盘。'
              : '根据宏观现象和微观机制，选择正确结论。';
  const galvanicCompletionCopy = completed
    ? '实验已完成，当前版本支持半电池匹配、装置搭建、宏观偏转、微观粒子迁移和结论复盘。'
    : '当前还未完成最终结论提交，请先完成观察与原理判断。';

  return (
    <section className="playground-panel panel galvanic-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">3D Demo</span>
          <h2>{experiment.title} · 本地 3D 实验 Demo</h2>
        </div>
        <div className="badge-row compact">
          <span className="badge">步骤 {step}/5</span>
          <span className="badge">电势 {cellValid ? `${theoreticalVoltage.toFixed(2)} V` : '--'}</span>
          <span className="badge">电子 {electronFlow}</span>
          <span className="badge">反应 {Math.round(reactionProgress * 100)}%</span>
          <span className="badge">得分 {score}</span>
        </div>
      </div>

      <div className="playground-grid galvanic-grid">
        <aside className="playground-side galvanic-side-rail galvanic-side-rail-left">
          <div className="info-card galvanic-rail-card">
            <strong>步骤总览</strong>
            <ol className="step-list compact-list">
              {galvanicStepOrder.map((stepId) => (
                <li className={step === stepId ? 'active' : step > stepId || (stepId === 5 && completed) ? 'done' : ''} key={stepId}>
                  {stepTitles[stepId]}
                </li>
              ))}
            </ol>
            <div className={`galvanic-rail-prompt tone-${promptTone}`}>
              <span>当前提示</span>
              <p>{prompt}</p>
            </div>
          </div>

          <div className="info-card galvanic-rail-card">
            <strong>半电池概览</strong>
            <div className="galvanic-mini-metrics">
              <div className="galvanic-mini-metric">
                <span>左半电池</span>
                <strong>{anodeMaterial ? materialLabels[anodeMaterial] : '未选金属'}</strong>
              </div>
              <div className="galvanic-mini-metric">
                <span>左侧溶液</span>
                <strong>{leftSolution ? solutionSpecs[leftSolution].label : '未选溶液'}</strong>
              </div>
              <div className="galvanic-mini-metric">
                <span>右半电池</span>
                <strong>{cathodeMaterial ? materialLabels[cathodeMaterial] : '未选金属'}</strong>
              </div>
              <div className="galvanic-mini-metric">
                <span>右侧溶液</span>
                <strong>{rightSolution ? solutionSpecs[rightSolution].label : '未选溶液'}</strong>
              </div>
            </div>
          </div>
        </aside>

        <div className="scene-panel galvanic-workbench-stage">
          <div className="scene-toolbar galvanic-workbench-toolbar">
            <div className="galvanic-toolbar-head">
              <div className="galvanic-toolbar-kicker">原电池工作台</div>
              <strong>{experiment.title}</strong>
              <p className="galvanic-toolbar-copy">半电池选择、装置搭建、宏观观察和微观切换全部放回舞台下方，不再让大卡片压住实验台。</p>
            </div>
            <div className="camera-actions galvanic-camera-actions">
              <button className={cameraPreset === 'wide' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('wide')} type="button">
                台面全景
              </button>
              <button className={cameraPreset === 'macro' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('macro')} type="button">
                宏观近景
              </button>
              <button className={cameraPreset === 'micro' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('micro')} type="button">
                微观近景
              </button>
            </div>
          </div>

          <div className="scene-meta-strip galvanic-stage-meta">
            <div className={`galvanic-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>
                步骤 {step} · {stepTitles[step]}
              </strong>
              <p>{prompt}</p>
            </div>
            <div className="galvanic-step-pills" aria-label="实验步骤概览">
              {galvanicStepOrder.map((stepId) => (
                <span className={step === stepId ? 'galvanic-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'galvanic-step-pill done' : 'galvanic-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="scene-canvas galvanic-scene-canvas">
            <div className="three-stage-mount galvanic-three-mount" ref={mountRef} />
          </div>

          <div className="workbench-inline-dock galvanic-workbench-dock">
            <div className="galvanic-workbench-status-grid">
              <div className={`info-card galvanic-status-card ${sceneNoteTone === 'invalid' ? 'tone-error' : sceneNoteTone === 'valid' ? 'tone-success' : ''}`.trim()}>
                <span>当前进度</span>
                <strong>
                  步骤 {step} · {stepTitles[step]}
                </strong>
                <p>{galvanicWorkbenchStatus}</p>
              </div>
              <div className={`info-card galvanic-status-card ${pairValid && solutionValid ? 'tone-success' : ''}`.trim()}>
                <span>半电池匹配</span>
                <strong>{cellValid ? '配对正确' : '待校验'}</strong>
                <p>{cellValid ? `理论电势 ${theoreticalVoltage.toFixed(2)} V` : '先检查活泼性顺序与溶液匹配'}</p>
              </div>
              <div className={`info-card galvanic-status-card ${deviceReady ? 'tone-success' : ''}`.trim()}>
                <span>装置进度</span>
                <strong>{placedPartCount}/4 已放置</strong>
                <p>{hoveredPartCopy?.title ?? '点击 3D 台面可逐步放置电极片、盐桥与电流计'}</p>
              </div>
              <div className={`info-card galvanic-status-card ${macroObserved || microView ? 'tone-success' : ''}`.trim()}>
                <span>观察进度</span>
                <strong>{macroObserved ? '宏观已观察' : '待观察'} · {microView ? '微观已开启' : '微观未开启'}</strong>
                <p>电子流向 {electronFlow} · 反应 {Math.round(reactionProgress * 100)}%</p>
              </div>
            </div>

            <ReusableApparatusDock
              activeApparatusId={galvanicActiveApparatusId}
              apparatusIds={galvanicApparatusIds}
              contextLabel="把鼠标移到电极、盐桥或电流计上，可查看它们在可复用实验引擎中的状态、端口和魔改方向。"
              experiment={experiment}
              runtimeContext={galvanicRuntimeContext}
              title="原电池器材引擎"
            />

            <div className="galvanic-inline-controls">
              <section className="info-card galvanic-inline-panel">
                <strong>半电池配置</strong>
                <div className="galvanic-halfcell-grid">
                  <div className="objective-block">
                    <span>左电极（较活泼）</span>
                    <div className="camera-actions split-actions">
                      {anodeMaterialOptions.map((material) => (
                        <button className={anodeMaterial === material ? 'scene-action active' : 'scene-action'} key={material} onClick={() => setAnodeMaterial(material)} type="button" disabled={step !== 1}>
                          {materialLabels[material]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="objective-block">
                    <span>左烧杯溶液</span>
                    <div className="camera-actions split-actions">
                      {leftSolutionOptions.map((solutionId) => (
                        <button className={leftSolution === solutionId ? 'scene-action active swatch-button' : 'scene-action swatch-button'} key={solutionId} onClick={() => setLeftSolution(solutionId)} type="button" disabled={step !== 1}>
                          <i className="inline-swatch" style={{ background: solutionSpecs[solutionId].swatch }} />
                          {solutionSpecs[solutionId].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="objective-block">
                    <span>右电极（较不活泼）</span>
                    <div className="camera-actions split-actions">
                      {cathodeMaterialOptions.map((material) => (
                        <button className={cathodeMaterial === material ? 'scene-action active' : 'scene-action'} key={material} onClick={() => setCathodeMaterial(material)} type="button" disabled={step !== 1}>
                          {materialLabels[material]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="objective-block">
                    <span>右烧杯溶液</span>
                    <div className="camera-actions split-actions">
                      {rightSolutionOptions.map((solutionId) => (
                        <button className={rightSolution === solutionId ? 'scene-action active swatch-button' : 'scene-action swatch-button'} key={solutionId} onClick={() => setRightSolution(solutionId)} type="button" disabled={step !== 1}>
                          <i className="inline-swatch" style={{ background: solutionSpecs[solutionId].swatch }} />
                          {solutionSpecs[solutionId].label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <small>支持多种自发原电池组合，但每个金属都必须和对应离子溶液正确配对。</small>
                <button className="action-button" onClick={handleConfirmPair} type="button" disabled={step !== 1}>
                  确认半电池组合
                </button>
              </section>

              <section className="info-card galvanic-inline-panel">
                <strong>装置与观察控制</strong>
                <div className="enzyme-tube-list">
                  {devicePartOrder.map((partId) => (
                    <div className="enzyme-row" key={partId}>
                      <strong>{devicePartLabels[partId]}</strong>
                      <small>{placedParts[partId] ? '已放置' : '待放置（点击 3D 台面）'}</small>
                    </div>
                  ))}
                </div>
                <div className="button-stack">
                  <button className="action-button ghost" onClick={handleObserveMacro} type="button" disabled={step !== 3}>
                    观察宏观现象
                  </button>
                  <button className="action-button ghost" onClick={handleToggleMicroView} type="button" disabled={step < 4 && !microView}>
                    {microView ? '关闭微观视角' : '切换微观视角'}
                  </button>
                  <button className="action-button ghost" onClick={handleResetLab} type="button">
                    重置原电池实验
                  </button>
                </div>
              </section>
            </div>

            <section className="info-card galvanic-inline-panel">
              <strong>现象记录</strong>
              <div className="result-stack">
                <div className="result-row">
                  <div>
                    <strong>电流计</strong>
                    <small>{macroObserved ? '指针已偏转' : '未偏转'}</small>
                  </div>
                  <div className="result-bar"><i style={{ width: `${Math.min(100, currentLevel * 100)}%` }} /></div>
                </div>
                <div className="result-row">
                  <div>
                    <strong>{anodeDisplay}</strong>
                    <small>{macroObserved ? '逐渐失电子并溶解' : '暂未变化'}</small>
                  </div>
                  <div className="result-bar"><i style={{ width: `${Math.round(reactionProgress * 82)}%` }} /></div>
                </div>
                <div className="result-row">
                  <div>
                    <strong>{cathodeDisplay}</strong>
                    <small>{macroObserved ? '表面逐渐析出对应金属' : '暂未变化'}</small>
                  </div>
                  <div className="result-bar"><i style={{ width: `${Math.round(reactionProgress * 94)}%` }} /></div>
                </div>
                <div className="result-row">
                  <div>
                    <strong>盐桥离子</strong>
                    <small>{cellValid ? microView ? '阴离子向左、阳离子向右迁移' : '已建立离子迁移，切微观视角可观察' : '需先形成原电池'}</small>
                  </div>
                  <div className="result-bar"><i style={{ width: `${microView ? 100 : macroObserved ? Math.round(58 + reactionProgress * 30) : 0}%` }} /></div>
                </div>
              </div>
            </section>

            {step === 5 || completed ? (
              <div className="galvanic-summary-dock">
                <div className="galvanic-summary-head">
                  <div>
                    <span>结论选择</span>
                    <strong>较活泼金属失电子，电子经外电路流向另一电极；盐桥中的离子迁移维持两侧电荷平衡</strong>
                  </div>
                  <button className="action-button galvanic-submit-button" onClick={handleSubmitSummary} type="button" disabled={step !== 5 || completed}>
                    {completed ? '已完成' : '提交原理结论'}
                  </button>
                </div>
                <div className="galvanic-choice-row">
                  <button className={summaryChoice === 'no-salt-bridge' ? 'summary-choice active' : 'summary-choice'} onClick={() => setSummaryChoice('no-salt-bridge')} type="button">
                    只要两种金属不同，就算没有盐桥也能长期稳定产生电流
                  </button>
                  <button className={summaryChoice === 'electrons-and-ion-balance' ? 'summary-choice active' : 'summary-choice'} onClick={() => setSummaryChoice('electrons-and-ion-balance')} type="button">
                    较活泼金属失电子，电子经外电路流向另一电极；盐桥中的离子迁移维持两侧电荷平衡
                  </button>
                  <button className={summaryChoice === 'ions-through-wire' ? 'summary-choice active' : 'summary-choice'} onClick={() => setSummaryChoice('ions-through-wire')} type="button">
                    电流主要由溶液中的离子沿外部导线流动形成，电子并不参与传导
                  </button>
                </div>
              </div>
            ) : (
              <div className="galvanic-selection-strip">
                <div className="galvanic-selection-pill">
                  <span>左电极</span>
                  <strong>{anodeMaterial ? materialLabels[anodeMaterial] : '未选择'}</strong>
                </div>
                <div className="galvanic-selection-pill">
                  <span>左溶液</span>
                  <strong>{leftSolution ? solutionSpecs[leftSolution].label : '未选择'}</strong>
                </div>
                <div className="galvanic-selection-pill">
                  <span>右电极</span>
                  <strong>{cathodeMaterial ? materialLabels[cathodeMaterial] : '未选择'}</strong>
                </div>
                <div className="galvanic-selection-pill">
                  <span>右溶液</span>
                  <strong>{rightSolution ? solutionSpecs[rightSolution].label : '未选择'}</strong>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside className="playground-side galvanic-side-rail galvanic-side-rail-right">
          <div className="info-card galvanic-rail-card">
            <strong>装置状态</strong>
            <div className="detail-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>左半电池</strong>
                  <small>{anodeMaterial ? materialLabels[anodeMaterial] : '未选金属'} · {leftSolution ? solutionSpecs[leftSolution].label : '未选溶液'}</small>
                </div>
                <span className={leftHalfCellValid ? 'status-pill ready' : 'status-pill'}>{leftHalfCellValid ? '匹配' : '待匹配'}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>右半电池</strong>
                  <small>{cathodeMaterial ? materialLabels[cathodeMaterial] : '未选金属'} · {rightSolution ? solutionSpecs[rightSolution].label : '未选溶液'}</small>
                </div>
                <span className={rightHalfCellValid ? 'status-pill ready' : 'status-pill'}>{rightHalfCellValid ? '匹配' : '待匹配'}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>悬停部件</strong>
                  <small>{hoveredPartCopy?.detail ?? '把鼠标移到装置部件上，可以查看它在原电池中的作用。'}</small>
                </div>
                <span className={hoveredPartCopy ? 'status-pill ready' : 'status-pill'}>{hoveredPartCopy?.title ?? '无'}</span>
              </div>
            </div>
          </div>

          <div className={completed ? 'info-card success-card galvanic-rail-card' : 'info-card galvanic-rail-card'}>
            <strong>完成状态</strong>
            <p>{galvanicCompletionCopy}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
