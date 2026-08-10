import {
  companionContactLabel,
  isCompanionCollectorReady,
  selectCompanionHistory,
  selectCompanionProduct,
  selectCompanionSuggestion,
} from '../../renderer/companion-window/companionSelection';
import {
  QianniuCompanionContext,
  ReplySuggestion,
} from '../../renderer/common/services/platform/platform';

describe('companionContactLabel', () => {
  test('keeps QianNiu buyer ids strict', () => {
    expect(companionContactLabel('win_qianniu', 'tb123456')).toBe('tb123456');
    expect(companionContactLabel('win_qianniu', '轮趣科技_黄文丽')).toBe('');
  });

  test('shows real WeChat people and group names instead of platform ids', () => {
    expect(companionContactLabel('win_wechat', '轮趣科技_黄文丽')).toBe('轮趣科技_黄文丽');
    expect(companionContactLabel('win_wechat', '养基宝用户交流群（209）Q')).toBe('养基宝用户交流群（209）Q');
    expect(companionContactLabel('win_wechat', 'win_wechat')).toBe('');
  });
});

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

  test('shows no draft until the current customer identity is stable', () => {
    expect(
      selectCompanionSuggestion(undefined, [
        suggestion({ id: 9, conversation_key: 'another-customer' }),
      ]),
    ).toBeUndefined();
    expect(
      selectCompanionSuggestion(
        { ...context, state: 'switching' },
        [suggestion({ id: 9, conversation_key: 'another-customer' })],
      ),
    ).toBeUndefined();
  });

  test('restores a legacy draft by stable identity after screenshot changes', () => {
    expect(
      selectCompanionSuggestion(context, [
        suggestion({
          conversation_key: 'legacy-conversation',
          store_id: 'store-a',
          account_id: 'jamie',
          contact_id: 'buyer-a',
        }),
      ])?.id,
    ).toBe(1);
  });

  test('never pairs a stale answer with a different live customer question', () => {
    expect(
      selectCompanionSuggestion(
        context,
        [
          suggestion({
            conversation_key: 'conversation-a',
            incoming_content: '昨天',
            reply_content: '昨天有啥问题或者需要咨询的？',
          }),
        ],
        '树莓派5.4g能跑动ros2吗',
      ),
    ).toBeUndefined();
  });

  test('keeps a reply only when it was generated for the live question', () => {
    expect(
      selectCompanionSuggestion(
        context,
        [
          suggestion({
            id: 8,
            conversation_key: 'conversation-a',
            incoming_content: '树莓派 5.4G 能跑动 ROS2 吗？',
          }),
        ],
        '树莓派5.4g能跑动ros2吗',
      )?.id,
    ).toBe(8);
  });

  test('keeps the latest three previous drafts for context', () => {
    const items = [1, 2, 3, 4].map((id) =>
      suggestion({
        id,
        conversation_key: 'conversation-a',
        created_at: `2026-07-16T0${id}:00:00.000Z`,
      }),
    );
    expect(selectCompanionHistory(context, items, 4).map((item) => item.id)).toEqual([
      3, 2, 1,
    ]);
  });
});

describe('isCompanionCollectorReady', () => {
  test('does not flicker to connecting during a normal scan', () => {
    expect(
      isCompanionCollectorReady('win_qianniu', {
        state: 'running',
        phase: 'scanning',
      }),
    ).toBe(true);
  });

  test('keeps a recently healthy collector ready during a short transition', () => {
    const now = Date.parse('2026-08-10T04:00:10.000Z');
    expect(
      isCompanionCollectorReady(
        'win_qianniu',
        {
          state: 'running',
          phase: 'warming',
          lastSuccessAt: '2026-08-10T04:00:00.000Z',
        },
        now,
      ),
    ).toBe(true);
  });

  test('reports a stopped collector as unavailable', () => {
    expect(
      isCompanionCollectorReady('win_qianniu', {
        state: 'stopped',
        phase: 'idle',
      }),
    ).toBe(false);
  });
});

describe('selectCompanionProduct', () => {
  const product = (shopId: string, shopName: string) => ({
    id: `${shopId}-id`, name: '二维电动云台', platformProductId: 'product-a',
    shopId, shopName, onSale: true, qaCount: 6, hue: 170,
  });

  test('prefers the current store when product ids are shared', () => {
    const current = { ...context, productId: 'product-a', storeId: 'store-a' };
    expect(
      selectCompanionProduct(current, [
        product('store-b', '店铺B'), product('store-a', '店铺A'),
      ])?.shopId,
    ).toBe('store-a');
  });

  test('never matches a different product id', () => {
    expect(selectCompanionProduct(context, [product('store-a', '店铺A')])).toBeUndefined();
  });
});
