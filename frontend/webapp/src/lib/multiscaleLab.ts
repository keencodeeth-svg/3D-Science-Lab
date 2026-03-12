import type {
  ExperimentConfig,
  ExperimentEquipment,
  ExperimentEquipmentComponent,
  ExperimentEquipmentProfile,
  ExperimentMaterialModel,
  ExperimentMaterialProperty,
  ExperimentMicroModel,
  ExperimentMicroSpecies,
  ExperimentMultiscaleModel,
  ExperimentReactionRule,
  ExperimentStep,
  MultiscaleLens,
} from '../types/experiment';

export interface ExperimentMultiscaleView extends ExperimentMultiscaleModel {
  source: 'configured' | 'derived';
  stats: {
    equipmentProfiles: number;
    componentCount: number;
    materialCount: number;
    speciesCount: number;
    reactionRuleCount: number;
  };
}

export interface FocusedExperimentMultiscaleView {
  multiscale: ExperimentMultiscaleView;
  focusEquipmentId: string;
  focusEquipmentLabel: string;
  focusProfile: ExperimentEquipmentProfile | null;
  focusMaterialIds: string[];
  focusMaterials: ExperimentMaterialModel[];
  relevantRules: ExperimentReactionRule[];
  activeRule: ExperimentReactionRule | null;
  species: ExperimentMicroSpecies[];
  componentCount: number;
  componentSummary: string;
  materialCount: number;
  materialSummary: string;
  speciesCount: number;
  speciesSummary: string;
  ruleNarrative: string;
  ruleSummary: string;
  focusedLens: MultiscaleLens;
  traceSummary: string;
}

const MULTISCALE_LENS_NOTES: Record<MultiscaleLens, string> = {
  macro: '器材与组件约束优先',
  meso: '材料属性与结构反馈优先',
  micro: '粒子解释按需展开',
};

interface MaterialTemplate {
  id: string;
  name: string;
  category: string;
  formula?: string;
  state: ExperimentMaterialModel['state'];
  properties: ExperimentMaterialProperty[];
  microModel?: ExperimentMicroModel;
}

