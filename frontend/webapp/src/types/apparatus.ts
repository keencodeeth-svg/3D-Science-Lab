export type ApparatusSubject = '通用' | '物理' | '化学' | '生物';
export type ApparatusCategory = '容器' | '加热' | '支撑' | '转移' | '观察' | '电学' | '测量' | '生物';
export type ApparatusLevel = '低' | '中' | '高';
export type ApparatusInteraction =
  | '盛装'
  | '滴加'
  | '搅拌'
  | '加热'
  | '支撑固定'
  | '量取'
  | '集气'
  | '导电'
  | '接线'
  | '调阻'
  | '读数'
  | '显微观察'
  | '取样'
  | '培养'
  | '染色封片';

export interface ApparatusModelProfile {
  qualityTier: 'core' | 'pro' | 'hero';
  materialFocus: string[];
  animationFocus: string[];
  wearDetails: string[];
}

export interface ApparatusPhysicalProfile {
  transparency: ApparatusLevel;
  heatResistance: ApparatusLevel;
  conductivity: ApparatusLevel;
  precision: ApparatusLevel;
  supportsFluid: boolean;
  supportsOptics: boolean;
  supportsMotion: boolean;
}

export interface ApparatusChemicalProfile {
  acidResistance: ApparatusLevel;
  alkaliResistance: ApparatusLevel;
  solventResistance: ApparatusLevel;
  supportsHeatingReaction: boolean;
  supportsReactionObservation: boolean;
  supportsGasCollection: boolean;
}

export interface ApparatusBiologicalProfile {
  sterileReady: boolean;
  supportsSpecimen: boolean;
  supportsMicroscopy: boolean;
  supportsCulture: boolean;
  supportsStaining: boolean;
}

export interface ApparatusDefinition {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  category: ApparatusCategory;
  subjects: ApparatusSubject[];
  aliases: string[];
  reusable: boolean;
  sceneRoles: string[];
  stateSchema: string[];
  ports: string[];
  interactions: ApparatusInteraction[];
  reusableIn: string[];
  compatibleWith: string[];
  modelProfile: ApparatusModelProfile;
  physical: ApparatusPhysicalProfile;
  chemical: ApparatusChemicalProfile;
  biological: ApparatusBiologicalProfile;
}

export interface ApparatusMatch {
  apparatusId: string;
  matchedTerms: string[];
}

export interface ApparatusEngineSnapshot {
  selectedIds: string[];
  crossSubjectCount: number;
  engineScore: number;
  stateSchema: string[];
  ports: string[];
  interactions: ApparatusInteraction[];
  materialFocus: string[];
  qualityTier: 'core' | 'pro' | 'hero';
  physicalHighlights: string[];
  chemicalHighlights: string[];
  biologicalHighlights: string[];
}

export interface ApparatusMutationSuggestion {
  id: string;
  title: string;
  summary: string;
  engineValue: string;
  requiredIds: string[];
  controllables: string[];
  observables: string[];
  morphTargets: string[];
  subjects: ApparatusSubject[];
}

export type ApparatusRuntimePhase = 'idle' | 'staged' | 'active' | 'stable' | 'complete';
export type ApparatusRuntimeValue = string | number | boolean;

export interface ApparatusRenderBlueprint {
  anchor: string;
  parts: string[];
  materialChannels: string[];
  animationChannels: string[];
}

export interface ApparatusRuntimeContext {
  experimentId?: string;
  step?: number;
  progress?: number;
  completed?: boolean;
  focusId?: string | null;
  flags?: Record<string, boolean>;
  metrics?: Record<string, number>;
  values?: Record<string, ApparatusRuntimeValue>;
}

export interface ApparatusRuntimeInstance {
  instanceId: string;
  apparatusId: string;
  name: string;
  phase: ApparatusRuntimePhase;
  readiness: number;
  values: Record<string, ApparatusRuntimeValue>;
  badges: string[];
  stateChannels: string[];
  renderBlueprint: ApparatusRenderBlueprint;
}

export interface ApparatusRuntimeSnapshot {
  instances: ApparatusRuntimeInstance[];
  activeInstanceId: string | null;
  phaseCounts: Record<ApparatusRuntimePhase, number>;
}

