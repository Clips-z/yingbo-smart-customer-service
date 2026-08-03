import crypto from 'crypto';
import { PlatformAdapter, CaptureCapabilities, ConversationTarget, AdapterActionResult } from '../../../services/capture/platformAdapter';
import { ConversationIdentity, PlatformEvent, ProductObservation, normalizePlatformEvent } from '../../../services/capture/platformEvent';

export type QianniuOcrSnapshot = {
  chat_fingerprint: string;
  candidate: {
    sender: string;
    content: string;
    confidence: number;
    latest_direction: 'incoming' | 'outgoing' | 'unknown';
  };
};

export interface QianniuOcrEventContext {
  storeId: string;
  accountId: string;
  storeName?: string;
  accountName?: string;
  product?: ProductObservation;
}

/**
 * Adapts the existing resident OCR worker output. It deliberately does not
 * start a second capture loop and does not claim write capabilities.
 */
export class QianniuOcrAdapter implements PlatformAdapter {
  public readonly id = 'qianniu-ocr';

  public async probe(): Promise<CaptureCapabilities> {
    return {
      readable: true,
      canObserveConversationSwitch: true,
      canObserveMessages: true,
      canReadProducts: false,
      canFocusConversation: false,
      canFillDraft: false,
      canSendDraft: false,
      source: 'ocr',
      reason: 'Uses the existing resident QianniuCaptureWorker snapshot stream',
    };
  }

  public async start(): Promise<void> {
    // The owner service already starts QianniuCaptureWorker. No second loop.
  }

  public async stop(): Promise<void> {
    // The owner service owns worker shutdown.
  }

  public async getCurrentConversation(): Promise<undefined> {
    return undefined;
  }

  public async focusConversation(_target: ConversationTarget): Promise<AdapterActionResult> {
    return { ok: false, reason: 'unsupported', elapsedMs: 0 };
  }

  public async fillDraft(_content: string): Promise<AdapterActionResult> {
    return { ok: false, reason: 'unsupported', elapsedMs: 0 };
  }

  public async sendDraft(): Promise<AdapterActionResult> {
    return { ok: false, reason: 'unsupported', elapsedMs: 0 };
  }

  public toEvent(snapshot: QianniuOcrSnapshot, context: QianniuOcrEventContext): PlatformEvent | undefined {
    const content = snapshot.candidate?.content?.trim();
    const contactId = snapshot.candidate?.sender?.trim();
    const conversationId = snapshot.chat_fingerprint?.trim();
    if (!content || !contactId || !conversationId) return undefined;
    const identity: ConversationIdentity = {
      platformId: 'win_qianniu',
      storeId: context.storeId,
      accountId: context.accountId,
      contactId,
      conversationId,
    };
    const messageId = crypto
      .createHash('sha256')
      .update(`${conversationId}|${snapshot.candidate.latest_direction}|${content}`)
      .digest('hex');
    return normalizePlatformEvent({
      eventId: `ocr:${messageId}`,
      messageId,
      identity,
      storeName: context.storeName,
      accountName: context.accountName,
      direction: snapshot.candidate.latest_direction === 'outgoing' ? 'outgoing' : 'incoming',
      contentType: /^https?:\/\//i.test(content) ? 'link' : 'text',
      content,
      product: context.product,
      capturedAt: new Date().toISOString(),
      source: 'ocr',
      confidence: Math.max(0, Math.min(1, snapshot.candidate.confidence || 0)),
      sourceRevision: snapshot.chat_fingerprint,
    });
  }
}
