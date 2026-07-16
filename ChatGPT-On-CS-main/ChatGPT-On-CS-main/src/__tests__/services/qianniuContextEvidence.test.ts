import { extractQianniuContextEvidence } from '../../main/backend/services/qianniuContextEvidence';

const line = (text: string, x: number, y: number) => ({
  text, score: 0.98, x, y, width: text.length * 12, height: 22,
});

describe('extractQianniuContextEvidence', () => {
  test('extracts active store and agent from the Qianniu tab', () => {
    expect(
      extractQianniuContextEvidence([
        line('passionpaul', 480, 22), line(':jamie', 590, 22),
      ]),
    ).toMatchObject({
      storeId: 'passionpaul', storeName: 'passionpaul',
      accountId: 'jamie', accountName: 'jamie',
    });
  });

  test('uses the blue active tab and accepts an OCR semicolon separator', () => {
    expect(
      extractQianniuContextEvidence([
        line('轮越旗舰店:jamie', 60, 18),
        { ...line('passionpaul;jamie', 245, 18), active_tab: true },
        line('wheeltec旗舰店:jamie', 420, 18),
      ]),
    ).toMatchObject({
      storeId: 'passionpaul',
      accountId: 'jamie',
    });
  });

  test('extracts product id and nearby title from the right product panel', () => {
    expect(
      extractQianniuContextEvidence([
        line('二自由度二维舵机360度电动云台', 1160, 458),
        line('ID 560120308139', 1160, 520),
        line('库存132045 销量7923', 1160, 550),
      ]),
    ).toMatchObject({
      productId: '560120308139',
      productTitle: '二自由度二维舵机360度电动云台',
    });
  });

  test('does not mistake prices or order actions for a product title', () => {
    const result = extractQianniuContextEvidence([
      line('¥68.00', 1160, 480), line('ID: 560120308139', 1160, 520),
      line('发送宝贝', 1160, 540),
    ]);
    expect(result.productId).toBe('560120308139');
    expect(result.productTitle).toBeUndefined();
  });
});
