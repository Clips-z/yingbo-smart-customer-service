import crypto from 'crypto';
import { ReplyDTO } from '../types';
import { RetrievalEvidence } from '../entities/retrievalEvidence';
import { ReplySuggestion } from '../entities/replySuggestion';

export async function saveRetrievalEvidence(suggestion: ReplySuggestion, reply: ReplyDTO) {
  await suggestion.update({ retrieval_status: reply.retrievalStatus || 'disabled' });
  const evidence = reply.retrievalEvidence || [];
  if (!evidence.length) return [];
  await RetrievalEvidence.destroy({ where: { suggestion_id: suggestion.id } });
  return RetrievalEvidence.bulkCreate(evidence.map((item) => ({
    id: crypto.randomUUID(),
    suggestion_id: suggestion.id,
    knowledge_id: item.knowledgeId || null,
    source: item.source,
    content_excerpt: item.contentExcerpt,
    vector_score: item.vectorScore ?? null,
    rerank_score: item.rerankScore ?? null,
    rank: item.rank,
    relevance_feedback: null,
    created_at: new Date(),
  })));
}

export async function listRetrievalEvidence(suggestionId: number) {
  return RetrievalEvidence.findAll({
    where: { suggestion_id: suggestionId },
    order: [['rank', 'ASC']],
  });
}

export async function markRetrievalEvidence(id: string, relevant: boolean) {
  const item = await RetrievalEvidence.findByPk(id);
  if (!item) throw new Error('检索证据不存在');
  await item.update({ relevance_feedback: relevant ? 'relevant' : 'irrelevant' });
  return item;
}
