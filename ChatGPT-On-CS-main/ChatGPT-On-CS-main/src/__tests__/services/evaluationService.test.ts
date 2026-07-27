import sqlite from 'sqlite3';
import { Sequelize } from 'sequelize';
import { initEvaluationCase } from '../../main/backend/entities/evaluationCase';
import { initEvaluationRun, EvaluationRun } from '../../main/backend/entities/evaluationRun';
import { initStoreKnowledge, StoreKnowledge } from '../../main/backend/entities/storeKnowledge';
import { initAuditEvent } from '../../main/backend/entities/auditEvent';
import { initKnowledgeVersion, KnowledgeVersion } from '../../main/backend/entities/knowledgeVersion';
import { EvaluationService } from '../../main/backend/services/evaluationService';

describe('EvaluationService', () => {
  let database: Sequelize;

  beforeEach(async () => {
    database = new Sequelize({ dialect: 'sqlite', dialectModule: sqlite, storage: ':memory:', logging: false });
    initEvaluationCase(database);
    initEvaluationRun(database);
    initStoreKnowledge(database);
    initAuditEvent(database);
    initKnowledgeVersion(database);
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

  it('persists the compared variants, case revision, metrics, and winner', async () => {
    const service = new EvaluationService(async () => [{
      knowledgeId: 'knowledge-1', source: 'store-qa-knowledge-1.txt', content: 'chunk', rank: 1,
    }]);
    await service.saveCase({ question: '什么时候发货', expectedKnowledgeIds: ['knowledge-1'] });
    await expect(service.compareVariants({ variantA: { name: 'Top1', topK: 1 }, variantB: { name: 'Top3', topK: 3 } }))
      .resolves.toMatchObject({ winner: 'Top1', variants: [{ name: 'Top1' }, { name: 'Top3' }] });
    await expect(EvaluationRun.count()).resolves.toBe(1);
    await expect(service.listComparisonRuns()).resolves.toEqual([
      expect.objectContaining({ winner: 'Top1', cases: [expect.objectContaining({ updatedAt: expect.any(String) })] }),
    ]);
  });

  it('runs each variant with its own model, prompt, and historical knowledge snapshot', async () => {
    await KnowledgeVersion.create({ id: 'version-1', knowledge_type: 'store', knowledge_id: 'knowledge-1', version: 1, action: 'create', actor: 'test', created_at: new Date(), snapshot: { question: '发货多久？', answer: '旧版本当天发货', relatedQuestions: [] } });
    const replies = jest.fn(async ({ variant, knowledge }) => `${variant.model}|${variant.systemPrompt}|${knowledge}`);
    const service = new EvaluationService(async () => [{ knowledgeId: 'knowledge-1', source: 'store-qa-knowledge-1.txt', content: 'chunk', rank: 1 }], replies);
    await service.saveCase({ question: '什么时候发货？', expectedKnowledgeIds: ['knowledge-1'] });
    const result = await service.compareVariants({
      variantA: { name: 'old', model: 'model-a', systemPrompt: 'prompt-a', knowledgeVersion: 1 },
      variantB: { name: 'new', model: 'model-b', systemPrompt: 'prompt-b' },
    });
    expect(replies).toHaveBeenCalledTimes(2);
    expect(result.variants[0].rows[0].answer).toContain('model-a|prompt-a|问题：发货多久？\n回复：旧版本当天发货');
    expect(result.variants[1].rows[0].answer).toContain('model-b|prompt-b|问题：');
  });
});
