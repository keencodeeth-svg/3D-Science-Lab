const SAFE_RETRY_METHODS = new Set(['GET', 'HEAD']);
const RETRYABLE_RESPONSE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface JsonRequestInit extends RequestInit {
  errorMessage?: string;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function buildJsonHeaders(init?: RequestInit) {
  const headers = new Headers(init?.headers);
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }

  if (typeof init?.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

async function readResponseErrorMessage(response: Response, fallbackMessage: string) {
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';

  if (contentType.includes('application/json')) {
    try {
      const payload = (await response.json()) as { message?: string; error?: string };
      if (typeof payload.message === 'string' && payload.message.trim()) {
        return payload.message.trim();
      }
      if (typeof payload.error === 'string' && payload.error.trim()) {
        return payload.error.trim();
      }
    } catch {
      // ignore invalid json payloads
    }
  }

  try {
    const text = (await response.text()).trim();
    if (text) return text;
  } catch {
    // ignore unreadable bodies
  }

  return fallbackMessage;
}

function getRetryDelay(baseDelayMs: number, attempt: number) {
  return baseDelayMs * (attempt + 1);
}

export async function requestJson<T>(input: string, init: JsonRequestInit = {}): Promise<T> {
  const {
    errorMessage = '请求失败',
    retries = 0,
    retryDelayMs = 450,
    timeoutMs = 8000,
    ...requestInit
  } = init;
  const method = (requestInit.method ?? 'GET').toUpperCase();
  const headers = buildJsonHeaders(requestInit);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const externalSignal = requestInit.signal;
    let didTimeout = false;

    const handleExternalAbort = () => {
      controller.abort();
    };

    if (externalSignal?.aborted) {
      controller.abort();
    } else {
      externalSignal?.addEventListener('abort', handleExternalAbort, { once: true });
    }

    const timeoutId = globalThis.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(input, {
        ...requestInit,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const nextError = new Error(await readResponseErrorMessage(response, `${errorMessage} (${response.status})`));
        const canRetry =
          attempt < retries &&
          SAFE_RETRY_METHODS.has(method) &&
          RETRYABLE_RESPONSE_STATUSES.has(response.status);

        if (canRetry) {
          lastError = nextError;
          await sleep(getRetryDelay(retryDelayMs, attempt));
          continue;
        }

        throw nextError;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return response.json() as Promise<T>;
    } catch (error) {
      const nextError =
        didTimeout
          ? new Error(`${errorMessage} 超时，请检查网络后重试`)
          : error instanceof Error
            ? error
            : new Error(errorMessage);
      const isAbortError = error instanceof Error && error.name === 'AbortError';
      // Retry only safe reads for transient network failures and timeouts.
      const canRetry =
        attempt < retries &&
        SAFE_RETRY_METHODS.has(method) &&
        (didTimeout || error instanceof TypeError || (!externalSignal?.aborted && isAbortError));

      if (canRetry) {
        lastError = nextError;
        await sleep(getRetryDelay(retryDelayMs, attempt));
        continue;
      }

      throw nextError;
    } finally {
      globalThis.clearTimeout(timeoutId);
      externalSignal?.removeEventListener('abort', handleExternalAbort);
    }
  }

  throw lastError ?? new Error(errorMessage);
}
