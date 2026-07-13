import { QianniuHealthTracker } from '../../main/backend/services/qianniuHealth';

describe('QianniuHealthTracker', () => {
  it('starts stopped and reports a successful scan as running', () => {
    const tracker = new QianniuHealthTracker();
    expect(tracker.getHealth()).toMatchObject({ state: 'stopped', processRunning: false });
    tracker.markRunning();
    expect(tracker.getHealth()).toMatchObject({
      state: 'running',
      processRunning: true,
      lastSuccessAt: expect.any(String),
    });
  });

  it('reports a recoverable failure and retry time', () => {
    const tracker = new QianniuHealthTracker();
    tracker.markFailure('会话窗口未找到', Date.now() + 30_000);
    expect(tracker.getHealth()).toMatchObject({
      state: 'degraded',
      reasonCode: 'window_not_found',
      recoveryAction: expect.any(String),
      nextRetryAt: expect.any(String),
    });
  });

  it('reports the client as stopped instead of healthy', () => {
    const tracker = new QianniuHealthTracker();
    tracker.markRunning();
    tracker.markStopped();
    expect(tracker.getHealth()).toMatchObject({
      state: 'stopped',
      processRunning: false,
      reasonCode: 'client_not_running',
    });
  });
});
