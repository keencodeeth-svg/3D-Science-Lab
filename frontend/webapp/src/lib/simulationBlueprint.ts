import { getFocusedExperimentMultiscaleView, getExperimentMultiscaleView } from './multiscaleLab';
import { describeSimulationRuntime, describeSimulationRuntimeChannels, type SimulationRuntimeSnapshot } from './simulationRuntime';
import type { ExperimentConfig, ExperimentStep, MultiscaleLens } from '../types/experiment';

export interface ExperimentSimulationBlueprint {
  executionModel: string;
  renderRuntime: string;
  assetPipeline: string[];
  observables: string[];
  controlInputs: string[];
  groundingChannels: string[];
  upgradeTargets: string[];
  fidelityLayers: string[];
}

export interface SimulationGroundingSnapshot {
  executionModel: string;
  renderRuntime: string;
  assetPipeline: string[];
  observables: string[];
  controlInputs: string[];
  groundingChannels: string[];
  upgradeTargets: string[];
  fidelityLayers: string[];
  focusLens?: string;
  focusStepTitle?: string;
  focusStepGoal?: string;
  focusTargetObject?: string;
  materialSummary?: string;
  ruleSummary?: string;
  traceSummary?: string;
  telemetrySummary?: string;
  runtimeSource?: string;
  runtimePhase?: string;
  runtimeSummary?: string;
  runtimeObservables?: string[];
  runtimeControls?: string[];
  runtimeRisks?: string[];
  runtimeTraceSummary?: string;
}

interface SimulationBlueprintOptions {
  hasDedicatedPlayer?: boolean;
}

interface SimulationGroundingOptions extends SimulationBlueprintOptions {
  focusStep?: ExperimentStep | null;
  focusTargetObject?: string;
  focusedLens?: MultiscaleLens;
  progressPercent?: number;
  score?: number;
  errors?: number;
  latestPrompt?: string;
  runtimeSnapshot?: SimulationRuntimeSnapshot | null;
}

const LENS_LABELS: Record<MultiscaleLens, string> = {
  macro: '宏观',
  meso: '中观',
  micro: '微观',
};

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function includesAny(value: string, patterns: string[]) {
  const normalized = value.toLowerCase();
  return patterns.some((pattern) => normalized.includes(pattern));
}

function deriveObservables(experiment: ExperimentConfig) {
  const observables = [
    '步骤状态',
    '目标对象',
    '得分与错误数',
  ];

  experiment.steps.forEach((step) => {
    switch (step.actionType) {
      case 'record-observation':
        observables.push('观察记录');
        break;
      case 'adjust-focus':
        observables.push('焦距清晰度');
        break;
      case 'switch-view':
        observables.push('镜头视角');
        break;
      case 'set-variable':
        observables.push('可控变量');
        break;
      case 'connect-wire':
        observables.push('连接关系');
        break;
      case 'add-material':
      case 'heat-object':
        observables.push('材料状态');
        break;
      default:
        break;
    }
  });

  experiment.capabilities.forEach((capability) => {
    if (includesAny(capability, ['zoom', 'focus', 'light'])) observables.push('视野与光照');
    if (includesAny(capability, ['observation', 'notebook', 'panel'])) observables.push('观察面板');
    if (includesAny(capability, ['meter', 'measure', 'readout'])) observables.push('仪表读数');
    if (includesAny(capability, ['placement', 'drag', 'highlight'])) observables.push('器材操作反馈');
  });

  if (experiment.multiscale) {
    observables.push('材料属性', '微观粒子', '规则触发');
  }

  return unique(observables);
}

function deriveControlInputs(experiment: ExperimentConfig) {
  const controls = [
    '步骤切换',
    '对象聚焦',
  ];

  experiment.steps.forEach((step) => {
    switch (step.actionType) {
      case 'connect-wire':
        controls.push('连线操作');
        break;
      case 'place-object':
        controls.push('器材放置');
        break;
      case 'adjust-focus':
        controls.push('焦距调节');
        break;
      case 'switch-view':
        controls.push('镜头切换');
        break;
      case 'set-variable':
        controls.push('变量调节');
        break;
      case 'record-observation':
        controls.push('观察记录提交');
        break;
      case 'add-material':
        controls.push('材料加入');
        break;
      case 'heat-object':
        controls.push('热源控制');
        break;
      default:
        break;
    }
  });

  return unique(controls);
}

function deriveGroundingChannels(experiment: ExperimentConfig, hasDedicatedPlayer: boolean) {
  const channels = [
    '实验配置',
    '步骤定义',
    '目标对象',
    '遥测回放',
    '多尺度语义图',
  ];

  if (experiment.scene.assets.length) {
    channels.push('场景资产');
  }

  if (hasDedicatedPlayer) {
    channels.push('专属播放器状态');
  } else {
    channels.push('通用播放器状态');
  }

  if (experiment.multiscale) {
    channels.push('材料节点', '微观粒子簇', '规则叙事');
  }

  return unique(channels);
}

function deriveUpgradeTargets(experiment: ExperimentConfig, hasDedicatedPlayer: boolean) {
  const targets = [
    'Three.js WebGPU 渲染 / GPU 计算升级',
    'OpenUSD / SimReady 资产语义对齐',
    'AI 代理可读的状态图与可观测量总线',
  ];

  if (experiment.multiscale) {
    targets.push('多尺度规则驱动的连续状态仿真');
  }

  if (hasDedicatedPlayer) {
    targets.push('专属播放器向统一仿真内核收敛');
  } else {
    targets.push('通用播放器向可组合仿真部件扩展');
  }

  return unique(targets);
}

