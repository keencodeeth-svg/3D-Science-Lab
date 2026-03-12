import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AmbientLight, BoxGeometry, CircleGeometry, Color, CylinderGeometry, DirectionalLight, Fog, GridHelper, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, PointLight, Raycaster, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { SimulationRuntimeSnapshot } from '../lib/simulationRuntime';
import { createSimulationRuntimeFromApparatus } from '../lib/simulationRuntimeAdapter';
import type { ExperimentConfig } from '../types/experiment';
import { ReusableApparatusDock } from './ReusableApparatusDock';
import { attachLabRealism, createLabCeramicMaterial, createLabCoatedMetalMaterial, createLabGlassMaterial, createLabLiquidMaterial, createLabMetalMaterial, createLabPlasticMaterial, createLabRubberMaterial, createLabWoodMaterial } from '../lib/threeRealism';
import { loadLabModelAssetFromManifest } from '../lib/labModelAsset';

type PartId = 'eyepiece' | 'objective' | 'focus';
type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'front' | 'top' | 'detail';
type ObjectiveMode = 'low' | 'high';

interface MicroscopeLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
  onSimulationRuntimeChange?: (snapshot: SimulationRuntimeSnapshot | null) => void;
}

interface HitInfo {
  role?: string;
  id?: string;
}

interface MicroscopeSceneObjects {
  eyepiece: Mesh | null;
  objective: Mesh | null;
  objectiveLens: Mesh | null;
  focusKnob: Mesh | null;
  fineFocusKnob: Mesh | null;
  lightShell: Mesh | null;
  lightGlow: PointLight | null;
  lightBeam: Mesh | null;
  condenserLens: Mesh | null;
  stageSurface: Mesh | null;
  stageGroup: Group | null;
  tubeGroup: Group | null;
  slideBench: Mesh | null;
  slidePlaced: Mesh | null;
  slideCover: Mesh | null;
  sampleLayer: Mesh | null;
  sampleHalo: Mesh | null;
  sampleCellsGroup: Group | null;
  stageClipLeft: Mesh | null;
  stageClipRight: Mesh | null;
  nosepiece: Mesh | null;
}

interface MicroscopeViewfinderCellSpec {
  id: string;
  left: string;
  top: string;
  width: string;
  height: string;
  rotate: number;
  wallTone: string;
  fillTone: string;
  nucleusX: string;
  nucleusY: string;
  nucleusScale: number;
}

interface MicroscopeViewfinderDustSpec {
  id: string;
  left: string;
  top: string;
  size: number;
  opacity: number;
  delay: number;
  duration: number;
}

const identifyOrder: PartId[] = ['eyepiece', 'objective', 'focus'];
const partLabels: Record<PartId, string> = {
  eyepiece: '目镜',
  objective: '物镜',
  focus: '调焦旋钮',
};
const stepCopy: Record<StepId, string> = {
  1: '先点击 3D 显微镜中的目镜、物镜和调焦旋钮，完成结构识别。',
  2: '点击镜下光源完成对光，再把亮度调到合适范围。',
  3: '先点击桌面上的载玻片，再点击载物台，把样本固定。',
  4: '保持低倍物镜，先粗调再细调，直到视野清晰。',
  5: '选择正确观察结果并提交，完成本次显微镜实验。',
};

const stepTitles: Record<StepId, string> = {
  1: '识别关键结构',
  2: '完成对光',
  3: '放置样本',
  4: '粗调与细调',
  5: '记录观察',
};

const microscopeStepOrder: StepId[] = [1, 2, 3, 4, 5];

const microscopeHoverCopy: Record<string, { title: string; detail: string }> = {
  eyepiece: { title: '目镜', detail: '目镜负责把物镜形成的像进一步放大，是观察入口。' },
  objective: { title: '物镜', detail: '物镜决定放大倍率和分辨率，低倍下应先完成对光和调焦。' },
  focus: { title: '调焦旋钮', detail: '粗调先让样本进入视野，细调再把细胞边界推到最清晰。' },
  'light-module': { title: '光源模块', detail: '对光要保证光线均匀穿过载玻片，否则视野会发暗或偏色。' },
  'slide-bench': { title: '载玻片', detail: '应先取片再固定到载物台，避免操作顺序错误。' },
  stage: { title: '载物台', detail: '载物台负责稳固样本，调焦时样本与物镜距离会细微变化。' },
};

const microscopeViewfinderCells: MicroscopeViewfinderCellSpec[] = [
  { id: 'cell-a', left: '7%', top: '10%', width: '27%', height: '20%', rotate: -6, wallTone: '#82bd7f', fillTone: '#b5e1b4', nucleusX: '68%', nucleusY: '34%', nucleusScale: 1 },
  { id: 'cell-b', left: '35%', top: '7%', width: '26%', height: '22%', rotate: 4, wallTone: '#76b375', fillTone: '#b6ddae', nucleusX: '34%', nucleusY: '62%', nucleusScale: 0.9 },
  { id: 'cell-c', left: '61%', top: '12%', width: '24%', height: '20%', rotate: -9, wallTone: '#87c688', fillTone: '#c7e8c1', nucleusX: '58%', nucleusY: '52%', nucleusScale: 1.05 },
  { id: 'cell-d', left: '12%', top: '31%', width: '24%', height: '19%', rotate: 3, wallTone: '#7fbe7d', fillTone: '#bfe4b8', nucleusX: '42%', nucleusY: '41%', nucleusScale: 0.84 },
  { id: 'cell-e', left: '39%', top: '31%', width: '28%', height: '20%', rotate: -3, wallTone: '#7bb779', fillTone: '#b9e1b2', nucleusX: '64%', nucleusY: '48%', nucleusScale: 1.08 },
  { id: 'cell-f', left: '67%', top: '34%', width: '20%', height: '20%', rotate: 7, wallTone: '#74af73', fillTone: '#abd7a5', nucleusX: '36%', nucleusY: '60%', nucleusScale: 0.88 },
  { id: 'cell-g', left: '9%', top: '55%', width: '28%', height: '22%', rotate: -8, wallTone: '#86c686', fillTone: '#c0e5ba', nucleusX: '60%', nucleusY: '40%', nucleusScale: 0.96 },
  { id: 'cell-h', left: '40%', top: '56%', width: '25%', height: '18%', rotate: 5, wallTone: '#7ab97a', fillTone: '#b5dfaf', nucleusX: '44%', nucleusY: '58%', nucleusScale: 0.92 },
  { id: 'cell-i', left: '63%', top: '58%', width: '23%', height: '21%', rotate: -4, wallTone: '#80bf80', fillTone: '#bfe4ba', nucleusX: '66%', nucleusY: '48%', nucleusScale: 1.02 },
];

