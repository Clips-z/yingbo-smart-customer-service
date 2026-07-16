import { selectCompanionSuggestion } from '../../renderer/companion-window/companionSelection';
import {
  QianniuCompanionContext,
  ReplySuggestion,
} from '../../renderer/common/services/platform/platform';

const context: QianniuCompanionContext = {
  platformId: 'win_qianniu',
  storeId: 'store-a',
  accountId: 'jamie',
  contactId: 'buyer-a',
  chatFingerprint: 'chat-a',
  incomingMessageFingerprint: 'message-2',
  contextRevision: 2,
  capturedAt: '2026-07-16T10:00:00.000Z',
  confidence: 0.98,
  state: 'stable',
  conversationKey: 'conversation-a',
  draftKey: 'draft-2',
};

function suggestion(overrides: Partial<ReplySuggestion>): ReplySuggestion {
  return {
    id: 1,
    platform_id: 'win_qianniu',
    store: 'store-a',
    sender: 'buyer-a',
    incoming_content: '问题',
    reply_content: '回复',
    status: 'pending',
    created_at: '2026-07-16T10:00:00.000Z',
    updated_at: '2026-07-16T10:00:00.000Z',
    ...overrides,
  };
}

describe('selectCompanionSuggestion', () => {
  test('selects the exact message draft first', () => {
    const old = suggestion({ id: 1, draft_key: 'draft-1' });
    const current = suggestion({ id: 2, draft_key: 'draft-2' });
    expect(selectCompanionSuggestion(context, [old, current])?.id).toBe(2);
  });

  test('falls back to the latest draft in the same conversation', () => {
    const currentContext = { ...context, draftKey: undefined };
    const old = suggestion({
      id: 1,
      conversation_key: 'conversation-a',
      created_at: '2026-07-16T09:00:00.000Z',
    });
    const latest = suggestion({
      id: 2,
      conversation_key: 'conversation-a',
      created_at: '2026-07-16T10:00:00.000Z',
    });
    expect(selectCompanionSuggestion(currentContext, [old, latest])?.id).toBe(2);
  });

  test('never selects another customer draft', () => {
    expect(
      selectCompanionSuggestion(context, [
        suggestion({ conversation_key: 'conversation-b' }),
      ]),
    ).toBeUndefined();
  });
});

