import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendRoot = path.resolve(__dirname, '..');
const projectRoot = path.resolve(backendRoot, '..');
const experimentsDir = path.resolve(backendRoot, 'configs/experiments');
const webappRoot = path.resolve(projectRoot, 'frontend/webapp');

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
      let typescriptModule;
      try {
        typescriptModule = await import(pathToFileURL(path.resolve(webappRoot, 'node_modules/typescript/lib/typescript.js')).href);
      } catch (error) {
        throw new Error('Experiment catalog requires frontend/webapp dependencies. Run `cd frontend/webapp && npm install` first.', { cause: error });
      }

      const ts = typescriptModule.default ?? typescriptModule;
      const source = await fs.readFile(path.resolve(webappRoot, 'src/lib/multiscaleLab.ts'), 'utf8');
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: {
          module: ts.ModuleKind.ES2020,
          target: ts.ScriptTarget.ES2020,
        },
      });

      const runtimeUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
      const module = await import(runtimeUrl);
      if (typeof module.getExperimentMultiscaleView !== 'function') {
        throw new Error('Experiment multiscale engine is unavailable');
      }

      return module;
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
