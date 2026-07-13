import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite from 'sqlite3';
import { Sequelize } from 'sequelize';
import { initProductKnowledge } from '../../main/backend/entities/productKnowledge';
import { initStoreKnowledge } from '../../main/backend/entities/storeKnowledge';
import { KnowledgeService } from '../../main/backend/services/knowledgeService';

describe('KnowledgeService persistence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yingbo-kb-test-'));
  const storage = path.join(dir, 'knowledge.db');

  const open = async () => {
    const sequelize = new Sequelize({ dialect: 'sqlite', dialectModule: sqlite, storage, logging: false });
    initProductKnowledge(sequelize);
    initStoreKnowledge(sequelize);
    await sequelize.sync();
    return sequelize;
  };

  afterAll(() => {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('persists products and store QA across database reopen', async () => {
    let database = await open();
    let service = new KnowledgeService(database);
    await service.createProduct({ name: '测试商品', platformProductId: 'P-1', shopId: 'shop-1', shopName: '测试店' });
    await service.createStoreKnowledge({ question: '什么时候发货？', answer: '今天发货', shopId: 'shop-1' });
    service.setIndexer(async () => { throw new Error('RAG offline'); });
    const created = await service.createStoreKnowledge({ question: '退换货？', answer: '支持', shopId: 'shop-2' });
    expect(created).toMatchObject({ syncStatus: 'failed', syncError: 'RAG offline' });
    service.setIndexer(async () => undefined);
    await expect(service.retrySync('store', created.id)).resolves.toMatchObject({ syncStatus: 'synced' });
    await expect(
      service.createProduct({ name: '重复商品', platformProductId: 'P-1', shopId: 'shop-1' }),
    ).rejects.toThrow();
    await database.close();

    database = await open();
    service = new KnowledgeService(database);
    await expect(service.listProducts({})).resolves.toMatchObject({ total: 1 });
    await expect(service.listStoreKnowledge({})).resolves.toMatchObject({ total: 2 });
    await database.close();
  });
});
