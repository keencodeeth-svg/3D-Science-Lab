import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { AmbientLight, BoxGeometry, CapsuleGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, DirectionalLight, DoubleSide, Fog, Group, IcosahedronGeometry, Material, MathUtils, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, PointLight, Raycaster, RingGeometry, SphereGeometry, TorusGeometry, Vector2, Vector3 } from 'three';
import { useThreeLabStage, type ThreeLabStageContext } from '../hooks/useThreeLabStage';
import { getExperimentMultiscaleView } from '../lib/multiscaleLab';
import {
  createLabCeramicMaterial,
  createLabCoatedMetalMaterial,
  createLabGlassMaterial,
  createLabLiquidMaterial,
  createLabMetalMaterial,
  createLabPlasticMaterial,
  createLabWoodMaterial,
} from '../lib/threeRealism';
import type { ExperimentConfig, ExperimentEquipment, ExperimentEquipmentProfile, ExperimentMaterialModel, ExperimentMicroSpecies, ExperimentSubject, MultiscaleLens } from '../types/experiment';

interface SharedWorkbenchThreeStagePortalProps {
  experiment: ExperimentConfig;
  focusTargetObject?: string;
  focusStepTitle?: string;
  focusPrompt?: string;
  preferredLens?: MultiscaleLens;
  studioMode?: 'operation' | 'record' | 'guide';
  workbenchPreset?: 'focus' | 'balanced' | 'review' | 'custom';
}

interface SharedWorkbenchThreeStageProps extends SharedWorkbenchThreeStagePortalProps {
  overlayOnly?: boolean;
  activeLens: MultiscaleLens;
  lensMode: 'auto' | 'manual';
  onActiveLensChange: (lens: MultiscaleLens) => void;
  onLensModeChange: (mode: 'auto' | 'manual') => void;
}

interface SubjectTheme {
  background: number;
  accent: number;
  accentSoft: number;
  liquid: number;
  glow: number;
  table: number;
  wall: number;
  aura: number;
}

interface CameraPresetOptions {
  position: [number, number, number];
  target: [number, number, number];
  minDistance: number;
  maxDistance: number;
}

interface StageProxy {
  id: string;
  name: string;
  kind: VisualKind;
  group: Group;
  ring: Mesh;
  anchor: Vector3;
  baseScale: number;
  bobOffset: number;
  focusTokens: string[];
}

interface StageParticle {
  id: string;
  color: string;
  size: number;
  x: number;
  y: number;
  delay: number;
  duration: number;
}

interface StageStructureNode {
  id: string;
  label: string;
  meta: string;
  tone: string;
  x: number;
  width: number;
  height: number;
  depth: number;
  delay: number;
}

interface StageStructureFlow {
  id: string;
  tone: string;
  left: number;
  width: number;
  top: number;
  thickness: number;
  delay: number;
}

interface StageScopeBand {
  id: string;
  label: string;
  meta: string;
  tone: string;
  height: number;
  delay: number;
}

interface StageSceneRig {
  ambient: AmbientLight | null;
  fill: PointLight | null;
  halo: Mesh | null;
  backGlow: Mesh | null;
  focusBeam: Mesh | null;
  focusPulse: Mesh | null;
}

interface LensSceneProfile {
  fov: number;
  ambientIntensity: number;
  fillIntensity: number;
  haloOpacity: number;
  glowOpacity: number;
  focusBeamOpacity: number;
  focusBeamHeight: number;
  focusBeamScale: number;
  focusPulseOpacity: number;
  focusScale: number;
  hoverScale: number;
  idleScale: number;
  focusOpacity: number;
  hoverOpacity: number;
  idleOpacity: number;
  sceneSway: number;
  targetLerp: number;
  ringFocusedOpacity: number;
  ringHoveredOpacity: number;
  ringIdleOpacity: number;
}

type VisualKind =
  | 'container'
  | 'instrument'
  | 'meter'
  | 'heat'
  | 'circuit'
  | 'optics'
  | 'sample'
  | 'magnet'
  | 'support';

