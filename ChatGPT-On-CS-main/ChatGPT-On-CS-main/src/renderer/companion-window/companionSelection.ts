import {
  QianniuCompanionContext,
  ReplySuggestion,
} from '../common/services/platform/platform';
import { ProductQA } from '../common/services/knowledge/productQA';

export function selectCompanionSuggestion(
  context: QianniuCompanionContext | undefined,
  suggestions: ReplySuggestion[],
): ReplySuggestion | undefined {
  if (!context || context.state !== 'stable') return undefined;
  const exact = context.draftKey
    ? suggestions.find((item) => item.draft_key === context.draftKey)
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
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )[0];
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
