import {
  createClipboardQuestionKey,
  isLikelyQianniuClipboardQuestion,
  normalizeQianniuClipboardQuestion,
} from '../../main/backend/services/qianniuClipboardQuestion';

describe('normalizeQianniuClipboardQuestion', () => {
  it('normalizes copied text without changing its wording', () => {
    expect(normalizeQianniuClipboardQuestion('  tomorrow\r\n\r\n\r\n  ok?  ')).toBe(
      'tomorrow\n\nok?',
    );
  });

  it('only accepts plausible copied customer questions for silent fallback', () => {
    expect(isLikelyQianniuClipboardQuestion('这个型号有库存吗？')).toBe(true);
    expect(isLikelyQianniuClipboardQuestion('随手复制的一段说明文字')).toBe(false);
    expect(isLikelyQianniuClipboardQuestion('[object Object]')).toBe(false);
  });

  it('rejects empty and excessively long clipboard values', () => {
    expect(() => normalizeQianniuClipboardQuestion('   ')).toThrow();
    expect(() => normalizeQianniuClipboardQuestion('x'.repeat(2001))).toThrow();
  });

  it('isolates duplicate keys by conversation', () => {
    expect(
      createClipboardQuestionKey({ conversationKey: 'shop-a:user-a', content: 'ok?' }),
    ).not.toBe(
      createClipboardQuestionKey({ conversationKey: 'shop-a:user-b', content: 'ok?' }),
    );
  });
});
