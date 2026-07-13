import {
  validateProductKnowledgeInput,
  validateStoreKnowledgeInput,
} from '../../main/backend/services/knowledgeValidation';

describe('knowledge validation', () => {
  it('normalizes a valid product without injecting demo data', () => {
    expect(validateProductKnowledgeInput({ name: ' 商品A ', platformProductId: ' 123 ', shopId: 'shop' }))
      .toMatchObject({ name: '商品A', platformProductId: '123', shopId: 'shop', onSale: true });
  });
  it('rejects empty product identity', () => {
    expect(() => validateProductKnowledgeInput({ name: '', platformProductId: '1', shopId: 's' })).toThrow('商品名称');
  });
  it('validates store stage and required content', () => {
    expect(() => validateStoreKnowledgeInput({ question: 'q', answer: 'a', shopId: 's', stage: 'bad' })).toThrow('业务阶段');
    expect(validateStoreKnowledgeInput({ question: '发货吗', answer: '今天发', shopId: 's' }))
      .toMatchObject({ stage: 'presale', matchType: 'fuzzy', enabled: true });
  });
});
