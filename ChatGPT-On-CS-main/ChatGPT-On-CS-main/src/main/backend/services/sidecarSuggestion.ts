import { ReplySuggestionStatus } from '../entities/replySuggestion';

export type SidecarSuggestionInput = {
  platformId?: unknown;
  platformName: string;
  sender?: unknown;
  contactId?: unknown;
  content?: unknown;
  replyText?: unknown;
  storeId?: unknown;
  storeName?: unknown;
  accountId?: unknown;
  instanceId?: unknown;
};

const scalarText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return scalarText(record.text ?? record.content ?? record.message ?? '');
  }
  return '';
};

export function buildSidecarSuggestion(input: SidecarSuggestionInput) {
  const platformId = scalarText(input.platformId);
  const contactId = scalarText(input.contactId) || scalarText(input.sender);
  const incomingContent = scalarText(input.content);
  const replyContent = scalarText(input.replyText);
  const storeId = scalarText(input.storeId);
  const accountId =
    scalarText(input.accountId) || scalarText(input.instanceId);

  if (!contactId) throw new Error('缺少客户 ID');
  if (!incomingContent) throw new Error('缺少客户消息');
  if (!replyContent) throw new Error('缺少回复内容');

  return {
    platform_id: platformId,
    store: scalarText(input.storeName) || storeId || input.platformName,
    sender: contactId,
    incoming_content: incomingContent,
    reply_content: replyContent,
    store_id: storeId || null,
    account_id: accountId || null,
    contact_id: contactId,
    status: 'pending' as ReplySuggestionStatus,
    created_at: new Date(),
    updated_at: new Date(),
  };
}
