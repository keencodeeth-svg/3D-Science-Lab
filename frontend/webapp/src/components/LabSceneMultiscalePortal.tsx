import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { getFocusedExperimentMultiscaleView } from '../lib/multiscaleLab';
import type { ExperimentConfig, ExperimentStep, ExperimentMicroSpecies, MultiscaleLens } from '../types/experiment';
import '../styles/lab-studio.css';

interface LabSceneMultiscalePortalProps {
  experiment: ExperimentConfig;
  focusStep: ExperimentStep | null;
  focusTargetObject?: string;
  hostRef: RefObject<HTMLElement | null>;
}

const MULTISCALE_LENS_LABELS: Record<MultiscaleLens, string> = {
  macro: '宏观',
  meso: '中观',
  micro: '微观',
};

interface ParticleNode {
  id: string;
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  opacity: number;
}

interface ParticleBond {
  id: string;
  x: number;
  y: number;
  length: number;
  angle: number;
  opacity: number;
}

interface ParticleGroup {
  id: string;
  label: string;
  formula?: string;
  color: string;
  arrangement: ExperimentMicroSpecies['arrangement'];
  labelX: number;
  labelY: number;
  nodes: ParticleNode[];
  bonds: ParticleBond[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hashUnit(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function buildBond(id: string, from: ParticleNode, to: ParticleNode, opacity: number): ParticleBond {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  return {
    id,
    x: from.x,
    y: from.y,
    length: Math.sqrt(deltaX * deltaX + deltaY * deltaY),
    angle: (Math.atan2(deltaY, deltaX) * 180) / Math.PI,
    opacity,
  };
}

function buildParticleGroups(speciesList: ExperimentMicroSpecies[], lens: MultiscaleLens): ParticleGroup[] {
  const visibleSpecies = speciesList.slice(0, lens === 'micro' ? 3 : 2);
  return visibleSpecies.map((species, speciesIndex) => {
    const baseCount = lens === 'micro'
      ? clamp(Math.round(species.particleCountHint / 6), 10, 18)
      : clamp(Math.round(species.particleCountHint / 10), 5, 9);
    const anchorX = [24, 54, 78][speciesIndex] ?? 50;
    const anchorY = lens === 'micro' ? ([36, 54, 32][speciesIndex] ?? 48) : ([42, 58][speciesIndex] ?? 50);
    const nodes: ParticleNode[] = [];
    const bonds: ParticleBond[] = [];

    for (let index = 0; index < baseCount; index += 1) {
      const randomA = hashUnit(`${species.id}-${index}-a`);
      const randomB = hashUnit(`${species.id}-${index}-b`);
      const randomC = hashUnit(`${species.id}-${index}-c`);
      let x = anchorX;
      let y = anchorY;

      switch (species.arrangement) {
        case 'lattice': {
          const columns = Math.max(3, Math.round(Math.sqrt(baseCount)));
          const spacing = lens === 'micro' ? 3.8 : 4.8;
          const row = Math.floor(index / columns);
          const column = index % columns;
          x += (column - (columns - 1) / 2) * spacing + (randomA - 0.5) * 1.4;
          y += (row - Math.ceil(baseCount / columns) / 2) * spacing + (randomB - 0.5) * 1.4;
          break;
        }
        case 'cluster': {
          const ring = Math.floor(index / 4);
          const angle = ((index / Math.max(baseCount, 1)) * Math.PI * 2) + randomA * 0.7;
          const radius = 2.4 + ring * 2.1 + randomB * 1.8;
          x += Math.cos(angle) * radius;
          y += Math.sin(angle) * radius;
          break;
        }
        case 'flow':
        case 'solution': {
          x += -16 + (index / Math.max(baseCount - 1, 1)) * 32 + (randomA - 0.5) * 2;
          y += Math.sin(index * 0.8 + randomB * 5) * (species.arrangement === 'solution' ? 4.4 : 3.2) + (randomC - 0.5) * 1.5;
          break;
        }
        case 'gas': {
          x += (randomA - 0.5) * 26;
          y += (randomB - 0.5) * 18;
          break;
        }
        case 'chain': {
          x += -15 + (index / Math.max(baseCount - 1, 1)) * 30;
          y += Math.sin(index * 0.92 + randomA * 4) * 5.8 + (randomB - 0.5) * 1.6;
          break;
        }
        case 'network':
        default: {
          x += (randomA - 0.5) * 20;
          y += Math.cos(index * 0.85 + randomB * 5) * 6 + (randomC - 0.5) * 5;
          break;
        }
      }

      nodes.push({
        id: `${species.id}-${index}`,
        x: clamp(x, 8, 92),
        y: clamp(y, 14, 82),
        size: (lens === 'micro' ? 5.6 : 4.4) + randomA * (lens === 'micro' ? 3 : 2),
        delay: randomB * 2.2,
        duration: 3.8 + randomC * 3.4,
        opacity: 0.42 + randomA * 0.42,
      });
    }

    if (species.arrangement === 'chain' || species.arrangement === 'flow' || species.arrangement === 'solution') {
      for (let index = 0; index < nodes.length - 1; index += 1) {
        bonds.push(buildBond(`${species.id}-bond-${index}`, nodes[index]!, nodes[index + 1]!, lens === 'micro' ? 0.22 : 0.14));
      }
    }

    if (species.arrangement === 'lattice') {
      const columns = Math.max(3, Math.round(Math.sqrt(baseCount)));
      for (let index = 0; index < nodes.length; index += 1) {
        const right = index + 1;
        const below = index + columns;
        if (right < nodes.length && index % columns !== columns - 1) {
          bonds.push(buildBond(`${species.id}-lattice-r-${index}`, nodes[index]!, nodes[right]!, lens === 'micro' ? 0.18 : 0.12));
        }
        if (below < nodes.length) {
          bonds.push(buildBond(`${species.id}-lattice-b-${index}`, nodes[index]!, nodes[below]!, lens === 'micro' ? 0.16 : 0.1));
        }
      }
    }

    if (species.arrangement === 'network') {
      for (let index = 0; index < nodes.length - 2; index += 2) {
        bonds.push(buildBond(`${species.id}-net-a-${index}`, nodes[index]!, nodes[index + 1]!, lens === 'micro' ? 0.16 : 0.1));
        bonds.push(buildBond(`${species.id}-net-b-${index}`, nodes[index]!, nodes[index + 2]!, lens === 'micro' ? 0.12 : 0.08));
      }
    }

    return {
      id: species.id,
      label: species.name,
      formula: species.formula,
      color: species.color,
      arrangement: species.arrangement,
      labelX: anchorX,
      labelY: clamp(anchorY + (lens === 'micro' ? 12 : 10), 18, 86),
      nodes,
      bonds,
    };
  });
}

export function LabSceneMultiscalePortal({
  experiment,
  focusStep,
  focusTargetObject,
  hostRef,
}: LabSceneMultiscalePortalProps) {
  const [targetNode, setTargetNode] = useState<HTMLElement | null>(null);
  const focused = useMemo(
    () => getFocusedExperimentMultiscaleView(experiment, { step: focusStep, focusTargetObject }),
    [experiment, focusStep, focusTargetObject],
  );
  const particleGroups = useMemo(
    () => buildParticleGroups(focused.species, focused.focusedLens),
    [focused.focusedLens, focused.species],
  );

  useEffect(() => {
    const hostNode = hostRef.current;
    if (!hostNode) {
      setTargetNode(null);
      return;
    }

    const syncTarget = () => {
      const nextTarget = hostNode.querySelector('.scene-canvas');
      setTargetNode((current) => (current === nextTarget ? current : (nextTarget as HTMLElement | null)));
    };

    syncTarget();

    const observer = new MutationObserver(syncTarget);
    observer.observe(hostNode, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [experiment.id, hostRef]);

  if (!targetNode) return null;

  return createPortal(
    <div className={`lab-scene-runtime-layer ${focused.focusedLens}`} data-source={focused.multiscale.source}>
      {focused.focusedLens !== 'macro' && particleGroups.length ? (
        <div className={`lab-scene-particle-field ${focused.focusedLens}`} aria-hidden="true">
          {particleGroups.map((group) => (
            <div className={`lab-scene-particle-group ${group.arrangement}`} key={group.id}>
              {group.bonds.map((bond) => (
                <span
                  className="lab-scene-particle-bond"
                  key={bond.id}
                  style={{
                    left: `${bond.x}%`,
                    top: `${bond.y}%`,
                    width: `${bond.length}%`,
                    opacity: bond.opacity,
                    transform: `translateY(-50%) rotate(${bond.angle}deg)`,
                    '--particle-color': group.color,
                  } as CSSProperties}
                />
              ))}
              {group.nodes.map((node) => (
                <span
                  className="lab-scene-particle-node"
                  key={node.id}
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    width: `${node.size}px`,
                    height: `${node.size}px`,
                    opacity: node.opacity,
                    animationDelay: `${node.delay}s`,
                    animationDuration: `${node.duration}s`,
                    '--particle-color': group.color,
                  } as CSSProperties}
                />
              ))}
              <span
                className="lab-scene-particle-label"
                style={{
                  left: `${group.labelX}%`,
                  top: `${group.labelY}%`,
                  '--particle-color': group.color,
                } as CSSProperties}
              >
                {group.label}{group.formula ? ` · ${group.formula}` : ''}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className={`lab-scene-lens-tag ${focused.focusedLens}`}>
        <span>Lens</span>
        <strong>{MULTISCALE_LENS_LABELS[focused.focusedLens]}层</strong>
        <small>{focused.ruleSummary}</small>
      </div>

      <section className={`lab-scene-scale-hud ${focused.focusedLens}`}>
        <div className="lab-scene-scale-head">
          <div>
            <span>Multiscale Runtime</span>
            <strong>{MULTISCALE_LENS_LABELS[focused.focusedLens]}层聚焦 · {focused.focusEquipmentLabel}</strong>
          </div>
          <div className="lab-scene-scale-pill-row" aria-hidden="true">
            <span className="lab-scene-scale-pill">{focused.multiscale.source === 'configured' ? '显式配置' : '引擎推导'}</span>
            <span className={`lab-scene-scale-pill lens ${focused.focusedLens}`}>{MULTISCALE_LENS_LABELS[focused.focusedLens]}</span>
          </div>
        </div>

        <div className="lab-scene-scale-grid">
          <article className="lab-scene-scale-card macro">
            <span>Macro</span>
            <strong>{focused.focusEquipmentLabel}</strong>
            <small>{focused.componentSummary}</small>
          </article>
          <article className="lab-scene-scale-card meso">
            <span>Meso</span>
            <strong>{focused.materialSummary}</strong>
            <small>{focused.ruleSummary}</small>
          </article>
          <article className="lab-scene-scale-card micro">
            <span>Micro</span>
            <strong>{focused.speciesSummary}</strong>
            <small>{focused.ruleNarrative}</small>
          </article>
        </div>

        <div className="lab-scene-scale-foot">
          <small>{focused.traceSummary}</small>
          <div className="lab-scene-scale-pill-row" aria-hidden="true">
            <span className="lab-scene-scale-pill">{focused.componentCount || 0} 组件</span>
            <span className="lab-scene-scale-pill">{focused.materialCount} 材料</span>
            <span className="lab-scene-scale-pill">{focused.speciesCount > 0 ? `${focused.speciesCount} 粒子簇` : '按需粒子'}</span>
          </div>
        </div>
      </section>
    </div>,
    targetNode,
  );
}
