import { GET, POST } from '../common/api/request';

export type QAStage = 'presale' | 'mid' | 'aftersale';
export type QAMatchType = 'exact' | 'fuzzy';
export interface QAItem {
  id: string;
  question: string;
  answer: string;
  relatedQuestions: string[];
  tags: string[];
  triggerCount: number;
  stage: QAStage;
  matchType: QAMatchType;
  updatedAt: string;
  shopId: string;
  enabled?: boolean;
  syncStatus?: 'pending' | 'synced' | 'failed';
  syncError?: string;
}
export interface QAListParams {
  keyword?: string;
  stage?: QAStage | 'all';
  shop?: string;
  page?: number;
  pageSize?: number;
}
export interface QAStats { total: number; presale: number; mid: number; aftersale: number }
export interface QAListResult { list: QAItem[]; total: number; stats: QAStats; page: number; pageSize: number }

export const SHOP_OPTIONS = [
  { id: 'shop_lixixi', name: '李西西旗舰店' },
  { id: 'shop_muzhi', name: '木之语家居' },
  { id: 'shop_chunyu', name: '春雨服饰专营' },
  { id: 'shop_xinghe', name: '星河数码' },
];

export async function fetchStoreQAList(params: QAListParams) {
  const response = await GET<{ data: QAListResult }>('/api/v1/knowledge/store-qa', params);
  return response.data;
}

export async function addQA(input: Omit<QAItem, 'id' | 'triggerCount' | 'updatedAt'>) {
  const response = await POST<{ data: QAItem }>('/api/v1/knowledge/store-qa/create', input);
  return response.data;
}

export async function updateQA(id: string, patch: Partial<Omit<QAItem, 'id'>>) {
  await POST('/api/v1/knowledge/store-qa/update', { id, ...patch });
}

export async function deleteQA(id: string) {
  await POST('/api/v1/knowledge/store-qa/delete', { id });
}

export async function retryStoreKnowledgeSync(id: string) {
  const response = await POST<{ data: QAItem }>('/api/v1/knowledge/sync/retry', {
    kind: 'store',
    id,
  });
  return response.data;
}

export async function bulkImportStoreKnowledge(rows: Array<Record<string, unknown>>) {
  const response = await POST<{
    data: { results: Array<{ row: number; success: boolean; id?: string; error?: string }> };
  }>('/api/v1/knowledge/store-qa/import', { rows });
  return response.data.results;
}

export const STAGE_LABELS: Record<QAStage, string> = {
  presale: '售前',
  mid: '售中',
  aftersale: '售后',
};

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}个月前` : `${Math.floor(months / 12)}年前`;
}