const MATERIAL_TEMPLATES: Record<string, MaterialTemplate> = {
  copper: {
    id: 'copper',
    name: '铜',
    category: 'metal',
    formula: 'Cu',
    state: 'solid',
    properties: [
      { key: 'conductivity', label: '导电性', value: 96, unit: '%' },
      { key: 'ductility', label: '延展性', value: 88, unit: '%' },
    ],
    microModel: {
      narrative: '铜原子在金属晶格中排列，外层电子可在晶格间整体漂移。',
      species: [{ id: 'cu-atom', name: '铜原子', formula: 'Cu', color: '#f5a268', particleCountHint: 64, arrangement: 'lattice' }],
      interactions: ['闭合回路时电子定向移动', '温升会增加晶格振动并影响电阻'],
    },
  },
  tungsten: {
    id: 'tungsten',
    name: '钨',
    category: 'metal',
    formula: 'W',
    state: 'solid',
    properties: [
      { key: 'meltingPoint', label: '耐高温', value: 95, unit: '%' },
      { key: 'resistance', label: '电阻特征', value: 72, unit: '%' },
    ],
    microModel: {
      narrative: '钨丝在通电后因电子碰撞升温发光，但整体仍保持高熔点稳定。',
      species: [{ id: 'w-atom', name: '钨原子', formula: 'W', color: '#cfd6df', particleCountHint: 48, arrangement: 'lattice' }],
      interactions: ['电子与晶格碰撞发热', '温度升高后辐射出可见光'],
    },
  },
  zinc: {
    id: 'zinc',
    name: '锌',
    category: 'metal',
    formula: 'Zn',
    state: 'solid',
    properties: [
      { key: 'reactivity', label: '反应活性', value: 74, unit: '%' },
      { key: 'electrodePotential', label: '电极倾向', value: '较易失电子' },
    ],
    microModel: {
      narrative: '锌原子更容易失去电子，适合作为原电池负极材料。',
      species: [{ id: 'zn-atom', name: '锌原子', formula: 'Zn', color: '#b6c3d1', particleCountHint: 42, arrangement: 'lattice' }],
      interactions: ['在电化学条件下较易失电子', '与电解质共同决定电池输出'],
    },
  },
  graphite: {
    id: 'graphite',
    name: '石墨',
    category: 'carbon',
    formula: 'C',
    state: 'solid',
    properties: [
      { key: 'conductivity', label: '导电性', value: 68, unit: '%' },
      { key: 'layered', label: '层状结构', value: '明显' },
    ],
    microModel: {
      narrative: '石墨由层状碳原子网络构成，层内电子较容易移动。',
      species: [{ id: 'c-network', name: '碳原子网络', formula: 'C', color: '#6c7688', particleCountHint: 56, arrangement: 'network' }],
      interactions: ['层状结构可导电', '常作为电极或导电部件'],
    },
  },
  glass: {
    id: 'glass',
    name: '玻璃',
    category: 'silicate',
    formula: 'SiO2',
    state: 'solid',
    properties: [
      { key: 'transparency', label: '透明度', value: 92, unit: '%' },
      { key: 'insulation', label: '绝缘性', value: 90, unit: '%' },
    ],
    microModel: {
      narrative: '玻璃内部是无规则的硅氧网络，因此透明但不易导电。',
      species: [{ id: 'sio2-network', name: '硅氧网络', formula: 'SiO2', color: '#d8ecff', particleCountHint: 52, arrangement: 'network' }],
      interactions: ['网络结构无长程晶格', '可透光但限制电子自由移动'],
    },
  },
  plastic: {
    id: 'plastic',
    name: '塑料',
    category: 'polymer',
    state: 'solid',
    properties: [
      { key: 'insulation', label: '绝缘性', value: 88, unit: '%' },
      { key: 'moldability', label: '可塑性', value: 82, unit: '%' },
    ],
    microModel: {
      narrative: '塑料由长链聚合物组成，链段缠绕形成轻质绝缘外壳。',
      species: [{ id: 'polymer-chain', name: '聚合物链', color: '#7bc7ff', particleCountHint: 28, arrangement: 'chain' }],
      interactions: ['长链结构降低电子自由度', '适合外壳与绝缘层'],
    },
  },
  rubber: {
    id: 'rubber',
    name: '橡胶',
    category: 'polymer',
    state: 'solid',
    properties: [
      { key: 'elasticity', label: '弹性', value: 91, unit: '%' },
      { key: 'insulation', label: '绝缘性', value: 84, unit: '%' },
    ],
    microModel: {
      narrative: '橡胶链可卷曲和伸展，受压后容易恢复原状。',
      species: [{ id: 'rubber-chain', name: '弹性聚合链', color: '#8dd3b5', particleCountHint: 26, arrangement: 'chain' }],
      interactions: ['受力后链段伸展', '释放后回缩恢复形状'],
    },
  },
  steel: {
    id: 'steel',
    name: '钢',
    category: 'alloy',
    formula: 'Fe-C',
    state: 'solid',
    properties: [
      { key: 'rigidity', label: '刚性', value: 90, unit: '%' },
      { key: 'elasticity', label: '弹性回复', value: 72, unit: '%' },
    ],
    microModel: {
      narrative: '钢中铁原子与少量碳原子共同形成合金晶格，使器材兼具强度与弹性。',
      species: [{ id: 'steel-lattice', name: '钢合金晶格', formula: 'Fe-C', color: '#b7c4d2', particleCountHint: 46, arrangement: 'lattice' }],
      interactions: ['受力时晶格发生微小形变', '回弹能力决定测量和支撑部件稳定性'],
    },
  },
  iron: {
    id: 'iron',
    name: '铁',
    category: 'metal',
    formula: 'Fe',
    state: 'solid',
    properties: [
      { key: 'magnetism', label: '易磁化', value: 82, unit: '%' },
      { key: 'strength', label: '结构强度', value: 86, unit: '%' },
    ],
    microModel: {
      narrative: '铁原子组成的晶格在外磁场中可形成更一致的磁畴取向。',
      species: [{ id: 'fe-atom', name: '铁原子', formula: 'Fe', color: '#aeb8c4', particleCountHint: 44, arrangement: 'lattice' }],
      interactions: ['磁畴取向变化会影响磁现象强弱', '常用于磁铁、支架和夹具'],
    },
  },
  'magnetic-domain': {
    id: 'magnetic-domain',
    name: '磁畴',
    category: 'magnetic-structure',
    state: 'solid',
    properties: [
      { key: 'alignment', label: '取向一致性', value: '可重排' },
      { key: 'response', label: '磁场响应', value: 89, unit: '%' },
    ],
    microModel: {
      narrative: '磁性材料内部由许多磁畴组成，外加磁场会让更多磁畴朝同一方向排列。',
      species: [{ id: 'domain-cluster', name: '磁畴簇', color: '#75b9ff', particleCountHint: 24, arrangement: 'cluster' }],
      interactions: ['磁畴越一致，宏观磁效应越强', '撤去磁场后部分材料会保留剩磁'],
    },
  },
  water: {
    id: 'water',
    name: '水',
    category: 'solvent',
    formula: 'H2O',
    state: 'liquid',
    properties: [
      { key: 'polarity', label: '极性', value: '高' },
      { key: 'fluidity', label: '流动性', value: 90, unit: '%' },
    ],
    microModel: {
      narrative: '水分子不断热运动并形成短暂氢键网络，是多数溶液和生物体系的背景介质。',
      species: [{ id: 'water-molecule', name: '水分子', formula: 'H2O', color: '#6ed4ff', particleCountHint: 72, arrangement: 'flow' }],
      interactions: ['分子持续热运动', '可包围离子或小分子形成溶液'],
    },
  },
  air: {
    id: 'air',
    name: '空气',
    category: 'gas-mixture',
    state: 'gas',
    properties: [
      { key: 'compressibility', label: '可压缩性', value: 88, unit: '%' },
      { key: 'transparency', label: '透光性', value: 99, unit: '%' },
    ],
    microModel: {
      narrative: '空气由氮气、氧气等分子高速无序运动组成，既能传递压强也影响光路和燃烧。',
      species: [
        { id: 'air-n2', name: '氮分子', formula: 'N2', color: '#8798ff', particleCountHint: 48, arrangement: 'gas' },
        { id: 'air-o2', name: '氧分子', formula: 'O2', color: '#7ae8ff', particleCountHint: 18, arrangement: 'gas' },
      ],
      interactions: ['分子碰撞建立气压', '折射率变化会轻微影响光传播'],
    },
  },
  oxygen: {
    id: 'oxygen',
    name: '氧气',
    category: 'gas',
    formula: 'O2',
    state: 'gas',
    properties: [
      { key: 'oxidation', label: '助燃性', value: 93, unit: '%' },
      { key: 'density', label: '密度特征', value: '略大于空气' },
    ],
    microModel: {
      narrative: '氧分子在加热或燃烧环境中更容易参与氧化过程，决定是否能持续放热发光。',
      species: [{ id: 'o2-molecule', name: '氧分子', formula: 'O2', color: '#74f0ff', particleCountHint: 36, arrangement: 'gas' }],
      interactions: ['与可燃粒子接触时促进氧化', '气体收集本质上是分子群重新占据容器空间'],
    },
  },
  'carbon-dioxide': {
    id: 'carbon-dioxide',
    name: '二氧化碳',
    category: 'gas',
    formula: 'CO2',
    state: 'gas',
    properties: [
      { key: 'density', label: '密度特征', value: '大于空气' },
      { key: 'combustion', label: '助燃性', value: '弱' },
    ],
    microModel: {
      narrative: '二氧化碳分子扩散速度受空间和温差影响，在溶液与空气间可发生交换。',
      species: [{ id: 'co2-molecule', name: '二氧化碳分子', formula: 'CO2', color: '#c4ecff', particleCountHint: 34, arrangement: 'gas' }],
      interactions: ['在气体收集时重新分布', '进入溶液后可与体系发生进一步反应'],
    },
  },
  ethanol: {
    id: 'ethanol',
    name: '乙醇',
    category: 'fuel',
    formula: 'C2H5OH',
    state: 'liquid',
    properties: [
      { key: 'volatility', label: '挥发性', value: 82, unit: '%' },
      { key: 'flammability', label: '可燃性', value: 94, unit: '%' },
    ],
    microModel: {
      narrative: '乙醇分子受热后更易逸散到空气中，与氧分子接触后可快速发生燃烧。',
      species: [{ id: 'ethanol-molecule', name: '乙醇分子', formula: 'C2H5OH', color: '#ffcf85', particleCountHint: 28, arrangement: 'flow' }],
      interactions: ['挥发增加分子与空气接触机会', '燃烧将化学能转为热和光'],
    },
  },
  cellulose: {
    id: 'cellulose',
    name: '纤维素',
    category: 'biopolymer',
    formula: '(C6H10O5)n',
    state: 'solid',
    properties: [
      { key: 'porosity', label: '孔隙度', value: 64, unit: '%' },
      { key: 'absorption', label: '吸附性', value: 70, unit: '%' },
    ],
    microModel: {
      narrative: '纤维素纤维交织形成多孔网络，适合承载液体和染料。',
      species: [{ id: 'cellulose-fiber', name: '纤维素链', formula: '(C6H10O5)n', color: '#f4e2b8', particleCountHint: 22, arrangement: 'network' }],
      interactions: ['纤维网可吸附液体', '常作为试纸、植物支撑结构或载体'],
    },
  },
  'cell-wall': {
    id: 'cell-wall',
    name: '细胞壁',
    category: 'biostructure',
    formula: '(C6H10O5)n',
    state: 'solid',
    properties: [
      { key: 'support', label: '支撑性', value: 86, unit: '%' },
      { key: 'permeability', label: '通透性', value: '较高' },
    ],
    microModel: {
      narrative: '植物细胞壁以纤维素网络为骨架，决定细胞形态并允许水和小分子穿过。',
      species: [{ id: 'cell-wall-network', name: '细胞壁纤维网络', color: '#d9c597', particleCountHint: 24, arrangement: 'network' }],
      interactions: ['维持细胞轮廓', '与细胞膜共同影响质壁分离等现象'],
    },
  },
  'cell-membrane': {
    id: 'cell-membrane',
    name: '细胞膜',
    category: 'biomembrane',
    state: 'mixed',
    properties: [
      { key: 'selectivity', label: '选择透过性', value: 91, unit: '%' },
      { key: 'flexibility', label: '柔性', value: 76, unit: '%' },
    ],
    microModel: {
      narrative: '细胞膜由磷脂双层和蛋白质组成，能选择性允许水和溶质通过。',
      species: [{ id: 'membrane-bilayer', name: '膜双层', color: '#78d6b2', particleCountHint: 18, arrangement: 'network' }],
      interactions: ['水分子可在浓度差驱动下跨膜迁移', '膜蛋白调节物质交换与信号传递'],
    },
  },
  cytoplasm: {
    id: 'cytoplasm',
    name: '细胞质',
    category: 'biofluid',
    state: 'liquid',
    properties: [
      { key: 'hydration', label: '含水量', value: 88, unit: '%' },
      { key: 'metabolism', label: '代谢活跃度', value: '可承载' },
    ],
    microModel: {
      narrative: '细胞质是含水胶体环境，细胞器和分子在其中分散并持续发生运动。',
      species: [{ id: 'cytoplasm-cluster', name: '细胞质颗粒', color: '#9ce3ff', particleCountHint: 30, arrangement: 'solution' }],
      interactions: ['分子扩散支撑生命活动', '染色和显微观察依赖细胞质与结构的对比'],
    },
  },
  chlorophyll: {
    id: 'chlorophyll',
    name: '叶绿素',
    category: 'pigment',
    state: 'mixed',
    properties: [
      { key: 'lightAbsorption', label: '吸光性', value: 92, unit: '%' },
      { key: 'colorSignal', label: '显色特征', value: '绿色显著' },
    ],
    microModel: {
      narrative: '叶绿素分子吸收特定波长的光并参与能量转移，因此植物组织呈现稳定绿色。',
      species: [{ id: 'chlorophyll-molecule', name: '叶绿素分子', color: '#7ce57d', particleCountHint: 20, arrangement: 'cluster' }],
      interactions: ['吸收光能后参与电子转移', '显微观察时常作为植物细胞的重要识别标志'],
    },
  },
  starch: {
    id: 'starch',
    name: '淀粉',
    category: 'polysaccharide',
    formula: '(C6H10O5)n',
    state: 'mixed',
    properties: [
      { key: 'macromolecule', label: '大分子特征', value: '明显' },
      { key: 'iodineResponse', label: '碘液显色', value: '敏感' },
    ],
    microModel: {
      narrative: '淀粉由长链葡萄糖单元组成，碘分子嵌入螺旋结构后会出现蓝黑色复合显色。',
      species: [{ id: 'starch-chain', name: '淀粉链', color: '#e8f0ff', particleCountHint: 24, arrangement: 'chain' }],
      interactions: ['与碘液形成显色复合体', '被淀粉酶分解后长链逐步断裂'],
    },
  },
  'iodine-reagent': {
    id: 'iodine-reagent',
    name: '碘液',
    category: 'indicator',
    state: 'liquid',
    properties: [
      { key: 'color', label: '本色', value: '棕黄色' },
      { key: 'complexation', label: '络合显色', value: '明显' },
    ],
    microModel: {
      narrative: '碘分子进入淀粉链空腔后会改变光吸收行为，因此出现蓝黑色显色。',
      species: [{ id: 'iodine-cluster', name: '碘分子簇', color: '#8f79ff', particleCountHint: 16, arrangement: 'solution' }],
      interactions: ['遇到完整淀粉链时形成络合体', '淀粉减少后显色会减弱或消失'],
    },
  },
  amylase: {
    id: 'amylase',
    name: '淀粉酶',
    category: 'enzyme',
    state: 'liquid',
    properties: [
      { key: 'catalysis', label: '催化能力', value: 90, unit: '%' },
      { key: 'temperatureWindow', label: '适温范围', value: '中温最佳' },
    ],
    microModel: {
      narrative: '淀粉酶通过特定活性位点与淀粉链结合，降低断裂反应所需能量。',
      species: [{ id: 'amylase-enzyme', name: '淀粉酶分子', color: '#ffaf7a', particleCountHint: 14, arrangement: 'solution' }],
      interactions: ['与淀粉链结合后催化水解', '温度过高会让酶分子构象失活'],
    },
  },
  'indicator-dye': {
    id: 'indicator-dye',
    name: '指示剂染料',
    category: 'organic-indicator',
    state: 'liquid',
    properties: [
      { key: 'colorShift', label: '变色敏感度', value: 93, unit: '%' },
      { key: 'acidBaseResponse', label: '酸碱响应', value: '明显' },
    ],
    microModel: {
      narrative: '指示剂分子在质子化与去质子化状态之间切换，导致吸收光谱变化。',
      species: [
        { id: 'indicator-neutral', name: '指示剂分子', color: '#8f74ff', particleCountHint: 18, arrangement: 'solution' },
        { id: 'indicator-protonated', name: '质子化指示剂', color: '#ff6b89', particleCountHint: 10, arrangement: 'solution' },
      ],
      interactions: ['结合或释放质子会改变分子结构', '结构改变导致溶液呈现不同颜色'],
    },
  },
  hydronium: {
    id: 'hydronium',
    name: '水合氢离子',
    category: 'ion',
    formula: 'H3O+',
    state: 'liquid',
    properties: [
      { key: 'acidity', label: '酸性贡献', value: 95, unit: '%' },
    ],
    microModel: {
      narrative: '水合氢离子浓度越高，体系越偏酸性，更容易使指示剂分子质子化。',
      species: [{ id: 'h3o-plus', name: '水合氢离子', formula: 'H3O+', color: '#ff758f', particleCountHint: 16, arrangement: 'solution' }],
      interactions: ['与指示剂分子发生质子转移', '决定溶液的酸度表现'],
    },
  },
  hydroxide: {
    id: 'hydroxide',
    name: '氢氧根离子',
    category: 'ion',
    formula: 'OH-',
    state: 'liquid',
    properties: [
      { key: 'alkalinity', label: '碱性贡献', value: 95, unit: '%' },
    ],
    microModel: {
      narrative: '氢氧根浓度越高，体系越偏碱性，更容易促使指示剂去质子化。',
      species: [{ id: 'oh-minus', name: '氢氧根离子', formula: 'OH-', color: '#63d6a3', particleCountHint: 16, arrangement: 'solution' }],
      interactions: ['促进去质子化平衡', '改变指示剂分子吸光特征'],
    },
  },
  electrolyte: {
    id: 'electrolyte',
    name: '电解质',
    category: 'electrolyte',
    state: 'mixed',
    properties: [
      { key: 'ionTransport', label: '离子迁移能力', value: 78, unit: '%' },
      { key: 'chemicalDrive', label: '化学势差', value: '可提供电势差' },
    ],
    microModel: {
      narrative: '电解质内部离子迁移维持电荷平衡，是电池持续输出或电解过程推进的内部条件。',
      species: [
        { id: 'cation', name: '阳离子', color: '#ffb15c', particleCountHint: 20, arrangement: 'solution' },
        { id: 'anion', name: '阴离子', color: '#6ec8ff', particleCountHint: 20, arrangement: 'solution' },
      ],
      interactions: ['离子在液相或桥接结构中迁移', '维持不同区域之间的电荷平衡'],
    },
  },
  'metal-electrode': {
    id: 'metal-electrode',
    name: '金属电极',
    category: 'electrode',
    state: 'solid',
    properties: [
      { key: 'electronExchange', label: '电子交换', value: 84, unit: '%' },
      { key: 'surfaceActivity', label: '表面活性', value: '与溶液耦合' },
    ],
    microModel: {
      narrative: '金属电极表面是电子交换的界面，局部原子会与溶液中的离子形成动态平衡。',
      species: [{ id: 'electrode-lattice', name: '电极晶格', color: '#d7c999', particleCountHint: 26, arrangement: 'lattice' }],
      interactions: ['电极表面发生电子得失', '与电解质共同决定电势差和电流方向'],
    },
  },
};

