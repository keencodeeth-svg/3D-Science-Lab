import { createApparatusRuntimeSnapshot } from './apparatusRuntime';
import {
  createSimulationRuntimeSnapshot,
  type SimulationRuntimeChannel,
  type SimulationRuntimeControl,
  type SimulationRuntimePhase,
  type SimulationRuntimePhaseState,
  type SimulationRuntimeSnapshot,
} from './simulationRuntime';
import type { ApparatusRuntimeContext, ApparatusRuntimeInstance } from '../types/apparatus';
import type { MultiscaleLens } from '../types/experiment';

interface CreateSimulationRuntimeFromApparatusOptions {
  playerId: string;
  source?: SimulationRuntimeSnapshot['source'];
  apparatusIds: string[];
  runtimeContext?: ApparatusRuntimeContext;
  activeApparatusId?: string | null;
  phaseLabel: string;
  phaseState?: SimulationRuntimePhaseState;
  stateSummary?: string;
  progress?: number;
  focusTarget?: string | null;
  focusLens?: MultiscaleLens;
  observables?: SimulationRuntimeChannel[];
  controls?: SimulationRuntimeControl[];
  phases?: SimulationRuntimePhase[];
  failureRisks?: string[];
  trace?: string[];
}

function trimText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

function slugify(value: string) {
  return trimText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'signal';
}

function mergeChannels<T extends SimulationRuntimeChannel>(primary: T[] | undefined, secondary: T[]) {
  const merged = [...(primary ?? []), ...secondary];
  return merged.filter((item, index) => merged.findIndex((candidate) => candidate.key === item.key) === index);
}

function resolveActiveRuntime(apparatusIds: string[], runtimeContext?: ApparatusRuntimeContext, activeApparatusId?: string | null) {
  const snapshot = createApparatusRuntimeSnapshot(apparatusIds, runtimeContext, activeApparatusId);
  if (!snapshot.instances.length) return null;

  if (snapshot.activeInstanceId) {
    return snapshot.instances.find((item) => item.instanceId === snapshot.activeInstanceId) ?? snapshot.instances[0];
  }

  return snapshot.instances[0];
}

function createObservablesFromActiveRuntime(activeRuntime: ApparatusRuntimeInstance | null) {
  if (!activeRuntime) return [];

  return Object.entries(activeRuntime.values).slice(0, 4).map(([label, value]) => ({
    key: `${activeRuntime.apparatusId}:${slugify(label)}`,
    label,
    value,
    status: activeRuntime.phase === 'stable' || activeRuntime.phase === 'complete' ? 'nominal' : activeRuntime.phase === 'active' ? 'warning' : undefined,
  })) satisfies SimulationRuntimeChannel[];
}

function createControlsFromRuntimeContext(runtimeContext?: ApparatusRuntimeContext) {
  return Object.entries(runtimeContext?.values ?? {}).slice(0, 4).map(([key, value]) => ({
    key: `context:${slugify(key)}`,
    label: key,
    value,
    kind: 'discrete',
  })) satisfies SimulationRuntimeControl[];
}

export function createSimulationRuntimeFromApparatus(options: CreateSimulationRuntimeFromApparatusOptions): SimulationRuntimeSnapshot {
  const activeRuntime = resolveActiveRuntime(options.apparatusIds, options.runtimeContext, options.activeApparatusId);
  const stateSummary = trimText(options.stateSummary)
    || (activeRuntime
      ? `${activeRuntime.name} · ${activeRuntime.phase} · 就绪 ${activeRuntime.readiness}%`
      : '运行态已接入');

  return createSimulationRuntimeSnapshot({
    playerId: options.playerId,
    source: options.source,
    phaseLabel: options.phaseLabel,
    phaseState: options.phaseState,
    stateSummary,
    progress: options.progress,
    focusTarget: options.focusTarget ?? activeRuntime?.name ?? '',
    focusLens: options.focusLens,
    observables: mergeChannels(options.observables, createObservablesFromActiveRuntime(activeRuntime)),
    controls: mergeChannels(options.controls, createControlsFromRuntimeContext(options.runtimeContext)),
    phases: options.phases,
    failureRisks: options.failureRisks,
    trace: options.trace,
  });
}
