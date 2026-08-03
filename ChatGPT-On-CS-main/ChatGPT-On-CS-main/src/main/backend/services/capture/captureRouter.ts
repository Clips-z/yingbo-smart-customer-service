import { CaptureDeduplicator } from './captureDeduplicator';
import { CaptureHealth, CaptureRouteState } from './captureHealth';
import { PlatformEvent } from './platformEvent';

export type CaptureSourceName = 'structured' | 'cdp' | 'uia' | 'ocr';
export type CaptureEventRole = 'primary' | 'shadow';

export interface CaptureRouterOptions {
  onPrimaryEvent: (event: PlatformEvent) => void;
  onSourceChanged?: (source: CaptureSourceName, state: CaptureRouteState, reason?: string) => void;
}

export interface RoutedEventResult {
  accepted: boolean;
  delivered: boolean;
  reason?: 'duplicate' | 'shadow' | 'inactive' | 'recovering';
}

const activeStates: Record<CaptureSourceName, CaptureRouteState> = {
  structured: 'structured-active',
  cdp: 'cdp-active',
  uia: 'uia-active',
  ocr: 'ocr-active',
};

export class CaptureRouter {
  private primary?: CaptureSourceName;
  private state: CaptureRouteState = 'probing';
  private readonly deduplicator: CaptureDeduplicator;
  private readonly health: CaptureHealth;

  constructor(private readonly options: CaptureRouterOptions, deduplicator = new CaptureDeduplicator(), health = new CaptureHealth()) {
    this.deduplicator = deduplicator;
    this.health = health;
  }

  public setPrimary(source: CaptureSourceName, reason?: string): void {
    this.primary = source;
    this.state = activeStates[source];
    this.options.onSourceChanged?.(source, this.state, reason);
  }

  public setShadow(source: CaptureSourceName, reason?: string): void {
    this.primary = this.primary || undefined;
    this.state = 'structured-shadow';
    this.options.onSourceChanged?.(source, this.state, reason);
  }

  public recover(source: CaptureSourceName, reason?: string): void {
    this.state = 'recovering';
    this.options.onSourceChanged?.(source, this.state, reason);
  }

  public handle(event: PlatformEvent, role: CaptureEventRole = 'primary'): RoutedEventResult {
    const dedup = this.deduplicator.accept(event);
    if (!dedup.accepted) return { accepted: false, delivered: false, reason: 'duplicate' };
    this.health.event();
    if (role === 'shadow') return { accepted: true, delivered: false, reason: 'shadow' };
    if (!this.primary || this.state === 'probing') return { accepted: true, delivered: false, reason: 'inactive' };
    if (this.state === 'recovering') return { accepted: true, delivered: false, reason: 'recovering' };
    this.options.onPrimaryEvent(event);
    return { accepted: true, delivered: true };
  }

  public failover(source: CaptureSourceName, reason: string): void {
    this.health.failure(reason);
    this.setPrimary(source, reason);
  }

  public healthSnapshot(now = Date.now()) {
    return this.health.snapshot(this.primary || 'none', this.state, now);
  }

  public getState(): { primary?: CaptureSourceName; state: CaptureRouteState } {
    return { primary: this.primary, state: this.state };
  }
}
