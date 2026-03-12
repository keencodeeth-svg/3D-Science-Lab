import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExperimentCollectionValid } from './experiment-validation.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.resolve(projectRoot, '../../backend/configs/experiments');
const targetDir = path.resolve(projectRoot, 'public/data/experiments');

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function main() {
  const sourceFiles = (await fs.readdir(sourceDir)).filter((file) => file.endsWith('.json')).sort();
  const entries = await Promise.all(
    sourceFiles.map(async (fileName) => ({
      fileName,
      config: await readJson(path.join(sourceDir, fileName)),
    })),
  );

  assertExperimentCollectionValid(entries);

  const targetFiles = (await fs.readdir(targetDir)).filter((file) => file.endsWith('.json')).sort();
  const expectedTargetFiles = [...sourceFiles, 'index.json'].sort();

  if (targetFiles.length !== expectedTargetFiles.length) {
    throw new Error(`Target experiment file count mismatch: expected ${expectedTargetFiles.length}, received ${targetFiles.length}`);
  }

  const missingTargetFiles = expectedTargetFiles.filter((file) => !targetFiles.includes(file));
  const staleTargetFiles = targetFiles.filter((file) => !expectedTargetFiles.includes(file));

  if (missingTargetFiles.length > 0) {
    throw new Error(`Target experiment files missing:\n- ${missingTargetFiles.join('\n- ')}`);
  }

  if (staleTargetFiles.length > 0) {
    throw new Error(`Target experiment files are stale:\n- ${staleTargetFiles.join('\n- ')}`);
  }

  const index = await readJson(path.join(targetDir, 'index.json'));
  if (!Array.isArray(index)) {
    throw new Error('Generated experiment index must be an array');
  }

  if (index.length !== sourceFiles.length) {
    throw new Error(`Generated experiment index count mismatch: expected ${sourceFiles.length}, received ${index.length}`);
  }

  const sourceById = new Map(entries.map((entry) => [entry.config.id, entry]));
  const indexIds = new Set();

  index.forEach((item, indexPosition) => {
    const pathPrefix = `index.json[${indexPosition}]`;
    if (typeof item?.id !== 'string' || item.id.length === 0) {
      throw new Error(`${pathPrefix}.id must be a non-empty string`);
    }
    if (indexIds.has(item.id)) {
      throw new Error(`${pathPrefix}.id duplicates experiment id "${item.id}"`);
    }
    indexIds.add(item.id);

    if (typeof item?.dataFile !== 'string' || !sourceFiles.includes(item.dataFile)) {
      throw new Error(`${pathPrefix}.dataFile must point to a source experiment file`);
    }

    const sourceEntry = sourceById.get(item.id);
    if (!sourceEntry) {
      throw new Error(`${pathPrefix}.id "${item.id}" does not exist in source configs`);
    }

    if (sourceEntry.fileName !== item.dataFile) {
      throw new Error(`${pathPrefix}.dataFile "${item.dataFile}" does not match source file "${sourceEntry.fileName}"`);
    }
  });

  console.log(`verified ${entries.length} experiment configs and ${index.length} generated index entries`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
