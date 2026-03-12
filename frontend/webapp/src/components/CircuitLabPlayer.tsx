import { useEffect, useMemo, useRef, useState } from 'react';
import { AmbientLight, BoxGeometry, BufferGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide, Fog, GridHelper, Group, Intersection, Line, LineBasicMaterial, LineDashedMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PCFSoftShadowMap, PerspectiveCamera, Plane, PlaneGeometry, PointLight, Raycaster, RingGeometry, Scene, SphereGeometry, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ReusableApparatusDock } from './ReusableApparatusDock';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import { attachLabRealism, createLabCoatedMetalMaterial, createLabGlassMaterial, createLabMetalMaterial, createLabPlasticMaterial, createLabWoodMaterial } from '../lib/threeRealism';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import type { SimulationRuntimeSnapshot } from '../lib/simulationRuntime';
import { createSimulationRuntimeFromApparatus } from '../lib/simulationRuntimeAdapter';
import type { ExperimentConfig } from '../types/experiment';

type EquipmentId = 'battery' | 'switch' | 'bulb1' | 'bulb2' | 'wire';
type LayoutMode = 'series' | 'parallel';
type StepId = 1 | 2 | 3 | 4 | 5;
type CameraPreset = 'angled' | 'top' | 'focus';
type PromptTone = 'info' | 'success' | 'error';
type TerminalId =
  | 'battery_pos'
  | 'battery_neg'
  | 'switch_in'
  | 'switch_out'
  | 'bulb1_in'
  | 'bulb1_out'
  | 'bulb2_in'
  | 'bulb2_out'
  | 'split_pos'
  | 'merge_neg';

interface TerminalDef {
  id: TerminalId;
  position: [number, number, number];
}

interface FlowParticle {
  mesh: Mesh;
  start: Vector3;
  end: Vector3;
  offset: number;
}

const equipmentOrder: EquipmentId[] = ['battery', 'switch', 'bulb1', 'bulb2', 'wire'];
const equipmentLabels: Record<EquipmentId, string> = {
  battery: '电池盒',
  switch: '开关',
  bulb1: '灯泡 A',
  bulb2: '灯泡 B',
  wire: '导线组',
};
const stepCopy: Record<StepId, string> = {
  1: '先点击 3D 场景里的器材，完成器材识别。',
  2: '按住一个端子拖拽到另一个端子，完成串联电路连线。',
  3: '现在闭合开关并记录串联电路现象。',
  4: '继续用拖拽吸附方式连接并联电路，注意分流点和汇流点。',
  5: '选择正确结论并提交，完成本次实验。',
};

const stepTitles: Record<StepId, string> = {
  1: '识别器材',
  2: '连接串联电路',
  3: '观察串联现象',
  4: '连接并联电路',
  5: '总结差异',
};

const circuitStepOrder: StepId[] = [1, 2, 3, 4, 5];

const circuitHoverCopy: Record<string, { title: string; detail: string }> = {
  battery_pos: { title: '电池正极端', detail: '电流从高电势端出发，接线逻辑应与回路方向一致。' },
  battery_neg: { title: '电池负极端', detail: '负极负责形成回路闭合，少接一端整条线路都不会通电。' },
  switch_in: { title: '开关输入端', detail: '开关串联在主回路中，控制整个电路通断。' },
  switch_out: { title: '开关输出端', detail: '通过它把电流继续送向灯泡或分流节点。' },
  bulb1_in: { title: '灯泡 A 输入端', detail: '灯泡要完整接入回路，两端都接上才会发光。' },
  bulb1_out: { title: '灯泡 A 输出端', detail: '输出端继续把电流送往下一个器件或汇流点。' },
  bulb2_in: { title: '灯泡 B 输入端', detail: '并联时两个支路都应从分流点独立取电。' },
  bulb2_out: { title: '灯泡 B 输出端', detail: '支路末端最终需要回到同一汇流点。' },
  split_pos: { title: '分流点', detail: '并联电路从这里分成两条支路，两个灯泡互不串接。' },
  merge_neg: { title: '汇流点', detail: '两条支路在这里重新汇合，再回到电源负极。' },
};

const seriesEdges: Array<[TerminalId, TerminalId]> = [
  ['battery_pos', 'switch_in'],
  ['switch_out', 'bulb1_in'],
  ['bulb1_out', 'bulb2_in'],
  ['bulb2_out', 'battery_neg'],
];

const parallelEdges: Array<[TerminalId, TerminalId]> = [
  ['battery_pos', 'split_pos'],
  ['split_pos', 'bulb1_in'],
  ['split_pos', 'bulb2_in'],
  ['bulb1_out', 'merge_neg'],
  ['bulb2_out', 'merge_neg'],
  ['merge_neg', 'battery_neg'],
];

const layoutTerminals: Record<LayoutMode, TerminalDef[]> = {
  series: [
    { id: 'battery_pos', position: [-4.2, 0.65, -0.25] },
    { id: 'battery_neg', position: [-4.2, 0.65, 0.25] },
    { id: 'switch_in', position: [-2.5, 0.45, 0] },
    { id: 'switch_out', position: [-1.2, 0.45, 0] },
    { id: 'bulb1_in', position: [0.2, 0.6, 0] },
    { id: 'bulb1_out', position: [1.4, 0.6, 0] },
    { id: 'bulb2_in', position: [2.8, 0.6, 0] },
    { id: 'bulb2_out', position: [4.0, 0.6, 0] },
  ],
  parallel: [
    { id: 'battery_pos', position: [-4.2, 0.65, -0.25] },
    { id: 'battery_neg', position: [-4.2, 0.65, 0.25] },
    { id: 'split_pos', position: [-1.7, 0.45, 0] },
    { id: 'bulb1_in', position: [0.2, 0.6, -1.7] },
    { id: 'bulb1_out', position: [1.4, 0.6, -1.7] },
    { id: 'bulb2_in', position: [0.2, 0.6, 1.7] },
    { id: 'bulb2_out', position: [1.4, 0.6, 1.7] },
    { id: 'merge_neg', position: [3.2, 0.45, 0] },
  ],
};

function normalizeEdge(a: string, b: string) {
  return [a, b].sort().join('__');
}

function buildExpectedEdgeSet(layout: LayoutMode) {
  const edges = layout === 'series' ? seriesEdges : parallelEdges;
  return new Set(edges.map(([a, b]) => normalizeEdge(a, b)));
}

function terminalKey(layout: LayoutMode, id: TerminalId) {
  return `${layout}:${id}`;
}

