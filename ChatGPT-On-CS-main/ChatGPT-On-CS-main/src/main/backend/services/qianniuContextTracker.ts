import {
  buildConversationKey,
  buildDraftKey,
  CompanionContextSnapshot,
} from './companionContext';

export type QianniuContextObservation = Omit<
  CompanionContextSnapshot,
  'contextRevision' | 'state'
>;

export interface QianniuContextUpdate {
  changed: boolean;
  snapshot: CompanionContextSnapshot;
}

function observationIdentity(input: QianniuContextObservation): string {
  return [
    input.platformId,
    input.storeId,
    input.accountId,
    input.contactId,
    input.chatFingerprint,
    input.productId || '',
    input.incomingMessageFingerprint || '',
  ].join('\u001f');
}

function sameConversationIdentity(
  left: QianniuContextObservation,
  right: CompanionContextSnapshot,
): boolean {
  return (
    left.platformId === right.platformId &&
    left.storeId === right.storeId &&
    left.accountId === right.accountId &&
    left.contactId === right.contactId
  );
}

export class QianniuContextTracker {
  private candidateKey = '';

  private candidateCount = 0;

  private revision = 0;

  private revisionsByIdentity = new Map<string, number>();

  private current?: CompanionContextSnapshot;

  private lastObservedAt = 0;

  constructor(private requiredStableSamples = 2) {
    if (!Number.isInteger(requiredStableSamples) || requiredStableSamples < 1) {
      throw new Error('requiredStableSamples must be a positive integer');
    }
  }

  public getSnapshot(): CompanionContextSnapshot | undefined {
    return this.current ? { ...this.current } : undefined;
  }

  public observe(input: QianniuContextObservation): QianniuContextUpdate {
    const shouldReuseRecentMessages = Boolean(
      this.current &&
      sameConversationIdentity(input, this.current) &&
      !input.recentMessages?.length &&
      this.current.recentMessages?.length,
    );
    const observationInput: QianniuContextObservation = {
      ...input,
      recentMessages: shouldReuseRecentMessages
        ? this.current?.recentMessages
        : input.recentMessages,
      recentMessagesReused:
        shouldReuseRecentMessages || Boolean(input.recentMessagesReused),
    };
    buildConversationKey(observationInput);
    const observedAt = Date.parse(observationInput.capturedAt);
    if (!Number.isFinite(observedAt)) throw new Error('capturedAt is invalid');
    if (observedAt < this.lastObservedAt && this.current) {
      return { changed: false, snapshot: { ...this.current } };
    }
    this.lastObservedAt = observedAt;

    const key = observationIdentity(observationInput);
    if (key === this.candidateKey) this.candidateCount += 1;
    else {
      this.candidateKey = key;
      this.candidateCount = 1;
    }

    if (this.candidateCount < this.requiredStableSamples) {
      const switching: CompanionContextSnapshot = {
        ...observationInput,
        contextRevision: this.revisionsByIdentity.get(key) || this.revision + 1,
        state: 'switching',
      };
      return { changed: false, snapshot: switching };
    }

    const previousKey = this.current ? observationIdentity(this.current) : '';
    const changed = previousKey !== key || this.current?.state !== 'stable';
    let contextRevision = this.revisionsByIdentity.get(key);
    if (!contextRevision) {
      this.revision += 1;
      contextRevision = this.revision;
      this.revisionsByIdentity.set(key, contextRevision);
    }
    this.current = {
      ...observationInput,
      contextRevision,
      state: 'stable',
    };
    return { changed, snapshot: { ...this.current } };
  }

  public markDegraded(reasonCapturedAt = new Date().toISOString()): void {
    if (!this.current) return;
    this.current = {
      ...this.current,
      capturedAt: reasonCapturedAt,
      state: 'degraded',
    };
    this.candidateKey = '';
    this.candidateCount = 0;
  }

  /**
   * A screen fingerprint changed before OCR has finished identifying the new
   * buyer. Publish this transition immediately so stale drafts are hidden and
   * never treated as safe to deliver while the user is switching chats.
   */
  public markSwitching(
    chatFingerprint: string,
    capturedAt = new Date().toISOString(),
  ): CompanionContextSnapshot | undefined {
    if (!this.current) return undefined;
    this.current = {
      ...this.current,
      chatFingerprint,
      capturedAt,
      state: 'switching',
    };
    this.candidateKey = '';
    this.candidateCount = 0;
    return { ...this.current };
  }

  /**
   * The selected shop tab is available before the slower conversation OCR.
   * Publish the shop immediately, but clear the previous buyer so the UI can
   * never combine a newly selected shop with the old conversation.
   */
  public markStoreSwitch(
    storeId: string,
    accountId: string,
    chatFingerprint: string,
    capturedAt = new Date().toISOString(),
  ): CompanionContextSnapshot | undefined {
    if (!this.current || !storeId.trim()) return undefined;
    const nextStore = storeId.trim();
    const nextAccount = accountId.trim() || this.current.accountId;
    if (
      this.current.storeId === nextStore &&
      this.current.chatFingerprint === chatFingerprint
    ) return { ...this.current };
    this.current = {
      ...this.current,
      storeId: nextStore,
      storeName: nextStore,
      accountId: nextAccount,
      accountName: nextAccount,
      contactId: '',
      chatFingerprint,
      productId: null,
      productTitle: null,
      recentMessages: [],
      recentMessagesReused: false,
      incomingMessageFingerprint: null,
      contextRevision: this.current.contextRevision + 1,
      capturedAt,
      state: 'switching',
    };
    this.candidateKey = '';
    this.candidateCount = 0;
    return { ...this.current };
  }

  /**
   * The official QianNiu bridge is authoritative for the active buyer, but it
   * does not expose the new message body. Update the visible identity
   * immediately, clear data owned by the previous buyer, and keep the context
   * in switching state until a changed-frame recognition confirms the chat.
   */
  public markOfficialContactSwitch(
    contactId: string,
    officialIdentity: string,
    capturedAt = new Date().toISOString(),
  ): CompanionContextSnapshot | undefined {
    if (!this.current) return undefined;
    const normalizedContact = contactId.trim();
    const normalizedIdentity = officialIdentity.trim();
    if (!normalizedContact || !normalizedIdentity) return undefined;
    const observedAt = Date.parse(capturedAt);
    if (!Number.isFinite(observedAt)) throw new Error('capturedAt is invalid');

    const alreadyCurrent =
      this.current.contactId === normalizedContact &&
      this.current.state === 'stable';
    if (alreadyCurrent) return { ...this.current };

    this.lastObservedAt = Math.max(this.lastObservedAt, observedAt);
    this.current = {
      ...this.current,
      contactId: normalizedContact,
      chatFingerprint: `official:${normalizedIdentity}`,
      productId: null,
      productTitle: null,
      recentMessages: [],
      recentMessagesReused: false,
      incomingMessageFingerprint: null,
      contextRevision: this.current.contextRevision + 1,
      capturedAt,
      confidence: 1,
      state: 'switching',
    };
    this.candidateKey = '';
    this.candidateCount = 0;
    return { ...this.current };
  }

  public keys(snapshot = this.current) {
    if (!snapshot || snapshot.state !== 'stable') return undefined;
    return {
      conversationKey: buildConversationKey(snapshot),
      draftKey: buildDraftKey(snapshot),
    };
  }
}
