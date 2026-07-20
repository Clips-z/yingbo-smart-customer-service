import {
  buildConversationKey,
  buildDraftKey,
  CompanionContextSnapshot,
} from './companionContext';
import {
  QianniuContextObservation,
  QianniuContextTracker,
  QianniuContextUpdate,
} from './qianniuContextTracker';

export type SupportedCompanionPlatform =
  | 'win_qianniu'
  | 'win_wechat'
  | 'win_wecom';

export class CompanionContextRegistry {
  private trackers = new Map<string, QianniuContextTracker>();

  private history = new Map<string, CompanionContextSnapshot>();

  constructor(private requiredStableSamples = 2) {}

  public observe(input: QianniuContextObservation): QianniuContextUpdate {
    let tracker = this.trackers.get(input.platformId);
    if (!tracker) {
      tracker = new QianniuContextTracker(this.requiredStableSamples);
      this.trackers.set(input.platformId, tracker);
    }
    const cached = this.history.get(this.historyKey(input));
    const shouldRestore = Boolean(
      !input.recentMessages?.length && cached?.recentMessages?.length,
    );
    const update = tracker.observe({
      ...input,
      recentMessages: shouldRestore
        ? cached?.recentMessages
        : input.recentMessages,
      recentMessagesReused: shouldRestore || input.recentMessagesReused,
    });
    if (update.snapshot.state === 'stable') {
      this.history.set(this.historyKey(update.snapshot), update.snapshot);
    }
    return update;
  }

  public get(platformId: string): CompanionContextSnapshot | undefined {
    return this.trackers.get(platformId)?.getSnapshot();
  }

  public bindingFor(platformId: string, contactId: string) {
    const snapshot = this.get(platformId);
    if (
      !snapshot ||
      snapshot.state !== 'stable' ||
      snapshot.contactId !== contactId
    ) {
      return undefined;
    }
    return {
      snapshot,
      conversationKey: buildConversationKey(snapshot),
      draftKey: buildDraftKey(snapshot),
    };
  }

  public matchesLiveConversation(args: {
    platformId: string;
    contactId: string;
    conversationKey?: string | null;
    contextRevision?: number | null;
  }): boolean {
    const binding = this.bindingFor(args.platformId, args.contactId);
    if (!binding) return false;
    if (
      args.conversationKey &&
      binding.conversationKey !== args.conversationKey
    ) {
      return false;
    }
    if (
      args.contextRevision !== undefined &&
      args.contextRevision !== null &&
      binding.snapshot.contextRevision !== args.contextRevision
    ) {
      return false;
    }
    return true;
  }

  private historyKey(
    context: Pick<
      CompanionContextSnapshot,
      'platformId' | 'storeId' | 'accountId' | 'contactId'
    >,
  ): string {
    return [
      context.platformId,
      context.storeId,
      context.accountId,
      context.contactId,
    ].join('\u001f');
  }
}
