import { QianniuOcrAdapter } from '../../../main/backend/services/adapters/qianniu/qianniuOcrAdapter';
import { QianniuCaptureSnapshot } from '../../../main/backend/services/qianniuCaptureWorker';

const snapshot = (content = '请问有货吗'): QianniuCaptureSnapshot => ({
  hwnd: 1,
  width: 100,
  height: 100,
  image: '',
  chat_fingerprint: 'chat-1',
  qianniu_foreground: true,
  click_performed: false,
  tab_alert_x: [],
  conversation_alerts: [],
  candidate: {
    sender: 'buyer-1',
    content,
    confidence: 0.95,
    direction: 'incoming',
    latest_direction: 'incoming',
    bubble_blue_bias: 0,
    lowest_outgoing_y: 0,
    x: 0,
    y: 0,
  },
  ocr_engine: 'windows',
  lines: [],
});

describe('QianniuOcrAdapter', () => {
  test('maps a resident OCR snapshot to a normalized event without starting a worker', async () => {
    const adapter = new QianniuOcrAdapter();
    const event = adapter.toEvent(snapshot(), { storeId: 'store-a', accountId: 'agent-a', storeName: '轮趣科技' });
    expect(event).toMatchObject({
      identity: {
        platformId: 'win_qianniu',
        storeId: 'store-a',
        accountId: 'agent-a',
        contactId: 'buyer-1',
        conversationId: 'chat-1',
      },
      direction: 'incoming',
      contentType: 'text',
      content: '请问有货吗',
      source: 'ocr',
    });
    expect((await adapter.probe()).canFillDraft).toBe(false);
  });

  test('classifies customer links and refuses incomplete snapshots', () => {
    const adapter = new QianniuOcrAdapter();
    expect(adapter.toEvent(snapshot('https://item.taobao.com/item.htm?id=1'), { storeId: 'store-a', accountId: 'agent-a' })?.contentType).toBe('link');
    expect(adapter.toEvent(snapshot(''), { storeId: 'store-a', accountId: 'agent-a' })).toBeUndefined();
  });
});