function cloneMaterial(material: MaterialTemplate): ExperimentMaterialModel {
  return {
    id: material.id,
    name: material.name,
    category: material.category,
    formula: material.formula,
    state: material.state,
    properties: material.properties.map((property) => ({ ...property })),
    microModel: material.microModel
      ? {
          narrative: material.microModel.narrative,
          interactions: [...material.microModel.interactions],
          species: material.microModel.species.map((species) => ({ ...species })),
        }
      : undefined,
  };
}

function addMaterialIfMissing(map: Map<string, ExperimentMaterialModel>, materialId: string) {
  if (map.has(materialId) || !MATERIAL_TEMPLATES[materialId]) return;
  map.set(materialId, cloneMaterial(MATERIAL_TEMPLATES[materialId]));
}

function addMaterialList(map: Map<string, ExperimentMaterialModel>, materialIds: string[]) {
  materialIds.forEach((materialId) => addMaterialIfMissing(map, materialId));
}

function includesAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token));
}

function uniqueMaterialIds(materialIds: string[]) {
  return [...new Set(materialIds)].filter((materialId) => Boolean(MATERIAL_TEMPLATES[materialId]));
}

function buildExperimentContextText(experiment: ExperimentConfig) {
  return [
    experiment.id,
    experiment.title,
    experiment.subject,
    experiment.curriculum.theme,
    experiment.curriculum.unit,
    experiment.curriculum.knowledgePoints.join(' '),
    experiment.objectives.join(' '),
    experiment.scene.environment,
    experiment.scene.cameraPreset,
    experiment.equipment.map((equipment) => `${equipment.id} ${equipment.name} ${equipment.type}`).join(' '),
    experiment.steps.map((step) => `${step.id} ${step.title} ${step.actionType} ${step.targetObject} ${step.description ?? ''} ${step.successCondition}`).join(' '),
  ].join(' ').toLowerCase();
}

