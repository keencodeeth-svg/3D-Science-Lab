import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExperimentCollectionValid } from './experiment-validation.mjs';
import { syncGeneratedMultiscaleEngine } from '../../../backend/scripts/sync-multiscale-engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.resolve(projectRoot, '../../backend/configs/experiments');
const targetDir = path.resolve(projectRoot, 'public/data/experiments');

async function main() {
  await syncGeneratedMultiscaleEngine();
  const { createExperimentIndexItem, loadMultiscaleEngine } = await import('../../../backend/lib/experiment-catalog.mjs');
  const files = (await fs.readdir(sourceDir)).filter((file) => file.endsWith('.json')).sort();
  const index = [];
  const { getExperimentMultiscaleView } = await loadMultiscaleEngine();
  const entries = [];

  for (const file of files) {
    const sourcePath = path.join(sourceDir, file);
    const raw = await fs.readFile(sourcePath, 'utf8');
    entries.push({
      fileName: file,
      config: JSON.parse(raw),
    });
  }

  assertExperimentCollectionValid(entries);
  await fs.mkdir(targetDir, { recursive: true });

  const existingTargetFiles = (await fs.readdir(targetDir)).filter((file) => file.endsWith('.json'));
  await Promise.all(existingTargetFiles.map((file) => fs.rm(path.join(targetDir, file), { force: true })));

  for (const entry of entries) {
    const file = entry.fileName;
    const targetPath = path.join(targetDir, file);
    const parsed = entry.config;

    await fs.writeFile(targetPath, JSON.stringify(parsed, null, 2));
    index.push(createExperimentIndexItem(parsed, file, getExperimentMultiscaleView));
  }

  await fs.writeFile(path.join(targetDir, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`synced ${entries.length} experiment configs`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
