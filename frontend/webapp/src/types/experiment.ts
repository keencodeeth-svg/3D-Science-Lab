export type ExperimentMode = '引导' | '练习' | '考核';
export type EducationStage = '小学' | '初中' | '高中';
export type ExperimentSubject = '科学' | '物理' | '化学' | '生物';
export type ProductStatus = '规划中' | '开发中' | '试点可用' | '产品级';
export type InteractionMode = '观察型' | '半交互' | '全交互';

export interface ExperimentScene {
  environment: string;
  cameraPreset: string;
  assets: string[];
}

export interface ExperimentEquipment {
  id: string;
  name: string;
  type: string;
  optional?: boolean;
}

export type MultiscaleLens = 'macro' | 'meso' | 'micro';
export type MaterialState = 'solid' | 'liquid' | 'gas' | 'mixed';
export type MicroArrangement = 'lattice' | 'cluster' | 'flow' | 'solution' | 'gas' | 'chain' | 'network';

export interface ExperimentEquipmentComponent {
  id: string;
  name: string;
  role: string;
  materialRef?: string;
}

export interface ExperimentEquipmentProfile {
  equipmentId: string;
  physicalGroup: string;
  constraints: string[];
  components: ExperimentEquipmentComponent[];
}

export interface ExperimentMaterialProperty {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
}

export interface ExperimentMicroSpecies {
  id: string;
  name: string;
  formula?: string;
  color: string;
  particleCountHint: number;
  arrangement: MicroArrangement;
}

export interface ExperimentMicroModel {
  narrative: string;
  species: ExperimentMicroSpecies[];
  interactions: string[];
}

export interface ExperimentMaterialModel {
  id: string;
  name: string;
  category: string;
  formula?: string;
  state: MaterialState;
  properties: ExperimentMaterialProperty[];
  microModel?: ExperimentMicroModel;
}

export interface ExperimentReactionRule {
  id: string;
  when: string;
  observe: string;
  microNarrative: string;
  materialRefs?: string[];
}

export interface ExperimentMultiscaleModel {
  defaultLens: MultiscaleLens;
  equipmentProfiles: ExperimentEquipmentProfile[];
  materials: ExperimentMaterialModel[];
  reactionRules: ExperimentReactionRule[];
}

export interface ExperimentStep {
  id: string;
  order: number;
  title: string;
  description?: string;
  actionType:
    | 'identify-object'
    | 'place-object'
    | 'connect-wire'
    | 'add-material'
    | 'heat-object'
    | 'adjust-focus'
    | 'switch-view'
    | 'record-observation'
    | 'set-variable'
    | 'complete-summary';
  targetObject: string;
  successCondition: string;
  failureHints: string[];
  scoringWeight: number;
  requiredCapabilities?: string[];
}

export interface ExperimentScoring {
  stepScorePercent: number;
  observationScorePercent: number;
  resultScorePercent: number;
}

export interface ExperimentFeedback {
  successSummary: string;
  commonMistakes: string[];
}

export interface ExperimentCurriculum {
  theme: string;
  unit: string;
  knowledgePoints: string[];
}

export interface ExperimentProductization {
  status: ProductStatus;
  interactionMode: InteractionMode;
  assessmentReady: boolean;
  teacherReady: boolean;
  assetsReady: boolean;
}

export interface ExperimentConfig {
  id: string;
  title: string;
  stage: EducationStage;
  subject: ExperimentSubject;
  grade: string;
  durationMinutes: number;
  modes: ExperimentMode[];
  scene: ExperimentScene;
  curriculum: ExperimentCurriculum;
  productization: ExperimentProductization;
  objectives: string[];
  equipment: ExperimentEquipment[];
  steps: ExperimentStep[];
  scoring: ExperimentScoring;
  feedback: ExperimentFeedback;
  capabilities: string[];
  multiscale?: ExperimentMultiscaleModel;
}

export interface ExperimentIndexItem {
  id: string;
  title: string;
  stage: EducationStage;
  subject: ExperimentSubject;
  grade: string;
  durationMinutes: number;
  modes: ExperimentMode[];
  curriculumTheme: string;
  productStatus: ProductStatus;
  interactionMode: InteractionMode;
  assessmentReady: boolean;
  teacherReady: boolean;
  assetsReady: boolean;
  multiscaleSummary: {
    source: 'configured' | 'derived';
    defaultLens: MultiscaleLens;
    materialCount: number;
    speciesCount: number;
    reactionRuleCount: number;
    componentCount: number;
  };
  dataFile: string;
}
