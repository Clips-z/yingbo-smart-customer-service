import sqlite from 'sqlite3';
import { Sequelize } from 'sequelize';
import { initStoreKnowledge } from '../../main/backend/entities/storeKnowledge';
import { initProductKnowledge } from '../../main/backend/entities/productKnowledge';
import { initKnowledgeVersion, KnowledgeVersion } from '../../main/backend/entities/knowledgeVersion';
import { initAuditEvent, AuditEvent } from '../../main/backend/entities/auditEvent';
import { KnowledgeService } from '../../main/backend/services/knowledgeService';

describe('knowledge governance', () => {
  let database: Sequelize;
  let service: KnowledgeService;

  beforeEach(async () => {
    database = new Sequelize({ dialect: 'sqlite', dialectModule: sqlite, storage: ':memory:', logging: false });
    initStoreKnowledge(database); initProductKnowledge(database); initKnowledgeVersion(database); initAuditEvent(database);
    await database.sync();
    service = new KnowledgeService(database);
    service.setIndexer(async () => undefined);
  });
  afterEach(async () => database.close());

  it('versions edits and can roll back a published knowledge item', async () => {
    const created = await service.createStoreKnowledge({ question: '发货吗', answer: '今天', shopId: 'shop-1' });
    await service.updateStoreKnowledge(created.id, { ...created, answer: '明天' });
    await expect(service.listVersions('store', created.id)).resolves.toHaveLength(2);
    await expect(service.rollback('store', created.id, 1)).resolves.toMatchObject({ answer: '今天' });
    await expect(KnowledgeVersion.count()).resolves.toBe(3);
    await expect(AuditEvent.count()).resolves.toBe(3);
  });

  it('merges duplicate questions and disables the source', async () => {
    const target = await service.createStoreKnowledge({ question: '多久发货', answer: '当天', shopId: 'shop-1', tags: ['物流'] });
    const source = await service.createStoreKnowledge({ question: '什么时候发出', answer: '当天', shopId: 'shop-1', tags: ['时效'] });
    const result = await service.mergeStoreKnowledge(target.id, source.id);
    expect(result.target.relatedQuestions).toContain('什么时候发出');
    expect(result.target.tags).toEqual(expect.arrayContaining(['物流', '时效']));
    expect(result.source.enabled).toBe(false);
  });

  it('versions and rolls back product knowledge', async () => {
    const created = await service.createProduct({ name: '旧名称', platformProductId: 'SKU-1', shopId: 'shop-1', shopName: '店铺' });
    await service.updateProduct(created.id, { ...created, name: '新名称' });
    await expect(service.listVersions('product', created.id)).resolves.toHaveLength(2);
    await expect(service.rollback('product', created.id, 1)).resolves.toMatchObject({ name: '旧名称' });
  });

  it('rebuilds only active SQLite knowledge after clearing derived RAG data', async () => {
    const indexed: string[] = [];
    let cleared = 0;
    service.setIndexer(async (_text, filename) => { indexed.push(filename); });
    service.setRagRebuilder(async () => { cleared += 1; });
    await service.createProduct({ name: '上架商品', platformProductId: 'SKU-1', shopId: 'shop-1', shopName: '店铺', onSale: true });
    await service.createProduct({ name: '下架商品', platformProductId: 'SKU-2', shopId: 'shop-1', shopName: '店铺', onSale: false });
    await service.createStoreKnowledge({ question: '有效问题', answer: '有效答案', shopId: 'shop-1' });
    await service.createStoreKnowledge({ question: '过期问题', answer: '过期答案', shopId: 'shop-1', expiresAt: new Date(Date.now() - 1000).toISOString() });
    indexed.length = 0;

    await expect(service.rebuildRag()).resolves.toMatchObject({ products: 1, stores: 1, failed: 0 });
    expect(cleared).toBe(1);
    expect(indexed).toHaveLength(2);
    expect(indexed).toEqual(expect.arrayContaining([expect.stringMatching(/^product-/), expect.stringMatching(/^store-qa-/)]));
  });
});
