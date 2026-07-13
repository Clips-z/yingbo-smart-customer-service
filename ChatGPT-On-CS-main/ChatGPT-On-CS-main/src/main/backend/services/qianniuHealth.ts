import { normalizePlatformHealthError, PlatformHealthReason } from './platformHealth';

export interface QianniuCollectorHealth {
  state: 'stopped' | 'running' | 'degraded';
  processRunning: boolean;
  lastSuccessAt?: string;
  lastError?: string;
  reasonCode?: PlatformHealthReason;
  recoveryAction?: string;
  nextRetryAt?: string;
}

export class QianniuHealthTracker {
  private health: QianniuCollectorHealth = {
    state: 'stopped',
    processRunning: false,
  };

  markRunning(): void {
    this.health = {
      state: 'running',
      processRunning: true,
      lastSuccessAt: new Date().toISOString(),
    };
  }

  markFailure(error: string, nextRetryAt: number): void {
    this.health = {
      ...this.health,
      state: 'degraded',
      processRunning: true,
      lastError: error,
      ...normalizePlatformHealthError(error),
      nextRetryAt: new Date(nextRetryAt).toISOString(),
    };
  }

  markStopped(error = '千牛客户端未启动'): void {
    this.health = {
      state: 'stopped',
      processRunning: false,
      lastError: error,
      ...normalizePlatformHealthError(error),
    };
  }

  getHealth(): QianniuCollectorHealth {
    return { ...this.health };
  }
}
