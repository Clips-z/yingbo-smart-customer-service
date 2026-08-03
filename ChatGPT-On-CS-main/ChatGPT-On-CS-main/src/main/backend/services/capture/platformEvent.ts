export type CaptureSource = 'official' | 'plugin' | 'ipc' | 'cdp' | 'uia' | 'ocr';
export type MessageDirection = 'incoming' | 'outgoing' | 'system';
export type MessageContentType = 'text' | 'link' | 'product' | 'image' | 'file' | 'emoji' | 'system';

export interface ConversationIdentity {
  platformId: string;
  storeId: string;
  accountId: string;
  contactId: string;
  conversationId: string;
}

export interface ProductObservation {
  productId?: string;
  title?: string;
  url?: string;
  imageUrl?: string;
  skuId?: string;
  attributes?: Record<string, string>;
}

export interface PlatformEvent {
  eventId: string;
  messageId?: string;
  identity: ConversationIdentity;
  storeName?: string;
  accountName?: string;
  contactName?: string;
  direction: MessageDirection;
  contentType: MessageContentType;
  content: string;
  product?: ProductObservation;
  sourceTimestamp?: string;
  capturedAt: string;
  source: CaptureSource;
  confidence: number;
  sourceRevision: string;
}

const sources = new Set<CaptureSource>(['official', 'plugin', 'ipc', 'cdp', 'uia', 'ocr']);

export function normalizePlatformEvent(input: PlatformEvent): PlatformEvent {
  const identity = input.identity;
  const identityFields = [identity.platformId, identity.storeId, identity.accountId, identity.contactId, identity.conversationId];
  if (identityFields.some((value) => !value?.trim())) throw new Error('Platform event identity is incomplete');
  if (!input.eventId?.trim() || !input.sourceRevision?.trim()) throw new Error('Platform event IDs are required');
  if (!sources.has(input.source)) throw new Error(`Unsupported capture source: ${String(input.source)}`);
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) {
    throw new Error('Platform event confidence must be between 0 and 1');
  }
  return {
    ...input,
    content: input.content.trim(),
    capturedAt: input.capturedAt || new Date().toISOString(),
  };
}
