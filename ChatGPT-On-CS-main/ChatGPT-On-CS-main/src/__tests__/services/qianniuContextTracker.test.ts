import {
  QianniuContextObservation,
  QianniuContextTracker,
} from '../../main/backend/services/qianniuContextTracker';

function observation(
  overrides: Partial<QianniuContextObservation> = {},
): QianniuContextObservation {
  return {
    platformId: 'win_qianniu',
    storeId: 'store-a',
    accountId: 'jamie',
    contactId: 'buyer-a',
    chatFingerprint: 'chat-a',
    productId: 'product-a',
    incomingMessageFingerprint: 'message-a',
    capturedAt: '2026-07-16T10:00:00.000Z',
    confidence: 0.98,
    ...overrides,
  };
}

describe('QianniuContextTracker', () => {
  test('publishes only after repeated compatible samples', () => {
    const tracker = new QianniuContextTracker(2);
    expect(tracker.observe(observation()).snapshot.state).toBe('switching');
    const stable = tracker.observe(
      observation({ capturedAt: '2026-07-16T10:00:01.000Z' }),
    );
    expect(stable.changed).toBe(true);
    expect(stable.snapshot.state).toBe('stable');
    expect(stable.snapshot.contextRevision).toBe(1);
  });

  test('handles rapid A to B to A without publishing B from one sample', () => {
    const tracker = new QianniuContextTracker(2);
    tracker.observe(observation());
    tracker.observe(observation({ capturedAt: '2026-07-16T10:00:01.000Z' }));

    expect(
      tracker.observe(
        observation({
          contactId: 'buyer-b',
          chatFingerprint: 'chat-b',
          capturedAt: '2026-07-16T10:00:02.000Z',
        }),
      ).snapshot.state,
    ).toBe('switching');

    expect(
      tracker.observe(
        observation({ capturedAt: '2026-07-16T10:00:03.000Z' }),
      ).snapshot.state,
    ).toBe('switching');
    const restored = tracker.observe(
      observation({ capturedAt: '2026-07-16T10:00:04.000Z' }),
    );
    expect(restored.snapshot.contactId).toBe('buyer-a');
    expect(restored.snapshot.contextRevision).toBe(1);
  });

  test('increments revision for a new buyer message in the same chat', () => {
    const tracker = new QianniuContextTracker(1);
    const first = tracker.observe(observation()).snapshot;
    const next = tracker.observe(
      observation({
        incomingMessageFingerprint: 'message-b',
        capturedAt: '2026-07-16T10:00:01.000Z',
      }),
    ).snapshot;
    expect(next.contextRevision).toBe(first.contextRevision + 1);
    expect(tracker.keys(next)?.conversationKey).toBe(
      tracker.keys(first)?.conversationKey,
    );
    expect(tracker.keys(next)?.draftKey).not.toBe(tracker.keys(first)?.draftKey);
  });

  test('ignores a late observation from an older capture', () => {
    const tracker = new QianniuContextTracker(1);
    tracker.observe(observation({ capturedAt: '2026-07-16T10:00:05.000Z' }));
    const late = tracker.observe(
      observation({
        contactId: 'buyer-b',
        capturedAt: '2026-07-16T10:00:04.000Z',
      }),
    );
    expect(late.snapshot.contactId).toBe('buyer-a');
    expect(late.changed).toBe(false);
  });
});

