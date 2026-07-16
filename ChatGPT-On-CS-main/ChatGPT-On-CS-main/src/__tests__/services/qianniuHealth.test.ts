import { QianniuHealthTracker } from '../../main/backend/services/qianniuHealth';

describe('QianniuHealthTracker', () => {
  it('starts stopped and reports a successful scan as running', () => {
    const tracker = new QianniuHealthTracker();
    expect(tracker.getHealth()).toMatchObject({ state: 'stopped', phase: 'idle', processRunning: false });
    tracker.markScanning(true);
    expect(tracker.getHealth()).toMatchObject({
      state: 'running',
      phase: 'warming',
      scanStartedAt: expect.any(String),
    });
    tracker.markRunning(1234);
    expect(tracker.getHealth()).toMatchObject({
      state: 'running',
      phase: 'ready',
      processRunning: true,
      lastSuccessAt: expect.any(String),
      lastScanDurationMs: 1234,
    });
  });

  it('reports a recoverable failure and retry time', () => {
    const tracker = new QianniuHealthTracker();
    tracker.markFailure('会话窗口未找到', Date.now() + 30_000);
    expect(tracker.getHealth()).toMatchObject({
      state: 'degraded',
      phase: 'retrying',
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
      phase: 'idle',
      processRunning: false,
      reasonCode: 'client_not_running',
    });
  });
});
