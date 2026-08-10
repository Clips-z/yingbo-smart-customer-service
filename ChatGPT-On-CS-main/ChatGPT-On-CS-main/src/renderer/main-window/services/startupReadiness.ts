type StartupReadinessIpc = {
  get: (channel: 'get-health-status') => unknown;
  on: (
    channel: 'check-health',
    listener: (health: unknown) => void,
  ) => void | (() => void);
};

const isReady = (health: unknown): health is true => health === true;

export const subscribeToStartupReadiness = (
  ipc: StartupReadinessIpc,
  onReady: () => void,
  onUnavailable: () => void = () => undefined,
): (() => void) => {
  let lastState: boolean | undefined;
  const applyHealth = (health: unknown) => {
    const ready = isReady(health);
    if (ready === lastState) return;
    lastState = ready;
    if (ready) onReady();
    else onUnavailable();
  };

  try {
    applyHealth(ipc.get('get-health-status'));
  } catch (error) {
    console.warn(
      '[App] Sync health check failed, using async listener',
      error,
    );
  }

  const unsubscribe = ipc.on('check-health', (health: unknown) => {
    console.log('[App] Received check-health:', health);
    applyHealth(health);
  });

  return typeof unsubscribe === 'function' ? unsubscribe : () => undefined;
};
