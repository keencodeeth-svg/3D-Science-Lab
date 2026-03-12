import type { MultiscaleLens } from '../types/experiment';

export type SimulationRuntimeValue = string | number | boolean;
export type SimulationRuntimeChannelStatus = 'nominal' | 'warning' | 'critical';
export type SimulationRuntimeControlKind = 'toggle' | 'slider' | 'dial' | 'discrete';
export type SimulationRuntimePhaseState = 'pending' | 'active' | 'completed';

export interface SimulationRuntimeChannel {
  key: string;
  label: string;
  value: SimulationRuntimeValue;
  unit?: string;
  status?: SimulationRuntimeChannelStatus;
}

export interface SimulationRuntimeControl extends SimulationRuntimeChannel {
  kind: SimulationRuntimeControlKind;
}

export interface SimulationRuntimePhase {
  key: string;
  label: string;
  state: SimulationRuntimePhaseState;
}

export interface SimulationRuntimeSnapshot {
  schemaVersion: 'simulation-runtime.v1';
  playerId: string;
  source: 'dedicated-player' | 'generic-player';
  phaseLabel: string;
  phaseState: SimulationRuntimePhaseState;
  stateSummary: string;
  progressPercent: number;
  focusTarget?: string;
  focusLens?: MultiscaleLens;
  observables: SimulationRuntimeChannel[];
  controls: SimulationRuntimeControl[];
  phases: SimulationRuntimePhase[];
  failureRisks: string[];
  trace: string[];
}

interface CreateSimulationRuntimeSnapshotOptions {
  playerId: string;
  source?: SimulationRuntimeSnapshot['source'];
  phaseLabel: string;
  phaseState?: SimulationRuntimePhaseState;
  stateSummary: string;
  progress?: number;
  focusTarget?: string | null;
  focusLens?: MultiscaleLens;
  observables?: SimulationRuntimeChannel[];
  controls?: SimulationRuntimeControl[];
  phases?: SimulationRuntimePhase[];
  failureRisks?: string[];
  trace?: string[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatNumber(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(value >= 10 ? 1 : 2).replace(/\.0$/, '');
}

function trimText(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTrace(values: string[] | undefined, limit = 4) {
  return [...new Set((values ?? []).map((value) => trimText(value)).filter(Boolean))].slice(0, limit);
}

function normalizeChannels<T extends SimulationRuntimeChannel>(values: T[] | undefined, limit = 6) {
  return (values ?? [])
    .map((item) => ({
      ...item,
      key: trimText(item.key),
      label: trimText(item.label),
      unit: trimText(item.unit),
    }))
    .filter((item) => item.key && item.label)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.key === item.key) === index)
    .slice(0, limit);
}

function normalizePhases(values: SimulationRuntimePhase[] | undefined, fallbackLabel: string) {
  const phases = (values ?? [])
    .map((phase) => ({
      key: trimText(phase.key),
      label: trimText(phase.label),
      state: phase.state,
    }))
    .filter((phase) => phase.key && phase.label);

  if (phases.length) return phases.slice(0, 8);

  return [{
    key: 'active-phase',
    label: fallbackLabel,
    state: 'active',
  }] satisfies SimulationRuntimePhase[];
}

export function formatSimulationRuntimeValue(value: SimulationRuntimeValue, unit = '') {
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') return `${formatNumber(value)}${unit}`;
  return `${value}${unit}`;
}

export function describeSimulationRuntimeChannels(channels: SimulationRuntimeChannel[] | undefined, limit = 3) {
  return (channels ?? [])
    .slice(0, limit)
    .map((item) => `${item.label} ${formatSimulationRuntimeValue(item.value, item.unit)}`);
}

export function createSimulationRuntimeSnapshot(options: CreateSimulationRuntimeSnapshotOptions): SimulationRuntimeSnapshot {
  const progress = typeof options.progress === 'number' ? clamp(options.progress, 0, 1) : 0;
  const phaseLabel = trimText(options.phaseLabel) || '运行中';

  return {
    schemaVersion: 'simulation-runtime.v1',
    playerId: trimText(options.playerId) || 'simulation-player',
    source: options.source ?? 'dedicated-player',
    phaseLabel,
    phaseState: options.phaseState ?? (progress >= 1 ? 'completed' : progress > 0 ? 'active' : 'pending'),
    stateSummary: trimText(options.stateSummary) || '运行态已接入',
    progressPercent: Math.round(progress * 100),
    focusTarget: trimText(options.focusTarget),
    focusLens: options.focusLens,
    observables: normalizeChannels(options.observables),
    controls: normalizeChannels(options.controls),
    phases: normalizePhases(options.phases, phaseLabel),
    failureRisks: normalizeTrace(options.failureRisks, 5),
    trace: normalizeTrace(options.trace),
  };
}

export function describeSimulationRuntime(snapshot: SimulationRuntimeSnapshot | null | undefined) {
  if (!snapshot) return '';

  const observableSummary = describeSimulationRuntimeChannels(snapshot.observables, 2).join(' · ');
  return [snapshot.phaseLabel, snapshot.stateSummary, observableSummary].filter(Boolean).join(' · ');
}
