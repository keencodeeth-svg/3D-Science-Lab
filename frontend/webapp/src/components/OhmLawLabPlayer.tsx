import { useEffect, useMemo, useRef, useState } from 'react';
import { AmbientLight, BoxGeometry, CatmullRomCurve3, CircleGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, Fog, Group, Material, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PCFSoftShadowMap, PerspectiveCamera, PlaneGeometry, Raycaster, RingGeometry, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, TubeGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { SimulationRuntimeSnapshot } from '../lib/simulationRuntime';
import { createSimulationRuntimeFromApparatus } from '../lib/simulationRuntimeAdapter';
import type { ExperimentConfig } from '../types/experiment';
import { ReusableApparatusDock } from './ReusableApparatusDock';
import { attachLabRealism, createLabCeramicMaterial, createLabCoatedMetalMaterial, createLabGlassMaterial, createLabMetalMaterial, createLabPlasticMaterial, createLabRubberMaterial, createLabWoodMaterial } from '../lib/threeRealism';

type StepId = 1 | 2 | 3 | 4 | 5;
type PromptTone = 'info' | 'success' | 'error';
type CameraPreset = 'wide' | 'top' | 'focus';
type IdentifyId = 'ammeter' | 'voltmeter' | 'rheostat';
type MainPartId = 'power' | 'resistor' | 'rheostat' | 'wire-set';
type InstrumentId = 'ammeter' | 'voltmeter';
type SlotId = 'series_slot' | 'parallel_slot';

interface OhmLawLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
  onSimulationRuntimeChange?: (snapshot: SimulationRuntimeSnapshot | null) => void;
}

interface HitInfo {
  role?: string;
  id?: string;
}

interface MeasurementRecord {
  id: string;
  voltage: number;
  current: number;
  resistance: number;
}

const identifyOrder: IdentifyId[] = ['ammeter', 'voltmeter', 'rheostat'];
const identifyLabels: Record<IdentifyId, string> = {
  ammeter: '电流表',
  voltmeter: '电压表',
  rheostat: '滑动变阻器',
};
const mainPartOrder: MainPartId[] = ['power', 'resistor', 'rheostat', 'wire-set'];
const mainPartLabels: Record<MainPartId, string> = {
  power: '电源',
  resistor: '定值电阻',
  rheostat: '滑动变阻器',
  'wire-set': '导线组',
};
const slotLabels: Record<SlotId, string> = {
  series_slot: '主回路串联位',
  parallel_slot: '电阻并联位',
};

const stepCopy: Record<StepId, string> = {
  1: '先点击电流表、电压表和滑动变阻器，完成器材识别。',
  2: '点击电源、电阻、变阻器和导线组，完成主电路搭建。',
  3: '先选电表，再点击对应接入位置：电流表进主回路，电压表并联在电阻两端。',
  4: '调节滑动变阻器并记录至少三组有效读数。',
  5: '根据读数关系完成结论。',
};

const stepTitles: Record<StepId, string> = {
  1: '识别电表与变阻器',
  2: '连接主电路',
  3: '接入电表',
  4: '改变条件并读数',
  5: '得出实验结论',
};

const ohmStepOrder: StepId[] = [1, 2, 3, 4, 5];

