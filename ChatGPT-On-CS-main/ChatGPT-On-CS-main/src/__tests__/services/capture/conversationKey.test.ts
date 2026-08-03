import { conversationKey, sameConversation } from '../../../main/backend/services/capture/conversationKey';

const base = {
  platformId: 'taobao',
  storeId: 'store-a',
  accountId: 'agent-a',
  contactId: 'buyer-1',
  conversationId: 'conversation-1',
};

describe('conversationKey', () => {
  test('isolates platform, store, account, contact and conversation', () => {
    expect(conversationKey(base)).not.toBe(conversationKey({ ...base, storeId: 'store-b' }));
    expect(conversationKey(base)).not.toBe(conversationKey({ ...base, contactId: 'buyer-2' }));
    expect(sameConversation(base, { ...base })).toBe(true);
  });

  test('rejects incomplete identity', () => {
    expect(() => conversationKey({ ...base, contactId: '' })).toThrow('incomplete identity');
  });
});
