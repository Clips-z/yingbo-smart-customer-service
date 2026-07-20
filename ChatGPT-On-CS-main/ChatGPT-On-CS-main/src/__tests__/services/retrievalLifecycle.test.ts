import axios from 'axios';
import sqlite from 'sqlite3';
import { Sequelize } from 'sequelize';
import { initStoreKnowledge, StoreKnowledge } from '../../main/backend/entities/storeKnowledge';
import { MessageService } from '../../main/backend/services/messageService';

jest.mock('axios');

describe('retrieval lifecycle filter', () => {
  let database: Sequelize;
  beforeEach(async () => {
    database = new Sequelize({ dialect: 'sqlite', dialectModule: sqlite, storage: ':memory:', logging: false });
    initStoreKnowledge(database);
    await database.sync();
  });
  afterEach(async () => database.close());

  it('rejects expired indexed chunks before reply generation', async () => {
    await StoreKnowledge.create({
      id: 'expired-id', question: '活动价', answer: '旧价格', related_questions: [], tags: [],
      stage: 'presale', match_type: 'fuzzy', shop_id: 'shop-1', enabled: true,
      expires_at: new Date(Date.now() - 1000), sync_status: 'synced', created_at: new Date(), updated_at: new Date(),
    });
    (axios.get as jest.Mock).mockResolvedValue({ data: { results: [{ source: 'store-qa-expired-id.txt', content: '旧活动价格', rerank_score: 0.99 }] } });
    const service = new MessageService({ warn: jest.fn() } as any, {} as any);
    const result = await (service as any).retrieveRagKnowledge([{ role: 'OTHER', content: '活动价是多少' }]);
    expect(result).toMatchObject({ status: 'stale', content: '', evidence: [] });
  });
});
