import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, '../data');
const seedStatePath = path.join(dataDir, 'seed-state.json');
const runtimeStatePath = path.join(dataDir, 'app-state.json');

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export async function ensureRuntimeState() {
  await fs.mkdir(dataDir, { recursive: true });

  try {
    await fs.access(runtimeStatePath);
  } catch {
    await fs.copyFile(seedStatePath, runtimeStatePath);
  }
}

export async function readState() {
  await ensureRuntimeState();
  return readJson(runtimeStatePath);
}

export async function writeState(state) {
  await ensureRuntimeState();
  await fs.writeFile(runtimeStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

export async function updateState(mutator) {
  const currentState = await readState();
  const nextState = await mutator(currentState);
  await writeState(nextState);
  return nextState;
}

export async function resetState() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.copyFile(seedStatePath, runtimeStatePath);
  return readJson(runtimeStatePath);
}
