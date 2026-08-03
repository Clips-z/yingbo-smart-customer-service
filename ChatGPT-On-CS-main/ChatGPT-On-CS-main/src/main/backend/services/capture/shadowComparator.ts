import { createHash } from 'crypto';
import { conversationKey } from './conversationKey';
import { PlatformEvent } from './platformEvent';

export type ShadowSource = 'structured' | 'ocr';

export interface ShadowComparisonSnapshot {
  matched: number;
  structuredOnly: number;
  ocrOnly: number;
  conflicts: number;
  identityMismatches: number;
  p50LatencyMs?: number;
  p95LatencyMs?: number;
}

type Observation = { source: ShadowSource; event: PlatformEvent; at: number };

/** Compares shadow sources using hashes; raw customer content is not retained. */
export class CaptureShadowComparator {
  private readonly observations = new Map<string, Observation[]>();

  public observe(source: ShadowSource, event: PlatformEvent, at = Date.now()): void {
    const key = this.matchKey(event);
    const list = this.observations.get(key) || [];
    list.push({ source, event, at });
    this.observations.set(key, list.slice(-4));
  }

  public snapshot(): ShadowComparisonSnapshot {
    let matched = 0;
    let structuredOnly = 0;
    let ocrOnly = 0;
    let conflicts = 0;
    let identityMismatches = 0;
    const latencies: number[] = [];
    for (const observations of this.observations.values()) {
      const structured = observations.filter((item) => item.source === 'structured');
      const ocr = observations.filter((item) => item.source === 'ocr');
      if (!structured.length) {
        ocrOnly += 1;
        continue;
      }
      if (!ocr.length) {
        structuredOnly += 1;
        continue;
      }
      matched += 1;
      const firstStructured = structured[0];
      const firstOcr = ocr[0];
      latencies.push(Math.abs(firstStructured.at - firstOcr.at));
      if (conversationKey(firstStructured.event.identity) !== conversationKey(firstOcr.event.identity)) identityMismatches += 1;
      if (this.contentHash(firstStructured.event) !== this.contentHash(firstOcr.event)) conflicts += 1;
    }
    const sorted = latencies.sort((a, b) => a - b);
    return {
      matched,
      structuredOnly,
      ocrOnly,
      conflicts,
      identityMismatches,
      ...(sorted.length ? { p50LatencyMs: percentile(sorted, 0.5), p95LatencyMs: percentile(sorted, 0.95) } : {}),
    };
  }

  public reset(): void {
    this.observations.clear();
  }

  private matchKey(event: PlatformEvent): string {
    const bucket = Math.floor(Date.parse(event.capturedAt) / 2_000);
    return `${conversationKey(event.identity)}:${event.messageId || event.contentType}:${bucket}`;
  }

  private contentHash(event: PlatformEvent): string {
    return createHash('sha256').update(`${event.direction}|${event.contentType}|${event.content.trim()}`).digest('hex');
  }
}

function percentile(values: number[], ratio: number): number {
  return Math.round(values[Math.min(values.length - 1, Math.ceil(values.length * ratio) - 1)]);
}
