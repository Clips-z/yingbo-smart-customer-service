import { ConversationIdentity, PlatformEvent } from './platformEvent';

export interface CaptureCapabilities {
  readable: boolean;
  canObserveConversationSwitch: boolean;
  canObserveMessages: boolean;
  canReadProducts: boolean;
  canFocusConversation: boolean;
  canFillDraft: boolean;
  canSendDraft: boolean;
  source: string;
  reason?: string;
}

export interface ConversationTarget {
  platformId: string;
  storeId: string;
  accountId: string;
  contactId: string;
  conversationId?: string;
}

export interface AdapterActionResult {
  ok: boolean;
  liveIdentity?: ConversationIdentity;
  reason?: string;
  elapsedMs: number;
}

export interface PlatformAdapter {
  readonly id: string;
  probe(): Promise<CaptureCapabilities>;
  start(onEvent: (event: PlatformEvent) => void): Promise<void>;
  stop(): Promise<void>;
  getCurrentConversation(): Promise<ConversationIdentity | undefined>;
  focusConversation(target: ConversationTarget): Promise<AdapterActionResult>;
  fillDraft(content: string): Promise<AdapterActionResult>;
  sendDraft(): Promise<AdapterActionResult>;
}
