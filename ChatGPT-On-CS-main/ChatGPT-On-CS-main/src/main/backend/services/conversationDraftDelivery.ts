import { assertDeliveryContext } from './deliveryContextGuard';
import { CompanionContextSnapshot, ConversationDraftBinding } from './companionContext';

export type DraftDeliveryAction = 'fill' | 'send';

export function prepareDraftDelivery(input: {
  content: string;
  draft: ConversationDraftBinding;
  live?: CompanionContextSnapshot;
  action: DraftDeliveryAction;
}): string {
  const content = input.content.trim().slice(0, 300);
  if (!content) throw new Error('回复内容不能为空');
  assertDeliveryContext({ draft: input.draft, live: input.live });
  return content;
}
