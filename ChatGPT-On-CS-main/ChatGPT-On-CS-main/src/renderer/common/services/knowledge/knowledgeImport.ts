export interface ProductImportRow {
  name: string;
  platformProductId: string;
  barcode?: string;
  shopId: string;
  shopName?: string;
  onSale: boolean;
}

export interface ImportPreview {
  valid: ProductImportRow[];
  invalid: Array<{ row: number; error: string }>;
}

export interface StoreImportRow {
  question: string;
  answer: string;
  relatedQuestions: string[];
  tags: string[];
  stage: 'presale' | 'mid' | 'aftersale';
  matchType: 'exact' | 'fuzzy';
  shopId: string;
  enabled: boolean;
}

export interface StoreImportPreview {
  valid: StoreImportRow[];
  invalid: Array<{ row: number; error: string }>;
}

const aliases: Record<string, keyof ProductImportRow> = {
  '商品名称': 'name', name: 'name',
  '平台商品id': 'platformProductId', platformproductid: 'platformProductId',
  '商品条码': 'barcode', barcode: 'barcode',
  '店铺id': 'shopId', shopid: 'shopId',
  '店铺名称': 'shopName', shopname: 'shopName',
  '上架状态': 'onSale', onsale: 'onSale',
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

export function previewProductRows(rows: string[][]): ImportPreview {
  if (rows.length === 0) return { valid: [], invalid: [{ row: 1, error: '文件为空' }] };
  const headers = rows[0].map((header) => aliases[header.trim().toLowerCase()]);
  const valid: ProductImportRow[] = [];
  const invalid: Array<{ row: number; error: string }> = [];
  rows.slice(1).forEach((cells, index) => {
    const raw: any = {};
    headers.forEach((key, column) => { if (key) raw[key] = cells[column]?.trim() || ''; });
    if (!raw.name || !raw.platformProductId || !raw.shopId) {
      invalid.push({ row: index + 2, error: '缺少商品名称、平台商品ID或店铺ID' });
      return;
    }
    valid.push({
      name: raw.name,
      platformProductId: raw.platformProductId,
      barcode: raw.barcode || undefined,
      shopId: raw.shopId,
      shopName: raw.shopName || undefined,
      onSale: !['0', 'false', '否', '下架'].includes(String(raw.onSale).toLowerCase()),
    });
  });
  return { valid, invalid };
}

export async function parseProductImport(file: File): Promise<ImportPreview> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = (await file.text()).replace(/^\uFEFF/, '');
    return previewProductRows(text.split(/\r?\n/).filter(Boolean).map(parseCsvLine));
  }
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return { valid: [], invalid: [{ row: 1, error: '工作表为空' }] };
  const rows: string[][] = [];
  sheet.eachRow((row) => rows.push((row.values as any[]).slice(1).map((value) => String(value ?? ''))));
  return previewProductRows(rows);
}

export function previewStoreRows(rows: string[][]): StoreImportPreview {
  if (!rows.length) return { valid: [], invalid: [{ row: 1, error: '文件为空' }] };
  const header = rows[0].map((value) => value.trim().toLowerCase());
  const column = (...names: string[]) => header.findIndex((value) => names.includes(value));
  const indexes = {
    question: column('问题', 'question'), answer: column('回复', '答案', 'answer'),
    related: column('相似问法', 'relatedquestions'), tags: column('标签', 'tags'),
    stage: column('阶段', 'stage'), match: column('匹配方式', 'matchtype'), shop: column('店铺id', 'shopid'),
  };
  const valid: StoreImportRow[] = [];
  const invalid: Array<{ row: number; error: string }> = [];
  rows.slice(1).forEach((cells, index) => {
    const get = (i: number) => (i >= 0 ? cells[i]?.trim() || '' : '');
    const question = get(indexes.question);
    const answer = get(indexes.answer);
    const shopId = get(indexes.shop);
    if (!question || !answer || !shopId) {
      invalid.push({ row: index + 2, error: '缺少问题、回复或店铺ID' });
      return;
    }
    const stageValue = get(indexes.stage);
    const stageMap: Record<string, StoreImportRow['stage']> = { '售前': 'presale', '售中': 'mid', '售后': 'aftersale', presale: 'presale', mid: 'mid', aftersale: 'aftersale' };
    valid.push({
      question, answer, shopId,
      relatedQuestions: get(indexes.related).split(/[|\n]/).map((v) => v.trim()).filter(Boolean),
      tags: get(indexes.tags).split(/[|,，、]/).map((v) => v.trim()).filter(Boolean),
      stage: stageMap[stageValue] || 'presale',
      matchType: ['exact', '精确'].includes(get(indexes.match)) ? 'exact' : 'fuzzy',
      enabled: true,
    });
  });
  return { valid, invalid };
}

export async function parseStoreImport(file: File): Promise<StoreImportPreview> {
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = (await file.text()).replace(/^\uFEFF/, '');
    return previewStoreRows(text.split(/\r?\n/).filter(Boolean).map(parseCsvLine));
  }
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const rows: string[][] = [];
  workbook.worksheets[0]?.eachRow((row) => rows.push((row.values as any[]).slice(1).map((value) => String(value ?? ''))));
  return previewStoreRows(rows);
}
