import { CompanionContextSnapshot, ConversationDraftBinding } from '../../main/backend/services/companionContext';
import { assertDeliveryContext } from '../../main/backend/services/deliveryContextGuard';

const live: CompanionContextSnapshot = {
  platformId: 'win_qianniu', storeId: 'store-a', accountId: 'jamie', contactId: 'buyer-a',
  chatFingerprint: 'chat-a', productId: 'product-a', incomingMessageFingerprint: 'message-a',
  contextRevision: 3, capturedAt: '2026-07-16T10:00:00.000Z', confidence: 0.98, state: 'stable',
};
const draft: ConversationDraftBinding = {
  conversationKey: 'conversation-a', draftKey: 'draft-a', platformId: live.platformId,
  storeId: live.storeId, accountId: live.accountId, contactId: live.contactId,
  chatFingerprint: live.chatFingerprint, productId: live.productId,
  incomingMessageFingerprint: live.incomingMessageFingerprint,
  contextRevision: live.contextRevision, state: 'draft',
};

describe('assertDeliveryContext', () => {
  test('allows an exact stable context', () => {
    expect(() => assertDeliveryContext({ draft, live })).not.toThrow();
  });
  test.each([
    ['店铺', { storeId: 'store-b' }], ['客户', { contactId: 'buyer-b' }],
    ['聊天窗口', { chatFingerprint: 'chat-b' }], ['咨询商品', { productId: 'product-b' }],
    ['客户最新问题', { incomingMessageFingerprint: 'message-b' }], ['会话版本', { contextRevision: 4 }],
  ])('blocks when %s changed', (label, change) => {
    expect(() => assertDeliveryContext({ draft, live: { ...live, ...change } })).toThrow(String(label));
  });
  test('blocks while switching and after the draft was sent', () => {
    expect(() => assertDeliveryContext({ draft, live: { ...live, state: 'switching' } })).toThrow('尚未稳定');
    expect(() => assertDeliveryContext({ draft: { ...draft, state: 'sent' }, live })).toThrow('不能再次填入');
  });
});
