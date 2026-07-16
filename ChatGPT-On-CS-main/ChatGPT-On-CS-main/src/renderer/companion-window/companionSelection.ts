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
  if (!context.conversationKey) return undefined;
  return suggestions
    .filter((item) => item.conversation_key === context.conversationKey)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )[0];
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
