import { previewProductRows, previewStoreRows } from '../../renderer/common/services/knowledge/knowledgeImport';

describe('knowledge import preview', () => {
  it('maps Chinese headers and reports invalid rows without dropping valid rows', () => {
    const result = previewProductRows([
      ['商品名称', '平台商品ID', '店铺ID', '上架状态'],
      ['商品A', 'P1', 'shop1', '是'],
      ['', 'P2', 'shop1', '否'],
    ]);
    expect(result.valid).toEqual([expect.objectContaining({ name: '商品A', onSale: true })]);
    expect(result.invalid).toEqual([{ row: 3, error: expect.any(String) }]);
  });
  it('previews store QA rows with Chinese stages', () => {
    const result = previewStoreRows([
      ['问题', '回复', '店铺ID', '阶段'],
      ['多久发货', '今天发', 'shop1', '售中'],
    ]);
    expect(result.valid[0]).toMatchObject({ stage: 'mid', shopId: 'shop1' });
  });
});
