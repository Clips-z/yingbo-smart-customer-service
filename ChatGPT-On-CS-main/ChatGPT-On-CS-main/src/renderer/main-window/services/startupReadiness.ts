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
): (() => void) => {
  try {
    if (isReady(ipc.get('get-health-status'))) {
      onReady();
      return () => undefined;
    }
  } catch (error) {
    console.warn(
      '[App] Sync health check failed, using async listener',
      error,
    );
  }

  const unsubscribe = ipc.on('check-health', (health: unknown) => {
    console.log('[App] Received check-health:', health);
    if (isReady(health)) {
      onReady();
    }
  });

  return typeof unsubscribe === 'function' ? unsubscribe : () => undefined;
};

