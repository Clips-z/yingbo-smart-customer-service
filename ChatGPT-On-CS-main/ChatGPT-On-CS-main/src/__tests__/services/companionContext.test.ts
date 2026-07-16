import {
  buildConversationKey,
  buildDraftKey,
  CompanionContextSnapshot,
  ConversationDraftBinding,
  decideDraftRestoration,
} from '../../main/backend/services/companionContext';

function context(
  overrides: Partial<CompanionContextSnapshot> = {},
): CompanionContextSnapshot {
  return {
    platformId: 'win_qianniu',
    storeId: 'store-a',
    accountId: 'jamie',
    contactId: 'buyer-a',
    chatFingerprint: 'chat-a',
    productId: 'product-a',
    incomingMessageFingerprint: 'message-a',
    contextRevision: 7,
    capturedAt: '2026-07-16T10:00:00.000Z',
    confidence: 0.99,
    state: 'stable',
    ...overrides,
  };
}

function draft(
  source = context(),
  overrides: Partial<ConversationDraftBinding> = {},
): ConversationDraftBinding {
  return {
    conversationKey: buildConversationKey(source),
    draftKey: buildDraftKey(source),
    platformId: source.platformId,
    storeId: source.storeId,
    accountId: source.accountId,
    contactId: source.contactId,
    chatFingerprint: source.chatFingerprint,
    productId: source.productId,
    incomingMessageFingerprint: source.incomingMessageFingerprint,
    contextRevision: source.contextRevision,
    state: 'draft',
    ...overrides,
  };
}

describe('companion context keys', () => {
  test('uses store, account and contact to isolate same-name buyers', () => {
    const first = context();
    const otherStore = context({ storeId: 'store-b' });

    expect(buildConversationKey(first)).not.toBe(
      buildConversationKey(otherStore),
    );
  });

  test('keeps one conversation key across new buyer messages', () => {
    const first = context();
    const nextMessage = context({
      incomingMessageFingerprint: 'message-b',
      contextRevision: 8,
    });

    expect(buildConversationKey(first)).toBe(
      buildConversationKey(nextMessage),
    );
    expect(buildDraftKey(first)).not.toBe(buildDraftKey(nextMessage));
  });

  test('keeps one conversation key when the mutable chat screenshot changes', () => {
    expect(buildConversationKey(context())).toBe(
      buildConversationKey(context({ chatFingerprint: 'chat-b' })),
    );
  });

  test('rejects incomplete identities', () => {
    expect(() => buildConversationKey(context({ contactId: '' }))).toThrow(
      'contactId',
    );
  });
});

describe('draft restoration', () => {
  test('restores edited draft after rapid A to B to A switching', () => {
    const buyerA = context();
    const saved = draft(buyerA);

    expect(
      decideDraftRestoration(saved, context({ contactId: 'buyer-b' })),
    ).toEqual({ action: 'hide', reason: 'different-conversation' });
    expect(decideDraftRestoration(saved, buyerA)).toEqual({
      action: 'restore-editable',
      reason: 'unchanged',
    });
  });

  test('keeps old draft as history when buyer sends a new message', () => {
    const buyerA = context();
    const saved = draft(buyerA);

    expect(
      decideDraftRestoration(
        saved,
        context({
          incomingMessageFingerprint: 'message-b',
          contextRevision: 8,
        }),
      ),
    ).toEqual({ action: 'archive-and-regenerate', reason: 'new-message' });
  });

  test('requires regeneration after product change', () => {
    const buyerA = context();
    expect(
      decideDraftRestoration(
        draft(buyerA),
        context({ productId: 'product-b', contextRevision: 8 }),
      ),
    ).toEqual({ action: 'archive-and-regenerate', reason: 'product-changed' });
  });

  test('shows a sent draft as history instead of an editable reply', () => {
    const buyerA = context();
    expect(
      decideDraftRestoration(draft(buyerA, { state: 'sent' }), buyerA),
    ).toEqual({ action: 'restore-history', reason: 'already-sent' });
  });

  test('preserves failed edits for retry', () => {
    const buyerA = context();
    expect(
      decideDraftRestoration(draft(buyerA, { state: 'failed' }), buyerA),
    ).toEqual({ action: 'restore-editable', reason: 'previous-failure' });
  });

  test('does not expose any draft while the live context is switching', () => {
    const buyerA = context();
    expect(
      decideDraftRestoration(draft(buyerA), context({ state: 'switching' })),
    ).toEqual({ action: 'hold', reason: 'context-not-stable' });
  });
});