const subjectThemes: Record<ExperimentSubject, SubjectTheme> = {
  科学: {
    background: 0x08131c,
    accent: 0x75d7ff,
    accentSoft: 0x24455e,
    liquid: 0x69bfff,
    glow: 0x88d9ff,
    table: 0x493529,
    wall: 0x0f1f30,
    aura: 0x133b57,
  },
  物理: {
    background: 0x07101a,
    accent: 0x74c7ff,
    accentSoft: 0x22394d,
    liquid: 0x57aff6,
    glow: 0x72c8ff,
    table: 0x3d2d28,
    wall: 0x101d2a,
    aura: 0x14314f,
  },
  化学: {
    background: 0x0a0f1a,
    accent: 0x6ef0dc,
    accentSoft: 0x1e3b40,
    liquid: 0x53e3c4,
    glow: 0x8affea,
    table: 0x402d23,
    wall: 0x121c26,
    aura: 0x153640,
  },
  生物: {
    background: 0x07130f,
    accent: 0x9de47a,
    accentSoft: 0x2a4531,
    liquid: 0x78cd6a,
    glow: 0xb6f4a8,
    table: 0x3f3025,
    wall: 0x122118,
    aura: 0x224b2e,
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCameraPreset(
  cameraPreset: string,
  studioMode: SharedWorkbenchThreeStagePortalProps['studioMode'] = 'operation',
  workbenchPreset: SharedWorkbenchThreeStagePortalProps['workbenchPreset'] = 'balanced',
): CameraPresetOptions {
  const preset = cameraPreset.toLowerCase();
  let options: CameraPresetOptions;

  if (preset.includes('top')) {
    options = {
      position: [0.36, 7.5, 0.42],
      target: [0, 1.16, 0],
      minDistance: 4.4,
      maxDistance: 10,
    };
  } else if (preset.includes('side')) {
    options = {
      position: [7.4, 2.9, 1.6],
      target: [0, 1.16, 0],
      minDistance: 4.8,
      maxDistance: 11.6,
    };
  } else if (preset.includes('close') || preset.includes('scope') || preset.includes('focus')) {
    options = {
      position: [4.2, 2.5, 3.3],
      target: [0, 1.3, 0],
      minDistance: 3.4,
      maxDistance: 8.4,
    };
  } else {
    options = {
      position: [6.3, 4.3, 7],
      target: [0, 1.2, 0],
      minDistance: 4.6,
      maxDistance: 12,
    };
  }

  const nextPosition: CameraPresetOptions['position'] = [...options.position];
  const nextTarget: CameraPresetOptions['target'] = [...options.target];
  let minDistance = options.minDistance;
  let maxDistance = options.maxDistance;

  if (workbenchPreset === 'focus' || studioMode === 'operation') {
    nextPosition[0] *= 0.9;
    nextPosition[1] *= 0.86;
    nextPosition[2] *= 0.82;
    nextTarget[1] += 0.12;
    minDistance *= 0.84;
    maxDistance *= 0.88;
  }

  if (workbenchPreset === 'review' || studioMode === 'record') {
    nextPosition[1] += 1.5;
    nextPosition[2] += 0.8;
    nextTarget[1] -= 0.08;
    maxDistance += 1.6;
  }

  if (studioMode === 'guide') {
    nextPosition[0] *= 1.06;
    nextPosition[1] += 0.9;
    nextPosition[2] *= 1.12;
    maxDistance += 1.8;
  }

  return {
    position: nextPosition,
    target: nextTarget,
    minDistance,
    maxDistance,
  };
}

function inferVisualKind(equipment: ExperimentEquipment): VisualKind {
  const token = `${equipment.id} ${equipment.name} ${equipment.type}`.toLowerCase();

  if (token.includes('meter') || token.includes('计') || token.includes('表') || token.includes('pressure')) return 'meter';
  if (token.includes('microscope') || token.includes('显微镜') || token.includes('focus')) return 'instrument';
  if (token.includes('heat') || token.includes('lamp') || token.includes('蜡烛') || token.includes('alcohol') || token.includes('酒精灯')) return 'heat';
  if (token.includes('battery') || token.includes('wire') || token.includes('circuit') || token.includes('resistor') || token.includes('bulb')) return 'circuit';
  if (token.includes('lens') || token.includes('mirror') || token.includes('screen') || token.includes('optic') || token.includes('periscope') || token.includes('prism')) return 'optics';
  if (token.includes('magnet')) return 'magnet';
  if (
    token.includes('beaker') ||
    token.includes('tube') ||
    token.includes('cup') ||
    token.includes('flask') ||
    token.includes('烧杯') ||
    token.includes('试管') ||
    token.includes('锥形瓶') ||
    token.includes('量筒')
  ) {
    return 'container';
  }
  if (token.includes('sample') || token.includes('material') || token.includes('solution') || token.includes('seed') || token.includes('leaf') || token.includes('cell')) {
    return 'sample';
  }
  return 'support';
}

function createProxyByKind(kind: VisualKind, theme: SubjectTheme) {
  const group = new Group();

  const glassMaterial = createLabGlassMaterial({
    color: 0xdaf4ff,
    opacity: 0.24,
    thickness: 0.82,
    attenuationDistance: 2.6,
    attenuationColor: theme.liquid,
  });
  const liquidMaterial = createLabLiquidMaterial({
    color: theme.liquid,
    opacity: 0.66,
    transmission: 0.82,
    thickness: 0.8,
    attenuationDistance: 2,
    attenuationColor: theme.liquid,
  });
  const metalMaterial = createLabMetalMaterial({ color: 0xd4dde8, roughness: 0.18, clearcoat: 0.18 });
  const coatedMaterial = createLabCoatedMetalMaterial({ color: theme.accentSoft, roughness: 0.42, clearcoat: 0.24 });
  const ceramicMaterial = createLabCeramicMaterial({ color: 0xc5d1de, roughness: 0.46, clearcoat: 0.12 });
  const woodMaterial = createLabWoodMaterial({ color: theme.table, roughness: 0.82, clearcoat: 0.08 });
  const plasticMaterial = createLabPlasticMaterial({ color: theme.accent, roughness: 0.22, clearcoat: 0.62, clearcoatRoughness: 0.14 });

  if (kind === 'container') {
    const stand = new Mesh(new CylinderGeometry(0.42, 0.48, 0.12, 36), ceramicMaterial);
    stand.position.y = 0.06;
    const vessel = new Mesh(new CylinderGeometry(0.28, 0.32, 0.9, 36), glassMaterial);
    vessel.position.y = 0.62;
    const liquid = new Mesh(new CylinderGeometry(0.22, 0.25, 0.42, 36), liquidMaterial);
    liquid.position.y = 0.41;
    const rim = new Mesh(new TorusGeometry(0.285, 0.018, 12, 42), metalMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.06;
    group.add(stand, vessel, liquid, rim);
  } else if (kind === 'instrument') {
    const base = new Mesh(new CylinderGeometry(0.46, 0.58, 0.12, 36), coatedMaterial);
    base.position.y = 0.06;
    const arm = new Mesh(new BoxGeometry(0.16, 0.92, 0.22), coatedMaterial);
    arm.position.set(-0.18, 0.58, 0);
    const body = new Mesh(new CapsuleGeometry(0.15, 0.64, 6, 14), ceramicMaterial);
    body.rotation.z = 0.58;
    body.position.set(0.18, 1.2, 0);
    const lens = new Mesh(new CylinderGeometry(0.11, 0.11, 0.26, 28), glassMaterial);
    lens.rotation.z = 0.58;
    lens.position.set(0.48, 1.02, 0);
    const stage = new Mesh(new BoxGeometry(0.54, 0.06, 0.46), metalMaterial);
    stage.position.set(0.08, 0.72, 0);
    group.add(base, arm, body, lens, stage);
  } else if (kind === 'meter') {
    const base = new Mesh(new CylinderGeometry(0.42, 0.46, 0.12, 32), coatedMaterial);
    base.position.y = 0.06;
    const panel = new Mesh(new BoxGeometry(0.78, 0.54, 0.18), ceramicMaterial);
    panel.position.y = 0.58;
    const gauge = new Mesh(new CircleGeometry(0.19, 28), plasticMaterial);
    gauge.position.set(-0.16, 0.62, 0.11);
    const needle = new Mesh(new BoxGeometry(0.16, 0.02, 0.02), metalMaterial);
    needle.position.set(-0.1, 0.65, 0.13);
    needle.rotation.z = -0.42;
    const light = new Mesh(new SphereGeometry(0.06, 18, 18), new MeshBasicMaterial({ color: theme.glow }));
    light.position.set(0.2, 0.64, 0.12);
    group.add(base, panel, gauge, needle, light);
  } else if (kind === 'heat') {
    const base = new Mesh(new CylinderGeometry(0.34, 0.42, 0.12, 32), coatedMaterial);
    base.position.y = 0.06;
    const burner = new Mesh(new CylinderGeometry(0.12, 0.16, 0.44, 28), metalMaterial);
    burner.position.y = 0.32;
    const flame = new Mesh(
      new ConeGeometry(0.13, 0.34, 24),
      new MeshBasicMaterial({ color: 0xffb85c, transparent: true, opacity: 0.92 }),
    );
    flame.position.y = 0.74;
    const glow = new Mesh(
      new SphereGeometry(0.24, 20, 20),
      new MeshBasicMaterial({ color: 0xffd991, transparent: true, opacity: 0.16 }),
    );
    glow.position.y = 0.72;
    group.add(base, burner, flame, glow);
  } else if (kind === 'circuit') {
    const board = new Mesh(new BoxGeometry(1.08, 0.1, 0.72), woodMaterial);
    board.position.y = 0.05;
    const battery = new Mesh(new BoxGeometry(0.22, 0.42, 0.24), coatedMaterial);
    battery.position.set(-0.24, 0.28, 0);
    const bulbBase = new Mesh(new CylinderGeometry(0.08, 0.08, 0.16, 24), metalMaterial);
    bulbBase.position.set(0.22, 0.16, 0);
    const bulb = new Mesh(
      new SphereGeometry(0.16, 22, 18),
      createLabGlassMaterial({ color: theme.glow, opacity: 0.34, thickness: 0.32 }),
    );
    bulb.position.set(0.22, 0.36, 0);
    const wire = new Mesh(
      new TorusGeometry(0.3, 0.015, 10, 64, Math.PI * 1.42),
      new MeshStandardMaterial({ color: theme.accent, roughness: 0.32, metalness: 0.22 }),
    );
    wire.rotation.set(Math.PI / 2, 0, -0.18);
    wire.position.y = 0.28;
    group.add(board, battery, bulbBase, bulb, wire);
  } else if (kind === 'optics') {
    const base = new Mesh(new BoxGeometry(0.92, 0.08, 0.38), coatedMaterial);
    base.position.y = 0.04;
    const stand = new Mesh(new CylinderGeometry(0.04, 0.04, 0.82, 20), metalMaterial);
    stand.position.set(-0.18, 0.45, 0);
    const lens = new Mesh(new CylinderGeometry(0.18, 0.18, 0.08, 28), glassMaterial);
    lens.rotation.z = Math.PI / 2;
    lens.position.set(0.16, 0.52, 0);
    const beam = new Mesh(
      new BoxGeometry(0.74, 0.04, 0.04),
      new MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.34 }),
    );
    beam.position.set(0.3, 0.52, 0);
    group.add(base, stand, lens, beam);
  } else if (kind === 'magnet') {
    const material = createLabPlasticMaterial({ color: theme.accent, roughness: 0.24, clearcoat: 0.52 });
    const left = new Mesh(new BoxGeometry(0.2, 0.72, 0.2), material);
    left.position.set(-0.18, 0.42, 0);
    const right = left.clone();
    right.position.x = 0.18;
    const top = new Mesh(new BoxGeometry(0.56, 0.2, 0.2), material);
    top.position.set(0, 0.76, 0);
    const capA = new Mesh(new BoxGeometry(0.2, 0.12, 0.2), createLabMetalMaterial({ color: 0xdfe7ee }));
    capA.position.set(-0.18, 0.06, 0);
    const capB = capA.clone();
    capB.position.x = 0.18;
    group.add(left, right, top, capA, capB);
  } else if (kind === 'sample') {
    const tray = new Mesh(new CylinderGeometry(0.46, 0.54, 0.08, 32), ceramicMaterial);
    tray.position.y = 0.04;
    const sample = new Mesh(new IcosahedronGeometry(0.26, 1), plasticMaterial);
    sample.position.y = 0.36;
    const ring = new Mesh(new TorusGeometry(0.32, 0.02, 10, 32), metalMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    group.add(tray, sample, ring);
  } else {
    const base = new Mesh(new BoxGeometry(0.88, 0.1, 0.54), woodMaterial);
    base.position.y = 0.05;
    const frameLeft = new Mesh(new BoxGeometry(0.06, 0.74, 0.06), metalMaterial);
    frameLeft.position.set(-0.24, 0.42, 0);
    const frameRight = frameLeft.clone();
    frameRight.position.x = 0.24;
    const bridge = new Mesh(new BoxGeometry(0.54, 0.06, 0.06), metalMaterial);
    bridge.position.set(0, 0.74, 0);
    const deck = new Mesh(new BoxGeometry(0.44, 0.04, 0.32), ceramicMaterial);
    deck.position.set(0, 0.36, 0);
    group.add(base, frameLeft, frameRight, bridge, deck);
  }

  return group;
}

function getProxyLayout(index: number, total: number): [number, number, number] {
  const columns = total <= 4 ? 2 : 3;
  const row = Math.floor(index / columns);
  const column = index % columns;
  const totalRows = Math.ceil(total / columns);
  const x = (column - (columns - 1) / 2) * 1.9;
  const z = (row - (totalRows - 1) / 2) * 1.58;
  return [x, 0, z];
}

function buildFocusTokens(equipment: ExperimentEquipment) {
  return [
    equipment.id.toLowerCase(),
    equipment.name.toLowerCase(),
    equipment.type.toLowerCase(),
  ];
}

function findFocusLabel(experiment: ExperimentConfig, focusTargetObject?: string) {
  if (!focusTargetObject) return experiment.equipment[0]?.name ?? '核心器材';

  const lowered = focusTargetObject.toLowerCase();
  const match = experiment.equipment.find((equipment) => {
    const token = `${equipment.id} ${equipment.name} ${equipment.type}`.toLowerCase();
    return lowered.includes(equipment.id.toLowerCase()) || token.includes(lowered);
  });

  return match?.name ?? focusTargetObject;
}

function findFocusEquipmentId(experiment: ExperimentConfig, focusTargetObject?: string) {
  if (!focusTargetObject) return experiment.equipment[0]?.id ?? '';

  const lowered = focusTargetObject.toLowerCase();
  const match = experiment.equipment.find((equipment) => {
    const token = `${equipment.id} ${equipment.name} ${equipment.type}`.toLowerCase();
    return lowered.includes(equipment.id.toLowerCase()) || token.includes(lowered);
  });

  return match?.id ?? experiment.equipment[0]?.id ?? '';
}

function getVisualKindLabel(kind: VisualKind) {
  switch (kind) {
    case 'container':
      return '容器代理';
    case 'instrument':
      return '观察代理';
    case 'meter':
      return '读数代理';
    case 'heat':
      return '热源代理';
    case 'circuit':
      return '回路代理';
    case 'optics':
      return '光学代理';
    case 'sample':
      return '样本代理';
    case 'magnet':
      return '磁效代理';
    default:
      return '支撑代理';
  }
}

function buildStageInspectorCopy(
  experiment: ExperimentConfig,
  equipment: ExperimentEquipment | undefined,
  studioMode: SharedWorkbenchThreeStagePortalProps['studioMode'],
  workbenchPreset: SharedWorkbenchThreeStagePortalProps['workbenchPreset'],
) {
  const equipmentName = equipment?.name ?? '当前器材';
  const modeLabel = studioMode === 'record' ? '记录' : studioMode === 'guide' ? '提示' : '操作';
  const presetLabel = workbenchPreset === 'focus' ? '聚焦' : workbenchPreset === 'review' ? '复盘' : workbenchPreset === 'custom' ? '自定义' : '平衡';

  switch (experiment.subject) {
    case '化学':
      return `${modeLabel}模式下围绕 ${equipmentName} 观察液面、颜色与终点信号，当前为 ${presetLabel} 视图。`;
    case '物理':
      return `${modeLabel}模式下围绕 ${equipmentName} 稳定视角后读取刻度或变量变化，当前为 ${presetLabel} 视图。`;
    case '生物':
      return `${modeLabel}模式下围绕 ${equipmentName} 关注样本清晰度与对照差异，当前为 ${presetLabel} 视图。`;
    default:
      return `${modeLabel}模式下围绕 ${equipmentName} 比较现象变化并推进步骤，当前为 ${presetLabel} 视图。`;
  }
}

function getModeLabel(
  studioMode: SharedWorkbenchThreeStagePortalProps['studioMode'],
  workbenchPreset: SharedWorkbenchThreeStagePortalProps['workbenchPreset'],
) {
  const modeLabel = studioMode === 'record' ? '记录模式' : studioMode === 'guide' ? '提示模式' : '操作模式';
  const presetLabel = workbenchPreset === 'focus' ? '聚焦视图' : workbenchPreset === 'review' ? '复盘视图' : workbenchPreset === 'custom' ? '自定义视图' : '平衡视图';
  return `${modeLabel} · ${presetLabel}`;
}

function getLensLabel(lens: MultiscaleLens) {
  if (lens === 'micro') return '微观镜头';
  if (lens === 'meso') return '中观镜头';
  return '宏观镜头';
}

function getLensModeLabel(mode: 'auto' | 'manual') {
  return mode === 'auto' ? '自动跟随' : '手动镜头';
}

function summarizeMaterial(material: ExperimentMaterialModel) {
  const firstProperty = material.properties[0];
  if (!firstProperty) return `${material.category} · ${material.state}`;
  return `${firstProperty.label} ${firstProperty.value}${firstProperty.unit ?? ''}`;
}

function getMicroSpeciesLabel(species: ExperimentMicroSpecies) {
  return species.formula ? `${species.name} · ${species.formula}` : `${species.name} · ${species.arrangement}`;
}

function buildLensNarrative(
  lens: MultiscaleLens,
  focusEquipmentName: string,
  focusMaterials: ExperimentMaterialModel[],
  microNarrative?: string,
) {
  if (lens === 'macro') {
    return `${focusEquipmentName} 先按组件与操作边界来理解，优先看结构、约束和当前工作位置。`;
  }

  if (lens === 'meso') {
    return `${focusEquipmentName} 当前主要受 ${focusMaterials.slice(0, 2).map((material) => material.name).join('、') || '关键材料'} 的属性影响。`;
  }

  return microNarrative ?? `${focusEquipmentName} 的现象由粒子排布、能量传递或离子迁移共同解释。`;
}

function createSeed(value: string) {
  let seed = 0;

  for (let index = 0; index < value.length; index += 1) {
    seed = (seed * 31 + value.charCodeAt(index)) >>> 0;
  }

  return seed || 1;
}

function buildStageParticles(species: ExperimentMicroSpecies[]): StageParticle[] {
  return species.flatMap((item, speciesIndex) => {
    let seed = createSeed(`${item.id}-${speciesIndex}`);
    const count = clamp(Math.round(item.particleCountHint / 8), 5, 11);

    return Array.from({ length: count }, (_, index) => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const randA = seed / 0xffffffff;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const randB = seed / 0xffffffff;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const randC = seed / 0xffffffff;

      return {
        id: `${item.id}-${index}`,
        color: item.color,
        size: 8 + randC * 14 + speciesIndex * 1.5,
        x: 8 + randA * 84,
        y: 12 + randB * 72,
        delay: Math.round(randA * 900),
        duration: 3200 + Math.round(randB * 1800),
      };
    });
  });
}

function getFallbackMaterialTone(material: ExperimentMaterialModel) {
  switch (material.category) {
    case 'metal':
      return '#f5c283';
    case 'glass':
      return '#8fe0ff';
    case 'acid':
      return '#9ef6cc';
    case 'base':
      return '#75d7ff';
    case 'salt':
      return '#d9edff';
    case 'organic':
      return '#ffd48c';
    case 'biological':
      return '#9de47a';
    case 'gas':
      return '#cde8ff';
    default:
      return material.state === 'gas'
        ? '#d7ecff'
        : material.state === 'liquid'
          ? '#7fe7da'
          : '#9ad4ff';
  }
}

function getMaterialTone(material?: ExperimentMaterialModel) {
  return material?.microModel?.species[0]?.color ?? (material ? getFallbackMaterialTone(material) : '#75d7ff');
}

function buildStageStructureNodes(
  focusProfile: ExperimentEquipmentProfile | undefined,
  focusMaterials: ExperimentMaterialModel[],
  lens: MultiscaleLens,
): StageStructureNode[] {
  const components = focusProfile?.components.slice(0, 4) ?? [];
  const anchors = components.length === 4 ? [14, 35, 58, 81] : components.length === 3 ? [18, 50, 82] : components.length === 2 ? [28, 72] : [50];
  const baseHeight = lens === 'micro' ? 126 : lens === 'meso' ? 112 : 92;
  const baseWidth = lens === 'micro' ? 14 : lens === 'meso' ? 13 : 12;

  if (components.length) {
    return components.map((component, index) => {
      const material = focusMaterials.find((item) => item.id === component.materialRef) ?? focusMaterials[index % Math.max(focusMaterials.length, 1)];
      return {
        id: component.id,
        label: component.name,
        meta: material?.name ?? component.role,
        tone: getMaterialTone(material),
        x: anchors[index] ?? 50,
        width: baseWidth,
        height: baseHeight - index * 10,
        depth: lens === 'micro' ? 28 + index * 6 : lens === 'meso' ? 20 + index * 5 : 14 + index * 4,
        delay: index * 120,
      };
    });
  }

  return focusMaterials.slice(0, 3).map((material, index, list) => ({
    id: material.id,
    label: material.name,
    meta: material.category,
    tone: getMaterialTone(material),
    x: list.length === 1 ? 50 : list.length === 2 ? (index === 0 ? 32 : 68) : [18, 50, 82][index] ?? 50,
    width: baseWidth,
    height: baseHeight - index * 12,
    depth: lens === 'micro' ? 24 + index * 6 : lens === 'meso' ? 18 + index * 5 : 12 + index * 4,
    delay: index * 120,
  }));
}

function buildStageStructureFlows(nodes: StageStructureNode[], lens: MultiscaleLens): StageStructureFlow[] {
  return nodes.slice(0, -1).map((node, index) => {
    const nextNode = nodes[index + 1]!;
    const left = Math.min(node.x, nextNode.x);
    const width = Math.max(Math.abs(nextNode.x - node.x), 8);
    return {
      id: `${node.id}-${nextNode.id}`,
      tone: nextNode.tone,
      left,
      width,
      top: lens === 'micro' ? 106 - index * 10 : lens === 'meso' ? 120 - index * 10 : 132 - index * 9,
      thickness: lens === 'micro' ? 8 : lens === 'meso' ? 6 : 4,
      delay: index * 160,
    };
  });
}

function buildStageScopeBands(materials: ExperimentMaterialModel[], lens: MultiscaleLens): StageScopeBand[] {
  return materials.slice(0, 3).map((material, index) => ({
    id: material.id,
    label: material.name,
    meta: summarizeMaterial(material),
    tone: getMaterialTone(material),
    height:
      lens === 'micro'
        ? 56 + index * 16 + material.properties.length * 4
        : 72 + index * 18 + material.properties.length * 6,
    delay: index * 120,
  }));
}

function getLensSceneProfile(lens: MultiscaleLens): LensSceneProfile {
  if (lens === 'micro') {
    return {
      fov: 28,
      ambientIntensity: 0.94,
      fillIntensity: 1.54,
      haloOpacity: 0.3,
      glowOpacity: 0.18,
      focusBeamOpacity: 0.24,
      focusBeamHeight: 2.78,
      focusBeamScale: 1.16,
      focusPulseOpacity: 0.38,
      focusScale: 1.18,
      hoverScale: 1.08,
      idleScale: 0.76,
      focusOpacity: 1,
      hoverOpacity: 0.88,
      idleOpacity: 0.34,
      sceneSway: 0.012,
      targetLerp: 0.16,
      ringFocusedOpacity: 0.62,
      ringHoveredOpacity: 0.46,
      ringIdleOpacity: 0.04,
    };
  }

  if (lens === 'meso') {
    return {
      fov: 34,
      ambientIntensity: 1.14,
      fillIntensity: 1.3,
      haloOpacity: 0.24,
      glowOpacity: 0.12,
      focusBeamOpacity: 0.16,
      focusBeamHeight: 2.44,
      focusBeamScale: 1.08,
      focusPulseOpacity: 0.28,
      focusScale: 1.12,
      hoverScale: 1.04,
      idleScale: 0.9,
      focusOpacity: 1,
      hoverOpacity: 0.94,
      idleOpacity: 0.6,
      sceneSway: 0.022,
      targetLerp: 0.12,
      ringFocusedOpacity: 0.52,
      ringHoveredOpacity: 0.38,
      ringIdleOpacity: 0.08,
    };
  }

  return {
    fov: 40,
    ambientIntensity: 1.32,
    fillIntensity: 1.12,
    haloOpacity: 0.18,
    glowOpacity: 0.08,
    focusBeamOpacity: 0.08,
    focusBeamHeight: 2.1,
    focusBeamScale: 1,
    focusPulseOpacity: 0.16,
    focusScale: 1.06,
    hoverScale: 1.01,
    idleScale: 0.98,
    focusOpacity: 1,
    hoverOpacity: 0.96,
    idleOpacity: 0.9,
    sceneSway: 0.035,
    targetLerp: 0.08,
    ringFocusedOpacity: 0.42,
    ringHoveredOpacity: 0.3,
    ringIdleOpacity: 0.1,
  };
}

function SharedWorkbenchThreeStage({
  experiment,
  focusTargetObject,
  focusStepTitle,
  focusPrompt,
  preferredLens,
  studioMode = 'operation',
  workbenchPreset = 'balanced',
  overlayOnly = false,
  activeLens,
  lensMode,
  onActiveLensChange,
  onLensModeChange,
}: SharedWorkbenchThreeStageProps) {
  const theme = subjectThemes[experiment.subject];
  const multiscale = useMemo(() => getExperimentMultiscaleView(experiment), [experiment]);
  const cameraOptions = useMemo(
    () => getCameraPreset(experiment.scene.cameraPreset, studioMode, workbenchPreset),
    [experiment.scene.cameraPreset, studioMode, workbenchPreset],
  );
  const focusLabel = useMemo(() => findFocusLabel(experiment, focusTargetObject), [experiment, focusTargetObject]);
  const defaultFocusId = useMemo(() => findFocusEquipmentId(experiment, focusTargetObject), [experiment, focusTargetObject]);
  const modeLabel = useMemo(() => getModeLabel(studioMode, workbenchPreset), [studioMode, workbenchPreset]);
  const proxiesRef = useRef<StageProxy[]>([]);
  const sceneRigRef = useRef<StageSceneRig>({
    ambient: null,
    fill: null,
    halo: null,
    backGlow: null,
    focusBeam: null,
    focusPulse: null,
  });
  const focusTargetRef = useRef(focusTargetObject ?? '');
  const selectedProxyIdRef = useRef('');
  const hoveredProxyIdRef = useRef('');
  const [selectedProxyId, setSelectedProxyId] = useState('');
  const [hoveredProxyId, setHoveredProxyId] = useState('');
  const lensProfile = useMemo(() => getLensSceneProfile(activeLens), [activeLens]);
  const effectiveFocusId = selectedProxyId || hoveredProxyId || defaultFocusId;
  const focusEquipment = useMemo(
    () => experiment.equipment.find((equipment) => equipment.id === effectiveFocusId) ?? experiment.equipment[0],
    [effectiveFocusId, experiment.equipment],
  );
  const inspectorCopy = useMemo(
    () => buildStageInspectorCopy(experiment, focusEquipment, studioMode, workbenchPreset),
    [experiment, focusEquipment, studioMode, workbenchPreset],
  );
  const equipmentDeck = useMemo(() => experiment.equipment.slice(0, 6), [experiment.equipment]);
  const focusProfile = useMemo(
    () => multiscale.equipmentProfiles.find((profile) => profile.equipmentId === focusEquipment?.id) ?? multiscale.equipmentProfiles[0],
    [focusEquipment?.id, multiscale.equipmentProfiles],
  );
  const focusMaterialIds = useMemo(
    () => Array.from(new Set((focusProfile?.components ?? []).map((component) => component.materialRef).filter((materialRef): materialRef is string => Boolean(materialRef)))),
    [focusProfile],
  );
  const focusMaterials = useMemo(() => {
    const matches = multiscale.materials.filter((material) => focusMaterialIds.includes(material.id));
    return matches.length ? matches : multiscale.materials.slice(0, 3);
  }, [focusMaterialIds, multiscale.materials]);
  const relevantRules = useMemo(() => {
    const matches = multiscale.reactionRules.filter((rule) => rule.materialRefs?.some((materialRef) => focusMaterialIds.includes(materialRef)));
    return matches.length ? matches : multiscale.reactionRules.slice(0, 2);
  }, [focusMaterialIds, multiscale.reactionRules]);
  const microSpecies = useMemo(
    () => focusMaterials.flatMap((material) => material.microModel?.species ?? []).slice(0, 4),
    [focusMaterials],
  );
  const microParticles = useMemo(
    () => buildStageParticles(microSpecies),
    [microSpecies],
  );
  const structureNodes = useMemo(
    () => buildStageStructureNodes(focusProfile, focusMaterials, activeLens),
    [activeLens, focusMaterials, focusProfile],
  );
  const structureFlows = useMemo(
    () => buildStageStructureFlows(structureNodes, activeLens),
    [activeLens, structureNodes],
  );
  const scopeBands = useMemo(
    () => buildStageScopeBands(focusMaterials, activeLens),
    [activeLens, focusMaterials],
  );
  const scopeParticles = useMemo(
    () => microParticles.slice(0, activeLens === 'micro' ? 18 : 10),
    [activeLens, microParticles],
  );
  const activeRule = relevantRules[0];
  const lensNarrative = useMemo(
    () => buildLensNarrative(activeLens, focusEquipment?.name ?? focusLabel, focusMaterials, activeRule?.microNarrative),
    [activeLens, activeRule?.microNarrative, focusEquipment?.name, focusLabel, focusMaterials],
  );

  focusTargetRef.current = focusTargetObject ?? '';
  selectedProxyIdRef.current = selectedProxyId;
  hoveredProxyIdRef.current = hoveredProxyId;

  useEffect(() => {
    setSelectedProxyId('');
    setHoveredProxyId('');
  }, [defaultFocusId, experiment.id, focusTargetObject]);

  const mountRef = useThreeLabStage({
    background: theme.background,
    cameraPosition: cameraOptions.position,
    target: cameraOptions.target,
    minDistance: cameraOptions.minDistance,
    maxDistance: cameraOptions.maxDistance,
    deps: [experiment.id, studioMode, workbenchPreset],
    onSetup: ({ scene, camera, renderer }: ThreeLabStageContext) => {
      renderer.toneMappingExposure = 1.18;
      scene.fog = new Fog(theme.background, 10, 22);

      const ambient = new AmbientLight(0xe8f3ff, 1.32);
      scene.add(ambient);

      const key = new DirectionalLight(0xffffff, 1.8);
      key.position.set(5.4, 8.6, 6.2);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 0.5;
      key.shadow.camera.far = 24;
      scene.add(key);

      const fill = new PointLight(theme.glow, 1.12, 18, 2.1);
      fill.position.set(-4.6, 3.8, -3.2);
      scene.add(fill);

      const halo = new Mesh(
        new CircleGeometry(5.4, 64),
        new MeshBasicMaterial({ color: theme.aura, transparent: true, opacity: 0.18 }),
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = -0.22;
      scene.add(halo);

      const table = new Mesh(
        new BoxGeometry(11.8, 0.36, 7.2),
        createLabWoodMaterial({ color: theme.table, roughness: 0.88, clearcoat: 0.08 }),
      );
      table.position.set(0, -0.28, 0);
      table.receiveShadow = true;
      scene.add(table);

      const tableInset = new Mesh(
        new BoxGeometry(9.8, 0.08, 5.4),
        createLabCoatedMetalMaterial({ color: 0x111c28, roughness: 0.68, clearcoat: 0.18 }),
      );
      tableInset.position.set(0, -0.06, 0);
      tableInset.receiveShadow = true;
      scene.add(tableInset);

      const backWall = new Mesh(
        new PlaneGeometry(18, 10),
        createLabCoatedMetalMaterial({ color: theme.wall, roughness: 0.92, clearcoat: 0.18 }),
      );
      backWall.position.set(0, 3.7, -4.4);
      scene.add(backWall);

      const backGlow = new Mesh(
        new PlaneGeometry(8.2, 4.8),
        new MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.08 }),
      );
      backGlow.position.set(0, 3.1, -4.2);
      scene.add(backGlow);

      const shelf = new Mesh(
        new BoxGeometry(7.2, 0.12, 0.36),
        createLabCoatedMetalMaterial({ color: 0x223246, roughness: 0.54, clearcoat: 0.12 }),
      );
      shelf.position.set(0, 2.26, -3.02);
      scene.add(shelf);

      const towerLeft = new Mesh(
        new CylinderGeometry(0.08, 0.08, 2.42, 18),
        createLabMetalMaterial({ color: 0xbfcbd8, roughness: 0.22 }),
      );
      towerLeft.position.set(-3.2, 1.14, -3.02);
      const towerRight = towerLeft.clone();
      towerRight.position.x = 3.2;
      scene.add(towerLeft, towerRight);

      const focusBeam = new Mesh(
        new CylinderGeometry(0.24, 0.56, 2.18, 28, 1, true),
        new MeshBasicMaterial({
          color: theme.glow,
          transparent: true,
          opacity: 0.08,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      focusBeam.position.set(0, 1.18, 0);
      focusBeam.renderOrder = 2;
      scene.add(focusBeam);

      const focusPulse = new Mesh(
        new RingGeometry(0.5, 0.82, 48),
        new MeshBasicMaterial({
          color: theme.glow,
          transparent: true,
          opacity: 0.16,
          side: DoubleSide,
          depthWrite: false,
        }),
      );
      focusPulse.rotation.x = -Math.PI / 2;
      focusPulse.position.set(0, 0.015, 0);
      focusPulse.renderOrder = 2;
      scene.add(focusPulse);

      sceneRigRef.current = {
        ambient,
        fill,
        halo,
        backGlow,
        focusBeam,
        focusPulse,
      };

      const equipment = experiment.equipment.length > 0
        ? experiment.equipment.slice(0, 6)
        : experiment.scene.assets.slice(0, 6).map((asset, index) => ({
            id: asset.replace('.glb', ''),
            name: asset.replace('.glb', ''),
            type: index % 2 === 0 ? 'sample' : 'tool',
          }));
      const interactiveMeshes: Object3D[] = [];
      const raycaster = new Raycaster();
      const pointer = new Vector2();

      const proxies: StageProxy[] = equipment.map((item, index) => {
        const visualKind = inferVisualKind(item);
        const group = createProxyByKind(visualKind, theme);
        const [x, y, z] = getProxyLayout(index, equipment.length);
        const anchor = new Vector3(x, y, z);
        const baseScale = visualKind === 'instrument' ? 1.02 : 0.96;
        group.position.copy(anchor);
        group.scale.setScalar(baseScale);

        const ring = new Mesh(
          new RingGeometry(0.42, 0.56, 42),
          new MeshBasicMaterial({ color: theme.glow, transparent: true, opacity: 0.1, side: DoubleSide }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(x, 0.01, z);

        group.traverse((child) => {
          const mesh = child as Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.proxyId = item.id;
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((material) => {
              if (material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial) {
                material.userData.baseOpacity = material.opacity;
              }
            });
          } else if (mesh.material instanceof MeshStandardMaterial || mesh.material instanceof MeshPhysicalMaterial) {
            mesh.material.userData.baseOpacity = mesh.material.opacity;
          }
          interactiveMeshes.push(mesh);
        });

        scene.add(group, ring);

        return {
          id: item.id,
          name: item.name,
          kind: visualKind,
          group,
          ring,
          anchor,
          baseScale,
          bobOffset: index * 0.74,
          focusTokens: buildFocusTokens(item),
        };
      });

      proxiesRef.current = proxies;

      const resolveProxyId = (clientX: number, clientY: number) => {
        const rect = renderer.domElement.getBoundingClientRect();
        if (!rect.width || !rect.height) return '';
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(interactiveMeshes, false).find((entry) => entry.object.userData.proxyId);
        return (hit?.object.userData.proxyId as string | undefined) ?? '';
      };

      const handlePointerMove = (event: PointerEvent) => {
        const nextHoveredId = resolveProxyId(event.clientX, event.clientY);
        renderer.domElement.style.cursor = nextHoveredId ? 'pointer' : 'grab';
        setHoveredProxyId((current) => (current === nextHoveredId ? current : nextHoveredId));
      };

      const handlePointerLeave = () => {
        renderer.domElement.style.cursor = 'grab';
        setHoveredProxyId('');
      };

      const handleClick = (event: MouseEvent) => {
        const nextSelectedId = resolveProxyId(event.clientX, event.clientY);
        setSelectedProxyId((current) => (current === nextSelectedId ? '' : nextSelectedId));
      };

      renderer.domElement.style.cursor = 'grab';
      renderer.domElement.addEventListener('pointermove', handlePointerMove);
      renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.addEventListener('click', handleClick);

      return () => {
        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
        renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
        renderer.domElement.removeEventListener('click', handleClick);
        renderer.domElement.style.cursor = '';
        focusBeam.geometry.dispose();
        (focusBeam.material as Material).dispose();
        focusPulse.geometry.dispose();
        (focusPulse.material as Material).dispose();
        scene.remove(focusBeam, focusPulse);
        proxiesRef.current.forEach((proxy) => {
          proxy.group.traverse((child) => {
            const mesh = child as Mesh;
            if (!mesh.isMesh) return;
            mesh.geometry.dispose();
            if (Array.isArray(mesh.material)) {
              mesh.material.forEach((material) => material.dispose());
            } else {
              mesh.material.dispose();
            }
          });
          proxy.ring.geometry.dispose();
          (proxy.ring.material as Material).dispose();
          scene.remove(proxy.group, proxy.ring);
        });
        proxiesRef.current = [];
        sceneRigRef.current = {
          ambient: null,
          fill: null,
          halo: null,
          backGlow: null,
          focusBeam: null,
          focusPulse: null,
        };
      };
    },
    onFrame: ({ scene, camera, controls }: ThreeLabStageContext, time: number) => {
      const focusToken = focusTargetRef.current.toLowerCase();
      const elapsed = time * 0.001;
      const selectedId = selectedProxyIdRef.current;
      const hoveredId = hoveredProxyIdRef.current;
      const activeId = selectedId || hoveredId;
      const activeProxy = proxiesRef.current.find((proxy) => proxy.id === (activeId || defaultFocusId));
      const desiredTarget = activeProxy
        ? new Vector3(activeProxy.anchor.x, 0.84, activeProxy.anchor.z)
        : new Vector3(...cameraOptions.target);
      const rig = sceneRigRef.current;

      scene.rotation.y = Math.sin(elapsed * 0.09) * lensProfile.sceneSway;
      controls.target.lerp(desiredTarget, activeProxy ? lensProfile.targetLerp : lensProfile.targetLerp * 0.7);
      camera.fov += (lensProfile.fov - camera.fov) * 0.08;
      camera.updateProjectionMatrix();
      controls.minDistance = MathUtils.lerp(controls.minDistance, cameraOptions.minDistance * (activeLens === 'micro' ? 0.76 : activeLens === 'meso' ? 0.9 : 1), 0.08);
      controls.maxDistance = MathUtils.lerp(controls.maxDistance, cameraOptions.maxDistance * (activeLens === 'micro' ? 0.82 : activeLens === 'meso' ? 0.92 : 1), 0.08);

      if (rig.ambient) {
        rig.ambient.intensity += (lensProfile.ambientIntensity - rig.ambient.intensity) * 0.08;
      }

      if (rig.fill) {
        rig.fill.intensity += (lensProfile.fillIntensity - rig.fill.intensity) * 0.08;
      }

      if (rig.halo) {
        const haloMaterial = rig.halo.material as MeshBasicMaterial;
        haloMaterial.opacity += (lensProfile.haloOpacity - haloMaterial.opacity) * 0.08;
      }

      if (rig.backGlow) {
        const glowMaterial = rig.backGlow.material as MeshBasicMaterial;
        glowMaterial.opacity += (lensProfile.glowOpacity - glowMaterial.opacity) * 0.08;
      }

      if (rig.focusBeam) {
        const beamMaterial = rig.focusBeam.material as MeshBasicMaterial;
        const beamAnchor = activeProxy?.anchor ?? new Vector3(0, 0, 0);
        rig.focusBeam.position.set(beamAnchor.x, lensProfile.focusBeamHeight * 0.5, beamAnchor.z);
        rig.focusBeam.scale.setScalar(lensProfile.focusBeamScale + Math.sin(elapsed * 1.8) * 0.03);
        beamMaterial.opacity += ((activeProxy ? lensProfile.focusBeamOpacity : 0.02) - beamMaterial.opacity) * 0.12;
      }

      if (rig.focusPulse) {
        const pulseMaterial = rig.focusPulse.material as MeshBasicMaterial;
        const beamAnchor = activeProxy?.anchor ?? new Vector3(0, 0, 0);
        rig.focusPulse.position.set(beamAnchor.x, 0.015, beamAnchor.z);
        rig.focusPulse.scale.setScalar(
          (activeLens === 'micro' ? 1.14 : activeLens === 'meso' ? 1.08 : 1)
          + Math.sin(elapsed * 2.1) * 0.05,
        );
        pulseMaterial.opacity += ((activeProxy ? lensProfile.focusPulseOpacity : 0.04) - pulseMaterial.opacity) * 0.12;
      }

      proxiesRef.current.forEach((proxy, index) => {
        proxy.group.rotation.y = elapsed * 0.22 + proxy.bobOffset * 0.36;
        proxy.group.position.set(
          proxy.anchor.x,
          proxy.anchor.y + 0.02 + Math.sin(elapsed * 0.9 + proxy.bobOffset) * 0.05,
          proxy.anchor.z,
        );

        const isSelected = selectedId === proxy.id;
        const isHovered = hoveredId === proxy.id;
        const isFocusedByStep = !focusToken
          ? index === 0
          : proxy.focusTokens.some((token) => focusToken.includes(token) || token.includes(focusToken));
        const isFocused = isSelected || isHovered || (!activeId && isFocusedByStep);
        const targetScale = isSelected
          ? proxy.baseScale * lensProfile.focusScale
          : isHovered || isFocused
            ? proxy.baseScale * lensProfile.hoverScale
            : proxy.baseScale * lensProfile.idleScale;
        proxy.group.scale.lerp(new Vector3(targetScale, targetScale, targetScale), 0.12);

        const ringMaterial = proxy.ring.material as MeshBasicMaterial;
        ringMaterial.opacity = isSelected
          ? lensProfile.ringFocusedOpacity + Math.sin(elapsed * 2.8 + index) * 0.08
          : isHovered || isFocused
            ? lensProfile.ringHoveredOpacity + Math.sin(elapsed * 2.8 + index) * 0.06
            : lensProfile.ringIdleOpacity;
        proxy.ring.scale.setScalar(isSelected ? 1.16 : isHovered || isFocused ? 1.08 + Math.sin(elapsed * 2.2 + index) * 0.04 : 0.94);

        proxy.group.traverse((child) => {
          const mesh = child as Mesh;
          const material = mesh.material;
          if (!(material instanceof MeshStandardMaterial || material instanceof MeshPhysicalMaterial)) return;
          const baseOpacity = typeof material.userData.baseOpacity === 'number' ? material.userData.baseOpacity : material.opacity;
          const targetOpacity = isSelected
            ? lensProfile.focusOpacity
            : isHovered || isFocused
              ? lensProfile.hoverOpacity
              : lensProfile.idleOpacity;
          material.transparent = baseOpacity < 0.999 || targetOpacity < 0.999;
          material.opacity = baseOpacity * targetOpacity;
          material.emissive.setHex(isSelected ? theme.accent : isHovered || isFocused ? theme.accentSoft : 0x000000);
          material.emissiveIntensity = isSelected ? 0.72 : isHovered || isFocused ? 0.52 : activeLens === 'micro' ? 0.02 : 0;
        });
      });
    },
  });

  return (
    <div
      className={overlayOnly ? 'shared-workbench-stage overlay-only' : 'shared-workbench-stage stage-with-canvas'}
      data-active-lens={activeLens}
      data-overlay-mode={overlayOnly ? 'native' : 'shared'}
      data-shared-workbench-stage-root="true"
    >
      {overlayOnly ? null : <div className="shared-workbench-stage-canvas" ref={mountRef} />}
      <div className="shared-workbench-stage-chrome">
        <div className="shared-workbench-stage-banner" aria-hidden="true">
          <span>当前步骤</span>
          <strong>{focusStepTitle ?? experiment.steps[0]?.title ?? '实验准备'}</strong>
          <small>{focusPrompt ?? experiment.steps[0]?.description ?? '进入实验后，从当前步骤继续推进。'}</small>
        </div>
        <div className={`shared-workbench-stage-structure-shell ${activeLens}`} aria-hidden="true">
          <div className="shared-workbench-stage-structure-grid" />
          <div className="shared-workbench-stage-structure-floor" />
          <div className="shared-workbench-stage-structure-flow-lane">
            {structureFlows.map((flow) => (
              <span
                className="shared-workbench-stage-structure-flow"
                key={flow.id}
                style={{
                  left: `${flow.left}%`,
                  width: `${flow.width}%`,
                  top: `${flow.top}px`,
                  height: `${flow.thickness}px`,
                  animationDelay: `${flow.delay}ms`,
                  '--stage-structure-tone': flow.tone,
                } as CSSProperties}
              />
            ))}
          </div>
          <div className="shared-workbench-stage-structure-row">
            {structureNodes.map((node) => (
              <div
                className="shared-workbench-stage-structure-node"
                key={node.id}
                style={{
                  left: `${node.x}%`,
                  width: `${node.width}%`,
                  height: `${node.height}px`,
                  bottom: `${24 + node.depth}px`,
                  animationDelay: `${node.delay}ms`,
                  '--stage-structure-tone': node.tone,
                } as CSSProperties}
              >
                <span className="shared-workbench-stage-structure-node-shadow" />
                <span className="shared-workbench-stage-structure-node-column" />
                <span className="shared-workbench-stage-structure-node-cap" />
                <span className="shared-workbench-stage-structure-node-label">
                  <strong>{node.label}</strong>
                  <small>{node.meta}</small>
                </span>
              </div>
            ))}
          </div>
          <div className="shared-workbench-stage-material-stream">
            {focusMaterials.slice(0, 3).map((material) => (
              <span
                className="shared-workbench-stage-material-pill"
                key={material.id}
                style={{ '--stage-structure-tone': getMaterialTone(material) } as CSSProperties}
              >
                {material.name}
              </span>
            ))}
          </div>
        </div>
        {activeLens !== 'macro' ? (
          <div className={`shared-workbench-stage-scope ${activeLens}`} aria-hidden="true">
            <div className="shared-workbench-stage-scope-head">
              <span>{activeLens === 'micro' ? 'Micro Scope' : 'Meso Scope'}</span>
              <strong>{focusEquipment?.name ?? focusLabel}</strong>
              <small>{activeRule?.observe ?? lensNarrative}</small>
            </div>

            <div className={`shared-workbench-stage-scope-visual ${activeLens}`}>
              {activeLens === 'meso' ? (
                <div className="shared-workbench-stage-scope-band-row">
                  {scopeBands.map((band) => (
                    <div className="shared-workbench-stage-scope-band-card" key={band.id}>
                      <span
                        className="shared-workbench-stage-scope-band"
                        style={{
                          height: `${band.height}px`,
                          animationDelay: `${band.delay}ms`,
                          '--stage-scope-tone': band.tone,
                        } as CSSProperties}
                      />
                      <strong>{band.label}</strong>
                      <small>{band.meta}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="shared-workbench-stage-scope-core" />
                  <div className="shared-workbench-stage-scope-ring ring-a" />
                  <div className="shared-workbench-stage-scope-ring ring-b" />
                  {scopeParticles.map((particle) => (
                    <span
                      className="shared-workbench-stage-scope-particle"
                      key={particle.id}
                      style={{
                        left: `${particle.x}%`,
                        top: `${particle.y}%`,
                        width: `${Math.max(particle.size - 1.5, 5)}px`,
                        height: `${Math.max(particle.size - 1.5, 5)}px`,
                        background: particle.color,
                        animationDelay: `${particle.delay}ms`,
                        animationDuration: `${particle.duration}ms`,
                      } as CSSProperties}
                    />
                  ))}
                </>
              )}
            </div>

            <div className="shared-workbench-stage-scope-foot">
              <span className="shared-workbench-stage-focus-pill active">{getLensModeLabel(lensMode)}</span>
              <span className="shared-workbench-stage-focus-pill">
                {preferredLens ? `步骤建议 ${getLensLabel(preferredLens)}` : '等待步骤建议'}
              </span>
              {activeLens === 'micro'
                ? microSpecies.slice(0, 3).map((species) => (
                    <span className="shared-workbench-stage-scope-foot-pill" key={species.id} style={{ '--stage-scope-tone': species.color } as CSSProperties}>
                      {species.formula ?? species.name}
                    </span>
                  ))
                : focusMaterials.slice(0, 3).map((material) => (
                    <span className="shared-workbench-stage-scope-foot-pill" key={material.id} style={{ '--stage-scope-tone': getMaterialTone(material) } as CSSProperties}>
                      {material.name}
                    </span>
                  ))}
            </div>
          </div>
        ) : null}
        <div className="shared-workbench-stage-overlay" aria-hidden="true">
          <div className="shared-workbench-stage-chip">
            <span>3D Workbench</span>
            <strong>{experiment.scene.environment}</strong>
          </div>
          <div className="shared-workbench-stage-chip active">
            <span>Focus</span>
            <strong>{focusLabel}</strong>
          </div>
          <div className="shared-workbench-stage-chip">
            <span>Mode</span>
            <strong>{modeLabel}</strong>
          </div>
          <div className="shared-workbench-stage-chip">
            <span>Rig</span>
            <strong>{experiment.scene.cameraPreset}</strong>
          </div>
          <div className="shared-workbench-stage-chip">
            <span>Props</span>
            <strong>{clamp(experiment.equipment.length || experiment.scene.assets.length, 1, 6)}</strong>
          </div>
        </div>
        <div className="shared-workbench-stage-hint" aria-hidden="true">
          {overlayOnly ? '当前是原生三维实验台，镜头与微观解释已作为覆盖层接入' : '拖拽空白区域可旋转三维工作台，点击器材可聚焦'}
        </div>
        <div className="shared-workbench-stage-dock">
          <div className="shared-workbench-stage-focus-panel">
            <span>Stage Focus</span>
            <strong>{focusEquipment?.name ?? focusLabel}</strong>
            <small>{inspectorCopy}</small>
            <div className="shared-workbench-stage-focus-meta" aria-hidden="true">
              <span className="shared-workbench-stage-focus-pill active">{focusEquipment ? getVisualKindLabel(inferVisualKind(focusEquipment)) : '器材代理'}</span>
              <span className="shared-workbench-stage-focus-pill">{selectedProxyId ? '手动聚焦' : hoveredProxyId ? '悬停预览' : '步骤聚焦'}</span>
            </div>
          </div>

          <div className="shared-workbench-stage-lens-panel">
            <div className="shared-workbench-stage-lens-head">
              <div>
                <span>Multiscale Lens</span>
                <strong>{getLensLabel(activeLens)}</strong>
                <small>{lensNarrative}</small>
              </div>
              <div className="shared-workbench-stage-lens-meta">
                <button
                  className={lensMode === 'auto' ? 'shared-workbench-stage-focus-pill-button active' : 'shared-workbench-stage-focus-pill-button'}
                  onClick={() => onLensModeChange(lensMode === 'auto' ? 'manual' : 'auto')}
                  type="button"
                >
                  {getLensModeLabel(lensMode)}
                </button>
                <span className={multiscale.source === 'configured' ? 'shared-workbench-stage-focus-pill active' : 'shared-workbench-stage-focus-pill'}>
                  {multiscale.source === 'configured' ? '配置驱动' : '引擎推导'}
                </span>
              </div>
            </div>

            <div className="shared-workbench-stage-lens-switch" role="tablist" aria-label="实验台多尺度镜头">
              {(['macro', 'meso', 'micro'] as MultiscaleLens[]).map((lens) => (
                <button
                  aria-selected={activeLens === lens}
                  className={activeLens === lens ? 'shared-workbench-stage-lens-button active' : 'shared-workbench-stage-lens-button'}
                  key={lens}
                  onClick={() => {
                    onLensModeChange('manual');
                    onActiveLensChange(lens);
                  }}
                  role="tab"
                  type="button"
                >
                  {getLensLabel(lens)}
                </button>
              ))}
            </div>

            {activeLens === 'macro' ? (
              <div className="shared-workbench-stage-lens-grid">
                {(focusProfile?.components.slice(0, 3) ?? []).map((component) => (
                  <article className="shared-workbench-stage-data-card" key={component.id}>
                    <span>{component.role}</span>
                    <strong>{component.name}</strong>
                    <small>{component.materialRef ?? '结构层'}</small>
                  </article>
                ))}
              </div>
            ) : null}

            {activeLens === 'meso' ? (
              <div className="shared-workbench-stage-lens-grid">
                {focusMaterials.slice(0, 3).map((material) => (
                  <article className="shared-workbench-stage-data-card" key={material.id}>
                    <span>{material.category}</span>
                    <strong>{material.name}</strong>
                    <small>{summarizeMaterial(material)}</small>
                  </article>
                ))}
              </div>
            ) : null}

            {activeLens === 'micro' ? (
              <div className="shared-workbench-stage-micro-shell">
                <div className="shared-workbench-stage-micro-visual" aria-hidden="true">
                  <div className="shared-workbench-stage-micro-orbit orbit-a" />
                  <div className="shared-workbench-stage-micro-orbit orbit-b" />
                  <div className="shared-workbench-stage-micro-core" />
                  {microParticles.map((particle) => (
                    <span
                      className="shared-workbench-stage-particle"
                      key={particle.id}
                      style={{
                        left: `${particle.x}%`,
                        top: `${particle.y}%`,
                        width: `${particle.size}px`,
                        height: `${particle.size}px`,
                        background: particle.color,
                        animationDelay: `${particle.delay}ms`,
                        animationDuration: `${particle.duration}ms`,
                      }}
                    />
                  ))}
                </div>
                <article className="shared-workbench-stage-data-card emphasis">
                  <span>Micro Rule</span>
                  <strong>{activeRule?.observe ?? '当前步骤需要微观解释'}</strong>
                  <small>{activeRule?.microNarrative ?? '粒子排布与能量传递会共同决定宏观现象。'}</small>
                </article>
                <div className="shared-workbench-stage-species-row">
                  {microSpecies.map((species) => (
                    <div className="shared-workbench-stage-species-chip" key={species.id}>
                      <i style={{ background: species.color }} />
                      <span>{getMicroSpeciesLabel(species)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="shared-workbench-stage-selector" aria-label="三维工作台器材聚焦">
            {equipmentDeck.map((equipment) => {
              const visualKind = inferVisualKind(equipment);
              const isActive = equipment.id === effectiveFocusId;
              return (
                <button
                  aria-pressed={isActive}
                  className={isActive ? 'shared-workbench-stage-selector-button active' : 'shared-workbench-stage-selector-button'}
                  key={equipment.id}
                  onBlur={() => setHoveredProxyId('')}
                  onClick={() => setSelectedProxyId((current) => (current === equipment.id ? '' : equipment.id))}
                  onFocus={() => setHoveredProxyId(equipment.id)}
                  onMouseEnter={() => setHoveredProxyId(equipment.id)}
                  onMouseLeave={() => setHoveredProxyId('')}
                  type="button"
                >
                  <span>{getVisualKindLabel(visualKind)}</span>
                  <strong>{equipment.name}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SharedWorkbenchThreeStagePortal(props: SharedWorkbenchThreeStagePortalProps) {
  const { experiment, preferredLens } = props;
  const multiscale = useMemo(() => getExperimentMultiscaleView(experiment), [experiment]);
  const [targetNode, setTargetNode] = useState<HTMLElement | null>(null);
  const [hasNativeCanvas, setHasNativeCanvas] = useState(false);
  const [activeLens, setActiveLens] = useState<MultiscaleLens>(preferredLens ?? multiscale.defaultLens);
  const [lensMode, setLensMode] = useState<'auto' | 'manual'>('auto');

  useEffect(() => {
    setLensMode('auto');
    setActiveLens(preferredLens ?? multiscale.defaultLens);
  }, [experiment.id]);

  useEffect(() => {
    if (lensMode !== 'auto') return;
    setActiveLens(preferredLens ?? multiscale.defaultLens);
  }, [lensMode, multiscale.defaultLens, preferredLens]);

  useEffect(() => {
    const syncTarget = () => {
      const nextTarget = document.querySelector('.lab-mode-shell .scene-canvas') as HTMLElement | null;
      if (!nextTarget) {
        setTargetNode(null);
        setHasNativeCanvas(false);
        return;
      }

      const nextHasNativeCanvas = Array.from(nextTarget.querySelectorAll('canvas')).some(
        (canvas) => !canvas.closest('[data-shared-workbench-stage-root="true"]'),
      );

      setTargetNode(nextTarget);
      setHasNativeCanvas(nextHasNativeCanvas);
    };

    syncTarget();

    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [experiment.id]);

  useEffect(() => {
    if (!targetNode) return undefined;
    if (!hasNativeCanvas) {
      targetNode.classList.add('has-shared-three-stage');
    }

    return () => {
      targetNode.classList.remove('has-shared-three-stage');
    };
  }, [hasNativeCanvas, targetNode]);

  useEffect(() => {
    if (!targetNode) return undefined;
    targetNode.dataset.multiscaleLens = activeLens;
    targetNode.dataset.multiscaleRenderer = hasNativeCanvas ? 'native' : 'shared';

    return () => {
      targetNode.removeAttribute('data-multiscale-lens');
      targetNode.removeAttribute('data-multiscale-renderer');
    };
  }, [activeLens, hasNativeCanvas, targetNode]);

  if (!targetNode) return null;

  return createPortal(
    <SharedWorkbenchThreeStage
      {...props}
      activeLens={activeLens}
      lensMode={lensMode}
      onActiveLensChange={setActiveLens}
      onLensModeChange={(mode) => {
        setLensMode(mode);
        if (mode === 'auto') {
          setActiveLens(preferredLens ?? multiscale.defaultLens);
        }
      }}
      overlayOnly={hasNativeCanvas}
    />,
    targetNode,
  );
}