function isVisibleObject(object: Object3D) {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function createLamp(color: number) {
  const group = new Group();
  const base = new Mesh(
    new CylinderGeometry(0.3, 0.42, 0.22, 24),
    createLabMetalMaterial({ color: 0x55617a, roughness: 0.28, metalness: 0.9, clearcoat: 0.12 }),
  );
  base.position.y = 0.12;

  const socket = new Mesh(
    new CylinderGeometry(0.18, 0.22, 0.28, 24),
    createLabCoatedMetalMaterial({ color: 0x96a3b8, roughness: 0.22, metalness: 0.82, clearcoat: 0.14 }),
  );
  socket.position.y = 0.28;

  const threadGroup = new Group();
  Array.from({ length: 4 }).forEach((_, index) => {
    const thread = new Mesh(
      new TorusGeometry(0.16, 0.012, 8, 24),
      createLabMetalMaterial({ color: 0xd7e0ea, roughness: 0.14, metalness: 0.98 }),
    );
    thread.rotation.x = Math.PI / 2;
    thread.position.y = 0.18 + index * 0.04;
    threadGroup.add(thread);
  });

  const glass = new Mesh(
    new SphereGeometry(0.32, 24, 24),
    createLabGlassMaterial({ color, emissive: 0x000000, emissiveIntensity: 0.6, opacity: 0.34, transmission: 0.92, thickness: 0.46, roughness: 0.02, attenuationDistance: 1.8, attenuationColor: color }),
  );
  glass.position.y = 0.52;
  glass.userData.glow = true;

  const innerGlow = new Mesh(
    new SphereGeometry(0.14, 16, 16),
    new MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 0.06 }),
  );
  innerGlow.position.y = 0.48;
  innerGlow.userData.innerGlow = true;

  const filamentLeft = new Mesh(
    new BoxGeometry(0.014, 0.14, 0.014),
    createLabMetalMaterial({ color: 0xdbe4ec, roughness: 0.12, metalness: 0.96 }),
  );
  filamentLeft.position.set(-0.08, 0.42, 0);
  const filamentRight = filamentLeft.clone();
  filamentRight.position.x = 0.08;
  const filament = new Mesh(
    new TorusGeometry(0.08, 0.01, 8, 24, Math.PI),
    new MeshBasicMaterial({ color: 0xffefb0, transparent: true, opacity: 0.08 }),
  );
  filament.rotation.z = Math.PI;
  filament.position.set(0, 0.5, 0);
  filament.userData.filament = true;

  const gloss = new Mesh(
    new PlaneGeometry(0.12, 0.36),
    new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, side: DoubleSide }),
  );
  gloss.position.set(0.12, 0.58, 0.24);
  gloss.rotation.y = -Math.PI / 6;

  const halo = new Mesh(
    new SphereGeometry(0.45, 18, 18),
    new MeshBasicMaterial({ color: 0xffd56b, transparent: true, opacity: 0 }),
  );
  halo.position.y = 0.52;
  halo.userData.halo = true;

  const light = new PointLight(0xffd56b, 0, 4.6, 2);
  light.position.y = 0.52;
  light.userData.glowLight = true;

  group.add(base, socket, threadGroup, glass, innerGlow, filamentLeft, filamentRight, filament, gloss, halo, light);
  return group;
}

