import { useEffect, useMemo, useState } from 'react';
import { useLabTelemetryReporter } from '../hooks/useLabTelemetryReporter';
import { getRecommendedApparatusIds } from '../lib/apparatusEngine';
import type { LabTelemetryInput } from '../lib/labTelemetry';
import { createSimulationRuntimeFromApparatus } from '../lib/simulationRuntimeAdapter';
import type { SimulationRuntimeSnapshot } from '../lib/simulationRuntime';
import type { ApparatusRuntimeContext } from '../types/apparatus';
import type { ExperimentConfig, ExperimentEquipment, ExperimentStep } from '../types/experiment';

type PromptTone = 'info' | 'success' | 'error';
type SceneMode = 'bench' | 'focus' | 'detail';
type InsightTone = 'calm' | 'active' | 'warn';
type TimelineState = 'done' | 'current' | 'todo';

interface GenericLabPlayerProps {
  experiment: ExperimentConfig;
  onTelemetry?: (event: LabTelemetryInput) => void;
  onSimulationRuntimeChange?: (snapshot: SimulationRuntimeSnapshot | null) => void;
}

interface StepChoice {
  id: string;
  label: string;
  detail: string;
  tone: 'primary' | 'secondary' | 'danger';
  kind: 'correct' | 'incorrect';
}

interface ReadoutCard {
  label: string;
  value: string;
  note: string;
  tone: InsightTone;
}

interface ObservationChip {
  label: string;
  detail: string;
  tone: InsightTone;
}

interface TimelineEntry {
  title: string;
  detail: string;
  state: TimelineState;
}

const actionLabels: Record<ExperimentStep['actionType'], string> = {
  'identify-object': '器材识别',
  'place-object': '器材摆放',
  'connect-wire': '连接搭建',
  'add-material': '材料加入',
  'heat-object': '加热控制',
  'adjust-focus': '调焦观察',
  'switch-view': '视角切换',
  'record-observation': '观察记录',
  'set-variable': '变量控制',
  'complete-summary': '结论总结',
};

const subjectThemeClass: Record<ExperimentConfig['subject'], string> = {
  科学: 'science',
  物理: 'physics',
  化学: 'chemistry',
  生物: 'biology',
};

const sceneModeLabels: Record<SceneMode, string> = {
  bench: '实验台',
  focus: '聚焦',
  detail: '细节',
};

