import { ConversationIdentity } from './platformEvent';

export function conversationKey(identity: ConversationIdentity): string {
  const parts = [identity.platformId, identity.storeId, identity.accountId, identity.contactId, identity.conversationId];
  if (parts.some((part) => !part?.trim())) throw new Error('Cannot build a conversation key from incomplete identity');
  return parts.map((part) => encodeURIComponent(part.trim())).join(':');
}

export function sameConversation(left: ConversationIdentity, right: ConversationIdentity): boolean {
  return conversationKey(left) === conversationKey(right);
}
