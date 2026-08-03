import { CaptureShadowComparator } from '../../../main/backend/services/capture/shadowComparator';
import { PlatformEvent } from '../../../main/backend/services/capture/platformEvent';

const event = (source: PlatformEvent['source'], content = '有货吗', capturedAt = new Date(1000).toISOString()): PlatformEvent => ({
  eventId: `${source}-1`,
  messageId: 'message-1',
  identity: { platformId: 'win_qianniu', storeId: 'store-a', accountId: 'agent-a', contactId: 'buyer-1', conversationId: 'chat-1' },
  direction: 'incoming',
  contentType: 'text',
  content,
  capturedAt,
  source,
  confidence: 0.9,
  sourceRevision: 'rev-1',
});

describe('CaptureShadowComparator', () => {
  test('matches structured and OCR observations without retaining raw content in the snapshot', () => {
    const comparator = new CaptureShadowComparator();
    comparator.observe('ocr', event('ocr'), 1200);
    comparator.observe('structured', event('cdp'), 1300);
    expect(comparator.snapshot()).toEqual({ matched: 1, structuredOnly: 0, ocrOnly: 0, conflicts: 0, identityMismatches: 0, p50LatencyMs: 100, p95LatencyMs: 100 });
    expect(JSON.stringify(comparator.snapshot())).not.toContain('有货吗');
  });

  test('reports conflicting content and source-only observations', () => {
    const comparator = new CaptureShadowComparator();
    comparator.observe('ocr', event('ocr', '有货吗'));
    comparator.observe('structured', event('cdp', '需要什么尺寸'));
    comparator.observe('ocr', event('ocr', '另一个问题', new Date(10_000).toISOString()), 10_000);
    expect(comparator.snapshot()).toMatchObject({ matched: 1, conflicts: 1, ocrOnly: 1 });
  });
});