function getEquipmentVisualKind(equipment: ExperimentEquipment) {
  const type = equipment.type.toLowerCase();
  const name = equipment.name.toLowerCase();

  if (type.includes('meter') || name.includes('计') || name.includes('表')) return 'meter';
  if (type.includes('container') || type.includes('collector') || name.includes('烧杯') || name.includes('试管') || name.includes('锥形瓶') || name.includes('量筒') || name.includes('蒸发皿')) return 'container';
  if (type.includes('heating') || type.includes('light') || name.includes('酒精灯') || name.includes('蜡烛') || name.includes('光源')) return 'heat';
  if (type.includes('power') || type.includes('connector') || type.includes('load') || type.includes('control')) return 'circuit';
  if (type.includes('instrument') || type.includes('optical') || name.includes('显微镜')) return 'instrument';
  if (type.includes('optics') || type.includes('透镜') || type.includes('接收屏') || type.includes('支撑装置')) return 'optics';
  if (type.includes('sample') || type.includes('material') || type.includes('solution')) return 'sample';
  if (type.includes('magnet')) return 'magnet';
  return 'support';
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildStepLabels(experiment: ExperimentConfig) {
  return Object.fromEntries(experiment.steps.map((step) => [step.order, step.title])) as Record<number, string>;
}

function findFocusLabel(step: ExperimentStep, experiment: ExperimentConfig) {
  const directMatch = experiment.equipment.find(
    (equipment) => step.targetObject.includes(equipment.id) || step.title.includes(equipment.name) || (step.description ?? '').includes(equipment.name),
  );
  return directMatch?.name ?? experiment.equipment[0]?.name ?? '核心器材';
}

function findFocusEquipment(step: ExperimentStep, experiment: ExperimentConfig) {
  return experiment.equipment.find(
    (equipment) => step.targetObject.includes(equipment.id) || step.title.includes(equipment.name) || (step.description ?? '').includes(equipment.name),
  ) ?? experiment.equipment[0] ?? null;
}

function getInitialPrompt(experiment: ExperimentConfig) {
  return experiment.steps[0]?.description ?? '请从当前步骤开始。';
}

function getInitialNotes(experiment: ExperimentConfig) {
  return [`已载入 ${experiment.curriculum.unit}，先检查器材，再开始当前步骤。`];
}

function buildVariableOptions(step: ExperimentStep) {
  const content = `${step.title} ${step.description ?? ''}`;

  if (content.includes('温度')) return ['低温', '标准温度', '加热'];
  if (content.includes('角')) return ['小角度', '标准角', '大角度'];
  if (content.includes('浓度')) return ['低浓度', '标准浓度', '高浓度'];
  if (content.includes('深度')) return ['浅层', '标准深度', '深层'];
  if (content.includes('质量')) return ['轻载', '标准质量', '重载'];
  if (content.includes('力')) return ['小拉力', '标准拉力', '大拉力'];
  if (content.includes('速度') || content.includes('滴定')) return ['过快', '标准速度', '精细慢滴'];
  if (content.includes('水分')) return ['缺水', '适量水分', '过量水分'];
  return ['对照条件', '标准条件', '增强条件'];
}

function buildStepChoices(step: ExperimentStep, experiment: ExperimentConfig): StepChoice[] {
  const focusLabel = findFocusLabel(step, experiment);
  const defaultHint = step.failureHints[0] ?? '当前操作不符合实验规范。';

  switch (step.actionType) {
    case 'record-observation':
      return [
        { id: 'observe-correct', label: `记录 ${step.title}`, detail: `围绕 ${focusLabel} 完成规范观察并提交。`, tone: 'primary', kind: 'correct' },
        { id: 'observe-skip', label: '跳过观察', detail: defaultHint, tone: 'danger', kind: 'incorrect' },
        { id: 'observe-wrong', label: '记录错误现象', detail: step.failureHints[1] ?? defaultHint, tone: 'secondary', kind: 'incorrect' },
      ];
    case 'set-variable':
      return buildVariableOptions(step).map((option, index) => ({
        id: `variable-${option}`,
        label: option,
        detail: index === 1 ? `将 ${focusLabel} 调整到当前步骤推荐条件。` : step.failureHints[index - 1] ?? '这会影响实验结果，注意判断是否合理。',
        tone: index === 1 ? 'primary' : index === 2 ? 'secondary' : 'danger',
        kind: index === 1 ? 'correct' : 'incorrect',
      }));
    case 'complete-summary':
      return [
        { id: 'summary-correct', label: '提交正确结论', detail: experiment.feedback.successSummary, tone: 'primary', kind: 'correct' },
        { id: 'summary-mistake-a', label: '忽略关键变量', detail: experiment.feedback.commonMistakes[0] ?? defaultHint, tone: 'danger', kind: 'incorrect' },
        { id: 'summary-mistake-b', label: '只写现象不写规律', detail: step.failureHints[0] ?? defaultHint, tone: 'secondary', kind: 'incorrect' },
      ];
    case 'switch-view':
      return [
        { id: 'view-correct', label: '切换到正确视角', detail: `围绕 ${focusLabel} 切换到本步骤需要的观察视角。`, tone: 'primary', kind: 'correct' },
        { id: 'view-wrong', label: '停留在当前视角', detail: defaultHint, tone: 'danger', kind: 'incorrect' },
      ];
    case 'adjust-focus':
      return [
        { id: 'focus-correct', label: '细调获得清晰画面', detail: `围绕 ${focusLabel} 完成清晰观察。`, tone: 'primary', kind: 'correct' },
        { id: 'focus-wrong', label: '调焦过度', detail: defaultHint, tone: 'danger', kind: 'incorrect' },
      ];
    case 'heat-object':
      return [
        { id: 'heat-correct', label: '稳定加热', detail: `围绕 ${focusLabel} 保持规范加热并持续观察。`, tone: 'primary', kind: 'correct' },
        { id: 'heat-high', label: '火力过大', detail: step.failureHints[0] ?? defaultHint, tone: 'danger', kind: 'incorrect' },
        { id: 'heat-stop', label: '中途停止', detail: '加热过程不连续会影响现象判断。', tone: 'secondary', kind: 'incorrect' },
      ];
    case 'add-material':
      return [
        { id: 'add-correct', label: '按顺序加入', detail: `围绕 ${focusLabel} 按步骤要求加入材料。`, tone: 'primary', kind: 'correct' },
        { id: 'add-over', label: '加入过量', detail: step.failureHints[0] ?? defaultHint, tone: 'danger', kind: 'incorrect' },
        { id: 'add-mixed', label: '顺序错误', detail: '加料顺序会直接影响实验结果。', tone: 'secondary', kind: 'incorrect' },
      ];
    default:
      return [
        { id: 'action-correct', label: actionLabels[step.actionType], detail: `围绕 ${focusLabel} 执行当前步骤要求。`, tone: 'primary', kind: 'correct' },
        { id: 'action-wrong', label: '触发常见错误', detail: defaultHint, tone: 'danger', kind: 'incorrect' },
      ];
  }
}

function deriveVariableBias(activeVariable: string) {
  if (['加热', '高浓度', '大角度', '深层', '重载', '大拉力', '增强条件'].some((item) => activeVariable.includes(item))) return 1;
  if (['低温', '低浓度', '小角度', '浅层', '轻载', '小拉力', '缺水', '过快', '对照条件'].some((item) => activeVariable.includes(item))) return -1;
  return 0;
}

function buildFocusSpotlight(experiment: ExperimentConfig, step: ExperimentStep, focusLabel: string, activeVariable: string, sceneMode: SceneMode) {
  switch (experiment.subject) {
    case '化学':
      return {
        title: `${focusLabel} · 反应过程监看`,
        detail: `${sceneModeLabels[sceneMode]}下重点关注液面颜色、气泡与终点信号，当前变量为 ${activeVariable}。`,
      };
    case '物理':
      return {
        title: `${focusLabel} · 读数与变量对照`,
        detail: `围绕 ${step.title} 比较刻度、角度或深度变化，当前使用 ${activeVariable} 条件。`,
      };
    case '生物':
      return {
        title: `${focusLabel} · 样本观察窗口`,
        detail: `当前需要在 ${sceneModeLabels[sceneMode]}中关注样本清晰度、对照差异与关键组织表现。`,
      };
    default:
      return {
        title: `${focusLabel} · 现象对比区`,
        detail: `围绕 ${step.title} 观察宏观现象变化，并把 ${activeVariable} 条件和记录结果对应起来。`,
      };
  }
}

function buildReadoutCards(
  experiment: ExperimentConfig,
  step: ExperimentStep,
  activeVariable: string,
  stepIndex: number,
  errors: number,
  clarityValue: number,
  safetyValue: number,
  stabilityValue: number,
): ReadoutCard[] {
  const variableBias = deriveVariableBias(activeVariable);

  switch (experiment.subject) {
    case '化学': {
      const temperature = 24 + stepIndex * 5 + variableBias * 9;
      const reactionState = step.actionType === 'heat-object' || activeVariable.includes('加热') ? '气泡增强' : errors > 1 ? '反应偏乱' : '反应平稳';
      const colorState = step.actionType === 'record-observation' ? '颜色可判' : step.actionType === 'complete-summary' ? '终点已锁定' : '颜色渐显';
      return [
        { label: '反应温度', value: `${temperature}℃`, note: variableBias > 0 ? '变量提升后反应更明显。' : '当前温度适合稳定观察。', tone: variableBias > 0 ? 'active' : 'calm' },
        { label: '液面信号', value: `${reactionState} · ${colorState}`, note: '观察颜色、气泡或沉淀变化，再做判断。', tone: errors > 1 ? 'warn' : 'active' },
        { label: '安全监看', value: `${safetyValue}%`, note: '始终先保证加热与加料顺序的规范性。', tone: safetyValue < 60 ? 'warn' : 'calm' },
      ];
    }
    case '物理': {
      const measureValue = step.title.includes('深度') ? `${18 + stepIndex * 7 + variableBias * 8} cm` : `${12 + stepIndex * 4 + variableBias * 5}`;
      const errorBand = `${Math.max(1, 6 - Math.min(errors, 4))} 格`;
      return [
        { label: '当前读数', value: measureValue, note: '读数前先固定视角，再比较变量变化。', tone: 'active' },
        { label: '稳定误差', value: errorBand, note: `稳定值 ${stabilityValue}% · 变量 ${activeVariable}`, tone: stabilityValue < 55 ? 'warn' : 'calm' },
        { label: '观察清晰度', value: `${clarityValue}%`, note: step.actionType === 'switch-view' ? '切换合适视角能显著降低误差。' : '聚焦刻度与对照数据再记录。', tone: clarityValue < 60 ? 'warn' : 'active' },
      ];
    }
    case '生物': {
      const sampleState = step.actionType === 'adjust-focus' ? '结构渐清晰' : step.actionType === 'record-observation' ? '特征可记录' : '样本准备中';
      const controlGap = errors > 1 ? '对照差异未锁定' : '实验组 / 对照组差异可见';
      return [
        { label: '样本状态', value: sampleState, note: '优先让样本清晰，再记录细胞或叶片特征。', tone: clarityValue < 60 ? 'warn' : 'active' },
        { label: '对照比较', value: controlGap, note: `当前变量 ${activeVariable} · 便于解释现象来源。`, tone: errors > 1 ? 'warn' : 'calm' },
        { label: '观察质量', value: `${clarityValue}%`, note: '先聚焦，再判断颜色、结构或萌发差异。', tone: clarityValue < 58 ? 'warn' : 'active' },
      ];
    }
    default: {
      const phenomenonState = errors > 1 ? '现象断续' : step.actionType === 'record-observation' ? '现象明显' : '现象形成中';
      return [
        { label: '现象强度', value: phenomenonState, note: `${sceneModeLabels.bench}和${sceneModeLabels.detail}可帮助完成对比。`, tone: errors > 1 ? 'warn' : 'active' },
        { label: '条件状态', value: activeVariable, note: '切换变量时要同步观察材料变化。', tone: 'calm' },
        { label: '记录准备度', value: `${stabilityValue}%`, note: '先看现象，再归纳结论，避免只背答案。', tone: stabilityValue < 55 ? 'warn' : 'active' },
      ];
    }
  }
}

function buildObservationChips(
  experiment: ExperimentConfig,
  step: ExperimentStep,
  activeVariable: string,
  errors: number,
  sceneMode: SceneMode,
): ObservationChip[] {
  switch (experiment.subject) {
    case '化学':
      return [
        { label: '反应状态', detail: step.actionType === 'heat-object' ? '气泡与液面变化更活跃' : '液面变化正在形成', tone: 'active' },
        { label: '变量控制', detail: `${activeVariable} · 继续关注颜色与终点`, tone: 'calm' },
        { label: '风险提醒', detail: errors > 1 ? '操作顺序需要纠正' : '当前安全状态较稳', tone: errors > 1 ? 'warn' : 'calm' },
      ];
    case '物理':
      return [
        { label: '读数窗口', detail: `${sceneModeLabels[sceneMode]}已启用，继续盯住刻度变化`, tone: 'active' },
        { label: '变量维度', detail: `${activeVariable} · 注意保持其余条件不变`, tone: 'calm' },
        { label: '误差控制', detail: errors > 1 ? '先稳定装置再记录' : '当前误差可控', tone: errors > 1 ? 'warn' : 'calm' },
      ];
    case '生物':
      return [
        { label: '样本细节', detail: sceneMode === 'focus' ? '显微或局部细节更清晰' : '可切换聚焦观察', tone: 'active' },
        { label: '对照关系', detail: '始终比较实验组与对照组差异', tone: 'calm' },
        { label: '记录提醒', detail: errors > 1 ? '先纠正步骤顺序，再记录现象' : '现象和结论需要一一对应', tone: errors > 1 ? 'warn' : 'calm' },
      ];
    default:
      return [
        { label: '现象窗口', detail: '重点比较材料变化、方向、长度或状态差异', tone: 'active' },
        { label: '当前条件', detail: `${activeVariable} · 继续完成对照记录`, tone: 'calm' },
        { label: '提示', detail: errors > 1 ? '先修正错误再继续观察' : '记录时先写现象再写结论', tone: errors > 1 ? 'warn' : 'calm' },
      ];
  }
}

function buildRecoveryList(experiment: ExperimentConfig, step: ExperimentStep, focusLabel: string, activeVariable: string, errors: number) {
  if (errors === 0) {
    return [
      `先围绕 ${focusLabel} 完成当前动作，再进入下一步。`,
      `当前变量是 ${activeVariable}，保持其余条件尽量稳定。`,
      '观察记录优先写现象，其次再概括规律。',
    ];
  }

  return [
    step.failureHints[0] ?? '请先回到本步骤要求，修正当前错误。',
    experiment.feedback.commonMistakes[Math.min(errors - 1, experiment.feedback.commonMistakes.length - 1)] ?? '请检查操作顺序和观察依据。',
    `建议先查看 ${focusLabel} 的状态，再重新进行 ${actionLabels[step.actionType]}。`,
  ];
}

function buildTimeline(experiment: ExperimentConfig, stepIndex: number, completed: boolean): TimelineEntry[] {
  return experiment.steps.map((step, index) => {
    const state: TimelineState = completed || index < stepIndex ? 'done' : index === stepIndex ? 'current' : 'todo';
    const detail = state === 'done'
      ? `已完成 · ${actionLabels[step.actionType]}`
      : state === 'current'
        ? `进行中 · ${actionLabels[step.actionType]}`
        : `待完成 · ${actionLabels[step.actionType]}`;

    return {
      title: step.title,
      detail,
      state,
    };
  });
}

function buildEquipmentStatus(
  equipment: ExperimentEquipment,
  focusLabel: string,
  inspectedEquipmentIds: string[],
  currentStep: ExperimentStep,
): string {
  if (focusLabel === equipment.name) return '当前核心';
  if (inspectedEquipmentIds.includes(equipment.id)) return currentStep.actionType === 'record-observation' ? '已观察' : '已检查';
  return '待检查';
}

function getEquipmentStationLabel(equipment: ExperimentEquipment) {
  switch (getEquipmentVisualKind(equipment)) {
    case 'meter':
      return '读数站';
    case 'container':
      return '容器站';
    case 'heat':
      return '加热站';
    case 'circuit':
      return '回路站';
    case 'instrument':
      return '观察站';
    case 'optics':
      return '光学站';
    case 'sample':
      return '样本站';
    case 'magnet':
      return '磁效站';
    default:
      return '支撑站';
  }
}

function getPreferredApparatusIds(
  equipment: ExperimentEquipment | null,
  subject: ExperimentConfig['subject'],
) {
  if (!equipment) return ['support-stand', 'beaker'];

  const content = `${equipment.name} ${equipment.type}`.toLowerCase();

  switch (getEquipmentVisualKind(equipment)) {
    case 'meter':
      return ['meter-set', 'resistor-board', 'wire-set'];
    case 'container':
      if (content.includes('试管')) return ['test-tube', 'beaker'];
      if (content.includes('锥形瓶')) return ['erlenmeyer-flask', 'beaker'];
      if (content.includes('量筒')) return ['measuring-cylinder', 'beaker'];
      return ['beaker', 'test-tube'];
    case 'heat':
      return ['alcohol-burner', 'support-stand'];
    case 'circuit':
      if (content.includes('电池') || content.includes('电源')) return ['battery-pack', 'wire-set'];
      if (content.includes('开关')) return ['switch-module', 'wire-set'];
      if (content.includes('灯')) return ['bulb-module', 'wire-set'];
      if (content.includes('变阻')) return ['rheostat', 'resistor-board', 'wire-set'];
      if (content.includes('电阻')) return ['resistor-board', 'wire-set'];
      return ['wire-set', 'switch-module'];
    case 'instrument':
      return ['microscope', 'slide-kit'];
    case 'sample':
      return subject === '生物' ? ['slide-kit', 'tweezers', 'dropper-pipette'] : ['dropper-pipette', 'beaker'];
    case 'optics':
      return ['support-stand', 'meter-set'];
    default:
      return ['support-stand', 'beaker'];
  }
}

function resolveGenericActiveApparatusId(
  apparatusIds: string[],
  equipment: ExperimentEquipment | null,
  subject: ExperimentConfig['subject'],
) {
  if (!apparatusIds.length) return null;
  const preferredIds = getPreferredApparatusIds(equipment, subject);
  return preferredIds.find((id) => apparatusIds.includes(id)) ?? apparatusIds[0];
}

function buildStageConsoleCopy(
  experiment: ExperimentConfig,
  step: ExperimentStep,
  equipment: ExperimentEquipment | null,
  equipmentStatus: string,
  activeVariable: string,
  sceneMode: SceneMode,
) {
  const equipmentName = equipment?.name ?? '当前器材';

  switch (experiment.subject) {
    case '化学':
      return `${equipmentName} 处于${equipmentStatus}，当前按 ${activeVariable} 条件观察液面、颜色或终点信号，并在 ${sceneModeLabels[sceneMode]} 里保持加料与加热顺序。`;
    case '物理':
      return `${equipmentName} 处于${equipmentStatus}，围绕 ${step.title} 稳定视角后再记录读数，当前变量为 ${activeVariable}。`;
    case '生物':
      return `${equipmentName} 处于${equipmentStatus}，先保证样本清晰，再比较实验组与对照组差异，当前条件为 ${activeVariable}。`;
    default:
      return `${equipmentName} 处于${equipmentStatus}，继续围绕 ${step.title} 比较现象变化，并把 ${activeVariable} 条件与记录内容对应起来。`;
  }
}

export function GenericLabPlayer({ experiment, onTelemetry, onSimulationRuntimeChange }: GenericLabPlayerProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [errors, setErrors] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [promptTone, setPromptTone] = useState<PromptTone>('info');
  const [promptMessage, setPromptMessage] = useState(getInitialPrompt(experiment));
  const [sceneMode, setSceneMode] = useState<SceneMode>('bench');
  const [inspectedEquipmentIds, setInspectedEquipmentIds] = useState<string[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>(() => experiment.equipment[0]?.id ?? '');
  const [activeVariable, setActiveVariable] = useState('标准条件');
  const [labNotes, setLabNotes] = useState<string[]>(getInitialNotes(experiment));

  const totalSteps = experiment.steps.length;
  const currentStep = experiment.steps[Math.min(stepIndex, totalSteps - 1)];
  const stepLabels = useMemo(() => buildStepLabels(experiment), [experiment]);
  const focusLabel = useMemo(() => findFocusLabel(currentStep, experiment), [currentStep, experiment]);
  const stepChoices = useMemo(() => buildStepChoices(currentStep, experiment), [currentStep, experiment]);

  const progressPercent = completed ? 100 : Math.round((stepIndex / totalSteps) * 100);
  const variableBias = deriveVariableBias(activeVariable);
  const safetyValue = clamp(96 - errors * 7 - (currentStep.actionType === 'heat-object' || variableBias > 0 ? 7 : 0), 40, 98);
  const stabilityValue = clamp(46 + stepIndex * 10 + inspectedEquipmentIds.length * 4 - errors * 5 + (sceneMode === 'bench' ? 4 : 0), 30, 99);
  const clarityValue = clamp(42 + stepIndex * 8 + (sceneMode === 'focus' ? 12 : 0) + (sceneMode === 'detail' ? 6 : 0) + (currentStep.actionType === 'adjust-focus' ? 10 : 0), 28, 99);
  const readinessValue = clamp(progressPercent + Math.round(score * 0.45) + (completed ? 22 : 14), 20, 100);

  const spotlight = useMemo(
    () => buildFocusSpotlight(experiment, currentStep, focusLabel, activeVariable, sceneMode),
    [activeVariable, currentStep, experiment, focusLabel, sceneMode],
  );
  const readoutCards = useMemo(
    () => buildReadoutCards(experiment, currentStep, activeVariable, stepIndex, errors, clarityValue, safetyValue, stabilityValue),
    [activeVariable, clarityValue, currentStep, errors, experiment, safetyValue, stabilityValue, stepIndex],
  );
  const observationChips = useMemo(
    () => buildObservationChips(experiment, currentStep, activeVariable, errors, sceneMode),
    [activeVariable, currentStep, errors, experiment, sceneMode],
  );
  const recoveryList = useMemo(
    () => buildRecoveryList(experiment, currentStep, focusLabel, activeVariable, errors),
    [activeVariable, currentStep, errors, experiment, focusLabel],
  );
  const timeline = useMemo(() => buildTimeline(experiment, stepIndex, completed), [completed, experiment, stepIndex]);
  const selectedEquipment = useMemo(
    () => experiment.equipment.find((equipment) => equipment.id === selectedEquipmentId) ?? findFocusEquipment(currentStep, experiment),
    [currentStep, experiment, selectedEquipmentId],
  );
  const genericApparatusIds = useMemo(() => getRecommendedApparatusIds(experiment), [experiment]);
  const selectedEquipmentStatus = useMemo(
    () => (selectedEquipment ? buildEquipmentStatus(selectedEquipment, focusLabel, inspectedEquipmentIds, currentStep) : '待检查'),
    [currentStep, focusLabel, inspectedEquipmentIds, selectedEquipment],
  );
  const stageSignals = useMemo(
    () => [
      {
        label: 'Scene',
        value: sceneModeLabels[sceneMode],
        detail: `${actionLabels[currentStep.actionType]} · ${activeVariable}`,
        tone: (sceneMode === 'focus' || sceneMode === 'detail' ? 'active' : 'calm') as InsightTone,
      },
      ...readoutCards.slice(0, 2).map((card) => ({
        label: card.label,
        value: card.value,
        detail: card.note,
        tone: card.tone,
      })),
    ],
    [activeVariable, currentStep.actionType, readoutCards, sceneMode],
  );
  const stageConsoleCopy = useMemo(
    () => buildStageConsoleCopy(experiment, currentStep, selectedEquipment, selectedEquipmentStatus, activeVariable, sceneMode),
    [activeVariable, currentStep, experiment, sceneMode, selectedEquipment, selectedEquipmentStatus],
  );
  const genericActiveApparatusId = useMemo(
    () => resolveGenericActiveApparatusId(genericApparatusIds, selectedEquipment, experiment.subject),
    [experiment.subject, genericApparatusIds, selectedEquipment],
  );
  const genericRuntimeContext = useMemo<ApparatusRuntimeContext>(() => {
    const observationStage = currentStep.actionType === 'record-observation' || currentStep.actionType === 'complete-summary';
    const hasOpticsStack = genericApparatusIds.includes('microscope') || genericApparatusIds.includes('slide-kit');
    const hasCircuitStack = genericApparatusIds.includes('wire-set') || genericApparatusIds.includes('meter-set') || genericApparatusIds.includes('battery-pack');
    const hasReactionStack = genericApparatusIds.includes('beaker') || genericApparatusIds.includes('test-tube') || genericApparatusIds.includes('electrode-set');

    return {
      experimentId: experiment.id,
      step: Math.min(stepIndex + 1, totalSteps),
      progress: completed ? 1 : progressPercent / 100,
      completed,
      focusId: genericActiveApparatusId,
      flags: {
        deviceReady: readinessValue >= 55,
        macroObserved: observationStage || sceneMode !== 'bench' || completed,
        reactionObserved: hasReactionStack && (observationStage || currentStep.actionType === 'heat-object' || completed),
        solutionReady: hasReactionStack && (currentStep.actionType === 'add-material' || stepIndex > 0 || inspectedEquipmentIds.length > 0),
        mainCircuitReady: hasCircuitStack && (stepIndex > 0 || inspectedEquipmentIds.length >= Math.min(2, experiment.equipment.length)),
        currentFlowing: hasCircuitStack && stepIndex > 0 && currentStep.actionType !== 'identify-object',
        meterConnected: genericApparatusIds.includes('meter-set') && (observationStage || currentStep.actionType === 'set-variable' || selectedEquipmentStatus === '当前核心'),
        metersReady: genericApparatusIds.includes('meter-set') && (stabilityValue >= 60 || observationStage || completed),
        switchClosed: genericApparatusIds.includes('switch-module') && (currentStep.actionType === 'set-variable' || observationStage || completed),
        readingStable: stabilityValue >= 68 || observationStage || completed,
        lightReady: hasOpticsStack && (sceneMode !== 'bench' || clarityValue >= 55),
        slidePicked: genericApparatusIds.includes('slide-kit') && inspectedEquipmentIds.length > 0,
        slidePlaced: genericApparatusIds.includes('slide-kit') && (currentStep.actionType === 'adjust-focus' || observationStage || completed),
        focusReady: clarityValue >= 68 || sceneMode === 'focus' || observationStage || completed,
        electrodePlaced: genericApparatusIds.includes('electrode-set') && (currentStep.actionType === 'add-material' || stepIndex > 0),
        saltBridgePlaced: genericApparatusIds.includes('salt-bridge') && (currentStep.actionType === 'place-object' || stepIndex > 0),
      },
      metrics: {
        clarity: clarityValue,
        safety: safetyValue,
        stability: stabilityValue,
        readiness: readinessValue,
        score,
        observationCount: inspectedEquipmentIds.length,
        measurementCount: Math.max(0, stepIndex + (observationStage ? 1 : 0)),
        reactionProgressPercent: completed ? 100 : clamp(progressPercent + (sceneMode === 'detail' ? 6 : 0) + (sceneMode === 'focus' ? 10 : 0), 0, 99),
        lightLevel: clarityValue,
        blur: clamp(100 - clarityValue, 0, 100),
        connectionCount: experiment.subject === '物理' ? inspectedEquipmentIds.length : 0,
        placedPartCount: inspectedEquipmentIds.length,
      },
      values: {
        selectedInstrument: selectedEquipment?.name ?? focusLabel,
        layout: sceneModeLabels[sceneMode],
        objective: sceneMode === 'focus' ? '高精聚焦' : sceneMode === 'detail' ? '局部细看' : '全台观察',
        clarity: `${clarityValue}%`,
        solution: experiment.subject === '化学' ? activeVariable : '待观察',
        stainState: experiment.subject === '生物' ? activeVariable : '未使用',
        meterMode: observationStage ? '记录模式' : '操作模式',
        resistanceQuality: stabilityValue >= 78 ? '稳定' : stabilityValue >= 60 ? '可用' : '波动',
      },
    };
  }, [
    activeVariable,
    clarityValue,
    completed,
    currentStep.actionType,
    experiment.equipment.length,
    experiment.id,
    experiment.subject,
    focusLabel,
    genericActiveApparatusId,
    genericApparatusIds,
    inspectedEquipmentIds.length,
    progressPercent,
    readinessValue,
    safetyValue,
    sceneMode,
    score,
    selectedEquipment?.name,
    selectedEquipmentStatus,
    stabilityValue,
    stepIndex,
    totalSteps,
  ]);
  const genericSimulationRuntime = useMemo(
    () => createSimulationRuntimeFromApparatus({
      playerId: 'generic-lab-player',
      source: 'generic-player',
      apparatusIds: genericApparatusIds,
      runtimeContext: genericRuntimeContext,
      activeApparatusId: genericActiveApparatusId,
      phaseLabel: currentStep.title,
      phaseState: completed ? 'completed' : stepIndex > 0 || inspectedEquipmentIds.length > 0 ? 'active' : 'pending',
      progress: completed ? 1 : progressPercent / 100,
      focusTarget: selectedEquipment?.name ?? focusLabel,
      stateSummary: `${sceneModeLabels[sceneMode]} · ${actionLabels[currentStep.actionType]} · ${selectedEquipment?.name ?? focusLabel} · 清晰度 ${clarityValue}%`,
      observables: [
        { key: 'runtime-progress', label: '实验进度', value: progressPercent, unit: '%', status: progressPercent >= 70 ? 'nominal' : undefined },
        { key: 'runtime-readiness', label: '运行就绪度', value: readinessValue, unit: '%', status: readinessValue >= 70 ? 'nominal' : readinessValue < 50 ? 'warning' : undefined },
        { key: 'runtime-clarity', label: '观察清晰度', value: clarityValue, unit: '%', status: clarityValue >= 70 ? 'nominal' : clarityValue < 55 ? 'warning' : undefined },
        { key: 'runtime-safety', label: '安全状态', value: safetyValue, unit: '%', status: safetyValue >= 75 ? 'nominal' : safetyValue < 55 ? 'critical' : 'warning' },
        { key: 'runtime-stability', label: '系统稳定度', value: stabilityValue, unit: '%', status: stabilityValue >= 70 ? 'nominal' : stabilityValue < 55 ? 'warning' : undefined },
      ],
      controls: [
        { key: 'scene-mode', label: '观察视角', value: sceneModeLabels[sceneMode], kind: 'discrete' },
        { key: 'active-variable', label: '控制变量', value: activeVariable, kind: 'discrete' },
        { key: 'selected-equipment', label: '聚焦器材', value: selectedEquipment?.name ?? focusLabel, kind: 'discrete' },
        { key: 'prompt-tone', label: '反馈状态', value: promptTone, kind: 'discrete' },
      ],
      phases: experiment.steps.map((step, index) => ({
        key: `generic-step-${step.order}`,
        label: step.title,
        state: completed || index < stepIndex ? 'completed' : index === stepIndex ? 'active' : 'pending',
      })),
      failureRisks: [
        errors > 0 ? recoveryList[0] : '',
        safetyValue < 60 ? '当前安全裕量偏低，先收敛操作顺序与器材状态，再继续推进。' : '',
        stabilityValue < 58 ? '系统稳定度偏低，直接记录数据会削弱 AI 对真实实验状态的判断。' : '',
        currentStep.failureHints[0] ?? '',
      ],
      trace: [
        `Step ${Math.min(stepIndex + 1, totalSteps)} · ${currentStep.title}`,
        `Focus · ${selectedEquipment?.name ?? focusLabel} · ${selectedEquipmentStatus}`,
        `Scene · ${sceneModeLabels[sceneMode]} · Variable ${activeVariable}`,
        ...labNotes.slice(0, 2),
      ],
    }),
    [
      activeVariable,
      clarityValue,
      completed,
      currentStep.actionType,
      currentStep.failureHints,
      currentStep.title,
      errors,
      experiment.steps,
      focusLabel,
      genericActiveApparatusId,
      genericApparatusIds,
      genericRuntimeContext,
      inspectedEquipmentIds.length,
      labNotes,
      progressPercent,
      promptTone,
      readinessValue,
      recoveryList,
      safetyValue,
      sceneMode,
      selectedEquipment?.name,
      selectedEquipmentStatus,
      stabilityValue,
      stepIndex,
      totalSteps,
    ],
  );

  const { reportReset } = useLabTelemetryReporter({
    experiment,
    step: Math.min(stepIndex + 1, totalSteps),
    totalSteps,
    score,
    errors,
    prompt: promptMessage,
    completed,
    stepLabels,
    onTelemetry,
  });

  useEffect(() => {
    setSelectedEquipmentId(findFocusEquipment(currentStep, experiment)?.id ?? experiment.equipment[0]?.id ?? '');
  }, [currentStep, experiment]);

  useEffect(() => {
    onSimulationRuntimeChange?.(genericSimulationRuntime);
  }, [genericSimulationRuntime, onSimulationRuntimeChange]);

  useEffect(() => () => {
    onSimulationRuntimeChange?.(null);
  }, [onSimulationRuntimeChange]);

  const appendLabNote = (note: string) => {
    setLabNotes((current) => [note, ...current].slice(0, 5));
  };

  const markIncorrect = (message: string) => {
    setErrors((current) => current + 1);
    setPromptTone('error');
    setPromptMessage(message);
    appendLabNote(`错误修正：${message}`);
  };

  const advanceStep = (message: string) => {
    const nextScore = clamp(score + currentStep.scoringWeight, 0, 100);
    setScore(nextScore);
    setPromptTone('success');
    appendLabNote(`步骤完成：${currentStep.title}`);

    if (stepIndex >= totalSteps - 1) {
      setCompleted(true);
      setPromptMessage(message);
      appendLabNote(`实验完成：${experiment.feedback.successSummary}`);
      return;
    }

    const nextStep = experiment.steps[stepIndex + 1];
    setStepIndex((current) => current + 1);
    setPromptMessage(nextStep.description ?? message);

    if (nextStep.actionType === 'switch-view') {
      setSceneMode('detail');
    } else if (nextStep.actionType === 'adjust-focus') {
      setSceneMode('focus');
    } else {
      setSceneMode('bench');
    }
  };

  const handleChoice = (choice: StepChoice) => {
    if (completed) return;

    if (currentStep.actionType === 'identify-object') {
      const requiredCount = Math.min(3, experiment.equipment.length);
      if (inspectedEquipmentIds.length < requiredCount) {
        markIncorrect(`请先至少检查 ${requiredCount} 个核心器材，再完成识别。`);
        return;
      }
    }

    if (currentStep.actionType === 'set-variable') {
      setActiveVariable(choice.label);
      appendLabNote(`变量切换：${choice.label}`);
    }

    if (currentStep.actionType === 'switch-view' && choice.kind === 'correct') {
      setSceneMode('detail');
    }

    if (currentStep.actionType === 'adjust-focus' && choice.kind === 'correct') {
      setSceneMode('focus');
    }

    if (choice.kind === 'correct') {
      const successMessage = stepIndex >= totalSteps - 1 ? experiment.feedback.successSummary : `已完成「${currentStep.title}」，继续下一步。`;
      advanceStep(successMessage);
      return;
    }

    markIncorrect(choice.detail);
  };

  const handleInspectEquipment = (equipmentId: string) => {
    const nextIds = [...inspectedEquipmentIds, equipmentId];
    const equipmentName = experiment.equipment.find((equipment) => equipment.id === equipmentId)?.name ?? '器材';
    setSelectedEquipmentId(equipmentId);

    if (inspectedEquipmentIds.includes(equipmentId)) {
      if (!completed) {
        setPromptTone('info');
        setPromptMessage(`已重新聚焦 ${equipmentName}，继续完成当前步骤。`);
      }
      return;
    }

    setInspectedEquipmentIds(nextIds);
    appendLabNote(`器材检查：${equipmentName}`);

    if (completed) return;

    if (currentStep.actionType === 'identify-object') {
      const requiredCount = Math.min(3, experiment.equipment.length);
      if (nextIds.length >= requiredCount) {
        advanceStep(`已完成器材识别，准备进入「${experiment.steps[Math.min(stepIndex + 1, totalSteps - 1)].title}」。`);
      } else {
        setPromptTone('success');
        setPromptMessage(`已识别 ${nextIds.length}/${requiredCount} 个核心器材，继续检查实验台。`);
      }
    } else {
      setPromptTone('info');
      setPromptMessage(`已查看 ${equipmentName}，继续完成当前步骤。`);
    }
  };

  const handleReset = () => {
    setStepIndex(0);
    setScore(0);
    setErrors(0);
    setCompleted(false);
    setPromptTone('info');
    setPromptMessage(getInitialPrompt(experiment));
    setSceneMode('bench');
    setInspectedEquipmentIds([]);
    setActiveVariable('标准条件');
    setLabNotes(getInitialNotes(experiment));
    reportReset();
  };

  return (
    <section className="panel playground-panel generic-lab-panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Config-Driven Lab</span>
          <h2>{experiment.title}</h2>
          <p>当前使用通用实验播放器快速覆盖更多实验，并补齐分学科读数、实验记录和错误恢复提示，逐步向产品级体验收敛。</p>
        </div>
        <div className="badge-row">
          <span className="badge">{experiment.productization.status}</span>
          <span className="badge">{experiment.productization.interactionMode}</span>
          <span className="badge">Step {Math.min(stepIndex + 1, totalSteps)} / {totalSteps}</span>
        </div>
      </div>

      <div className="playground-grid generic-grid">
        <aside className="playground-side">
          <section className="info-card">
            <span className="eyebrow">Scene</span>
            <h3>实验环境</h3>
            <div className="detail-list compact-detail-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>环境</strong>
                  <span>{experiment.scene.environment}</span>
                </div>
                <span className="badge">{experiment.subject}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>镜头</strong>
                  <span>{sceneModeLabels[sceneMode]} · {experiment.scene.cameraPreset}</span>
                </div>
                <span className="badge">{actionLabels[currentStep.actionType]}</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>课程主题</strong>
                  <span>{experiment.curriculum.theme}</span>
                </div>
                <span className="badge">{experiment.grade}</span>
              </div>
            </div>
          </section>

          <section className="info-card">
            <span className="eyebrow">Equipment</span>
            <h3>实验台器材</h3>
            <div className="equipment-list generic-equipment-list">
              {experiment.equipment.map((equipment) => (
                <button
                  className={inspectedEquipmentIds.includes(equipment.id) ? 'equipment-tag identified' : 'equipment-tag'}
                  key={equipment.id}
                  onClick={() => handleInspectEquipment(equipment.id)}
                  type="button"
                >
                  {equipment.name}
                </button>
              ))}
            </div>
            <small>点击器材可查看状态；识别类步骤必须先完成器材检查，避免直接跳步。</small>
          </section>

          <section className="info-card">
            <span className="eyebrow">Meters</span>
            <h3>实验状态</h3>
            <div className="chem-meter-stack generic-meter-stack">
              <div className="chem-meter"><span>安全值 {safetyValue}</span><div className="chem-meter-bar"><i style={{ width: `${safetyValue}%` }} /></div></div>
              <div className="chem-meter"><span>稳定值 {stabilityValue}</span><div className="chem-meter-bar"><i style={{ width: `${stabilityValue}%` }} /></div></div>
              <div className="chem-meter"><span>清晰度 {clarityValue}</span><div className="chem-meter-bar"><i style={{ width: `${clarityValue}%` }} /></div></div>
              <div className="chem-meter"><span>完成度 {readinessValue}</span><div className="chem-meter-bar"><i style={{ width: `${readinessValue}%` }} /></div></div>
            </div>
          </section>
        </aside>

        <section className="scene-panel">
          <div className="scene-toolbar">
            <div>
              <strong>当前步骤：</strong> {currentStep.title}
              <small className="selector-note">目标对象：{focusLabel} · 当前变量：{activeVariable}</small>
            </div>
            <div className="camera-actions">
              {(Object.keys(sceneModeLabels) as SceneMode[]).map((mode) => (
                <button className={sceneMode === mode ? 'scene-action active' : 'scene-action'} key={mode} onClick={() => setSceneMode(mode)} type="button">
                  {sceneModeLabels[mode]}
                </button>
              ))}
            </div>
          </div>

          <div className={`scene-canvas generic-scene-canvas ${subjectThemeClass[experiment.subject]}`}>
            <div className="generic-scene-head">
              <div>
                <span className="eyebrow">Live Lab</span>
                <h3>{experiment.curriculum.theme}</h3>
                <p>{currentStep.description ?? '请根据当前提示完成实验操作。'}</p>
              </div>
              <div className="status-pill-row">
                <span className="status-pill ready">进度 {progressPercent}%</span>
                <span className="status-pill">当前动作 {actionLabels[currentStep.actionType]}</span>
              </div>
            </div>

            <div className="generic-scene-body">
              <div className={`generic-focus-chamber mode-${sceneMode}`}>
                <div className="focus-orbit orbit-a" />
                <div className="focus-orbit orbit-b" />
                <div className="focus-core">
                  <span className="focus-chip">{focusLabel}</span>
                  <strong>{spotlight.title}</strong>
                  <p>{spotlight.detail}</p>
                </div>
                <div className="generic-signal-strip">
                  {stageSignals.map((signal) => (
                    <article className={`generic-signal-card ${signal.tone}`} key={signal.label}>
                      <span>{signal.label}</span>
                      <strong>{signal.value}</strong>
                      <small>{signal.detail}</small>
                    </article>
                  ))}
                </div>
                <div className="focus-apparatus-row">
                  {experiment.equipment.slice(0, 4).map((equipment) => {
                    const status = buildEquipmentStatus(equipment, focusLabel, inspectedEquipmentIds, currentStep);
                    const visualKind = getEquipmentVisualKind(equipment);
                    return (
                      <button
                        className={
                          selectedEquipment?.id === equipment.id || status === '当前核心'
                            ? 'mini-apparatus active'
                            : status === '待检查'
                              ? 'mini-apparatus'
                              : 'mini-apparatus ready'
                        }
                        data-kind={visualKind}
                        key={equipment.id}
                        onClick={() => handleInspectEquipment(equipment.id)}
                        type="button"
                      >
                        <span>{equipment.name}</span>
                        <small>{status}</small>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="generic-stage-console">
                <article className="generic-stage-brief">
                  <span className="generic-stage-kicker">Stage Console</span>
                  <strong>{selectedEquipment?.name ?? focusLabel}</strong>
                  <p>{stageConsoleCopy}</p>
                  <div className="generic-stage-meta">
                    <span className={selectedEquipmentStatus === '当前核心' ? 'generic-stage-state active' : selectedEquipmentStatus === '待检查' ? 'generic-stage-state' : 'generic-stage-state ready'}>
                      {selectedEquipmentStatus}
                    </span>
                    <span className="generic-stage-state subtle">
                      {selectedEquipment ? `${selectedEquipment.type} · ${getEquipmentStationLabel(selectedEquipment)}` : '器材代理'}
                    </span>
                  </div>
                </article>

                <div className="generic-stage-selector">
                  {experiment.equipment.slice(0, 6).map((equipment) => {
                    const equipmentStatus = buildEquipmentStatus(equipment, focusLabel, inspectedEquipmentIds, currentStep);
                    const visualKind = getEquipmentVisualKind(equipment);
                    return (
                      <button
                        className={
                          selectedEquipment?.id === equipment.id || focusLabel === equipment.name
                            ? 'generic-stage-node active'
                            : inspectedEquipmentIds.includes(equipment.id)
                              ? 'generic-stage-node ready'
                              : 'generic-stage-node'
                        }
                        data-kind={visualKind}
                        key={equipment.id}
                        onClick={() => handleInspectEquipment(equipment.id)}
                        type="button"
                      >
                        <strong>{equipment.name}</strong>
                        <span>{getEquipmentStationLabel(equipment)}</span>
                        <small>{equipment.type} · {equipmentStatus}</small>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="observation-ribbon">
            {observationChips.map((chip) => (
              <div className={`observation-chip ${chip.tone}`} key={chip.label}>
                <strong>{chip.label}</strong>
                <span>{chip.detail}</span>
              </div>
            ))}
          </div>

          <div className={promptTone === 'success' ? 'info-card prompt-card success' : promptTone === 'error' ? 'info-card prompt-card error' : 'info-card prompt-card info'}>
            <span className="eyebrow">Lab Prompt</span>
            <h3>{completed ? '实验已完成' : currentStep.title}</h3>
            <p>{promptMessage}</p>
          </div>

          <section className="info-card generic-notebook-card">
            <div className="generic-notebook-head">
              <div>
                <span className="eyebrow">Notebook</span>
                <h3>实验记录</h3>
              </div>
              <span className="badge">最近 5 条</span>
            </div>

            <div className="timeline-list">
              {timeline.map((entry) => (
                <div className={`timeline-item ${entry.state}`} key={entry.title}>
                  <span className="timeline-marker" />
                  <div className="timeline-copy">
                    <strong>{entry.title}</strong>
                    <small>{entry.detail}</small>
                  </div>
                </div>
              ))}
            </div>

            <div className="lab-note-stack">
              {labNotes.map((note, index) => (
                <div className={index === 0 ? 'lab-note latest' : 'lab-note'} key={`${note}-${index}`}>
                  {note}
                </div>
              ))}
            </div>
          </section>
        </section>

        <aside className="playground-side">
          <section className="info-card control-block">
            <span className="eyebrow">Choices</span>
            <h3>步骤操作</h3>
            <div className="summary-stack generic-choice-stack">
              {stepChoices.map((choice) => (
                <button className={`summary-choice generic-choice ${choice.tone}`} key={choice.id} onClick={() => handleChoice(choice)} type="button">
                  <strong>{choice.label}</strong>
                  <span>{choice.detail}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Checklist</span>
            <h3>当前步骤要求</h3>
            <ul className="bullet-list compact-list">
              <li>目标对象：{focusLabel}</li>
              <li>步骤权重：{currentStep.scoringWeight}%</li>
              <li>关键能力：{currentStep.requiredCapabilities?.join('、') ?? '通用实验交互'}</li>
              <li>常见错误：{currentStep.failureHints[0] ?? '注意实验规范'}</li>
            </ul>
          </section>

          <section className="info-card control-block recovery-card">
            <span className="eyebrow">Recovery</span>
            <h3>{errors > 0 ? '错误恢复' : '操作预判'}</h3>
            <ul className="bullet-list compact-list recovery-list">
              {recoveryList.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="info-card control-block">
            <span className="eyebrow">Actions</span>
            <h3>实验控制</h3>
            <div className="button-stack">
              <button className="action-button ghost" onClick={handleReset} type="button">重新开始</button>
            </div>
            <small>通用播放器优先解决“更多实验可用”，高频实验后续仍可继续升级为专属高拟真实验场景。</small>
          </section>
        </aside>
      </div>
    </section>
  );
}
