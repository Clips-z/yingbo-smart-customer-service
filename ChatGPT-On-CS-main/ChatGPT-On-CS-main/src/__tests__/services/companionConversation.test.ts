import {
  buildCompanionConversation,
  isReadableConversationText,
} from '../../renderer/companion-window/companionConversation';

describe('buildCompanionConversation', () => {
  test('prefers readable live messages, removes duplicates and keeps five', () => {
    const messages = [
      { direction: 'incoming' as const, content: '第一句' },
      { direction: 'incoming' as const, content: '第一句' },
      { direction: 'outgoing' as const, content: '第二句' },
      { direction: 'incoming' as const, content: '第三句' },
      { direction: 'outgoing' as const, content: '第四句' },
      { direction: 'incoming' as const, content: '第五句' },
      { direction: 'outgoing' as const, content: '第六句' },
    ];
    const result = buildCompanionConversation(messages, [
      { id: 1, question: '错误历史', answer: '不应展示' },
    ]);
    expect(result).toHaveLength(5);
    expect(result.map((item) => item.kind === 'message' && item.content)).toEqual([
      '第二句', '第三句', '第四句', '第五句', '第六句',
    ]);
  });

  test('falls back to distinct readable Q/A pairs for the current customer', () => {
    const result = buildCompanionConversation([], [
      { id: 1, contactId: 'buyer-a', question: '了?', answer: '错误记录' },
      { id: 2, contactId: 'buyer-b', question: '有库存吗', answer: '有库存' },
      { id: 3, contactId: 'buyer-a', question: '有库存吗', answer: '有库存' },
      { id: 4, contactId: 'buyer-a', question: '有库存吗', answer: '有库存' },
    ], 'buyer-a');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ kind: 'pair', question: '有库存吗' });
  });

  test('rejects OCR fragments and object coercion', () => {
    expect(isReadableConversationText('了?')).toBe(false);
    expect(isReadableConversationText('[object Object]')).toBe(false);
    expect(isReadableConversationText('model 和 appid 怎么配置？')).toBe(true);
  });
});