function getEquipmentToken(equipment: ExperimentEquipment) {
  return `${equipment.id} ${equipment.name} ${equipment.type}`.toLowerCase();
}

function inferContextMaterialIds(experiment: ExperimentConfig, contextText: string) {
  const materialIds: string[] = [];

  if (includesAny(contextText, ['电路', '电流', '电压', '欧姆', 'battery', 'wire', 'bulb', 'ammeter', 'voltmeter', 'switch', 'resistor', 'rheostat'])) {
    materialIds.push('copper', 'plastic');
  }

  if (includesAny(contextText, ['灯泡', 'bulb', '发光'])) {
    materialIds.push('tungsten');
  }

  if (includesAny(contextText, ['原电池', 'galvanic', '电极', 'electrode', '盐桥', 'salt-bridge', '电解质'])) {
    materialIds.push('metal-electrode', 'electrolyte', 'water');
  }

  if (includesAny(contextText, ['光', '折射', '反射', '透镜', '棱镜', '显微镜', '小孔', '成像', '镜', 'lens', 'prism', 'microscope', 'screen'])) {
    materialIds.push('glass', 'air');
  }

  if (includesAny(contextText, ['氧气', 'oxygen', 'collect-gas', 'gas-bottle', '助燃'])) {
    materialIds.push('oxygen', 'air', 'water');
  }

  if (includesAny(contextText, ['二氧化碳', 'carbon-dioxide', 'co2'])) {
    materialIds.push('carbon-dioxide', 'air', 'water');
  }

  if (includesAny(contextText, ['酒精', '乙醇', 'alcohol', 'ethanol', '酒精灯', 'alcohol-lamp', '燃烧', '蜡烛', 'candle'])) {
    materialIds.push('ethanol', 'oxygen', 'air');
  }

  if (includesAny(contextText, ['试纸', '石蕊', '酚酞', '指示剂', 'litmus', 'indicator', 'phenolphthalein', 'acid', 'base', '酸', '碱'])) {
    materialIds.push('indicator-dye', 'water', 'hydronium', 'hydroxide');
  }

  if (includesAny(contextText, ['淀粉', 'starch'])) {
    materialIds.push('starch', 'water');
  }

  if (includesAny(contextText, ['碘液', '碘', 'iodine'])) {
    materialIds.push('iodine-reagent', 'water');
  }

  if (includesAny(contextText, ['唾液', 'saliva', '酶', 'enzyme', 'amylase'])) {
    materialIds.push('amylase', 'water');
  }

  if (includesAny(contextText, ['细胞', 'cell', '洋葱', 'onion', '口腔上皮', '酵母', 'yeast', '质壁分离', 'plasmolysis', '显微'])) {
    materialIds.push('cell-membrane', 'cytoplasm', 'water');
  }

  if (includesAny(contextText, ['植物', '叶', '叶片', '叶绿体', '光合作用', 'photosynthesis', 'stomata', 'leaf'])) {
    materialIds.push('cell-wall', 'cell-membrane', 'cytoplasm', 'chlorophyll', 'water');
  }

  if (includesAny(contextText, ['种子', 'seed', '根', 'stem', '茎', 'bean'])) {
    materialIds.push('cell-wall', 'water');
  }

  if (includesAny(contextText, ['磁', 'magnet', '磁场'])) {
    materialIds.push('iron', 'magnetic-domain');
  }

  if (includesAny(contextText, ['弹簧', 'spring', '杠杆', 'lever', '滑轮', 'pulley', '天平', 'balance', '小车', 'cart', '砝码', 'weight', '测力计', 'scale'])) {
    materialIds.push('steel');
  }

  if (experiment.subject === '化学' && materialIds.length === 0) {
    materialIds.push('glass', 'water');
  }

  if (experiment.subject === '生物' && materialIds.length === 0) {
    materialIds.push('cell-membrane', 'cytoplasm', 'water');
  }

  if (experiment.subject === '物理' && materialIds.length === 0) {
    materialIds.push('steel', 'plastic');
  }

  return uniqueMaterialIds(materialIds);
}

