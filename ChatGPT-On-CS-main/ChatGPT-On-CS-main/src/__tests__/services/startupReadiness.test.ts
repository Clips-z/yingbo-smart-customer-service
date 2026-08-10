import { subscribeToStartupReadiness } from '../../renderer/main-window/services/startupReadiness';

describe('startup readiness', () => {
  test('becomes ready when the one-argument health event reports true', () => {
    let healthListener: ((health: unknown) => void) | undefined;
    const unsubscribe = jest.fn();
    const onReady = jest.fn();
    const ipc = {
      get: jest.fn(() => false),
      on: jest.fn((_channel: string, listener: (health: unknown) => void) => {
        healthListener = listener;
        return unsubscribe;
      }),
    };

    const cleanup = subscribeToStartupReadiness(ipc, onReady);

    expect(onReady).not.toHaveBeenCalled();
    expect(healthListener).toBeDefined();
    healthListener?.(true);
    expect(onReady).toHaveBeenCalledTimes(1);

    cleanup();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test('uses the synchronous ready state and keeps monitoring later failures', () => {
    let healthListener: ((health: unknown) => void) | undefined;
    const onReady = jest.fn();
    const onUnavailable = jest.fn();
    const ipc = {
      get: jest.fn(() => true),
      on: jest.fn((_channel: string, listener: (health: unknown) => void) => {
        healthListener = listener;
        return jest.fn();
      }),
    };

    const cleanup = subscribeToStartupReadiness(
      ipc,
      onReady,
      onUnavailable,
    );

    expect(onReady).toHaveBeenCalledTimes(1);
    expect(ipc.on).toHaveBeenCalledTimes(1);
    healthListener?.(false);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    healthListener?.(true);
    expect(onReady).toHaveBeenCalledTimes(2);
    expect(cleanup).toEqual(expect.any(Function));
  });

  test.each([false, undefined, null, 'true', 1])(
    'does not accept non-boolean-ready value %p',
    (health) => {
      let healthListener: ((value: unknown) => void) | undefined;
      const onReady = jest.fn();
      const ipc = {
        get: jest.fn(() => false),
        on: jest.fn((_channel: string, listener: (value: unknown) => void) => {
          healthListener = listener;
          return jest.fn();
        }),
      };

      subscribeToStartupReadiness(ipc, onReady);
      healthListener?.(health);

      expect(onReady).not.toHaveBeenCalled();
    },
  );
});
