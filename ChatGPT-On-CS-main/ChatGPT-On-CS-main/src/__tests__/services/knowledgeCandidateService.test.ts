import sqlite from 'sqlite3';
import { Sequelize } from 'sequelize';
import { initKnowledgeCandidate, KnowledgeCandidate } from '../../main/backend/entities/knowledgeCandidate';
import { initReplyFeedback, ReplyFeedback } from '../../main/backend/entities/replyFeedback';
import { initReplySuggestion, ReplySuggestion } from '../../main/backend/entities/replySuggestion';
import { initStoreKnowledge } from '../../main/backend/entities/storeKnowledge';
import { initProductKnowledge } from '../../main/backend/entities/productKnowledge';
import { KnowledgeService } from '../../main/backend/services/knowledgeService';
import { KnowledgeCandidateService } from '../../main/backend/services/knowledgeCandidateService';
import { initKnowledgeVersion } from '../../main/backend/entities/knowledgeVersion';
import { initAuditEvent } from '../../main/backend/entities/auditEvent';

describe('KnowledgeCandidateService', () => {
  let database: Sequelize;
  let service: KnowledgeCandidateService;
  let knowledge: KnowledgeService;

  beforeEach(async () => {
    database = new Sequelize({ dialect: 'sqlite', dialectModule: sqlite, storage: ':memory:', logging: false });
    initReplySuggestion(database);
    initReplyFeedback(database);
    initKnowledgeCandidate(database);
    initStoreKnowledge(database);
    initProductKnowledge(database);
    initKnowledgeVersion(database);
    initAuditEvent(database);
    await database.sync();
    knowledge = new KnowledgeService(database);
    knowledge.setIndexer(async () => undefined);
    service = new KnowledgeCandidateService(knowledge);
  });

  afterEach(async () => database.close());

  async function acceptedFeedback() {
    const suggestion = await ReplySuggestion.create({
      platform_id: 'win_qianniu', store: '测试店', store_id: 'shop-1', sender: '客户',
      incoming_content: '我的手机号是13800138000，什么时候发货？', reply_content: '稍后回复', status: 'pending',
    });
    return ReplyFeedback.create({
      id: `feedback-${suggestion.id}`, suggestion_id: suggestion.id, event_key: `event-${suggestion.id}`,
      action: 'filled', final_content: '今天发货，请联系13800138000', metadata: {}, created_at: new Date(),
    });
  }

  it('redacts private data and merges repeated accepted answers', async () => {
    const feedback = await acceptedFeedback();
    const first = await service.considerFeedback(feedback);
    const second = await service.considerFeedback(feedback);
    expect(first).toMatchObject({ status: 'pending', shopId: 'shop-1', sourceCount: 1 });
    expect(first?.question).toContain('[手机号]');
    expect(first?.answer).toContain('[手机号]');
    expect(second).toMatchObject({ sourceCount: 2 });
    await expect(KnowledgeCandidate.count()).resolves.toBe(1);
  });

  it('only indexes knowledge after explicit approval', async () => {
    const indexer = jest.fn(async () => undefined);
    knowledge.setIndexer(indexer);
    const candidate = await service.considerFeedback(await acceptedFeedback());
    expect(indexer).not.toHaveBeenCalled();
    const result = await service.approve(candidate!.id, {
      answer: '审核后的答案',
      relatedQuestions: ['多久能发出'],
      tags: ['物流'],
      stage: 'mid',
      shopId: 'shop-reviewed',
    });
    expect(result.candidate).toMatchObject({
      status: 'approved',
      answer: '审核后的答案',
      relatedQuestions: ['多久能发出'],
      tags: ['物流'],
      stage: 'mid',
      shopId: 'shop-reviewed',
    });
    expect(result.knowledge).toMatchObject({
      answer: '审核后的答案',
      relatedQuestions: ['多久能发出'],
      tags: ['物流'],
      stage: 'mid',
      shopId: 'shop-reviewed',
      enabled: true,
    });
    expect(indexer).toHaveBeenCalledTimes(1);
  });
});
