import { useMemo } from 'react';
import { createApparatusRuntimeSnapshot } from '../lib/apparatusRuntime';
import { buildApparatusMutationSuggestions, deriveApparatusEngineSnapshot, getApparatusById, summarizeCompatibility } from '../lib/apparatusEngine';
import type { ApparatusRuntimeContext } from '../types/apparatus';
import type { ExperimentConfig } from '../types/experiment';

export function useExperimentApparatus(options: {
  experiment: ExperimentConfig | null;
  apparatusIds: string[];
  activeApparatusId?: string | null;
  runtimeContext?: ApparatusRuntimeContext;
}) {
  const { experiment, apparatusIds, activeApparatusId, runtimeContext } = options;

  const selectedApparatus = useMemo(
    () => apparatusIds.map((id) => getApparatusById(id)).filter((item): item is NonNullable<ReturnType<typeof getApparatusById>> => Boolean(item)),
    [apparatusIds],
  );

  const engineSnapshot = useMemo(() => deriveApparatusEngineSnapshot(apparatusIds), [apparatusIds]);
  const suggestions = useMemo(() => buildApparatusMutationSuggestions(apparatusIds, experiment), [apparatusIds, experiment]);
  const compatibilityLinks = useMemo(() => summarizeCompatibility(apparatusIds), [apparatusIds]);
  const activeApparatus = useMemo(() => {
    if (activeApparatusId) return getApparatusById(activeApparatusId);
    return selectedApparatus[0] ?? null;
  }, [activeApparatusId, selectedApparatus]);
  const runtimeSnapshot = useMemo(
    () => createApparatusRuntimeSnapshot(apparatusIds, runtimeContext, activeApparatusId),
    [activeApparatusId, apparatusIds, runtimeContext],
  );
  const activeRuntime = useMemo(() => {
    if (!runtimeSnapshot.instances.length) return null;
    if (runtimeSnapshot.activeInstanceId) {
      return runtimeSnapshot.instances.find((item) => item.instanceId === runtimeSnapshot.activeInstanceId) ?? null;
    }
    return runtimeSnapshot.instances[0] ?? null;
  }, [runtimeSnapshot]);

  return {
    activeApparatus,
    activeRuntime,
    compatibilityLinks,
    engineSnapshot,
    runtimeSnapshot,
    selectedApparatus,
    suggestions,
  };
}
