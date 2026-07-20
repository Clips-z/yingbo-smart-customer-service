import { GET, POST } from '../common/api/request';
import { QAItem } from './storeKB';

export interface CorpusTestResult {
  query: string;
  matched: QAItem | null;
  score: number;
  latencyMs: number;
  retrievalStatus: string;
  candidates: { item: QAItem; score: number }[];
}

export interface EvaluationSummary {
  total: number;
  hitAt1: number;
  hitAt3: number;
  hitAt5: number;
  noHitRate: number;
  unsafePassCount: number;
  p95LatencyMs: number;
}

export interface EvaluationCaseItem {
  id: string;
  question: string;
  expected_knowledge_ids: string[];
  expected_action: 'answer' | 'assist' | 'transfer' | 'no_answer';
  enabled: boolean;
}

export async function runCorpusTest(query: string): Promise<CorpusTestResult> {
  const response = await POST<{ data: any }>('/api/v1/quality/evaluation/search', { question: query });
  const candidates = (response.data.candidates || []).map((candidate: any) => ({
    score: candidate.score,
    item: {
      id: candidate.knowledgeId || candidate.source,
      question: candidate.question,
      answer: candidate.answer,
      relatedQuestions: [],
      tags: [],
      triggerCount: 0,
      stage: candidate.stage,
      matchType: 'fuzzy',
      updatedAt: new Date().toISOString(),
      shopId: '',
    } as QAItem,
  }));
  return {
    query: response.data.query,
    matched: candidates[0]?.item || null,
    score: candidates[0]?.score || 0,
    latencyMs: response.data.latencyMs,
    retrievalStatus: response.data.retrievalStatus,
    candidates,
  };
}

export async function saveEvaluationCase(question: string, expectedKnowledgeIds: string[] = [], id?: string) {
  await POST('/api/v1/quality/evaluation/cases/save', {
    id,
    question,
    expectedKnowledgeIds,
    expectedAction: 'answer',
  });
}

export async function fetchEvaluationCases() {
  const response = await GET<{ data: EvaluationCaseItem[] }>('/api/v1/quality/evaluation/cases');
  return response.data;
}

export async function deleteEvaluationCase(id: string) {
  await POST('/api/v1/quality/evaluation/cases/delete', { id });
}

export async function runSavedEvaluation() {
  const response = await POST<{ data: EvaluationSummary }>('/api/v1/quality/evaluation/run', {});
  return response.data;
}
