import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as multiscaleEngineModule from './generated/multiscale-engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendRoot = path.resolve(__dirname, '..');
const experimentsDir = path.resolve(backendRoot, 'configs/experiments');

let multiscaleEnginePromise;

export async function loadExperimentEntries() {
  const files = (await fs.readdir(experimentsDir)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (fileName) => ({
      fileName,
      config: JSON.parse(await fs.readFile(path.join(experimentsDir, fileName), 'utf8')),
    })),
  );
}

export async function loadMultiscaleEngine() {
  if (!multiscaleEnginePromise) {
    multiscaleEnginePromise = (async () => {
      if (typeof multiscaleEngineModule.getExperimentMultiscaleView !== 'function') {
        throw new Error('Generated experiment multiscale engine is unavailable. Run `node backend/scripts/sync-multiscale-engine.mjs` first.');
      }

      return multiscaleEngineModule;
    })();
  }

  return multiscaleEnginePromise;
}

export function createExperimentIndexItem(config, fileName, getExperimentMultiscaleView) {
  const multiscale = getExperimentMultiscaleView(config);
  return {
    id: config.id,
    title: config.title,
    stage: config.stage,
    subject: config.subject,
    grade: config.grade,
    durationMinutes: config.durationMinutes,
    modes: config.modes,
    curriculumTheme: config.curriculum.theme,
    productStatus: config.productization.status,
    interactionMode: config.productization.interactionMode,
    assessmentReady: config.productization.assessmentReady,
    teacherReady: config.productization.teacherReady,
    assetsReady: config.productization.assetsReady,
    multiscaleSummary: {
      source: multiscale.source,
      defaultLens: multiscale.defaultLens,
      materialCount: multiscale.stats.materialCount,
      speciesCount: multiscale.stats.speciesCount,
      reactionRuleCount: multiscale.stats.reactionRuleCount,
      componentCount: multiscale.stats.componentCount,
    },
    dataFile: fileName,
  };
}

export async function loadExperimentIndex(filters = {}) {
  const entries = await loadExperimentEntries();
  const { getExperimentMultiscaleView } = await loadMultiscaleEngine();
  const { stage = '', subject = '', grade = '' } = filters;

  return entries
    .map(({ fileName, config }) => createExperimentIndexItem(config, fileName, getExperimentMultiscaleView))
    .filter((item) => {
      if (stage && item.stage !== stage) return false;
      if (subject && item.subject !== subject) return false;
      if (grade && item.grade !== grade) return false;
      return true;
    });
}

export async function loadExperimentConfigById(experimentId) {
  const entries = await loadExperimentEntries();
  return entries.find(({ config }) => config.id === experimentId)?.config ?? null;
}
