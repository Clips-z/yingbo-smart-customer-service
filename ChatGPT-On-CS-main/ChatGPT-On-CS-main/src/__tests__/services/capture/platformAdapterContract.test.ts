import { PlatformAdapter } from '../../../main/backend/services/capture/platformAdapter';
import { normalizePlatformEvent } from '../../../main/backend/services/capture/platformEvent';

const identity = {
  platformId: 'taobao',
  storeId: 'store-a',
  accountId: 'agent-a',
  contactId: 'buyer-1',
  conversationId: 'conversation-1',
};

function fakeAdapter(): PlatformAdapter {
  let stopped = false;
  return {
    id: 'fake',
    async probe() {
      return {
        readable: true,
        canObserveConversationSwitch: true,
        canObserveMessages: true,
        canReadProducts: true,
        canFocusConversation: false,
        canFillDraft: false,
        canSendDraft: false,
        source: 'fake',
      };
    },
    async start(onEvent) {
      onEvent(normalizePlatformEvent({
        eventId: 'event-1',
        identity,
        direction: 'incoming',
        contentType: 'text',
        content: '  需要什么尺寸  ',
        capturedAt: new Date().toISOString(),
        source: 'ocr',
        confidence: 0.8,
        sourceRevision: 'fake-1',
      }));
    },
    async stop() {
      stopped = true;
    },
    async getCurrentConversation() {
      return stopped ? undefined : identity;
    },
    async focusConversation() {
      return { ok: false, reason: 'unsupported', elapsedMs: 0 };
    },
    async fillDraft() {
      return { ok: false, reason: 'unsupported', elapsedMs: 0 };
    },
    async sendDraft() {
      return { ok: false, reason: 'unsupported', elapsedMs: 0 };
    },
  };
}

describe('PlatformAdapter contract', () => {
  test('start and stop are repeatable and read operations do not imply delivery', async () => {
    const adapter = fakeAdapter();
    const events: string[] = [];
    await adapter.start((event) => events.push(event.content));
    await adapter.stop();
    await adapter.stop();
    expect(events).toEqual(['需要什么尺寸']);
    expect((await adapter.fillDraft('回答')).ok).toBe(false);
    expect((await adapter.sendDraft()).ok).toBe(false);
  });
});
