import { GET, POST } from '../common/api/request';

export interface KnowledgeCandidateItem {
  id: string;
  question: string;
  answer: string;
  relatedQuestions: string[];
  tags: string[];
  stage: 'presale' | 'mid' | 'aftersale';
  shopId: string;
  sourceCount: number;
  confidence: number;
  evidenceReplyIds: number[];
  status: 'pending' | 'approved' | 'rejected' | 'merged';
  rejectionReason?: string;
  updatedAt: string;
}

export async function fetchKnowledgeCandidates(params: Record<string, unknown>) {
  const response = await GET<{ data: { list: KnowledgeCandidateItem[]; total: number } }>(
    '/api/v1/knowledge/candidates',
    params,
  );
  return response.data;
}

export async function approveKnowledgeCandidate(id: string, patch: Partial<KnowledgeCandidateItem>) {
  await POST('/api/v1/knowledge/candidates/approve', { id, ...patch });
}

export async function rejectKnowledgeCandidate(id: string, reason: string) {
  await POST('/api/v1/knowledge/candidates/reject', { id, reason });
}
