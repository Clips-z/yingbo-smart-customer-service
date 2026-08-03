import { CaptureDeduplicator } from '../../../main/backend/services/capture/captureDeduplicator';
import { PlatformEvent } from '../../../main/backend/services/capture/platformEvent';

const event = (overrides: Partial<PlatformEvent> = {}): PlatformEvent => ({
  eventId: 'event-1',
  messageId: 'message-1',
  identity: { platformId: 'taobao', storeId: 'store-a', accountId: 'agent-a', contactId: 'buyer-1', conversationId: 'chat-1' },
  direction: 'incoming',
  contentType: 'text',
  content: '请问有货吗',
  capturedAt: new Date(1000).toISOString(),
  source: 'ocr',
  confidence: 0.9,
  sourceRevision: 'rev-1',
  ...overrides,
});

describe('CaptureDeduplicator', () => {
  test('deduplicates the same real message observed by two sources', () => {
    const dedup = new CaptureDeduplicator();
    expect(dedup.accept(event(), 1000).accepted).toBe(true);
    expect(dedup.accept(event({ source: 'cdp', eventId: 'event-2' }), 1100)).toMatchObject({ accepted: false, reason: 'duplicate' });
  });

  test('expires observations after the TTL', () => {
    const dedup = new CaptureDeduplicator(100);
    expect(dedup.accept(event(), 1000).accepted).toBe(true);
    expect(dedup.accept(event(), 1101).accepted).toBe(true);
  });
});
