import { buildSidecarSuggestion } from '../../main/backend/services/sidecarSuggestion';

describe('buildSidecarSuggestion', () => {
  test('writes fields used by the current pending reply model', () => {
    const suggestion = buildSidecarSuggestion({
      platformId: 'win_pdd',
      platformName: '拼多多',
      storeId: 'shop-1',
      storeName: '轮趣旗舰店',
      instanceId: 'operator-1',
      sender: 'buyer-1',
      content: '什么时候发货？',
      replyText: '今天发货。',
    });

    expect(suggestion).toMatchObject({
      platform_id: 'win_pdd',
      store: '轮趣旗舰店',
      store_id: 'shop-1',
      account_id: 'operator-1',
      sender: 'buyer-1',
      contact_id: 'buyer-1',
      incoming_content: '什么时候发货？',
      reply_content: '今天发货。',
      status: 'pending',
    });
    expect(suggestion).not.toHaveProperty('platform_name');
    expect(suggestion).not.toHaveProperty('buyer_message');
  });

  test('extracts text from sidecar object payloads instead of storing object text', () => {
    const suggestion = buildSidecarSuggestion({
      platformId: 'win_jinmai',
      platformName: '京麦',
      sender: { text: 'jd-buyer' },
      content: { content: '有库存吗？' },
      replyText: { message: '有库存。' },
    });

    expect(suggestion.sender).toBe('jd-buyer');
    expect(suggestion.incoming_content).toBe('有库存吗？');
    expect(suggestion.reply_content).toBe('有库存。');
  });

  test('rejects incomplete records instead of creating fake pending customers', () => {
    expect(() =>
      buildSidecarSuggestion({
        platformName: '抖音电商',
        sender: '',
        content: '问题',
        replyText: '回答',
      }),
    ).toThrow('缺少客户 ID');
  });
});