function deriveExecutionModel(experiment: ExperimentConfig, hasDedicatedPlayer: boolean) {
  if (hasDedicatedPlayer && experiment.multiscale) {
    return '混合语义仿真：专属交互播放器 + 多尺度状态解释 + 规则触发';
  }

  if (hasDedicatedPlayer) {
    return '专属程序化仿真：针对实验目标定制交互与状态推进';
  }

  if (experiment.multiscale) {
    return '通用语义仿真：通用播放器承载，多尺度引擎补足材料与粒子层';
  }

  return '脚本化可观测仿真：以步骤、状态和反馈为主，逐步补连续机理层';
}

function deriveRenderRuntime(experiment: ExperimentConfig, hasDedicatedPlayer: boolean) {
  const base = hasDedicatedPlayer ? 'Three.js WebGL + 专属 Player' : 'Three.js WebGL + 通用 Player';
  return experiment.multiscale ? `${base} + DOM/Portal 多尺度叠层` : base;
}

export function createExperimentSimulationBlueprint(experiment: ExperimentConfig, options: SimulationBlueprintOptions = {}): ExperimentSimulationBlueprint {
  const hasDedicatedPlayer = Boolean(options.hasDedicatedPlayer);
  const multiscale = getExperimentMultiscaleView(experiment);

  return {
    executionModel: deriveExecutionModel(experiment, hasDedicatedPlayer),
    renderRuntime: deriveRenderRuntime(experiment, hasDedicatedPlayer),
    assetPipeline: unique([
      'GLB / glTF 场景资产',
      'PBR 材质与环境光照',
      '器材组件语义拆解',
      multiscale.source === 'configured' ? '显式多尺度配置' : '引擎推导多尺度配置',
    ]),
    observables: deriveObservables(experiment),
    controlInputs: deriveControlInputs(experiment),
    groundingChannels: deriveGroundingChannels(experiment, hasDedicatedPlayer),
    upgradeTargets: deriveUpgradeTargets(experiment, hasDedicatedPlayer),
    fidelityLayers: unique([
      `场景层 ${experiment.scene.environment}`,
      `步骤层 ${experiment.steps.length} 步`,
      `器材层 ${experiment.equipment.length} 项`,
      `多尺度 ${LENS_LABELS[multiscale.defaultLens]}层默认`,
    ]),
  };
}

export function createSimulationGroundingSnapshot(experiment: ExperimentConfig, options: SimulationGroundingOptions = {}): SimulationGroundingSnapshot {
  const blueprint = createExperimentSimulationBlueprint(experiment, options);
  const focused = getFocusedExperimentMultiscaleView(experiment, {
    step: options.focusStep,
    focusTargetObject: options.focusTargetObject,
  });
  const runtimeSnapshot = options.runtimeSnapshot ?? null;
  const runtimeObservables = runtimeSnapshot ? describeSimulationRuntimeChannels(runtimeSnapshot.observables, 4) : [];
  const runtimeControls = runtimeSnapshot ? describeSimulationRuntimeChannels(runtimeSnapshot.controls, 4) : [];
  const runtimeSummary = describeSimulationRuntime(runtimeSnapshot);
  const progressSummary =
    typeof options.progressPercent === 'number' || typeof options.score === 'number' || typeof options.errors === 'number'
      ? `进度 ${Math.max(options.progressPercent ?? 0, 0)}% · 得分 ${options.score ?? 0} · 错误 ${options.errors ?? 0}${options.latestPrompt ? ` · 最新提示 ${options.latestPrompt}` : ''}`
      : options.latestPrompt || '';

  return {
    ...blueprint,
    observables: unique([...blueprint.observables, ...(runtimeSnapshot?.observables.map((item) => item.label) ?? [])]),
    controlInputs: unique([...blueprint.controlInputs, ...(runtimeSnapshot?.controls.map((item) => item.label) ?? [])]),
    groundingChannels: unique([...blueprint.groundingChannels, runtimeSnapshot ? '统一运行态总线' : '']),
    fidelityLayers: unique([...blueprint.fidelityLayers, runtimeSnapshot ? `运行态 ${runtimeSnapshot.phaseLabel}` : '']),
    focusLens: LENS_LABELS[runtimeSnapshot?.focusLens ?? options.focusedLens ?? focused.focusedLens],
    focusStepTitle: options.focusStep?.title ?? '',
    focusStepGoal: options.focusStep?.description ?? options.focusStep?.successCondition ?? '',
    focusTargetObject: runtimeSnapshot?.focusTarget ?? options.focusTargetObject ?? options.focusStep?.targetObject ?? '',
    materialSummary: focused.materialSummary,
    ruleSummary: focused.ruleSummary,
    traceSummary: focused.traceSummary,
    telemetrySummary: [progressSummary, runtimeSummary].filter(Boolean).join(' · '),
    runtimeSource: runtimeSnapshot?.playerId ?? '',
    runtimePhase: runtimeSnapshot?.phaseLabel ?? '',
    runtimeSummary,
    runtimeObservables,
    runtimeControls,
    runtimeRisks: runtimeSnapshot?.failureRisks ?? [],
    runtimeTraceSummary: runtimeSnapshot?.trace.join(' -> ') ?? '',
  };
}