function inferMaterialIdsFromEquipment(equipment: ExperimentEquipment, experiment: ExperimentConfig, contextText: string) {
  const token = getEquipmentToken(equipment);
  const materialIds: string[] = [];

  if (includesAny(token, ['wire', '导线', 'connector', 'circuit-line'])) materialIds.push('copper', 'plastic');
  if (includesAny(token, ['battery', '电池', 'power'])) materialIds.push('zinc', 'graphite', 'electrolyte', 'plastic');
  if (includesAny(token, ['bulb', '灯泡', 'light'])) materialIds.push('glass', 'tungsten', 'copper');
  if (includesAny(token, ['switch', '开关'])) materialIds.push('copper', 'plastic');
  if (includesAny(token, ['resistor', '变阻器', 'rheostat', 'slider'])) materialIds.push('graphite', 'copper', 'plastic');
  if (includesAny(token, ['ammeter', 'voltmeter', '电流表', '电压表', 'meter'])) materialIds.push('copper', 'glass', 'plastic');
  if (includesAny(token, ['electrode', '电极'])) materialIds.push('metal-electrode', 'electrolyte');
  if (includesAny(token, ['salt-bridge', '盐桥'])) materialIds.push('electrolyte', 'water', 'cellulose');

  if (includesAny(token, ['dropper', '滴管', 'burette', 'pipette'])) materialIds.push('rubber', 'plastic', 'glass');
  if (includesAny(token, ['paper', '试纸'])) materialIds.push('cellulose', 'indicator-dye');
  if (includesAny(token, ['indicator', '指示剂'])) materialIds.push('indicator-dye', 'water');
  if (includesAny(token, ['solution', '溶液'])) materialIds.push('water');
  if (includesAny(token, ['starch', '淀粉'])) materialIds.push('starch', 'water');
  if (includesAny(token, ['iodine', '碘'])) materialIds.push('iodine-reagent', 'water');
  if (includesAny(token, ['saliva', '唾液'])) materialIds.push('amylase', 'water');

  if (includesAny(token, ['beaker', '烧杯', 'test-tube', '试管', 'flask', '锥形瓶', '量筒', 'cylinder', 'bottle', '集气瓶', 'collector', 'dish', '培养皿', 'slide', 'coverslip', '载玻片', '盖玻片'])) {
    materialIds.push('glass');
  }

  if (includesAny(token, ['microscope', '显微镜', 'lens', '透镜', 'prism', '棱镜', 'mirror', '镜', 'screen', '屏'])) {
    materialIds.push('glass', 'plastic', 'steel', 'air');
  }

  if (includesAny(token, ['stand', 'rack', 'holder', 'support', '铁架台', '架', '夹', 'water-tank', '槽'])) {
    materialIds.push('steel', 'plastic');
  }

  if (includesAny(token, ['lamp', '酒精灯', 'candle', '蜡烛', 'heating', 'heater'])) {
    materialIds.push('ethanol', 'oxygen', 'air', 'glass');
  }

  if (includesAny(token, ['warm-bath', 'water-bath', '温水', 'bath'])) {
    materialIds.push('water', 'glass');
  }

  if (includesAny(token, ['magnet', '磁铁'])) {
    materialIds.push('iron', 'magnetic-domain');
  }

  if (includesAny(token, ['spring', '弹簧', 'scale', '测力计', 'balance', '天平', 'pulley', '滑轮', 'lever', '杠杆', 'cart', '小车', 'weight', '砝码'])) {
    materialIds.push('steel', 'plastic');
  }

  if (includesAny(token, ['onion', '洋葱', 'cell', '细胞', 'yeast', '酵母', 'leaf', '叶', 'seed', '种子', 'sample', '样本'])) {
    materialIds.push('cell-membrane', 'cytoplasm', 'water');
  }

  if (includesAny(token, ['leaf', '叶', 'plant', '植物'])) {
    materialIds.push('cell-wall', 'chlorophyll');
  }

  if (experiment.subject === '化学' && includesAny(token, ['solution-a', 'acid', '酸'])) {
    materialIds.push('hydronium');
  }

  if (experiment.subject === '化学' && includesAny(token, ['solution-b', 'base', '碱'])) {
    materialIds.push('hydroxide');
  }

  if (materialIds.length === 0) {
    if (experiment.subject === '物理') materialIds.push('steel', 'plastic');
    if (experiment.subject === '化学') materialIds.push('glass', 'water');
    if (experiment.subject === '生物') materialIds.push('cell-membrane', 'cytoplasm', 'water');
    if (experiment.subject === '科学') materialIds.push('plastic', 'water');
  }

  if (includesAny(contextText, ['折射', '透镜', '显微镜', 'prism', 'lens']) && includesAny(token, ['screen', 'slide', 'coverslip', '载玻片', '盖玻片'])) {
    materialIds.push('air');
  }

  return uniqueMaterialIds(materialIds);
}

