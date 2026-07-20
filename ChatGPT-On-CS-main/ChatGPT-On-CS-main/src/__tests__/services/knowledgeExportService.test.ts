import {
  serializeKnowledgeExport,
  KnowledgeExportRecord,
} from '../../main/backend/services/knowledgeExportService';

describe('knowledgeExportService', () => {
  const record: KnowledgeExportRecord = {
    id: 'qa-1',
    kind: 'store',
    question: '这件衣服会“缩水”吗？',
    answer: '请冷水洗涤，\n正常情况下不会缩水。',
    relatedQuestions: ['可以机洗吗？'],
    tags: ['洗护', '售前'],
    shopId: 'shop-1',
    stage: 'presale',
    enabled: true,
    syncStatus: 'synced',
    updatedAt: '2026-07-20T00:00:00.000Z',
  };

  it('exports UTF-8 CSV with a BOM and safely quoted multiline content', () => {
    const result = serializeKnowledgeExport('csv', [record]);
    expect(result.contentType).toContain('text/csv');
    expect(result.body.startsWith('\uFEFF')).toBe(true);
    expect(result.body).toContain('问题,回复');
    expect(result.body).toContain('"请冷水洗涤，\n正常情况下不会缩水。"');
    expect(result.body).toContain('可以机洗吗？');
  });

  it('exports readable JSON without dropping full knowledge content', () => {
    const result = serializeKnowledgeExport('json', [record]);
    const parsed = JSON.parse(result.body);
    expect(parsed.version).toBe(1);
    expect(parsed.count).toBe(1);
    expect(parsed.items[0]).toMatchObject({
      question: record.question,
      answer: record.answer,
      relatedQuestions: record.relatedQuestions,
    });
  });
});
