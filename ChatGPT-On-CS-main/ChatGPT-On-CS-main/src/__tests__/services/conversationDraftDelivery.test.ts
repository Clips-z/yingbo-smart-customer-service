import { prepareDraftDelivery } from '../../main/backend/services/conversationDraftDelivery';

const live = {
  platformId: 'win_qianniu',
  storeId: 'store-a',
  accountId: 'agent-a',
  contactId: 'buyer-1',
  chatFingerprint: 'chat-1',
  contextRevision: 2,
  state: 'stable' as const,
  capturedAt: new Date().toISOString(),
  confidence: 0.95,
};

const draft = {
  conversationKey: 'key',
  draftKey: 'draft',
  platformId: 'win_qianniu',
  storeId: 'store-a',
  accountId: 'agent-a',
  contactId: 'buyer-1',
  chatFingerprint: 'chat-1',
  contextRevision: 2,
  state: 'draft' as const,
};

describe('prepareDraftDelivery', () => {
  test('returns bounded content only after context verification', () => {
    expect(prepareDraftDelivery({ content: `  ${'a'.repeat(400)}  `, draft, live, action: 'fill' })).toHaveLength(300);
  });

  test('rejects empty or switched conversations', () => {
    expect(() => prepareDraftDelivery({ content: ' ', draft, live, action: 'fill' })).toThrow('不能为空');
    expect(() => prepareDraftDelivery({ content: '回答', draft, live: { ...live, contactId: 'buyer-2' }, action: 'send' })).toThrow('客户');
  });
});
