import type { ExperimentConfig } from '../types/experiment';
import type { ApparatusDefinition, ApparatusEngineSnapshot, ApparatusInteraction, ApparatusMatch, ApparatusMutationSuggestion, ApparatusSubject } from '../types/apparatus';

const subjectFallbackLoadout: Record<ApparatusSubject, string[]> = {
  通用: ['beaker', 'dropper-pipette', 'support-stand'],
  物理: ['battery-pack', 'wire-set', 'switch-module', 'meter-set'],
  化学: ['beaker', 'test-tube', 'dropper-pipette', 'alcohol-burner', 'electrode-set'],
  生物: ['microscope', 'slide-kit', 'petri-dish', 'tweezers'],
};

function mapExperimentSubjectToApparatusSubject(subject?: ExperimentConfig['subject']): ApparatusSubject {
  if (subject === '物理' || subject === '化学' || subject === '生物') return subject;
  return '通用';
}

export const APPARATUS_CATALOG: ApparatusDefinition[] = [
  {
    id: 'beaker',
    name: '烧杯',
    shortLabel: '烧杯',
    description: '基础透明反应容器，可承接混合、加热、电极插入和现象观察。',
    category: '容器',
    subjects: ['通用', '化学', '生物'],
    aliases: ['烧杯', '玻璃杯', '烧杯 a', '烧杯 b'],
    reusable: true,
    sceneRoles: ['主反应容器', '液体观察窗口'],
    stateSchema: ['液位', '温度', '颜色', '浊度', 'pH', '电导率'],
    ports: ['liquid-in', 'stir-in', 'electrode-slot', 'probe-slot'],
    interactions: ['盛装', '滴加', '搅拌', '加热', '导电'],
    reusableIn: ['酸碱反应', '沉淀反应', '电解实验', '导电性实验', '配制实验'],
    compatibleWith: ['dropper-pipette', 'glass-rod', 'electrode-set', 'support-stand', 'measuring-cylinder'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['玻璃厚边', '液面折射', '刻线磨损'],
      animationFocus: ['液面波动', '焦散反射', '沉淀扩散'],
      wearDetails: ['口沿轻微擦痕', '底部水渍', '内壁挂液'],
    },
    physical: { transparency: '高', heatResistance: '中', conductivity: '低', precision: '中', supportsFluid: true, supportsOptics: true, supportsMotion: false },
    chemical: { acidResistance: '高', alkaliResistance: '中', solventResistance: '中', supportsHeatingReaction: true, supportsReactionObservation: true, supportsGasCollection: false },
    biological: { sterileReady: false, supportsSpecimen: true, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'test-tube',
    name: '试管',
    shortLabel: '试管',
    description: '小体积反应和加热观察的高频容器，适合气体制备、颜色反应和对照实验。',
    category: '容器',
    subjects: ['化学', '生物'],
    aliases: ['试管', '试管架中的试管'],
    reusable: true,
    sceneRoles: ['小体积反应容器', '对照组容器'],
    stateSchema: ['液位', '温度', '颜色', '气体体积'],
    ports: ['liquid-in', 'gas-out', 'holder-mount'],
    interactions: ['盛装', '滴加', '加热', '集气'],
    reusableIn: ['气体制备', '碘液显色', '加热分解', '对照实验'],
    compatibleWith: ['support-stand', 'gas-delivery-set', 'alcohol-burner', 'dropper-pipette'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['细长玻璃壁', '底部曲面', '冷凝挂壁'],
      animationFocus: ['气泡上浮', '受热对流', '管壁冷凝'],
      wearDetails: ['口沿轻磨损', '局部雾化痕迹'],
    },
    physical: { transparency: '高', heatResistance: '中', conductivity: '低', precision: '中', supportsFluid: true, supportsOptics: true, supportsMotion: false },
    chemical: { acidResistance: '高', alkaliResistance: '中', solventResistance: '中', supportsHeatingReaction: true, supportsReactionObservation: true, supportsGasCollection: true },
    biological: { sterileReady: false, supportsSpecimen: true, supportsMicroscopy: false, supportsCulture: false, supportsStaining: true },
  },
  {
    id: 'erlenmeyer-flask',
    name: '锥形瓶',
    shortLabel: '锥形瓶',
    description: '用于振荡混合、滴定承接和较稳定的反应容器。',
    category: '容器',
    subjects: ['化学', '生物'],
    aliases: ['锥形瓶'],
    reusable: true,
    sceneRoles: ['振荡容器', '滴定接受器'],
    stateSchema: ['液位', '温度', '颜色', '浑浊度'],
    ports: ['liquid-in', 'stopper-slot'],
    interactions: ['盛装', '滴加', '搅拌'],
    reusableIn: ['滴定', '蓝瓶子反应', '发酵收集'],
    compatibleWith: ['dropper-pipette', 'support-stand', 'glass-rod', 'measuring-cylinder'],
    modelProfile: {
      qualityTier: 'pro',
      materialFocus: ['肩部折射', '液体摆动', '瓶口高光'],
      animationFocus: ['振荡回流', '颜色渐变'],
      wearDetails: ['瓶身擦痕', '底部磨砂'],
    },
    physical: { transparency: '高', heatResistance: '中', conductivity: '低', precision: '中', supportsFluid: true, supportsOptics: true, supportsMotion: true },
    chemical: { acidResistance: '高', alkaliResistance: '中', solventResistance: '中', supportsHeatingReaction: true, supportsReactionObservation: true, supportsGasCollection: false },
    biological: { sterileReady: false, supportsSpecimen: true, supportsMicroscopy: false, supportsCulture: true, supportsStaining: false },
  },
  {
    id: 'dropper-pipette',
    name: '滴管',
    shortLabel: '滴管',
    description: '控制液体加入速度与体积，是化学显色与生物染色的基础转移件。',
    category: '转移',
    subjects: ['通用', '化学', '生物'],
    aliases: ['滴管'],
    reusable: true,
    sceneRoles: ['加液工具', '染色工具'],
    stateSchema: ['吸液量', '滴速'],
    ports: ['liquid-in', 'liquid-out'],
    interactions: ['滴加', '量取', '取样'],
    reusableIn: ['酸碱指示剂', '滴定', '染色', '样本制备'],
    compatibleWith: ['beaker', 'test-tube', 'erlenmeyer-flask', 'slide-kit', 'petri-dish'],
    modelProfile: {
      qualityTier: 'pro',
      materialFocus: ['橡胶球压痕', '玻璃管透明度'],
      animationFocus: ['液滴形成', '毛细回吸'],
      wearDetails: ['胶头细褶皱', '管身轻划痕'],
    },
    physical: { transparency: '中', heatResistance: '低', conductivity: '低', precision: '中', supportsFluid: true, supportsOptics: false, supportsMotion: true },
    chemical: { acidResistance: '中', alkaliResistance: '中', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: true, supportsSpecimen: true, supportsMicroscopy: false, supportsCulture: true, supportsStaining: true },
  },
  {
    id: 'glass-rod',
    name: '玻璃棒',
    shortLabel: '玻璃棒',
    description: '用于搅拌、引流和辅助转移，是液体体系中最常见的辅件。',
    category: '转移',
    subjects: ['通用', '化学'],
    aliases: ['玻璃棒'],
    reusable: true,
    sceneRoles: ['搅拌工具'],
    stateSchema: ['表面挂液', '搅拌速度'],
    ports: ['hand-grip', 'liquid-contact'],
    interactions: ['搅拌', '取样'],
    reusableIn: ['溶解', '混合', '过滤引流'],
    compatibleWith: ['beaker', 'erlenmeyer-flask', 'test-tube'],
    modelProfile: {
      qualityTier: 'core',
      materialFocus: ['细杆折射', '液膜高光'],
      animationFocus: ['搅拌涡流'],
      wearDetails: ['杆身雾面擦痕'],
    },
    physical: { transparency: '高', heatResistance: '中', conductivity: '低', precision: '低', supportsFluid: true, supportsOptics: false, supportsMotion: true },
    chemical: { acidResistance: '高', alkaliResistance: '中', solventResistance: '中', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'alcohol-burner',
    name: '酒精灯',
    shortLabel: '酒精灯',
    description: '提供基础加热源，可驱动蒸发、分解与气体制备等加热过程。',
    category: '加热',
    subjects: ['化学', '物理'],
    aliases: ['酒精灯'],
    reusable: true,
    sceneRoles: ['热源'],
    stateSchema: ['火焰高度', '燃料余量', '热通量'],
    ports: ['fuel-core', 'ignition-point', 'heating-zone'],
    interactions: ['加热'],
    reusableIn: ['加热分解', '蒸发', '对流演示'],
    compatibleWith: ['support-stand', 'test-tube', 'beaker', 'erlenmeyer-flask'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['玻璃灯壶', '金属灯芯帽', '酒精液面'],
      animationFocus: ['火焰分层', '热扰动', '受热高光'],
      wearDetails: ['烟熏痕迹', '灯帽擦伤'],
    },
    physical: { transparency: '中', heatResistance: '高', conductivity: '低', precision: '中', supportsFluid: false, supportsOptics: false, supportsMotion: false },
    chemical: { acidResistance: '低', alkaliResistance: '低', solventResistance: '中', supportsHeatingReaction: true, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'support-stand',
    name: '铁架台 / 支架',
    shortLabel: '支架',
    description: '负责夹持、定位和抬高器材，是跨实验复用率最高的结构件。',
    category: '支撑',
    subjects: ['通用', '化学', '物理'],
    aliases: ['支架', '铁架台', '三脚架', '试管架', '试管夹'],
    reusable: true,
    sceneRoles: ['固定结构', '高度调节结构'],
    stateSchema: ['高度', '夹持角度', '受力状态'],
    ports: ['clamp-slot', 'holder-slot', 'heat-clearance'],
    interactions: ['支撑固定'],
    reusableIn: ['试管加热', '气体制备', '镜头定位', '器材固定'],
    compatibleWith: ['test-tube', 'beaker', 'gas-delivery-set', 'alcohol-burner', 'electrode-set'],
    modelProfile: {
      qualityTier: 'pro',
      materialFocus: ['喷涂金属', '螺纹夹具', '橡胶垫'],
      animationFocus: ['夹具调角', '受力轻震'],
      wearDetails: ['边角掉漆', '夹头压痕'],
    },
    physical: { transparency: '低', heatResistance: '高', conductivity: '中', precision: '中', supportsFluid: false, supportsOptics: false, supportsMotion: true },
    chemical: { acidResistance: '低', alkaliResistance: '低', solventResistance: '低', supportsHeatingReaction: true, supportsReactionObservation: false, supportsGasCollection: true },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'measuring-cylinder',
    name: '量筒',
    shortLabel: '量筒',
    description: '用于体积量取与读数，是实验引擎里最重要的定量容器之一。',
    category: '测量',
    subjects: ['化学', '物理'],
    aliases: ['量筒'],
    reusable: true,
    sceneRoles: ['定量容器'],
    stateSchema: ['液位', '刻度读数', '温度'],
    ports: ['liquid-in', 'liquid-out'],
    interactions: ['量取', '盛装', '读数'],
    reusableIn: ['溶液配制', '密度测量', '排水集气'],
    compatibleWith: ['beaker', 'dropper-pipette', 'gas-delivery-set'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['刻线清晰度', '弯月面', '厚底玻璃'],
      animationFocus: ['液位变化', '读数跟随'],
      wearDetails: ['刻线轻磨损', '底部擦痕'],
    },
    physical: { transparency: '高', heatResistance: '中', conductivity: '低', precision: '高', supportsFluid: true, supportsOptics: true, supportsMotion: false },
    chemical: { acidResistance: '高', alkaliResistance: '中', solventResistance: '中', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: true },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'gas-delivery-set',
    name: '导气管 / 集气装置',
    shortLabel: '导气',
    description: '承担气体导出、转移和收集，是许多化学实验的路线连接件。',
    category: '支撑',
    subjects: ['化学'],
    aliases: ['导管', '导气管'],
    reusable: true,
    sceneRoles: ['气路连接'],
    stateSchema: ['气泡速率', '气体体积', '密封性'],
    ports: ['gas-in', 'gas-out', 'stopper-fit'],
    interactions: ['集气', '支撑固定'],
    reusableIn: ['氧气制备', '二氧化碳制备', '氢气制备', '电解产气'],
    compatibleWith: ['test-tube', 'erlenmeyer-flask', 'support-stand', 'measuring-cylinder'],
    modelProfile: {
      qualityTier: 'pro',
      materialFocus: ['玻璃弯管', '橡胶塞', '水下折射'],
      animationFocus: ['气泡串', '气液界面'],
      wearDetails: ['接口老化', '管壁水膜'],
    },
    physical: { transparency: '高', heatResistance: '中', conductivity: '低', precision: '中', supportsFluid: true, supportsOptics: true, supportsMotion: false },
    chemical: { acidResistance: '中', alkaliResistance: '中', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: true },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'salt-bridge',
    name: '盐桥',
    shortLabel: '盐桥',
    description: '连接两个半电池并维持离子平衡，是原电池与电化学引擎的关键桥件。',
    category: '电学',
    subjects: ['化学'],
    aliases: ['盐桥'],
    reusable: true,
    sceneRoles: ['离子平衡桥'],
    stateSchema: ['离子迁移速率', '导通状态'],
    ports: ['left-cell', 'right-cell'],
    interactions: ['导电'],
    reusableIn: ['原电池', '离子迁移演示', '电化学对比'],
    compatibleWith: ['beaker', 'electrode-set', 'meter-set', 'wire-set'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['玻璃弯桥', '内部盐溶液', '冷光边缘'],
      animationFocus: ['离子流动', '桥内辉光'],
      wearDetails: ['玻璃挂液', '接口雾化'],
    },
    physical: { transparency: '高', heatResistance: '低', conductivity: '中', precision: '中', supportsFluid: true, supportsOptics: true, supportsMotion: false },
    chemical: { acidResistance: '中', alkaliResistance: '中', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: true, supportsGasCollection: false },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'battery-pack',
    name: '电池盒',
    shortLabel: '电池盒',
    description: '标准低压电源模块，可驱动电学与电化学场景。',
    category: '电学',
    subjects: ['物理', '化学'],
    aliases: ['电池盒'],
    reusable: true,
    sceneRoles: ['电源'],
    stateSchema: ['电压', '输出状态', '余量'],
    ports: ['power-positive', 'power-negative'],
    interactions: ['导电', '接线'],
    reusableIn: ['串并联', '欧姆定律', '电解实验'],
    compatibleWith: ['wire-set', 'switch-module', 'meter-set', 'electrode-set', 'rheostat'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['塑料壳体', '金属端子', '标签面板'],
      animationFocus: ['端子辉光', '状态灯变化'],
      wearDetails: ['边角磨损', '螺丝痕迹'],
    },
    physical: { transparency: '低', heatResistance: '中', conductivity: '高', precision: '中', supportsFluid: false, supportsOptics: false, supportsMotion: false },
    chemical: { acidResistance: '低', alkaliResistance: '低', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'wire-set',
    name: '导线组',
    shortLabel: '导线',
    description: '承接电路连接与信号反馈，是电学器材复用的基础连接层。',
    category: '电学',
    subjects: ['物理', '化学'],
    aliases: ['导线', '导线组'],
    reusable: true,
    sceneRoles: ['连接件'],
    stateSchema: ['通断', '电流脉冲', '接触质量'],
    ports: ['power-in', 'power-out', 'clip-head'],
    interactions: ['接线', '导电'],
    reusableIn: ['串并联', '原电池', '电解实验', '欧姆定律'],
    compatibleWith: ['battery-pack', 'switch-module', 'meter-set', 'bulb-module', 'electrode-set', 'rheostat'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['橡胶包覆', '夹头金属', '弯曲形变'],
      animationFocus: ['导电脉冲', '接线吸附'],
      wearDetails: ['线皮反光', '夹头划痕'],
    },
    physical: { transparency: '低', heatResistance: '中', conductivity: '高', precision: '中', supportsFluid: false, supportsOptics: false, supportsMotion: true },
    chemical: { acidResistance: '低', alkaliResistance: '低', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'switch-module',
    name: '开关',
    shortLabel: '开关',
    description: '控制通断与演示电路状态切换，可复用于物理和电化学供电控制。',
    category: '电学',
    subjects: ['物理', '化学'],
    aliases: ['开关'],
    reusable: true,
    sceneRoles: ['通断控制器'],
    stateSchema: ['闭合状态', '接触火花'],
    ports: ['input', 'output'],
    interactions: ['接线', '导电'],
    reusableIn: ['串并联', '电解控制', '器材通断演示'],
    compatibleWith: ['battery-pack', 'wire-set', 'bulb-module', 'meter-set'],
    modelProfile: {
      qualityTier: 'pro',
      materialFocus: ['拨杆金属', '底座包漆'],
      animationFocus: ['拨杆切换', '接点火花'],
      wearDetails: ['接点灼痕', '底座掉漆'],
    },
    physical: { transparency: '低', heatResistance: '中', conductivity: '高', precision: '中', supportsFluid: false, supportsOptics: false, supportsMotion: true },
    chemical: { acidResistance: '低', alkaliResistance: '低', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'bulb-module',
    name: '灯泡',
    shortLabel: '灯泡',
    description: '将电流可视化为亮度，是最直观的电路结果件。',
    category: '电学',
    subjects: ['物理'],
    aliases: ['灯泡', '电铃'],
    reusable: true,
    sceneRoles: ['结果反馈器'],
    stateSchema: ['亮度', '发热', '灯丝状态'],
    ports: ['input', 'output'],
    interactions: ['导电', '读数'],
    reusableIn: ['串并联', '电路判通'],
    compatibleWith: ['battery-pack', 'wire-set', 'switch-module'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['玻壳', '灯丝', '金属螺口'],
      animationFocus: ['亮度变化', '灯丝发热'],
      wearDetails: ['玻璃反光', '金属氧化'],
    },
    physical: { transparency: '高', heatResistance: '中', conductivity: '高', precision: '中', supportsFluid: false, supportsOptics: true, supportsMotion: false },
    chemical: { acidResistance: '低', alkaliResistance: '低', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'meter-set',
    name: '电表组',
    shortLabel: '电表',
    description: '包括电流表和电压表，可为物理与电化学系统提供量化读数。',
    category: '测量',
    subjects: ['物理', '化学'],
    aliases: ['电流表', '电压表', '电流计', '电表组'],
    reusable: true,
    sceneRoles: ['读数器'],
    stateSchema: ['示数', '指针角度', '量程'],
    ports: ['series-slot', 'parallel-slot'],
    interactions: ['接线', '读数', '导电'],
    reusableIn: ['欧姆定律', '原电池', '导电性'],
    compatibleWith: ['battery-pack', 'wire-set', 'switch-module', 'rheostat', 'resistor-board', 'electrode-set'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['面罩玻璃', '刻度盘', '指针'],
      animationFocus: ['指针抖动', 'halo 呼吸'],
      wearDetails: ['塑料边框细刮痕', '刻度罩反光'],
    },
    physical: { transparency: '中', heatResistance: '低', conductivity: '高', precision: '高', supportsFluid: false, supportsOptics: true, supportsMotion: true },
    chemical: { acidResistance: '低', alkaliResistance: '低', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'resistor-board',
    name: '定值电阻',
    shortLabel: '电阻',
    description: '稳定提供阻值，是欧姆定律和电路量化的标准对象。',
    category: '电学',
    subjects: ['物理'],
    aliases: ['定值电阻'],
    reusable: true,
    sceneRoles: ['被测元件'],
    stateSchema: ['阻值', '表面温升'],
    ports: ['lead-left', 'lead-right'],
    interactions: ['导电', '读数'],
    reusableIn: ['欧姆定律', '串并联比较'],
    compatibleWith: ['wire-set', 'meter-set', 'rheostat', 'battery-pack'],
    modelProfile: {
      qualityTier: 'pro',
      materialFocus: ['陶瓷管', '色环', '金属引脚'],
      animationFocus: ['高光变化', '温升反馈'],
      wearDetails: ['色环轻磨损'],
    },
    physical: { transparency: '低', heatResistance: '中', conductivity: '高', precision: '高', supportsFluid: false, supportsOptics: false, supportsMotion: false },
    chemical: { acidResistance: '低', alkaliResistance: '低', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'rheostat',
    name: '滑动变阻器',
    shortLabel: '滑变',
    description: '通过可调接触点改变电阻，是实验引擎中的变量控制器。',
    category: '电学',
    subjects: ['物理'],
    aliases: ['滑动变阻器'],
    reusable: true,
    sceneRoles: ['变量控制器'],
    stateSchema: ['滑块位置', '有效阻值', '接触状态'],
    ports: ['input', 'slider-contact', 'output'],
    interactions: ['调阻', '接线', '导电'],
    reusableIn: ['欧姆定律', '保护电路', '亮度调节'],
    compatibleWith: ['battery-pack', 'wire-set', 'meter-set', 'resistor-board'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['电阻丝', '滑块接触片', '木质底座'],
      animationFocus: ['滑块移动', '接触辉光'],
      wearDetails: ['电阻丝氧化色', '滑轨磨损'],
    },
    physical: { transparency: '低', heatResistance: '中', conductivity: '高', precision: '高', supportsFluid: false, supportsOptics: false, supportsMotion: true },
    chemical: { acidResistance: '低', alkaliResistance: '低', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'electrode-set',
    name: '电极组',
    shortLabel: '电极',
    description: '可作为导体插入电解质或半电池，是电学和化学之间的桥。',
    category: '电学',
    subjects: ['化学', '物理'],
    aliases: ['电极', '锌粒', '铁钉'],
    reusable: true,
    sceneRoles: ['电化学界面'],
    stateSchema: ['极性', '表面沉积', '腐蚀程度', '浸没深度'],
    ports: ['solution-contact', 'wire-contact'],
    interactions: ['导电', '接线', '读数'],
    reusableIn: ['原电池', '电解水', '金属置换', '导电性'],
    compatibleWith: ['beaker', 'wire-set', 'battery-pack', 'meter-set', 'support-stand'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['金属镜面', '腐蚀层', '沉积颗粒'],
      animationFocus: ['离子云', '沉积增长', '电极辉光'],
      wearDetails: ['边缘氧化', '表面划痕'],
    },
    physical: { transparency: '低', heatResistance: '高', conductivity: '高', precision: '中', supportsFluid: true, supportsOptics: false, supportsMotion: false },
    chemical: { acidResistance: '中', alkaliResistance: '中', solventResistance: '中', supportsHeatingReaction: false, supportsReactionObservation: true, supportsGasCollection: true },
    biological: { sterileReady: false, supportsSpecimen: false, supportsMicroscopy: false, supportsCulture: false, supportsStaining: false },
  },
  {
    id: 'microscope',
    name: '显微镜',
    shortLabel: '显微镜',
    description: '高价值观测器材，可承接细胞、微生物和组织切片等多个生物实验。',
    category: '观察',
    subjects: ['生物'],
    aliases: ['显微镜'],
    reusable: true,
    sceneRoles: ['光学观察系统'],
    stateSchema: ['焦距', '倍率', '光照强度', '载物台位置'],
    ports: ['slide-stage', 'focus-knob', 'light-source'],
    interactions: ['显微观察', '读数'],
    reusableIn: ['口腔上皮细胞', '洋葱表皮', '叶片气孔', '血涂片', '草履虫'],
    compatibleWith: ['slide-kit', 'tweezers', 'dropper-pipette'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['涂装金属', '镜头玻璃', '调焦旋钮'],
      animationFocus: ['调焦', '镜头切换', '光圈变化'],
      wearDetails: ['边角磨损', '镜片反射'],
    },
    physical: { transparency: '中', heatResistance: '低', conductivity: '低', precision: '高', supportsFluid: false, supportsOptics: true, supportsMotion: true },
    chemical: { acidResistance: '低', alkaliResistance: '低', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: true, supportsSpecimen: true, supportsMicroscopy: true, supportsCulture: false, supportsStaining: true },
  },
  {
    id: 'slide-kit',
    name: '载玻片 / 盖玻片',
    shortLabel: '玻片',
    description: '承接样本、染液和封片流程，是显微观察的底层标准载体。',
    category: '生物',
    subjects: ['生物'],
    aliases: ['载玻片', '盖玻片'],
    reusable: true,
    sceneRoles: ['样本载体'],
    stateSchema: ['样本位置', '染色程度', '封片完整度'],
    ports: ['specimen-slot', 'stain-drop'],
    interactions: ['取样', '染色封片', '显微观察'],
    reusableIn: ['洋葱表皮', '口腔上皮', '血涂片', '叶片切片'],
    compatibleWith: ['microscope', 'dropper-pipette', 'tweezers'],
    modelProfile: {
      qualityTier: 'hero',
      materialFocus: ['超薄玻璃', '液滴边缘', '样本纹理'],
      animationFocus: ['染液铺展', '盖片贴合'],
      wearDetails: ['玻片细边高光'],
    },
    physical: { transparency: '高', heatResistance: '低', conductivity: '低', precision: '高', supportsFluid: true, supportsOptics: true, supportsMotion: false },
    chemical: { acidResistance: '中', alkaliResistance: '中', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: true, supportsGasCollection: false },
    biological: { sterileReady: true, supportsSpecimen: true, supportsMicroscopy: true, supportsCulture: false, supportsStaining: true },
  },
  {
    id: 'petri-dish',
    name: '培养皿',
    shortLabel: '培养皿',
    description: '适合放置样品、种子和培养基，是生物类实验引擎的重要平面容器。',
    category: '生物',
    subjects: ['生物'],
    aliases: ['培养皿'],
    reusable: true,
    sceneRoles: ['平面培养容器'],
    stateSchema: ['湿度', '样本密度', '培养状态'],
    ports: ['sample-in', 'drop-in', 'cover-open'],
    interactions: ['培养', '取样', '滴加'],
    reusableIn: ['种子萌发', '组织平铺观察', '微生物培养演示'],
    compatibleWith: ['dropper-pipette', 'tweezers', 'microscope'],
    modelProfile: {
      qualityTier: 'pro',
      materialFocus: ['浅盘透明塑料', '盖体反光', '水汽薄雾'],
      animationFocus: ['水膜变化', '样本展开'],
      wearDetails: ['边缘轻擦痕'],
    },
    physical: { transparency: '高', heatResistance: '低', conductivity: '低', precision: '中', supportsFluid: true, supportsOptics: true, supportsMotion: false },
    chemical: { acidResistance: '低', alkaliResistance: '低', solventResistance: '低', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: true, supportsSpecimen: true, supportsMicroscopy: false, supportsCulture: true, supportsStaining: false },
  },
  {
    id: 'tweezers',
    name: '镊子',
    shortLabel: '镊子',
    description: '精细取样和摆放组织样本的基础工具，可跨显微与培养场景复用。',
    category: '生物',
    subjects: ['生物', '化学'],
    aliases: ['镊子', '夹子'],
    reusable: true,
    sceneRoles: ['精细抓取工具'],
    stateSchema: ['开合角度', '夹持状态'],
    ports: ['grip-tip'],
    interactions: ['取样'],
    reusableIn: ['显微制片', '种子摆放', '化学取物'],
    compatibleWith: ['slide-kit', 'petri-dish', 'beaker', 'microscope'],
    modelProfile: {
      qualityTier: 'core',
      materialFocus: ['不锈钢反光', '尖端闭合'],
      animationFocus: ['夹取动作'],
      wearDetails: ['尖端微刮痕'],
    },
    physical: { transparency: '低', heatResistance: '中', conductivity: '中', precision: '高', supportsFluid: false, supportsOptics: false, supportsMotion: true },
    chemical: { acidResistance: '中', alkaliResistance: '中', solventResistance: '中', supportsHeatingReaction: false, supportsReactionObservation: false, supportsGasCollection: false },
    biological: { sterileReady: true, supportsSpecimen: true, supportsMicroscopy: false, supportsCulture: true, supportsStaining: false },
  },
];

const mutationRules: ApparatusMutationSuggestion[] = [
  {
    id: 'electrolysis-core',
    title: '电解 / 导电复合实验',
    summary: '把容器、电极、电源和导线拼起来，就能从导电性演示快速魔改到电解水、电解质对比。',
    engineValue: '同一套器材骨架可复用到电解水、导电性、金属电解和气体收集。',
    requiredIds: ['beaker', 'electrode-set', 'battery-pack', 'wire-set'],
    controllables: ['电压', '电极间距', '溶液浓度', '浸没深度'],
    observables: ['气泡速率', '电流大小', '沉积速度', '产气体积'],
    morphTargets: ['电解水', '导电性比较', '电极析出', '气体制备'],
    subjects: ['化学', '物理'],
  },
  {
    id: 'galvanic-core',
    title: '原电池 / 金属反应实验',
    summary: '用两组电极、容器、电表和导线，可以在一个引擎里覆盖原电池、金属活泼性和离子迁移。',
    engineValue: '把“电极材质 + 溶液种类 + 接线方式”参数化后，可衍生多个高中化学实验。',
    requiredIds: ['beaker', 'electrode-set', 'salt-bridge', 'wire-set', 'meter-set'],
    controllables: ['金属种类', '电解液种类', '盐桥是否接入'],
    observables: ['指针偏转', '电极腐蚀', '金属沉积', '离子云迁移'],
    morphTargets: ['原电池', '金属置换', '电极腐蚀演示'],
    subjects: ['化学'],
  },
  {
    id: 'acid-base-core',
    title: '有色反应 / 滴定实验',
    summary: '烧杯、锥形瓶、滴管和量筒组合后，能够覆盖显色、滴定、定量配制等高频化学操作。',
    engineValue: '把液滴、颜色、pH、沉淀和体积做成状态层，同一器材就能驱动多种反应。',
    requiredIds: ['beaker', 'erlenmeyer-flask', 'dropper-pipette', 'measuring-cylinder'],
    controllables: ['加入体积', '滴速', '指示剂种类', '混合顺序'],
    observables: ['颜色渐变', '终点突变', '沉淀生成', '液面刻度'],
    morphTargets: ['酸碱中和', '滴定', '指示剂彩虹', '沉淀反应'],
    subjects: ['化学'],
  },
  {
    id: 'circuit-core',
    title: '串并联 / 欧姆定律实验',
    summary: '电池盒、导线、开关、灯泡、电表、电阻和滑变构成完整的基础电学引擎。',
    engineValue: '同一批器材通过拓扑切换，就能在串联、并联、欧姆定律和亮度调节间复用。',
    requiredIds: ['battery-pack', 'wire-set', 'switch-module', 'meter-set'],
    controllables: ['连线拓扑', '滑变位置', '负载阻值'],
    observables: ['灯泡亮度', '电表读数', '接点火花', '导线脉冲'],
    morphTargets: ['串联电路', '并联电路', '欧姆定律', '亮度调节'],
    subjects: ['物理'],
  },
  {
    id: 'microscopy-core',
    title: '显微观察实验',
    summary: '显微镜、玻片、滴管和镊子构成稳定的生物观察链路，可复用到细胞与微生物观察。',
    engineValue: '把样本贴附、染色、焦距和光照建模后，一个显微系统就能覆盖多个实验。',
    requiredIds: ['microscope', 'slide-kit', 'dropper-pipette', 'tweezers'],
    controllables: ['焦距', '倍率', '染色浓度', '样本位置'],
    observables: ['成像清晰度', '细胞轮廓', '染色差异', '载物台定位'],
    morphTargets: ['洋葱表皮', '口腔上皮', '血涂片', '叶片气孔'],
    subjects: ['生物'],
  },
  {
    id: 'culture-core',
    title: '培养 / 萌发实验',
    summary: '培养皿、滴管、镊子和支撑容器可扩展成萌发、湿润对照和组织培养演示。',
    engineValue: '把湿度、样本数量和时间进度做成状态，就能把静态器材升级为生物实验引擎。',
    requiredIds: ['petri-dish', 'dropper-pipette', 'tweezers'],
    controllables: ['湿度', '光照', '样本数量', '培养时间'],
    observables: ['萌发长度', '水膜变化', '样本扩散', '组间差异'],
    morphTargets: ['种子萌发', '组织培养演示', '对照培养'],
    subjects: ['生物'],
  },
  {
    id: 'gas-prep-core',
    title: '加热 / 集气实验',
    summary: '试管、支架、酒精灯和导气装置可以复用成氧气、二氧化碳、氢气等制备实验。',
    engineValue: '核心不是单个实验，而是“热源 + 反应容器 + 气路 + 收集读数”的组合模板。',
    requiredIds: ['test-tube', 'support-stand', 'alcohol-burner', 'gas-delivery-set'],
    controllables: ['火焰高度', '药品加入顺序', '导气路径', '水槽液位'],
    observables: ['气泡串', '冷凝挂壁', '产气速度', '集气体积'],
    morphTargets: ['氧气制备', '二氧化碳制备', '氢气制备', '受热分解'],
    subjects: ['化学'],
  },
];

function uniq<T>(values: T[]) {
  return [...new Set(values)];
}

function normalizeTerm(value: string) {
  return value.trim().toLowerCase();
}

export function getApparatusById(id: string) {
  return APPARATUS_CATALOG.find((item) => item.id === id) ?? null;
}

export function getApparatusMatchesForExperiment(experiment?: ExperimentConfig | null): ApparatusMatch[] {
  if (!experiment) return [];
  const tokens = uniq(
    [
      experiment.title,
      experiment.curriculum.theme,
      experiment.curriculum.unit,
      ...experiment.capabilities,
      ...experiment.equipment.flatMap((item) => [item.name, item.type]),
    ]
      .join('｜')
      .split(/[｜、，,\s/]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );

  return APPARATUS_CATALOG.map((apparatus) => {
    const matchedTerms = tokens.filter((token) => apparatus.aliases.some((alias) => normalizeTerm(alias).includes(normalizeTerm(token)) || normalizeTerm(token).includes(normalizeTerm(alias))));
    return matchedTerms.length ? { apparatusId: apparatus.id, matchedTerms } : null;
  }).filter((item): item is ApparatusMatch => Boolean(item));
}

export function getRecommendedApparatusIds(experiment?: ExperimentConfig | null) {
  if (!experiment) return ['beaker', 'dropper-pipette', 'support-stand', 'battery-pack', 'microscope'];

  const matches = getApparatusMatchesForExperiment(experiment);
  const directIds = matches.map((item) => item.apparatusId);
  const fallbackIds = subjectFallbackLoadout[mapExperimentSubjectToApparatusSubject(experiment.subject)] ?? subjectFallbackLoadout['通用'];
  return uniq([...directIds, ...fallbackIds]).slice(0, 8);
}

export function deriveApparatusEngineSnapshot(selectedIds: string[]): ApparatusEngineSnapshot {
  const selected = selectedIds.map((id) => getApparatusById(id)).filter((item): item is ApparatusDefinition => Boolean(item));
  const interactions = uniq(selected.flatMap((item) => item.interactions));
  const stateSchema = uniq(selected.flatMap((item) => item.stateSchema));
  const ports = uniq(selected.flatMap((item) => item.ports));
  const materialFocus = uniq(selected.flatMap((item) => item.modelProfile.materialFocus)).slice(0, 10);
  const qualityTier = selected.some((item) => item.modelProfile.qualityTier === 'hero')
    ? 'hero'
    : selected.some((item) => item.modelProfile.qualityTier === 'pro')
      ? 'pro'
      : 'core';
  const crossSubjectCount = selected.filter((item) => item.subjects.length > 1).length;

  const physicalHighlights = uniq([
    selected.some((item) => item.physical.supportsFluid) ? '液体系统' : '',
    selected.some((item) => item.physical.supportsOptics) ? '光学观察' : '',
    selected.some((item) => item.physical.conductivity === '高') ? '导电回路' : '',
    selected.some((item) => item.physical.heatResistance === '高') ? '高温耐受' : '',
    selected.some((item) => item.physical.precision === '高') ? '精密读数' : '',
  ].filter(Boolean));

  const chemicalHighlights = uniq([
    selected.some((item) => item.chemical.supportsReactionObservation) ? '显色 / 沉淀观察' : '',
    selected.some((item) => item.chemical.supportsHeatingReaction) ? '受热反应' : '',
    selected.some((item) => item.chemical.supportsGasCollection) ? '产气收集' : '',
    selected.some((item) => item.chemical.acidResistance === '高') ? '耐酸体系' : '',
    selected.some((item) => item.chemical.alkaliResistance === '中' || item.chemical.alkaliResistance === '高') ? '碱性体系' : '',
  ].filter(Boolean));

  const biologicalHighlights = uniq([
    selected.some((item) => item.biological.supportsMicroscopy) ? '显微观察链路' : '',
    selected.some((item) => item.biological.supportsCulture) ? '培养环境' : '',
    selected.some((item) => item.biological.supportsStaining) ? '染色封片' : '',
    selected.some((item) => item.biological.sterileReady) ? '无菌兼容' : '',
    selected.some((item) => item.biological.supportsSpecimen) ? '样本承载' : '',
  ].filter(Boolean));

  const engineScore = Math.min(100, selected.length * 8 + interactions.length * 3 + stateSchema.length * 2 + ports.length + crossSubjectCount * 4);

  return {
    selectedIds,
    crossSubjectCount,
    engineScore,
    stateSchema,
    ports,
    interactions,
    materialFocus,
    qualityTier,
    physicalHighlights,
    chemicalHighlights,
    biologicalHighlights,
  };
}

export function buildApparatusMutationSuggestions(selectedIds: string[], experiment?: ExperimentConfig | null) {
  const selectedSet = new Set(selectedIds);
  const subject = mapExperimentSubjectToApparatusSubject(experiment?.subject);
  const matched = mutationRules.filter((rule) => rule.requiredIds.every((id) => selectedSet.has(id)) && rule.subjects.includes(subject));
  if (matched.length) return matched;

  const fallback = mutationRules.filter((rule) => rule.requiredIds.filter((id) => selectedSet.has(id)).length >= Math.max(2, Math.ceil(rule.requiredIds.length / 2)));
  return fallback.slice(0, 3);
}

export function getExperimentApparatusSummary(experiment?: ExperimentConfig | null) {
  const recommendedIds = getRecommendedApparatusIds(experiment);
  const matches = getApparatusMatchesForExperiment(experiment);
  const matchedCount = matches.length;
  const unmatchedEquipment = experiment
    ? experiment.equipment
        .map((item) => item.name)
        .filter((name) => !matches.some((match) => getApparatusById(match.apparatusId)?.aliases.some((alias) => normalizeTerm(alias).includes(normalizeTerm(name)) || normalizeTerm(name).includes(normalizeTerm(alias)))))
        .slice(0, 6)
    : [];

  return {
    recommendedIds,
    matches,
    matchedCount,
    unmatchedEquipment,
  };
}

export const apparatusSubjectOptions: Array<{ value: ApparatusSubject | '全部'; label: string }> = [
  { value: '全部', label: '全部学科' },
  { value: '通用', label: '通用' },
  { value: '物理', label: '物理' },
  { value: '化学', label: '化学' },
  { value: '生物', label: '生物' },
];

export const apparatusCategoryOptions = ['全部', '容器', '加热', '支撑', '转移', '观察', '电学', '测量', '生物'] as const;

export function sortCatalogForWorkbench(ids: string[]) {
  const selected = new Set(ids);
  return [...APPARATUS_CATALOG].sort((left, right) => {
    const leftScore = (selected.has(left.id) ? 20 : 0) + left.subjects.length + left.interactions.length;
    const rightScore = (selected.has(right.id) ? 20 : 0) + right.subjects.length + right.interactions.length;
    return rightScore - leftScore;
  });
}

export function summarizeCompatibility(selectedIds: string[]) {
  const selected = selectedIds.map((id) => getApparatusById(id)).filter((item): item is ApparatusDefinition => Boolean(item));
  return selected.flatMap((item) =>
    item.compatibleWith
      .filter((compatibleId) => selectedIds.includes(compatibleId))
      .map((compatibleId) => `${item.shortLabel} ⇄ ${getApparatusById(compatibleId)?.shortLabel ?? compatibleId}`),
  ).filter((value, index, all) => all.indexOf(value) === index).slice(0, 12);
}
