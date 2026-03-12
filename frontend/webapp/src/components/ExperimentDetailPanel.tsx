import { useEffect, useMemo, useState } from 'react';
import { getExperimentMultiscaleView } from '../lib/multiscaleLab';
import { createExperimentSimulationBlueprint } from '../lib/simulationBlueprint';
import { formatSimulationRuntimeValue, type SimulationRuntimeSnapshot } from '../lib/simulationRuntime';
import type { ExperimentConfig } from '../types/experiment';

interface ExperimentDetailPanelProps {
  experiment: ExperimentConfig | null;
  hasDedicatedPlayer?: boolean;
  runtimeSnapshot?: SimulationRuntimeSnapshot | null;
}

type DetailLayer = 'overview' | 'steps' | 'equipment' | 'multiscale' | 'simulation' | 'scoring';

function ReadinessBadge({ ready, label }: { ready: boolean; label: string }) {
  return <span className={ready ? 'status-pill ready' : 'status-pill'}>{label}{ready ? ' 已就绪' : ' 待补齐'}</span>;
}

export function ExperimentDetailPanel({ experiment, hasDedicatedPlayer = false, runtimeSnapshot = null }: ExperimentDetailPanelProps) {
  const [activeLayer, setActiveLayer] = useState<DetailLayer>('overview');

  useEffect(() => {
    setActiveLayer('overview');
  }, [experiment?.id]);

  const multiscale = useMemo(() => (experiment ? getExperimentMultiscaleView(experiment) : null), [experiment]);
  const simulationBlueprint = useMemo(
    () => (experiment ? createExperimentSimulationBlueprint(experiment, { hasDedicatedPlayer }) : null),
    [experiment, hasDedicatedPlayer],
  );
  const multiscalePaths = useMemo(() => {
    if (!experiment || !multiscale) return [];

    return multiscale.equipmentProfiles.slice(0, 4).map((profile) => {
      const equipment = experiment.equipment.find((item) => item.id === profile.equipmentId);
      const materialRefs = [...new Set(profile.components.map((component) => component.materialRef).filter((materialRef): materialRef is string => Boolean(materialRef)))];
      const materials = multiscale.materials.filter((material) => materialRefs.includes(material.id)).slice(0, 2);
      const species = materials.flatMap((material) => material.microModel?.species ?? []).slice(0, 2);
      const rule = multiscale.reactionRules.find((item) => item.materialRefs?.some((materialRef) => materialRefs.includes(materialRef)));

      return {
        equipmentName: equipment?.name ?? profile.equipmentId,
        componentSummary: profile.components.slice(0, 2).map((component) => component.name).join(' / ') || '结构组件待补充',
        materialSummary: materials.map((material) => material.name).join(' + ') || '通用材料层',
        materialDetail: materials.map((material) => material.properties[0] ? `${material.properties[0].label} ${material.properties[0].value}${material.properties[0].unit ?? ''}` : material.state).join(' · ') || '暂无属性摘要',
        speciesSummary: species.map((item) => item.formula ? `${item.name}(${item.formula})` : item.name).join(' + ') || '程序生成粒子',
        ruleSummary: rule?.observe ?? '按需要进入微观解释层',
      };
    });
  }, [experiment, multiscale]);

  if (!experiment || !multiscale || !simulationBlueprint) {
    return (
      <section className="detail-grid detail-explorer-grid">
        <article className="panel empty-panel detail-empty-panel">
          <div>
            <h2>选择一个实验</h2>
            <p>从上方目录选中实验后，这里会显示课程锚点、器材、步骤、能力标签和产品状态，帮助学生理解、教师布置和团队继续产品化。</p>
          </div>
        </article>
      </section>
    );
  }

  const detailLayerDescriptions: Record<DetailLayer, string> = {
    overview: '先看实验目标、课程锚点和场景摘要。',
    steps: '只看流程与关键成功条件，方便预习和演示。',
    equipment: '只看器材与场景资产，减少说明层视觉负担。',
    multiscale: '把宏观器材、中观材料和微观粒子放到同一套解释框架里。',
    simulation: '只看仿真引擎路线、观测通道和 AI 接入方式。',
    scoring: '只看评分、产品状态和常见错误，便于复盘。',
  };

  return (
    <section className="detail-grid detail-explorer-grid">
      <article className="panel wide-panel detail-hero-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Experiment Explorer</span>
            <h2>{experiment.title}</h2>
            <p>{experiment.curriculum.theme} · {experiment.curriculum.unit}</p>
          </div>
          <div className="badge-row">
            <span className="badge">{experiment.stage}</span>
            <span className="badge">{experiment.subject}</span>
            <span className="badge">{experiment.grade}</span>
            <span className="badge badge-status">{experiment.productization.status}</span>
          </div>
        </div>

        <div className="detail-hero-grid">
          <div className="detail-hero-copy">
            <div className="detail-list compact-detail-list">
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>课程主题</strong>
                  <span>{experiment.curriculum.theme}</span>
                </div>
                <span className="badge">{experiment.durationMinutes} 分钟</span>
              </div>
              <div className="detail-row">
                <div className="detail-copy">
                  <strong>所属单元</strong>
                  <span>{experiment.curriculum.unit}</span>
                </div>
                <span className="badge">{experiment.productization.interactionMode}</span>
              </div>
            </div>

            <div className="badge-row compact detail-badge-group">
              {experiment.curriculum.knowledgePoints.map((point) => (
                <span className="badge" key={point}>{point}</span>
              ))}
            </div>
          </div>

          <div className="detail-summary-grid">
            <div className="detail-summary-card">
              <span>学习目标</span>
              <strong>{experiment.objectives.length}</strong>
              <small>聚焦关键现象与能力</small>
            </div>
            <div className="detail-summary-card">
              <span>实验步骤</span>
              <strong>{experiment.steps.length}</strong>
              <small>引导式流程配置</small>
            </div>
            <div className="detail-summary-card">
              <span>器材项目</span>
              <strong>{experiment.equipment.length}</strong>
              <small>支持课堂认知与操作</small>
            </div>
            <div className="detail-summary-card">
              <span>能力模块</span>
              <strong>{experiment.capabilities.length}</strong>
              <small>可复用交互能力集合</small>
            </div>
            <div className="detail-summary-card">
              <span>多尺度规则</span>
              <strong>{multiscale.stats.reactionRuleCount}</strong>
              <small>{multiscale.source === 'configured' ? '已显式配置' : '当前由引擎推导'}</small>
            </div>
            <div className="detail-summary-card">
              <span>仿真路线</span>
              <strong>{hasDedicatedPlayer ? '专属' : '通用'}</strong>
              <small>{simulationBlueprint.renderRuntime}</small>
            </div>
          </div>
        </div>
      </article>

      <article className="panel wide-panel workspace-layer-panel detail-layer-panel">
        <div className="workspace-layer-bar detail-layer-bar" aria-label="实验说明分层导航" role="tablist">
          <button className={activeLayer === 'overview' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('overview')} type="button">概览</button>
          <button className={activeLayer === 'steps' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('steps')} type="button">步骤 {experiment.steps.length}</button>
          <button className={activeLayer === 'equipment' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('equipment')} type="button">器材 {experiment.equipment.length}</button>
          <button className={activeLayer === 'multiscale' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('multiscale')} type="button">多尺度</button>
          <button className={activeLayer === 'simulation' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('simulation')} type="button">仿真</button>
          <button className={activeLayer === 'scoring' ? 'workspace-layer-button active' : 'workspace-layer-button'} onClick={() => setActiveLayer('scoring')} type="button">评分</button>
        </div>
        <div className="workspace-layer-helper">
          <strong>{activeLayer === 'overview' ? '一级概览层' : activeLayer === 'steps' ? '二级步骤层' : activeLayer === 'equipment' ? '二级器材层' : activeLayer === 'multiscale' ? '二级多尺度层' : activeLayer === 'simulation' ? '二级仿真层' : '二级评分层'}</strong>
          <small>{detailLayerDescriptions[activeLayer]}</small>
        </div>
      </article>

      {activeLayer === 'overview' ? (
        <>
          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Scene</span>
                <h2>场景与实验摘要</h2>
              </div>
              <small>把实验环境、镜头和核心学习目标放到第一层，便于快速理解实验全貌。</small>
            </div>
            <div className="detail-meta-grid">
              <div className="detail-mini-card">
                <span>实验环境</span>
                <strong>{experiment.scene.environment}</strong>
                <small>建议让空间、桌面与器材材质保持课堂语境一致。</small>
              </div>
              <div className="detail-mini-card">
                <span>默认镜头</span>
                <strong>{experiment.scene.cameraPreset}</strong>
                <small>首屏优先对准关键器材与核心现象发生区域。</small>
              </div>
              <div className="detail-mini-card">
                <span>交互模式</span>
                <strong>{experiment.productization.interactionMode}</strong>
                <small>决定学生在实验室中的观察、操作与反馈深度。</small>
              </div>
            </div>
          </article>

          <article className="panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Objectives</span>
                <h2>学习目标</h2>
              </div>
              <small>帮助学生提前知道要观察什么、理解什么、完成什么</small>
            </div>
            <ul className="bullet-list">
              {experiment.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          </article>

          <article className="panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Capabilities</span>
                <h2>复用能力</h2>
              </div>
              <small>便于研发继续复用实验播放器的公共能力</small>
            </div>
            <div className="badge-row compact">
              {experiment.capabilities.map((capability) => (
                <span className="badge" key={capability}>{capability}</span>
              ))}
            </div>
          </article>
        </>
      ) : null}

      {activeLayer === 'steps' ? (
        <article className="panel wide-panel detail-surface-card">
          <div className="panel-head compact-panel-head">
            <div>
              <span className="eyebrow">Steps</span>
              <h2>步骤配置</h2>
            </div>
            <small>把操作顺序、观察节点和成功条件集中在一步一卡里</small>
          </div>
          <div className="step-stack detail-step-stack">
            {experiment.steps.map((step) => (
              <div className="step-card detail-step-card" key={step.id}>
                <div className="step-meta">Step {step.order}</div>
                <h3>{step.title}</h3>
                <p>{step.description ?? '暂无补充说明'}</p>
                <div className="detail-step-meta-list">
                  <span>操作对象：{step.targetObject}</span>
                  <span>成功条件：{step.successCondition}</span>
                </div>
                {step.failureHints.length ? (
                  <ul className="detail-step-hints">
                    {step.failureHints.slice(0, 2).map((hint) => (
                      <li key={hint}>{hint}</li>
                    ))}
                  </ul>
                ) : null}
                <small>{step.actionType} · 权重 {step.scoringWeight}%</small>
              </div>
            ))}
          </div>
        </article>
      ) : null}

      {activeLayer === 'equipment' ? (
        <>
          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Equipment</span>
                <h2>器材清单</h2>
              </div>
              <small>帮助学生先建立器材心智模型，也方便继续细化器材材质与操作反馈</small>
            </div>
            <div className="detail-equipment-grid">
              {experiment.equipment.map((equipment) => (
                <div className="detail-equipment-card" key={equipment.id}>
                  <span>{equipment.type}</span>
                  <strong>{equipment.name}</strong>
                  <small>{equipment.optional ? '选配器材，可按课堂条件调整' : '核心器材，建议优先还原真实课堂器材观感与触感'}</small>
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Scene Assets</span>
                <h2>场景资产</h2>
              </div>
              <small>这一层只看实验场景里的核心资产，有助于后续做更拟真的材质与灯光升级</small>
            </div>
            <div className="detail-equipment-grid">
              {experiment.scene.assets.length ? experiment.scene.assets.map((asset) => (
                <div className="detail-equipment-card" key={asset}>
                  <span>Asset</span>
                  <strong>{asset}</strong>
                  <small>建议补齐真实器材比例、材质反射和课堂磨损细节。</small>
                </div>
              )) : (
                <div className="detail-equipment-card detail-equipment-card-empty">
                  <span>Asset</span>
                  <strong>待补充实验资产</strong>
                  <small>当前实验还没有配置场景资产清单，可后续继续完善。</small>
                </div>
              )}
            </div>
          </article>
        </>
      ) : null}

      {activeLayer === 'multiscale' ? (
        <>
          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Multiscale Engine</span>
                <h2>多尺度解释引擎</h2>
              </div>
              <small>{multiscale.source === 'configured' ? '当前实验已显式配置器材组件、材料属性和微观规则。' : '当前实验暂无显式配置，先由引擎根据器材与学科自动推导。'}</small>
            </div>
            <div className="detail-meta-grid">
              <div className="detail-mini-card">
                <span>默认镜头</span>
                <strong>{multiscale.defaultLens === 'macro' ? '宏观层' : multiscale.defaultLens === 'meso' ? '中观层' : '微观层'}</strong>
                <small>决定进入多尺度视图时优先落在哪一层解释。</small>
              </div>
              <div className="detail-mini-card">
                <span>器材组件</span>
                <strong>{multiscale.stats.componentCount}</strong>
                <small>把器材拆成有功能含义的物理部件，而不是整块模型。</small>
              </div>
              <div className="detail-mini-card">
                <span>材料节点</span>
                <strong>{multiscale.stats.materialCount}</strong>
                <small>材料负责承载属性、规则和可复用微观模型。</small>
              </div>
              <div className="detail-mini-card">
                <span>微观粒子</span>
                <strong>{multiscale.stats.speciesCount}</strong>
                <small>这些粒子模型用程序生成，不依赖沉重资源包。</small>
              </div>
              <div className="detail-mini-card">
                <span>规则数量</span>
                <strong>{multiscale.stats.reactionRuleCount}</strong>
                <small>把宏观现象与材料、粒子机制明确连起来。</small>
              </div>
            </div>
          </article>

          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Lenses</span>
                <h2>三层建模方式</h2>
              </div>
              <small>这三层共享同一套实验数据，不会为每个实验重复造一套独立世界。</small>
            </div>
            <div className="detail-multiscale-lens-grid">
              <div className={`detail-multiscale-lens-card ${multiscale.defaultLens === 'macro' ? 'active' : ''}`}>
                <span>Macro</span>
                <strong>器材与约束</strong>
                <small>看实验台、器材摆放、连接关系、安全边界和操作顺序。</small>
              </div>
              <div className={`detail-multiscale-lens-card ${multiscale.defaultLens === 'meso' ? 'active' : ''}`}>
                <span>Meso</span>
                <strong>材料与属性</strong>
                <small>看导电性、酸碱性、透明度、弹性、溶解性和组件结构。</small>
              </div>
              <div className={`detail-multiscale-lens-card ${multiscale.defaultLens === 'micro' ? 'active' : ''}`}>
                <span>Micro</span>
                <strong>粒子与规则</strong>
                <small>只在解释需要时生成原子、分子或离子的程序化视图。</small>
              </div>
            </div>
          </article>

          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Trace</span>
                <h2>器材到粒子的生成链</h2>
              </div>
              <small>这一层直接展示引擎怎样把课堂器材映射到材料和微观解释，方便继续扩展而不必手写全量微观世界。</small>
            </div>
            <div className="detail-multiscale-path-grid">
              {multiscalePaths.map((path) => (
                <div className="detail-multiscale-path-card" key={path.equipmentName}>
                  <div className="detail-multiscale-path-step">
                    <span>Macro</span>
                    <strong>{path.equipmentName}</strong>
                    <small>{path.componentSummary}</small>
                  </div>
                  <div aria-hidden="true" className="detail-multiscale-path-arrow">→</div>
                  <div className="detail-multiscale-path-step">
                    <span>Meso</span>
                    <strong>{path.materialSummary}</strong>
                    <small>{path.materialDetail}</small>
                  </div>
                  <div aria-hidden="true" className="detail-multiscale-path-arrow">→</div>
                  <div className="detail-multiscale-path-step accent">
                    <span>Micro</span>
                    <strong>{path.speciesSummary}</strong>
                    <small>{path.ruleSummary}</small>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Components</span>
                <h2>器材组件构成</h2>
              </div>
              <small>先知道器材为什么有效，再决定要不要继续下钻到材料和微观层。</small>
            </div>
            <div className="detail-multiscale-profile-grid">
              {multiscale.equipmentProfiles.map((profile) => {
                const equipment = experiment.equipment.find((item) => item.id === profile.equipmentId);
                return (
                  <div className="detail-multiscale-profile-card" key={profile.equipmentId}>
                    <div className="detail-multiscale-profile-head">
                      <div>
                        <span>{profile.physicalGroup}</span>
                        <strong>{equipment?.name ?? profile.equipmentId}</strong>
                      </div>
                      <small>{profile.components.length} 个组件</small>
                    </div>
                    <div className="detail-multiscale-chip-row">
                      {profile.components.map((component) => (
                        <span className="detail-multiscale-chip" key={component.id}>
                          {component.name} · {component.role}
                        </span>
                      ))}
                    </div>
                    <ul className="detail-step-hints">
                      {profile.constraints.slice(0, 2).map((constraint) => (
                        <li key={constraint}>{constraint}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </article>

          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Materials</span>
                <h2>材料属性与微观粒子</h2>
              </div>
              <small>材料层是复用核心，同一材料可以在多个实验里共享属性和微观模型。</small>
            </div>
            <div className="detail-multiscale-material-grid">
              {multiscale.materials.map((material) => (
                <div className="detail-multiscale-material-card" key={material.id}>
                  <span>{material.category} · {material.state}</span>
                  <strong>{material.name}{material.formula ? ` (${material.formula})` : ''}</strong>
                  <div className="detail-multiscale-chip-row">
                    {material.properties.map((property) => (
                      <span className="detail-multiscale-chip muted" key={`${material.id}-${property.key}`}>
                        {property.label} {property.value}{property.unit ?? ''}
                      </span>
                    ))}
                  </div>
                  <p>{material.microModel?.narrative ?? '当前材料还没有配置更细的微观叙事。'}</p>
                  {material.microModel?.species?.length ? (
                    <div className="detail-micro-species-row">
                      {material.microModel.species.map((species) => (
                        <div className="detail-micro-species-card" key={species.id}>
                          <span style={{ backgroundColor: species.color }} />
                          <strong>{species.name}</strong>
                          <small>{species.formula ?? species.arrangement} · {species.particleCountHint} 粒子</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Rules</span>
                <h2>宏观现象到微观原因</h2>
              </div>
              <small>这层规则决定什么时候值得切到微观视角，而不是让微观粒子一直常驻。</small>
            </div>
            <div className="detail-multiscale-rule-grid">
              {multiscale.reactionRules.map((rule) => (
                <div className="detail-multiscale-rule-card" key={rule.id}>
                  <span>触发条件</span>
                  <strong>{rule.when}</strong>
                  <small>宏观表现：{rule.observe}</small>
                  <p>{rule.microNarrative}</p>
                  {rule.materialRefs?.length ? (
                    <div className="detail-multiscale-chip-row">
                      {rule.materialRefs.map((materialRef) => (
                        <span className="detail-multiscale-chip muted" key={`${rule.id}-${materialRef}`}>{materialRef}</span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        </>
      ) : null}

      {activeLayer === 'simulation' ? (
        <>
          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Simulation Blueprint</span>
                <h2>当前仿真技术路线</h2>
              </div>
              <small>参考 2025 到 2026 年行业主线，把渲染栈、语义层和 AI grounding 放到同一层看，而不是只看教学文案。</small>
            </div>
            <div className="detail-meta-grid">
              <div className="detail-mini-card">
                <span>执行范式</span>
                <strong>{simulationBlueprint.executionModel}</strong>
                <small>决定当前实验更偏脚本状态机、语义仿真还是专属交互内核。</small>
              </div>
              <div className="detail-mini-card">
                <span>渲染运行时</span>
                <strong>{simulationBlueprint.renderRuntime}</strong>
                <small>当前以 Three.js WebGL 为主，后续可升级到 WebGPU 和 GPU 计算路径。</small>
              </div>
              <div className="detail-mini-card">
                <span>保真层</span>
                <strong>{simulationBlueprint.fidelityLayers.length}</strong>
                <small>同时覆盖场景、步骤、器材和多尺度保真，不再只做单层视觉还原。</small>
              </div>
            </div>
          </article>

          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Assets</span>
                <h2>资产与语义管线</h2>
              </div>
              <small>当前已经具备 glTF 资产、多尺度配置和器材语义拆解，后续适合向 OpenUSD / SimReady 资产规范对齐。</small>
            </div>
            <div className="detail-simulation-grid">
              {simulationBlueprint.assetPipeline.map((item) => (
                <div className="detail-equipment-card" key={item}>
                  <span>Pipeline</span>
                  <strong>{item}</strong>
                  <small>让视觉资产、材料属性和 AI 可读语义保持同一条链路。</small>
                </div>
              ))}
            </div>
          </article>

          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Signals</span>
                <h2>可观测量与控制输入</h2>
              </div>
              <small>世界级仿真产品的关键不是页面解释，而是把 AI 能读、学生能看、引擎能算的状态量统一起来。</small>
            </div>
            <div className="detail-simulation-dual-grid">
              <div className="detail-simulation-surface">
                <strong>可观测量</strong>
                <div className="badge-row compact">
                  {simulationBlueprint.observables.map((item) => (
                    <span className="badge" key={item}>{item}</span>
                  ))}
                </div>
              </div>
              <div className="detail-simulation-surface">
                <strong>控制输入</strong>
                <div className="badge-row compact">
                  {simulationBlueprint.controlInputs.map((item) => (
                    <span className="badge" key={item}>{item}</span>
                  ))}
                </div>
              </div>
            </div>
          </article>

          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Runtime</span>
                <h2>当前运行态总线</h2>
              </div>
              <small>这部分不是静态实验说明，而是当前播放器正在输出给 AI、教师和调试面板的真实仿真运行态。</small>
            </div>
            {runtimeSnapshot ? (
              <>
                <div className="detail-meta-grid">
                  <div className="detail-mini-card">
                    <span>当前阶段</span>
                    <strong>{runtimeSnapshot.phaseLabel}</strong>
                    <small>{runtimeSnapshot.phaseState === 'completed' ? '当前阶段已完成' : runtimeSnapshot.phaseState === 'active' ? '当前阶段正在运行' : '当前阶段尚未激活'}</small>
                  </div>
                  <div className="detail-mini-card">
                    <span>运行进度</span>
                    <strong>{runtimeSnapshot.progressPercent}%</strong>
                    <small>{runtimeSnapshot.focusTarget ? `当前焦点 ${runtimeSnapshot.focusTarget}` : '当前未显式指定焦点对象'}</small>
                  </div>
                  <div className="detail-mini-card">
                    <span>状态摘要</span>
                    <strong>{runtimeSnapshot.stateSummary}</strong>
                    <small>这段摘要会直接进入 AI grounding，而不是只停留在 UI 文案层。</small>
                  </div>
                </div>

                <div className="detail-simulation-dual-grid">
                  <div className="detail-simulation-surface">
                    <strong>实时可观测量</strong>
                    <ul className="bullet-list">
                      {runtimeSnapshot.observables.map((item) => (
                        <li key={item.key}>{item.label}：{formatSimulationRuntimeValue(item.value, item.unit)}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="detail-simulation-surface">
                    <strong>实时控制面</strong>
                    <ul className="bullet-list">
                      {runtimeSnapshot.controls.map((item) => (
                        <li key={item.key}>{item.label}：{formatSimulationRuntimeValue(item.value, item.unit)}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="detail-simulation-dual-grid">
                  <div className="detail-simulation-surface">
                    <strong>阶段流转</strong>
                    <div className="badge-row compact">
                      {runtimeSnapshot.phases.map((phase) => (
                        <span className={phase.state === 'completed' ? 'badge badge-status' : phase.state === 'active' ? 'badge' : 'badge'} key={phase.key}>{phase.label}</span>
                      ))}
                    </div>
                  </div>
                  <div className="detail-simulation-surface">
                    <strong>风险与轨迹</strong>
                    <ul className="bullet-list">
                      {runtimeSnapshot.failureRisks.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                      {runtimeSnapshot.trace.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            ) : (
              <div className="detail-simulation-surface">
                <strong>运行态尚未接入</strong>
                <p>当前实验说明页还没有收到实时播放器快照。后续应让更多专属播放器和通用播放器统一输出 phase、读数、控制量与风险。</p>
              </div>
            )}
          </article>

          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">AI Grounding</span>
                <h2>AI 与仿真的深度耦合点</h2>
              </div>
              <small>AI 不应该只看到提问文本，而要直接读实验配置、目标对象、可观测量、多尺度规则和运行时状态快照。</small>
            </div>
            <div className="detail-simulation-dual-grid">
              <div className="detail-simulation-surface">
                <strong>当前 grounding 通道</strong>
                <ul className="bullet-list">
                  {simulationBlueprint.groundingChannels.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="detail-simulation-surface">
                <strong>下一步升级方向</strong>
                <ul className="bullet-list">
                  {simulationBlueprint.upgradeTargets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        </>
      ) : null}

      {activeLayer === 'scoring' ? (
        <>
          <article className="panel wide-panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Scoring</span>
                <h2>评分结构</h2>
              </div>
              <small>把评分权重和产品状态集中起来，方便教师复盘和产品继续打磨</small>
            </div>
            <div className="detail-meta-grid">
              <div className="detail-mini-card">
                <span>步骤得分</span>
                <strong>{experiment.scoring.stepScorePercent}%</strong>
                <small>主要衡量操作顺序与关键动作完成情况。</small>
              </div>
              <div className="detail-mini-card">
                <span>观察得分</span>
                <strong>{experiment.scoring.observationScorePercent}%</strong>
                <small>聚焦现象识别、读数记录与过程判断。</small>
              </div>
              <div className="detail-mini-card">
                <span>结果得分</span>
                <strong>{experiment.scoring.resultScorePercent}%</strong>
                <small>用于检验结论表达与知识迁移是否到位。</small>
              </div>
            </div>
          </article>

          <article className="panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Readiness</span>
                <h2>产品状态</h2>
              </div>
              <small>方便判断当前实验是配置可看、试点可用还是完整产品级</small>
            </div>
            <div className="status-pill-row detail-status-row">
              <span className="badge badge-status">{experiment.productization.status}</span>
              <span className="badge">{experiment.productization.interactionMode}</span>
              <ReadinessBadge label="3D 资产" ready={experiment.productization.assetsReady} />
              <ReadinessBadge label="实验考核" ready={experiment.productization.assessmentReady} />
              <ReadinessBadge label="教师闭环" ready={experiment.productization.teacherReady} />
            </div>
          </article>

          <article className="panel detail-surface-card">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Feedback</span>
                <h2>常见错误</h2>
              </div>
              <small>既能帮助教师讲解，也能指导学生复盘</small>
            </div>
            <ul className="bullet-list">
              {experiment.feedback.commonMistakes.map((mistake) => (
                <li key={mistake}>{mistake}</li>
              ))}
            </ul>
          </article>
        </>
      ) : null}
    </section>
  );
}
