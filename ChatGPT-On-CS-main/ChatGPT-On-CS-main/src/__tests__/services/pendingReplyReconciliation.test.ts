import { ReplySuggestion } from '../../main/backend/entities/replySuggestion';
import {
  closeSupersededPendingReplies,
  collapseDuplicatePendingReplies,
  resolvePendingReplies,
  shouldResolvePendingReplies,
} from '../../main/backend/services/pendingReplyReconciliation';
import { CompanionContextSnapshot } from '../../main/backend/services/companionContext';

jest.mock('../../main/backend/entities/replySuggestion', () => ({
  ReplySuggestion: { update: jest.fn(), findAll: jest.fn() },
}));

const context: CompanionContextSnapshot = {
  platformId: 'win_qianniu',
  storeId: 'wheeltec旗舰店',
  accountId: 'jamie',
  contactId: 'tb123456',
  chatFingerprint: 'chat-1',
  contextRevision: 3,
  capturedAt: new Date().toISOString(),
  confidence: 0.96,
  state: 'stable',
  recentMessages: [
    { direction: 'incoming', content: '什么时候发货' },
    { direction: 'outgoing', content: '今天发出' },
  ],
};

describe('pending reply reconciliation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('only accepts fresh outgoing evidence from an exact stable conversation', () => {
    expect(shouldResolvePendingReplies({ context })).toBe(true);
    expect(
      shouldResolvePendingReplies({
        context: { ...context, recentMessagesReused: true },
      }),
    ).toBe(false);
    expect(
      shouldResolvePendingReplies({
        context: { ...context, contactId: '' },
      }),
    ).toBe(false);
    expect(
      shouldResolvePendingReplies({
        context: {
          ...context,
          recentMessages: [{ direction: 'incoming', content: '还在吗' }],
        },
      }),
    ).toBe(false);
  });

  it('moves exact pending records to sent after a manual platform reply', async () => {
    (ReplySuggestion.update as jest.Mock).mockResolvedValue([2]);
    await expect(
      resolvePendingReplies({ context, outgoingContent: '今天发出' }),
    ).resolves.toBe(2);
    expect(ReplySuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sent',
        final_reply_content: '今天发出',
      }),
      expect.objectContaining({
        where: expect.objectContaining({
          platform_id: 'win_qianniu',
          store_id: 'wheeltec旗舰店',
          account_id: 'jamie',
          contact_id: 'tb123456',
        }),
      }),
    );
  });

  it('closes older pending rows when the same conversation gets a new question', async () => {
    (ReplySuggestion.update as jest.Mock).mockResolvedValue([1]);
    await expect(
      closeSupersededPendingReplies({ context, keepMessageKey: 'new-key' }),
    ).resolves.toBe(1);
    expect(ReplySuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
      expect.objectContaining({
        where: expect.objectContaining({ contact_id: 'tb123456' }),
      }),
    );
  });

  it('repairs historical duplicates while preserving the newest exact row', async () => {
    (ReplySuggestion.findAll as jest.Mock).mockResolvedValue([
      {
        id: 9,
        platform_id: 'win_qianniu',
        store_id: 'passionpaul',
        account_id: 'jamie',
        contact_id: 'tb123',
      },
      {
        id: 8,
        platform_id: 'win_qianniu',
        store_id: 'passionpaul',
        account_id: 'jamie',
        contact_id: 'tb123',
      },
      {
        id: 7,
        platform_id: 'win_qianniu',
        store_id: 'passionpaul',
        account_id: 'jamie',
        contact_id: 'tb456',
      },
    ]);
    (ReplySuggestion.update as jest.Mock).mockResolvedValue([1]);
    await expect(collapseDuplicatePendingReplies(true)).resolves.toBe(1);
    expect(ReplySuggestion.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
      expect.objectContaining({ where: expect.any(Object) }),
    );
  });
});
