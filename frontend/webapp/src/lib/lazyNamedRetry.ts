import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

interface ImportRetryOptions {
  attempts?: number;
  retryDelayMs?: number;
}

interface LazyNamedOptions extends ImportRetryOptions {
  preload?: () => Promise<unknown>;
}

function wait(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function importWithRetry<T>(
  loader: () => Promise<T>,
  { attempts = 2, retryDelayMs = 350 }: ImportRetryOptions = {},
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await loader();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await wait(retryDelayMs * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('异步组件加载失败');
}

export function createModulePreloader<T>(
  loader: () => Promise<T>,
  options?: ImportRetryOptions,
) {
  let promise: Promise<T> | null = null;

  return () => {
    if (!promise) {
      promise = importWithRetry(loader, options).catch((error) => {
        promise = null;
        throw error;
      });
    }

    return promise;
  };
}

export function lazyNamed<Props = any, Module extends Record<string, unknown> = Record<string, unknown>>(
  loader: () => Promise<Module>,
  exportName: keyof Module & string,
  { preload, attempts, retryDelayMs }: LazyNamedOptions = {},
): LazyExoticComponent<ComponentType<Props>> {
  return lazy(async () => {
    const [module] = await Promise.all([
      importWithRetry(loader, { attempts, retryDelayMs }),
      preload ? preload() : Promise.resolve(),
    ]);
    const component = module[exportName] as ComponentType<Props> | undefined;

    if (!component) {
      throw new Error(`异步组件缺少导出: ${exportName}`);
    }

    return { default: component };
  });
}
