import crypto from 'crypto';
import { Op } from 'sequelize';
import { KnowledgeCandidate } from '../entities/knowledgeCandidate';
import { ReplyFeedback } from '../entities/replyFeedback';
import { ReplySuggestion } from '../entities/replySuggestion';
import { KnowledgeService } from './knowledgeService';
import { appendAuditEvent } from './auditService';
import { redactPersonalData } from './privacyService';

const clean = (value: unknown, max: number) =>
  redactPersonalData(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const json = (item: KnowledgeCandidate) => ({
  id: item.id,
  question: item.question,
  answer: item.answer,
  relatedQuestions: item.related_questions || [],
  tags: item.tags || [],
  stage: item.stage,
  shopId: item.shop_id,
  sourceCount: item.source_count,
  confidence: item.confidence,
  evidenceReplyIds: item.evidence_reply_ids || [],
  status: item.status,
  rejectionReason: item.rejection_reason,
  approvedKnowledgeId: item.approved_knowledge_id,
  reviewedAt: item.reviewed_at?.toISOString() || null,
  createdAt: item.created_at.toISOString(),
  updatedAt: item.updated_at.toISOString(),
});

export class KnowledgeCandidateService {
  constructor(private knowledgeService: KnowledgeService) {}

  async considerFeedback(feedback: ReplyFeedback) {
    if (!['filled', 'sent'].includes(feedback.action) || !feedback.final_content) return null;
    const suggestion = await ReplySuggestion.findByPk(feedback.suggestion_id);
    if (!suggestion) return null;
    const question = clean(suggestion.incoming_content, 1000);
    const answer = clean(feedback.final_content, 5000);
    if (!question || !answer) return null;
    const shopId = clean(suggestion.store_id || suggestion.store || 'default', 100);
    const fingerprint = crypto
      .createHash('sha256')
      .update(`${shopId}\n${question.toLowerCase()}\n${answer.toLowerCase()}`)
      .digest('hex');
    const existing = await KnowledgeCandidate.findOne({ where: { fingerprint } });
    if (existing) {
      const evidence = [...new Set([...(existing.evidence_reply_ids || []), suggestion.id])];
      await existing.update({
        source_count: existing.source_count + 1,
        confidence: Math.min(0.99, 0.55 + existing.source_count * 0.1),
        evidence_reply_ids: evidence,
        updated_at: new Date(),
      });
      return json(existing);
    }
    const item = await KnowledgeCandidate.create({
      fingerprint,
      question,
      answer,
      related_questions: [],
      tags: [],
      stage: 'presale',
      shop_id: shopId,
      source_count: 1,
      confidence: 0.55,
      evidence_reply_ids: [suggestion.id],
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date(),
    });
    return json(item);
  }

  async list(query: any = {}) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const where: any = {};
    if (query.status && query.status !== 'all') where.status = String(query.status);
    const keyword = clean(query.keyword, 200);
    if (keyword) where[Op.or] = [
      { question: { [Op.like]: `%${keyword}%` } },
      { answer: { [Op.like]: `%${keyword}%` } },
    ];
    const result = await KnowledgeCandidate.findAndCountAll({
      where,
      limit: pageSize,
      offset: (page - 1) * pageSize,
      order: [['updated_at', 'DESC']],
    });
    const evidenceIds = [...new Set(result.rows.flatMap((item) => item.evidence_reply_ids || []))];
    const evidenceRows = evidenceIds.length
      ? await ReplySuggestion.findAll({ where: { id: { [Op.in]: evidenceIds } } })
      : [];
    const evidenceById = new Map(evidenceRows.map((item) => [item.id, {
      id: item.id,
      question: clean(item.incoming_content, 1000),
      capturedAt: item.created_at.toISOString(),
    }]));
    return {
      list: result.rows.map((item) => ({
        ...json(item),
        evidence: (item.evidence_reply_ids || []).map((id) => evidenceById.get(id)).filter(Boolean),
      })),
      total: result.count,
      page,
      pageSize,
    };
  }

  async approve(id: string, patch: any = {}) {
    const item = await KnowledgeCandidate.findByPk(id);
    if (!item || item.status !== 'pending') throw new Error('待审核知识不存在或已处理');
    const knowledge = await this.knowledgeService.createStoreKnowledge({
      question: clean(patch.question ?? item.question, 1000),
      answer: clean(patch.answer ?? item.answer, 5000),
      relatedQuestions: Array.isArray(patch.relatedQuestions) ? patch.relatedQuestions : item.related_questions,
      tags: Array.isArray(patch.tags) ? patch.tags : item.tags,
      stage: patch.stage || item.stage,
      matchType: patch.matchType || 'fuzzy',
      shopId: clean(patch.shopId ?? item.shop_id, 100),
      enabled: patch.enabled !== false,
    });
    await item.update({
      question: knowledge.question,
      answer: knowledge.answer,
      related_questions: knowledge.relatedQuestions,
      tags: knowledge.tags,
      stage: knowledge.stage,
      shop_id: knowledge.shopId,
      status: 'approved',
      approved_knowledge_id: knowledge.id,
      reviewed_at: new Date(),
      updated_at: new Date(),
    });
    await appendAuditEvent({ action: 'candidate.approve', entityType: 'knowledge-candidate', entityId: item.id, payload: { approvedKnowledgeId: knowledge.id } });
    return { candidate: json(item), knowledge };
  }

  async reject(id: string, reason: unknown) {
    const item = await KnowledgeCandidate.findByPk(id);
    if (!item || item.status !== 'pending') throw new Error('待审核知识不存在或已处理');
    await item.update({
      status: 'rejected',
      rejection_reason: clean(reason, 500) || '人工驳回',
      reviewed_at: new Date(),
      updated_at: new Date(),
    });
    await appendAuditEvent({ action: 'candidate.reject', entityType: 'knowledge-candidate', entityId: item.id, payload: { reason: item.rejection_reason } });
    return json(item);
  }
}
