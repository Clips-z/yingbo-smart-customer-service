import crypto from 'crypto';

export type CompanionContextState =
  | 'switching'
  | 'stable'
  | 'degraded'
  | 'disconnected';

export interface CompanionContextSnapshot {
  platformId: string;
  storeId: string;
  accountId: string;
  contactId: string;
  chatFingerprint: string;
  productId?: string | null;
  productTitle?: string | null;
  storeName?: string | null;
  accountName?: string | null;
  recentMessages?: Array<{
    direction: 'incoming' | 'outgoing';
    content: string;
  }>;
  recentMessagesReused?: boolean;
  incomingMessageFingerprint?: string | null;
  contextRevision: number;
  capturedAt: string;
  confidence: number;
  state: CompanionContextState;
}

export type ConversationDraftState =
  | 'draft'
  | 'prepared'
  | 'sent'
  | 'failed'
  | 'cancelled'
  | 'expired';

export interface ConversationDraftBinding {
  conversationKey: string;
  draftKey: string;
  platformId: string;
  storeId: string;
  accountId: string;
  contactId: string;
  chatFingerprint: string;
  productId?: string | null;
  incomingMessageFingerprint?: string | null;
  contextRevision: number;
  state: ConversationDraftState;
}

export type ContextMismatchField =
  | 'platformId'
  | 'storeId'
  | 'accountId'
  | 'contactId'
  | 'chatFingerprint'
  | 'productId'
  | 'incomingMessageFingerprint'
  | 'contextRevision';

export interface ContextComparison {
  matchesConversation: boolean;
  matchesDraftRevision: boolean;
  mismatches: ContextMismatchField[];
}

export type DraftRestorationDecision =
  | { action: 'restore-editable'; reason: 'unchanged' | 'previous-failure' }
  | { action: 'restore-history'; reason: 'already-sent' | 'closed-draft' }
  | {
      action: 'archive-and-regenerate';
      reason: 'new-message' | 'product-changed';
    }
  | { action: 'hide'; reason: 'different-conversation' }
  | { action: 'hold'; reason: 'context-not-stable' };

type RequiredIdentityField = 'platformId' | 'storeId' | 'accountId' | 'contactId';

const REQUIRED_IDENTITY_FIELDS: RequiredIdentityField[] = [
  'platformId',
  'storeId',
  'accountId',
  'contactId',
];

function normalized(value: string | null | undefined): string {
  return value?.trim() || '';
}

function digest(parts: string[]): string {
  return crypto.createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

export function buildConversationKey(
  context: Pick<
    CompanionContextSnapshot,
    'platformId' | 'storeId' | 'accountId' | 'contactId'
  >,
): string {
  for (const field of REQUIRED_IDENTITY_FIELDS) {
    if (!normalized(context[field] as string)) {
      throw new Error(`Cannot build conversation key without ${field}`);
    }
  }

  return digest([
    normalized(context.platformId),
    normalized(context.storeId),
    normalized(context.accountId),
    normalized(context.contactId),
  ]);
}

export function buildDraftKey(context: CompanionContextSnapshot): string {
  return digest([
    buildConversationKey(context),
    normalized(context.productId) || '-',
    normalized(context.incomingMessageFingerprint) || '-',
  ]);
}

export function compareContext(
  draft: ConversationDraftBinding,
  live: CompanionContextSnapshot,
): ContextComparison {
  const mismatches: ContextMismatchField[] = [];
  const conversationFields: ContextMismatchField[] = [
    'platformId',
    'storeId',
    'accountId',
    'contactId',
    'chatFingerprint',
  ];

  conversationFields.forEach((field) => {
    if (normalized(draft[field] as string) !== normalized(live[field] as string)) {
      mismatches.push(field);
    }
  });

  if (normalized(draft.productId) !== normalized(live.productId)) {
    mismatches.push('productId');
  }
  if (
    normalized(draft.incomingMessageFingerprint) !==
    normalized(live.incomingMessageFingerprint)
  ) {
    mismatches.push('incomingMessageFingerprint');
  }
  if (draft.contextRevision !== live.contextRevision) {
    mismatches.push('contextRevision');
  }

  return {
    matchesConversation: !conversationFields.some((field) =>
      mismatches.includes(field),
    ),
    matchesDraftRevision: mismatches.length === 0,
    mismatches,
  };
}

export function decideDraftRestoration(
  draft: ConversationDraftBinding,
  live: CompanionContextSnapshot,
): DraftRestorationDecision {
  if (live.state !== 'stable') {
    return { action: 'hold', reason: 'context-not-stable' };
  }

  const comparison = compareContext(draft, live);
  if (!comparison.matchesConversation) {
    return { action: 'hide', reason: 'different-conversation' };
  }
  if (comparison.mismatches.includes('incomingMessageFingerprint')) {
    return { action: 'archive-and-regenerate', reason: 'new-message' };
  }
  if (comparison.mismatches.includes('productId')) {
    return { action: 'archive-and-regenerate', reason: 'product-changed' };
  }
  if (draft.state === 'sent') {
    return { action: 'restore-history', reason: 'already-sent' };
  }
  if (draft.state === 'cancelled' || draft.state === 'expired') {
    return { action: 'restore-history', reason: 'closed-draft' };
  }
  if (draft.state === 'failed') {
    return { action: 'restore-editable', reason: 'previous-failure' };
  }

  return { action: 'restore-editable', reason: 'unchanged' };
}
