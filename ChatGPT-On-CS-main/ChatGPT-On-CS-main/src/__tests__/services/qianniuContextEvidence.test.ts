import {
  extractQianniuContextEvidence,
  normalizeQianniuStoreName,
} from '../../main/backend/services/qianniuContextEvidence';

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

  test('recovers a missing tab separator from the visible agent account', () => {
    expect(
      extractQianniuContextEvidence([
        { ...line('wheeltec品牌店jamie', 592, 15), active_tab: true },
        line('jamie', 87, 84),
      ]),
    ).toMatchObject({
      storeId: 'wheeltec品牌店',
      storeName: 'wheeltec品牌店',
      accountId: 'jamie',
      accountName: 'jamie',
    });
  });

  test('repairs the selected passionpaul tab when OCR drops one letter', () => {
    expect(
      extractQianniuContextEvidence([
        { ...line('passonipauljame', 249, 20), active_tab: true },
        line('jamie', 108, 89),
      ]),
    ).toMatchObject({
      storeId: 'passionpaul',
      accountId: 'jamie',
    });
  });

  test('uses the verified active tab slot when the Chinese shop text is corrupted', () => {
    expect(
      extractQianniuContextEvidence(
        [{ ...line('《、wheeltectWEjamie', 420, 20), active_tab: true }],
        'jamie',
        2,
      ),
    ).toMatchObject({
      storeId: 'wheeltec旗舰店',
      storeName: 'wheeltec旗舰店',
      accountId: 'jamie',
    });
    expect(
      extractQianniuContextEvidence(
        [{ ...line('《、wheeltectWEjame', 420, 20), active_tab: true }],
        undefined,
        2,
      ),
    ).toMatchObject({ storeId: 'wheeltec旗舰店', accountId: 'jamie' });
  });

  test('does not guess a store from an ambiguous tab strip', () => {
    expect(
      extractQianniuContextEvidence([
        line('firstshop:jamie', 250, 18),
        line('wheeltech品牌店jamie', 610, 18),
      ]),
    ).toEqual({});
  });

  test('parses the space-separated store and account emitted by Windows OCR', () => {
    expect(
      extractQianniuContextEvidence([
        line('wheeltech 品牌店 jamie', 610, 18),
      ]),
    ).toMatchObject({
      storeId: 'wheeltech品牌店',
      accountId: 'jamie',
    });
  });

  test('repairs the live OCR flagship suffix without changing a brand shop', () => {
    expect(normalizeQianniuStoreName('wheeltech 牌 店')).toBe('wheeltech旗舰店');
    expect(normalizeQianniuStoreName('wheeltech 品牌店')).toBe('wheeltech品牌店');
    expect(
      extractQianniuContextEvidence([
        { ...line('wheeltech 牌 店:jamie', 610, 18), active_tab: true },
      ]),
    ).toMatchObject({
      storeId: 'wheeltech旗舰店',
      storeName: 'wheeltech旗舰店',
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
