import { createHash } from 'crypto';
import { PlatformEvent } from './platformEvent';

export interface DeduplicationResult {
  accepted: boolean;
  key: string;
  reason?: 'duplicate';
}

/** Deduplicates structured and OCR observations without retaining message text. */
export class CaptureDeduplicator {
  private readonly seen = new Map<string, number>();

  constructor(private readonly ttlMs = 15_000, private readonly bucketMs = 2_000) {}

  public accept(event: PlatformEvent, now = Date.now()): DeduplicationResult {
    this.prune(now);
    const key = this.keyFor(event);
    if (this.seen.has(key)) return { accepted: false, key, reason: 'duplicate' };
    this.seen.set(key, now);
    return { accepted: true, key };
  }

  public clear(): void {
    this.seen.clear();
  }

  private keyFor(event: PlatformEvent): string {
    const identity = [
      event.identity.platformId,
      event.identity.storeId,
      event.identity.accountId,
      event.identity.contactId,
      event.identity.conversationId,
    ].join('|');
    const messagePart = event.messageId?.trim() || [
      event.direction,
      event.contentType,
      event.content,
      Math.floor(Date.parse(event.capturedAt) / this.bucketMs),
    ].join('|');
    return createHash('sha256').update(`${identity}|${messagePart}`).digest('hex');
  }

  private prune(now: number): void {
    for (const [key, seenAt] of this.seen) {
      if (now - seenAt >= this.ttlMs) this.seen.delete(key);
    }
  }
}
