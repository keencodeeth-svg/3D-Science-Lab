import { useEffect, useMemo, useRef, useState } from 'react';
import { AmbientLight, BoxGeometry, BufferGeometry, CircleGeometry, Clock, Color, ConeGeometry, CylinderGeometry, DirectionalLight, Fog, Group, Line, LineBasicMaterial, LineDashedMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Raycaster, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import { attachLabRealism, createLabCoatedMetalMaterial, createLabGlassMaterial, createLabMetalMaterial, createLabCeramicMaterial, createLabWoodMaterial } from '../lib/threeRealism';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { ExperimentConfig } from '../types/experiment';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'wide' | 'side' | 'focus';
type PartId = 'candle' | 'lens' | 'screen';
type ObservationZone = 'gt2f' | 'between-f-2f' | 'lt-f';

interface ConvexLensLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
}

interface HitInfo {
  role?: string;
  id?: string;
}

interface ObservationRecord {
  id: string;
  zone: ObservationZone;
  objectDistance: number;
  screenDistance: number;
  imageDistance: number | null;
  imageNature: string;
  focus: number;
}

interface VisualRefs {
  candleTray: Group | null;
  lensTray: Group | null;
  screenTray: Group | null;
  candle: Group | null;
  candleFlame: Mesh | null;
  lensGroup: Group | null;
  screenGroup: Group | null;
  screenPanel: Mesh | null;
  screenProjection: Group | null;
  screenProjectionBody: Mesh | null;
  screenProjectionFlame: Mesh | null;
  virtualImage: Group | null;
  virtualFlame: Mesh | null;
  rayGroup: Group | null;
  focalMarkers: Group | null;
}

const partOrder: PartId[] = ['candle', 'lens', 'screen'];
const partLabels: Record<PartId, string> = {
  candle: '蜡烛',
  lens: '凸透镜',
  screen: '光屏',
};
const zoneLabels: Record<ObservationZone, string> = {
  'gt2f': '物距大于 2f',
  'between-f-2f': '物距在 f 与 2f 之间',
  'lt-f': '物距小于 f',
};
const stepCopy: Record<StepId, string> = {
  1: '先点击 3D 台面中的蜡烛、凸透镜和光屏，把光具座搭建完整。',
  2: '把蜡烛移到 2f 以外，移动光屏接到清晰的倒立缩小实像后记录。',
  3: '把蜡烛移到 f 与 2f 之间，再次移动光屏接到清晰的倒立放大实像后记录。',
  4: '把蜡烛移到一倍焦距内，观察光屏上不能成实像，但同侧可见正立放大虚像。',
  5: '根据三种情况，总结凸透镜成像规律。',
};
const stepTitles: Record<StepId, string> = {
  1: '搭建光具座',
  2: '记录 2f 外成像',
  3: '记录 f~2f 成像',
  4: '观察一倍焦距内虚像',
  5: '总结成像规律',
};

const lensStepOrder: StepId[] = [1, 2, 3, 4, 5];

const lensHoverCopy: Record<string, { title: string; detail: string }> = {
  candle: { title: '蜡烛', detail: '物体位置决定像的大小与虚实，移动蜡烛就是改变物距。' },
  lens: { title: '凸透镜', detail: '凸透镜会让平行光会聚，是形成实像和虚像的核心器材。' },
  screen: { title: '光屏', detail: '只有实像才能落在光屏上，清晰度由像距与光屏位置是否重合决定。' },
};

const FOCAL_LENGTH = 2.0;
const AXIS_Y = 1.9;
const OBJECT_HEIGHT = 1.1;
const FOCUS_TOLERANCE = 0.48;

function toCentimeter(value: number) {
  return Math.round(value * 10);
}