const ohmHoverCopy: Record<string, { title: string; detail: string }> = {
  power: { title: '电源', detail: '提供稳定电压，是主回路建立电流的起点。' },
  resistor: { title: '定值电阻', detail: '被测对象应保持阻值稳定，U-I 图像才会接近直线。' },
  rheostat: { title: '滑动变阻器', detail: '通过改变接入电阻来平滑调节电流，保护电路并获得多组数据。' },
  'wire-set': { title: '导线组', detail: '导线负责闭合回路，接触不良会直接影响示数稳定性。' },
  ammeter: { title: '电流表', detail: '必须串联在主回路中，用于读取通过被测电阻的电流。' },
  voltmeter: { title: '电压表', detail: '应并联在被测电阻两端，用于读取该部分电压。' },
  series_slot: { title: '串联接入口', detail: '这里只允许接入电流表，否则主回路结构会出错。' },
  parallel_slot: { title: '并联接入口', detail: '这里只允许接入电压表，用于跨接在电阻两端。' },
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

function measurementId() {
  return `measurement-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function OhmLawLabPlayer({ experiment, onTelemetry, onSimulationRuntimeChange }: OhmLawLabPlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameRef = useRef<number | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const interactiveObjectsRef = useRef<Object3D[]>([]);
  const equipmentObjectsRef = useRef<Record<MainPartId | InstrumentId, Group | null>>({
    power: null,
    resistor: null,
    rheostat: null,
    'wire-set': null,
    ammeter: null,
    voltmeter: null,
  });
  const slotObjectsRef = useRef<Record<SlotId, Mesh | null>>({
    series_slot: null,
    parallel_slot: null,
  });
  const stepRef = useRef<StepId>(1);
  const selectedInstrumentRef = useRef<InstrumentId | null>(null);
  const meterNeedlesRef = useRef<Record<InstrumentId, Mesh | null>>({
    ammeter: null,
    voltmeter: null,
  });
  const meterHalosRef = useRef<Record<InstrumentId, Mesh | null>>({
    ammeter: null,
    voltmeter: null,
  });
  const connectionGroupRef = useRef<Group | null>(null);
  const connectionMaterialsRef = useRef<Array<Material & { userData: Record<string, unknown>; opacity: number }>>([]);
  const rheostatGlowRef = useRef<Mesh | null>(null);
  const rheostatSparkRef = useRef<Mesh | null>(null);
  const powerTerminalGlowRef = useRef<Record<'positive' | 'negative', Mesh | null>>({ positive: null, negative: null });
  const resistorSheenRef = useRef<Mesh | null>(null);
  const readingStableRef = useRef(false);
  const liveValuesRef = useRef({ current: 0, voltage: 0, attachedMeters: { ammeter: false, voltmeter: false } as Record<InstrumentId, boolean> });

  const [step, setStep] = useState<StepId>(1);
  const [identifiedParts, setIdentifiedParts] = useState<IdentifyId[]>([]);
  const [mainCircuitParts, setMainCircuitParts] = useState<MainPartId[]>([]);
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentId | null>(null);
  const [attachedMeters, setAttachedMeters] = useState<Record<InstrumentId, boolean>>({ ammeter: false, voltmeter: false });
  const [rheostatLevel, setRheostatLevel] = useState(36);
  const [measurements, setMeasurements] = useState<MeasurementRecord[]>([]);
  const [readingStable, setReadingStable] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('wide');
  const [prompt, setPrompt] = useState(stepCopy[1]);
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [summaryChoice, setSummaryChoice] = useState('');
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);

  const score = Math.max(74, 100 - errors * 5);
  const mainCircuitReady = mainCircuitParts.length === mainPartOrder.length;
  const metersReady = attachedMeters.ammeter && attachedMeters.voltmeter;
  const voltage = useMemo(() => Number((1.2 + rheostatLevel * 0.042).toFixed(2)), [rheostatLevel]);
  const current = useMemo(() => Number((voltage / 5).toFixed(2)), [voltage]);
  const derivedResistance = useMemo(() => Number((voltage / current).toFixed(2)), [current, voltage]);
  const averageResistance = useMemo(() => {
    if (!measurements.length) return derivedResistance;
    const totalResistance = measurements.reduce((total, item) => total + item.resistance, 0);
    return Number((totalResistance / measurements.length).toFixed(2));
  }, [derivedResistance, measurements]);
  const resistanceSpread = useMemo(() => {
    if (measurements.length < 2) return 0;
    const values = measurements.map((item) => item.resistance);
    return Number((Math.max(...values) - Math.min(...values)).toFixed(2));
  }, [measurements]);
  const resistanceQuality = useMemo(() => {
    if (measurements.length < 2) return '待评估';
    if (resistanceSpread <= 0.2) return '稳定';
    if (resistanceSpread <= 0.45) return '可接受';
    return '建议复测';
  }, [measurements.length, resistanceSpread]);
  const chartModel = useMemo(() => {
    const width = 340;
    const height = 220;
    const paddingLeft = 42;
    const paddingRight = 18;
    const paddingTop = 18;
    const paddingBottom = 34;
    const plotWidth = width - paddingLeft - paddingRight;
    const plotHeight = height - paddingTop - paddingBottom;
    const maxVoltage = Math.max(6, ...measurements.map((item) => item.voltage), voltage);
    const maxCurrent = Math.max(1.4, ...measurements.map((item) => item.current), current);
    const projectX = (value: number) => paddingLeft + (value / maxVoltage) * plotWidth;
    const projectY = (value: number) => height - paddingBottom - (value / maxCurrent) * plotHeight;
    const points = [...measurements]
      .sort((left, right) => left.voltage - right.voltage)
      .map((item) => ({
        ...item,
        x: Number(projectX(item.voltage).toFixed(1)),
        y: Number(projectY(item.current).toFixed(1)),
      }));
    const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const idealCurrentAtMaxVoltage = Math.min(maxCurrent, Number((maxVoltage / Math.max(averageResistance, 0.1)).toFixed(2)));
    const livePoint = {
      x: Number(projectX(voltage).toFixed(1)),
      y: Number(projectY(current).toFixed(1)),
    };
    const gridX = Array.from({ length: 4 }, (_, index) => {
      const value = Number((((index + 1) * maxVoltage) / 4).toFixed(1));
      return { value, x: Number(projectX(value).toFixed(1)) };
    });
    const gridY = Array.from({ length: 4 }, (_, index) => {
      const value = Number((((index + 1) * maxCurrent) / 4).toFixed(2));
      return { value, y: Number(projectY(value).toFixed(1)) };
    });

    return {
      width,
      height,
      paddingLeft,
      paddingBottom,
      baseY: height - paddingBottom,
      points,
      linePath,
      livePoint,
      idealLine: {
        x1: paddingLeft,
        y1: height - paddingBottom,
        x2: Number(projectX(maxVoltage).toFixed(1)),
        y2: Number(projectY(idealCurrentAtMaxVoltage).toFixed(1)),
      },
      gridX,
      gridY,
    };
  }, [averageResistance, current, measurements, voltage]);

  useEffect(() => {
    stepRef.current = step;
    selectedInstrumentRef.current = selectedInstrument;
  }, [selectedInstrument, step]);

  useEffect(() => {
    readingStableRef.current = readingStable;
    liveValuesRef.current = { current, voltage, attachedMeters };
  }, [attachedMeters, current, readingStable, voltage]);

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

    const target = new Vector3(0.2, 1.65, 0);
    const position = new Vector3(8.2, 6.5, 8.1);

    if (preset === 'top') {
      target.set(0.1, 1.3, 0);
      position.set(0.01, 12.3, 0.01);
    }

    if (preset === 'focus') {
      target.set(1.4, 1.9, 0.3);
      position.set(5.2, 4.8, 5.8);
    }

    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  };

  const handleIdentify = (partId: IdentifyId) => {
    if (stepRef.current !== 1) return;
    setIdentifiedParts((currentParts) => {
      if (currentParts.includes(partId)) return currentParts;
      const next = [...currentParts, partId];
      if (next.length === identifyOrder.length) {
        setStep(2);
        setPrompt(stepCopy[2]);
        setPromptTone('success');
        setCameraPreset('top');
      } else {
        setPrompt('继续识别剩余电表与滑动变阻器。');
        setPromptTone('info');
      }
      return next;
    });
  };

  const handleBuildMainCircuit = (partId: MainPartId) => {
    if (stepRef.current !== 2) return;
    setMainCircuitParts((currentParts) => {
      if (currentParts.includes(partId)) return currentParts;
      const next = [...currentParts, partId];
      if (next.length === mainPartOrder.length) {
        setStep(3);
        setPrompt(stepCopy[3]);
        setPromptTone('success');
        setCameraPreset('focus');
      } else {
        setPrompt('继续点击主回路中尚未接入的器材。');
        setPromptTone('info');
      }
      return next;
    });
  };

  const handleSelectInstrument = (instrumentId: InstrumentId) => {
    if (stepRef.current !== 3) return;
    selectedInstrumentRef.current = instrumentId;
    setSelectedInstrument(instrumentId);
    setPrompt(`已选择${identifyLabels[instrumentId]}，请点击正确的接入位置。`);
    setPromptTone('info');
  };

  const handleAttachSlot = (slotId: SlotId) => {
    if (stepRef.current !== 3) return;
    const currentInstrument = selectedInstrumentRef.current;
    if (!currentInstrument) {
      setErrors((value) => value + 1);
      setPrompt('请先选择一个电表，再点击接入位置。');
      setPromptTone('error');
      return;
    }

    const valid = (currentInstrument === 'ammeter' && slotId === 'series_slot') || (currentInstrument === 'voltmeter' && slotId === 'parallel_slot');
    if (!valid) {
      setErrors((value) => value + 1);
      setPrompt(currentInstrument === 'ammeter' ? '电流表应串联在主回路中，不能并联在电阻两端。' : '电压表应并联在电阻两端，不能串联进主回路。');
      setPromptTone('error');
      selectedInstrumentRef.current = null;
    setSelectedInstrument(null);
      return;
    }

    setAttachedMeters((current) => {
      if (current[currentInstrument]) return current;
      const next = { ...current, [currentInstrument]: true };
      const ready = next.ammeter && next.voltmeter;
      setPrompt(ready ? '两块电表接入正确，现在可以调节变阻器并记录读数。' : `${identifyLabels[currentInstrument]}接入成功，继续连接另一块电表。`);
      setPromptTone('success');
      if (ready) {
        setStep(4);
      }
      return next;
    });
    selectedInstrumentRef.current = null;
    setSelectedInstrument(null);
  };

  const handleRheostatChange = (nextLevel: number) => {
    setRheostatLevel(nextLevel);
    if (step >= 4 && !completed) {
      setPrompt('已调节滑动变阻器，请等待电流表和电压表示数稳定后再记录。');
      setPromptTone('info');
    }
  };

  const handleRecordMeasurement = () => {
    if (step !== 4) return;
    if (!metersReady) {
      setErrors((value) => value + 1);
      setPrompt('请先把电流表和电压表都接好，再记录读数。');
      setPromptTone('error');
      return;
    }

    if (!readingStable) {
      setErrors((value) => value + 1);
      setPrompt('刚调节完滑动变阻器，请先等待电流表和电压表示数稳定再记录。');
      setPromptTone('error');
      return;
    }

    const duplicated = measurements.some((item) => Math.abs(item.voltage - voltage) < 0.18);
    if (duplicated) {
      setErrors((value) => value + 1);
      setPrompt('这一档位与已有数据过于接近，请先调整滑动变阻器，再记录新的读数。');
      setPromptTone('error');
      return;
    }

    setMeasurements((currentRecords) => {
      const next = [...currentRecords, { id: measurementId(), voltage, current, resistance: derivedResistance }];
      if (next.length >= 3) {
        setStep(5);
        setPrompt('已获得至少三组有效读数，请根据数据关系总结结论。');
        setPromptTone('success');
      } else {
        setPrompt('这一组读数已记录，继续调整滑动变阻器采集新的数据。');
        setPromptTone('success');
      }
      return next;
    });
  };

  const handleResetLab = () => {
    reportReset('欧姆定律实验已重置，开始新的接线与测量尝试。');
    setStep(1);
    setIdentifiedParts([]);
    setMainCircuitParts([]);
    selectedInstrumentRef.current = null;
    setSelectedInstrument(null);
    setAttachedMeters({ ammeter: false, voltmeter: false });
    setRheostatLevel(36);
    setMeasurements([]);
    setReadingStable(false);
    setCameraPreset('wide');
    setPrompt(stepCopy[1]);
    setPromptTone('info');
    setSummaryChoice('');
    setErrors(0);
    setCompleted(false);
  };

  const handleSubmitConclusion = () => {
    if (step !== 5) return;
    if (summaryChoice !== 'proportional') {
      setErrors((value) => value + 1);
      setPrompt('结论还不准确。提示：定值电阻保持不变时，I 与 U 呈正比。');
      setPromptTone('error');
      return;
    }

    setCompleted(true);
    setPrompt('实验完成。你已完成接线、测量并验证了欧姆定律。');
    setPromptTone('success');
    setCameraPreset('focus');
  };

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    interactiveObjectsRef.current = [];
    equipmentObjectsRef.current = { power: null, resistor: null, rheostat: null, 'wire-set': null, ammeter: null, voltmeter: null };
    slotObjectsRef.current = { series_slot: null, parallel_slot: null };
    meterNeedlesRef.current = { ammeter: null, voltmeter: null };
    meterHalosRef.current = { ammeter: null, voltmeter: null };
    connectionGroupRef.current = null;
    connectionMaterialsRef.current = [];
    rheostatGlowRef.current = null;
    rheostatSparkRef.current = null;
    powerTerminalGlowRef.current = { positive: null, negative: null };
    resistorSheenRef.current = null;

    const scene = new Scene();
    scene.background = new Color(0x08131e);
    scene.fog = new Fog(0x08131e, 12, 26);
    sceneRef.current = scene;

    const camera = new PerspectiveCamera(40, mountNode.clientWidth / mountNode.clientHeight, 0.1, 100);
    camera.position.set(8.2, 6.5, 8.1);
    camera.lookAt(0.2, 1.65, 0);
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
    controls.target.set(0.2, 1.65, 0);
    controls.update();
    controlsRef.current = controls;

    scene.add(new AmbientLight(0xffffff, 1.24));
    const directional = new DirectionalLight(0xcfe3ff, 1.45);
    directional.position.set(6, 10, 5);
    directional.castShadow = true;
    scene.add(directional);
    const rim = new DirectionalLight(0x38e0c1, 0.38);
    rim.position.set(-6, 6, -6);
    scene.add(rim);

    const table = new Mesh(
      new BoxGeometry(12.4, 0.6, 7.6),
      createLabWoodMaterial({ color: 0x684733, roughness: 0.74 }),
    );
    table.position.set(0, -0.35, 0);
    table.receiveShadow = true;
    scene.add(table);

    const frame = new Mesh(
      new BoxGeometry(12.7, 0.1, 7.9),
      createLabCoatedMetalMaterial({ color: 0x314e6c, roughness: 0.24, metalness: 0.42 }),
    );
    frame.position.set(0, -0.02, 0);
    scene.add(frame);

    const benchInset = new Mesh(
      new BoxGeometry(11.7, 0.05, 6.9),
      createLabPlasticMaterial({ color: 0x102131, roughness: 0.44, clearcoat: 0.18 }),
    );
    benchInset.position.set(0, 0.02, 0);
    scene.add(benchInset);

    const backPanel = new Mesh(
      new PlaneGeometry(18, 10),
      createLabPlasticMaterial({ color: 0x0d1826, roughness: 0.82, clearcoat: 0.04 }),
    );
    backPanel.position.set(0, 4.5, -4.2);
    scene.add(backPanel);

    const benchGlow = new Mesh(
      new CircleGeometry(4.6, 56),
      new MeshBasicMaterial({ color: 0x65d9ff, transparent: true, opacity: 0.08 }),
    );
    benchGlow.rotation.x = -Math.PI / 2;
    benchGlow.position.y = -0.04;
    scene.add(benchGlow);

    const connectionGroup = new Group();
    scene.add(connectionGroup);
    connectionGroupRef.current = connectionGroup;

    const baseMaterial = createLabCoatedMetalMaterial({ color: 0x2b4161, metalness: 0.34, roughness: 0.32 });
    const meterMaterial = createLabPlasticMaterial({ color: 0xe6edf5, metalness: 0.12, roughness: 0.34, clearcoat: 0.54 });
    const darkMaterial = createLabPlasticMaterial({ color: 0x213246, metalness: 0.12, roughness: 0.52, clearcoat: 0.12 });

    const createEquipment = (id: MainPartId | InstrumentId, x: number, z: number, y = 0) => {
      const group = new Group();
      group.position.set(x, y, z);
      group.userData = { role: 'equipment', id };
      group.traverse((child) => {
        child.userData = { role: 'equipment', id };
      });
      interactiveObjectsRef.current.push(group);
      equipmentObjectsRef.current[id] = group;
      scene.add(group);
      return group;
    };

    const power = createEquipment('power', -4.6, -1.7);
    const powerBody = new Mesh(new BoxGeometry(1.7, 1.05, 1), createLabPlasticMaterial({ color: 0x364b60, roughness: 0.4, clearcoat: 0.18 }));
    powerBody.position.y = 0.56;
    const powerPanel = new Mesh(new BoxGeometry(1.3, 0.28, 0.06), createLabPlasticMaterial({ color: 0x182434, roughness: 0.3, clearcoat: 0.22 }));
    powerPanel.position.set(0, 0.72, 0.45);
    const powerDisplay = new Mesh(
      new BoxGeometry(0.8, 0.18, 0.03),
      createLabGlassMaterial({ color: 0xa9ffcf, transparent: true, opacity: 0.3, transmission: 0.92, thickness: 0.06, roughness: 0.02, attenuationDistance: 0.6, attenuationColor: 0xa9ffcf }),
    );
    powerDisplay.position.set(0, 0.72, 0.49);
    const powerGloss = new Mesh(
      new PlaneGeometry(0.24, 0.68),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, side: DoubleSide }),
    );
    powerGloss.position.set(0.48, 0.58, 0.51);
    powerGloss.rotation.y = -Math.PI / 9;
    const powerCapPositive = new Mesh(new CylinderGeometry(0.11, 0.11, 0.12, 18), createLabCoatedMetalMaterial({ color: 0xd36068, roughness: 0.2, metalness: 0.78, clearcoat: 0.16 }));
    powerCapPositive.position.set(0.42, 1.04, -0.2);
    const powerCapNegative = new Mesh(new CylinderGeometry(0.11, 0.11, 0.12, 18), createLabCoatedMetalMaterial({ color: 0x5b83d4, roughness: 0.2, metalness: 0.78, clearcoat: 0.16 }));
    powerCapNegative.position.set(-0.42, 1.04, 0.2);
    const powerPostPositive = new Mesh(new CylinderGeometry(0.05, 0.05, 0.16, 18), createLabMetalMaterial({ color: 0xe4edf6, roughness: 0.16, metalness: 0.98 }));
    powerPostPositive.position.set(0.42, 1.14, -0.2);
    const powerPostNegative = powerPostPositive.clone();
    powerPostNegative.position.set(-0.42, 1.14, 0.2);
    const powerHaloPositive = new Mesh(
      new RingGeometry(0.08, 0.16, 24),
      new MeshBasicMaterial({ color: 0xff7d88, transparent: true, opacity: 0.08, side: DoubleSide }),
    );
    powerHaloPositive.rotation.x = -Math.PI / 2;
    powerHaloPositive.position.set(0.42, 1.105, -0.2);
    const powerHaloNegative = new Mesh(
      new RingGeometry(0.08, 0.16, 24),
      new MeshBasicMaterial({ color: 0x7bb9ff, transparent: true, opacity: 0.08, side: DoubleSide }),
    );
    powerHaloNegative.rotation.x = -Math.PI / 2;
    powerHaloNegative.position.set(-0.42, 1.105, 0.2);
    power.add(powerBody, powerPanel, powerDisplay, powerGloss, powerCapPositive, powerCapNegative, powerPostPositive, powerPostNegative, powerHaloPositive, powerHaloNegative);
    powerTerminalGlowRef.current = { positive: powerHaloPositive, negative: powerHaloNegative };

    const resistor = createEquipment('resistor', -1.9, -1.7);
    const resistorBase = new Mesh(new BoxGeometry(1.6, 0.22, 0.92), createLabCeramicMaterial({ color: 0xd7dde5, roughness: 0.46 }));
    resistorBase.position.y = 0.22;
    const resistorSupportLeft = new Mesh(new BoxGeometry(0.16, 0.42, 0.26), createLabPlasticMaterial({ color: 0x7a5238, roughness: 0.58, clearcoat: 0.08 }));
    resistorSupportLeft.position.set(-0.56, 0.38, 0);
    const resistorSupportRight = resistorSupportLeft.clone();
    resistorSupportRight.position.x = 0.56;
    const resistorTube = new Mesh(new CylinderGeometry(0.16, 0.16, 1.1, 18), createLabCeramicMaterial({ color: 0xf5c06b, roughness: 0.42 }));
    resistorTube.rotation.z = Math.PI / 2;
    resistorTube.position.set(0, 0.62, 0);
    const resistorLeadMaterial = createLabMetalMaterial({ color: 0xdfe7ef, roughness: 0.16, metalness: 0.98 });
    const resistorLeadLeft = new Mesh(new CylinderGeometry(0.024, 0.024, 0.34, 12), resistorLeadMaterial);
    resistorLeadLeft.rotation.z = Math.PI / 2;
    resistorLeadLeft.position.set(-0.72, 0.62, 0);
    const resistorLeadRight = new Mesh(new CylinderGeometry(0.024, 0.024, 0.34, 12), resistorLeadMaterial.clone());
    resistorLeadRight.rotation.z = Math.PI / 2;
    resistorLeadRight.position.set(0.72, 0.62, 0);
    const resistorCapLeft = new Mesh(new CylinderGeometry(0.172, 0.172, 0.08, 16), resistorLeadMaterial.clone());
    resistorCapLeft.rotation.z = Math.PI / 2;
    resistorCapLeft.position.set(-0.5, 0.62, 0);
    const resistorCapRight = new Mesh(new CylinderGeometry(0.172, 0.172, 0.08, 16), resistorLeadMaterial.clone());
    resistorCapRight.rotation.z = Math.PI / 2;
    resistorCapRight.position.set(0.5, 0.62, 0);
    const resistorBands = new Group();
    [-0.24, 0, 0.24].forEach((x, index) => {
      const band = new Mesh(
        new CylinderGeometry(0.165, 0.165, 0.08, 16),
        createLabCoatedMetalMaterial({ color: [0x4b2f20, 0xc9404a, 0x7b3ab8][index], roughness: 0.34, metalness: 0.2 }),
      );
      band.rotation.z = Math.PI / 2;
      band.position.set(x, 0.62, 0);
      resistorBands.add(band);
    });
    const resistorSheen = new Mesh(
      new PlaneGeometry(0.84, 0.18),
      new MeshBasicMaterial({ color: 0xfff3d8, transparent: true, opacity: 0.16, side: DoubleSide }),
    );
    resistorSheen.position.set(0.1, 0.74, 0.18);
    resistorSheen.rotation.y = -Math.PI / 7;
    resistor.add(resistorBase, resistorSupportLeft, resistorSupportRight, resistorLeadLeft, resistorLeadRight, resistorTube, resistorCapLeft, resistorCapRight, resistorBands, resistorSheen);
    resistorSheenRef.current = resistorSheen;

    const rheostat = createEquipment('rheostat', 1.4, -1.7);
    const rheostatBase = new Mesh(new BoxGeometry(2.1, 0.22, 1.02), createLabWoodMaterial({ color: 0x6f4d38, roughness: 0.72 }));
    rheostatBase.position.y = 0.22;
    const rheostatRail = new Mesh(new BoxGeometry(1.5, 0.08, 0.08), createLabMetalMaterial({ color: 0xcfd8e5, roughness: 0.18, metalness: 0.98 }));
    rheostatRail.position.set(0, 0.84, 0);
    const rheostatSlider = new Mesh(new BoxGeometry(0.3, 0.2, 0.38), createLabPlasticMaterial({ color: 0x223245, roughness: 0.48, clearcoat: 0.12 }));
    rheostatSlider.position.set(-0.48, 0.74, 0);
    const rheostatContact = new Mesh(new BoxGeometry(0.14, 0.05, 0.2), createLabMetalMaterial({ color: 0xdfe7ef, roughness: 0.14, metalness: 0.98 }));
    rheostatContact.position.set(0, -0.1, 0);
    rheostatSlider.add(rheostatContact);
    const rheostatKnob = new Mesh(new CylinderGeometry(0.08, 0.08, 0.26, 18), createLabMetalMaterial({ color: 0xcad4de, roughness: 0.22, metalness: 0.96 }));
    rheostatKnob.position.set(-0.48, 0.94, 0);
    const rheostatCore = new Mesh(new CylinderGeometry(0.08, 0.08, 1.38, 20), createLabCeramicMaterial({ color: 0xe7d2a6, roughness: 0.38 }));
    rheostatCore.rotation.z = Math.PI / 2;
    rheostatCore.position.set(0, 0.58, 0);
    const rheostatWindings = new Group();
    Array.from({ length: 13 }).forEach((_, index) => {
      const winding = new Mesh(
        new TorusGeometry(0.108, 0.014, 8, 20),
        createLabCoatedMetalMaterial({ color: 0xc78b56, roughness: 0.22, metalness: 0.58, clearcoat: 0.12 }),
      );
      winding.rotation.y = Math.PI / 2;
      winding.position.set(-0.6 + index * 0.1, 0.58, 0);
      rheostatWindings.add(winding);
    });
    const rheostatGlow = new Mesh(
      new PlaneGeometry(1.34, 0.22),
      new MeshBasicMaterial({ color: 0x8feaff, transparent: true, opacity: 0.1, side: DoubleSide }),
    );
    rheostatGlow.position.set(0, 0.66, 0.2);
    const rheostatSpark = new Mesh(
      new SphereGeometry(0.08, 12, 12),
      new MeshBasicMaterial({ color: 0xb3fbff, transparent: true, opacity: 0.08 }),
    );
    rheostatSpark.position.set(-0.48, 0.67, 0.18);
    rheostat.add(rheostatBase, rheostatRail, rheostatSlider, rheostatKnob, rheostatCore, rheostatWindings, rheostatGlow, rheostatSpark);
    rheostatGlowRef.current = rheostatGlow;
    rheostatSparkRef.current = rheostatSpark;

    const wireSet = createEquipment('wire-set', 4.2, -1.8);
    const ring = new Mesh(new TorusGeometry(0.42, 0.12, 16, 40), createLabRubberMaterial({ color: 0x65d9ff, roughness: 0.7, metalness: 0 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.5;
    const innerRing = new Mesh(new TorusGeometry(0.28, 0.08, 14, 32), createLabRubberMaterial({ color: 0x213246, roughness: 0.78, metalness: 0 }));
    innerRing.rotation.x = Math.PI / 2;
    innerRing.position.y = 0.5;
    const wireClipLeft = new Mesh(new SphereGeometry(0.07, 12, 12), createLabMetalMaterial({ color: 0xd8e1eb, roughness: 0.18, metalness: 0.98 }));
    wireClipLeft.position.set(-0.3, 0.5, 0);
    const wireClipRight = wireClipLeft.clone();
    wireClipRight.position.x = 0.3;
    wireSet.add(ring, innerRing, wireClipLeft, wireClipRight);

    const createMeter = (id: InstrumentId, x: number, z: number, faceColor: number) => {
      const group = createEquipment(id, x, z);
      const body = new Mesh(new CylinderGeometry(0.66, 0.66, 0.42, 24), meterMaterial);
      body.position.y = 0.36;
      const face = new Mesh(new CylinderGeometry(0.5, 0.5, 0.06, 24), createLabCeramicMaterial({ color: faceColor, roughness: 0.28 }));
      face.rotation.x = Math.PI / 2;
      face.position.set(0, 0.42, 0.18);
      const glass = new Mesh(
        new CylinderGeometry(0.52, 0.52, 0.03, 24),
        createLabGlassMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, transmission: 0.94, roughness: 0.02, thickness: 0.08, attenuationDistance: 0.8, attenuationColor: 0xf8fdff }),
      );
      glass.rotation.x = Math.PI / 2;
      glass.position.set(0, 0.45, 0.22);
      const bezel = new Mesh(new TorusGeometry(0.53, 0.04, 14, 48), createLabMetalMaterial({ color: 0xd7e0e9, roughness: 0.16, metalness: 0.98 }));
      bezel.rotation.x = Math.PI / 2;
      bezel.position.set(0, 0.45, 0.2);
      const gloss = new Mesh(
        new PlaneGeometry(0.16, 0.54),
        new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, side: DoubleSide }),
      );
      gloss.position.set(0.18, 0.48, 0.25);
      gloss.rotation.y = -Math.PI / 5;
      const halo = new Mesh(
        new TorusGeometry(0.62, 0.03, 14, 48),
        new MeshBasicMaterial({ color: id === 'ammeter' ? 0x8dffd8 : 0x98cdff, transparent: true, opacity: 0.08 }),
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.set(0, 0.45, 0.24);
      const ticks = new Group();
      Array.from({ length: 9 }).forEach((_, index) => {
        const tick = new Mesh(
          new BoxGeometry(index % 4 === 0 ? 0.12 : 0.08, 0.014, 0.02),
          createLabPlasticMaterial({ color: 0x244154, roughness: 0.42, clearcoat: 0.12 }),
        );
        const angle = -Math.PI * 0.78 + (index / 8) * Math.PI * 0.92;
        tick.position.set(Math.cos(angle) * 0.34, 0.43, 0.18 + Math.sin(angle) * 0.34);
        tick.rotation.y = -angle;
        ticks.add(tick);
      });
      const needle = new Mesh(new BoxGeometry(0.42, 0.03, 0.02), createLabCoatedMetalMaterial({ color: 0xff6b7a, roughness: 0.18, metalness: 0.44 }));
      needle.position.set(0.14, 0.43, 0.18);
      needle.rotation.y = -0.9;
      const center = new Mesh(new CylinderGeometry(0.04, 0.04, 0.05, 16), createLabMetalMaterial({ color: 0x425161, roughness: 0.24, metalness: 0.96 }));
      center.rotation.x = Math.PI / 2;
      center.position.set(0, 0.44, 0.2);
      group.add(body, face, glass, bezel, gloss, halo, ticks, needle, center);
      meterNeedlesRef.current[id] = needle;
      meterHalosRef.current[id] = halo;
    };

    createMeter('ammeter', -4.0, 1.9, 0xb1f8cb);
    createMeter('voltmeter', -1.3, 1.9, 0xc3d8ff);

    const seriesSlot = new Mesh(new BoxGeometry(1.15, 0.12, 0.5), createLabCoatedMetalMaterial({ color: 0x233246, roughness: 0.34, metalness: 0.26 }));
    seriesSlot.position.set(2.8, 0.3, 0.92);
    seriesSlot.userData = { role: 'slot', id: 'series_slot' };
    seriesSlot.castShadow = true;
    seriesSlot.receiveShadow = true;
    interactiveObjectsRef.current.push(seriesSlot);
    scene.add(seriesSlot);
    slotObjectsRef.current.series_slot = seriesSlot;

    const parallelSlot = new Mesh(new BoxGeometry(1.15, 0.12, 0.5), createLabCoatedMetalMaterial({ color: 0x233246, roughness: 0.34, metalness: 0.26 }));
    parallelSlot.position.set(0.0, 1.24, 1.42);
    parallelSlot.userData = { role: 'slot', id: 'parallel_slot' };
    parallelSlot.castShadow = true;
    parallelSlot.receiveShadow = true;
    interactiveObjectsRef.current.push(parallelSlot);
    scene.add(parallelSlot);
    slotObjectsRef.current.parallel_slot = parallelSlot;

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
        handleAttachSlot(hitInfo.id as SlotId);
        return;
      }

      if (hitInfo.role === 'equipment') {
        if (step === 1 && (hitInfo.id === 'ammeter' || hitInfo.id === 'voltmeter' || hitInfo.id === 'rheostat')) {
          handleIdentify(hitInfo.id as IdentifyId);
          return;
        }

        if (step === 2 && (hitInfo.id === 'power' || hitInfo.id === 'resistor' || hitInfo.id === 'rheostat' || hitInfo.id === 'wire-set')) {
          handleBuildMainCircuit(hitInfo.id as MainPartId);
          return;
        }

        if (step === 3 && (hitInfo.id === 'ammeter' || hitInfo.id === 'voltmeter')) {
          handleSelectInstrument(hitInfo.id as InstrumentId);
        }
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

    const animate = (time = 0) => {
      frameRef.current = window.requestAnimationFrame(animate);
      controls.update();

      const { current: liveCurrent, voltage: liveVoltage, attachedMeters: liveMeters } = liveValuesRef.current;
      const circuitLive = liveMeters.ammeter || liveMeters.voltmeter;
      const pulse = circuitLive ? 0.38 + Math.sin(time * 0.008) * 0.22 : 0.12;
      connectionMaterialsRef.current.forEach((material, index) => {
        if (material.userData.layer === 'pulse') {
          material.opacity = Math.max(0.16, pulse + index * 0.03);
          return;
        }
        if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
          material.emissive = new Color(0x5ecfff);
          material.emissiveIntensity = 0.08 + pulse * 0.34;
        }
      });

      const ammeterNeedle = meterNeedlesRef.current.ammeter;
      if (ammeterNeedle) {
        const target = liveMeters.ammeter ? -1.2 + liveCurrent * 2.1 : -1.2;
        const wobble = liveMeters.ammeter && !readingStableRef.current ? Math.sin(time * 0.02) * 0.08 : 0;
        ammeterNeedle.rotation.y = target + wobble;
      }

      const voltmeterNeedle = meterNeedlesRef.current.voltmeter;
      if (voltmeterNeedle) {
        const target = liveMeters.voltmeter ? -1.2 + liveVoltage * 0.42 : -1.2;
        const wobble = liveMeters.voltmeter && !readingStableRef.current ? Math.cos(time * 0.018) * 0.06 : 0;
        voltmeterNeedle.rotation.y = target + wobble;
      }

      (['ammeter', 'voltmeter'] as InstrumentId[]).forEach((instrumentId, index) => {
        const halo = meterHalosRef.current[instrumentId];
        if (!halo) return;
        const material = halo.material;
        const liveValue = instrumentId === 'ammeter' ? liveCurrent : liveVoltage;
        const active = liveMeters[instrumentId];
        if (material instanceof MeshBasicMaterial) {
          material.opacity = active ? 0.12 + Math.min(0.22, liveValue * 0.06) + Math.sin(time * 0.009 + index) * 0.04 : 0.05;
        }
        halo.scale.setScalar(active ? 1.02 + Math.sin(time * 0.012 + index) * 0.04 : 1);
      });

      const rheostatGlow = rheostatGlowRef.current;
      if (rheostatGlow) {
        const material = rheostatGlow.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = circuitLive ? 0.12 + Math.sin(time * 0.01) * 0.05 + liveCurrent * 0.08 : stepRef.current >= 2 ? 0.06 : 0.02;
        }
      }

      const rheostatSpark = rheostatSparkRef.current;
      if (rheostatSpark) {
        const material = rheostatSpark.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = circuitLive ? 0.1 + Math.sin(time * 0.024) * 0.08 : 0.03;
        }
        rheostatSpark.scale.setScalar(circuitLive ? 1 + Math.sin(time * 0.02) * 0.18 : 0.84);
      }

      const resistorSheen = resistorSheenRef.current;
      if (resistorSheen) {
        const material = resistorSheen.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = 0.12 + (circuitLive ? 0.08 : 0) + Math.sin(time * 0.007) * 0.03;
        }
      }

      (Object.values(powerTerminalGlowRef.current) as Array<Mesh | null>).forEach((halo, index) => {
        if (!halo) return;
        const material = halo.material;
        if (material instanceof MeshBasicMaterial) {
          material.opacity = stepRef.current >= 2 ? 0.08 + (circuitLive ? 0.1 : 0.03) + Math.sin(time * 0.01 + index) * 0.03 : 0.03;
        }
        halo.scale.setScalar(stepRef.current >= 2 ? 1 + Math.sin(time * 0.008 + index) * 0.05 : 0.92);
      });

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
      realism.dispose();
      connectionGroupRef.current?.children.forEach((child) => disposeThreeObject(child));
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
  }, [cameraPreset]);

  useEffect(() => {
    const rheostat = equipmentObjectsRef.current.rheostat;
    if (rheostat) {
      const slider = rheostat.children[2] as Mesh | undefined;
      const knob = rheostat.children[3] as Mesh | undefined;
      const sliderX = -0.6 + (rheostatLevel / 100) * 1.2;
      if (slider) {
        slider.position.x = sliderX;
      }
      if (knob) {
        knob.position.x = sliderX;
      }
      if (rheostatSparkRef.current) {
        rheostatSparkRef.current.position.x = sliderX;
      }
      if (rheostatGlowRef.current) {
        rheostatGlowRef.current.scale.x = 0.84 + (rheostatLevel / 100) * 0.3;
      }
    }

    identifyOrder.forEach((partId) => {
      const object = equipmentObjectsRef.current[partId];
      const hovered = hoveredPart === partId;
      applyGlow(object, hovered ? 0x72f5ff : identifiedParts.includes(partId) ? 0x1e5b4e : step === 1 ? 0x103149 : 0x000000, hovered ? 0.92 : identifiedParts.includes(partId) ? 0.72 : step === 1 ? 0.32 : 0.08);
    });

    mainPartOrder.forEach((partId) => {
      const object = equipmentObjectsRef.current[partId];
      const hovered = hoveredPart === partId;
      applyGlow(object, hovered ? 0x72f5ff : mainCircuitParts.includes(partId) ? 0x1e5b4e : step === 2 ? 0x103149 : partId === 'rheostat' && step >= 4 ? 0x15485a : 0x000000, hovered ? 0.92 : mainCircuitParts.includes(partId) ? 0.72 : step === 2 ? 0.32 : partId === 'rheostat' && step >= 4 ? 0.26 : 0.08);
    });

    (['ammeter', 'voltmeter'] as InstrumentId[]).forEach((instrumentId) => {
      const object = equipmentObjectsRef.current[instrumentId];
      const attached = attachedMeters[instrumentId];
      const selected = selectedInstrument === instrumentId;
      const hovered = hoveredPart === instrumentId;
      applyGlow(object, hovered ? 0x72f5ff : attached ? 0x1e5b4e : selected ? 0xffb648 : step === 3 ? 0x103149 : 0x000000, hovered ? 0.96 : attached ? 0.72 : selected ? 0.58 : step === 3 ? 0.32 : 0.08);
    });

    (['series_slot', 'parallel_slot'] as SlotId[]).forEach((slotId) => {
      const mesh = slotObjectsRef.current[slotId];
      if (!mesh) return;
      const material = mesh.material;
      const occupied = slotId === 'series_slot' ? attachedMeters.ammeter : attachedMeters.voltmeter;
      if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
        const hovered = hoveredPart === slotId;
        material.color = new Color(hovered ? 0x86f4ff : occupied ? 0x2ed47a : step === 3 ? 0x65d9ff : 0x213246);
        material.emissive = new Color(hovered ? 0x18485b : occupied ? 0x0f493d : step === 3 ? 0x103149 : 0x000000);
        material.emissiveIntensity = hovered ? 0.9 : occupied ? 0.82 : step === 3 ? 0.3 : 0.08;
      }
    });

    const connectionGroup = connectionGroupRef.current;
    if (connectionGroup) {
      connectionGroup.children.forEach((child) => disposeThreeObject(child));
      connectionGroup.clear();
      connectionMaterialsRef.current = [];
      const addCable = (points: [number, number, number][], color = 0x65d9ff, glowColor = 0xaef0ff) => {
        const vectors = points.map((point) => new Vector3(...point));
        const curve = new CatmullRomCurve3(vectors);
        const tubularSegments = Math.max(32, vectors.length * 16);
        const baseGeometry = new TubeGeometry(curve, tubularSegments, 0.04, 12, false);
        const baseMaterial = createLabRubberMaterial({ color, transparent: true, opacity: 0.98, roughness: 0.82 });
        baseMaterial.userData = { layer: 'base' };
        const pulseGeometry = new TubeGeometry(curve, tubularSegments, 0.018, 10, false);
        const pulseMaterial = new MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.18 });
        pulseMaterial.userData = { layer: 'pulse' };
        const terminalMaterial = createLabMetalMaterial({ color: 0xd0d8e4, roughness: 0.2, metalness: 0.98 });
        terminalMaterial.userData = { layer: 'base' };
        const startTerminal = new Mesh(new SphereGeometry(0.06, 14, 14), terminalMaterial);
        startTerminal.position.copy(vectors[0]);
        const endTerminal = new Mesh(new SphereGeometry(0.06, 14, 14), terminalMaterial.clone());
        (endTerminal.material as Material & { userData: Record<string, unknown> }).userData = { layer: 'base' };
        endTerminal.position.copy(vectors[vectors.length - 1]);
        const baseCable = new Mesh(baseGeometry, baseMaterial);
        const pulseCable = new Mesh(pulseGeometry, pulseMaterial);
        baseCable.castShadow = true;
        baseCable.receiveShadow = true;
        pulseCable.castShadow = false;
        connectionGroup.add(baseCable, pulseCable, startTerminal, endTerminal);
        connectionMaterialsRef.current.push(baseMaterial as Material & { userData: Record<string, unknown>; opacity: number }, pulseMaterial as Material & { userData: Record<string, unknown>; opacity: number }, startTerminal.material as Material & { userData: Record<string, unknown>; opacity: number }, endTerminal.material as Material & { userData: Record<string, unknown>; opacity: number });
      };

      if (mainCircuitParts.includes('power')) addCable([[-4.0, 1.1, -1.2], [-3.1, 1.1, -1.2]], 0x4dc2ff, 0xbdf6ff);
      if (mainCircuitParts.includes('resistor')) addCable([[-2.7, 1.1, -1.2], [-1.0, 1.1, -1.2]], 0x4dc2ff, 0xbdf6ff);
      if (mainCircuitParts.includes('rheostat')) addCable([[0.2, 1.1, -1.2], [2.3, 1.1, -1.2]], 0x4dc2ff, 0xbdf6ff);
      if (mainCircuitParts.includes('wire-set')) addCable([[2.8, 1.1, -1.2], [4.5, 1.1, -1.2], [4.5, 0.5, 0.8], [3.2, 0.5, 0.8]], 0x4dc2ff, 0xbdf6ff);
      if (attachedMeters.ammeter) addCable([[2.8, 0.36, 0.92], [2.8, 1.8, 1.4], [-4.0, 1.8, 1.4]], 0x8eeaff, 0xe4ffff);
      if (attachedMeters.voltmeter) addCable([[0.0, 1.24, 1.42], [-1.3, 1.86, 1.42], [-1.3, 1.86, 1.9]], 0xb7cfff, 0xf2f8ff);
    }
  }, [attachedMeters, current, hoveredPart, identifiedParts, mainCircuitParts, rheostatLevel, selectedInstrument, step, voltage]);

  useEffect(() => {
    if (step < 4 || !metersReady || completed) {
      setReadingStable(false);
      return;
    }

    setReadingStable(false);
    const timer = window.setTimeout(() => {
      setReadingStable(true);
    }, 420);

    return () => window.clearTimeout(timer);
  }, [completed, metersReady, rheostatLevel, step]);

  const sceneNoteTone = promptTone === 'error' ? 'invalid' : measurements.length >= 3 || completed ? 'valid' : 'neutral';
  const hoveredPartCopy = hoveredPart ? ohmHoverCopy[hoveredPart] : null;
  const ohmApparatusIds = ['battery-pack', 'wire-set', 'meter-set', 'resistor-board', 'rheostat'];
  const ohmActiveApparatusId = useMemo(() => {
    if (hoveredPart === 'power') return 'battery-pack';
    if (hoveredPart === 'resistor') return 'resistor-board';
    if (hoveredPart === 'rheostat') return 'rheostat';
    if (hoveredPart === 'ammeter' || hoveredPart === 'voltmeter') return 'meter-set';
    if (hoveredPart === 'wire-set' || hoveredPart === 'series_slot' || hoveredPart === 'parallel_slot') return 'wire-set';
    if (selectedInstrument) return 'meter-set';
    return null;
  }, [hoveredPart, selectedInstrument]);
  const selectedInstrumentLabel = selectedInstrument ? identifyLabels[selectedInstrument] : '未选择电表';
  const lastMeasurement = measurements[measurements.length - 1] ?? null;
  const ohmRuntimeContext = useMemo(
    () => ({
      experimentId: experiment.id,
      step,
      completed,
      progress: Math.min(1, measurements.length / 3),
      focusId: hoveredPart,
      flags: {
        mainCircuitReady,
        metersReady,
        readingStable,
        meterConnected: attachedMeters.ammeter || attachedMeters.voltmeter,
      },
      metrics: {
        voltage,
        current,
        derivedResistance,
        averageResistance,
        rheostatLevel,
        measurementCount: measurements.length,
      },
      values: {
        selectedInstrument: selectedInstrumentLabel,
        resistanceQuality,
      },
    }),
    [
      attachedMeters,
      averageResistance,
      completed,
      current,
      derivedResistance,
      experiment.id,
      hoveredPart,
      mainCircuitReady,
      measurements.length,
      metersReady,
      readingStable,
      resistanceQuality,
      rheostatLevel,
      selectedInstrumentLabel,
      step,
      voltage,
    ],
  );
  const ohmSimulationRuntime = useMemo(
    () => createSimulationRuntimeFromApparatus({
      playerId: 'ohm-law-lab-player',
      apparatusIds: ohmApparatusIds,
      runtimeContext: ohmRuntimeContext,
      activeApparatusId: ohmActiveApparatusId,
      phaseLabel: stepTitles[step],
      phaseState: completed ? 'completed' : 'active',
      progress: completed ? 1 : Math.min(0.96, ((step - 1) / 4) + Math.min(measurements.length / 3, 1) * 0.22),
      focusTarget: hoveredPartCopy?.title ?? (selectedInstrument ? `${selectedInstrumentLabel}接线位` : '欧姆定律装置'),
      stateSummary: `${mainCircuitReady ? '主回路已建立' : '主回路待完成'} · ${metersReady ? '电表接入完成' : '电表待接入'} · ${measurements.length} 组有效读数`,
      observables: [
        { key: 'voltage', label: '电压', value: voltage, unit: ' V' },
        { key: 'current', label: '电流', value: current, unit: ' A' },
        { key: 'derived-resistance', label: '瞬时电阻', value: derivedResistance, unit: ' ohm', status: readingStable ? 'nominal' : 'warning' },
        { key: 'average-resistance', label: '平均电阻', value: averageResistance, unit: ' ohm' },
        { key: 'measurement-count', label: '测量组数', value: measurements.length },
      ],
      controls: [
        { key: 'instrument-select', label: '电表选择', value: selectedInstrumentLabel, kind: 'discrete' },
        { key: 'rheostat', label: '滑动变阻器', value: rheostatLevel, kind: 'slider' },
        { key: 'camera-preset', label: '镜头机位', value: cameraPreset, kind: 'discrete' },
        { key: 'summary-choice', label: '结论选择', value: summaryChoice || '未选择', kind: 'discrete' },
      ],
      phases: [1, 2, 3, 4, 5].map((stepId) => ({
        key: `step-${stepId}`,
        label: stepTitles[stepId as StepId],
        state: completed || step > stepId || (stepId === 5 && completed) ? 'completed' : step === stepId ? 'active' : 'pending',
      })),
      failureRisks: [
        !mainCircuitReady ? '主回路未建立前记录 U-I 数据，后续拟合关系没有物理意义。' : '',
        step >= 3 && !metersReady ? '电流表或电压表接入不完整，读数不会形成有效约束。' : '',
        step >= 4 && !readingStable ? '刚调节变阻器时指针仍在波动，应该等待稳定后再记录。' : '',
      ],
      trace: [
        '电源 -> 电阻 -> 电流表 -> 变阻器 -> 回路闭合',
        lastMeasurement ? `最近一次记录 ${lastMeasurement.voltage}V / ${lastMeasurement.current}A` : '先形成至少一组稳定读数',
      ],
    }),
    [
      averageResistance,
      cameraPreset,
      completed,
      current,
      derivedResistance,
      hoveredPartCopy?.title,
      lastMeasurement,
      mainCircuitReady,
      measurements.length,
      metersReady,
      ohmActiveApparatusId,
      ohmApparatusIds,
      ohmRuntimeContext,
      readingStable,
      rheostatLevel,
      selectedInstrument,
      selectedInstrumentLabel,
      step,
      summaryChoice,
      voltage,
    ],
  );

  useEffect(() => {
    onSimulationRuntimeChange?.(ohmSimulationRuntime);
  }, [ohmSimulationRuntime, onSimulationRuntimeChange]);

  useEffect(() => () => {
    onSimulationRuntimeChange?.(null);
  }, [onSimulationRuntimeChange]);
  const ohmWorkbenchStatus =
    step <= 2
      ? '点击 3D 台面完成器材识别与主回路搭建。'
      : step === 3
        ? selectedInstrument
          ? `已选择${identifyLabels[selectedInstrument]}，请点击正确接入位置。`
          : '先在下方选择电表，再点击 3D 台面中的接入口。'
        : step === 4
          ? readingStable
            ? '示数已稳定，可以记录当前读数。'
            : '刚调节档位，请等待电表指针稳定。'
          : completed
            ? '实验完成，可复盘 U-I 图像与读数关系。'
            : '根据测得的数据关系，选择正确结论。';
  const ohmCompletionCopy = completed
    ? '实验已完成，当前版本支持器材识别、主回路搭建、电表接入、变阻器调节、自动成图和结论提交。'
    : '当前还未完成最终结论提交，先完成数据采集再总结欧姆定律。';

  return (
    <section className="playground-panel panel ohm-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">3D Demo</span>
          <h2>{experiment.title} · 本地 3D 实验 Demo</h2>
        </div>
        <div className="badge-row compact">
          <span className="badge">步骤 {step}/5</span>
          <span className="badge">电压 {voltage}V</span>
          <span className="badge">电流 {current}A</span>
          <span className="badge">得分 {score}</span>
        </div>
      </div>

      <div className="playground-grid ohm-grid">
        <aside className="playground-side ohm-side-rail ohm-side-rail-left">
          <div className="info-card ohm-rail-card">
            <strong>器材识别</strong>
            <div className="ohm-tag-group">
              <span className="ohm-tag-title">电表与变阻器</span>
              <div className="equipment-list">
                {identifyOrder.map((partId) => (
                  <span className={identifiedParts.includes(partId) ? 'equipment-tag identified' : 'equipment-tag'} key={partId}>
                    {identifyLabels[partId]}
                  </span>
                ))}
              </div>
            </div>
            <div className="ohm-tag-group">
              <span className="ohm-tag-title">主回路器材</span>
              <div className="equipment-list">
                {mainPartOrder.map((partId) => (
                  <span className={mainCircuitParts.includes(partId) ? 'equipment-tag identified' : 'equipment-tag'} key={partId}>
                    {mainPartLabels[partId]}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="info-card ohm-rail-card">
            <strong>步骤总览</strong>
            <ol className="step-list compact-list">
              {ohmStepOrder.map((stepId) => (
                <li className={step === stepId ? 'active' : step > stepId || (stepId === 5 && completed) ? 'done' : ''} key={stepId}>
                  {stepTitles[stepId]}
                </li>
              ))}
            </ol>
            <div className={`ohm-rail-prompt tone-${promptTone}`}>
              <span>当前提示</span>
              <p>{prompt}</p>
            </div>
          </div>
        </aside>

        <div className="scene-panel ohm-workbench-stage">
          <div className="scene-toolbar ohm-workbench-toolbar">
            <div className="ohm-toolbar-head">
              <div className="ohm-toolbar-kicker">欧姆定律工作台</div>
              <strong>{experiment.title}</strong>
              <p className="ohm-toolbar-copy">核心操作都收进舞台下方，不再依赖右侧大面板才能完成接线、读数和总结。</p>
            </div>
            <div className="camera-actions ohm-camera-actions">
              <button className={cameraPreset === 'wide' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('wide')} type="button">
                台面全景
              </button>
              <button className={cameraPreset === 'top' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('top')} type="button">
                俯视接线
              </button>
              <button className={cameraPreset === 'focus' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('focus')} type="button">
                聚焦读数
              </button>
            </div>
          </div>

          <div className="scene-meta-strip ohm-stage-meta">
            <div className={`ohm-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>
                步骤 {step} · {stepTitles[step]}
              </strong>
              <p>{prompt}</p>
            </div>
            <div className="ohm-step-pills" aria-label="实验步骤概览">
              {ohmStepOrder.map((stepId) => (
                <span className={step === stepId ? 'ohm-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'ohm-step-pill done' : 'ohm-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="scene-canvas ohm-scene-canvas">
            <div className="three-stage-mount ohm-three-mount" ref={mountRef} />
          </div>

          <div className="workbench-inline-dock ohm-workbench-dock">
            <div className="ohm-workbench-status-grid">
              <div className={`info-card ohm-status-card ${sceneNoteTone === 'invalid' ? 'tone-error' : sceneNoteTone === 'valid' ? 'tone-success' : ''}`.trim()}>
                <span>当前进度</span>
                <strong>
                  步骤 {step} · {stepTitles[step]}
                </strong>
                <p>{ohmWorkbenchStatus}</p>
              </div>
              <div className="info-card ohm-status-card">
                <span>实时读数</span>
                <strong>
                  U {voltage} V · I {current} A
                </strong>
                <p>R≈ {derivedResistance} Ω · 平均 {averageResistance} Ω</p>
              </div>
              <div className={`info-card ohm-status-card ${metersReady ? 'tone-success' : ''}`.trim()}>
                <span>电表接入</span>
                <strong>{metersReady ? '双表就位' : '等待接入'}</strong>
                <p>{selectedInstrumentLabel} · {hoveredPartCopy?.title ?? '悬停部件会显示用途'}</p>
              </div>
              <div className={`info-card ohm-status-card ${measurements.length >= 3 ? 'tone-success' : ''}`.trim()}>
                <span>数据质量</span>
                <strong>
                  {measurements.length} 组 · {resistanceQuality}
                </strong>
                <p>阻值离散 {resistanceSpread} Ω</p>
              </div>
            </div>

            <ReusableApparatusDock
              activeApparatusId={ohmActiveApparatusId}
              apparatusIds={ohmApparatusIds}
              contextLabel="电源、导线、电表、电阻和滑变现在不只是本实验专用模型，而是统一的电学器材底座。"
              experiment={experiment}
              runtimeContext={ohmRuntimeContext}
              title="欧姆定律器材引擎"
            />

            <div className="info-card ohm-inline-panel ohm-equipment-panel">
              <strong>台面目标</strong>
              <div className="ohm-equipment-strip">
                <div className="ohm-tag-group">
                  <span className="ohm-tag-title">步骤 1：识别</span>
                  <div className="equipment-list">
                    {identifyOrder.map((partId) => (
                      <span className={identifiedParts.includes(partId) ? 'equipment-tag identified' : 'equipment-tag'} key={partId}>
                        {identifyLabels[partId]}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ohm-tag-group">
                  <span className="ohm-tag-title">步骤 2：主回路</span>
                  <div className="equipment-list">
                    {mainPartOrder.map((partId) => (
                      <span className={mainCircuitParts.includes(partId) ? 'equipment-tag identified' : 'equipment-tag'} key={partId}>
                        {mainPartLabels[partId]}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="ohm-inline-controls">
              <section className="info-card ohm-inline-panel">
                <strong>接入与接线</strong>
                <div className="ohm-slot-list">
                  {(['series_slot', 'parallel_slot'] as SlotId[]).map((slotId) => (
                    <div className="enzyme-row" key={slotId}>
                      <strong>{slotLabels[slotId]}</strong>
                      <small>{slotId === 'series_slot' ? (attachedMeters.ammeter ? '电流表已就位' : '等待电流表') : attachedMeters.voltmeter ? '电压表已就位' : '等待电压表'}</small>
                    </div>
                  ))}
                </div>
                <div className="camera-actions split-actions">
                  <button className={selectedInstrument === 'ammeter' ? 'scene-action active' : 'scene-action'} onClick={() => handleSelectInstrument('ammeter')} type="button" disabled={step !== 3 || attachedMeters.ammeter}>
                    选择电流表
                  </button>
                  <button className={selectedInstrument === 'voltmeter' ? 'scene-action active' : 'scene-action'} onClick={() => handleSelectInstrument('voltmeter')} type="button" disabled={step !== 3 || attachedMeters.voltmeter}>
                    选择电压表
                  </button>
                </div>
                <small>步骤 1-2 请直接点击 3D 台面中的器材完成识别与主回路搭建。</small>
              </section>

              <section className="info-card ohm-inline-panel">
                <strong>读数控制</strong>
                <label className="range-block">
                  <span>滑动变阻器档位</span>
                  <input type="range" min="20" max="95" value={rheostatLevel} onChange={(event) => handleRheostatChange(Number(event.target.value))} disabled={step !== 4} />
                  <small>当前档位 {rheostatLevel} · {step < 4 ? '完成接线后才能调节' : readingStable ? '示数已稳定，可以记录' : '刚调档，等待指针稳定'}</small>
                </label>
                <div className="status-pill-row">
                  <span className="status-pill ready">U = {voltage}V</span>
                  <span className="status-pill ready">I = {current}A</span>
                  <span className="status-pill ready">R = {derivedResistance}Ω</span>
                  <span className={readingStable ? 'status-pill ready' : 'status-pill'}>指针 {readingStable ? '稳定' : '波动中'}</span>
                </div>
                <div className="button-stack">
                  <button className="action-button ghost" onClick={handleRecordMeasurement} type="button" disabled={step !== 4}>
                    记录当前读数
                  </button>
                  <button className="action-button ghost" onClick={handleResetLab} type="button">
                    重置欧姆实验
                  </button>
                </div>
              </section>
            </div>

            <div className="ohm-inline-data">
              <section className="info-card ohm-inline-panel">
                <strong>数据表</strong>
                <div className="measurement-table">
                  <div className="measurement-row head">
                    <span>序号</span>
                    <span>U / V</span>
                    <span>I / A</span>
                    <span>R / Ω</span>
                  </div>
                  {measurements.length ? (
                    measurements.map((item, index) => (
                      <div className="measurement-row" key={item.id}>
                        <span>{index + 1}</span>
                        <span>{item.voltage}</span>
                        <span>{item.current}</span>
                        <span>{item.resistance}</span>
                      </div>
                    ))
                  ) : (
                    <div className="measurement-empty">至少记录三组不同档位读数。</div>
                  )}
                </div>
              </section>

              <section className="info-card ohm-inline-panel">
                <strong>U-I 图像</strong>
                <div className="chart-shell">
                  <svg className="graph-svg" viewBox={`0 0 ${chartModel.width} ${chartModel.height}`} role="img" aria-label="欧姆定律实验 U-I 图像">
                    <defs>
                      <linearGradient id="ohm-graph-gradient" x1="0%" x2="100%" y1="0%" y2="0%">
                        <stop offset="0%" stopColor="#65d9ff" />
                        <stop offset="100%" stopColor="#38e0c1" />
                      </linearGradient>
                    </defs>
                    {chartModel.gridX.map((item) => (
                      <g key={`grid-x-${item.value}`}>
                        <line className="graph-grid" x1={item.x} x2={item.x} y1={18} y2={chartModel.baseY} />
                        <text className="graph-label" x={item.x} y={chartModel.baseY + 18} textAnchor="middle">{item.value}</text>
                      </g>
                    ))}
                    {chartModel.gridY.map((item) => (
                      <g key={`grid-y-${item.value}`}>
                        <line className="graph-grid" x1={chartModel.paddingLeft} x2={chartModel.width - 18} y1={item.y} y2={item.y} />
                        <text className="graph-label" x={chartModel.paddingLeft - 10} y={item.y + 4} textAnchor="end">{item.value}</text>
                      </g>
                    ))}
                    <line className="graph-axis" x1={chartModel.paddingLeft} x2={chartModel.width - 18} y1={chartModel.baseY} y2={chartModel.baseY} />
                    <line className="graph-axis" x1={chartModel.paddingLeft} x2={chartModel.paddingLeft} y1={18} y2={chartModel.baseY} />
                    <line className="graph-trend" x1={chartModel.idealLine.x1} y1={chartModel.idealLine.y1} x2={chartModel.idealLine.x2} y2={chartModel.idealLine.y2} />
                    {chartModel.linePath ? <path className="graph-path" d={chartModel.linePath} /> : null}
                    {chartModel.points.map((point) => (
                      <circle className="graph-point" cx={point.x} cy={point.y} key={point.id} r={5.5} />
                    ))}
                    <circle className="graph-live-point" cx={chartModel.livePoint.x} cy={chartModel.livePoint.y} r={7} />
                    <text className="graph-axis-title" x={chartModel.width - 10} y={chartModel.baseY + 28} textAnchor="end">U / V</text>
                    <text className="graph-axis-title" transform={`translate(14 26) rotate(-90)`} textAnchor="end">I / A</text>
                  </svg>
                  <div className="status-pill-row">
                    <span className="status-pill ready">平均电阻 {averageResistance}Ω</span>
                    <span className={measurements.length >= 3 ? 'status-pill ready' : 'status-pill'}>已记录 {measurements.length} 组</span>
                    <span className={measurements.length >= 2 && resistanceSpread <= 0.45 ? 'status-pill ready' : 'status-pill'}>一致性 {resistanceQuality}</span>
                  </div>
                  <small>{measurements.length ? '实心点为已记录数据，空心点为当前未记录读数。散点越接近虚线，说明定值电阻越稳定。' : '先记录不同档位的读数，图像会自动生成。'}</small>
                </div>
              </section>
            </div>

            {step === 5 || completed ? (
              <div className="ohm-summary-dock">
                <div className="ohm-summary-head">
                  <div>
                    <span>结论选择</span>
                    <strong>在定值电阻保持不变时，电流 I 与电压 U 成正比</strong>
                  </div>
                  <button className="action-button ohm-submit-button" onClick={handleSubmitConclusion} type="button" disabled={step !== 5 || completed}>
                    {completed ? '已完成' : '提交实验结论'}
                  </button>
                </div>
                <div className="ohm-choice-row">
                  <button className={summaryChoice === 'parallel-meter' ? 'summary-choice active' : 'summary-choice'} onClick={() => setSummaryChoice('parallel-meter')} type="button">
                    电流表并联、电压表串联时更容易读出准确数据
                  </button>
                  <button className={summaryChoice === 'proportional' ? 'summary-choice active' : 'summary-choice'} onClick={() => setSummaryChoice('proportional')} type="button">
                    在定值电阻保持不变时，电流 I 与电压 U 成正比
                  </button>
                  <button className={summaryChoice === 'independent' ? 'summary-choice active' : 'summary-choice'} onClick={() => setSummaryChoice('independent')} type="button">
                    改变电压不会影响电流，I 与 U 没有关系
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="playground-side ohm-side-rail ohm-side-rail-right">
          <div className="info-card ohm-rail-card">
            <strong>实验状态</strong>
            <div className="ohm-mini-metrics">
              <div className="ohm-mini-metric">
                <span>主回路</span>
                <strong>{mainCircuitReady ? '已完成' : '待搭建'}</strong>
              </div>
              <div className="ohm-mini-metric">
                <span>电表接入</span>
                <strong>{metersReady ? '双表已接入' : '未完成'}</strong>
              </div>
              <div className="ohm-mini-metric">
                <span>数据采集</span>
                <strong>{measurements.length} 组</strong>
              </div>
              <div className="ohm-mini-metric">
                <span>指针状态</span>
                <strong>{readingStable ? '稳定' : '波动中'}</strong>
              </div>
            </div>
          </div>

          <div className="info-card ohm-rail-card">
            <strong>最新记录</strong>
            <div className="detail-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>最近一组读数</strong>
                  <small>{lastMeasurement ? `U ${lastMeasurement.voltage} V · I ${lastMeasurement.current} A · R ${lastMeasurement.resistance} Ω` : '尚未记录读数'}</small>
                </div>
                <span className={lastMeasurement ? 'status-pill ready' : 'status-pill'}>{lastMeasurement ? '已记录' : '待记录'}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>悬停部件</strong>
                  <small>{hoveredPartCopy?.detail ?? '把鼠标移到器材或接入口上，可以查看接线意义。'}</small>
                </div>
                <span className={hoveredPartCopy ? 'status-pill ready' : 'status-pill'}>{hoveredPartCopy?.title ?? '无'}</span>
              </div>
            </div>
          </div>

          <div className={completed ? 'info-card success-card ohm-rail-card' : 'info-card ohm-rail-card'}>
            <strong>完成状态</strong>
            <p>{ohmCompletionCopy}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
