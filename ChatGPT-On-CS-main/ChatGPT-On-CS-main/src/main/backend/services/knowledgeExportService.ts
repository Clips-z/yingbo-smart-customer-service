export type KnowledgeExportFormat = 'csv' | 'json';

export interface KnowledgeExportRecord {
  id: string;
  kind: 'store' | 'product';
  question?: string;
  answer?: string;
  relatedQuestions?: string[];
  name?: string;
  platformProductId?: string;
  barcode?: string;
  shopName?: string;
  tags?: string[];
  shopId: string;
  stage?: string;
  matchType?: string;
  enabled: boolean;
  syncStatus: string;
  syncError?: string;
  createdAt?: string;
  updatedAt: string;
}

const columns: Array<{ label: string; value: (item: KnowledgeExportRecord) => unknown }> = [
  { label: '类型', value: (item) => item.kind === 'store' ? '店铺问答' : '商品知识' },
  { label: 'ID', value: (item) => item.id },
  { label: '问题', value: (item) => item.question },
  { label: '回复', value: (item) => item.answer },
  { label: '相似问法', value: (item) => item.relatedQuestions },
  { label: '商品名称', value: (item) => item.name },
  { label: '平台商品ID', value: (item) => item.platformProductId },
  { label: '条码', value: (item) => item.barcode },
  { label: '店铺ID', value: (item) => item.shopId },
  { label: '店铺名称', value: (item) => item.shopName },
  { label: '阶段', value: (item) => item.stage },
  { label: '匹配方式', value: (item) => item.matchType },
  { label: '标签', value: (item) => item.tags },
  { label: '启用', value: (item) => item.enabled },
  { label: '同步状态', value: (item) => item.syncStatus },
  { label: '同步错误', value: (item) => item.syncError },
  { label: '创建时间', value: (item) => item.createdAt },
  { label: '更新时间', value: (item) => item.updatedAt },
];

function csvCell(value: unknown): string {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function serializeKnowledgeExport(
  format: KnowledgeExportFormat,
  records: KnowledgeExportRecord[],
) {
  if (format === 'json') {
    return {
      contentType: 'application/json; charset=utf-8',
      extension: 'json',
      body: JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        count: records.length,
        items: records,
      }, null, 2),
    };
  }
  const rows = [
    columns.map((column) => csvCell(column.label)).join(','),
    ...records.map((item) => columns.map((column) => csvCell(column.value(item))).join(',')),
  ];
  return {
    contentType: 'text/csv; charset=utf-8',
    extension: 'csv',
    body: `\uFEFF${rows.join('\r\n')}`,
  };
}
