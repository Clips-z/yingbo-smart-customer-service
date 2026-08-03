import { Op } from 'sequelize';
import { ReplySuggestion } from '../entities/replySuggestion';
import { buildConversationKey, CompanionContextSnapshot } from './companionContext';

export type TimelineReplyState = 'unanswered' | 'suggested' | 'filled' | 'sent' | 'failed' | 'dismissed';

export interface ConversationTimelineEntry {
  id: number;
  platformId: string;
  storeId: string | null;
  accountId: string | null;
  contactId: string;
  question: string;
  answer: string;
  finalAnswer: string | null;
  state: TimelineReplyState;
  productId: string | null;
  productTitle: string | null;
  incomingMessageFingerprint: string | null;
  contextRevision: number | null;
  createdAt: string;
  updatedAt: string;
}

type SuggestionShape = Pick<ReplySuggestion,
  | 'id' | 'platform_id' | 'store_id' | 'account_id' | 'contact_id' | 'sender'
  | 'incoming_content' | 'reply_content' | 'final_reply_content' | 'status'
  | 'draft_state' | 'product_id' | 'product_title' | 'incoming_message_fingerprint'
  | 'context_revision' | 'created_at' | 'updated_at'
>;

export function timelineState(suggestion: Pick<ReplySuggestion, 'status' | 'draft_state'>): TimelineReplyState {
  if (suggestion.status === 'sent') return 'sent';
  if (suggestion.status === 'failed') return 'failed';
  if (suggestion.status === 'dismissed' || suggestion.status === 'cancelled') return 'dismissed';
  if (suggestion.draft_state === 'filled' || suggestion.status === 'prepared' || suggestion.status === 'sending') return 'filled';
  return suggestion.status === 'pending' || suggestion.status === 'preparing' ? 'suggested' : 'unanswered';
}

export function toTimelineEntry(suggestion: SuggestionShape): ConversationTimelineEntry {
  return {
    id: suggestion.id,
    platformId: suggestion.platform_id,
    storeId: suggestion.store_id,
    accountId: suggestion.account_id,
    contactId: suggestion.contact_id || suggestion.sender,
    question: suggestion.incoming_content,
    answer: suggestion.reply_content,
    finalAnswer: suggestion.final_reply_content,
    state: timelineState(suggestion),
    productId: suggestion.product_id,
    productTitle: suggestion.product_title,
    incomingMessageFingerprint: suggestion.incoming_message_fingerprint,
    contextRevision: suggestion.context_revision,
    createdAt: suggestion.created_at.toISOString(),
    updatedAt: suggestion.updated_at.toISOString(),
  };
}

export class ConversationTimelineService {
  public async listForContext(context: CompanionContextSnapshot, limit = 50): Promise<ConversationTimelineEntry[]> {
    const conversationKey = buildConversationKey(context);
    const where = {
      [Op.or]: [
        { conversation_key: conversationKey },
        {
          platform_id: context.platformId,
          store_id: context.storeId,
          account_id: context.accountId,
          contact_id: context.contactId,
        },
      ],
    };
    const rows = await ReplySuggestion.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: Math.min(100, Math.max(1, limit)),
    });
    return rows.map((row) => toTimelineEntry(row)).reverse();
  }
}
