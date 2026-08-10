import { Op, WhereOptions } from 'sequelize';
import { ReplySuggestion } from '../entities/replySuggestion';
import { CompanionContextSnapshot } from './companionContext';

export interface ReplyDirectionEvidence {
  context: CompanionContextSnapshot;
  latestDirection?: 'incoming' | 'outgoing' | 'unknown';
  outgoingContent?: string;
}

function normalized(value?: string | null): string {
  return String(value || '').trim();
}

function exactConversationWhere(
  context: CompanionContextSnapshot,
): WhereOptions {
  return {
    platform_id: normalized(context.platformId),
    store_id: normalized(context.storeId),
    account_id: normalized(context.accountId),
    contact_id: normalized(context.contactId),
  };
}

/**
 * Only close pending replies when the collector has a stable, exact identity
 * and positive evidence that the newest message was sent by the operator.
 */
export function shouldResolvePendingReplies(
  evidence: ReplyDirectionEvidence,
): boolean {
  const { context } = evidence;
  if (
    context.state !== 'stable' ||
    context.recentMessagesReused ||
    context.confidence < 0.75 ||
    !normalized(context.platformId) ||
    !normalized(context.storeId) ||
    !normalized(context.accountId) ||
    !normalized(context.contactId)
  ) {
    return false;
  }
  const messages = context.recentMessages || [];
  const latestDirection =
    evidence.latestDirection || messages[messages.length - 1]?.direction;
  return latestDirection === 'outgoing';
}

export async function resolvePendingReplies(
  evidence: ReplyDirectionEvidence,
): Promise<number> {
  if (!shouldResolvePendingReplies(evidence)) return 0;
  const outgoingContent = normalized(evidence.outgoingContent).slice(0, 300);
  const [count] = await ReplySuggestion.update(
    {
      status: 'sent',
      ...(outgoingContent ? { final_reply_content: outgoingContent } : {}),
      updated_at: new Date(),
    },
    {
      where: {
        ...exactConversationWhere(evidence.context),
        status: { [Op.in]: ['pending', 'failed', 'prepared'] },
      },
    },
  );
  return count;
}

/** Keep one actionable row per exact conversation when a newer question wins. */
export async function closeSupersededPendingReplies(input: {
  context: CompanionContextSnapshot;
  keepMessageKey?: string | null;
}): Promise<number> {
  const { context } = input;
  if (
    context.state !== 'stable' ||
    context.confidence < 0.75 ||
    !normalized(context.platformId) ||
    !normalized(context.storeId) ||
    !normalized(context.accountId) ||
    !normalized(context.contactId)
  ) {
    return 0;
  }
  const [count] = await ReplySuggestion.update(
    { status: 'cancelled', updated_at: new Date() },
    {
      where: {
        ...exactConversationWhere(context),
        status: { [Op.in]: ['pending', 'failed', 'prepared'] },
        ...(input.keepMessageKey
          ? { message_key: { [Op.ne]: input.keepMessageKey } }
          : {}),
      },
    },
  );
  return count;
}

let lastDuplicateSweepAt = 0;

/**
 * Repair historical accumulation without guessing whether a conversation was
 * answered: keep its newest actionable row and close only older exact copies.
 */
export async function collapseDuplicatePendingReplies(
  force = false,
): Promise<number> {
  const now = Date.now();
  if (!force && now - lastDuplicateSweepAt < 30_000) return 0;
  lastDuplicateSweepAt = now;
  const rows = (await ReplySuggestion.findAll({
    where: { status: { [Op.in]: ['pending', 'failed'] } },
    order: [['created_at', 'DESC']],
    limit: 500,
    raw: true,
  })) as unknown as Array<{
    id: number;
    platform_id: string | null;
    store_id: string | null;
    account_id: string | null;
    contact_id: string | null;
  }>;
  const seen = new Set<string>();
  const duplicateIds: number[] = [];
  rows.forEach((row) => {
    const parts = [
      row.platform_id,
      row.store_id,
      row.account_id,
      row.contact_id,
    ].map(normalized);
    if (parts.some((part) => !part)) return;
    const key = parts.join('\u001f').toLowerCase();
    if (seen.has(key)) duplicateIds.push(row.id);
    else seen.add(key);
  });
  if (!duplicateIds.length) return 0;
  const [count] = await ReplySuggestion.update(
    { status: 'cancelled', updated_at: new Date() },
    { where: { id: { [Op.in]: duplicateIds } } },
  );
  return count;
}