function inferComponents(
  equipment: ExperimentEquipment,
  materialIds: string[],
  contextText: string,
): ExperimentEquipmentComponent[] {
  const token = getEquipmentToken(equipment);
  const mainMaterial = materialIds[0];
  const secondaryMaterial = materialIds[1] ?? mainMaterial;
  const findAltMaterial = (fallback: string) => materialIds.find((materialId) => materialId !== mainMaterial) ?? fallback;

  if (includesAny(token, ['battery', '电池', 'power'])) {
    return [
      { id: `${equipment.id}-cell-case`, name: '电池外壳', role: '固定与绝缘', materialRef: 'plastic' },
      { id: `${equipment.id}-electrode`, name: '电极片', role: '输出电子', materialRef: 'zinc' },
      { id: `${equipment.id}-electrolyte`, name: '电解质层', role: '维持离子迁移', materialRef: 'electrolyte' },
    ];
  }

  if (includesAny(token, ['switch', '开关'])) {
    return [
      { id: `${equipment.id}-lever`, name: '拨杆', role: '控制通断', materialRef: 'plastic' },
      { id: `${equipment.id}-contact`, name: '金属触点', role: '闭合回路', materialRef: 'copper' },
    ];
  }

  if (includesAny(token, ['bulb', '灯泡'])) {
    return [
      { id: `${equipment.id}-glass-shell`, name: '玻璃泡壳', role: '隔绝空气', materialRef: 'glass' },
      { id: `${equipment.id}-filament`, name: '灯丝', role: '通电发光', materialRef: 'tungsten' },
      { id: `${equipment.id}-lead-wire`, name: '引线', role: '传导电流', materialRef: 'copper' },
    ];
  }

  if (includesAny(token, ['wire', '导线', 'connector'])) {
    return [
      { id: `${equipment.id}-core`, name: '金属导体', role: '传导电子', materialRef: 'copper' },
      { id: `${equipment.id}-insulation`, name: '绝缘层', role: '防止短路', materialRef: 'plastic' },
    ];
  }

  if (includesAny(token, ['resistor', '变阻器', 'rheostat', 'slider'])) {
    return [
      { id: `${equipment.id}-track`, name: '电阻轨道', role: '调节电流', materialRef: 'graphite' },
      { id: `${equipment.id}-slider`, name: '滑片触点', role: '改变有效电阻长度', materialRef: 'copper' },
      { id: `${equipment.id}-housing`, name: '固定底座', role: '保持结构稳定', materialRef: 'plastic' },
    ];
  }

  if (includesAny(token, ['ammeter', 'voltmeter', '电流表', '电压表', 'meter'])) {
    return [
      { id: `${equipment.id}-coil`, name: '测量线圈', role: '感应电流或电压变化', materialRef: 'copper' },
      { id: `${equipment.id}-dial`, name: '刻度窗', role: '显示读数', materialRef: 'glass' },
      { id: `${equipment.id}-casing`, name: '仪表外壳', role: '保护结构', materialRef: 'plastic' },
    ];
  }

  if (includesAny(token, ['electrode', '电极'])) {
    return [
      { id: `${equipment.id}-plate`, name: '电极表面', role: '发生电子交换', materialRef: 'metal-electrode' },
      { id: `${equipment.id}-interface`, name: '液固界面', role: '连接溶液与电极', materialRef: 'electrolyte' },
    ];
  }

  if (includesAny(token, ['salt-bridge', '盐桥'])) {
    return [
      { id: `${equipment.id}-carrier`, name: '桥接载体', role: '提供离子通道支撑', materialRef: 'cellulose' },
      { id: `${equipment.id}-ions`, name: '桥内离子层', role: '维持电中性', materialRef: 'electrolyte' },
    ];
  }

  if (includesAny(token, ['dropper', '滴管', 'burette', 'pipette'])) {
    return [
      { id: `${equipment.id}-bulb`, name: '挤压球囊', role: '产生压差', materialRef: 'rubber' },
      { id: `${equipment.id}-tube`, name: '滴液通道', role: '控制液滴路径', materialRef: materialIds.includes('glass') ? 'glass' : 'plastic' },
    ];
  }

  if (includesAny(token, ['paper', '试纸'])) {
    return [
      { id: `${equipment.id}-sheet`, name: '纤维基底', role: '承载液体', materialRef: 'cellulose' },
      { id: `${equipment.id}-dye`, name: '显色层', role: '响应酸碱变化', materialRef: 'indicator-dye' },
    ];
  }

  if (includesAny(token, ['indicator', '指示剂', 'iodine', '碘液'])) {
    return [
      { id: `${equipment.id}-solvent`, name: '溶剂层', role: '分散活性分子', materialRef: 'water' },
      { id: `${equipment.id}-active`, name: '活性分子', role: '触发颜色或络合变化', materialRef: materialIds.includes('iodine-reagent') ? 'iodine-reagent' : 'indicator-dye' },
    ];
  }

  if (includesAny(token, ['solution', '溶液'])) {
    return [
      { id: `${equipment.id}-solvent`, name: '溶剂背景', role: '承载溶质', materialRef: 'water' },
      { id: `${equipment.id}-solute`, name: '溶质粒子', role: '决定体系性质', materialRef: findAltMaterial('water') },
    ];
  }

  if (includesAny(token, ['starch', '淀粉'])) {
    return [
      { id: `${equipment.id}-solvent`, name: '分散液相', role: '承载淀粉链', materialRef: 'water' },
      { id: `${equipment.id}-chains`, name: '淀粉长链', role: '发生显色与水解', materialRef: 'starch' },
    ];
  }

  if (includesAny(token, ['saliva', '唾液'])) {
    return [
      { id: `${equipment.id}-fluid`, name: '生物液体', role: '提供反应环境', materialRef: 'water' },
      { id: `${equipment.id}-enzyme`, name: '酶分子', role: '催化淀粉分解', materialRef: 'amylase' },
    ];
  }

  if (includesAny(token, ['beaker', '烧杯', 'test-tube', '试管', 'flask', '锥形瓶', '量筒', 'cylinder', 'bottle', '集气瓶', 'collector', 'dish', '培养皿'])) {
    return [
      { id: `${equipment.id}-shell`, name: '容器壁', role: '限定形状与容积', materialRef: 'glass' },
      { id: `${equipment.id}-working-zone`, name: '工作区', role: '承载样品或液体', materialRef: findAltMaterial('water') },
    ];
  }

  if (includesAny(token, ['slide', 'coverslip', '载玻片', '盖玻片'])) {
    return [
      { id: `${equipment.id}-glass-layer`, name: '光学玻片', role: '提供透光平面', materialRef: 'glass' },
      { id: `${equipment.id}-sample-film`, name: '样品薄层', role: '承载待观察结构', materialRef: findAltMaterial('glass') },
    ];
  }

  if (includesAny(token, ['microscope', '显微镜'])) {
    return [
      { id: `${equipment.id}-optics`, name: '镜头组', role: '放大与聚焦', materialRef: 'glass' },
      { id: `${equipment.id}-stage`, name: '载物台', role: '定位样本', materialRef: 'steel' },
      { id: `${equipment.id}-frame`, name: '机身支架', role: '保持光轴稳定', materialRef: 'plastic' },
    ];
  }

  if (includesAny(token, ['lens', '透镜', 'prism', '棱镜', 'mirror', '镜', 'screen', '屏'])) {
    return [
      { id: `${equipment.id}-optical-body`, name: '光学主体', role: '改变光路或承接像面', materialRef: 'glass' },
      { id: `${equipment.id}-air-interface`, name: '空气界面', role: '形成折射率边界', materialRef: includesAny(contextText, ['光', '折射', '透镜', '显微镜']) ? 'air' : secondaryMaterial },
    ];
  }

  if (includesAny(token, ['lamp', '酒精灯', 'candle', '蜡烛', 'heating'])) {
    return [
      { id: `${equipment.id}-fuel`, name: '燃料层', role: '提供化学能', materialRef: 'ethanol' },
      { id: `${equipment.id}-flame-zone`, name: '燃烧区', role: '与氧气反应放热', materialRef: 'oxygen' },
      { id: `${equipment.id}-vessel`, name: '灯体外壳', role: '限定燃料位置', materialRef: materialIds.includes('glass') ? 'glass' : 'steel' },
    ];
  }

  if (includesAny(token, ['warm-bath', 'water-bath', '温水', 'bath', 'water-tank', '槽'])) {
    return [
      { id: `${equipment.id}-bath-liquid`, name: '恒温液相', role: '传递热量', materialRef: 'water' },
      { id: `${equipment.id}-container`, name: '承载外壳', role: '保持温度环境', materialRef: materialIds.includes('glass') ? 'glass' : 'plastic' },
    ];
  }

  if (includesAny(token, ['stand', 'rack', 'holder', 'support', '铁架台', '架', '夹'])) {
    return [
      { id: `${equipment.id}-frame`, name: '支撑框架', role: '保持器材位置', materialRef: 'steel' },
      { id: `${equipment.id}-grip`, name: '接触部件', role: '限制位移和滑动', materialRef: 'plastic' },
    ];
  }

  if (includesAny(token, ['magnet', '磁铁'])) {
    return [
      { id: `${equipment.id}-core`, name: '磁性材料', role: '形成磁场', materialRef: 'iron' },
      { id: `${equipment.id}-domain`, name: '磁畴区域', role: '决定磁场方向与强度', materialRef: 'magnetic-domain' },
    ];
  }

  if (includesAny(token, ['spring', '弹簧', 'scale', '测力计'])) {
    return [
      { id: `${equipment.id}-spring`, name: '弹性元件', role: '受力形变', materialRef: 'steel' },
      { id: `${equipment.id}-indicator`, name: '读数组件', role: '把形变量映射为刻度', materialRef: 'plastic' },
    ];
  }

  if (includesAny(token, ['balance', '天平', 'lever', '杠杆', 'pulley', '滑轮', 'cart', '小车', 'weight', '砝码'])) {
    return [
      { id: `${equipment.id}-structure`, name: '刚体主体', role: '传递受力与位移', materialRef: 'steel' },
      { id: `${equipment.id}-contact`, name: '接触界面', role: '降低摩擦或稳定接触', materialRef: 'plastic' },
    ];
  }

  if (includesAny(token, ['onion', '洋葱', 'cell', '细胞', 'yeast', '酵母', 'leaf', '叶', 'seed', '种子', 'sample', '样本'])) {
    const components: ExperimentEquipmentComponent[] = [
      { id: `${equipment.id}-membrane`, name: '细胞膜层', role: '控制物质进出', materialRef: 'cell-membrane' },
      { id: `${equipment.id}-cytoplasm`, name: '细胞质区', role: '承载细胞活动', materialRef: 'cytoplasm' },
    ];

    if (includesAny(token, ['leaf', '叶', 'plant', '植物', 'onion', '洋葱', 'seed', '种子'])) {
      components.unshift({ id: `${equipment.id}-wall`, name: '细胞壁', role: '维持形态与支撑', materialRef: 'cell-wall' });
    }

    if (includesAny(token, ['leaf', '叶', 'plant', '植物'])) {
      components.push({ id: `${equipment.id}-pigment`, name: '色素区', role: '提供显色和能量捕获线索', materialRef: 'chlorophyll' });
    }

    return components;
  }

  return materialIds.slice(0, 3).map((materialId, index) => ({
    id: `${equipment.id}-component-${index + 1}`,
    name: index === 0 ? '主体结构' : index === 1 ? '功能层' : '辅助层',
    role: index === 0 ? '提供形态与支撑' : index === 1 ? '提供实验功能' : '补充约束与边界',
    materialRef: materialId,
  }));
}

