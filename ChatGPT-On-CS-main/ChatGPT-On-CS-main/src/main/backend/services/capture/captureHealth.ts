export type CaptureRouteState =
  | 'probing'
  | 'structured-shadow'
  | 'structured-active'
  | 'cdp-active'
  | 'uia-active'
  | 'ocr-active'
  | 'recovering';

export interface CaptureHealthSnapshot {
  source: string;
  state: CaptureRouteState;
  lastEventAt?: string;
  lastFailureAt?: string;
  failureCount: number;
  stale: boolean;
  reason?: string;
}

export class CaptureHealth {
  private lastEventAt?: number;
  private lastFailureAt?: number;
  private failureCount = 0;
  private reason?: string;

  constructor(private readonly staleAfterMs = 5_000) {}

  public event(at = Date.now()): void {
    this.lastEventAt = at;
    this.reason = undefined;
  }

  public failure(reason: string, at = Date.now()): void {
    this.lastFailureAt = at;
    this.failureCount += 1;
    this.reason = reason;
  }

  public snapshot(source: string, state: CaptureRouteState, now = Date.now()): CaptureHealthSnapshot {
    return {
      source,
      state,
      lastEventAt: this.lastEventAt === undefined ? undefined : new Date(this.lastEventAt).toISOString(),
      lastFailureAt: this.lastFailureAt === undefined ? undefined : new Date(this.lastFailureAt).toISOString(),
      failureCount: this.failureCount,
      stale: this.lastEventAt === undefined || now - this.lastEventAt > this.staleAfterMs,
      reason: this.reason,
    };
  }
}
