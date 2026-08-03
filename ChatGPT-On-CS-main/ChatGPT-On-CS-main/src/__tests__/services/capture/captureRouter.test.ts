import { CaptureRouter } from '../../../main/backend/services/capture/captureRouter';
import { PlatformEvent } from '../../../main/backend/services/capture/platformEvent';

const event = (id: string, source: PlatformEvent['source'] = 'ocr'): PlatformEvent => ({
  eventId: id,
  messageId: id,
  identity: { platformId: 'taobao', storeId: 'store-a', accountId: 'agent-a', contactId: 'buyer-1', conversationId: 'chat-1' },
  direction: 'incoming',
  contentType: 'text',
  content: id,
  capturedAt: new Date(1000).toISOString(),
  source,
  confidence: 0.9,
  sourceRevision: `rev-${id}`,
});

describe('CaptureRouter', () => {
  test('shadow observations never reach the primary consumer', () => {
    const delivered: string[] = [];
    const router = new CaptureRouter({ onPrimaryEvent: (item) => delivered.push(item.eventId) });
    router.setPrimary('ocr');
    expect(router.handle(event('shadow'), 'shadow')).toMatchObject({ accepted: true, delivered: false, reason: 'shadow' });
    expect(delivered).toEqual([]);
  });

  test('only the active primary source reaches the business consumer', () => {
    const delivered: string[] = [];
    const router = new CaptureRouter({ onPrimaryEvent: (item) => delivered.push(item.eventId) });
    router.setPrimary('ocr');
    expect(router.handle(event('one'), 'primary').delivered).toBe(true);
    router.recover('structured', 'reconnect');
    expect(router.handle(event('two', 'cdp')).reason).toBe('recovering');
    router.setPrimary('structured');
    expect(router.handle(event('three', 'cdp')).delivered).toBe(true);
    expect(delivered).toEqual(['one', 'three']);
  });
});
