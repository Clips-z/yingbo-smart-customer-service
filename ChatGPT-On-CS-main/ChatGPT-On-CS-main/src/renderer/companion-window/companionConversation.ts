export interface CompanionRecentMessage {
  direction: 'incoming' | 'outgoing';
  content: string;
}

export interface CompanionTimelineItem {
  id: number;
  contactId?: string;
  question: string;
  answer: string;
  finalAnswer?: string | null;
  state?: string;
}

export type CompanionConversationItem =
  | {
      key: string;
      kind: 'message';
      direction: 'incoming' | 'outgoing';
      content: string;
    }
  | {
      key: string;
      kind: 'pair';
      contactId?: string;
      question: string;
      answer: string;
      state?: string;
    };

function normalized(value: string): string {
  return value.replace(/\s+/gu, '').replace(/[，。！？、,.!?;；:：'"“”‘’()[\]（）]/gu, '').toLowerCase();
}

export function isReadableConversationText(value: string): boolean {
  const text = value.replace(/\s+/gu, ' ').trim();
  if (!text || text.includes('\uFFFD') || /\[object Object\]/iu.test(text)) return false;
  const meaningful = text.match(/[\p{Script=Han}A-Za-z0-9]/gu) || [];
  if (meaningful.length < 2) return false;
  const replacementLike = text.match(/[?？�]/gu)?.length || 0;
  return replacementLike <= Math.max(1, Math.floor(text.length / 3));
}

/**
 * The live message stream is closer to what the buyer actually wrote than a
 * persisted OCR suggestion. Prefer it completely; only fall back to stored
 * Q/A pairs when the collector has no readable live messages.
 */
export function buildCompanionConversation(
  recentMessages: CompanionRecentMessage[] | null | undefined,
  timeline: CompanionTimelineItem[] | null | undefined,
  currentContactId?: string,
  limit = 5,
): CompanionConversationItem[] {
  const safeLimit = Math.min(5, Math.max(1, limit));
  const seen = new Set<string>();
  const messages = (recentMessages || []).reduce<CompanionConversationItem[]>(
    (result, message) => {
      const content = message.content.trim();
      const fingerprint = `${message.direction}:${normalized(content)}`;
      if (!isReadableConversationText(content) || seen.has(fingerprint)) {
        return result;
      }
      seen.add(fingerprint);
      result.push({
        key: `message:${fingerprint}`,
        kind: 'message',
        direction: message.direction,
        content,
      });
      return result;
    },
    [],
  );
  if (messages.length) return messages.slice(-safeLimit);

  const pairs = (timeline || []).reduce<CompanionConversationItem[]>(
    (result, item) => {
      const question = item.question.trim();
      const answer = (item.finalAnswer || item.answer || '').trim();
      const fingerprint = `${normalized(question)}:${normalized(answer)}`;
      if (
        !isReadableConversationText(question) ||
        !isReadableConversationText(answer) ||
        (currentContactId && item.contactId && item.contactId !== currentContactId) ||
        seen.has(fingerprint)
      ) {
        return result;
      }
      seen.add(fingerprint);
      result.push({
        key: `pair:${item.id}:${fingerprint}`,
        kind: 'pair',
        contactId: item.contactId,
        question,
        answer,
        state: item.state,
      });
      return result;
    },
    [],
  );
  return pairs.slice(-safeLimit);
}