function inferEquipmentProfiles(experiment: ExperimentConfig) {
  const contextText = buildExperimentContextText(experiment);
  const materials = new Map<string, ExperimentMaterialModel>();
  addMaterialList(materials, inferContextMaterialIds(experiment, contextText));

  const equipmentProfiles: ExperimentEquipmentProfile[] = experiment.equipment.map((equipment) => {
    const materialIds = inferMaterialIdsFromEquipment(equipment, experiment, contextText);
    addMaterialList(materials, materialIds);

    return {
      equipmentId: equipment.id,
      physicalGroup: equipment.type,
      constraints: [
        `保持 ${equipment.name} 的课堂尺度与安全边界`,
        `围绕 ${equipment.name} 的关键功能做组件级反馈`,
        includesAny(getEquipmentToken(equipment), ['glass', '玻璃', 'slide', 'coverslip', '载玻片', '显微镜'])
          ? `优先维持 ${equipment.name} 的透光界面和观察稳定性`
          : `优先保留 ${equipment.name} 的功能部件和操作顺序`,
      ],
      components: inferComponents(equipment, materialIds, contextText),
    };
  });

  return {
    contextText,
    equipmentProfiles,
    materials: [...materials.values()],
  };
}

function deriveReactionRules(
  experiment: ExperimentConfig,
  materials: ExperimentMaterialModel[],
  contextText: string,
): ExperimentReactionRule[] {
  const materialIds = new Set(materials.map((material) => material.id));
  const actionTypes = new Set(experiment.steps.map((step) => step.actionType));
  const rules: ExperimentReactionRule[] = [];

  const addRule = (rule: ExperimentReactionRule) => {
    if (!rules.some((item) => item.id === rule.id)) {
      rules.push(rule);
    }
  };

  if (materialIds.has('indicator-dye')) {
    addRule({
      id: `${experiment.id}-indicator-shift`,
      when: '加入指示剂并接触酸性或碱性体系时',
      observe: '颜色发生可辨识变化',
      microNarrative: '指示剂分子在质子化与去质子化状态间切换，吸收光谱改变后呈现不同颜色。',
      materialRefs: ['indicator-dye', 'hydronium', 'hydroxide'],
    });
  }

  if (materialIds.has('copper') && (materialIds.has('tungsten') || materialIds.has('graphite') || materialIds.has('electrolyte'))) {
    addRule({
      id: `${experiment.id}-electron-drift`,
      when: '电路闭合或电化学回路建立时',
      observe: '导线、灯泡或表头出现稳定响应',
      microNarrative: '电子在金属导体中出现定向漂移，能量会在灯丝、石墨轨道或电极界面重新分配。',
      materialRefs: ['copper', 'tungsten', 'graphite', 'electrolyte', 'metal-electrode'],
    });
  }

  if ((materialIds.has('glass') || materialIds.has('air')) && includesAny(contextText, ['光', '折射', '反射', '透镜', '棱镜', '显微镜', '小孔', '成像', 'lens', 'prism', 'microscope'])) {
    addRule({
      id: `${experiment.id}-light-path`,
      when: '光线穿过透镜、玻片或空气界面时',
      observe: '光路偏折、成像位置变化或细节被放大',
      microNarrative: '不同介质中光速不同，界面处的相位推进改变会表现为折射、聚焦或成像变化。',
      materialRefs: ['glass', 'air'],
    });
  }

  if (materialIds.has('oxygen') && (actionTypes.has('heat-object') || includesAny(contextText, ['氧气', '助燃', '燃烧', 'alcohol-lamp', '酒精灯', 'candle', '蜡烛']))) {
    addRule({
      id: `${experiment.id}-thermal-oxidation`,
      when: '加热或点燃体系并引入氧分子时',
      observe: '出现气泡、火焰、放热或气体收集现象',
      microNarrative: '受热后粒子运动增强，氧分子与活性粒子更频繁碰撞并参与氧化，宏观上就表现为持续放热、发光或气体释放。',
      materialRefs: ['oxygen', 'ethanol', 'water', 'air'],
    });
  }

  if (materialIds.has('carbon-dioxide')) {
    addRule({
      id: `${experiment.id}-gas-diffusion`,
      when: '生成或导入二氧化碳后',
      observe: '气体在容器间转移、聚集或进入液体体系',
      microNarrative: '二氧化碳分子会依据浓度差和空间边界重新扩散分布，因密度与溶解行为不同而形成可见变化。',
      materialRefs: ['carbon-dioxide', 'air', 'water'],
    });
  }

  if (materialIds.has('starch') && materialIds.has('iodine-reagent')) {
    addRule({
      id: `${experiment.id}-complex-color`,
      when: '碘液与完整淀粉链接触时',
      observe: '体系出现蓝黑色或深色显色',
      microNarrative: '碘分子嵌入淀粉螺旋链内部后改变光吸收特征，因此宏观上会迅速显色。',
      materialRefs: ['starch', 'iodine-reagent'],
    });
  }

  if (materialIds.has('amylase') && materialIds.has('starch')) {
    addRule({
      id: `${experiment.id}-enzyme-catalysis`,
      when: '淀粉酶在适温条件下接触淀粉时',
      observe: '显色减弱、体系性质改变或底物逐渐消失',
      microNarrative: '酶分子通过活性位点与淀粉链结合并催化其断裂，链长降低后原本的显色或黏性特征随之下降。',
      materialRefs: ['amylase', 'starch', 'water'],
    });
  }

  if (materialIds.has('cell-membrane') && materialIds.has('cytoplasm') && includesAny(contextText, ['细胞', 'cell', '显微镜', 'microscope', '观察'])) {
    addRule({
      id: `${experiment.id}-cell-contrast`,
      when: '制片完成并调焦观察时',
      observe: '细胞轮廓、液泡或内部结构逐渐清晰',
      microNarrative: '细胞壁、细胞膜和细胞质对光与染料的响应不同，因此在放大和调焦后会形成可辨别的结构对比。',
      materialRefs: ['cell-wall', 'cell-membrane', 'cytoplasm', 'chlorophyll'],
    });
  }

  if (materialIds.has('cell-membrane') && materialIds.has('water') && includesAny(contextText, ['渗透', '质壁分离', '复原', 'osmosis'])) {
    addRule({
      id: `${experiment.id}-osmosis`,
      when: '细胞内外浓度差建立时',
      observe: '液泡体积变化、原生质层收缩或复原',
      microNarrative: '水分子会在浓度差驱动下跨过半透性的细胞膜迁移，导致细胞内部体积和张力重新分配。',
      materialRefs: ['cell-wall', 'cell-membrane', 'cytoplasm', 'water'],
    });
  }

  if (materialIds.has('magnetic-domain')) {
    addRule({
      id: `${experiment.id}-domain-alignment`,
      when: '磁体靠近磁性材料或磁场增强时',
      observe: '磁针、铁屑或受磁物体出现有序响应',
      microNarrative: '磁性材料内部磁畴逐渐朝同一方向排列，宏观上表现为更清晰的吸引、排斥或磁场线分布。',
      materialRefs: ['iron', 'magnetic-domain'],
    });
  }

  if (materialIds.has('steel') && includesAny(contextText, ['弹簧', '测力计', '杠杆', '滑轮', 'balance', 'spring', 'lever', 'pulley', 'weight'])) {
    addRule({
      id: `${experiment.id}-force-transfer`,
      when: '器材受力、位移或建立平衡条件时',
      observe: '刻度变化、位移放大或平衡状态改变',
      microNarrative: '刚体和弹性元件内部原子间距发生微小变化，力通过结构连续传递，最终转化为可读出的形变或位置变化。',
      materialRefs: ['steel', 'plastic'],
    });
  }

  if (rules.length === 0) {
    addRule({
      id: `${experiment.id}-generic-state-change`,
      when: '当前步骤触发关键操作时',
      observe: '宏观现象与器材状态发生变化',
      microNarrative: '材料内部粒子排布、能量传递或局部结构发生改变，从而映射为可见现象。',
    });
  }

  return rules.slice(0, 4);
}

