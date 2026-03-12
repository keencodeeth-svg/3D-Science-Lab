import { useEffect, useMemo, useState } from 'react';
import { APPARATUS_CATALOG, apparatusCategoryOptions, apparatusSubjectOptions, buildApparatusMutationSuggestions, deriveApparatusEngineSnapshot, getApparatusById, getExperimentApparatusSummary, sortCatalogForWorkbench, summarizeCompatibility } from '../lib/apparatusEngine';
import type { ExperimentConfig } from '../types/experiment';
import type { ApparatusCategory, ApparatusSubject } from '../types/apparatus';

interface ApparatusEnginePanelProps {
  experiment: ExperimentConfig | null;
}

export function ApparatusEnginePanel({ experiment }: ApparatusEnginePanelProps) {
  const experimentSummary = useMemo(() => getExperimentApparatusSummary(experiment), [experiment]);
  const [selectedIds, setSelectedIds] = useState<string[]>(experimentSummary.recommendedIds);
  const [subjectFilter, setSubjectFilter] = useState<ApparatusSubject | '全部'>('全部');
  const [categoryFilter, setCategoryFilter] = useState<(typeof apparatusCategoryOptions)[number]>('全部');

  useEffect(() => {
    setSelectedIds(experimentSummary.recommendedIds);
  }, [experimentSummary.recommendedIds]);

  const engineSnapshot = useMemo(() => deriveApparatusEngineSnapshot(selectedIds), [selectedIds]);
  const suggestions = useMemo(() => buildApparatusMutationSuggestions(selectedIds, experiment), [experiment, selectedIds]);
  const compatibilityLinks = useMemo(() => summarizeCompatibility(selectedIds), [selectedIds]);
  const catalog = useMemo(() => sortCatalogForWorkbench(selectedIds), [selectedIds]);
  const visibleCatalog = useMemo(
    () =>
      catalog.filter((item) => {
        const subjectOk = subjectFilter === '全部' || item.subjects.includes(subjectFilter);
        const categoryOk = categoryFilter === '全部' || item.category === categoryFilter;
        return subjectOk && categoryOk;
      }),
    [catalog, categoryFilter, subjectFilter],
  );

  const selectedApparatus = selectedIds
    .map((id) => getApparatusById(id))
    .filter((item): item is NonNullable<ReturnType<typeof getApparatusById>> => Boolean(item));

  const handleToggleApparatus = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleResetRecommended = () => {
    setSelectedIds(experimentSummary.recommendedIds);
  };

  return (
    <section className="detail-grid apparatus-engine-grid">
      <article className="panel wide-panel apparatus-engine-hero-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">Reusable Lab Engine</span>
            <h2>器材复用引擎</h2>
            <p>把器材从“某个实验的一次性模型”升级成“可组合、可带状态、可跨学科魔改”的实验引擎资产。</p>
          </div>
          <div className="badge-row compact">
            <span className="badge">器材底座 {APPARATUS_CATALOG.length}</span>
            <span className="badge">已选 {selectedIds.length}</span>
            <span className="badge badge-status">引擎分 {engineSnapshot.engineScore}</span>
          </div>
        </div>

        <div className="apparatus-engine-metric-grid">
          <div className="apparatus-engine-metric-card">
            <span>当前实验匹配</span>
            <strong>{experimentSummary.matchedCount}</strong>
            <small>{experiment ? `从 ${experiment.equipment.length} 个器材中抽出了可复用骨架。` : '未选择实验时展示通用骨架。'}</small>
          </div>
          <div className="apparatus-engine-metric-card">
            <span>跨学科器材</span>
            <strong>{engineSnapshot.crossSubjectCount}</strong>
            <small>同一器材可同时携带物理、化学、生物属性与状态。</small>
          </div>
          <div className="apparatus-engine-metric-card">
            <span>可控状态</span>
            <strong>{engineSnapshot.stateSchema.length}</strong>
            <small>液位、焦距、电流、温度、沉积等都能作为统一状态层。</small>
          </div>
          <div className="apparatus-engine-metric-card">
            <span>可组合实验</span>
            <strong>{suggestions.length || '—'}</strong>
            <small>根据器材骨架自动推演可魔改的实验模板。</small>
          </div>
        </div>

        {experiment ? (
          <div className="apparatus-experiment-summary">
            <div className="apparatus-experiment-copy">
              <strong>当前实验推荐骨架</strong>
              <p>{experiment.title} 已自动映射到一组可复用器材。你可以保留推荐，也可以手动增减器材来魔改新的实验组合。</p>
            </div>
            <div className="badge-row compact">
              {experimentSummary.recommendedIds.map((id) => {
                const apparatus = getApparatusById(id);
                return apparatus ? <span className="badge" key={id}>{apparatus.shortLabel}</span> : null;
              })}
            </div>
          </div>
        ) : null}

        <div className="apparatus-selection-row">
          {selectedApparatus.length ? selectedApparatus.map((item) => (
            <button className="apparatus-selection-chip active" key={item.id} onClick={() => handleToggleApparatus(item.id)} type="button">
              <strong>{item.shortLabel}</strong>
              <span>{item.category}</span>
            </button>
          )) : <div className="apparatus-empty-hint">先从下方目录选几件器材，右侧就会生成可复用状态与组合实验。</div>}
        </div>

        <div className="apparatus-engine-action-row">
          <button className="scene-action active" onClick={handleResetRecommended} type="button">恢复推荐骨架</button>
          <button className="scene-action" onClick={() => setSelectedIds([])} type="button">清空编排</button>
        </div>
      </article>

      <article className="panel wide-panel apparatus-engine-surface">
        <div className="panel-head compact-panel-head">
          <div>
            <span className="eyebrow">Catalog</span>
            <h2>器材底座目录</h2>
          </div>
          <small>每个器材都带材质重点、可控状态、连接端口和跨实验复用方向。</small>
        </div>

        <div className="apparatus-engine-filter-bar">
          <div className="badge-row compact">
            {apparatusSubjectOptions.map((option) => (
              <button className={subjectFilter === option.value ? 'scene-action active' : 'scene-action'} key={option.value} onClick={() => setSubjectFilter(option.value)} type="button">{option.label}</button>
            ))}
          </div>
          <div className="badge-row compact">
            {apparatusCategoryOptions.map((option) => (
              <button className={categoryFilter === option ? 'scene-action active' : 'scene-action'} key={option} onClick={() => setCategoryFilter(option)} type="button">{option}</button>
            ))}
          </div>
        </div>

        <div className="apparatus-card-grid">
          {visibleCatalog.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <button className={isSelected ? 'apparatus-card active' : 'apparatus-card'} key={item.id} onClick={() => handleToggleApparatus(item.id)} type="button">
                <div className="apparatus-card-head">
                  <div>
                    <span>{item.category}</span>
                    <strong>{item.name}</strong>
                  </div>
                  <span className={item.modelProfile.qualityTier === 'hero' ? 'badge badge-status' : 'badge'}>{item.modelProfile.qualityTier}</span>
                </div>
                <p>{item.description}</p>
                <div className="badge-row compact">
                  {item.subjects.map((subject) => <span className="badge" key={subject}>{subject}</span>)}
                </div>
                <div className="apparatus-card-meta">
                  <small>状态：{item.stateSchema.slice(0, 3).join(' / ')}</small>
                  <small>端口：{item.ports.slice(0, 3).join(' / ')}</small>
                  <small>重点：{item.modelProfile.materialFocus.slice(0, 2).join(' / ')}</small>
                </div>
              </button>
            );
          })}
        </div>
      </article>

      <article className="panel wide-panel apparatus-engine-surface">
        <div className="apparatus-engine-lower-grid">
          <section className="apparatus-engine-column">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">State Graph</span>
                <h2>统一状态与属性层</h2>
              </div>
              <small>不再只关心模型长什么样，还定义它能被哪些规则驱动。</small>
            </div>

            <div className="apparatus-attribute-grid">
              <article className="apparatus-attribute-card">
                <span>Physical</span>
                <strong>物理属性</strong>
                <div className="badge-row compact">
                  {engineSnapshot.physicalHighlights.length ? engineSnapshot.physicalHighlights.map((item) => <span className="badge" key={item}>{item}</span>) : <span className="badge">待选择器材</span>}
                </div>
              </article>
              <article className="apparatus-attribute-card">
                <span>Chemical</span>
                <strong>化学属性</strong>
                <div className="badge-row compact">
                  {engineSnapshot.chemicalHighlights.length ? engineSnapshot.chemicalHighlights.map((item) => <span className="badge" key={item}>{item}</span>) : <span className="badge">待选择器材</span>}
                </div>
              </article>
              <article className="apparatus-attribute-card">
                <span>Biological</span>
                <strong>生物属性</strong>
                <div className="badge-row compact">
                  {engineSnapshot.biologicalHighlights.length ? engineSnapshot.biologicalHighlights.map((item) => <span className="badge" key={item}>{item}</span>) : <span className="badge">待选择器材</span>}
                </div>
              </article>
            </div>

            <div className="apparatus-state-list">
              <div className="apparatus-state-card">
                <strong>状态 Schema</strong>
                <small>{engineSnapshot.stateSchema.length ? engineSnapshot.stateSchema.join(' · ') : '待选择器材'}</small>
              </div>
              <div className="apparatus-state-card">
                <strong>交互端口</strong>
                <small>{engineSnapshot.ports.length ? engineSnapshot.ports.join(' · ') : '待选择器材'}</small>
              </div>
              <div className="apparatus-state-card">
                <strong>兼容连边</strong>
                <small>{compatibilityLinks.length ? compatibilityLinks.join(' · ') : '当前组合还没有形成明显的器材连边。'}</small>
              </div>
              <div className="apparatus-state-card">
                <strong>建模重点</strong>
                <small>{engineSnapshot.materialFocus.length ? engineSnapshot.materialFocus.join(' · ') : '待选择器材'}</small>
              </div>
            </div>
          </section>

          <section className="apparatus-engine-column">
            <div className="panel-head compact-panel-head">
              <div>
                <span className="eyebrow">Mutation</span>
                <h2>可魔改实验模板</h2>
              </div>
              <small>基于器材骨架自动推演还能做什么，而不是每个实验都从零重建。</small>
            </div>

            <div className="apparatus-scenario-grid">
              {suggestions.length ? suggestions.map((suggestion) => (
                <article className="apparatus-scenario-card" key={suggestion.id}>
                  <div className="apparatus-scenario-head">
                    <div>
                      <span>Engine Template</span>
                      <strong>{suggestion.title}</strong>
                    </div>
                    <span className="badge badge-status">{suggestion.subjects.join(' / ')}</span>
                  </div>
                  <p>{suggestion.summary}</p>
                  <div className="apparatus-scenario-meta">
                    <div>
                      <span>可控变量</span>
                      <small>{suggestion.controllables.join(' · ')}</small>
                    </div>
                    <div>
                      <span>可观察结果</span>
                      <small>{suggestion.observables.join(' · ')}</small>
                    </div>
                    <div>
                      <span>可魔改为</span>
                      <small>{suggestion.morphTargets.join(' · ')}</small>
                    </div>
                  </div>
                  <div className="apparatus-scenario-foot">
                    <strong>引擎价值</strong>
                    <small>{suggestion.engineValue}</small>
                  </div>
                </article>
              )) : (
                <article className="apparatus-scenario-card empty">
                  <div className="apparatus-scenario-head">
                    <div>
                      <span>Engine Template</span>
                      <strong>当前组合还不够成型</strong>
                    </div>
                    <span className="badge">继续加器材</span>
                  </div>
                  <p>建议至少拼出“容器 + 转移 / 观察 / 电学核心件”的骨架，这样才能自动推演成完整实验模板。</p>
                </article>
              )}
            </div>

            {experimentSummary.unmatchedEquipment.length ? (
              <div className="apparatus-unmatched-box">
                <strong>仍待引擎化的实验器材</strong>
                <small>{experimentSummary.unmatchedEquipment.join(' · ')}</small>
              </div>
            ) : null}
          </section>
        </div>
      </article>
    </section>
  );
}