const microscopeViewfinderDust: MicroscopeViewfinderDustSpec[] = [
  { id: 'dust-a', left: '18%', top: '18%', size: 8, opacity: 0.22, delay: 0, duration: 10.4 },
  { id: 'dust-b', left: '72%', top: '28%', size: 6, opacity: 0.18, delay: 1.4, duration: 9.2 },
  { id: 'dust-c', left: '31%', top: '64%', size: 10, opacity: 0.16, delay: 2.1, duration: 11.8 },
  { id: 'dust-d', left: '78%', top: '72%', size: 7, opacity: 0.2, delay: 0.8, duration: 8.8 },
  { id: 'dust-e', left: '46%', top: '22%', size: 5, opacity: 0.15, delay: 1.9, duration: 9.8 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isVisibleObject(object: Object3D) {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function applyEmissive(mesh: Mesh | null, color: number, intensity: number) {
  if (!mesh) return;
  const material = mesh.material;
  if (!(material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial)) return;
  material.emissive = new Color(color);
  material.emissiveIntensity = intensity;
}

export function MicroscopeLabPlayer({ experiment, onTelemetry, onSimulationRuntimeChange }: MicroscopeLabPlayerProps) {
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
  const sceneObjectsRef = useRef<MicroscopeSceneObjects>({
    eyepiece: null,
    objective: null,
    objectiveLens: null,
    focusKnob: null,
    fineFocusKnob: null,
    lightShell: null,
    lightGlow: null,
    lightBeam: null,
    condenserLens: null,
    stageSurface: null,
    stageGroup: null,
    tubeGroup: null,
    slideBench: null,
    slidePlaced: null,
    slideCover: null,
    sampleLayer: null,
    sampleHalo: null,
    sampleCellsGroup: null,
    stageClipLeft: null,
    stageClipRight: null,
    nosepiece: null,
  });
  const stepRef = useRef<StepId>(1);
  const slidePickedRef = useRef(false);
  const slidePlacedRef = useRef(false);

  const [step, setStep] = useState<StepId>(1);
  const [identifiedParts, setIdentifiedParts] = useState<PartId[]>([]);
  const [lightAligned, setLightAligned] = useState(false);
  const [lightLevel, setLightLevel] = useState(42);
  const [slidePicked, setSlidePicked] = useState(false);
  const [slidePlaced, setSlidePlaced] = useState(false);
  const [coarseFocus, setCoarseFocus] = useState(30);
  const [fineFocus, setFineFocus] = useState(24);
  const [objective, setObjective] = useState<ObjectiveMode>('low');
  const [prompt, setPrompt] = useState(stepCopy[1]);
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('front');
  const [observationChoice, setObservationChoice] = useState('');
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);

  const score = Math.max(74, 100 - errors * 5);
  const lightReady = lightAligned && lightLevel >= 58 && lightLevel <= 82;
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
  const coarseReady = Math.abs(coarseFocus - 62) <= 10;
  const fineReady = Math.abs(fineFocus - 52) <= 6;
  const canUseFineFocus = step >= 4 && coarseReady;
  const focusReady = step >= 4 && slidePlaced && lightReady && objective === 'low' && coarseReady && fineReady;

  const viewMetrics = useMemo(() => {
    const blur = Math.min(
      13,
      (slidePlaced ? 0 : 6.5) +
        Math.abs(coarseFocus - 62) * 0.12 +
        Math.abs(fineFocus - 52) * 0.22 +
        (lightReady ? 0 : 2.2) +
        (objective === 'high' ? 1.4 : 0),
    );
    const brightness = Math.max(0.35, Math.min(1.22, (lightAligned ? 0.35 : 0.18) + lightLevel / 95));
    const saturation = slidePlaced ? 1.08 : 0.72;
    const clarityLabel = !slidePlaced ? '未放片' : blur < 1.8 ? '清晰' : blur < 4 ? '接近清晰' : '模糊';
    return {
      blur: Number(blur.toFixed(1)),
      brightness: Number(brightness.toFixed(2)),
      saturation: Number(saturation.toFixed(2)),
      clarityLabel,
    };
  }, [coarseFocus, fineFocus, lightAligned, lightLevel, lightReady, objective, slidePlaced]);
  const focusConfidence = slidePlaced ? Math.round(clamp(1 - viewMetrics.blur / (objective === 'high' ? 11 : 8.5), 0, 1) * 100) : 0;
  const illuminationConfidence = Math.round(clamp((lightLevel - 20) / 70 + (lightAligned ? 0.18 : 0), 0, 1) * 100);
  const magnificationLabel = objective === 'high' ? '400x' : '100x';
  const fieldDiameterLabel = objective === 'high' ? '0.35 mm' : '1.20 mm';
  const viewfinderGlassStyle = useMemo(
    () =>
      ({
        '--viewfinder-beam-opacity': (0.14 + illuminationConfidence / 380).toFixed(2),
        '--viewfinder-halo-opacity': (0.16 + illuminationConfidence / 260).toFixed(2),
        '--viewfinder-vignette-opacity': (0.62 - focusConfidence / 420 + (objective === 'high' ? 0.08 : 0)).toFixed(2),
        '--viewfinder-reticle-opacity': (0.12 + focusConfidence / 420).toFixed(2),
      }) as CSSProperties,
    [focusConfidence, illuminationConfidence, objective],
  );
  const viewfinderFieldStyle = useMemo(
    () =>
      ({
        filter: `blur(${viewMetrics.blur}px) brightness(${(viewMetrics.brightness * (objective === 'high' ? 0.92 : 1)).toFixed(2)}) saturate(${(viewMetrics.saturation + focusConfidence / 420).toFixed(2)}) contrast(${(0.86 + focusConfidence / 220).toFixed(2)})`,
        opacity: slidePlaced ? Math.max(0.28, 0.44 + focusConfidence / 180) : 0.14,
        transform: `translate(${objective === 'high' ? '-4px' : '0px'}, ${objective === 'high' ? '-2px' : '0px'}) scale(${objective === 'high' ? 1.38 : 1.08})`,
      }) as CSSProperties,
    [focusConfidence, objective, slidePlaced, viewMetrics.blur, viewMetrics.brightness, viewMetrics.saturation],
  );

  useEffect(() => {
    stepRef.current = step;
    slidePickedRef.current = slidePicked;
    slidePlacedRef.current = slidePlaced;
  }, [slidePicked, slidePlaced, step]);

  const applyCameraPreset = (preset: CameraPreset) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = new Vector3(0, 2.25, 0);
    const position = new Vector3(6.8, 6.4, 7.9);

    if (preset === 'top') {
      target.set(0, 1.9, 0);
      position.set(0.01, 13.5, 0.01);
    }

    if (preset === 'detail') {
      target.set(0.35, 3.2, 0);
      position.set(2.6, 5.9, 4.4);
    }

    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  };

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    interactiveObjectsRef.current = [];
    sceneObjectsRef.current = {
      eyepiece: null,
      objective: null,
      objectiveLens: null,
      focusKnob: null,
      fineFocusKnob: null,
      lightShell: null,
      lightGlow: null,
      lightBeam: null,
      condenserLens: null,
      stageSurface: null,
      stageGroup: null,
      tubeGroup: null,
      slideBench: null,
      slidePlaced: null,
      slideCover: null,
      sampleLayer: null,
      sampleHalo: null,
      sampleCellsGroup: null,
      stageClipLeft: null,
      stageClipRight: null,
      nosepiece: null,
    };

    const scene = new Scene();
    scene.background = new Color(0x08131f);
    scene.fog = new Fog(0x08131f, 11, 25);
    sceneRef.current = scene;

    const camera = new PerspectiveCamera(40, mountNode.clientWidth / mountNode.clientHeight, 0.1, 100);
    camera.position.set(6.8, 6.4, 7.9);
    camera.lookAt(0, 2.25, 0);
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
    controls.minDistance = 5;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, 2.25, 0);
    controls.update();
    controlsRef.current = controls;

    const ambient = new AmbientLight(0xffffff, 1.34);
    const directional = new DirectionalLight(0xcfe0ff, 1.52);
    directional.position.set(6, 10, 5);
    directional.castShadow = true;
    directional.shadow.mapSize.set(1536, 1536);
    directional.shadow.bias = -0.00008;
    const rim = new DirectionalLight(0x38e0c1, 0.44);
    rim.position.set(-5, 6, -6);
    scene.add(ambient, directional, rim);

    const table = new Mesh(
      new BoxGeometry(13, 0.6, 8),
      createLabWoodMaterial({ color: 0x694734, roughness: 0.74 }),
    );
    table.position.set(0, -0.35, 0);
    table.receiveShadow = true;
    scene.add(table);

    const frame = new Mesh(
      new BoxGeometry(13.3, 0.1, 8.3),
      createLabCoatedMetalMaterial({ color: 0x314e6c, roughness: 0.24, metalness: 0.42 }),
    );
    frame.position.set(0, -0.02, 0);
    scene.add(frame);

    const backPanel = new Mesh(
      new PlaneGeometry(18, 10),
      createLabPlasticMaterial({ color: 0x0d1827, roughness: 0.8, clearcoat: 0.04 }),
    );
    backPanel.position.set(0, 4.6, -4.2);
    scene.add(backPanel);

    const benchGlow = new Mesh(
      new CircleGeometry(4.6, 56),
      new MeshBasicMaterial({ color: 0x72f5ff, transparent: true, opacity: 0.06 }),
    );
    benchGlow.rotation.x = -Math.PI / 2;
    benchGlow.position.y = -0.03;
    scene.add(benchGlow);

    const grid = new GridHelper(11, 18, 0x294766, 0x13314c);
    grid.position.y = -0.01;
    scene.add(grid);

    const microscopeGroup = new Group();
    scene.add(microscopeGroup);

    const bodyMaterial = createLabMetalMaterial({ color: 0xd5e3f0, metalness: 0.58, roughness: 0.24 });
    const accentMaterial = createLabCoatedMetalMaterial({ color: 0x304761, metalness: 0.44, roughness: 0.28 });
    const stageMetalMaterial = createLabMetalMaterial({ color: 0xc3d0db, metalness: 0.82, roughness: 0.3 });
    const darkMaterial = createLabPlasticMaterial({ color: 0x17263c, metalness: 0.16, roughness: 0.48, clearcoat: 0.14 });
    const glassMaterial = createLabGlassMaterial({ color: 0xe6f5ff, opacity: 0.18, transmission: 0.96, thickness: 0.16, attenuationDistance: 1.1, attenuationColor: 0xeaf7ff });
    const coverGlassMaterial = createLabGlassMaterial({ color: 0xb7f2ff, opacity: 0.16, transmission: 0.98, thickness: 0.06, attenuationDistance: 0.42, attenuationColor: 0xd2fbff });
    const sampleMaterial = createLabLiquidMaterial({ color: 0x5db89a, opacity: 0.44, transmission: 0.52, thickness: 0.08, attenuationDistance: 0.28, attenuationColor: 0x7ad2b5 });
    const rubberMaterial = createLabRubberMaterial({ color: 0x1d2837, roughness: 0.84 });

    const base = new Mesh(new BoxGeometry(4.2, 0.45, 3.1), darkMaterial);
    base.position.set(0, 0.25, 0);
    base.castShadow = true;
    base.receiveShadow = true;
    microscopeGroup.add(base);

    const baseInset = new Mesh(new BoxGeometry(3.4, 0.08, 2.35), accentMaterial);
    baseInset.position.set(0.12, 0.49, 0);
    baseInset.castShadow = true;
    microscopeGroup.add(baseInset);

    const leftFoot = new Mesh(new CylinderGeometry(0.22, 0.24, 0.08, 20), rubberMaterial);
    leftFoot.rotation.x = Math.PI / 2;
    leftFoot.position.set(-1.36, 0.05, 1.12);
    const rightFoot = leftFoot.clone();
    rightFoot.position.set(1.34, 0.05, 1.12);
    microscopeGroup.add(leftFoot, rightFoot);

    const pillar = new Mesh(new CylinderGeometry(0.28, 0.34, 2.85, 24), bodyMaterial);
    pillar.position.set(-1.1, 1.65, 0);
    pillar.castShadow = true;
    microscopeGroup.add(pillar);

    const pillarCollar = new Mesh(new CylinderGeometry(0.36, 0.38, 0.18, 24), accentMaterial);
    pillarCollar.position.set(-1.08, 2.75, 0);
    pillarCollar.castShadow = true;
    microscopeGroup.add(pillarCollar);

    const rack = new Mesh(new BoxGeometry(0.2, 1.74, 0.18), accentMaterial);
    rack.position.set(1.08, 2.94, 0.04);
    rack.castShadow = true;
    microscopeGroup.add(rack);

    const arm = new Mesh(new CylinderGeometry(0.22, 0.26, 3.8, 24), bodyMaterial);
    arm.position.set(-0.2, 3.5, 0);
    arm.rotation.z = -0.62;
    arm.castShadow = true;
    microscopeGroup.add(arm);

    const armBrace = new Mesh(new TorusGeometry(0.88, 0.1, 16, 40, Math.PI * 0.78), bodyMaterial);
    armBrace.position.set(-0.18, 2.92, -0.02);
    armBrace.rotation.set(0.08, 0, 0.92);
    armBrace.castShadow = true;
    microscopeGroup.add(armBrace);

    const tubeGroup = new Group();
    microscopeGroup.add(tubeGroup);
    sceneObjectsRef.current.tubeGroup = tubeGroup;

    const tube = new Mesh(new CylinderGeometry(0.4, 0.44, 2.85, 24), bodyMaterial);
    tube.position.set(-0.12, 4.45, 0);
    tube.rotation.z = -0.62;
    tube.castShadow = true;
    tubeGroup.add(tube);

    const eyepiece = new Mesh(new CylinderGeometry(0.26, 0.32, 0.85, 24), rubberMaterial);
    eyepiece.position.set(-0.98, 5.68, 0);
    eyepiece.rotation.z = -0.62;
    eyepiece.castShadow = true;
    eyepiece.userData = { role: 'part', id: 'eyepiece' };
    tubeGroup.add(eyepiece);
    sceneObjectsRef.current.eyepiece = eyepiece;
    interactiveObjectsRef.current.push(eyepiece);

    const eyepieceLens = new Mesh(new CylinderGeometry(0.18, 0.18, 0.03, 18), glassMaterial);
    eyepieceLens.position.set(-1.18, 6.02, 0);
    eyepieceLens.rotation.z = -0.62;
    tubeGroup.add(eyepieceLens);

    const nosepiece = new Mesh(new CylinderGeometry(0.52, 0.6, 0.28, 28), accentMaterial);
    nosepiece.position.set(0.7, 3.22, 0);
    nosepiece.castShadow = true;
    tubeGroup.add(nosepiece);
    sceneObjectsRef.current.nosepiece = nosepiece;

    const sideObjectiveLeft = new Mesh(new CylinderGeometry(0.11, 0.16, 0.64, 18), darkMaterial);
    sideObjectiveLeft.position.set(0.32, 2.78, 0.26);
    sideObjectiveLeft.rotation.z = 0.22;
    sideObjectiveLeft.castShadow = true;
    tubeGroup.add(sideObjectiveLeft);

    const sideObjectiveRight = new Mesh(new CylinderGeometry(0.11, 0.16, 0.72, 18), darkMaterial);
    sideObjectiveRight.position.set(1.05, 2.84, -0.24);
    sideObjectiveRight.rotation.z = -0.24;
    sideObjectiveRight.castShadow = true;
    tubeGroup.add(sideObjectiveRight);

    const objective = new Mesh(new CylinderGeometry(0.16, 0.22, 0.95, 20), darkMaterial);
    objective.position.set(0.72, 2.68, 0);
    objective.castShadow = true;
    objective.userData = { role: 'part', id: 'objective' };
    tubeGroup.add(objective);

    const objectiveLens = new Mesh(new CylinderGeometry(0.1, 0.1, 0.04, 18), glassMaterial);
    objectiveLens.position.set(0.72, 2.18, 0);
    objectiveLens.castShadow = true;
    tubeGroup.add(objectiveLens);
    sceneObjectsRef.current.objective = objective;
    sceneObjectsRef.current.objectiveLens = objectiveLens;
    interactiveObjectsRef.current.push(objective);

    const stageGroup = new Group();
    stageGroup.position.set(0.45, 2.15, 0);
    microscopeGroup.add(stageGroup);
    sceneObjectsRef.current.stageGroup = stageGroup;

    const stageSurface = new Mesh(new BoxGeometry(2.5, 0.18, 2.15), accentMaterial);
    stageSurface.castShadow = true;
    stageSurface.userData = { role: 'action', id: 'stage' };
    stageGroup.add(stageSurface);
    sceneObjectsRef.current.stageSurface = stageSurface;
    interactiveObjectsRef.current.push(stageSurface);

    const stageInset = new Mesh(new BoxGeometry(1.84, 0.04, 1.44), darkMaterial);
    stageInset.position.y = 0.11;
    stageGroup.add(stageInset);

    const apertureRing = new Mesh(new CylinderGeometry(0.42, 0.42, 0.08, 28), stageMetalMaterial);
    apertureRing.position.set(0.06, 0.06, 0.08);
    apertureRing.rotation.x = Math.PI / 2;
    stageGroup.add(apertureRing);

    const condenserLens = new Mesh(new CylinderGeometry(0.28, 0.34, 0.12, 20), glassMaterial);
    condenserLens.position.set(0.04, -0.18, 0.08);
    condenserLens.rotation.x = Math.PI / 2;
    condenserLens.castShadow = true;
    stageGroup.add(condenserLens);
    sceneObjectsRef.current.condenserLens = condenserLens;

    const stageClipLeft = new Mesh(new BoxGeometry(0.15, 0.08, 0.68), stageMetalMaterial);
    stageClipLeft.position.set(-0.7, 0.18, -0.55);
    stageGroup.add(stageClipLeft);
    sceneObjectsRef.current.stageClipLeft = stageClipLeft;

    const stageClipRight = new Mesh(new BoxGeometry(0.15, 0.08, 0.68), stageMetalMaterial);
    stageClipRight.position.set(0.7, 0.18, -0.55);
    stageGroup.add(stageClipRight);
    sceneObjectsRef.current.stageClipRight = stageClipRight;

    const stageKnobLarge = new Mesh(new CylinderGeometry(0.16, 0.16, 0.1, 20), rubberMaterial);
    stageKnobLarge.position.set(1.28, -0.08, 0.48);
    stageKnobLarge.rotation.z = Math.PI / 2;
    stageGroup.add(stageKnobLarge);

    const stageKnobSmall = new Mesh(new CylinderGeometry(0.1, 0.1, 0.08, 20), rubberMaterial);
    stageKnobSmall.position.set(1.38, -0.02, 0.1);
    stageKnobSmall.rotation.z = Math.PI / 2;
    stageGroup.add(stageKnobSmall);

    const slidePlacedMesh = new Mesh(
      new BoxGeometry(1.4, 0.05, 0.76),
      createLabGlassMaterial({ color: 0x8fe9ff, opacity: 0.24, transmission: 0.96, thickness: 0.1, attenuationDistance: 0.9, attenuationColor: 0xa6efff }),
    );
    slidePlacedMesh.position.set(0, 0.16, 0.08);
    slidePlacedMesh.visible = false;
    stageGroup.add(slidePlacedMesh);
    sceneObjectsRef.current.slidePlaced = slidePlacedMesh;

    const sampleLayer = new Mesh(new PlaneGeometry(0.8, 0.46), sampleMaterial);
    sampleLayer.rotation.x = -Math.PI / 2;
    sampleLayer.position.set(0.04, 0.028, 0);
    sampleLayer.visible = true;
    slidePlacedMesh.add(sampleLayer);
    sceneObjectsRef.current.sampleLayer = sampleLayer;

    const sampleHalo = new Mesh(
      new CircleGeometry(0.34, 24),
      new MeshBasicMaterial({ color: 0xf1ffe5, transparent: true, opacity: 0.08, depthWrite: false }),
    );
    sampleHalo.rotation.x = -Math.PI / 2;
    sampleHalo.position.set(0.04, 0.026, 0);
    slidePlacedMesh.add(sampleHalo);
    sceneObjectsRef.current.sampleHalo = sampleHalo;

    const sampleCells = new Group();
    sampleCells.position.set(0.04, 0.03, 0);
    sampleCells.visible = true;
    [
      { x: -0.29, z: -0.13, width: 0.16, depth: 0.11, rotation: -0.12, nucleusX: 0.036, nucleusZ: -0.016, color: 0x96e0bf },
      { x: -0.1, z: -0.13, width: 0.18, depth: 0.12, rotation: 0.08, nucleusX: -0.03, nucleusZ: 0.018, color: 0x8fd9b6 },
      { x: 0.1, z: -0.12, width: 0.16, depth: 0.11, rotation: -0.06, nucleusX: 0.024, nucleusZ: 0.02, color: 0x9be4c5 },
      { x: 0.28, z: -0.1, width: 0.14, depth: 0.12, rotation: 0.11, nucleusX: -0.024, nucleusZ: 0.016, color: 0xa6eccf },
      { x: -0.24, z: 0.08, width: 0.19, depth: 0.12, rotation: 0.03, nucleusX: 0.034, nucleusZ: -0.022, color: 0x92ddb9 },
      { x: -0.02, z: 0.09, width: 0.17, depth: 0.1, rotation: -0.08, nucleusX: -0.028, nucleusZ: 0.012, color: 0x8fd7b1 },
      { x: 0.19, z: 0.08, width: 0.18, depth: 0.12, rotation: 0.06, nucleusX: 0.028, nucleusZ: -0.014, color: 0x9de6c7 },
    ].forEach((seed, index) => {
      const shell = new Mesh(
        new BoxGeometry(seed.width, 0.012, seed.depth),
        createLabGlassMaterial({
          color: seed.color,
          opacity: 0.26,
          transmission: 0.9,
          thickness: 0.03,
          attenuationDistance: 0.22,
          attenuationColor: seed.color,
        }),
      );
      shell.position.set(seed.x, 0, seed.z);
      shell.rotation.y = seed.rotation;
      shell.castShadow = true;
      sampleCells.add(shell);

      const vacuole = new Mesh(
        new CircleGeometry(seed.width * 0.24, 18),
        new MeshBasicMaterial({ color: 0xf4fff6, transparent: true, opacity: 0.18, depthWrite: false }),
      );
      vacuole.position.set(seed.x, 0.008, seed.z);
      vacuole.rotation.x = -Math.PI / 2;
      sampleCells.add(vacuole);

      const nucleus = new Mesh(
        new SphereGeometry(index % 2 === 0 ? 0.022 : 0.018, 14, 14),
        createLabLiquidMaterial({
          color: 0x8562b7,
          opacity: 0.52,
          transmission: 0.36,
          thickness: 0.05,
          attenuationDistance: 0.18,
          attenuationColor: 0xb797df,
        }),
      );
      nucleus.scale.set(1.25, 0.48, 1.08);
      nucleus.position.set(seed.x + seed.nucleusX, 0.01, seed.z + seed.nucleusZ);
      sampleCells.add(nucleus);
    });
    slidePlacedMesh.add(sampleCells);
    sceneObjectsRef.current.sampleCellsGroup = sampleCells;

    const slideCover = new Mesh(new BoxGeometry(0.92, 0.03, 0.58), coverGlassMaterial);
    slideCover.position.set(0.06, 0.042, 0);
    slideCover.visible = true;
    slidePlacedMesh.add(slideCover);
    sceneObjectsRef.current.slideCover = slideCover;

    const lightShell = new Mesh(new CylinderGeometry(0.42, 0.52, 0.52, 20), accentMaterial);
    lightShell.position.set(0.16, 1.25, 0);
    lightShell.castShadow = true;
    lightShell.userData = { role: 'action', id: 'light-module' };
    microscopeGroup.add(lightShell);
    sceneObjectsRef.current.lightShell = lightShell;
    interactiveObjectsRef.current.push(lightShell);

    const lightLens = new Mesh(new CylinderGeometry(0.26, 0.34, 0.08, 20), glassMaterial);
    lightLens.position.set(0.16, 1.47, 0);
    microscopeGroup.add(lightLens);

    const lightBeam = new Mesh(
      new CylinderGeometry(0.2, 0.52, 1.04, 22, 1, true),
      new MeshBasicMaterial({ color: 0xfff0bf, transparent: true, opacity: 0.05, depthWrite: false }),
    );
    lightBeam.position.set(0.12, 1.82, 0.06);
    lightBeam.visible = true;
    microscopeGroup.add(lightBeam);
    sceneObjectsRef.current.lightBeam = lightBeam;

    const lightGlow = new PointLight(0xfff0b5, 0.2, 4.8, 2);
    lightGlow.position.set(0.16, 1.55, 0);
    microscopeGroup.add(lightGlow);
    sceneObjectsRef.current.lightGlow = lightGlow;

    const focusKnob = new Mesh(new CylinderGeometry(0.38, 0.38, 0.26, 24), rubberMaterial);
    focusKnob.position.set(2.1, 3.1, 0);
    focusKnob.rotation.z = Math.PI / 2;
    focusKnob.castShadow = true;
    focusKnob.userData = { role: 'part', id: 'focus' };
    microscopeGroup.add(focusKnob);
    sceneObjectsRef.current.focusKnob = focusKnob;
    interactiveObjectsRef.current.push(focusKnob);

    const fineFocusKnob = new Mesh(new CylinderGeometry(0.2, 0.2, 0.18, 22), accentMaterial);
    fineFocusKnob.position.set(2.16, 3.1, 0);
    fineFocusKnob.rotation.z = Math.PI / 2;
    fineFocusKnob.castShadow = true;
    microscopeGroup.add(fineFocusKnob);
    sceneObjectsRef.current.fineFocusKnob = fineFocusKnob;

    const slideBench = new Mesh(
      new BoxGeometry(1.35, 0.06, 0.72),
      createLabGlassMaterial({ color: 0x7fe4ff, opacity: 0.24, transmission: 0.96, thickness: 0.12, attenuationDistance: 0.8, attenuationColor: 0x97edff }),
    );
    slideBench.position.set(-3.65, 0.55, 1.95);
    slideBench.castShadow = true;
    slideBench.userData = { role: 'action', id: 'slide-bench' };
    scene.add(slideBench);
    sceneObjectsRef.current.slideBench = slideBench;
    interactiveObjectsRef.current.push(slideBench);

    const slideBenchLabel = new Mesh(new BoxGeometry(0.26, 0.02, 0.14), createLabCeramicMaterial({ color: 0xf6f7fa, roughness: 0.5 }));
    slideBenchLabel.position.set(-3.22, 0.61, 1.95);
    scene.add(slideBenchLabel);

    const dish = new Mesh(
      new CylinderGeometry(0.82, 0.9, 0.12, 24),
      createLabCeramicMaterial({ color: 0xe8eef5, roughness: 0.48 }),
    );
    dish.position.set(-3.65, 0.12, 1.95);
    dish.receiveShadow = true;
    scene.add(dish);

    let microscopeModelDispose: (() => void) | null = null;
    let microscopeModelReleased = false;

    void loadLabModelAssetFromManifest('microscope_basic', {
      scale: 1.62,
      position: [0, 0.26, 0],
      rotation: [0, -Math.PI / 2, 0],
    }).then((asset) => {
      if (!asset) return;
      if (microscopeModelReleased) {
        asset.dispose();
        return;
      }
      microscopeModelDispose = asset.dispose;
      microscopeGroup.add(asset.root);
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

      if (stepRef.current === 1 && hitInfo.role === 'part') {
        const partId = hitInfo.id as PartId;
        setIdentifiedParts((current) => {
          if (current.includes(partId)) return current;
          const next = [...current, partId];
          if (next.length === identifyOrder.length) {
            setStep(2);
            setPrompt(stepCopy[2]);
            setPromptTone('success');
          } else {
            setPrompt('继续点击其余关键部件，完成显微镜结构识别。');
            setPromptTone('info');
          }
          return next;
        });
        return;
      }

      if (stepRef.current === 2 && hitInfo.id === 'light-module') {
        setLightAligned((current) => {
          const next = !current;
          setPrompt(next ? '对光已完成，请把亮度调到合适范围。' : '对光已取消，请重新点击光源模块。');
          setPromptTone(next ? 'success' : 'info');
          return next;
        });
        return;
      }

      if (stepRef.current === 3 && hitInfo.id === 'slide-bench' && !slidePlacedRef.current) {
        setSlidePicked(true);
        setPrompt('已拿起载玻片，请点击载物台完成固定。');
        setPromptTone('success');
        return;
      }

      if (stepRef.current === 3 && hitInfo.id === 'stage') {
        if (!slidePickedRef.current) {
          setErrors((value) => value + 1);
          setPrompt('请先点击桌面上的载玻片，再点击载物台。');
          setPromptTone('error');
          return;
        }

        setSlidePicked(false);
        setSlidePlaced(true);
        setPrompt('样本已固定，接下来请保持低倍物镜并调焦。');
        setPromptTone('success');
        return;
      }

      if (stepRef.current === 4 && hitInfo.id === 'focus') {
        setPrompt('现在使用右侧粗调和细调滑块，把视野调清晰。');
        setPromptTone('info');
        return;
      }

      if (stepRef.current === 4 && hitInfo.id === 'objective') {
        setPrompt('保持低倍物镜，先把图像调清晰，再记录观察结果。');
        setPromptTone('info');
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
    applyCameraPreset('front');

    const animate = (time = 0) => {
      frameRef.current = window.requestAnimationFrame(animate);
      const { objective: objectiveMesh, objectiveLens, slidePlaced: slidePlacedMesh, lightBeam, condenserLens, focusKnob, fineFocusKnob, nosepiece, sampleLayer } = sceneObjectsRef.current;
      if (objectiveMesh) {
        objectiveMesh.rotation.y = Math.sin(time * 0.0015) * 0.04;
      }
      if (objectiveLens) {
        objectiveLens.rotation.y = Math.sin(time * 0.0012) * 0.04;
      }
      if (slidePlacedMesh?.visible) {
        slidePlacedMesh.rotation.z = Math.sin(time * 0.0014) * 0.01;
      }
      if (sampleLayer?.visible) {
        sampleLayer.rotation.z = Math.sin(time * 0.0011) * 0.018;
      }
      if (lightBeam) {
        lightBeam.scale.set(1 + Math.sin(time * 0.0019) * 0.015, 1, 1 + Math.cos(time * 0.0017) * 0.015);
      }
      if (condenserLens) {
        condenserLens.rotation.z = Math.sin(time * 0.0011) * 0.04;
      }
      if (focusKnob) {
        focusKnob.scale.setScalar(1 + Math.sin(time * 0.0022) * 0.003);
      }
      if (fineFocusKnob) {
        fineFocusKnob.scale.setScalar(1 + Math.cos(time * 0.0027) * 0.004);
      }
      if (nosepiece) {
        nosepiece.rotation.z = Math.sin(time * 0.0015) * 0.01;
      }
      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      setHoveredPart(null);
      controls.dispose();
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      microscopeModelReleased = true;
      microscopeModelDispose?.();
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
    if (step !== 2 || !lightReady) return;
    setStep(3);
    setPrompt(stepCopy[3]);
    setPromptTone('success');
    setCameraPreset('top');
  }, [lightReady, step]);

  useEffect(() => {
    if (step !== 3 || !slidePlaced) return;
    setStep(4);
    setPrompt(stepCopy[4]);
    setPromptTone('success');
    setCameraPreset('detail');
  }, [slidePlaced, step]);

  useEffect(() => {
    if (step !== 4 || !focusReady) return;
    setStep(5);
    setPrompt('视野已经清晰，已自动进入观察记录步骤。');
    setPromptTone('success');
    setCameraPreset('detail');
  }, [focusReady, step]);

  useEffect(() => {
    applyCameraPreset(cameraPreset);
  }, [cameraPreset]);

  useEffect(() => {
      const {
        eyepiece,
        objective: objectiveMesh,
        objectiveLens,
        focusKnob,
        fineFocusKnob,
        lightShell,
        lightGlow,
        lightBeam,
        condenserLens,
        stageSurface,
        stageGroup,
        tubeGroup,
        slideBench,
        slidePlaced: slidePlacedMesh,
        slideCover,
        sampleLayer,
        sampleHalo,
        sampleCellsGroup,
        stageClipLeft,
        stageClipRight,
        nosepiece,
      } = sceneObjectsRef.current;

    applyEmissive(eyepiece, hoveredPart === 'eyepiece' ? 0x72f5ff : identifiedParts.includes('eyepiece') ? 0x1e5b4e : step === 1 ? 0x103149 : 0x000000, hoveredPart === 'eyepiece' ? 0.96 : identifiedParts.includes('eyepiece') ? 0.75 : step === 1 ? 0.3 : 0.08);
    applyEmissive(objectiveMesh, hoveredPart === 'objective' ? 0x72f5ff : identifiedParts.includes('objective') ? 0x1e5b4e : step === 1 ? 0x103149 : 0x000000, hoveredPart === 'objective' ? 0.96 : identifiedParts.includes('objective') ? 0.75 : step === 1 ? 0.3 : 0.08);
    applyEmissive(focusKnob, hoveredPart === 'focus' ? 0x72f5ff : identifiedParts.includes('focus') ? 0x1e5b4e : step === 1 || step === 4 ? 0x103149 : 0x000000, hoveredPart === 'focus' ? 0.98 : identifiedParts.includes('focus') ? 0.8 : step === 1 || step === 4 ? 0.45 : 0.08);
    applyEmissive(lightShell, hoveredPart === 'light-module' ? 0xffd26a : lightAligned ? 0x7d4a0d : step === 2 ? 0x103149 : 0x000000, hoveredPart === 'light-module' ? 0.92 : lightAligned ? 0.72 : step === 2 ? 0.32 : 0.06);
    applyEmissive(stageSurface, hoveredPart === 'stage' ? 0x72f5ff : slidePicked ? 0x0f493d : step === 3 ? 0x103149 : 0x000000, hoveredPart === 'stage' ? 0.96 : slidePicked ? 0.72 : step === 3 ? 0.32 : 0.06);

    if (lightGlow) {
      lightGlow.intensity = lightAligned ? 0.52 + lightLevel / 24 : 0.12;
      lightGlow.distance = 5.4;
      lightGlow.color.set(lightReady ? 0xfff2c6 : 0xffe1a4);
    }

    if (lightBeam) {
      const material = lightBeam.material;
      lightBeam.visible = lightAligned || step >= 2;
      if (material instanceof MeshBasicMaterial) {
        material.opacity = lightAligned ? 0.05 + lightLevel / 760 : 0.018;
        material.color.set(lightReady ? 0xfff0c2 : 0xaccfff);
      }
    }

    if (condenserLens) {
      const material = condenserLens.material;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        material.emissive = new Color(lightAligned ? 0x6db6ff : 0x000000);
        material.emissiveIntensity = lightAligned ? 0.24 + lightLevel / 220 : 0.04;
      }
    }

    if (stageGroup) {
      stageGroup.position.y = 2.15 + coarseFocus * 0.0042;
    }

    if (tubeGroup) {
      tubeGroup.position.y = -coarseFocus * 0.0024 - fineFocus * 0.0012;
    }

    if (focusKnob) {
      focusKnob.rotation.set(coarseFocus * 0.03, 0, Math.PI / 2);
    }

    if (fineFocusKnob) {
      fineFocusKnob.rotation.set(fineFocus * 0.045, 0, Math.PI / 2);
    }

    if (slideBench) {
      slideBench.visible = !slidePlaced;
      applyEmissive(slideBench, hoveredPart === 'slide-bench' ? 0x72f5ff : slidePicked ? 0x1d6b79 : step === 3 ? 0x15485a : 0x000000, hoveredPart === 'slide-bench' ? 0.96 : slidePicked ? 0.95 : step === 3 ? 0.32 : 0.06);
    }

    if (slidePlacedMesh) {
      slidePlacedMesh.visible = slidePlaced;
    }

    if (stageClipLeft && stageClipRight) {
      stageClipLeft.position.x = slidePlaced ? -0.56 : -0.7;
      stageClipRight.position.x = slidePlaced ? 0.56 : 0.7;
    }

    if (slideCover) {
      slideCover.visible = slidePlaced;
    }

    if (sampleLayer) {
      sampleLayer.visible = slidePlaced;
      const material = sampleLayer.material;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        material.opacity = slidePlaced ? Math.max(0.18, 0.52 - viewMetrics.blur * 0.016) : 0.02;
        material.roughness = slidePlaced ? 0.12 + viewMetrics.blur * 0.04 : 0.3;
        material.emissive = new Color(0x1a3d32);
        material.emissiveIntensity = slidePlaced ? 0.04 + illuminationConfidence / 900 : 0;
      }
    }

    if (sampleHalo) {
      sampleHalo.visible = slidePlaced;
      const material = sampleHalo.material;
      if (material instanceof MeshBasicMaterial) {
        material.opacity = slidePlaced ? 0.04 + illuminationConfidence / 600 + focusConfidence / 1200 : 0;
        material.color.set(lightReady ? 0xf7ffdd : 0xc2e5ff);
      }
    }

    if (sampleCellsGroup) {
      sampleCellsGroup.visible = slidePlaced;
      sampleCellsGroup.scale.setScalar(objective === 'high' ? 1.12 : 1);
      sampleCellsGroup.position.x = objective === 'high' ? 0.03 : 0.04;
    }

    if (objectiveMesh) {
      objectiveMesh.scale.set(objective === 'high' ? 1.08 : 1, objective === 'high' ? 1.14 : 1, objective === 'high' ? 1.08 : 1);
      objectiveMesh.position.y = objective === 'high' ? 2.62 : 2.68;
    }

    if (objectiveLens) {
      const material = objectiveLens.material;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        material.emissive = new Color(lightReady ? 0x6ca7ff : 0x103149);
        material.emissiveIntensity = lightReady ? 0.4 + focusConfidence / 320 : 0.12;
      }
    }

    if (nosepiece) {
      nosepiece.rotation.y = objective === 'high' ? 0.34 : 0;
    }
  }, [
    coarseFocus,
    fineFocus,
    focusConfidence,
    hoveredPart,
    identifiedParts,
    illuminationConfidence,
    lightAligned,
    lightLevel,
    lightReady,
    objective,
    slidePicked,
    slidePlaced,
    step,
    viewMetrics.blur,
  ]);

  const handleResetLab = () => {
    reportReset('显微镜实验已重置，开始新的观察尝试。');
    setStep(1);
    setIdentifiedParts([]);
    setLightAligned(false);
    setLightLevel(42);
    setSlidePicked(false);
    setSlidePlaced(false);
    setCoarseFocus(30);
    setFineFocus(24);
    setObjective('low');
    setObservationChoice('');
    setCompleted(false);
    setPrompt(stepCopy[1]);
    setPromptTone('info');
    setCameraPreset('front');
  };

  const handleCoarseFocusChange = (value: number) => {
    setCoarseFocus(value);
    if (step >= 4) {
      setPrompt(coarseReady || Math.abs(value - 62) <= 10 ? '粗调已经接近清晰范围，现在可以继续细调。' : '请先继续粗调，让样本轮廓先大致清晰。');
      setPromptTone('info');
    }
  };

  const handleFineFocusChange = (value: number) => {
    if (step < 4) return;
    if (!coarseReady) {
      setErrors((current) => current + 1);
      setPrompt('请先完成粗调，再进行细调。现在样本整体还没有进入清晰范围。');
      setPromptTone('error');
      return;
    }

    setFineFocus(value);
    setPrompt(Math.abs(value - 52) <= 6 ? '细调已接近最佳清晰范围。' : '继续细调，直到细胞边界更清楚。');
    setPromptTone('info');
  };

  const handleObjectiveChange = (next: ObjectiveMode) => {
    if (step < 4) return;
    if (next === 'high' && !focusReady) {
      setErrors((value) => value + 1);
      setPrompt('请先使用低倍物镜把图像调清晰，再考虑更高倍率。');
      setPromptTone('error');
      return;
    }

    setObjective(next);
    setPrompt(next === 'low' ? '已切回低倍物镜，请继续调焦。' : '已切换更高倍率，请继续观察。');
    setPromptTone('info');
  };

  const handleSubmitObservation = () => {
    if (step !== 5) return;

    if (observationChoice !== 'onion-cells') {
      setErrors((value) => value + 1);
      setPrompt('观察记录不准确。提示：初中常见装片可见规则细胞壁。');
      setPromptTone('error');
      return;
    }

    setCompleted(true);
    setPrompt('实验完成。你已完成对光、放片、调焦和观察记录。');
    setPromptTone('success');
    setCameraPreset('detail');
  };

  const sceneNoteTone = focusReady ? 'valid' : promptTone === 'error' ? 'invalid' : 'neutral';
  const hoveredPartCopy = hoveredPart ? microscopeHoverCopy[hoveredPart] : null;
  const microscopeApparatusIds = ['microscope', 'slide-kit', 'dropper-pipette', 'tweezers'];
  const microscopeActiveApparatusId = useMemo(() => {
    if (hoveredPart === 'slide-bench') return 'slide-kit';
    if (hoveredPart === 'eyepiece' || hoveredPart === 'objective' || hoveredPart === 'focus' || hoveredPart === 'light-module' || hoveredPart === 'stage') return 'microscope';
    if (slidePicked && !slidePlaced) return 'tweezers';
    if (slidePlaced) return 'slide-kit';
    return 'microscope';
  }, [hoveredPart, slidePicked, slidePlaced]);
  const microscopeRuntimeContext = useMemo(
    () => ({
      experimentId: experiment.id,
      step,
      completed,
      progress: Math.min(1, [lightReady, slidePlaced, focusReady, completed].filter(Boolean).length / 4),
      focusId: hoveredPart,
      flags: {
        lightReady,
        slidePicked,
        slidePlaced,
        focusReady,
        coarseReady,
        fineReady,
      },
      metrics: {
        lightLevel,
        blur: viewMetrics.blur,
        focusConfidence,
        illuminationConfidence,
      },
      values: {
        objective: objective === 'low' ? '低倍物镜' : '高倍物镜',
        magnification: magnificationLabel,
        clarity: viewMetrics.clarityLabel,
        fieldDiameter: fieldDiameterLabel,
        stainState: '未染色',
      },
    }),
    [
      coarseReady,
      completed,
      experiment.id,
      fineReady,
      focusReady,
      hoveredPart,
      lightLevel,
      lightReady,
      illuminationConfidence,
      magnificationLabel,
      objective,
      slidePicked,
      slidePlaced,
      step,
      fieldDiameterLabel,
      focusConfidence,
      viewMetrics.blur,
      viewMetrics.clarityLabel,
    ],
  );
  const microscopeSimulationRuntime = useMemo(
    () => createSimulationRuntimeFromApparatus({
      playerId: 'microscope-lab-player',
      apparatusIds: microscopeApparatusIds,
      runtimeContext: microscopeRuntimeContext,
      activeApparatusId: microscopeActiveApparatusId,
      phaseLabel: stepTitles[step],
      phaseState: completed ? 'completed' : 'active',
      progress: completed ? 1 : Math.min(0.96, ((step - 1) / 4) + (focusReady ? 0.18 : slidePlaced ? 0.1 : 0)),
      focusTarget: hoveredPartCopy?.title ?? (slidePlaced ? '载物台样本' : '显微镜主体'),
      focusLens: !slidePlaced ? 'macro' : objective === 'high' ? 'micro' : 'meso',
      stateSummary: `${lightReady ? '光路就绪' : '光路待校准'} · ${slidePlaced ? '样本已固定' : slidePicked ? '已取片待放置' : '尚未放片'} · 视野${viewMetrics.clarityLabel} · ${magnificationLabel}`,
      observables: [
        { key: 'light-level', label: '光照强度', value: lightLevel, unit: '%' },
        { key: 'light-balance', label: '照明稳定度', value: illuminationConfidence, unit: '%', status: illuminationConfidence >= 72 ? 'nominal' : 'warning' },
        { key: 'clarity', label: '视野清晰度', value: viewMetrics.clarityLabel, status: focusReady ? 'nominal' : 'warning' },
        { key: 'blur', label: '模糊半径', value: viewMetrics.blur, unit: 'px', status: viewMetrics.blur <= 2 ? 'nominal' : 'warning' },
        { key: 'focus-score', label: '对焦可信度', value: focusConfidence, unit: '%', status: focusConfidence >= 78 ? 'nominal' : 'warning' },
        { key: 'objective', label: '物镜倍率', value: objective === 'low' ? '低倍' : '高倍' },
        { key: 'sample-state', label: '样本状态', value: slidePlaced ? '已固定' : slidePicked ? '待放置' : '未取片' },
      ],
      controls: [
        { key: 'light-control', label: '亮度调节', value: lightLevel, unit: '%', kind: 'slider' },
        { key: 'coarse-focus', label: '粗调旋钮', value: coarseFocus, kind: 'dial' },
        { key: 'fine-focus', label: '细调旋钮', value: fineFocus, kind: 'dial' },
        { key: 'objective-switch', label: '物镜切换', value: objective === 'low' ? '低倍' : '高倍', kind: 'discrete' },
        { key: 'camera-preset', label: '镜头机位', value: cameraPreset, kind: 'discrete' },
      ],
      phases: microscopeStepOrder.map((stepId) => ({
        key: `step-${stepId}`,
        label: stepTitles[stepId],
        state: completed || step > stepId || (stepId === 5 && completed) ? 'completed' : step === stepId ? 'active' : 'pending',
      })),
      failureRisks: [
        !lightReady ? '未形成稳定透光条件，后续调焦和观察都会失真。' : '',
        step >= 3 && !slidePlaced ? '样本尚未固定到载物台，视野读数没有 ground truth。' : '',
        objective === 'high' && !completed ? '在低倍未调清前切到高倍，容易丢失目标样本。' : '',
      ],
      trace: [
        '光源 -> 聚光器 -> 载玻片 -> 物镜 -> 目镜',
        focusReady ? '低倍定位 -> 粗调 -> 细调 -> 清晰成像' : '先对光，再在低倍下完成粗调与细调',
      ],
    }),
    [
      cameraPreset,
      coarseFocus,
      completed,
      fineFocus,
      fieldDiameterLabel,
      focusReady,
      focusConfidence,
      hoveredPartCopy?.title,
      illuminationConfidence,
      lightLevel,
      lightReady,
      magnificationLabel,
      microscopeActiveApparatusId,
      microscopeApparatusIds,
      microscopeRuntimeContext,
      objective,
      slidePicked,
      slidePlaced,
      step,
      viewMetrics.blur,
      viewMetrics.clarityLabel,
    ],
  );

  useEffect(() => {
    onSimulationRuntimeChange?.(microscopeSimulationRuntime);
  }, [microscopeSimulationRuntime, onSimulationRuntimeChange]);

  useEffect(() => () => {
    onSimulationRuntimeChange?.(null);
  }, [onSimulationRuntimeChange]);

  const microscopeWorkbenchStatus =
    step === 1
      ? '先点击显微镜上的目镜、物镜和调焦旋钮，完成结构识别。'
      : step === 2
        ? '点击光源完成对光，再把亮度调到合适范围。'
        : step === 3
          ? '先点桌面载玻片，再点载物台固定样本。'
          : step === 4
            ? '保持低倍物镜，先粗调后细调，直到视野清晰。'
            : completed
              ? '实验完成，可继续切换视角和倍率复盘清晰视野。'
              : '根据视野中的结构特征，选择正确的观察结果。';
  const microscopeCompletionCopy = completed
    ? '实验已完成，当前版本支持结构识别、对光、放片、粗细调焦和视野判断。'
    : '当前还未完成最终观察提交，请先把视野调到清晰再判断。';

  return (
    <section className="playground-panel panel microscope-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">3D Demo</span>
          <h2>{experiment.title} · 本地 3D 实验 Demo</h2>
        </div>
        <div className="badge-row compact">
          <span className="badge">步骤 {step}/5</span>
          <span className="badge">亮度 {lightLevel}%</span>
          <span className="badge">视野 {viewMetrics.clarityLabel}</span>
          <span className="badge">得分 {score}</span>
        </div>
      </div>

      <div className="playground-grid microscope-grid">
        <aside className="playground-side microscope-side-rail microscope-side-rail-left">
          <div className="info-card microscope-rail-card">
            <strong>结构识别</strong>
            <div className="equipment-list">
              {identifyOrder.map((part) => (
                <span className={identifiedParts.includes(part) ? 'equipment-tag identified' : 'equipment-tag'} key={part}>
                  {partLabels[part]}
                </span>
              ))}
            </div>
          </div>

          <div className="info-card microscope-rail-card">
            <strong>步骤总览</strong>
            <ol className="step-list compact-list">
              {microscopeStepOrder.map((stepId) => (
                <li className={step === stepId ? 'active' : step > stepId || (stepId === 5 && completed) ? 'done' : ''} key={stepId}>
                  {stepTitles[stepId]}
                </li>
              ))}
            </ol>
            <div className={`microscope-rail-prompt tone-${promptTone}`}>
              <span>当前提示</span>
              <p>{prompt}</p>
            </div>
          </div>
        </aside>

        <div className="scene-panel microscope-workbench-stage">
          <div className="scene-toolbar microscope-workbench-toolbar">
            <div className="microscope-toolbar-head">
              <div className="microscope-toolbar-kicker">显微镜工作台</div>
              <strong>{experiment.title}</strong>
              <p className="microscope-toolbar-copy">对光、放片、调焦和观察结果都回到舞台底部工作台，显微镜本体保持最大可操作面积。</p>
            </div>
            <div className="camera-actions microscope-camera-actions">
              <button className={cameraPreset === 'front' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('front')} type="button">
                正视角
              </button>
              <button className={cameraPreset === 'top' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('top')} type="button">
                俯视图
              </button>
              <button className={cameraPreset === 'detail' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('detail')} type="button">
                聚焦镜头
              </button>
            </div>
          </div>

          <div className="scene-meta-strip microscope-stage-meta">
            <div className={`microscope-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>
                步骤 {step} · {stepTitles[step]}
              </strong>
              <p>{prompt}</p>
            </div>
            <div className="microscope-step-pills" aria-label="实验步骤概览">
              {microscopeStepOrder.map((stepId) => (
                <span className={step === stepId ? 'microscope-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'microscope-step-pill done' : 'microscope-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="scene-canvas microscope-scene-canvas">
            <div className="three-stage-mount microscope-three-mount" ref={mountRef} />
          </div>

          <div className="workbench-inline-dock microscope-workbench-dock">
            <div className="microscope-workbench-status-grid">
              <div className={`info-card microscope-status-card ${sceneNoteTone === 'invalid' ? 'tone-error' : sceneNoteTone === 'valid' ? 'tone-success' : ''}`.trim()}>
                <span>当前进度</span>
                <strong>
                  步骤 {step} · {stepTitles[step]}
                </strong>
                <p>{microscopeWorkbenchStatus}</p>
              </div>
              <div className={`info-card microscope-status-card ${lightReady ? 'tone-success' : ''}`.trim()}>
                <span>对光状态</span>
                <strong>{lightReady ? '对光完成' : '等待对光'}</strong>
                <p>亮度 {lightLevel}% · {lightAligned ? '光路已对准' : '尚未点击光源'}</p>
              </div>
              <div className={`info-card microscope-status-card ${focusReady ? 'tone-success' : ''}`.trim()}>
                <span>调焦状态</span>
                <strong>{focusReady ? '视野清晰' : '等待调焦'}</strong>
                <p>粗调 {coarseReady ? '到位' : '未到位'} · 细调 {fineReady ? '到位' : '未到位'}</p>
              </div>
              <div className="info-card microscope-status-card">
                <span>样本与倍率</span>
                <strong>{slidePlaced ? '已放片' : slidePicked ? '已取片待放置' : '未取片'} · {magnificationLabel}</strong>
                <p>视野 {viewMetrics.clarityLabel} · 视场 {fieldDiameterLabel}</p>
              </div>
            </div>

            <ReusableApparatusDock
              activeApparatusId={microscopeActiveApparatusId}
              apparatusIds={microscopeApparatusIds}
              contextLabel="显微镜、玻片、滴管和镊子已经按统一生物器材底座建模，后续可直接复用到更多制片与显微实验。"
              experiment={experiment}
              runtimeContext={microscopeRuntimeContext}
              title="显微观察器材引擎"
            />

            <div className="microscope-inline-controls">
              <section className="info-card microscope-inline-panel microscope-controls">
                <strong>实验控制</strong>
                <div className="status-pill-row">
                  <span className={lightReady ? 'status-pill ready' : 'status-pill'}>对光 {lightReady ? '完成' : '未完成'}</span>
                  <span className={slidePlaced ? 'status-pill ready' : 'status-pill'}>放片 {slidePlaced ? '完成' : '未完成'}</span>
                  <span className={focusReady ? 'status-pill ready' : 'status-pill'}>调焦 {focusReady ? '完成' : '未完成'}</span>
                  <span className={coarseReady ? 'status-pill ready' : 'status-pill'}>粗调 {coarseReady ? '到位' : '未到位'}</span>
                  <span className={fineReady ? 'status-pill ready' : 'status-pill'}>细调 {fineReady ? '到位' : '未到位'}</span>
                </div>
                <label className="range-block">
                  <span>光照亮度</span>
                  <input type="range" min="20" max="100" value={lightLevel} onChange={(event) => setLightLevel(Number(event.target.value))} disabled={step < 2} />
                  <small>目标范围 58% - 82%</small>
                </label>
                <div className="objective-block">
                  <span>物镜倍率</span>
                  <div className="camera-actions microscope-objective-actions">
                    <button className={objective === 'low' ? 'scene-action active' : 'scene-action'} onClick={() => handleObjectiveChange('low')} type="button" disabled={step < 4}>
                      低倍物镜
                    </button>
                    <button className={objective === 'high' ? 'scene-action active' : 'scene-action'} onClick={() => handleObjectiveChange('high')} type="button" disabled={step < 4 && !completed}>
                      高倍物镜
                    </button>
                  </div>
                </div>
                <label className="range-block">
                  <span>粗调焦距</span>
                  <input type="range" min="0" max="100" value={coarseFocus} onChange={(event) => handleCoarseFocusChange(Number(event.target.value))} disabled={step < 4} />
                  <small>当前 {coarseFocus} · 建议靠近 62</small>
                </label>
                <label className="range-block">
                  <span>细调焦距</span>
                  <input type="range" min="0" max="100" value={fineFocus} onChange={(event) => handleFineFocusChange(Number(event.target.value))} disabled={step < 4 || !canUseFineFocus} />
                  <small>当前 {fineFocus} · 建议靠近 52{canUseFineFocus ? '' : ' · 需先完成粗调'}</small>
                </label>
                <button className="action-button ghost" onClick={handleResetLab} type="button">
                  重置显微镜实验
                </button>
              </section>

              <section className="info-card microscope-inline-panel">
                <strong>操作反馈</strong>
                <div className="detail-list">
                  <div className="detail-row">
                    <div className="detail-copy">
                      <strong>当前视野</strong>
                      <small>{slidePlaced ? `亮度 ${viewMetrics.brightness} · 饱和度 ${viewMetrics.saturation} · 对焦可信度 ${focusConfidence}%` : '需先完成放片，才能看到清晰样本视野。'}</small>
                    </div>
                    <span className={slidePlaced ? 'status-pill ready' : 'status-pill'}>{viewMetrics.clarityLabel}</span>
                  </div>
                  <div className="detail-row">
                    <div className="detail-copy">
                      <strong>悬停部件</strong>
                      <small>{hoveredPartCopy?.detail ?? '把鼠标移到目镜、物镜、调焦旋钮、光源或载玻片上，可以查看操作意义。'}</small>
                    </div>
                    <span className={hoveredPartCopy ? 'status-pill ready' : 'status-pill'}>{hoveredPartCopy?.title ?? '无'}</span>
                  </div>
                  <div className="detail-row">
                    <div className="detail-copy">
                      <strong>样本状态</strong>
                      <small>{slidePlaced ? '样本已固定在载物台上，可继续调焦观察。' : slidePicked ? '已取下载玻片，请点击载物台完成放置。' : '请先点击桌面载玻片取片。'}</small>
                    </div>
                    <span className={slidePlaced ? 'status-pill ready' : 'status-pill'}>{slidePlaced ? '已固定' : slidePicked ? '待放置' : '未取片'}</span>
                  </div>
                </div>
              </section>
            </div>

            <section className="info-card microscope-inline-panel">
              <strong>观察视野</strong>
              <div className="microscope-viewfinder">
                <div className="viewfinder-glass" style={viewfinderGlassStyle}>
                  <span className="viewfinder-scale-label">{magnificationLabel}</span>
                  <span className="viewfinder-focus-readout">对焦 {focusConfidence}%</span>
                  <div className="viewfinder-dust-layer" aria-hidden="true">
                    {microscopeViewfinderDust.map((artifact) => (
                      <span
                        className="viewfinder-dust"
                        key={artifact.id}
                        style={{
                          left: artifact.left,
                          top: artifact.top,
                          width: `${artifact.size}px`,
                          height: `${artifact.size}px`,
                          opacity: artifact.opacity,
                          animationDelay: `${artifact.delay}s`,
                          animationDuration: `${artifact.duration}s`,
                        } as CSSProperties}
                      />
                    ))}
                  </div>
                  <div className={`viewfinder-sample ${slidePlaced ? 'visible' : ''}`} style={viewfinderFieldStyle}>
                    {microscopeViewfinderCells.map((cell) => (
                      <span
                        className="microscope-cell"
                        key={cell.id}
                        style={{
                          left: cell.left,
                          top: cell.top,
                          width: cell.width,
                          height: cell.height,
                          '--cell-rotate': `${cell.rotate}deg`,
                          '--cell-wall': cell.wallTone,
                          '--cell-fill': cell.fillTone,
                          '--cell-nucleus-x': cell.nucleusX,
                          '--cell-nucleus-y': cell.nucleusY,
                          '--cell-nucleus-scale': String(cell.nucleusScale),
                        } as CSSProperties}
                      />
                    ))}
                  </div>
                  <span className="viewfinder-crosshair" />
                </div>
                <div className="badge-row compact microscope-metrics">
                  <span className="badge">清晰度 {viewMetrics.clarityLabel}</span>
                  <span className="badge">模糊 {viewMetrics.blur}px</span>
                  <span className="badge">亮度 {viewMetrics.brightness}</span>
                  <span className="badge">倍率 {magnificationLabel}</span>
                </div>
              </div>
            </section>

            {step === 5 || completed ? (
              <div className="microscope-summary-dock">
                <div className="microscope-summary-head">
                  <div>
                    <span>观察记录</span>
                    <strong>可见规则排列的细胞，边界较清楚，像洋葱表皮细胞</strong>
                  </div>
                  <button className="action-button microscope-submit-button" onClick={handleSubmitObservation} type="button" disabled={step !== 5 || completed}>
                    {completed ? '已完成' : '提交观察结果'}
                  </button>
                </div>
                <div className="microscope-choice-row">
                  <button className={observationChoice === 'dots' ? 'summary-choice active' : 'summary-choice'} onClick={() => setObservationChoice('dots')} type="button">
                    视野中只有随机散点，没有明显细胞边界
                  </button>
                  <button className={observationChoice === 'onion-cells' ? 'summary-choice active' : 'summary-choice'} onClick={() => setObservationChoice('onion-cells')} type="button">
                    可见规则排列的细胞，边界较清楚，像洋葱表皮细胞
                  </button>
                  <button className={observationChoice === 'black-screen' ? 'summary-choice active' : 'summary-choice'} onClick={() => setObservationChoice('black-screen')} type="button">
                    视野始终全黑，说明样本特征本身不可见
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="playground-side microscope-side-rail microscope-side-rail-right">
          <div className="info-card microscope-rail-card">
            <strong>实验状态</strong>
            <div className="microscope-mini-metrics">
              <div className="microscope-mini-metric">
                <span>亮度</span>
                <strong>{lightLevel}%</strong>
              </div>
              <div className="microscope-mini-metric">
                <span>倍率</span>
                <strong>{objective === 'low' ? '低倍' : '高倍'}</strong>
              </div>
              <div className="microscope-mini-metric">
                <span>粗调</span>
                <strong>{coarseReady ? '到位' : '未到位'}</strong>
              </div>
              <div className="microscope-mini-metric">
                <span>细调</span>
                <strong>{fineReady ? '到位' : '未到位'}</strong>
              </div>
            </div>
          </div>

          <div className={completed ? 'info-card success-card microscope-rail-card' : 'info-card microscope-rail-card'}>
            <strong>完成状态</strong>
            <p>{microscopeCompletionCopy}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
