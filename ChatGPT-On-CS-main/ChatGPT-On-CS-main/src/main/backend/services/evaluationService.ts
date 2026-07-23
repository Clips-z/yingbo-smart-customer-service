import crypto from 'crypto';
import { EvaluationCase } from '../entities/evaluationCase';
import { EvaluationRun } from '../entities/evaluationRun';
import { StoreKnowledge } from '../entities/storeKnowledge';
import { RagSearchItem } from './ragService';
import { appendAuditEvent } from './auditService';

type Searcher = (query: string, topK?: number) => Promise<RagSearchItem[]>;

const percentile95 = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * 0.95) - 1];
};

export class EvaluationService {
  constructor(private searcher: Searcher) {}

  async search(question: unknown) {
    const query = String(question || '').trim().slice(0, 1000);
    if (!query) throw new Error('测试问题不能为空');
    const started = Date.now();
    const results = await this.searcher(query, 5);
    const knowledge = await StoreKnowledge.findAll({
      where: { id: results.map((item) => item.knowledgeId).filter(Boolean) },
    });
    const byId = new Map(knowledge.map((item) => [item.id, item]));
    return {
      query,
      latencyMs: Date.now() - started,
      retrievalStatus: results.length ? 'hit' : 'no_hit',
      candidates: results.map((item) => {
        const record = item.knowledgeId ? byId.get(item.knowledgeId) : undefined;
        return {
          ...item,
          question: record?.question || item.content.split('\n')[0] || item.source,
          answer: record?.answer || item.content,
          stage: record?.stage || 'presale',
          score: Math.round(Math.max(0, Math.min(1, item.rerankScore ?? item.vectorScore ?? 0)) * 100),
        };
      }),
    };
  }

  async listCases() {
    return EvaluationCase.findAll({ order: [['updated_at', 'DESC']] });
  }

  async saveCase(body: any) {
    const question = String(body.question || '').trim().slice(0, 1000);
    if (!question) throw new Error('测试问题不能为空');
    const values = {
      question,
      expected_knowledge_ids: Array.isArray(body.expectedKnowledgeIds) ? body.expectedKnowledgeIds.slice(0, 20) : [],
      expected_action: ['answer', 'assist', 'transfer', 'no_answer'].includes(body.expectedAction) ? body.expectedAction : 'answer',
      notes: String(body.notes || '').trim().slice(0, 2000) || null,
      tags: Array.isArray(body.tags) ? body.tags.slice(0, 20) : [],
      enabled: body.enabled !== false,
      updated_at: new Date(),
    };
    if (body.id) {
      const item = await EvaluationCase.findByPk(String(body.id));
      if (!item) throw new Error('测试用例不存在');
      return item.update(values);
    }
    return EvaluationCase.create({ id: crypto.randomUUID(), ...values, created_at: new Date() });
  }

  async deleteCase(id: string) {
    return EvaluationCase.destroy({ where: { id } });
  }

  async runCases() {
    const cases = await EvaluationCase.findAll({ where: { enabled: true } });
    const rows = [] as Array<any>;
    for (const item of cases) {
      try {
        const result = await this.search(item.question);
        const ids = result.candidates.map((candidate: any) => candidate.knowledgeId).filter(Boolean);
        const expected = item.expected_knowledge_ids || [];
        const hitAt = (k: number) => expected.length ? ids.slice(0, k).some((id: string) => expected.includes(id)) : ids.length > 0;
        rows.push({
          id: item.id,
          question: item.question,
          latencyMs: result.latencyMs,
          noHit: ids.length === 0,
          unsafePass: ['transfer', 'no_answer'].includes(item.expected_action) && ids.length > 0,
          hit1: hitAt(1),
          hit3: hitAt(3),
          hit5: hitAt(5),
        });
      } catch (error) {
        rows.push({ id: item.id, question: item.question, latencyMs: 0, noHit: true, unsafePass: false, hit1: false, hit3: false, hit5: false, error: String(error) });
      }
    }
    const rate = (key: string) => rows.length ? Math.round(rows.filter((row) => row[key]).length / rows.length * 1000) / 10 : 0;
    return {
      total: rows.length,
      hitAt1: rate('hit1'),
      hitAt3: rate('hit3'),
      hitAt5: rate('hit5'),
      noHitRate: rate('noHit'),
      unsafePassCount: rows.filter((row) => row.unsafePass).length,
      p95LatencyMs: percentile95(rows.map((row) => row.latencyMs)),
      rows,
    };
  }

  async listComparisonRuns() {
    return EvaluationRun.findAll({ order: [['created_at', 'DESC']], limit: 20 });
  }

  async compareVariants(body: any = {}) {
    const cases = await EvaluationCase.findAll({ where: { enabled: true } });
    const variants = [
      { name: String(body.variantA?.name || '当前方案'), topK: Math.min(20, Math.max(1, Number(body.variantA?.topK) || 3)) },
      { name: String(body.variantB?.name || '候选方案'), topK: Math.min(20, Math.max(1, Number(body.variantB?.topK) || 5)) },
    ];
    const results = [];
    for (const variant of variants) {
      let hits = 0;
      let latency = 0;
      for (const item of cases) {
        const started = Date.now();
        const found = await this.searcher(item.question, variant.topK);
        latency += Date.now() - started;
        const expected = item.expected_knowledge_ids || [];
        const ids = found.map((row) => row.knowledgeId).filter(Boolean) as string[];
        if (expected.length ? ids.some((id) => expected.includes(id)) : ids.length > 0) hits += 1;
      }
      results.push({
        ...variant,
        total: cases.length,
        hitRate: cases.length ? Math.round(hits / cases.length * 1000) / 10 : 0,
        averageLatencyMs: cases.length ? Math.round(latency / cases.length) : 0,
      });
    }
    const winner = results[1].hitRate > results[0].hitRate ? results[1].name : results[0].name;
    const run = await EvaluationRun.create({
      id: crypto.randomUUID(), variants, results, winner,
      cases: cases.map((item) => ({ id: item.id, updatedAt: item.updated_at.toISOString() })),
      created_at: new Date(),
    });
    await appendAuditEvent({ action: 'evaluation.compare', entityType: 'evaluation', entityId: run.id, payload: { results, winner } });
    return { id: run.id, createdAt: run.created_at, variants: results, winner };
  }
}