function summarize(model: ExperimentMultiscaleModel) {
  return {
    equipmentProfiles: model.equipmentProfiles.length,
    componentCount: model.equipmentProfiles.reduce((sum, profile) => sum + profile.components.length, 0),
    materialCount: model.materials.length,
    speciesCount: model.materials.reduce((sum, material) => sum + (material.microModel?.species.length ?? 0), 0),
    reactionRuleCount: model.reactionRules.length,
  };
}

function deriveDefaultLens(experiment: ExperimentConfig, contextText: string, materialIds: Set<string>): MultiscaleLens {
  if (
    includesAny(contextText, ['电路', '电流', '电压', '欧姆', '磁', 'magnet', 'wire', 'battery', 'resistor', 'rheostat', '透镜', '棱镜', '折射', 'reflection', 'refraction'])
    && experiment.subject !== '化学'
    && !includesAny(contextText, ['细胞', '酶', '显微镜', '质壁分离', 'microscope', 'enzyme', 'cell'])
  ) {
    return 'meso';
  }

  if (
    experiment.subject === '生物'
    || includesAny(contextText, ['细胞', '酶', '显微镜', '质壁分离', 'microscope', 'enzyme', 'cell'])
    || materialIds.has('cell-membrane')
    || materialIds.has('amylase')
  ) {
    return 'micro';
  }

  if (
    experiment.subject === '化学'
    || materialIds.has('indicator-dye')
    || materialIds.has('oxygen')
  ) {
    return 'micro';
  }

  if (
    experiment.subject === '物理'
    || materialIds.has('copper')
    || materialIds.has('glass')
    || materialIds.has('magnetic-domain')
    || materialIds.has('steel')
  ) {
    return 'meso';
  }

  return 'macro';
}

function dedupeById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function findFocusEquipment(
  experiment: ExperimentConfig,
  step?: ExperimentStep | null,
  focusTargetObject?: string,
) {
  const focusText = `${focusTargetObject ?? ''} ${step?.title ?? ''} ${step?.description ?? ''}`.toLowerCase();
  if (!focusText.trim()) return experiment.equipment[0] ?? null;

  return (
    experiment.equipment.find((equipment) => {
      const token = `${equipment.id} ${equipment.name} ${equipment.type}`.toLowerCase();
      return (
        focusText.includes(equipment.id.toLowerCase())
        || focusText.includes(equipment.name.toLowerCase())
        || focusText.includes(equipment.type.toLowerCase())
        || token.includes((focusTargetObject ?? '').toLowerCase())
      );
    }) ?? experiment.equipment[0] ?? null
  );
}

function deriveFocusedLens(
  step: ExperimentStep | null | undefined,
  fallback: MultiscaleLens,
  materialCount: number,
  speciesCount: number,
  hasRule: boolean,
) {
  if (!step) return fallback;

  if (
    speciesCount > 0
    && ['add-material', 'heat-object', 'adjust-focus', 'record-observation', 'complete-summary'].includes(step.actionType)
  ) {
    return 'micro';
  }

  if (
    materialCount > 0
    || hasRule
    || step.actionType === 'connect-wire'
    || step.actionType === 'set-variable'
    || step.actionType === 'switch-view'
  ) {
    return 'meso';
  }

  if (step.actionType === 'identify-object' || step.actionType === 'place-object') {
    return 'macro';
  }

  return fallback;
}

export function getExperimentMultiscaleView(experiment: ExperimentConfig): ExperimentMultiscaleView {
  const configured = experiment.multiscale;

  if (configured) {
    return {
      ...configured,
      source: 'configured',
      stats: summarize(configured),
    };
  }

  const inferred = inferEquipmentProfiles(experiment);
  const materialIds = new Set(inferred.materials.map((material) => material.id));
  const model: ExperimentMultiscaleModel = {
    defaultLens: deriveDefaultLens(experiment, inferred.contextText, materialIds),
    equipmentProfiles: inferred.equipmentProfiles,
    materials: inferred.materials,
    reactionRules: deriveReactionRules(experiment, inferred.materials, inferred.contextText),
  };

  return {
    ...model,
    source: 'derived',
    stats: summarize(model),
  };
}

export function getFocusedExperimentMultiscaleView(
  experiment: ExperimentConfig,
  options: {
    focusTargetObject?: string;
    step?: ExperimentStep | null;
  } = {},
): FocusedExperimentMultiscaleView {
  const multiscale = getExperimentMultiscaleView(experiment);
  const focusEquipment = findFocusEquipment(experiment, options.step, options.focusTargetObject);
  const focusProfile =
    multiscale.equipmentProfiles.find((profile) => profile.equipmentId === focusEquipment?.id)
    ?? multiscale.equipmentProfiles[0]
    ?? null;
  const focusMaterialIds = Array.from(
    new Set((focusProfile?.components ?? []).map((component) => component.materialRef).filter((materialRef): materialRef is string => Boolean(materialRef))),
  );
  const matchedMaterials = multiscale.materials.filter((material) => focusMaterialIds.includes(material.id));
  const focusMaterials = matchedMaterials.length ? matchedMaterials : multiscale.materials.slice(0, 3);
  const matchedRules = multiscale.reactionRules.filter((rule) => rule.materialRefs?.some((materialRef) => focusMaterialIds.includes(materialRef)));
  const relevantRules = matchedRules.length ? matchedRules : multiscale.reactionRules.slice(0, 2);
  const activeRule = relevantRules[0] ?? null;
  const species = dedupeById(focusMaterials.flatMap((material) => material.microModel?.species ?? []));
  const focusedLens = deriveFocusedLens(options.step, multiscale.defaultLens, focusMaterials.length, species.length, Boolean(activeRule));
  const focusEquipmentLabel = focusEquipment?.name ?? options.focusTargetObject ?? '实验工作台';
  const componentSummary =
    (focusProfile?.components ?? []).slice(0, 2).map((component) => component.name).join(' / ')
    || focusProfile?.physicalGroup
    || '组件按器材约束生成';
  const materialSummary = focusMaterials.length
    ? focusMaterials.slice(0, 3).map((material) => material.name).join(' / ')
    : MULTISCALE_LENS_NOTES[multiscale.defaultLens];
  const speciesSummary = species.length
    ? species.slice(0, 3).map((item) => (item.formula ? `${item.name}(${item.formula})` : item.name)).join(' / ')
    : '按需生成粒子';

  return {
    multiscale,
    focusEquipmentId: focusEquipment?.id ?? '',
    focusEquipmentLabel,
    focusProfile,
    focusMaterialIds,
    focusMaterials,
    relevantRules,
    activeRule,
    species,
    componentCount: focusProfile?.components.length ?? 0,
    componentSummary,
    materialCount: focusMaterials.length,
    materialSummary,
    speciesCount: species.length,
    speciesSummary,
    ruleNarrative: activeRule?.microNarrative ?? '仅在需要解释现象成因时进入微观层，不常驻做全量模拟。',
    ruleSummary: activeRule?.observe ?? MULTISCALE_LENS_NOTES[focusedLens],
    focusedLens,
    traceSummary: `${focusEquipmentLabel} -> ${materialSummary} -> ${speciesSummary}`,
  };
}
