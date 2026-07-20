import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite from 'sqlite3';
import { Sequelize } from 'sequelize';
import {
  initKnowledgeCandidate,
  KnowledgeCandidate,
} from '../../main/backend/entities/knowledgeCandidate';
import {
  initReplyFeedback,
  ReplyFeedback,
} from '../../main/backend/entities/replyFeedback';
import {
  initRetrievalEvidence,
  RetrievalEvidence,
} from '../../main/backend/entities/retrievalEvidence';
import {
  EvaluationCase,
  initEvaluationCase,
} from '../../main/backend/entities/evaluationCase';
import {
  checkAndAddFields,
  initReplySuggestion,
  ReplySuggestion,
} from '../../main/backend/entities/replySuggestion';

describe('quality loop persistence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yingbo-quality-loop-'));
  const storage = path.join(dir, 'quality-loop.db');

  const open = async () => {
    const sequelize = new Sequelize({
      dialect: 'sqlite',
      dialectModule: sqlite,
      storage,
      logging: false,
    });
    initReplySuggestion(sequelize);
    initKnowledgeCandidate(sequelize);
    initReplyFeedback(sequelize);
    initRetrievalEvidence(sequelize);
    initEvaluationCase(sequelize);
    await sequelize.sync();
    await checkAndAddFields(sequelize);
    return sequelize;
  };

  afterAll(() => {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('persists auditable feedback, evidence, candidates, and evaluation cases', async () => {
    let database = await open();
    const suggestion = await ReplySuggestion.create({
      platform_id: 'win_qianniu',
      store: '测试店',
      sender: '客户A',
      incoming_content: '什么时候发货？',
      reply_content: '预计今天发出',
      original_reply_content: '预计今天发出',
      final_reply_content: '亲，订单预计今天发出。',
      model_provider: 'openai-compatible',
      model_name: 'test-model',
      prompt_version: 'prompt-v1',
      generation_latency_ms: 320,
      retrieval_status: 'grounded',
      risk_level: 'low',
      ocr_confidence: 0.96,
      ocr_reason_codes: [],
      status: 'pending',
    });

    await ReplyFeedback.create({
      id: 'feedback-1',
      suggestion_id: suggestion.id,
      event_key: `suggestion:${suggestion.id}:filled`,
      action: 'filled',
      original_content: '预计今天发出',
      final_content: '亲，订单预计今天发出。',
      edit_ratio: 0.31,
      reason_code: null,
      metadata: { platformId: 'win_qianniu' },
    });
    await RetrievalEvidence.create({
      id: 'evidence-1',
      suggestion_id: suggestion.id,
      knowledge_id: 'knowledge-1',
      source: 'store-qa-knowledge-1.txt',
      content_excerpt: '订单通常在当日发出',
      vector_score: 0.82,
      rerank_score: 0.91,
      rank: 1,
      relevance_feedback: null,
    });
    await KnowledgeCandidate.create({
      id: 'candidate-1',
      fingerprint: 'fingerprint-1',
      question: '什么时候发货？',
      answer: '订单通常在当日发出',
      related_questions: ['今天能发吗？'],
      tags: ['发货'],
      stage: 'presale',
      shop_id: 'shop-1',
      source_count: 3,
      confidence: 0.88,
      evidence_reply_ids: [suggestion.id],
      status: 'pending',
    });
    await EvaluationCase.create({
      id: 'case-1',
      question: '今天可以发货吗？',
      expected_knowledge_ids: ['knowledge-1'],
      expected_action: 'answer',
      notes: '标准售前问题',
      tags: ['发货'],
      enabled: true,
    });
    await database.close();

    database = await open();
    await expect(ReplyFeedback.count()).resolves.toBe(1);
    await expect(RetrievalEvidence.count()).resolves.toBe(1);
    await expect(KnowledgeCandidate.count()).resolves.toBe(1);
    await expect(EvaluationCase.count()).resolves.toBe(1);
    await expect(ReplySuggestion.findByPk(suggestion.id)).resolves.toMatchObject({
      final_reply_content: '亲，订单预计今天发出。',
      retrieval_status: 'grounded',
      ocr_confidence: 0.96,
    });
    await database.close();
  });

  it('keeps feedback events idempotent by event key', async () => {
    const database = await open();
    await ReplyFeedback.create({
      id: 'feedback-2',
      suggestion_id: 999,
      event_key: 'suggestion:999:copied',
      action: 'copied',
      metadata: {},
    });
    await expect(
      ReplyFeedback.create({
        id: 'feedback-3',
        suggestion_id: 999,
        event_key: 'suggestion:999:copied',
        action: 'copied',
        metadata: {},
      }),
    ).rejects.toThrow();
    await database.close();
  });
});
