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
    buildConversationKey({
      ...observationInput,
      contextRevision: 0,
      state: 'stable',
    });
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

  public keys(snapshot = this.current) {
    if (!snapshot || snapshot.state !== 'stable') return undefined;
    return {
      conversationKey: buildConversationKey(snapshot),
      draftKey: buildDraftKey(snapshot),
    };
  }
}
