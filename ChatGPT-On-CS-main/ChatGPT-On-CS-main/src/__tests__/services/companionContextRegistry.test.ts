import { CompanionContextRegistry } from '../../main/backend/services/companionContextRegistry';

const observation = (
  platformId: 'win_wechat' | 'win_wecom',
  contactId: string,
) => ({
  platformId,
  storeId: platformId,
  accountId: `${platformId}-default`,
  contactId,
  chatFingerprint: `${platformId}:${contactId}`,
  recentMessages: [
    { direction: 'incoming' as const, content: '请问有现货吗' },
    { direction: 'outgoing' as const, content: '您好，有现货的' },
  ],
  incomingMessageFingerprint: `${contactId}:请问有现货吗`,
  capturedAt: new Date().toISOString(),
  confidence: 0.9,
});

describe('CompanionContextRegistry', () => {
  test('keeps independent stable contexts per platform', () => {
    const registry = new CompanionContextRegistry(1);
    registry.observe(observation('win_wechat', '客户A'));
    registry.observe(observation('win_wecom', '客户B'));
    expect(registry.get('win_wechat')?.contactId).toBe('客户A');
    expect(registry.get('win_wecom')?.contactId).toBe('客户B');
  });

  test('restores recent messages after A to B to A switching', () => {
    const registry = new CompanionContextRegistry(1);
    registry.observe(observation('win_wechat', '客户A'));
    registry.observe(observation('win_wechat', '客户B'));
    const restored = registry.observe({
      ...observation('win_wechat', '客户A'),
      recentMessages: [],
    });
    expect(restored.snapshot.contactId).toBe('客户A');
    expect(restored.snapshot.recentMessages).toHaveLength(2);
    expect(restored.snapshot.recentMessagesReused).toBe(true);
  });

  test('binds generated replies only to the matching live contact', () => {
    const registry = new CompanionContextRegistry(1);
    registry.observe(observation('win_wechat', '客户A'));
    expect(
      registry.bindingFor('win_wechat', '客户A')?.conversationKey,
    ).toHaveLength(64);
    expect(registry.bindingFor('win_wechat', '客户B')).toBeUndefined();
    const binding = registry.bindingFor('win_wechat', '客户A');
    expect(
      registry.matchesLiveConversation({
        platformId: 'win_wechat',
        contactId: '客户A',
        conversationKey: binding?.conversationKey,
        contextRevision: binding?.snapshot.contextRevision,
      }),
    ).toBe(true);
    expect(
      registry.matchesLiveConversation({
        platformId: 'win_wechat',
        contactId: '客户B',
      }),
    ).toBe(false);
  });
});
