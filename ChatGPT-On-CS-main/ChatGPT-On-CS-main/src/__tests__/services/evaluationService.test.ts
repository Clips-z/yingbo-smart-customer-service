import sqlite from 'sqlite3';
import { Sequelize } from 'sequelize';
import { initEvaluationCase } from '../../main/backend/entities/evaluationCase';
import { initStoreKnowledge, StoreKnowledge } from '../../main/backend/entities/storeKnowledge';
import { EvaluationService } from '../../main/backend/services/evaluationService';

describe('EvaluationService', () => {
  let database: Sequelize;

  beforeEach(async () => {
    database = new Sequelize({ dialect: 'sqlite', dialectModule: sqlite, storage: ':memory:', logging: false });
    initEvaluationCase(database);
    initStoreKnowledge(database);
    await database.sync();
    await StoreKnowledge.create({
      id: 'knowledge-1', question: '多久发货？', answer: '当天发货', related_questions: [], tags: [],
      stage: 'presale', match_type: 'fuzzy', shop_id: 'shop-1', enabled: true,
      sync_status: 'synced', created_at: new Date(), updated_at: new Date(),
    });
  });

  afterEach(async () => database.close());

  it('uses the real search adapter and hydrates matched knowledge', async () => {
    const searcher = jest.fn(async () => [{
      knowledgeId: 'knowledge-1', source: 'store-qa-knowledge-1.txt', content: 'chunk',
      rerankScore: 0.91, rank: 1,
    }]);
    const service = new EvaluationService(searcher);
    await expect(service.search('什么时候发货')).resolves.toMatchObject({
      retrievalStatus: 'hit',
      candidates: [{ knowledgeId: 'knowledge-1', question: '多久发货？', answer: '当天发货', score: 91 }],
    });
    expect(searcher).toHaveBeenCalledWith('什么时候发货', 5);
  });

  it('stores cases and reports hit rates from retrieval results', async () => {
    const service = new EvaluationService(async () => [{
      knowledgeId: 'knowledge-1', source: 'store-qa-knowledge-1.txt', content: 'chunk', rank: 1,
    }]);
    await service.saveCase({ question: '什么时候发货', expectedKnowledgeIds: ['knowledge-1'] });
    await expect(service.runCases()).resolves.toMatchObject({
      total: 1, hitAt1: 100, hitAt3: 100, hitAt5: 100, noHitRate: 0,
    });
  });
});
