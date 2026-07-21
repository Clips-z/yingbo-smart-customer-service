import sqlite from 'sqlite3';
import { Sequelize } from 'sequelize';
import {
  initReplySuggestion,
  ReplySuggestion,
} from '../../main/backend/entities/replySuggestion';
import {
  initReplyFeedback,
  ReplyFeedback,
} from '../../main/backend/entities/replyFeedback';
import { ReplyFeedbackService } from '../../main/backend/services/replyFeedbackService';

describe('ReplyFeedbackService', () => {
  let database: Sequelize;
  let service: ReplyFeedbackService;

  beforeEach(async () => {
    database = new Sequelize({
      dialect: 'sqlite',
      dialectModule: sqlite,
      storage: ':memory:',
      logging: false,
    });
    initReplySuggestion(database);
    initReplyFeedback(database);
    await database.sync();
    service = new ReplyFeedbackService();
  });

  afterEach(async () => database.close());

  const createSuggestion = (modelName?: string, promptVersion?: string) =>
    ReplySuggestion.create({
      platform_id: 'win_qianniu',
      store: '测试店',
      sender: '客户A',
      incoming_content: '多久发货？',
      reply_content: '今天发',
      original_reply_content: '今天发',
      status: 'pending',
      model_name: modelName || null,
      prompt_version: promptVersion || null,
    });

  it('records the final content and a normalized edit ratio', async () => {
    const suggestion = await createSuggestion();
    const result = await service.record({
      suggestionId: suggestion.id,
      eventKey: `suggestion:${suggestion.id}:filled:1`,
      action: 'filled',
      finalContent: '亲，您的订单今天发出。',
      metadata: { platformId: 'win_qianniu' },
    });

    expect(result.feedback).toMatchObject({
      suggestion_id: suggestion.id,
      action: 'filled',
      original_content: '今天发',
      final_content: '亲，您的订单今天发出。',
    });
    expect(result.feedback.edit_ratio).toBeGreaterThan(0);
    expect(result.feedback.edit_ratio).toBeLessThanOrEqual(1);
    await expect(suggestion.reload()).resolves.toMatchObject({
      final_reply_content: '亲，您的订单今天发出。',
    });
  });

  it('returns the existing event when a delivery retry repeats the event key', async () => {
    const suggestion = await createSuggestion();
    const input = {
      suggestionId: suggestion.id,
      eventKey: `suggestion:${suggestion.id}:sent:request-1`,
      action: 'sent',
      finalContent: '今天发',
    };
    const first = await service.record(input);
    const second = await service.record(input);

    expect(second.created).toBe(false);
    expect(second.feedback.id).toBe(first.feedback.id);
    await expect(ReplyFeedback.count()).resolves.toBe(1);
  });

  it('summarizes accepted, edited, ignored, and failed outcomes', async () => {
    const suggestion = await createSuggestion();
    await service.record({ suggestionId: suggestion.id, eventKey: 'one', action: 'filled', finalContent: '今天发' });
    await service.record({ suggestionId: suggestion.id, eventKey: 'two', action: 'dismissed' });
    await service.record({ suggestionId: suggestion.id, eventKey: 'three', action: 'failed', reasonCode: 'window_missing' });

    await expect(service.getMetrics(7)).resolves.toMatchObject({
      totalActions: 3,
      accepted: 1,
      dismissed: 1,
      failed: 1,
    });
  });

  it('groups real feedback by recorded model and prompt versions', async () => {
    const current = await createSuggestion('gpt-current', 'v1');
    const candidate = await createSuggestion('gpt-candidate', 'v2');
    await service.record({ suggestionId: current.id, eventKey: 'current-filled', action: 'filled', finalContent: '今天发' });
    await service.record({ suggestionId: candidate.id, eventKey: 'candidate-dismissed', action: 'dismissed' });
    await expect(service.getVariantMetrics(30)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ variant: 'gpt-current / v1', totalActions: 1, acceptanceRate: 100 }),
      expect.objectContaining({ variant: 'gpt-candidate / v2', totalActions: 1, acceptanceRate: 0 }),
    ]));
  });
});
