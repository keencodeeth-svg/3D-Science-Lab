import { getApparatusById } from './apparatusEngine';
import type {
  ApparatusDefinition,
  ApparatusRenderBlueprint,
  ApparatusRuntimeContext,
  ApparatusRuntimeInstance,
  ApparatusRuntimePhase,
  ApparatusRuntimeSnapshot,
  ApparatusRuntimeValue,
} from '../types/apparatus';

const phaseOrder: ApparatusRuntimePhase[] = ['idle', 'staged', 'active', 'stable', 'complete'];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function readFlag(context: ApparatusRuntimeContext | undefined, key: string) {
  return Boolean(context?.flags?.[key]);
}

function readMetric(context: ApparatusRuntimeContext | undefined, key: string, fallback = 0) {
  const value = context?.metrics?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readValue(context: ApparatusRuntimeContext | undefined, key: string, fallback: ApparatusRuntimeValue = '—') {
  const value = context?.values?.[key];
  return value ?? fallback;
}

function createRenderBlueprint(definition: ApparatusDefinition, override?: Partial<ApparatusRenderBlueprint>): ApparatusRenderBlueprint {
  return {
    anchor: override?.anchor ?? definition.sceneRoles[0] ?? 'bench-center',
    parts: override?.parts ?? definition.sceneRoles.concat(definition.ports.slice(0, 2)),
    materialChannels: override?.materialChannels ?? definition.modelProfile.materialFocus,
    animationChannels: override?.animationChannels ?? definition.modelProfile.animationFocus,
  };
}

function createBaseInstance(definition: ApparatusDefinition, apparatusId: string, context?: ApparatusRuntimeContext): ApparatusRuntimeInstance {
  return {
    instanceId: `${context?.experimentId ?? 'runtime'}:${apparatusId}`,
    apparatusId,
    name: definition.name,
    phase: 'idle',
    readiness: 0,
    values: {},
    badges: [],
    stateChannels: definition.stateSchema,
    renderBlueprint: createRenderBlueprint(definition),
  };
}

function phaseFromProgress(context: ApparatusRuntimeContext | undefined, active: boolean, stable: boolean) {
  if (context?.completed) return 'complete';
  if (stable) return 'stable';
  if (active) return 'active';
  if ((context?.progress ?? 0) > 0.1 || (context?.step ?? 1) > 1) return 'staged';
  return 'idle';
}

function withValues(instance: ApparatusRuntimeInstance, payload: Partial<ApparatusRuntimeInstance>): ApparatusRuntimeInstance {
  return {
    ...instance,
    ...payload,
    values: {
      ...instance.values,
      ...(payload.values ?? {}),
    },
    badges: payload.badges ?? instance.badges,
    stateChannels: payload.stateChannels ?? instance.stateChannels,
    renderBlueprint: payload.renderBlueprint ?? instance.renderBlueprint,
  };
}

function buildBatteryRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const active = readFlag(context, 'switchClosed') || readFlag(context, 'currentFlowing') || readFlag(context, 'mainCircuitReady');
  const phase = phaseFromProgress(context, active, context?.completed ?? false);
  const readiness = clamp((readFlag(context, 'mainCircuitReady') ? 42 : 12) + (active ? 34 : 0) + ((context?.completed ?? false) ? 24 : 0), 0, 100);

  return {
    phase,
    readiness,
    values: {
      电压: readMetric(context, 'voltage', readMetric(context, 'theoreticalVoltage', 1.5)),
      输出: active ? '已上电' : '待上电',
      模式: readValue(context, 'layout', '默认回路'),
    },
    badges: [active ? '低压输出' : '待通电', '可复用电源'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'bench-left',
      parts: ['壳体', '端子', '标签面板'],
      materialChannels: ['塑料壳体', '金属端子', '标签磨损'],
      animationChannels: ['端子辉光', '状态灯变化'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildWireRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const connectionCount = readMetric(context, 'connectionCount', 0);
  const active = readFlag(context, 'isDraggingWire') || readFlag(context, 'currentFlowing') || connectionCount > 0;
  const stable = !readFlag(context, 'isDraggingWire') && (readFlag(context, 'readingStable') || readFlag(context, 'macroObserved'));
  const phase = phaseFromProgress(context, active, stable);
  const readiness = clamp(connectionCount * 12 + (readFlag(context, 'currentFlowing') ? 28 : 0) + (stable ? 18 : 0), 0, 100);

  return {
    phase,
    readiness,
    values: {
      连线数: connectionCount || readMetric(context, 'placedPartCount', 0),
      通电: readFlag(context, 'currentFlowing') || readFlag(context, 'macroObserved') ? '是' : '否',
      拓扑: readValue(context, 'layout', readValue(context, 'electronFlow', '未连接')),
    },
    badges: [active ? '连接层' : '待连线', '导电脉冲'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'bench-mid',
      parts: ['导线主体', '夹头', '接触端'],
      materialChannels: ['橡胶包覆', '金属夹头', '电流辉光'],
      animationChannels: ['连线吸附', '导电脉冲'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildMeterRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const active = readFlag(context, 'metersReady') || readFlag(context, 'meterConnected') || readFlag(context, 'macroObserved');
  const stable = readFlag(context, 'readingStable') || readFlag(context, 'macroObserved');
  const phase = phaseFromProgress(context, active, stable);
  const readiness = clamp((active ? 40 : 0) + (stable ? 28 : 0) + readMetric(context, 'measurementCount', 0) * 8, 0, 100);

  return {
    phase,
    readiness,
    values: {
      电压: readMetric(context, 'voltage', readMetric(context, 'theoreticalVoltage', 0)),
      电流: readMetric(context, 'current', readMetric(context, 'currentLevel', 0)),
      稳定: stable ? '稳定' : '波动',
      量程: readValue(context, 'selectedInstrument', readValue(context, 'meterMode', '默认')), 
    },
    badges: [stable ? '读数稳定' : '指针波动', '量化核心'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'bench-front',
      parts: ['刻度盘', '表针', '表壳', '玻璃面罩'],
      materialChannels: ['塑料外壳', '玻璃反射', '指针涂层'],
      animationChannels: ['指针抖动', 'halo 呼吸'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildElectrodeRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const active = readFlag(context, 'electrodePlaced') || readFlag(context, 'macroObserved') || readFlag(context, 'deviceReady');
  const stable = readFlag(context, 'macroObserved') || (context?.completed ?? false);
  const phase = phaseFromProgress(context, active, stable);
  const readiness = clamp((readFlag(context, 'electrodePlaced') ? 38 : 0) + (readFlag(context, 'deviceReady') ? 18 : 0) + (readFlag(context, 'macroObserved') ? 28 : 0) + ((context?.completed ?? false) ? 16 : 0), 0, 100);

  return {
    phase,
    readiness,
    values: {
      阳极: readValue(context, 'anodeMaterial', '未选'),
      阴极: readValue(context, 'cathodeMaterial', '未选'),
      电流: readMetric(context, 'currentLevel', readMetric(context, 'current', 0)),
      反应: readMetric(context, 'reactionProgressPercent', 0),
    },
    badges: [readFlag(context, 'macroObserved') ? '沉积 / 腐蚀中' : '待入液', '电化学界面'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'liquid-slot',
      parts: ['电极板', '浸液区域', '沉积层'],
      materialChannels: ['金属镜面', '腐蚀层', '沉积颗粒'],
      animationChannels: ['离子云', '沉积增长', '电极辉光'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildSaltBridgeRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const active = readFlag(context, 'saltBridgePlaced') || readFlag(context, 'macroObserved');
  const stable = readFlag(context, 'macroObserved') || (context?.completed ?? false);
  const phase = phaseFromProgress(context, active, stable);
  const readiness = clamp((readFlag(context, 'saltBridgePlaced') ? 46 : 0) + (readFlag(context, 'macroObserved') ? 30 : 0) + ((context?.completed ?? false) ? 16 : 0), 0, 100);

  return {
    phase,
    readiness,
    values: {
      导通: active ? '已导通' : '未接入',
      离子迁移: readFlag(context, 'macroObserved') || readFlag(context, 'microView') ? '活跃' : '待观察',
      左液: readValue(context, 'leftSolution', '未选'),
      右液: readValue(context, 'rightSolution', '未选'),
    },
    badges: [active ? '维持电中性' : '待接入', '桥接器材'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'beaker-bridge',
      parts: ['U 形玻璃桥', '桥内盐溶液'],
      materialChannels: ['玻璃折射', '冷光边缘', '液体透射'],
      animationChannels: ['离子流动', '桥内辉光'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildBeakerRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const leftSolution = readValue(context, 'leftSolution', '未装液');
  const rightSolution = readValue(context, 'rightSolution', '未装液');
  const solution = readValue(context, 'solution', leftSolution !== '未装液' ? leftSolution : rightSolution);
  const active = solution !== '未装液' || readFlag(context, 'solutionReady') || readFlag(context, 'slidePlaced');
  const stable = readFlag(context, 'macroObserved') || readFlag(context, 'reactionObserved');
  const phase = phaseFromProgress(context, active, stable);
  const readiness = clamp((active ? 34 : 0) + (stable ? 24 : 0) + ((context?.progress ?? 0) * 30), 0, 100);

  return {
    phase,
    readiness,
    values: {
      左液: leftSolution,
      右液: rightSolution,
      当前液体: solution,
      反应进度: readMetric(context, 'reactionProgressPercent', 0),
    },
    badges: [active ? '液体系统' : '待装液', '通用容器'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'bench-center',
      parts: ['玻璃杯身', '厚底', '液面', '刻线'],
      materialChannels: ['玻璃厚边', '液面折射', '刻线磨损'],
      animationChannels: ['液面波动', '焦散反射', '沉淀扩散'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildSwitchRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const active = readFlag(context, 'switchClosed') || readFlag(context, 'mainCircuitReady') || readMetric(context, 'connectionCount', 0) > 0;
  const phase = phaseFromProgress(context, active, readFlag(context, 'switchClosed'));
  const readiness = clamp((readMetric(context, 'connectionCount', 0) > 0 ? 36 : 0) + (readFlag(context, 'switchClosed') ? 34 : 0) + ((context?.completed ?? false) ? 18 : 0), 0, 100);

  return {
    phase,
    readiness,
    values: {
      闭合: readFlag(context, 'switchClosed') ? '是' : '否',
      回路: readValue(context, 'layout', '默认回路'),
      火花: readFlag(context, 'switchClosed') ? '可见' : '无',
    },
    badges: [readFlag(context, 'switchClosed') ? '通路已建立' : '待闭合', '控制器'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'bench-center',
      parts: ['开关底座', '拨杆', '接点'],
      materialChannels: ['包漆底座', '金属拨杆', '接点烧痕'],
      animationChannels: ['拨杆切换', '接点火花'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildBulbRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const active = readFlag(context, 'switchClosed') || readFlag(context, 'currentFlowing');
  const stable = active && !readFlag(context, 'isDraggingWire');
  const phase = phaseFromProgress(context, active, stable);
  const readiness = clamp((readMetric(context, 'connectionCount', 0) > 0 ? 28 : 0) + (active ? 40 : 0) + ((context?.completed ?? false) ? 16 : 0), 0, 100);

  return {
    phase,
    readiness,
    values: {
      亮度: active ? (readValue(context, 'layout', '并联回路') === '并联回路' ? '高' : '中') : '灭',
      模式: readValue(context, 'layout', '默认回路'),
      通电: active ? '是' : '否',
    },
    badges: [active ? '发光中' : '待点亮', '结果反馈'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'bench-right',
      parts: ['灯泡玻壳', '灯丝', '金属螺口'],
      materialChannels: ['玻璃反光', '灯丝发热', '金属氧化'],
      animationChannels: ['亮度变化', '灯丝发热'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildResistorRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const active = readFlag(context, 'mainCircuitReady') || readFlag(context, 'metersReady');
  const stable = readFlag(context, 'readingStable') || readMetric(context, 'measurementCount', 0) >= 1;
  const phase = phaseFromProgress(context, active, stable);
  const readiness = clamp((active ? 34 : 0) + (stable ? 28 : 0) + readMetric(context, 'measurementCount', 0) * 10, 0, 100);

  return {
    phase,
    readiness,
    values: {
      阻值: readMetric(context, 'derivedResistance', 0),
      平均阻值: readMetric(context, 'averageResistance', 0),
      数据质量: readValue(context, 'resistanceQuality', '待评估'),
    },
    badges: [stable ? '稳定负载' : '待测量', '被测元件'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'bench-center',
      parts: ['陶瓷管', '色环', '引脚'],
      materialChannels: ['陶瓷高光', '色环磨损', '金属引脚'],
      animationChannels: ['温升反馈', '高光变化'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildRheostatRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const active = readFlag(context, 'mainCircuitReady') || readFlag(context, 'metersReady');
  const stable = readFlag(context, 'readingStable');
  const phase = phaseFromProgress(context, active, stable);
  const readiness = clamp((active ? 34 : 0) + (stable ? 24 : 0) + readMetric(context, 'rheostatLevel', 0) * 0.32, 0, 100);

  return {
    phase,
    readiness,
    values: {
      档位: readMetric(context, 'rheostatLevel', 0),
      电流: readMetric(context, 'current', 0),
      接触: stable ? '稳定' : active ? '滑动中' : '未工作',
    },
    badges: [active ? '变量控制器' : '待接入', '可调阻'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'bench-right',
      parts: ['电阻丝', '滑块', '底座'],
      materialChannels: ['铜色绕丝', '滑块接触片', '木质底座'],
      animationChannels: ['滑块移动', '接触辉光'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildMicroscopeRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const active = readFlag(context, 'lightReady') || readFlag(context, 'slidePlaced');
  const stable = readFlag(context, 'focusReady');
  const phase = phaseFromProgress(context, active, stable);
  const readiness = clamp((readFlag(context, 'lightReady') ? 24 : 0) + (readFlag(context, 'slidePlaced') ? 26 : 0) + (stable ? 32 : 0) + ((context?.completed ?? false) ? 12 : 0), 0, 100);

  return {
    phase,
    readiness,
    values: {
      倍率: readValue(context, 'objective', '低倍物镜'),
      亮度: readMetric(context, 'lightLevel', 0),
      清晰度: readValue(context, 'clarity', '待观察'),
      模糊: readMetric(context, 'blur', 0),
    },
    badges: [stable ? '视野清晰' : '待调焦', '光学主机'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'bench-center',
      parts: ['机身', '物镜转盘', '调焦旋钮', '载物台'],
      materialChannels: ['涂装金属', '镜头玻璃', '旋钮磨损'],
      animationChannels: ['调焦', '镜头切换', '光路变化'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildSlideRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const active = readFlag(context, 'slidePicked') || readFlag(context, 'slidePlaced');
  const stable = readFlag(context, 'slidePlaced') && readFlag(context, 'focusReady');
  const phase = phaseFromProgress(context, active, stable);
  const readiness = clamp((readFlag(context, 'slidePicked') ? 24 : 0) + (readFlag(context, 'slidePlaced') ? 30 : 0) + (stable ? 26 : 0) + ((context?.completed ?? false) ? 12 : 0), 0, 100);

  return {
    phase,
    readiness,
    values: {
      放片: readFlag(context, 'slidePlaced') ? '已固定' : readFlag(context, 'slidePicked') ? '待放置' : '未取片',
      清晰度: readValue(context, 'clarity', '待观察'),
      染色: readValue(context, 'stainState', '未染色'),
    },
    badges: [stable ? '成像载体' : '待制片', '样本承载'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'stage-surface',
      parts: ['载玻片', '盖玻片', '样本层'],
      materialChannels: ['薄玻璃', '液滴边缘', '样本纹理'],
      animationChannels: ['染液铺展', '盖片贴合'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildDropperRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const active = (context?.step ?? 1) >= 3 || readFlag(context, 'slidePicked');
  const stable = readFlag(context, 'slidePlaced') || readFlag(context, 'focusReady');
  const phase = phaseFromProgress(context, active, stable);
  const readiness = clamp((active ? 26 : 0) + (stable ? 22 : 0) + ((context?.completed ?? false) ? 10 : 0), 0, 100);

  return {
    phase,
    readiness,
    values: {
      加样: stable ? '已完成' : active ? '待滴加' : '未开始',
      染色: readValue(context, 'stainState', '未染色'),
      目标: readFlag(context, 'slidePlaced') ? '载玻片' : '工作台',
    },
    badges: [stable ? '液体处理完成' : '待滴加', '微量转移'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'bench-left',
      parts: ['胶帽', '玻璃管', '液滴尖端'],
      materialChannels: ['磨砂胶帽', '透明玻璃', '液滴高光'],
      animationChannels: ['液滴生成', '滴液摆动'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

function buildTweezersRuntime(definition: ApparatusDefinition, context?: ApparatusRuntimeContext) {
  const active = readFlag(context, 'slidePicked') || !readFlag(context, 'slidePlaced');
  const stable = readFlag(context, 'slidePlaced');
  const phase = phaseFromProgress(context, active, stable);
  const readiness = clamp((readFlag(context, 'slidePicked') ? 36 : 12) + (stable ? 26 : 0) + ((context?.completed ?? false) ? 10 : 0), 0, 100);

  return {
    phase,
    readiness,
    values: {
      夹持: readFlag(context, 'slidePicked') && !readFlag(context, 'slidePlaced') ? '夹持中' : stable ? '已放片' : '待取片',
      对位: stable ? '完成' : '待对位',
      目标: readFlag(context, 'slidePlaced') ? '载物台' : '载玻片',
    },
    badges: [stable ? '精细放置' : '待夹取', '精密夹持'],
    renderBlueprint: createRenderBlueprint(definition, {
      anchor: 'bench-right',
      parts: ['镊柄', '弹性夹臂', '夹尖'],
      materialChannels: ['拉丝金属', '边缘磨损', '反光刃口'],
      animationChannels: ['夹口开合', '取片微抖'],
    }),
  } satisfies Partial<ApparatusRuntimeInstance>;
}

const runtimeResolvers: Record<string, (definition: ApparatusDefinition, context?: ApparatusRuntimeContext) => Partial<ApparatusRuntimeInstance>> = {
  'battery-pack': buildBatteryRuntime,
  'wire-set': buildWireRuntime,
  'meter-set': buildMeterRuntime,
  'electrode-set': buildElectrodeRuntime,
  'salt-bridge': buildSaltBridgeRuntime,
  beaker: buildBeakerRuntime,
  'switch-module': buildSwitchRuntime,
  'bulb-module': buildBulbRuntime,
  'resistor-board': buildResistorRuntime,
  rheostat: buildRheostatRuntime,
  microscope: buildMicroscopeRuntime,
  'slide-kit': buildSlideRuntime,
  'dropper-pipette': buildDropperRuntime,
  tweezers: buildTweezersRuntime,
};

export function createApparatusRuntimeInstance(apparatusId: string, context?: ApparatusRuntimeContext) {
  const definition = getApparatusById(apparatusId);
  if (!definition) return null;

  const base = createBaseInstance(definition, apparatusId, context);
  const resolver = runtimeResolvers[apparatusId];
  if (!resolver) {
    return withValues(base, {
      phase: phaseFromProgress(context, (context?.progress ?? 0) > 0.1, context?.completed ?? false),
      readiness: clamp((context?.progress ?? 0) * 100, 0, 100),
      values: {
        步骤: context?.step ?? 1,
        进度: Math.round((context?.progress ?? 0) * 100),
      },
      badges: [definition.category, '待扩展 runtime'],
    });
  }

  return withValues(base, resolver(definition, context));
}

export function createApparatusRuntimeSnapshot(apparatusIds: string[], context?: ApparatusRuntimeContext, activeApparatusId?: string | null): ApparatusRuntimeSnapshot {
  const instances = apparatusIds
    .map((id) => createApparatusRuntimeInstance(id, context))
    .filter((item): item is ApparatusRuntimeInstance => Boolean(item));

  const phaseCounts = phaseOrder.reduce<Record<ApparatusRuntimePhase, number>>((accumulator, phase) => {
    accumulator[phase] = instances.filter((item) => item.phase === phase).length;
    return accumulator;
  }, { idle: 0, staged: 0, active: 0, stable: 0, complete: 0 });

  const resolvedActiveApparatusId = activeApparatusId && instances.some((item) => item.apparatusId === activeApparatusId)
    ? activeApparatusId
    : instances[0]?.apparatusId ?? null;

  return {
    instances,
    activeInstanceId: resolvedActiveApparatusId ? `${context?.experimentId ?? 'runtime'}:${resolvedActiveApparatusId}` : null,
    phaseCounts,
  };
}
