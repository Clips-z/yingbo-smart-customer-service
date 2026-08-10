import {
  sanitizeQianniuRecentMessages,
  selectQianniuCustomerQuestion,
  stabilizeQianniuRecentMessages,
} from '../../main/backend/services/qianniuRecentMessages';

describe('sanitizeQianniuRecentMessages', () => {
  test('removes system, timestamp, price, logistics and product-card rows', () => {
    expect(
      sanitizeQianniuRecentMessages([
        { direction: 'incoming', content: '  多久发货  ' },
        { direction: 'outgoing', content: '已读' },
        { direction: 'outgoing', content: '19:30前付款，承诺明天送达' },
        { direction: 'incoming', content: '￥4499.00' },
        { direction: 'incoming', content: '7天无理由退换' },
        { direction: 'outgoing', content: '由 richard 转交给 jamie' },
        { direction: 'incoming', content: '官方智能质检指派给 mary,wheeltec旗舰店' },
      ]),
    ).toEqual([{ direction: 'incoming', content: '多久发货' }]);
  });

  test('deduplicates adjacent messages and keeps the latest five', () => {
    expect(
      sanitizeQianniuRecentMessages([
        { direction: 'incoming', content: '第一句' },
        { direction: 'outgoing', content: '第二句' },
        { direction: 'outgoing', content: '第二句' },
        { direction: 'incoming', content: '第三句' },
        { direction: 'outgoing', content: '第四句' },
      ]),
    ).toEqual([
      { direction: 'incoming', content: '第一句' },
      { direction: 'outgoing', content: '第二句' },
      { direction: 'incoming', content: '第三句' },
      { direction: 'outgoing', content: '第四句' },
    ]);
  });

  test('uses the readable live message when the candidate is an OCR fragment', () => {
    expect(selectQianniuCustomerQuestion('了?', [
      { direction: 'incoming', content: 'model 和 appid 应该怎么配置？' },
    ])).toBe('model 和 appid 应该怎么配置？');
  });

  test('uses the last incoming conversation line instead of an older bubble candidate', () => {
    expect(selectQianniuCustomerQuestion('昨天', [
      { direction: 'incoming', content: '昨天' },
      { direction: 'outgoing', content: '昨天有啥问题或者需要咨询的？' },
      { direction: 'incoming', content: '树莓派5.4g能跑动ros2吗' },
    ])).toBe('树莓派5.4g能跑动ros2吗');
  });

  test('returns an empty list for missing or invalid input', () => {
    expect(sanitizeQianniuRecentMessages(undefined)).toEqual([]);
    expect(
      sanitizeQianniuRecentMessages([
        { direction: 'incoming', content: ' ' },
        { direction: 'incoming', content: '\uFFFD\uFFFD' },
      ]),
    ).toEqual([]);
  });

  test('does not move back to yesterday when a frame misses the newest bubble', () => {
    const previous = [
      { direction: 'incoming' as const, content: '昨天' },
      { direction: 'outgoing' as const, content: '昨天有啥问题或者需要咨询的？' },
      { direction: 'incoming' as const, content: '树莓派5.4g能跑动ros2吗' },
    ];
    expect(
      stabilizeQianniuRecentMessages(previous, [
        { direction: 'incoming', content: '昨天' },
      ]),
    ).toEqual(previous);
  });

  test('removes a cached system assignment before stabilizing history', () => {
    expect(
      stabilizeQianniuRecentMessages(
        [
          { direction: 'incoming', content: '可以' },
          { direction: 'incoming', content: '官方智能质检指派给 mary' },
        ],
        [{ direction: 'incoming', content: '可以' }],
      ),
    ).toEqual([{ direction: 'incoming', content: '可以' }]);
  });

  test('accepts a genuinely new customer message appended to the conversation', () => {
    const observed = [
      { direction: 'incoming' as const, content: '树莓派5.4g能跑动ros2吗' },
      { direction: 'outgoing' as const, content: '可以运行，请使用64位系统。' },
      { direction: 'incoming' as const, content: '需要多大的内存卡？' },
    ];
    expect(
      stabilizeQianniuRecentMessages(
        [{ direction: 'incoming', content: '树莓派5.4g能跑动ros2吗' }],
        observed,
      ),
    ).toBe(observed);
  });
});
