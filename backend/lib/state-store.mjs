import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.resolve(__dirname, '../data');
const seedStatePath = path.join(dataDir, 'seed-state.json');
const runtimeStatePath = path.join(dataDir, 'app-state.json');
let stateMutationQueue = Promise.resolve();

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function writeJsonAtomic(filePath, payload) {
  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempFilePath, payload);
  await fs.rename(tempFilePath, filePath);
}

function enqueueStateMutation(operation) {
  const nextOperation = stateMutationQueue.catch(() => undefined).then(operation);
  stateMutationQueue = nextOperation.then(() => undefined, () => undefined);
  return nextOperation;
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
  return enqueueStateMutation(async () => {
    await ensureRuntimeState();
    await writeJsonAtomic(runtimeStatePath, `${JSON.stringify(state, null, 2)}\n`);
    return state;
  });
}

export async function updateState(mutator) {
  return enqueueStateMutation(async () => {
    await ensureRuntimeState();
    const currentState = await readJson(runtimeStatePath);
    const nextState = await mutator(currentState);
    await writeJsonAtomic(runtimeStatePath, `${JSON.stringify(nextState, null, 2)}\n`);
    return nextState;
  });
}

export async function resetState() {
  return enqueueStateMutation(async () => {
    await fs.mkdir(dataDir, { recursive: true });
    const seedState = await readJson(seedStatePath);
    await writeJsonAtomic(runtimeStatePath, `${JSON.stringify(seedState, null, 2)}\n`);
    return seedState;
  });
}
