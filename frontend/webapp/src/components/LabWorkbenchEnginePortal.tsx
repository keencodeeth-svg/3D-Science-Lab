import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { FocusedExperimentMultiscaleView } from '../lib/multiscaleLab';

interface LabWorkbenchEnginePortalProps {
  focused: FocusedExperimentMultiscaleView;
  hostRef: RefObject<HTMLElement | null>;
  rightRailVisible: boolean;
  studioMode: 'operation' | 'record' | 'guide';
}

type EnginePortalSurface = 'rail' | 'floating';

const MULTISCALE_LENS_LABELS = {
  macro: '宏观',
  meso: '中观',
  micro: '微观',
} as const;

const MULTISCALE_SOURCE_LABELS = {
  configured: '显式配置',
  derived: '引擎推导',
} as const;

function formatPropertyValue(value: string | number, unit?: string) {
  return typeof value === 'number' ? `${value}${unit ?? ''}` : `${value}${unit ? ` ${unit}` : ''}`;
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export function LabWorkbenchEnginePortal({
  focused,
  hostRef,
  rightRailVisible,
  studioMode,
}: LabWorkbenchEnginePortalProps) {
  const [targetNode, setTargetNode] = useState<HTMLElement | null>(null);
  const [surface, setSurface] = useState<EnginePortalSurface>('floating');

  const propertyHighlights = useMemo(
    () =>
      focused.focusMaterials
        .slice(0, 2)
        .flatMap((material) =>
          material.properties.slice(0, 2).map((property) => ({
            id: `${material.id}-${property.key}`,
            label: `${material.name} · ${property.label}`,
            value: formatPropertyValue(property.value, property.unit),
          })),
        )
        .slice(0, 4),
    [focused.focusMaterials],
  );

  const runtimeRules = useMemo(
    () => (focused.relevantRules.length ? focused.relevantRules.slice(0, 2) : focused.activeRule ? [focused.activeRule] : []),
    [focused.activeRule, focused.relevantRules],
  );

  const interactionHighlights = useMemo(
    () =>
      dedupeStrings(
        focused.focusMaterials.flatMap((material) => [
          material.microModel?.narrative ?? '',
          ...(material.microModel?.interactions ?? []),
        ]),
      ).slice(0, 3),
    [focused.focusMaterials],
  );

  useEffect(() => {
    const hostNode = hostRef.current;
    if (!hostNode) {
      setTargetNode(null);
      return;
    }

    const syncTarget = () => {
      const dockTarget = hostNode.querySelector('.playground-grid > .playground-side:last-child');
      if (dockTarget instanceof HTMLElement) {
        setSurface('rail');
        setTargetNode((current) => (current === dockTarget ? current : dockTarget));
        return;
      }

      const floatingTarget = hostNode.querySelector('.scene-canvas');
      if (floatingTarget instanceof HTMLElement) {
        setSurface('floating');
        setTargetNode((current) => (current === floatingTarget ? current : floatingTarget));
        return;
      }

      setTargetNode(null);
    };

    syncTarget();

    const observer = new MutationObserver(syncTarget);
    observer.observe(hostNode, { attributes: true, childList: true, subtree: true });

    return () => observer.disconnect();
  }, [focused.focusEquipmentId, hostRef, rightRailVisible, studioMode]);

  if (!targetNode) return null;

  return createPortal(
    <div className={`lab-workbench-engine-portal ${surface} ${focused.focusedLens}`}>
      <section className="lab-workbench-engine-card" aria-hidden="true">
        <header className="lab-workbench-engine-head">
          <div className="lab-workbench-engine-copy">
            <span>Workbench Engine</span>
            <strong>{focused.focusEquipmentLabel}</strong>
            <small>{focused.traceSummary}</small>
          </div>
          <div className="lab-workbench-engine-pill-row">
            <span className="lab-workbench-engine-pill">{MULTISCALE_SOURCE_LABELS[focused.multiscale.source]}</span>
            <span className={`lab-workbench-engine-pill lens ${focused.focusedLens}`}>{MULTISCALE_LENS_LABELS[focused.focusedLens]}层</span>
          </div>
        </header>

        <div className="lab-workbench-engine-scale-grid">
          <article className="lab-workbench-engine-scale-card macro">
            <span>Macro</span>
            <strong>{focused.componentCount > 0 ? `${focused.componentCount} 个组件` : '器材骨架'}</strong>
            <small>{focused.componentSummary}</small>
          </article>
          <article className="lab-workbench-engine-scale-card meso">
            <span>Meso</span>
            <strong>{focused.materialCount > 0 ? `${focused.materialCount} 类材料` : '材料待推导'}</strong>
            <small>{focused.ruleSummary}</small>
          </article>
          <article className="lab-workbench-engine-scale-card micro">
            <span>Micro</span>
            <strong>{focused.speciesCount > 0 ? `${focused.speciesCount} 个粒子簇` : '按需粒子'}</strong>
            <small>{focused.ruleNarrative}</small>
          </article>
        </div>

        <section className="lab-workbench-engine-section">
          <div className="lab-workbench-engine-section-head">
            <span>材料属性</span>
            <strong>{focused.materialSummary}</strong>
          </div>
          <div className="lab-workbench-engine-chip-grid">
            {propertyHighlights.length ? (
              propertyHighlights.map((item) => (
                <article className="lab-workbench-engine-chip-card" key={item.id}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </article>
              ))
            ) : (
              <article className="lab-workbench-engine-chip-card muted">
                <span>属性层</span>
                <strong>按当前器材自动派生</strong>
              </article>
            )}
          </div>
        </section>

        <section className="lab-workbench-engine-section">
          <div className="lab-workbench-engine-section-head">
            <span>规则运行</span>
            <strong>{runtimeRules.length ? `${runtimeRules.length} 条活动规则` : '按需解释'}</strong>
          </div>
          <div className="lab-workbench-engine-rule-list">
            {runtimeRules.length ? (
              runtimeRules.map((rule) => (
                <article className="lab-workbench-engine-rule-card" key={rule.id}>
                  <strong>{rule.when}</strong>
                  <small>{rule.observe}</small>
                </article>
              ))
            ) : (
              <article className="lab-workbench-engine-rule-card">
                <strong>规则层待触发</strong>
                <small>{focused.ruleSummary}</small>
              </article>
            )}
          </div>
        </section>

        <section className="lab-workbench-engine-section">
          <div className="lab-workbench-engine-section-head">
            <span>粒子生成</span>
            <strong>{focused.speciesCount > 0 ? focused.speciesSummary : '微观层按需展开'}</strong>
          </div>
          <div className="lab-workbench-engine-species-row">
            {focused.species.length ? (
              focused.species.slice(0, 4).map((species) => (
                <span
                  className="lab-workbench-engine-species-pill"
                  key={species.id}
                  style={{ '--engine-species-color': species.color } as CSSProperties}
                >
                  {species.name}{species.formula ? ` · ${species.formula}` : ''}
                </span>
              ))
            ) : (
              <span className="lab-workbench-engine-species-pill muted">程序粒子待生成</span>
            )}
          </div>
          <small className="lab-workbench-engine-note">
            {interactionHighlights[0] ?? '宏观层用器材和组件约束，中观层用材料属性和反应规则，微观层只在需要解释时进入。'}
          </small>
        </section>
      </section>
    </div>,
    targetNode,
  );
}
