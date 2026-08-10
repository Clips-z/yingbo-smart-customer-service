import {
  QianniuCompanionContext,
  ReplySuggestion,
} from '../common/services/platform/platform';
import { ProductQA } from '../common/services/knowledge/productQA';

export function companionContactLabel(
  platformId: string,
  value?: string | null,
): string {
  const text = String(value || '').trim();
  if (!text || /^win_[a-z0-9_]+$/i.test(text)) return '';
  if (platformId === 'win_qianniu') {
    const compact = text.replace(/\s+/g, '');
    return /^[A-Za-z0-9_.@-]{3,64}$/.test(compact) ? compact : '';
  }
  return text.length >= 2 && text.length <= 80 ? text : '';
}

export function selectCompanionSuggestion(
  context: QianniuCompanionContext | undefined,
  suggestions: ReplySuggestion[],
  currentQuestion?: string,
): ReplySuggestion | undefined {
  if (!context || context.state !== 'stable') {
    return undefined;
  }
  const normalizedCurrentQuestion = normalizeQuestion(currentQuestion);
  const matchesQuestion = (item: ReplySuggestion) =>
    !normalizedCurrentQuestion ||
    normalizeQuestion(item.incoming_content) === normalizedCurrentQuestion;
  const exact = context.draftKey
    ? suggestions.find(
        (item) => item.draft_key === context.draftKey && matchesQuestion(item),
      )
    : undefined;
  if (exact) return exact;
  const matchesIdentity = (item: ReplySuggestion) =>
    item.platform_id === context.platformId &&
    item.store_id === context.storeId &&
    item.account_id === context.accountId &&
    item.contact_id === context.contactId;
  return suggestions
    .filter((item) => item.conversation_key === context.conversationKey)
    .concat(
      suggestions.filter(
        (item) =>
          item.conversation_key !== context.conversationKey &&
          matchesIdentity(item),
      ),
    )
    .filter(matchesQuestion)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )[0];
}

export function normalizeQuestion(value?: string | null): string {
  return String(value || '')
    .replace(/\s+/gu, '')
    .replace(/[，。！？、,.!?;；:：'"“”‘’()[\]（）]/gu, '')
    .toLowerCase();
}

type CollectorHealthLike = {
  state?: string;
  phase?: string;
  lastSuccessAt?: string;
};

export function isCompanionCollectorReady(
  platformId: string,
  health?: CollectorHealthLike,
  now = Date.now(),
): boolean {
  if (health?.state !== 'running') return false;
  if (platformId !== 'win_qianniu') return true;
  if (health.phase === 'ready' || health.phase === 'scanning') return true;

  const lastSuccessAt = health.lastSuccessAt
    ? Date.parse(health.lastSuccessAt)
    : Number.NaN;
  return Number.isFinite(lastSuccessAt) && now - lastSuccessAt < 15_000;
}

export function selectCompanionHistory(
  context: QianniuCompanionContext | undefined,
  suggestions: ReplySuggestion[],
  activeId?: number,
): ReplySuggestion[] {
  if (!context || context.state !== 'stable') return [];
  return suggestions
    .filter(
      (item) =>
        item.id !== activeId &&
        (item.conversation_key === context.conversationKey ||
          (item.platform_id === context.platformId &&
            item.store_id === context.storeId &&
            item.account_id === context.accountId &&
            item.contact_id === context.contactId)),
    )
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )
    .slice(0, 3);
}

export function selectCompanionProduct(
  context: QianniuCompanionContext | undefined,
  products: ProductQA[],
): ProductQA | undefined {
  if (!context?.productId) return undefined;
  const candidates = products.filter(
    (product) => product.platformProductId === context.productId,
  );
  return (
    candidates.find(
      (product) =>
        product.shopId === context.storeId ||
        product.shopName === context.storeName ||
        product.shopName === context.storeId,
    ) || candidates[0]
  );
}
