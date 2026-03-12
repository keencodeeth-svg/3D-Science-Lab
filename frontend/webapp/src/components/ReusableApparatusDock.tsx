import { useMemo } from 'react';
import { useExperimentApparatus } from '../hooks/useExperimentApparatus';
import type { ApparatusRuntimeContext, ApparatusRuntimePhase, ApparatusRuntimeValue } from '../types/apparatus';
import type { ExperimentConfig } from '../types/experiment';

interface ReusableApparatusDockProps {
  activeApparatusId?: string | null;
  apparatusIds: string[];
  contextLabel: string;
  experiment: ExperimentConfig | null;
  runtimeContext?: ApparatusRuntimeContext;
  title?: string;
}

const phaseMeta: Record<ApparatusRuntimePhase, { label: string }> = {
  idle: { label: '待机' },
  staged: { label: '预备' },
  active: { label: '运行中' },
  stable: { label: '稳定' },
  complete: { label: '完成' },
};

function formatRuntimeValue(value: ApparatusRuntimeValue) {
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

export function ReusableApparatusDock({
  activeApparatusId = null,
  apparatusIds,
  contextLabel,
  experiment,
  runtimeContext,
  title = '器材引擎视图',
}: ReusableApparatusDockProps) {
  const { activeApparatus, activeRuntime, compatibilityLinks, engineSnapshot, runtimeSnapshot, selectedApparatus, suggestions } = useExperimentApparatus({
    experiment,
    apparatusIds,
    activeApparatusId,
    runtimeContext,
  });

  const primarySuggestion = suggestions[0] ?? null;
  const runtimeById = useMemo(() => new Map(runtimeSnapshot.instances.map((item) => [item.apparatusId, item])), [runtimeSnapshot.instances]);
  const averageReadiness = useMemo(() => {
    if (!runtimeSnapshot.instances.length) return 0;
    return Math.round(runtimeSnapshot.instances.reduce((total, item) => total + item.readiness, 0) / runtimeSnapshot.instances.length);
  }, [runtimeSnapshot.instances]);
  const phaseSummary = useMemo(
    () =>
      (Object.entries(runtimeSnapshot.phaseCounts) as Array<[ApparatusRuntimePhase, number]>)
        .filter(([, count]) => count > 0)
        .map(([phase, count]) => `${phaseMeta[phase].label} ${count}`),
    [runtimeSnapshot.phaseCounts],
  );

  const activePhase = activeRuntime?.phase ?? 'idle';
  const activeValues = activeRuntime ? Object.entries(activeRuntime.values).slice(0, 4) : [];
  const blueprintParts = activeRuntime?.renderBlueprint.parts.slice(0, 4) ?? activeApparatus?.sceneRoles.slice(0, 4) ?? [];
  const blueprintMaterials = activeRuntime?.renderBlueprint.materialChannels.slice(0, 4) ?? engineSnapshot.materialFocus.slice(0, 4);
  const blueprintAnimations = activeRuntime?.renderBlueprint.animationChannels.slice(0, 4) ?? activeApparatus?.modelProfile.animationFocus.slice(0, 4) ?? [];
  const summaryBadges = [...phaseSummary, ...(primarySuggestion?.morphTargets ?? [])].slice(0, 4);

  return (
    <section className="info-card lab-engine-dock">
      <div className="lab-engine-dock-head">
        <div>
          <span className="eyebrow">Reusable Engine</span>
          <strong>{title}</strong>
          <p>{contextLabel}</p>
        </div>
        <div className="badge-row compact lab-engine-dock-badges">
          <span className="badge">器材 {selectedApparatus.length}</span>
          <span className="badge">平均就绪 {averageReadiness}%</span>
          <span className="badge badge-status">{engineSnapshot.qualityTier}</span>
        </div>
      </div>

      <div className="lab-engine-chip-row" aria-label="当前实验器材骨架">
        {selectedApparatus.map((item) => {
          const runtime = runtimeById.get(item.id);
          const label = runtime ? `${phaseMeta[runtime.phase].label} · ${runtime.readiness}%` : item.category;
          return (
            <span className={activeApparatus?.id === item.id ? 'lab-engine-chip active' : 'lab-engine-chip'} key={item.id}>
              <strong>{item.shortLabel}</strong>
              <span>{label}</span>
            </span>
          );
        })}
      </div>

      <div className="lab-engine-dock-grid">
        <article className="lab-engine-dock-card emphasis lab-engine-runtime-card">
          <div className="lab-engine-runtime-head">
            <div>
              <span>当前活跃器材</span>
              <strong>{activeRuntime?.name ?? activeApparatus?.name ?? '悬停器材后激活'}</strong>
            </div>
            <span className={`lab-engine-phase-badge phase-${activePhase}`}>{phaseMeta[activePhase].label}</span>
          </div>
          <small>{activeApparatus?.description ?? '当前器材会同步展示运行阶段、实时数值与共享渲染蓝图。'}</small>

          <div className="lab-engine-readiness">
            <div className="lab-engine-readiness-meta">
              <span>就绪度</span>
              <strong>{activeRuntime?.readiness ?? averageReadiness}%</strong>
            </div>
            <div className="lab-engine-readiness-bar" aria-hidden="true">
              <span className={`lab-engine-readiness-fill phase-${activePhase}`} style={{ width: `${activeRuntime?.readiness ?? averageReadiness}%` }} />
            </div>
          </div>

          <div className="lab-engine-runtime-values" aria-label="器材运行时数据">
            {activeValues.length ? (
              activeValues.map(([label, value]) => (
                <div className="lab-engine-runtime-value" key={label}>
                  <span>{label}</span>
                  <strong>{formatRuntimeValue(value)}</strong>
                </div>
              ))
            ) : (
              <div className="lab-engine-runtime-value is-empty">
                <span>等待运行时</span>
                <strong>悬停或操作器材后，这里会显示实时状态</strong>
              </div>
            )}
          </div>

          <div className="badge-row compact">
            {(activeRuntime?.badges?.length ? activeRuntime.badges : activeApparatus?.stateSchema ?? engineSnapshot.stateSchema)
              .slice(0, 4)
              .map((item) => (
                <span className="badge" key={item}>{item}</span>
              ))}
          </div>
        </article>

        <article className="lab-engine-dock-card">
          <span>渲染蓝图</span>
          <strong>{activeRuntime ? `${activeRuntime.renderBlueprint.anchor} · ${activeRuntime.renderBlueprint.parts.length} 个部件挂点` : '等待蓝图激活'}</strong>
          <small>
            {activeRuntime
              ? '器材已拆成共享对象工厂需要的部件、材质和动画通道，后续可继续替换为更高精模型。'
              : '当前未聚焦某个器材时，这里保留统一的共享建模描述。'}
          </small>

          <div className="lab-engine-blueprint-group">
            <span className="lab-engine-blueprint-label">部件</span>
            <div className="lab-engine-blueprint-row">
              {blueprintParts.map((item) => (
                <span className="lab-engine-blueprint-tag" key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="lab-engine-blueprint-group">
            <span className="lab-engine-blueprint-label">材质通道</span>
            <div className="lab-engine-blueprint-row">
              {blueprintMaterials.map((item) => (
                <span className="lab-engine-blueprint-tag" key={item}>{item}</span>
              ))}
            </div>
          </div>

          <div className="lab-engine-blueprint-group">
            <span className="lab-engine-blueprint-label">动画通道</span>
            <div className="lab-engine-blueprint-row">
              {blueprintAnimations.map((item) => (
                <span className="lab-engine-blueprint-tag" key={item}>{item}</span>
              ))}
            </div>
          </div>
        </article>

        <article className="lab-engine-dock-card">
          <span>引擎汇总</span>
          <strong>{phaseSummary.join(' · ') || '等待器材进入运行阶段'}</strong>
          <small>{primarySuggestion?.summary ?? '继续补充共享器材属性与连接端口，就能组合出更多实验模板。'}</small>

          <div className="lab-engine-runtime-values compact">
            <div className="lab-engine-runtime-value">
              <span>兼容连边</span>
              <strong>{compatibilityLinks.slice(0, 2).join(' · ') || '待形成'}</strong>
            </div>
            <div className="lab-engine-runtime-value">
              <span>魔改模板</span>
              <strong>{primarySuggestion?.title ?? '待生成'}</strong>
            </div>
            <div className="lab-engine-runtime-value">
              <span>统一交互</span>
              <strong>{engineSnapshot.interactions.slice(0, 3).join(' / ') || '待组合'}</strong>
            </div>
          </div>

          <div className="badge-row compact">
            {summaryBadges.map((item) => (
              <span className="badge" key={item}>{item}</span>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
