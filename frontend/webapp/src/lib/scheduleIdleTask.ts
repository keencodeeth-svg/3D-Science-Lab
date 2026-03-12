type IdleSchedulerWindow = Window & {
  cancelIdleCallback?: (handle: number) => void;
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
};

export function scheduleIdleTask(task: () => void, timeout = 900) {
  if (typeof window === 'undefined') {
    task();
    return () => undefined;
  }

  const idleWindow = window as IdleSchedulerWindow;

  if (typeof idleWindow.requestIdleCallback === 'function' && typeof idleWindow.cancelIdleCallback === 'function') {
    const handle = idleWindow.requestIdleCallback(task, { timeout });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(task, Math.min(timeout, 220));
  return () => window.clearTimeout(handle);
}
