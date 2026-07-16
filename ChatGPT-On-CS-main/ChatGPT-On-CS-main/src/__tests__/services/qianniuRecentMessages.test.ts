import { sanitizeQianniuRecentMessages } from '../../main/backend/services/qianniuRecentMessages';

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
      ]),
    ).toEqual([{ direction: 'incoming', content: '多久发货' }]);
  });

  test('deduplicates adjacent messages and keeps the latest three', () => {
    expect(
      sanitizeQianniuRecentMessages([
        { direction: 'incoming', content: '第一句' },
        { direction: 'outgoing', content: '第二句' },
        { direction: 'outgoing', content: '第二句' },
        { direction: 'incoming', content: '第三句' },
        { direction: 'outgoing', content: '第四句' },
      ]),
    ).toEqual([
      { direction: 'outgoing', content: '第二句' },
      { direction: 'incoming', content: '第三句' },
      { direction: 'outgoing', content: '第四句' },
    ]);
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
});