function createWireSpool() {
  const group = new Group();
  const ring = new Mesh(
    new TorusGeometry(0.35, 0.12, 16, 48),
    createLabPlasticMaterial({ color: 0x65d9ff, roughness: 0.26, clearcoat: 0.6, clearcoatRoughness: 0.12 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.45;

  const innerRing = new Mesh(
    new TorusGeometry(0.22, 0.07, 12, 32),
    createLabPlasticMaterial({ color: 0x24364d, roughness: 0.42, clearcoat: 0.18 }),
  );
  innerRing.rotation.x = Math.PI / 2;
  innerRing.position.y = 0.45;

  const hub = new Mesh(
    new CylinderGeometry(0.12, 0.12, 0.45, 24),
    createLabMetalMaterial({ color: 0x324765, roughness: 0.24, metalness: 0.94, clearcoat: 0.1 }),
  );
  hub.rotation.z = Math.PI / 2;
  hub.position.y = 0.45;

  const capLeft = new Mesh(
    new CylinderGeometry(0.16, 0.16, 0.05, 20),
    createLabMetalMaterial({ color: 0xdbe5ef, roughness: 0.16, metalness: 0.98 }),
  );
  capLeft.rotation.z = Math.PI / 2;
  capLeft.position.set(-0.24, 0.45, 0);
  const capRight = capLeft.clone();
  capRight.position.x = 0.24;

  const looseLead = new Mesh(
    new TorusGeometry(0.08, 0.02, 8, 18, Math.PI * 1.2),
    createLabPlasticMaterial({ color: 0xffb648, roughness: 0.28, clearcoat: 0.24 }),
  );
  looseLead.rotation.z = Math.PI / 2.4;
  looseLead.position.set(0.26, 0.64, 0.1);

  group.add(ring, innerRing, hub, capLeft, capRight, looseLead);
  return group;
}

interface HitInfo {
  role?: string;
  id?: string;
  scope?: string;
}

interface CircuitLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
  onSimulationRuntimeChange?: (snapshot: SimulationRuntimeSnapshot | null) => void;
}

export function CircuitLabPlayer({ experiment, onTelemetry, onSimulationRuntimeChange }: CircuitLabPlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const frameRef = useRef<number | null>(null);
  const raycasterRef = useRef(new Raycaster());
  const pointerRef = useRef(new Vector2());
  const dragPlaneRef = useRef(new Plane(new Vector3(0, 1, 0), -0.45));
  const wiresGroupRef = useRef<Group | null>(null);
  const particlesGroupRef = useRef<Group | null>(null);
  const previewLineRef = useRef<Line | null>(null);
  const wireMaterialsRef = useRef<LineBasicMaterial[]>([]);
  const flowParticlesRef = useRef<FlowParticle[]>([]);
  const layoutGroupsRef = useRef<Record<LayoutMode, Group>>({
    series: new Group(),
    parallel: new Group(),
  });
  const equipmentRef = useRef<Record<EquipmentId, Object3D | null>>({
    battery: null,
    switch: null,
    bulb1: null,
    bulb2: null,
    wire: null,
  });
  const terminalsRef = useRef<Record<string, Mesh>>({});
  const interactiveObjectsRef = useRef<Object3D[]>([]);
  const stepRef = useRef<StepId>(1);
  const layoutRef = useRef<LayoutMode>('series');
  const connectionsRef = useRef<string[]>([]);
  const dragStartTerminalRef = useRef<TerminalId | null>(null);
  const invalidFeedbackTimerRef = useRef<number | null>(null);

  const [step, setStep] = useState<StepId>(1);
  const [identified, setIdentified] = useState<EquipmentId[]>([]);
  const [connections, setConnections] = useState<string[]>([]);
  const [selectedTerminal, setSelectedTerminal] = useState<string | null>(null);
  const [hoveredTerminal, setHoveredTerminal] = useState<string | null>(null);
  const [hoveredEquipmentId, setHoveredEquipmentId] = useState<EquipmentId | null>(null);
  const [errors, setErrors] = useState(0);
  const [prompt, setPrompt] = useState(stepCopy[1]);
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [switchClosed, setSwitchClosed] = useState(false);
  const [summaryChoice, setSummaryChoice] = useState('');
  const [completed, setCompleted] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('angled');
  const [isDraggingWire, setIsDraggingWire] = useState(false);
  const [invalidTerminal, setInvalidTerminal] = useState<string | null>(null);
  const [previewValidity, setPreviewValidity] = useState<'neutral' | 'valid' | 'invalid'>('neutral');

  const layout: LayoutMode = step >= 4 ? 'parallel' : 'series';
  const score = Math.max(72, 100 - errors * 5);
  const canObserve = step === 3;
  const canRecordObservation = step === 3 && switchClosed;
  const hoveredTerminalCopy = hoveredTerminal ? circuitHoverCopy[hoveredTerminal] : null;
  const layoutLabel = layout === 'series' ? '串联回路' : '并联回路';
  const connectionStatusText = isDraggingWire
    ? '正在拖拽导线'
    : previewValidity === 'valid'
      ? '当前端子可吸附连接'
      : previewValidity === 'invalid'
        ? '当前连接无效，请更换端子'
        : '按住发光端子拖到另一端子';
  const completionCopy = completed
    ? '实验已完成，现在可以自由切换视角复盘串联与并联的路径差异。'
    : '当前还未完成最终结论提交。';
  const circuitApparatusIds = ['battery-pack', 'wire-set', 'switch-module', 'bulb-module'];
  const circuitActiveApparatusId = useMemo(() => {
    if (hoveredTerminal || selectedTerminal || isDraggingWire) return 'wire-set';
    if (hoveredEquipmentId === 'battery') return 'battery-pack';
    if (hoveredEquipmentId === 'switch') return 'switch-module';
    if (hoveredEquipmentId === 'bulb1' || hoveredEquipmentId === 'bulb2') return 'bulb-module';
    if (hoveredEquipmentId === 'wire') return 'wire-set';
    if (switchClosed) return 'switch-module';
    return null;
  }, [hoveredEquipmentId, hoveredTerminal, isDraggingWire, selectedTerminal, switchClosed]);
  const expectedConnections = useMemo(() => buildExpectedEdgeSet(layout), [layout]);
  const circuitRuntimeContext = useMemo(
    () => ({
      experimentId: experiment.id,
      step,
      completed,
      progress: completed ? 1 : expectedConnections.size ? Math.min(1, connections.length / expectedConnections.size) : 0,
      focusId: hoveredTerminal || hoveredEquipmentId,
      flags: {
        switchClosed,
        isDraggingWire,
        mainCircuitReady: connections.length > 0,
        currentFlowing: switchClosed && connections.length > 0,
      },
      metrics: {
        connectionCount: connections.length,
        errors,
        score,
      },
      values: {
        layout: layoutLabel,
      },
    }),
    [
      completed,
      connections.length,
      errors,
      expectedConnections.size,
      experiment.id,
      hoveredEquipmentId,
      hoveredTerminal,
      isDraggingWire,
      layoutLabel,
      score,
      step,
      switchClosed,
    ],
  );
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
  const circuitSimulationRuntime = useMemo(
    () => createSimulationRuntimeFromApparatus({
      playerId: 'circuit-lab-player',
      apparatusIds: circuitApparatusIds,
      runtimeContext: circuitRuntimeContext,
      activeApparatusId: circuitActiveApparatusId,
      phaseLabel: stepTitles[step],
      phaseState: completed ? 'completed' : 'active',
      progress: completed ? 1 : Math.min(0.96, ((step - 1) / 4) + (expectedConnections.size ? (connections.length / expectedConnections.size) * 0.16 : 0)),
      focusTarget: hoveredTerminalCopy?.title ?? (hoveredEquipmentId ? equipmentLabels[hoveredEquipmentId] : layoutLabel),
      stateSummary: switchClosed
        ? `${layoutLabel}已闭合，${connections.length} 条连接正在参与回路。`
        : `${layoutLabel}仍在搭建，当前 ${connections.length} 条连接已生效。`,
      observables: [
        { key: 'layout', label: '回路拓扑', value: layoutLabel },
        { key: 'connection-count', label: '连接数', value: connections.length },
        { key: 'switch-state', label: '开关状态', value: switchClosed ? '闭合' : '断开', status: switchClosed ? 'nominal' : 'warning' },
        { key: 'lamp-state', label: '发光状态', value: switchClosed ? (layout === 'parallel' ? '双支路发光' : '串联点亮') : '未点亮' },
        { key: 'score', label: '得分', value: score },
      ],
      controls: [
        { key: 'wire-drag', label: '导线拖拽', value: isDraggingWire ? '进行中' : '待操作', kind: 'discrete' },
        { key: 'switch-control', label: '开关控制', value: switchClosed ? '闭合' : '断开', kind: 'toggle' },
        { key: 'camera-preset', label: '镜头机位', value: cameraPreset, kind: 'discrete' },
        { key: 'summary-choice', label: '结论选择', value: summaryChoice || '未选择', kind: 'discrete' },
      ],
      phases: circuitStepOrder.map((stepId) => ({
        key: `step-${stepId}`,
        label: stepTitles[stepId],
        state: completed || step > stepId || (stepId === 5 && completed) ? 'completed' : step === stepId ? 'active' : 'pending',
      })),
      failureRisks: [
        previewValidity === 'invalid' ? '当前端子组合不在有效拓扑里，继续连线会破坏回路。' : '',
        step >= 3 && !switchClosed ? '观察现象前还未闭合开关，灯泡不会进入有效读数状态。' : '',
        step === 5 && summaryChoice && summaryChoice !== 'parallel-branches' ? '当前结论选择与并联分支特征不一致。' : '',
      ],
      trace: [
        layout === 'series' ? '电池正极 -> 开关 -> 灯泡A -> 灯泡B -> 电池负极' : '电池正极 -> 分流点 -> 灯泡A / 灯泡B -> 汇流点 -> 电池负极',
        switchClosed ? '电流闭环已建立' : '回路尚未闭合',
      ],
    }),
    [
      cameraPreset,
      completed,
      connections.length,
      expectedConnections.size,
      hoveredEquipmentId,
      hoveredTerminalCopy?.title,
      circuitActiveApparatusId,
      circuitApparatusIds,
      circuitRuntimeContext,
      isDraggingWire,
      layout,
      layoutLabel,
      previewValidity,
      score,
      step,
      summaryChoice,
      switchClosed,
    ],
  );

  useEffect(() => {
    stepRef.current = step;
    layoutRef.current = layout;
    connectionsRef.current = connections;
  }, [connections, layout, step]);

  useEffect(() => {
    onSimulationRuntimeChange?.(circuitSimulationRuntime);
  }, [circuitSimulationRuntime, onSimulationRuntimeChange]);

  useEffect(() => () => {
    onSimulationRuntimeChange?.(null);
  }, [onSimulationRuntimeChange]);

  const clearInvalidFeedback = () => {
    if (invalidFeedbackTimerRef.current) {
      window.clearTimeout(invalidFeedbackTimerRef.current);
      invalidFeedbackTimerRef.current = null;
    }
    setInvalidTerminal(null);
    setPreviewValidity('neutral');
  };

  const flashInvalidTerminal = (terminalId: string) => {
    if (invalidFeedbackTimerRef.current) {
      window.clearTimeout(invalidFeedbackTimerRef.current);
    }
    setInvalidTerminal(terminalId);
    setPreviewValidity('invalid');
    invalidFeedbackTimerRef.current = window.setTimeout(() => {
      setInvalidTerminal((current) => (current === terminalId ? null : current));
      setPreviewValidity('neutral');
      invalidFeedbackTimerRef.current = null;
    }, 900);
  };

  const applyCameraPreset = (preset: CameraPreset) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const target = new Vector3(0, 0.45, 0);
    const position = new Vector3(0, 7.8, 11.2);

    if (preset === 'top') {
      target.set(0, 0.2, 0);
      position.set(0.01, 13.8, 0.01);
    }

    if (preset === 'focus') {
      if (layoutRef.current === 'series') {
        target.set(2.1, 0.45, 0);
        position.set(2.8, 4.2, 6.4);
      } else {
        target.set(1.2, 0.45, 0);
        position.set(2.4, 4.8, 7.0);
      }
    }

    camera.position.copy(position);
    controls.target.copy(target);
    controls.update();
  };

  useEffect(() => {
    const mountNode = mountRef.current;
    if (!mountNode) return;

    interactiveObjectsRef.current = [];
    terminalsRef.current = {};
    wireMaterialsRef.current = [];
    layoutGroupsRef.current.series.clear();
    layoutGroupsRef.current.parallel.clear();

    const scene = new Scene();
    scene.background = new Color(0x091521);
    scene.fog = new Fog(0x091521, 12, 24);
    sceneRef.current = scene;

    const camera = new PerspectiveCamera(40, mountNode.clientWidth / mountNode.clientHeight, 0.1, 100);
    camera.position.set(0, 7.8, 11.2);
    camera.lookAt(0, 0.45, 0);
    cameraRef.current = camera;

    const renderer = new WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mountNode.clientWidth, mountNode.clientHeight);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    const realism = attachLabRealism(renderer, scene, { exposure: 1.08, environmentIntensity: 0.92 });
    rendererRef.current = renderer;
    mountNode.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 18;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.target.set(0, 0.45, 0);
    controls.update();
    controlsRef.current = controls;

    const ambient = new AmbientLight(0xffffff, 1.35);
    const directional = new DirectionalLight(0xcce2ff, 1.7);
    directional.position.set(4, 9, 6);
    directional.castShadow = true;
    const rim = new DirectionalLight(0x38e0c1, 0.5);
    rim.position.set(-6, 4, -8);
    const glow = new PointLight(0x2d5aff, 0.9, 24, 2);
    glow.position.set(0, 6, 0);
    scene.add(ambient, directional, rim, glow);

    const table = new Mesh(
      new BoxGeometry(12, 0.6, 7.5),
      createLabWoodMaterial({ color: 0x11223d, roughness: 0.82, clearcoat: 0.06 }),
    );
    table.position.set(0, -0.35, 0);
    table.receiveShadow = true;
    scene.add(table);

    const tableFrame = new Mesh(
      new BoxGeometry(12.4, 0.1, 7.9),
      createLabCoatedMetalMaterial({ color: 0x27486c, roughness: 0.28, metalness: 0.48, clearcoat: 0.34 }),
    );
    tableFrame.position.set(0, -0.03, 0);
    scene.add(tableFrame);

    const gridHelper = new GridHelper(11, 18, 0x2e4f77, 0x173456);
    gridHelper.position.y = -0.02;
    scene.add(gridHelper);

    const seriesGroup = layoutGroupsRef.current.series;
    const parallelGroup = layoutGroupsRef.current.parallel;
    scene.add(seriesGroup, parallelGroup);

    const battery = new Mesh(
      new BoxGeometry(1.4, 0.8, 0.9),
      createLabPlasticMaterial({ color: 0x3f5d7a, roughness: 0.24, clearcoat: 0.48, clearcoatRoughness: 0.14 }),
    );
    battery.position.set(-4.8, 0.4, 0);
    battery.castShadow = true;
    battery.userData = { role: 'equipment', id: 'battery' };
    const batteryLabel = new Mesh(
      new BoxGeometry(0.84, 0.18, 0.04),
      createLabPlasticMaterial({ color: 0x152331, roughness: 0.34, clearcoat: 0.16 }),
    );
    batteryLabel.position.set(0, 0.08, 0.47);
    const batteryGloss = new Mesh(
      new PlaneGeometry(0.2, 0.56),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.14, side: DoubleSide }),
    );
    batteryGloss.position.set(0.36, 0.1, 0.49);
    batteryGloss.rotation.y = -Math.PI / 8;
    const batteryPosTerminal = new Mesh(
      new CylinderGeometry(0.09, 0.09, 0.14, 18),
      createLabCoatedMetalMaterial({ color: 0xd45f68, roughness: 0.18, metalness: 0.76, clearcoat: 0.12 }),
    );
    batteryPosTerminal.position.set(0.42, 0.46, -0.16);
    const batteryNegTerminal = new Mesh(
      new CylinderGeometry(0.09, 0.09, 0.14, 18),
      createLabCoatedMetalMaterial({ color: 0x5c86d6, roughness: 0.18, metalness: 0.76, clearcoat: 0.12 }),
    );
    batteryNegTerminal.position.set(-0.42, 0.46, 0.16);
    const batteryPosHalo = new Mesh(
      new RingGeometry(0.08, 0.16, 24),
      new MeshBasicMaterial({ color: 0xff7b86, transparent: true, opacity: 0.08, side: DoubleSide }),
    );
    batteryPosHalo.rotation.x = -Math.PI / 2;
    batteryPosHalo.position.set(0.42, 0.405, -0.16);
    batteryPosHalo.userData.powerHalo = 'positive';
    const batteryNegHalo = new Mesh(
      new RingGeometry(0.08, 0.16, 24),
      new MeshBasicMaterial({ color: 0x7bbaff, transparent: true, opacity: 0.08, side: DoubleSide }),
    );
    batteryNegHalo.rotation.x = -Math.PI / 2;
    batteryNegHalo.position.set(-0.42, 0.405, 0.16);
    batteryNegHalo.userData.powerHalo = 'negative';
    battery.add(batteryLabel, batteryGloss, batteryPosTerminal, batteryNegTerminal, batteryPosHalo, batteryNegHalo);
    seriesGroup.add(battery);
    equipmentRef.current.battery = battery;
    interactiveObjectsRef.current.push(battery);

    const switchBox = new Mesh(
      new BoxGeometry(1.2, 0.28, 0.7),
      createLabCoatedMetalMaterial({ color: 0x6d7d91, roughness: 0.26, metalness: 0.42, clearcoat: 0.38 }),
    );
    switchBox.position.set(-1.85, 0.18, 0);
    switchBox.castShadow = true;
    switchBox.userData = { role: 'equipment', id: 'switch' };
    const switchPlate = new Mesh(
      new BoxGeometry(0.96, 0.04, 0.56),
      createLabMetalMaterial({ color: 0xd6dfe8, roughness: 0.18, metalness: 0.98 }),
    );
    switchPlate.position.y = 0.15;
    const switchContactLeft = new Mesh(new CylinderGeometry(0.05, 0.05, 0.08, 14), createLabMetalMaterial({ color: 0xe4edf4, roughness: 0.14, metalness: 0.98 }));
    switchContactLeft.position.set(-0.24, 0.18, 0);
    const switchContactRight = switchContactLeft.clone();
    switchContactRight.position.set(0.26, 0.18, 0);
    const switchLever = new Mesh(
      new BoxGeometry(0.52, 0.05, 0.08),
      createLabMetalMaterial({ color: 0xe8eef5, roughness: 0.14, metalness: 0.98 }),
    );
    switchLever.position.set(0.04, 0.22, 0);
    switchLever.rotation.z = -0.48;
    switchLever.userData.switchLever = true;
    const switchArc = new Mesh(
      new SphereGeometry(0.12, 12, 12),
      new MeshBasicMaterial({ color: 0xaef7ff, transparent: true, opacity: 0 }),
    );
    switchArc.position.set(0.26, 0.21, 0);
    switchArc.scale.set(1.35, 0.72, 0.68);
    switchArc.userData.switchArc = true;
    switchBox.add(switchPlate, switchContactLeft, switchContactRight, switchLever, switchArc);
    seriesGroup.add(switchBox);
    equipmentRef.current.switch = switchBox;
    interactiveObjectsRef.current.push(switchBox);

    const wireSpool = createWireSpool();
    wireSpool.position.set(-0.2, 0, -2.2);
    wireSpool.userData = { role: 'equipment', id: 'wire' };
    seriesGroup.add(wireSpool);
    equipmentRef.current.wire = wireSpool;
    interactiveObjectsRef.current.push(wireSpool);

    const bulb1 = createLamp(0xffd66b);
    bulb1.position.set(0.9, 0, 0);
    bulb1.userData = { role: 'equipment', id: 'bulb1' };
    seriesGroup.add(bulb1);
    equipmentRef.current.bulb1 = bulb1;
    interactiveObjectsRef.current.push(bulb1);

    const bulb2 = createLamp(0xffd66b);
    bulb2.position.set(3.6, 0, 0);
    bulb2.userData = { role: 'equipment', id: 'bulb2' };
    seriesGroup.add(bulb2);
    equipmentRef.current.bulb2 = bulb2;
    interactiveObjectsRef.current.push(bulb2);

    const parallelBattery = battery.clone();
    parallelBattery.position.set(-4.8, 0.4, 0);
    parallelGroup.add(parallelBattery);

    const splitNode = new Mesh(
      new CylinderGeometry(0.2, 0.2, 0.28, 20),
      createLabMetalMaterial({ color: 0x65d9ff, roughness: 0.22, metalness: 0.96, clearcoat: 0.12 }),
    );
    splitNode.rotation.x = Math.PI / 2;
    splitNode.position.set(-1.8, 0.2, 0);
    parallelGroup.add(splitNode);

    const mergeNode = splitNode.clone();
    mergeNode.position.set(3.35, 0.2, 0);
    parallelGroup.add(mergeNode);

    const parallelBulb1 = createLamp(0xffd66b);
    parallelBulb1.position.set(0.8, 0, -1.75);
    parallelGroup.add(parallelBulb1);

    const parallelBulb2 = createLamp(0xffd66b);
    parallelBulb2.position.set(0.8, 0, 1.75);
    parallelGroup.add(parallelBulb2);

    (['series', 'parallel'] as LayoutMode[]).forEach((scope) => {
      layoutTerminals[scope].forEach((terminal) => {
        const mesh = new Mesh(
          new SphereGeometry(0.12, 20, 20),
          createLabMetalMaterial({ color: 0x65d9ff, emissive: 0x103149, emissiveIntensity: 0.55, roughness: 0.18, metalness: 0.98, clearcoat: 0.08 }),
        );
        mesh.position.set(...terminal.position);
        mesh.castShadow = true;
        mesh.userData = { role: 'terminal', id: terminal.id, layout: scope };
        terminalsRef.current[terminalKey(scope, terminal.id)] = mesh;
        interactiveObjectsRef.current.push(mesh);
        layoutGroupsRef.current[scope].add(mesh);
      });
    });

    const wiresGroup = new Group();
    const particlesGroup = new Group();
    wiresGroupRef.current = wiresGroup;
    particlesGroupRef.current = particlesGroup;
    scene.add(wiresGroup, particlesGroup);

    const previewGeometry = new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]);
    const previewMaterial = new LineDashedMaterial({ color: 0xffb648, dashSize: 0.22, gapSize: 0.14, transparent: true, opacity: 0.95 });
    const previewLine = new Line(previewGeometry, previewMaterial);
    previewLine.visible = false;
    scene.add(previewLine);
    previewLineRef.current = previewLine;

    const updateRayFromEvent = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycasterRef.current.setFromCamera(pointerRef.current, camera);
    };

    const getHitInfo = (): HitInfo | null => {
      const intersections = raycasterRef.current.intersectObjects(interactiveObjectsRef.current, true);
      if (!intersections.length) return null;
      const hit = intersections.find((item: Intersection<Object3D>) => isVisibleObject(item.object));
      const object = hit?.object;
      if (!object) return null;
      return {
        role: object.userData.role ?? object.parent?.userData.role,
        id: object.userData.id ?? object.parent?.userData.id,
        scope: object.userData.layout ?? object.parent?.userData.layout,
      };
    };

    const getTerminalWorldPosition = (currentLayout: LayoutMode, terminalId: string) => {
      const terminal = layoutTerminals[currentLayout].find((item) => item.id === terminalId);
      return terminal ? new Vector3(...terminal.position) : null;
    };

    const setPreviewLine = (start: Vector3, end: Vector3, visible: boolean, validity: 'neutral' | 'valid' | 'invalid' = 'neutral') => {
      const line = previewLineRef.current;
      if (!line) return;
      const geometry = line.geometry as BufferGeometry;
      geometry.setFromPoints([start, end]);
      geometry.computeBoundingSphere();
      const material = line.material as LineDashedMaterial;
      material.color = new Color(validity === 'invalid' ? 0xff6b7a : validity === 'valid' ? 0x38e0c1 : 0xffb648);
      line.visible = visible;
      line.computeLineDistances();
    };

    const clearDragState = () => {
      dragStartTerminalRef.current = null;
      setSelectedTerminal(null);
      setHoveredTerminal(null);
      setIsDraggingWire(false);
      setPreviewLine(new Vector3(), new Vector3(), false, 'neutral');
      controls.enabled = true;
      renderer.domElement.style.cursor = 'default';
    };

    const handlePointerDown = (event: PointerEvent) => {
      updateRayFromEvent(event);
      const hitInfo = getHitInfo();

      if (hitInfo?.role === 'equipment' && stepRef.current === 1 && hitInfo.id) {
        setIdentified((current) => {
          if (current.includes(hitInfo.id as EquipmentId)) return current;
          const next = [...current, hitInfo.id as EquipmentId];
          if (next.length === equipmentOrder.length) {
            setStep(2);
            setPrompt(stepCopy[2]);
            setPromptTone('info');
          } else {
            setPrompt('继续点击其余器材，完成识别。');
            setPromptTone('info');
          }
          return next;
        });
        return;
      }

      if (hitInfo?.role === 'terminal' && (stepRef.current === 2 || stepRef.current === 4) && hitInfo.scope === layoutRef.current && hitInfo.id) {
        const startTerminal = hitInfo.id as TerminalId;
        dragStartTerminalRef.current = startTerminal;
        clearInvalidFeedback();
        setSelectedTerminal(startTerminal);
        setHoveredTerminal(null);
        setIsDraggingWire(true);
        controls.enabled = false;
        renderer.domElement.style.cursor = 'grabbing';
        const startPoint = getTerminalWorldPosition(layoutRef.current, startTerminal);
        if (startPoint) {
          setPreviewLine(startPoint, startPoint.clone(), true);
        }
        setPrompt('拖拽到另一个端子，松开鼠标即可吸附连线。');
        setPromptTone('info');
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      updateRayFromEvent(event);
      const hitInfo = getHitInfo();
      const terminalHit = hitInfo?.role === 'terminal' && hitInfo.scope === layoutRef.current ? hitInfo.id ?? null : null;
      const equipmentHit = hitInfo?.role === 'equipment' ? (hitInfo.id as EquipmentId | null) : null;
      const canvasCursor = hitInfo?.role === 'equipment' && stepRef.current === 1 ? 'pointer' : terminalHit ? 'crosshair' : 'default';

      if (!dragStartTerminalRef.current) {
        renderer.domElement.style.cursor = canvasCursor;
        setHoveredEquipmentId((current) => (current === equipmentHit ? current : equipmentHit));
        if (stepRef.current === 2 || stepRef.current === 4) {
          setHoveredTerminal((current) => (current === terminalHit ? current : terminalHit));
        }
        return;
      }

      renderer.domElement.style.cursor = 'grabbing';
      setHoveredEquipmentId(null);
      const startPoint = getTerminalWorldPosition(layoutRef.current, dragStartTerminalRef.current);
      if (!startPoint) return;

      let endPoint = startPoint.clone();
      let validity: 'neutral' | 'valid' | 'invalid' = 'neutral';
      if (terminalHit && terminalHit !== dragStartTerminalRef.current) {
        const snapped = getTerminalWorldPosition(layoutRef.current, terminalHit);
        if (snapped) {
          endPoint = snapped;
          const edge = normalizeEdge(dragStartTerminalRef.current, terminalHit);
          const allowed = buildExpectedEdgeSet(layoutRef.current);
          validity = allowed.has(edge) || connectionsRef.current.includes(edge) ? 'valid' : 'invalid';
        }
      } else {
        const projected = new Vector3();
        if (raycasterRef.current.ray.intersectPlane(dragPlaneRef.current, projected)) {
          endPoint = projected;
        }
      }

      setHoveredTerminal((current) => (current === terminalHit ? current : terminalHit));
      setPreviewValidity(validity);
      setPreviewLine(startPoint, endPoint, true, validity);
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!dragStartTerminalRef.current) return;

      updateRayFromEvent(event);
      const hitInfo = getHitInfo();
      const startTerminal = dragStartTerminalRef.current;
      const targetTerminal = hitInfo?.role === 'terminal' && hitInfo.scope === layoutRef.current ? hitInfo.id ?? null : null;

      if (targetTerminal && targetTerminal !== startTerminal) {
        const edge = normalizeEdge(startTerminal, targetTerminal);
        const allowed = buildExpectedEdgeSet(layoutRef.current);
        if (!allowed.has(edge) && !connectionsRef.current.includes(edge)) {
          setErrors((value) => value + 1);
          flashInvalidTerminal(targetTerminal);
          setPrompt('这条连线不对，端子关系与当前实验要求不匹配。');
          setPromptTone('error');
          clearDragState();
          return;
        }

        clearInvalidFeedback();
        setConnections((existing) => {
          if (existing.includes(edge)) {
            setPrompt('已移除一条导线连接。');
            setPromptTone('info');
            return existing.filter((item) => item !== edge);
          }
          const next = [...existing, edge];
          setPrompt('导线已吸附完成。继续拖拽连接其余端子。');
          setPromptTone('success');
          return next;
        });
      } else {
        clearInvalidFeedback();
        setPrompt('导线连接已取消。请重新拖拽到另一个端子。');
        setPromptTone('info');
      }

      clearDragState();
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const width = mountRef.current.clientWidth;
      const height = mountRef.current.clientHeight;
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    applyCameraPreset('angled');

    const animate = (time: number) => {
      frameRef.current = window.requestAnimationFrame(animate);
      controls.update();

      flowParticlesRef.current.forEach((particle) => {
        const progress = (time * 0.00045 + particle.offset) % 1;
        particle.mesh.position.lerpVectors(particle.start, particle.end, progress);
      });

      wireMaterialsRef.current.forEach((material, index) => {
        material.opacity = material.userData.layer === 'pulse' ? 0.22 + Math.sin(time * 0.01 + index * 0.35) * 0.1 : 0.34;
      });

      const previewLine = previewLineRef.current;
      if (previewLine?.visible) {
        previewLine.computeLineDistances();
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    animate(0);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      if (invalidFeedbackTimerRef.current) {
        window.clearTimeout(invalidFeedbackTimerRef.current);
        invalidFeedbackTimerRef.current = null;
      }
      realism.dispose();
      controls.dispose();
      if (frameRef.current) window.cancelAnimationFrame(frameRef.current);
      renderer.dispose();
      if (mountNode.contains(renderer.domElement)) {
        mountNode.removeChild(renderer.domElement);
      }
      scene.clear();
      flowParticlesRef.current = [];
      interactiveObjectsRef.current = [];
      terminalsRef.current = {};
      wireMaterialsRef.current = [];
      wiresGroupRef.current = null;
      particlesGroupRef.current = null;
      previewLineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const seriesVisible = step <= 3;
    layoutGroupsRef.current.series.visible = seriesVisible;
    layoutGroupsRef.current.parallel.visible = !seriesVisible;

    Object.entries(equipmentRef.current).forEach(([id, object]) => {
      if (!object) return;
      object.traverse((child: Object3D) => {
        const mesh = child as Mesh;
        const material = mesh.material;
        if (!(material instanceof MeshStandardMaterial)) return;
        const isIdentified = identified.includes(id as EquipmentId);
        material.emissive = new Color(isIdentified ? 0x1e5b4e : 0x000000);
        material.emissiveIntensity = isIdentified ? 0.55 : 0.12;
      });
    });

    Object.entries(terminalsRef.current).forEach(([key, mesh]) => {
      const [scope, terminalId] = key.split(':');
      const inCurrentLayout = scope === layout;
      mesh.visible = inCurrentLayout && (step === 2 || step === 4);
      const material = mesh.material as MeshStandardMaterial;
      const isSelected = selectedTerminal === terminalId;
      const isHovered = hoveredTerminal === terminalId;
      const isInvalid = invalidTerminal === terminalId;
      material.color = new Color(isInvalid ? 0xff6b7a : isSelected ? 0xffb648 : isHovered ? 0x38e0c1 : 0x65d9ff);
      material.emissive = new Color(isInvalid ? 0x5a0f19 : isSelected ? 0x6d3f00 : isHovered ? 0x0f493d : 0x103149);
      material.emissiveIntensity = isInvalid ? 1.35 : isSelected ? 1.2 : isHovered ? 0.9 : 0.55;
      mesh.scale.setScalar(isInvalid ? 1.34 : isSelected ? 1.4 : isHovered ? 1.2 : 1);
    });

    const bulbMode: 'off' | 'series' | 'parallel' = step === 3 && switchClosed ? 'series' : step === 5 || completed ? 'parallel' : 'off';
    const bulbsOn = bulbMode !== 'off';
    const seriesGroup = layoutGroupsRef.current.series;
    const parallelGroup = layoutGroupsRef.current.parallel;

    [...seriesGroup.children, ...parallelGroup.children].forEach((child) => {
      child.traverse((subChild: Object3D) => {
        if (subChild instanceof PointLight && subChild.userData.glowLight) {
          subChild.intensity = bulbMode === 'parallel' ? 2.5 : bulbMode === 'series' ? 1.45 : 0;
          return;
        }

        const mesh = subChild as Mesh;
        const material = mesh.material;
        if (subChild.userData.halo && material instanceof MeshBasicMaterial) {
          material.opacity = bulbMode === 'parallel' ? 0.26 : bulbMode === 'series' ? 0.14 : 0;
          mesh.scale.setScalar(bulbMode === 'parallel' ? 1.1 : bulbMode === 'series' ? 1.04 : 1);
          return;
        }

        if (subChild.userData.powerHalo && material instanceof MeshBasicMaterial) {
          material.opacity = bulbsOn ? 0.18 : step >= 2 ? 0.09 : 0.04;
          mesh.scale.setScalar(bulbsOn ? 1.08 : step >= 2 ? 1 : 0.92);
          return;
        }

        if (subChild.userData.switchArc && material instanceof MeshBasicMaterial) {
          material.opacity = bulbMode === 'series' ? 0.2 : 0;
          mesh.scale.set(bulbMode === 'series' ? 1.5 : 1.2, bulbMode === 'series' ? 0.86 : 0.72, 0.68);
          return;
        }

        if (subChild.userData.innerGlow && material instanceof MeshBasicMaterial) {
          material.opacity = bulbMode === 'parallel' ? 0.28 : bulbMode === 'series' ? 0.14 : 0.04;
          mesh.scale.setScalar(bulbMode === 'parallel' ? 1.08 : bulbMode === 'series' ? 0.98 : 0.84);
          return;
        }

        if (subChild.userData.filament && material instanceof MeshBasicMaterial) {
          material.opacity = bulbMode === 'parallel' ? 0.92 : bulbMode === 'series' ? 0.56 : 0.08;
          mesh.scale.setScalar(bulbMode === 'parallel' ? 1.06 : bulbMode === 'series' ? 1 : 0.92);
          return;
        }

        if (!(material instanceof MeshStandardMaterial)) return;
        if (subChild.userData.glow) {
          material.emissive = new Color(bulbsOn ? 0xffc44d : 0x000000);
          material.emissiveIntensity = bulbMode === 'parallel' ? 1.32 : bulbMode === 'series' ? 0.72 : 0.35;
        }
      });
    });

    const switchObject = equipmentRef.current.switch;
    if (switchObject) {
      switchObject.traverse((child: Object3D) => {
        if (!(child instanceof Mesh)) return;
        if (child.userData.switchLever) {
          child.rotation.z = step === 3 && switchClosed ? 0.08 : -0.48;
        }
      });
    }

    const wiresGroup = wiresGroupRef.current;
    const particlesGroup = particlesGroupRef.current;
    if (wiresGroup && particlesGroup) {
      wiresGroup.clear();
      particlesGroup.clear();
      flowParticlesRef.current = [];

      const terminalMap = new Map(layoutTerminals[layout].map((terminal) => [terminal.id, terminal.position]));
      const flowActive = bulbsOn;

      connections.forEach((edge, edgeIndex) => {
        const [fromId, toId] = edge.split('__') as [TerminalId, TerminalId];
        const from = terminalMap.get(fromId);
        const to = terminalMap.get(toId);
        if (!from || !to) return;

        const start = new Vector3(...from);
        const end = new Vector3(...to);
        const geometry = new BufferGeometry().setFromPoints([start, end]);
        const material = new LineBasicMaterial({ color: flowActive ? 0x9bf2ff : 0x65d9ff, transparent: true, opacity: 0.34 });
        const line = new Line(geometry, material);
        wiresGroup.add(line);
        wireMaterialsRef.current.push(material);

        if (flowActive) {
          const glowMaterial = new LineBasicMaterial({ color: 0xf4ffff, transparent: true, opacity: 0.22 });
          glowMaterial.userData = { layer: 'pulse' };
          const glowLine = new Line(new BufferGeometry().setFromPoints([start, end]), glowMaterial);
          wiresGroup.add(glowLine);
          wireMaterialsRef.current.push(glowMaterial);
          Array.from({ length: 3 }).forEach((_, particleIndex) => {
            const mesh = new Mesh(
              new SphereGeometry(0.08, 14, 14),
              new MeshBasicMaterial({ color: 0xfff2b5 }),
            );
            particlesGroup.add(mesh);
            flowParticlesRef.current.push({
              mesh,
              start,
              end,
              offset: edgeIndex * 0.19 + particleIndex * 0.26,
            });
          });
        }
      });
    }
  }, [completed, connections, hoveredTerminal, identified, layout, selectedTerminal, step, switchClosed]);

  useEffect(() => {
    if (isDraggingWire || !(step === 2 || step === 4)) return;

    const current = new Set(connections);
    const exactMatch = current.size === expectedConnections.size && [...expectedConnections].every((item) => current.has(item));
    if (!exactMatch) return;

    clearInvalidFeedback();
    setSelectedTerminal(null);
    setHoveredTerminal(null);

    if (step === 2) {
      setStep(3);
      setPrompt('串联电路连接正确，已自动进入观察步骤。');
      setPromptTone('success');
      return;
    }

    if (step === 4) {
      setStep(5);
      setPrompt('并联电路连接正确，已自动进入结论步骤。');
      setPromptTone('success');
    }
  }, [connections, expectedConnections, isDraggingWire, step]);

  useEffect(() => {
    applyCameraPreset(cameraPreset);
  }, [cameraPreset, layout]);

  const handleResetConnections = () => {
    reportReset('当前电路已重置，开始新的电路搭建尝试。');
    dragStartTerminalRef.current = null;
    clearInvalidFeedback();
    setConnections([]);
    setSelectedTerminal(null);
    setHoveredTerminal(null);
    setIsDraggingWire(false);
    setSwitchClosed(false);
    setPrompt('当前电路已重置，请重新连接。');
    setPromptTone('info');
    setCameraPreset('angled');
  };

  const handleCheckConnections = () => {
    const current = new Set(connections);
    const exactMatch = current.size === expectedConnections.size && [...expectedConnections].every((item) => current.has(item));

    if (!exactMatch) {
      setErrors((value) => value + 1);
      setPrompt('连接还不正确，请检查端子顺序和支路结构。');
      setPromptTone('error');
      return;
    }

    if (step === 2) {
      clearInvalidFeedback();
      setSelectedTerminal(null);
      setHoveredTerminal(null);
      setStep(3);
      setPrompt(stepCopy[3]);
      setPromptTone('success');
      return;
    }

    if (step === 4) {
      clearInvalidFeedback();
      setSelectedTerminal(null);
      setHoveredTerminal(null);
      setStep(5);
      setPrompt(stepCopy[5]);
      setPromptTone('success');
    }
  };

  const handleObserveSeries = () => {
    if (!canObserve) return;

    const current = new Set(connections);
    const expected = buildExpectedEdgeSet('series');
    const exactMatch = current.size === expected.size && [...expected].every((item) => current.has(item));
    if (!exactMatch) {
      setErrors((value) => value + 1);
      setPrompt('请先把串联电路连接正确，再闭合开关。');
      setPromptTone('error');
      return;
    }

    if (switchClosed) {
      setSwitchClosed(false);
      setPrompt('开关已断开，灯泡熄灭。你可以再次闭合开关重新观察。');
      setPromptTone('info');
      return;
    }

    setSwitchClosed(true);
    setPrompt('开关闭合成功，两个灯泡同时点亮，导线中出现了流动效果。请记录观察结果并进入并联电路。');
    setPromptTone('success');
    setCameraPreset('focus');
  };

  const handleRecordObservation = () => {
    if (!canRecordObservation) return;
    dragStartTerminalRef.current = null;
    clearInvalidFeedback();
    setConnections([]);
    setSelectedTerminal(null);
    setHoveredTerminal(null);
    setSwitchClosed(false);
    setStep(4);
    setPrompt(stepCopy[4]);
    setPromptTone('info');
    setCameraPreset('angled');
  };

  const handleSubmitSummary = () => {
    if (step !== 5) return;

    if (summaryChoice !== 'parallel-branches') {
      setErrors((value) => value + 1);
      setPrompt('结论还不正确。提示：并联电路比串联电路多了支路。');
      setPromptTone('error');
      return;
    }

    setCompleted(true);
    setPrompt('实验完成。你已成功比较串联与并联电路的差异。');
    setPromptTone('success');
    setCameraPreset('focus');
  };

  return (
    <section className="playground-panel panel circuit-lab-player">
      <div className="panel-head">
        <div>
          <span className="eyebrow">3D Demo</span>
          <h2>{experiment.title} · 本地 3D 实验 Demo</h2>
        </div>
        <div className="badge-row compact">
          <span className="badge">步骤 {step}/5</span>
          <span className="badge">电路模式 {layout === 'series' ? '串联' : '并联'}</span>
          <span className="badge">错误 {errors} 次</span>
          <span className="badge">得分 {score}</span>
        </div>
      </div>

      <div className="playground-grid">
        <aside className="playground-side circuit-side-rail circuit-side-rail-left">
          <div className="info-card circuit-rail-card">
            <strong>器材识别</strong>
            <div className="equipment-list">
              {equipmentOrder.map((equipment) => (
                <span className={identified.includes(equipment) ? 'equipment-tag identified' : 'equipment-tag'} key={equipment}>
                  {equipmentLabels[equipment]}
                </span>
              ))}
            </div>
          </div>

          <div className="info-card circuit-rail-card">
            <strong>步骤总览</strong>
            <ol className="step-list compact-list">
              {circuitStepOrder.map((stepId) => (
                <li className={step === stepId ? 'active' : step > stepId || (stepId === 5 && completed) ? 'done' : ''} key={stepId}>
                  {stepTitles[stepId]}
                </li>
              ))}
            </ol>
            <div className={`circuit-rail-prompt tone-${promptTone}`}>
              <span>当前提示</span>
              <p>{prompt}</p>
            </div>
          </div>
        </aside>

        <div className="scene-panel circuit-workbench-stage">
          <div className="scene-toolbar circuit-workbench-toolbar">
            <div className="circuit-toolbar-head">
              <div className="circuit-toolbar-kicker">串并联电路工作台</div>
              <strong>{experiment.title}</strong>
              <p className="circuit-toolbar-copy">拖拽端子吸附连线，操作提示回收到舞台上下，不再遮挡实验台。</p>
            </div>
            <div className="camera-actions circuit-camera-actions">
              <button className={cameraPreset === 'angled' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('angled')} type="button">
                斜视角
              </button>
              <button className={cameraPreset === 'top' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('top')} type="button">
                俯视图
              </button>
              <button className={cameraPreset === 'focus' ? 'scene-action active' : 'scene-action'} onClick={() => setCameraPreset('focus')} type="button">
                聚焦灯泡
              </button>
            </div>
          </div>

          <div className="scene-meta-strip circuit-stage-meta">
            <div className={`circuit-stage-card tone-${promptTone}`}>
              <span>当前任务</span>
              <strong>
                步骤 {step} · {stepTitles[step]}
              </strong>
              <p>{prompt}</p>
            </div>
            <div className="circuit-step-pills" aria-label="实验步骤概览">
              {circuitStepOrder.map((stepId) => (
                <span className={step === stepId ? 'circuit-step-pill active' : step > stepId || (stepId === 5 && completed) ? 'circuit-step-pill done' : 'circuit-step-pill'} key={stepId}>
                  <small>步骤 {stepId}</small>
                  <strong>{stepTitles[stepId]}</strong>
                </span>
              ))}
            </div>
          </div>

          <div className="scene-canvas circuit-scene-canvas">
            <div className="three-stage-mount circuit-three-mount" ref={mountRef} />
          </div>

          <div className="workbench-inline-dock circuit-workbench-dock">
            <div className="circuit-workbench-status-grid">
              <div
                className={`circuit-workbench-status ${previewValidity === 'invalid' ? 'tone-error' : previewValidity === 'valid' ? 'tone-success' : ''} ${isDraggingWire ? 'is-live' : ''}`.trim()}
              >
                <span>连线状态</span>
                <strong>{connectionStatusText}</strong>
              </div>
              <div className="circuit-workbench-status">
                <span>悬停端子</span>
                <strong>{hoveredTerminalCopy?.title ?? '未悬停端子'}</strong>
              </div>
              <div className={`circuit-workbench-status ${switchClosed ? 'tone-success' : ''}`.trim()}>
                <span>电源与模式</span>
                <strong>
                  {layoutLabel} · {switchClosed ? '开关闭合' : '开关断开'}
                </strong>
              </div>
              <div className={`circuit-workbench-status ${completed ? 'tone-success' : errors > 0 ? 'tone-warning' : ''}`.trim()}>
                <span>实验进度</span>
                <strong>
                  得分 {score} · 错误 {errors} 次
                </strong>
              </div>
            </div>

            <ReusableApparatusDock
              activeApparatusId={circuitActiveApparatusId}
              apparatusIds={circuitApparatusIds}
              contextLabel="串并联实验现在直接挂在统一电学器材底座上：导线、开关、电池盒和灯泡都能复用于别的实验。"
              experiment={experiment}
              runtimeContext={circuitRuntimeContext}
              title="电路器材引擎"
            />

            <div className="circuit-quick-actions">
              <button className="action-button ghost circuit-dock-button" onClick={handleResetConnections} type="button">
                重置当前电路
              </button>
              <button className="action-button circuit-dock-button" onClick={handleCheckConnections} type="button" disabled={!(step === 2 || step === 4)}>
                检查当前连接
              </button>
              <button className="action-button ghost circuit-dock-button" onClick={handleObserveSeries} type="button" disabled={!canObserve}>
                {switchClosed ? '断开开关' : '闭合开关'}
              </button>
              <button className="action-button ghost circuit-dock-button" onClick={handleRecordObservation} type="button" disabled={!canRecordObservation}>
                记录观察
              </button>
            </div>

            {step === 5 || completed ? (
              <div className="circuit-summary-dock">
                <div className="circuit-summary-head">
                  <div>
                    <span>结论选择</span>
                    <strong>并联电路有多条支路，串联电路只有一条路径</strong>
                  </div>
                  <button className="action-button circuit-submit-button" onClick={handleSubmitSummary} type="button" disabled={step !== 5 || completed}>
                    {completed ? '已完成' : '提交结论'}
                  </button>
                </div>
                <div className="circuit-choice-row">
                  <button className={summaryChoice === 'same-path' ? 'summary-choice active' : 'summary-choice'} onClick={() => setSummaryChoice('same-path')} type="button">
                    串联电路和并联电路都只有一条电流路径
                  </button>
                  <button className={summaryChoice === 'parallel-branches' ? 'summary-choice active' : 'summary-choice'} onClick={() => setSummaryChoice('parallel-branches')} type="button">
                    并联电路有多条支路，串联电路只有一条路径
                  </button>
                  <button className={summaryChoice === 'no-difference' ? 'summary-choice active' : 'summary-choice'} onClick={() => setSummaryChoice('no-difference')} type="button">
                    两种连接方式没有本质差别
                  </button>
                </div>
              </div>
            ) : (
              <div className="circuit-equipment-strip" aria-label="器材识别状态">
                {equipmentOrder.map((equipment) => (
                  <span className={identified.includes(equipment) ? 'equipment-tag identified' : 'equipment-tag'} key={equipment}>
                    {equipmentLabels[equipment]}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="playground-side circuit-side-rail circuit-side-rail-right">
          <div className="info-card circuit-rail-card">
            <strong>实验状态</strong>
            <div className="circuit-mini-metrics">
              <div className="circuit-mini-metric">
                <span>当前模式</span>
                <strong>{layoutLabel}</strong>
              </div>
              <div className="circuit-mini-metric">
                <span>开关状态</span>
                <strong>{switchClosed ? '已闭合' : '未闭合'}</strong>
              </div>
              <div className="circuit-mini-metric">
                <span>当前步骤</span>
                <strong>{stepTitles[step]}</strong>
              </div>
              <div className="circuit-mini-metric">
                <span>完成度</span>
                <strong>{completed ? '已完成' : '进行中'}</strong>
              </div>
            </div>
          </div>

          <div className="info-card circuit-rail-card">
            <strong>操作反馈</strong>
            <div className="circuit-rail-feedback">
              <p>{isDraggingWire ? '正在拖拽导线，松开到目标端子即可吸附。' : '当前未拖拽导线，可直接在 3D 台面开始接线。'}</p>
              <p>{hoveredTerminalCopy?.detail ?? '把鼠标移到发光端子上，可以查看当前端子的回路作用。'}</p>
              <p>完整电路连接正确后会自动进入下一步，无需反复打开侧栏操作。</p>
            </div>
          </div>

          <div className={completed ? 'info-card success-card circuit-rail-card' : 'info-card circuit-rail-card'}>
            <strong>完成状态</strong>
            <p>{completionCopy}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
