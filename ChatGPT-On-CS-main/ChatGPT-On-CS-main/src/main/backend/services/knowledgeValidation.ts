export class KnowledgeValidationError extends Error {
  readonly statusCode = 400;
  readonly code = 'knowledge_validation_failed';
}

const text = (value: unknown) => String(value ?? '').trim();
const list = (value: unknown, max: number) =>
  (Array.isArray(value) ? value : [])
    .map((item) => text(item))
    .filter(Boolean)
    .slice(0, max);
const platform = (value: unknown) => text(value).slice(0, 100) || 'unassigned';

function required(value: unknown, label: string, max: number): string {
  const result = text(value);
  if (!result) throw new KnowledgeValidationError(`${label}不能为空`);
  if (result.length > max)
    throw new KnowledgeValidationError(`${label}不能超过 ${max} 个字`);
  return result;
}

export function validateProductKnowledgeInput(input: any) {
  return {
    name: required(input.name, '商品名称', 300),
    platformProductId: required(input.platformProductId, '平台商品ID', 100),
    barcode: text(input.barcode).slice(0, 64) || null,
    shopId: required(input.shopId, '店铺', 100),
    platformId: platform(input.platformId),
    shopName: text(input.shopName).slice(0, 200) || text(input.shopId),
    tags: list(input.tags, 20),
    onSale: input.onSale !== false,
  };
}

export function validateStoreKnowledgeInput(input: any) {
  const stage = text(input.stage) || 'presale';
  const matchType = text(input.matchType) || 'fuzzy';
  if (!['presale', 'mid', 'aftersale'].includes(stage))
    throw new KnowledgeValidationError('无效的业务阶段');
  if (!['exact', 'fuzzy'].includes(matchType))
    throw new KnowledgeValidationError('无效的匹配方式');
  const effectiveAt = text(input.effectiveAt) ? new Date(input.effectiveAt) : null;
  const expiresAt = text(input.expiresAt) ? new Date(input.expiresAt) : null;
  if (effectiveAt && Number.isNaN(effectiveAt.getTime())) throw new KnowledgeValidationError('生效时间无效');
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new KnowledgeValidationError('失效时间无效');
  if (effectiveAt && expiresAt && expiresAt <= effectiveAt) throw new KnowledgeValidationError('失效时间必须晚于生效时间');
  return {
    question: required(input.question, '问题', 1000),
    answer: required(input.answer, '回复', 5000),
    relatedQuestions: list(input.relatedQuestions, 50),
    tags: list(input.tags, 20),
    stage: stage as 'presale' | 'mid' | 'aftersale',
    matchType: matchType as 'exact' | 'fuzzy',
    shopId: required(input.shopId, '店铺', 100),
    platformId: platform(input.platformId),
    enabled: input.enabled !== false,
    effectiveAt,
    expiresAt,
  };
}