function recordId() {
  return `lens-record-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
    if (material instanceof MeshStandardMaterial) {
      material.emissive = new Color(color);
      material.emissiveIntensity = intensity;
    }
  });
}

export function ConvexLensLabPlayer({ experiment, onTelemetry }: ConvexLensLabPlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const frameRef = useRef<number | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const interactiveObjectsRef = useRef<Object3D[]>([]);
  const rayMaterialsRef = useRef<Array<LineBasicMaterial | LineDashedMaterial>>([]);
  const visualRefs = useRef<VisualRefs>({
    candleTray: null,
    lensTray: null,
    screenTray: null,
    candle: null,
    candleFlame: null,
    lensGroup: null,
    screenGroup: null,
    screenPanel: null,
    screenProjection: null,
    screenProjectionBody: null,
    screenProjectionFlame: null,
    virtualImage: null,
    virtualFlame: null,
    rayGroup: null,
    focalMarkers: null,
  });
  const stepRef = useRef<StepId>(1);
  const placedPartsRef = useRef<PartId[]>([]);

  const [step, setStep] = useState<StepId>(1);
  const [placedParts, setPlacedParts] = useState<PartId[]>([]);
  const [objectDistance, setObjectDistance] = useState(5.2);
  const [screenDistance, setScreenDistance] = useState(3.3);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('wide');
  const [showRays, setShowRays] = useState(true);
  const [records, setRecords] = useState<ObservationRecord[]>([]);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [prompt, setPrompt] = useState(stepCopy[1]);
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);

  const score = Math.max(74, 100 - errors * 5);
  const setupReady = placedParts.length === partOrder.length;
  const observationZone = useMemo<ObservationZone>(() => {
    if (objectDistance > FOCAL_LENGTH * 2) return 'gt2f';
    if (objectDistance > FOCAL_LENGTH) return 'between-f-2f';
    return 'lt-f';
  }, [objectDistance]);
  const realImageDistance = useMemo(() => {
    if (objectDistance <= FOCAL_LENGTH) return null;
    return Number(((FOCAL_LENGTH * objectDistance) / (objectDistance - FOCAL_LENGTH)).toFixed(2));
  }, [objectDistance]);
  const virtualImageDistance = useMemo(() => {
    if (objectDistance >= FOCAL_LENGTH) return null;
    return Number(((FOCAL_LENGTH * objectDistance) / (FOCAL_LENGTH - objectDistance)).toFixed(2));
  }, [objectDistance]);
  const magnification = useMemo(() => {
    if (realImageDistance) return Number((realImageDistance / objectDistance).toFixed(2));
    if (virtualImageDistance) return Number((virtualImageDistance / objectDistance).toFixed(2));
    return 1;
  }, [objectDistance, realImageDistance, virtualImageDistance]);
  const screenFocus = useMemo(() => {
    if (!realImageDistance) return 0;
    return Number(Math.max(0, 1 - Math.abs(screenDistance - realImageDistance) / FOCUS_TOLERANCE).toFixed(2));
  }, [realImageDistance, screenDistance]);
  const sharpEnough = realImageDistance !== null && screenFocus >= 0.84;
  const imageNature = useMemo(() => {
    if (observationZone === 'lt-f') return '正立放大虚像';
    if (Math.abs(objectDistance - FOCAL_LENGTH * 2) < 0.18 && sharpEnough) return '倒立等大实像';
    if (observationZone === 'gt2f') return '倒立缩小实像';
    return '倒立放大实像';
  }, [objectDistance, observationZone, sharpEnough]);
  const focusLabel = screenFocus >= 0.88 ? '清晰' : screenFocus >= 0.62 ? '较清晰' : '模糊';
  const observedZones = new Set(records.map((item) => item.zone));

  useEffect(() => {
    stepRef.current = step;
    placedPartsRef.current = placedParts;
  }, [placedParts, step]);

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

  const applyCameraPreset = (preset: CameraPreset) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = new Vector3(0.5, 1.85, 0);
    const position = new Vector3(0.2, 7.2, 13.2);

    if (preset === 'side') {
      target.set(0.5, 1.95, 0);
      position.set(0.5, 4.8, 10.5);
    }

    if (preset === 'focus') {
      target.set(Math.min(2.6, screenDistance * 0.6), 2.05, 0);
      position.set(Math.min(4.8, screenDistance + 2.2), 3.8, 6.8);
    }

    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  };

  const handlePlacePart = (partId: PartId) => {
    if (stepRef.current !== 1) return;
    setPlacedParts((currentParts) => {
      if (currentParts.includes(partId)) return currentParts;
      const next = [...currentParts, partId];
      if (next.length === partOrder.length) {
        setStep(2);
        setPrompt(stepCopy[2]);
        setPromptTone('success');
        setCameraPreset('side');
      } else {
        setPrompt(`已放置${partLabels[partId]}，继续补全剩余器材。`);
        setPromptTone('info');
      }
      return next;
    });
  };

  const handleQuickDistance = (zone: ObservationZone) => {
    if (step < 2 || completed) return;
    const nextDistance = zone === 'gt2f' ? 5.2 : zone === 'between-f-2f' ? 3.1 : 1.6;
    setObjectDistance(nextDistance);
    if (zone !== 'lt-f') {
      const targetImageDistance = (FOCAL_LENGTH * nextDistance) / (nextDistance - FOCAL_LENGTH);
      setScreenDistance(Number(targetImageDistance.toFixed(2)));
    }
    setPrompt(`已切换到“${zoneLabels[zone]}”典型位置，请继续微调并观察成像。`);
    setPromptTone('info');
  };

  const handleRecordObservation = () => {
    if (step === 2) {
      if (observationZone !== 'gt2f') {
        setErrors((value) => value + 1);
        setPrompt('当前物距还没有放到 2f 以外，请继续移动蜡烛。');
        setPromptTone('error');
        return;
      }
      if (!sharpEnough || !realImageDistance) {
        setErrors((value) => value + 1);
        setPrompt('请继续移动光屏，直到光屏上出现清晰的倒立缩小实像。');
        setPromptTone('error');
        return;
      }
      if (observedZones.has('gt2f')) {
        setPrompt('这组“2f 外”观察已经记录，无需重复提交。');
        setPromptTone('info');
        return;
      }
      setRecords((current) => [
        ...current,
        {
          id: recordId(),
          zone: 'gt2f',
          objectDistance,
          screenDistance,
          imageDistance: realImageDistance,
          imageNature: '倒立缩小实像',
          focus: screenFocus,
        },
      ]);
      setStep(3);
      setPrompt(stepCopy[3]);
      setPromptTone('success');
      setObjectDistance(3.1);
      setScreenDistance(5.6);
      return;
    }

    if (step === 3) {
      if (observationZone !== 'between-f-2f') {
        setErrors((value) => value + 1);
        setPrompt('当前物距应处于 f 和 2f 之间，才能得到倒立放大实像。');
        setPromptTone('error');
        return;
      }
      if (!sharpEnough || !realImageDistance) {
        setErrors((value) => value + 1);
        setPrompt('请继续移动光屏，直到光屏上出现清晰的倒立放大实像。');
        setPromptTone('error');
        return;
      }
      if (observedZones.has('between-f-2f')) {
        setPrompt('这组“f 与 2f 之间”观察已经记录。');
        setPromptTone('info');
        return;
      }
      setRecords((current) => [
        ...current,
        {
          id: recordId(),
          zone: 'between-f-2f',
          objectDistance,
          screenDistance,
          imageDistance: realImageDistance,
          imageNature: '倒立放大实像',
          focus: screenFocus,
        },
      ]);
      setStep(4);
      setPrompt(stepCopy[4]);
      setPromptTone('success');
      setObjectDistance(1.6);
      setScreenDistance(6.4);
      return;
    }

    if (step === 4) {
      if (observationZone !== 'lt-f') {
        setErrors((value) => value + 1);
        setPrompt('请先把蜡烛移到一倍焦距内，再观察虚像。');
        setPromptTone('error');
        return;
      }
      if (observedZones.has('lt-f')) {
        setPrompt('虚像观察已经记录。');
        setPromptTone('info');
        return;
      }
      setRecords((current) => [
        ...current,
        {
          id: recordId(),
          zone: 'lt-f',
          objectDistance,
          screenDistance,
          imageDistance: virtualImageDistance,
          imageNature: '正立放大虚像',
          focus: 1,
        },
      ]);
      setStep(5);
      setPrompt(stepCopy[5]);
      setPromptTone('success');
      setCameraPreset('focus');
    }
  };

  const handleResetLab = () => {
    reportReset('凸透镜成像实验已重置，开始新的搭建与观察尝试。');
    setStep(1);
    setPlacedParts([]);
    setObjectDistance(5.2);
    setScreenDistance(3.3);
    setCameraPreset('wide');
    setShowRays(true);
    setRecords([]);
    setSummaryChoice('');
    setPrompt(stepCopy[1]);
    setPromptTone('info');
    setErrors(0);
    setCompleted(false);
  };

  const handleSubmitConclusion = () => {
    if (step !== 5) return;
    if (summaryChoice !== 'convex-lens-law') {
      setErrors((value) => value + 1);
      setPrompt('结论还不准确。提示：需要同时包含“大于 2f、f 与 2f 之间、小于 f”三种情况。');
      setPromptTone('error');
      return;
    }

    setCompleted(true);
    setPrompt('实验完成。你已经验证了凸透镜在不同物距下的成像规律。');
    setPromptTone('success');
    setCameraPreset('focus');
  };

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    interactiveObjectsRef.current = [];
    visualRefs.current = {
      candleTray: null,
      lensTray: null,
      screenTray: null,
      candle: null,
      candleFlame: null,
      lensGroup: null,
      screenGroup: null,
      screenPanel: null,
      screenProjection: null,
      screenProjectionBody: null,
      screenProjectionFlame: null,
      virtualImage: null,
      virtualFlame: null,
      rayGroup: null,
      focalMarkers: null,
    };
    rayMaterialsRef.current = [];

    const scene = new Scene();
    scene.background = new Color(0x08131f);
    scene.fog = new Fog(0x08131f, 12, 28);
    sceneRef.current = scene;

    const camera = new PerspectiveCamera(40, mountNode.clientWidth / mountNode.clientHeight, 0.1, 100);
    camera.position.set(0.2, 7.2, 13.2);
    camera.lookAt(0.5, 1.85, 0);
    cameraRef.current = camera;

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    rendererRef.current = renderer;
    mountNode.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 7;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI / 2.08;
    controls.target.set(0.5, 1.85, 0);
    controls.update();
    controlsRef.current = controls;

    const realism = attachLabRealism(renderer, scene, { exposure: 1.1, environmentIntensity: 0.96 });

    scene.add(new AmbientLight(0xffffff, 0.98));
    const directional = new DirectionalLight(0xcfe3ff, 1.42);
    directional.position.set(6, 10, 5);
    directional.castShadow = true;
    scene.add(directional);
    const rim = new DirectionalLight(0x38e0c1, 0.4);
    rim.position.set(-7, 7, -6);
    scene.add(rim);

    const table = new Mesh(
      new BoxGeometry(14, 0.6, 6.8),
      createLabWoodMaterial({ color: 0x10223a, roughness: 0.84, clearcoat: 0.08 }),
    );
    table.position.set(0, -0.35, 0);
    table.receiveShadow = true;
    scene.add(table);

    const bench = new Mesh(
      new BoxGeometry(12.4, 0.24, 1.2),
      createLabCoatedMetalMaterial({ color: 0x27486c, roughness: 0.28, metalness: 0.42, clearcoat: 0.32 }),
    );
    bench.position.set(0, 0.22, 0);
    bench.receiveShadow = true;
    scene.add(bench);

    const backPanel = new Mesh(
      new PlaneGeometry(18, 10),
      new MeshStandardMaterial({ color: 0x0e1826, roughness: 0.96, metalness: 0.04 }),
    );
    backPanel.position.set(0, 4.5, -4.1);
    scene.add(backPanel);

    const benchGlow = new Mesh(
      new CircleGeometry(4.8, 56),
      new MeshBasicMaterial({ color: 0x72f5ff, transparent: true, opacity: 0.06 }),
    );
    benchGlow.rotation.x = -Math.PI / 2;
    benchGlow.position.y = -0.03;
    scene.add(benchGlow);

    const railMarks = new Group();
    for (let index = -6; index <= 6; index += 1) {
      const tick = new Mesh(
        new BoxGeometry(index % 2 === 0 ? 0.04 : 0.02, index % 2 === 0 ? 0.28 : 0.18, 0.08),
        new MeshStandardMaterial({ color: 0xa7c5e8, metalness: 0.12, roughness: 0.42 }),
      );
      tick.position.set(index, 0.34, 0.46);
      railMarks.add(tick);
    }
    scene.add(railMarks);

    const axisPoints = [new Vector3(-6.2, AXIS_Y, 0), new Vector3(6.2, AXIS_Y, 0)];
    const axisLine = new Line(
      new BufferGeometry().setFromPoints(axisPoints),
      new LineBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.78 }),
    );
    scene.add(axisLine);

    const focalMarkers = new Group();
    [-FOCAL_LENGTH * 2, -FOCAL_LENGTH, FOCAL_LENGTH, FOCAL_LENGTH * 2].forEach((x, index) => {
      const marker = new Mesh(
        new SphereGeometry(index % 2 === 0 ? 0.09 : 0.12, 20, 20),
        new MeshBasicMaterial({ color: index % 2 === 0 ? 0x7de8ff : 0xffd36b, transparent: true, opacity: 0.28 }),
      );
      marker.position.set(x, AXIS_Y, 0);
      focalMarkers.add(marker);
    });
    scene.add(focalMarkers);
    visualRefs.current.focalMarkers = focalMarkers;

    const createInteractiveTray = (id: PartId, x: number, z: number, makePreview: (group: Group) => void) => {
      const tray = new Group();
      tray.position.set(x, 0, z);
      tray.userData = { role: 'part', id };

      const base = new Mesh(
        new CylinderGeometry(0.86, 0.92, 0.18, 24),
        createLabCoatedMetalMaterial({ color: 0x1d3553, roughness: 0.34, metalness: 0.28, clearcoat: 0.26 }),
      );
      base.position.y = 0.12;
      base.castShadow = true;
      base.receiveShadow = true;
      tray.add(base);

      const preview = new Group();
      preview.position.y = 0.22;
      makePreview(preview);
      tray.add(preview);

      tray.traverse((child) => {
        child.userData = { role: 'part', id };
      });
      interactiveObjectsRef.current.push(tray);
      scene.add(tray);
      return tray;
    };

    visualRefs.current.candleTray = createInteractiveTray('candle', -4.8, -2.2, (group) => {
      const body = new Mesh(
        new CylinderGeometry(0.18, 0.2, 0.8, 18),
        new MeshStandardMaterial({ color: 0xf8e6b3, roughness: 0.58 }),
      );
      body.position.y = 0.6;
      const flame = new Mesh(
        new ConeGeometry(0.14, 0.34, 18),
        new MeshStandardMaterial({ color: 0xff9b45, emissive: new Color(0xff7c3d), emissiveIntensity: 0.45, roughness: 0.2 }),
      );
      flame.position.y = 1.18;
      group.add(body, flame);
    });

    visualRefs.current.lensTray = createInteractiveTray('lens', 0, -2.2, (group) => {
      const ring = new Mesh(
        new TorusGeometry(0.36, 0.06, 12, 24),
        createLabMetalMaterial({ color: 0xdfe8f6, roughness: 0.2, metalness: 0.98, clearcoat: 0.14 }),
      );
      ring.rotation.y = Math.PI / 2;
      ring.position.y = 1.0;
      const lens = new Mesh(
        new SphereGeometry(0.26, 18, 18),
        createLabGlassMaterial({ color: 0x8be8ff, opacity: 0.34, transmission: 0.96, thickness: 0.34, roughness: 0.02, attenuationDistance: 2.2, attenuationColor: 0xa8ecff }),
      );
      lens.scale.set(0.36, 1.0, 1.0);
      lens.position.y = 1.0;
      group.add(ring, lens);
    });

    visualRefs.current.screenTray = createInteractiveTray('screen', 4.8, -2.2, (group) => {
      const panel = new Mesh(
        new BoxGeometry(0.08, 1.16, 0.92),
        new MeshStandardMaterial({ color: 0xf2f6fb, roughness: 0.56, metalness: 0.08 }),
      );
      panel.position.y = 1.0;
      group.add(panel);
    });

    const candle = new Group();
    const candleStand = new Mesh(
      new CylinderGeometry(0.26, 0.28, 0.32, 20),
      createLabCoatedMetalMaterial({ color: 0x697b94, roughness: 0.28, metalness: 0.44, clearcoat: 0.22 }),
    );
    candleStand.position.y = 0.38;
    const candleBody = new Mesh(
      new CylinderGeometry(0.2, 0.22, 1.4, 20),
      new MeshStandardMaterial({ color: 0xf6e6b9, roughness: 0.6, metalness: 0.04 }),
    );
    candleBody.position.y = 1.22;
    const wick = new Mesh(
      new CylinderGeometry(0.018, 0.018, 0.18, 10),
      new MeshStandardMaterial({ color: 0x2b2a2b, roughness: 0.92 }),
    );
    wick.position.y = 1.98;
    const candleFlame = new Mesh(
      new ConeGeometry(0.17, 0.44, 20),
      new MeshStandardMaterial({ color: 0xffa54f, emissive: new Color(0xff8b3d), emissiveIntensity: 0.82, roughness: 0.12 }),
    );
    candleFlame.position.y = 2.34;
    candle.add(candleStand, candleBody, wick, candleFlame);
    candle.visible = false;
    candle.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    scene.add(candle);
    visualRefs.current.candle = candle;
    visualRefs.current.candleFlame = candleFlame;

    const lensGroup = new Group();
    const lensStand = new Mesh(
      new BoxGeometry(0.26, 1.26, 0.24),
      createLabCoatedMetalMaterial({ color: 0x71839b, roughness: 0.28, metalness: 0.38, clearcoat: 0.24 }),
    );
    lensStand.position.y = 0.94;
    const lensBase = new Mesh(
      new CylinderGeometry(0.42, 0.48, 0.22, 20),
      createLabMetalMaterial({ color: 0x64758d, roughness: 0.24, metalness: 0.94, clearcoat: 0.12 }),
    );
    lensBase.position.y = 0.26;
    const lensRing = new Mesh(
      new TorusGeometry(0.64, 0.08, 16, 28),
      createLabMetalMaterial({ color: 0xdfebf7, roughness: 0.18, metalness: 0.98, clearcoat: 0.14 }),
    );
    lensRing.rotation.y = Math.PI / 2;
    lensRing.position.y = AXIS_Y;
    const lensCore = new Mesh(
      new SphereGeometry(0.52, 24, 24),
      createLabGlassMaterial({ color: 0x92ebff, opacity: 0.3, transmission: 0.98, thickness: 0.58, roughness: 0.01, attenuationDistance: 2.6, attenuationColor: 0x9befff }),
    );
    lensCore.scale.set(0.26, 1.0, 1.0);
    lensCore.position.y = AXIS_Y;
    lensGroup.add(lensBase, lensStand, lensRing, lensCore);
    lensGroup.visible = false;
    lensGroup.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    scene.add(lensGroup);
    visualRefs.current.lensGroup = lensGroup;

    const screenGroup = new Group();
    const screenBase = new Mesh(
      new CylinderGeometry(0.42, 0.46, 0.2, 20),
      createLabCoatedMetalMaterial({ color: 0x6b7f96, roughness: 0.28, metalness: 0.38, clearcoat: 0.2 }),
    );
    screenBase.position.y = 0.26;
    const screenRod = new Mesh(
      new BoxGeometry(0.12, 1.5, 0.12),
      createLabMetalMaterial({ color: 0x73859d, roughness: 0.24, metalness: 0.86, clearcoat: 0.1 }),
    );
    screenRod.position.y = 0.96;
    const screenPanel = new Mesh(
      new BoxGeometry(0.08, 2.5, 1.9),
      createLabCeramicMaterial({ color: 0xf2f6fb, roughness: 0.48, clearcoat: 0.16 }),
    );
    screenPanel.position.y = AXIS_Y;
    screenGroup.add(screenBase, screenRod, screenPanel);
    screenGroup.visible = false;
    screenGroup.traverse((child) => {
      child.castShadow = true;
      child.receiveShadow = true;
    });
    scene.add(screenGroup);
    visualRefs.current.screenGroup = screenGroup;
    visualRefs.current.screenPanel = screenPanel;

    const screenProjection = new Group();
    const projectionBody = new Mesh(
      new PlaneGeometry(0.34, 0.94),
      new MeshBasicMaterial({ color: 0xffcf7d, transparent: true, opacity: 0.1 }),
    );
    projectionBody.rotation.y = -Math.PI / 2;
    projectionBody.position.set(-0.06, -0.14, 0);
    const projectionFlame = new Mesh(
      new CircleGeometry(0.18, 24),
      new MeshBasicMaterial({ color: 0xff7a4a, transparent: true, opacity: 0.12 }),
    );
    projectionFlame.rotation.y = -Math.PI / 2;
    projectionFlame.scale.set(1, 1.34, 1);
    projectionFlame.position.set(-0.055, 0.48, 0);
    screenProjection.add(projectionBody, projectionFlame);
    screenProjection.visible = false;
    screenGroup.add(screenProjection);
    visualRefs.current.screenProjection = screenProjection;
    visualRefs.current.screenProjectionBody = projectionBody;
    visualRefs.current.screenProjectionFlame = projectionFlame;

    const virtualImage = new Group();
    const virtualBody = new Mesh(
      new CylinderGeometry(0.14, 0.16, 0.86, 18),
      createLabGlassMaterial({ color: 0x9fd7ff, opacity: 0.24, transmission: 0.78, thickness: 0.18, roughness: 0.04, attenuationDistance: 1.5, attenuationColor: 0x9fd7ff }),
    );
    virtualBody.position.y = -0.12;
    const virtualFlame = new Mesh(
      new ConeGeometry(0.13, 0.34, 18),
      createLabGlassMaterial({ color: 0x7de8ff, opacity: 0.34, transmission: 0.84, roughness: 0.03, emissive: new Color(0x38e0c1), emissiveIntensity: 0.4, thickness: 0.14, attenuationDistance: 1.2, attenuationColor: 0x7de8ff }),
    );
    virtualFlame.position.y = 0.46;
    virtualImage.add(virtualBody, virtualFlame);
    virtualImage.visible = false;
    scene.add(virtualImage);
    visualRefs.current.virtualImage = virtualImage;
    visualRefs.current.virtualFlame = virtualFlame;

    const rayGroup = new Group();
    scene.add(rayGroup);
    visualRefs.current.rayGroup = rayGroup;

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
        handlePlacePart(hitInfo.id as PartId);
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

    const clock = new Clock();
    const animate = () => {
      frameRef.current = window.requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();
      const flame = visualRefs.current.candleFlame;
      if (flame) {
        flame.scale.x = 1 + Math.sin(elapsed * 7.2) * 0.06;
        flame.scale.y = 1 + Math.cos(elapsed * 6.4) * 0.08;
      }
      const virtualFlameMesh = visualRefs.current.virtualFlame;
      if (virtualFlameMesh) {
        virtualFlameMesh.scale.x = 1 + Math.sin(elapsed * 5.1) * 0.04;
        virtualFlameMesh.scale.y = 1 + Math.cos(elapsed * 4.7) * 0.05;
      }
      const projectionFlame = visualRefs.current.screenProjectionFlame;
      if (projectionFlame && visualRefs.current.screenProjection?.visible) {
        projectionFlame.scale.x = 1 + Math.sin(elapsed * 4.6) * 0.06;
        projectionFlame.scale.y = 1.34 + Math.cos(elapsed * 3.8) * 0.08;
      }
      const focalMarkers = visualRefs.current.focalMarkers;
      if (focalMarkers) {
        focalMarkers.children.forEach((child, index) => {
          child.scale.setScalar(1 + Math.sin(elapsed * 3.4 + index * 0.8) * 0.08);
        });
      }
      rayMaterialsRef.current.forEach((material, index) => {
        material.opacity = material.userData.layer === 'glow' ? 0.26 + Math.sin(elapsed * 6.2 + index * 0.4) * 0.12 : 0.82;
      });
      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      setHoveredPart(null);
      realism.dispose();
      controls.dispose();
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      if (mountNode.contains(renderer.domElement)) {
        mountNode.removeChild(renderer.domElement);
      }
      scene.clear();
      interactiveObjectsRef.current = [];
    };
  }, []);

  useEffect(() => {
    applyCameraPreset(cameraPreset);
  }, [cameraPreset, objectDistance, screenDistance]);

  useEffect(() => {
    const {
      candleTray,
      lensTray,
      screenTray,
      candle,
      lensGroup,
      screenGroup,
      screenPanel,
      screenProjection,
      screenProjectionBody,
      screenProjectionFlame,
      virtualImage,
      rayGroup,
      focalMarkers,
    } = visualRefs.current;

    if (candleTray) {
      candleTray.visible = !placedParts.includes('candle');
    }
    if (lensTray) {
      lensTray.visible = !placedParts.includes('lens');
    }
    if (screenTray) {
      screenTray.visible = !placedParts.includes('screen');
    }

    if (candle) {
      candle.visible = placedParts.includes('candle');
      candle.position.set(-objectDistance, 0, 0);
    }
    if (lensGroup) {
      lensGroup.visible = placedParts.includes('lens');
      lensGroup.position.set(0, 0, 0);
    }
    if (screenGroup) {
      screenGroup.visible = placedParts.includes('screen');
      screenGroup.position.set(screenDistance, 0, 0);
    }

    if (screenPanel) {
      const material = screenPanel.material;
      if (material instanceof MeshStandardMaterial) {
        material.color = new Color(sharpEnough ? 0xfdfefe : 0xe8eef7);
        material.emissive = new Color(sharpEnough ? 0x18486d : 0x08131f);
        material.emissiveIntensity = sharpEnough ? 0.24 : 0.04;
      }
    }

    if (screenProjection && screenProjectionBody && screenProjectionFlame) {
      const canShowRealProjection = placedParts.includes('screen') && realImageDistance !== null;
      screenProjection.visible = canShowRealProjection;
      if (canShowRealProjection) {
        const scaleFactor = Math.max(0.42, Math.min(2.2, Math.abs(magnification)));
        screenProjection.position.y = AXIS_Y;
        screenProjection.rotation.z = Math.PI;
        screenProjection.scale.set(1 + (1 - screenFocus) * 0.54, scaleFactor * (1 + (1 - screenFocus) * 0.4), 1);
        const bodyMaterial = screenProjectionBody.material;
        const flameMaterial = screenProjectionFlame.material;
        if (bodyMaterial instanceof MeshBasicMaterial) {
          bodyMaterial.opacity = 0.08 + screenFocus * 0.84;
        }
        if (flameMaterial instanceof MeshBasicMaterial) {
          flameMaterial.opacity = 0.12 + screenFocus * 0.8;
        }
      }
    }

    if (virtualImage) {
      const canShowVirtual = placedParts.includes('lens') && observationZone === 'lt-f' && !!virtualImageDistance;
      virtualImage.visible = canShowVirtual;
      if (canShowVirtual && virtualImageDistance) {
        const scaleFactor = Math.max(0.62, Math.min(2.2, Math.abs(magnification)));
        virtualImage.position.set(-virtualImageDistance, AXIS_Y + 0.16, 0.6);
        virtualImage.scale.set(scaleFactor, scaleFactor, scaleFactor);
      }
    }

    if (focalMarkers) {
      focalMarkers.visible = placedParts.includes('lens');
    }

    if (rayGroup) {
      rayGroup.clear();
      rayMaterialsRef.current = [];
      rayGroup.visible = showRays && placedParts.includes('candle') && placedParts.includes('lens');
      if (rayGroup.visible) {
        const objectTop = new Vector3(-objectDistance, AXIS_Y + OBJECT_HEIGHT, 0);
        const centerPoint = new Vector3(0, AXIS_Y, 0);
        const parallelHit = new Vector3(0, AXIS_Y + OBJECT_HEIGHT, 0);
        const addLine = (points: Vector3[], color: number, dashed = false) => {
          const geometry = new BufferGeometry().setFromPoints(points);
          const material = dashed
            ? new LineDashedMaterial({ color, dashSize: 0.18, gapSize: 0.12, transparent: true, opacity: 0.8 })
            : new LineBasicMaterial({ color, transparent: true, opacity: 0.92 });
          const line = new Line(geometry, material);
          if (dashed) line.computeLineDistances();
          rayGroup.add(line);
          rayMaterialsRef.current.push(material);
          if (!dashed) {
            const glowMaterial = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.26 });
            glowMaterial.userData = { layer: 'glow' };
            const glowLine = new Line(new BufferGeometry().setFromPoints(points), glowMaterial);
            rayGroup.add(glowLine);
            rayMaterialsRef.current.push(glowMaterial);
          }
        };

        if (realImageDistance) {
          const imagePoint = new Vector3(realImageDistance, AXIS_Y - OBJECT_HEIGHT * magnification, 0);
          addLine([objectTop, parallelHit], 0x7de8ff);
          addLine([parallelHit, imagePoint], 0x7de8ff);
          addLine([objectTop, centerPoint, imagePoint], 0xffd36b);
        } else if (virtualImageDistance) {
          const rightRayEnd = new Vector3(4.8, AXIS_Y - 0.54, 0);
          const focusExtensionPoint = new Vector3(-virtualImageDistance, AXIS_Y + OBJECT_HEIGHT * magnification, 0);
          addLine([objectTop, parallelHit], 0x7de8ff);
          addLine([parallelHit, rightRayEnd], 0x7de8ff);
          addLine([parallelHit, focusExtensionPoint], 0x7de8ff, true);
          addLine([objectTop, centerPoint, new Vector3(4.4, AXIS_Y + 0.34, 0)], 0xffd36b);
          addLine([centerPoint, focusExtensionPoint], 0xffd36b, true);
        }
      }
    }

    applyGlow(candle, hoveredPart === 'candle' ? 0x72f5ff : placedParts.includes('candle') ? 0x1e5b4e : step === 1 ? 0x103149 : 0x000000, hoveredPart === 'candle' ? 0.92 : placedParts.includes('candle') ? 0.64 : step === 1 ? 0.26 : 0.08);
    applyGlow(lensGroup, hoveredPart === 'lens' ? 0x72f5ff : placedParts.includes('lens') ? 0x1d6b79 : step === 1 ? 0x103149 : 0x000000, hoveredPart === 'lens' ? 0.96 : placedParts.includes('lens') ? 0.68 : step === 1 ? 0.3 : 0.08);
    applyGlow(screenGroup, hoveredPart === 'screen' ? 0x72f5ff : sharpEnough ? 0x1d6b79 : placedParts.includes('screen') ? 0x1e5b4e : step === 1 ? 0x103149 : 0x000000, hoveredPart === 'screen' ? 0.94 : sharpEnough ? 0.82 : placedParts.includes('screen') ? 0.6 : step === 1 ? 0.28 : 0.08);
  }, [hoveredPart, magnification, objectDistance, observationZone, placedParts, realImageDistance, screenDistance, screenFocus, sharpEnough, showRays, step, virtualImageDistance]);

  const sceneTone = promptTone === 'error' ? 'invalid' : completed || sharpEnough || observationZone === 'lt-f' ? 'valid' : 'neutral';
  const nextRecordLabel = step === 2 ? '记录 2f 外成像' : step === 3 ? '记录 f~2f 成像' : step === 4 ? '记录虚像观察' : '等待总结';
  const hoveredPartCopy = hoveredPart ? lensHoverCopy[hoveredPart] : null;
  const latestRecord = records[records.length - 1] ?? null;
  const lensWorkbenchStatus =
    step === 1
      ? '先点击 3D 台面中的蜡烛、凸透镜和光屏，补齐光具座。'
      : step <= 3
        ? '改变物距后继续微调光屏，直到光屏上出现清晰实像再记录。'
        : step === 4
          ? '将蜡烛推进一倍焦距内，此时光屏不能接像，只能观察到正立放大虚像。'
          : completed
            ? '实验完成，可继续切换典型位复盘三种成像规律。'
            : '结合三种典型情况，选择完整的凸透镜成像规律。';
  const lensCompletionCopy = completed
    ? '实验已完成，当前版本支持光具座搭建、典型位切换、光路显示、成像记录和结论提交。'
    : '当前还未完成最终结论提交，请继续补齐三种典型成像记录。';

  return (
    <section className="playground-panel panel lens-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">3D Demo</span>
          <h2>{experiment.title} · 本地 3D 实验 Demo</h2>
        </div>
        <div className="badge-row compact">
          <span className="badge">步骤 {step}/5</span>
          <span className="badge">物距 {toCentimeter(objectDistance)} cm</span>
          <span className="badge">清晰度 {Math.round(screenFocus * 100)}%</span>
          <span className="badge">得分 {score}</span>
        </div>
      </div>

      <div className="playground-grid lens-grid">
        <aside className="playground-side lens-side-rail lens-side-rail-left">
          <div className="info-card lens-rail-card">
            <strong>器材状态</strong>
            <div className="equipment-list">
              {partOrder.map((partId) => (
                <span className={placedParts.includes(partId) ? 'equipment-tag identified' : 'equipment-tag'} key={partId}>
                  {partLabels[partId]}
                </span>
              ))}
            </div>
            <small>第 1 步支持直接点击 3D 台面中的器材托盘完成摆放。</small>
          </div>

          <div className="info-card lens-rail-card">
            <strong>步骤总览</strong>
            <ol className="step-list compact-list">
              {lensStepOrder.map((stepId) => (
                <li className={step === stepId ? 'active' : step > stepId || (stepId === 5 && completed) ? 'done' : ''} key={stepId}>
                  {stepTitles[stepId]}
                </li>
              ))}
            </ol>
            <div className={`lens-rail-prompt tone-${promptTone}`}>
              <span>当前提示</span>
              <p>{prompt}</p>
            </div>
          </div>
        </aside>

        <div className="scene-panel lens-workbench-stage">
          <div className="scene-toolbar lens-workbench-toolbar">
            <div className="lens-toolbar-head">
              <div className="lens-toolbar-kicker">凸透镜工作台</div>
              <strong>{experiment.title}</strong>
              <p className="lens-toolbar-copy">把光具座调节、记录和结论都收进中部工作台，不再让侧栏遮挡光路与像面。</p>
            </div>
            <div className="camera-actions lens-camera-actions">
              <button className={cameraPreset === 'wide' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('wide')} type="button">
                台面全景
              </button>
              <button className={cameraPreset === 'side' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('side')} type="button">
                侧视光路
              </button>
              <button className={cameraPreset === 'focus' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('focus')} type="button">
                聚焦光屏
              </button>
            </div>
          </div>

          <div className="scene-meta-strip lens-stage-meta">
            <div className={`lens-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>
                步骤 {step} · {stepTitles[step]}
              </strong>
              <p>{prompt}</p>
            </div>
            <div className="lens-step-pills" aria-label="实验步骤概览">
              {lensStepOrder.map((stepId) => (
                <span className={step === stepId ? 'lens-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'lens-step-pill done' : 'lens-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="scene-canvas lens-scene-canvas">
            <div className="three-stage-mount lens-three-mount" ref={mountRef} />
          </div>

          <div className="workbench-inline-dock lens-workbench-dock">
            <div className="lens-workbench-status-grid">
              <div className={`info-card lens-status-card ${sceneTone === 'invalid' ? 'tone-error' : sceneTone === 'valid' ? 'tone-success' : ''}`.trim()}>
                <span>当前进度</span>
                <strong>
                  步骤 {step} · {stepTitles[step]}
                </strong>
                <p>{lensWorkbenchStatus}</p>
              </div>
              <div className="info-card lens-status-card">
                <span>当前区间</span>
                <strong>{zoneLabels[observationZone]}</strong>
                <p>{imageNature}</p>
              </div>
              <div className={`info-card lens-status-card ${sharpEnough || observationZone === 'lt-f' ? 'tone-success' : ''}`.trim()}>
                <span>像与清晰度</span>
                <strong>{realImageDistance ? `${Math.round(screenFocus * 100)}% · ${focusLabel}` : '当前不成实像'}</strong>
                <p>{realImageDistance ? `理论像距 ${toCentimeter(realImageDistance)} cm` : '只能观察正立放大虚像'}</p>
              </div>
              <div className={`info-card lens-status-card ${records.length >= 3 ? 'tone-success' : ''}`.trim()}>
                <span>记录进度</span>
                <strong>{records.length}/3 已记录</strong>
                <p>{latestRecord ? `${zoneLabels[latestRecord.zone]} · ${latestRecord.imageNature}` : '等待记录三种典型情况'}</p>
              </div>
            </div>

            <div className="lens-inline-controls">
              <section className="info-card lens-inline-panel">
                <strong>光具座调节</strong>
                <div className="camera-actions split-actions">
                  <button className={observationZone === 'gt2f' ? 'scene-action active' : 'scene-action'} onClick={() => handleQuickDistance('gt2f')} type="button" disabled={!setupReady || step < 2}>
                    典型位：2f 外
                  </button>
                  <button className={observationZone === 'between-f-2f' ? 'scene-action active' : 'scene-action'} onClick={() => handleQuickDistance('between-f-2f')} type="button" disabled={!setupReady || step < 2}>
                    典型位：f~2f
                  </button>
                  <button className={observationZone === 'lt-f' ? 'scene-action active' : 'scene-action'} onClick={() => handleQuickDistance('lt-f')} type="button" disabled={!setupReady || step < 2}>
                    典型位：1f 内
                  </button>
                  <button className={showRays ? 'scene-action active' : 'scene-action'} onClick={() => setShowRays((current) => !current)} type="button" disabled={!setupReady}>
                    {showRays ? '关闭光路' : '显示光路'}
                  </button>
                </div>
                <label className="range-block">
                  <span>蜡烛到凸透镜的距离（物距）</span>
                  <input type="range" min="1.3" max="6.1" step="0.05" value={objectDistance} onChange={(event) => setObjectDistance(Number(event.target.value))} disabled={!setupReady || step < 2} />
                  <small>当前物距 {toCentimeter(objectDistance)} cm · 区域：{zoneLabels[observationZone]}</small>
                </label>
                <label className="range-block">
                  <span>凸透镜到光屏的距离（像距）</span>
                  <input type="range" min="1.4" max="7.2" step="0.05" value={screenDistance} onChange={(event) => setScreenDistance(Number(event.target.value))} disabled={!setupReady || step < 2} />
                  <small>当前屏距 {toCentimeter(screenDistance)} cm · {realImageDistance ? `理论像距 ${toCentimeter(realImageDistance)} cm` : '当前无可接收实像'}</small>
                </label>
                <div className="button-stack">
                  <button className="action-button ghost" onClick={handleRecordObservation} type="button" disabled={step < 2 || step > 4}>
                    {nextRecordLabel}
                  </button>
                  <button className="action-button ghost" onClick={handleResetLab} type="button">
                    重置凸透镜实验
                  </button>
                </div>
              </section>

              <section className="info-card lens-inline-panel">
                <strong>成像状态</strong>
                <div className="status-pill-row">
                  <span className={setupReady ? 'status-pill ready' : 'status-pill'}>装置 {setupReady ? '完整' : '未完整'}</span>
                  <span className={realImageDistance ? 'status-pill ready' : 'status-pill'}>实像 {realImageDistance ? '可接收' : '不可接收'}</span>
                  <span className={sharpEnough ? 'status-pill ready' : 'status-pill'}>光屏 {sharpEnough ? '已对焦' : focusLabel}</span>
                  <span className={observationZone === 'lt-f' ? 'status-pill ready' : 'status-pill'}>虚像 {observationZone === 'lt-f' ? '可观察' : '未进入'}</span>
                </div>
                <div className="detail-list">
                  <div className="detail-row">
                    <div className="detail-copy">
                      <strong>焦距设定</strong>
                      <small>本实验固定焦距为 {toCentimeter(FOCAL_LENGTH)} cm，便于比较三种典型成像情况。</small>
                    </div>
                    <span className="status-pill ready">f = {toCentimeter(FOCAL_LENGTH)} cm</span>
                  </div>
                  <div className="detail-row">
                    <div className="detail-copy">
                      <strong>理论判断</strong>
                      <small>{realImageDistance ? `当前应在光屏上形成${imageNature}。` : '当前光屏上不能接到实像，只能观察到正立放大虚像。'}</small>
                    </div>
                    <span className={realImageDistance ? 'status-pill ready' : 'status-pill'}>{realImageDistance ? `${toCentimeter(realImageDistance)} cm` : '虚像'}</span>
                  </div>
                  <div className="detail-row">
                    <div className="detail-copy">
                      <strong>悬停部件</strong>
                      <small>{hoveredPartCopy?.detail ?? '把鼠标移到蜡烛、凸透镜或光屏上，可以查看它在成像中的作用。'}</small>
                    </div>
                    <span className={hoveredPartCopy ? 'status-pill ready' : 'status-pill'}>{hoveredPartCopy?.title ?? '无'}</span>
                  </div>
                </div>
              </section>
            </div>

            <section className="info-card lens-inline-panel">
              <strong>观察记录</strong>
              <div className="detail-list">
                {records.length ? records.map((item) => (
                  <div className="detail-row" key={item.id}>
                    <div className="detail-copy">
                      <strong>{zoneLabels[item.zone]}</strong>
                      <small>{item.imageNature} · 物距 {toCentimeter(item.objectDistance)} cm · {item.imageDistance ? `像距 ${toCentimeter(item.imageDistance)} cm` : '光屏不能接像'}</small>
                    </div>
                    <span className={item.focus >= 0.84 || item.zone === 'lt-f' ? 'status-pill ready' : 'status-pill'}>{item.zone === 'lt-f' ? '虚像' : `${Math.round(item.focus * 100)}%`}</span>
                  </div>
                )) : (
                  <div className="measurement-empty">先按步骤记录“2f 外”“f~2f”“1f 内”三种典型情况。</div>
                )}
              </div>
            </section>

            {step === 5 || completed ? (
              <div className="lens-summary-dock">
                <div className="lens-summary-head">
                  <div>
                    <span>结论选择</span>
                    <strong>物距大于 2f 时成倒立缩小实像；物距在 f 与 2f 之间时成倒立放大实像；物距小于 f 时成正立放大虚像</strong>
                  </div>
                  <button className="action-button lens-submit-button" onClick={handleSubmitConclusion} type="button" disabled={step !== 5 || completed}>
                    {completed ? '已完成' : '提交实验结论'}
                  </button>
                </div>
                <div className="lens-choice-row">
                  <button className={summaryChoice === 'screen-anywhere' ? 'summary-choice active' : 'summary-choice'} onClick={() => setSummaryChoice('screen-anywhere')} type="button">
                    只要不断移动光屏，任何物距下都能在光屏上接到清晰实像
                  </button>
                  <button className={summaryChoice === 'convex-lens-law' ? 'summary-choice active' : 'summary-choice'} onClick={() => setSummaryChoice('convex-lens-law')} type="button">
                    物距大于 2f 时成倒立缩小实像；物距在 f 与 2f 之间时成倒立放大实像；物距小于 f 时成正立放大虚像
                  </button>
                  <button className={summaryChoice === 'upright-real' ? 'summary-choice active' : 'summary-choice'} onClick={() => setSummaryChoice('upright-real')} type="button">
                    凸透镜成像时只会得到正立像，放大与缩小只由光屏远近决定
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="playground-side lens-side-rail lens-side-rail-right">
          <div className="info-card lens-rail-card">
            <strong>实验状态</strong>
            <div className="lens-mini-metrics">
              <div className="lens-mini-metric">
                <span>物距区间</span>
                <strong>{zoneLabels[observationZone]}</strong>
              </div>
              <div className="lens-mini-metric">
                <span>像的性质</span>
                <strong>{imageNature}</strong>
              </div>
              <div className="lens-mini-metric">
                <span>清晰度</span>
                <strong>{realImageDistance ? `${Math.round(screenFocus * 100)}%` : '无实像'}</strong>
              </div>
              <div className="lens-mini-metric">
                <span>记录数量</span>
                <strong>{records.length} 条</strong>
              </div>
            </div>
          </div>

          <div className={completed ? 'info-card success-card lens-rail-card' : 'info-card lens-rail-card'}>
            <strong>完成状态</strong>
            <p>{lensCompletionCopy}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
