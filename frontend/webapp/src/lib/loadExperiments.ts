import { requestJson } from './http';
import type { ExperimentConfig, ExperimentIndexItem } from '../types/experiment';

type ExperimentIndexCacheEntry = {
  hydrated: boolean;
  promise: Promise<ExperimentIndexItem[]> | null;
  refreshPromise: Promise<ExperimentIndexItem[]> | null;
  refreshedAt: number;
  value: ExperimentIndexItem[] | null;
};

type ExperimentConfigCacheEntry = {
  promise: Promise<ExperimentConfig>;
  refreshPromise: Promise<ExperimentConfig> | null;
  refreshedAt: number;
  value: ExperimentConfig | null;
};

const EXPERIMENT_INDEX_STORAGE_KEY = '3d-science-lab:experiment-index-cache';
const EXPERIMENT_INDEX_STALE_MS = 5 * 60 * 1000;
const experimentIndexCache: ExperimentIndexCacheEntry = {
  hydrated: false,
  promise: null,
  refreshPromise: null,
  refreshedAt: 0,
  value: null,
};
const experimentConfigPromiseCache = new Map<string, ExperimentConfigCacheEntry>();
const EXPERIMENT_CONFIG_STALE_MS = 90 * 1000;

function readStorageItem(key: string) {
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageItem(key: string, value: string) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function hydrateExperimentIndexCache() {
  if (experimentIndexCache.hydrated) return;
  experimentIndexCache.hydrated = true;

  const raw = readStorageItem(EXPERIMENT_INDEX_STORAGE_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as { items?: ExperimentIndexItem[]; refreshedAt?: number };
    if (!Array.isArray(parsed.items) || !parsed.items.length) return;

    experimentIndexCache.value = parsed.items;
    experimentIndexCache.refreshedAt = typeof parsed.refreshedAt === 'number' ? parsed.refreshedAt : 0;
    experimentIndexCache.promise = Promise.resolve(parsed.items);
  } catch {
    // ignore invalid cached payloads
  }
}

function persistExperimentIndexCache(items: ExperimentIndexItem[], refreshedAt: number) {
  writeStorageItem(
    EXPERIMENT_INDEX_STORAGE_KEY,
    JSON.stringify({
      items,
      refreshedAt,
    }),
  );
}

async function fetchExperimentIndex() {
  const payload = await requestJson<{ items: ExperimentIndexItem[] }>('/api/v1/experiments', {
    errorMessage: '无法加载实验索引',
    retries: 1,
    timeoutMs: 7000,
  });

  return payload.items;
}

async function fetchExperimentConfig(experimentId: string) {
  return requestJson<ExperimentConfig>(`/api/v1/experiments/${encodeURIComponent(experimentId)}/config`, {
    errorMessage: '无法加载实验配置',
    retries: 1,
    timeoutMs: 7000,
  });
}

export async function loadExperimentIndex(forceRefresh = false): Promise<ExperimentIndexItem[]> {
  hydrateExperimentIndexCache();

  if (!forceRefresh) {
    if (experimentIndexCache.value) {
      return experimentIndexCache.value;
    }

    if (experimentIndexCache.promise) {
      return experimentIndexCache.promise;
    }
  }

  if (forceRefresh && experimentIndexCache.refreshPromise) {
    return experimentIndexCache.refreshPromise;
  }

  const nextPromise = fetchExperimentIndex()
    .then((items) => {
      const refreshedAt = Date.now();
      experimentIndexCache.value = items;
      experimentIndexCache.refreshedAt = refreshedAt;
      experimentIndexCache.promise = Promise.resolve(items);
      experimentIndexCache.refreshPromise = null;
      persistExperimentIndexCache(items, refreshedAt);
      return items;
    })
    .catch((error) => {
      experimentIndexCache.refreshPromise = null;
      if (!experimentIndexCache.value) {
        experimentIndexCache.promise = null;
      }
      throw error;
    });

  experimentIndexCache.promise = nextPromise;
  if (forceRefresh) {
    experimentIndexCache.refreshPromise = nextPromise;
  }
  return nextPromise;
}

export async function loadExperimentConfig(experimentId: string, forceRefresh = false): Promise<ExperimentConfig> {
  if (!forceRefresh) {
    const cachedEntry = experimentConfigPromiseCache.get(experimentId);
    if (cachedEntry) {
      return cachedEntry.value ?? cachedEntry.promise;
    }
  }

  const cacheEntry: ExperimentConfigCacheEntry = {
    promise: Promise.resolve(null as never),
    refreshPromise: null,
    refreshedAt: 0,
    value: null,
  };

  const nextPromise = fetchExperimentConfig(experimentId)
    .then((config) => {
      cacheEntry.value = config;
      cacheEntry.refreshedAt = Date.now();
      cacheEntry.refreshPromise = null;
      return config;
    })
    .catch((error) => {
      experimentConfigPromiseCache.delete(experimentId);
      throw error;
    });

  cacheEntry.promise = nextPromise;
  experimentConfigPromiseCache.set(experimentId, cacheEntry);
  return nextPromise;
}

export async function preloadExperimentConfig(experimentId: string) {
  if (peekExperimentConfig(experimentId) && isExperimentConfigStale(experimentId)) {
    await revalidateExperimentConfig(experimentId);
    return;
  }

  await loadExperimentConfig(experimentId);
}

export function peekExperimentConfig(experimentId: string) {
  return experimentConfigPromiseCache.get(experimentId)?.value ?? null;
}

export function peekExperimentIndex() {
  hydrateExperimentIndexCache();
  return experimentIndexCache.value ?? [];
}

export function isExperimentIndexStale(maxAgeMs = EXPERIMENT_INDEX_STALE_MS) {
  hydrateExperimentIndexCache();
  if (!experimentIndexCache.refreshedAt) return true;
  return Date.now() - experimentIndexCache.refreshedAt > maxAgeMs;
}

export async function revalidateExperimentIndex() {
  hydrateExperimentIndexCache();
  return loadExperimentIndex(true);
}

export function isExperimentConfigStale(experimentId: string, maxAgeMs = EXPERIMENT_CONFIG_STALE_MS) {
  const refreshedAt = experimentConfigPromiseCache.get(experimentId)?.refreshedAt ?? 0;
  if (!refreshedAt) return true;
  return Date.now() - refreshedAt > maxAgeMs;
}

export async function revalidateExperimentConfig(experimentId: string) {
  const cachedEntry = experimentConfigPromiseCache.get(experimentId);
  if (!cachedEntry) {
    return loadExperimentConfig(experimentId, true);
  }

  if (cachedEntry.refreshPromise) {
    return cachedEntry.refreshPromise;
  }

  const refreshPromise = fetchExperimentConfig(experimentId)
    .then((config) => {
      cachedEntry.value = config;
      cachedEntry.promise = Promise.resolve(config);
      cachedEntry.refreshedAt = Date.now();
      cachedEntry.refreshPromise = null;
      return config;
    })
    .catch((error) => {
      cachedEntry.refreshPromise = null;
      if (!cachedEntry.value) {
        experimentConfigPromiseCache.delete(experimentId);
      }
      throw error;
    });

  cachedEntry.refreshPromise = refreshPromise;
  return refreshPromise;
}
