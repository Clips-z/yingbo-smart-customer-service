import { normalizePlatformHealthError, PlatformHealthReason } from './platformHealth';

export interface QianniuCollectorHealth {
  state: 'stopped' | 'running' | 'degraded';
  phase: 'idle' | 'warming' | 'scanning' | 'ready' | 'retrying';
  processRunning: boolean;
  lastSuccessAt?: string;
  lastError?: string;
  reasonCode?: PlatformHealthReason;
  recoveryAction?: string;
  nextRetryAt?: string;
  scanStartedAt?: string;
  lastScanDurationMs?: number;
}

export class QianniuHealthTracker {
  private health: QianniuCollectorHealth = {
    state: 'stopped',
    phase: 'idle',
    processRunning: false,
  };

  markScanning(warming: boolean): void {
    this.health = {
      ...this.health,
      state: 'running',
      phase: warming ? 'warming' : 'scanning',
      processRunning: true,
      scanStartedAt: new Date().toISOString(),
      lastError: undefined,
      reasonCode: undefined,
      recoveryAction: undefined,
      nextRetryAt: undefined,
    };
  }

  markRunning(durationMs?: number): void {
    this.health = {
      state: 'running',
      phase: 'ready',
      processRunning: true,
      lastSuccessAt: new Date().toISOString(),
      lastScanDurationMs:
        typeof durationMs === 'number'
          ? Math.max(0, Math.round(durationMs))
          : this.health.lastScanDurationMs,
    };
  }

  markFailure(error: string, nextRetryAt: number): void {
    this.health = {
      ...this.health,
      state: 'degraded',
      phase: 'retrying',
      processRunning: true,
      lastError: error,
      ...normalizePlatformHealthError(error),
      nextRetryAt: new Date(nextRetryAt).toISOString(),
    };
  }

  markStopped(error = '千牛客户端未启动'): void {
    this.health = {
      state: 'stopped',
      phase: 'idle',
      processRunning: false,
      lastError: error,
      ...normalizePlatformHealthError(error),
    };
  }

  getHealth(): QianniuCollectorHealth {
    return { ...this.health };
  }
}
