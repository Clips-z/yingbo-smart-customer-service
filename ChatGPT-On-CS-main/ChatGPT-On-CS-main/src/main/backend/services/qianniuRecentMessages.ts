import { redactPersonalData } from './privacyService';

export interface QianniuRecentMessage {
  direction: 'incoming' | 'outgoing';
  content: string;
}

const METADATA_PATTERNS = [
  /^(?:已读|未读)$/u,
  /^20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}/u,
  /^\d{1,2}:\d{2}(?:\s*前付款)?/u,
  /^(?:¥|￥)\s*\d/u,
  /^(?:月销|销量|库存|已售)\s*\d/u,
  /^(?:包邮|商家承担运费|7天无理由退换)$/u,
  /买家30天内|才能给买家发消息|转交给|指派给|智能质检|商品详情页/u,
  /https?:\/\//iu,
];

function normalizeContent(content: string): string {
  return redactPersonalData(content).replace(/\s+/gu, ' ').trim().slice(0, 300);
}

export function isReadableQianniuMessage(content: string): boolean {
  const normalized = normalizeContent(content);
  const meaningful = normalized.match(/[\p{Script=Han}A-Za-z0-9]/gu) || [];
  return Boolean(
    meaningful.length >= 2 &&
      !normalized.includes('\uFFFD') &&
      !/\[object Object\]/iu.test(normalized) &&
      !METADATA_PATTERNS.some((pattern) => pattern.test(normalized)),
  );
}

export function selectQianniuCustomerQuestion(
  candidate: string | null | undefined,
  recentMessages: QianniuRecentMessage[],
): string {
  const rawCandidate = normalizeContent(candidate || '');
  const latestIncoming = [...recentMessages]
    .reverse()
    .find((item) => item.direction === 'incoming' && isReadableQianniuMessage(item.content))
    ?.content;
  // The ordered conversation stream represents the visible chat from top to
  // bottom. A standalone candidate can accidentally select an older bubble.
  // Never let that stale line override the final incoming message.
  return latestIncoming || rawCandidate;
}

export function sanitizeQianniuRecentMessages(
  input: QianniuRecentMessage[] | null | undefined,
): QianniuRecentMessage[] {
  const result: QianniuRecentMessage[] = [];
  for (const item of input || []) {
    const content = normalizeContent(item.content || '');
    if (!isReadableQianniuMessage(content)) {
      continue;
    }
    const previous = result[result.length - 1];
    if (previous?.direction === item.direction && previous.content === content) {
      continue;
    }
    result.push({ direction: item.direction, content });
  }
  return result.slice(-5);
}

function conversationMessageKey(item: QianniuRecentMessage): string {
  return `${item.direction}\u001f${normalizeContent(item.content).toLowerCase()}`;
}

/**
 * OCR can temporarily miss the bottom-most bubble and return an older subset
 * of the same visible conversation. Never let that partial frame move the
 * active question backwards in time.
 */
export function stabilizeQianniuRecentMessages(
  previous: QianniuRecentMessage[] | null | undefined,
  observed: QianniuRecentMessage[],
): QianniuRecentMessage[] {
  const cleanedPrevious = sanitizeQianniuRecentMessages(previous);
  if (!cleanedPrevious.length) return observed;
  if (!observed.length) return cleanedPrevious;

  const previousKeys = new Set(cleanedPrevious.map(conversationMessageKey));
  const observedIsOlderSubset = observed.every((item) =>
    previousKeys.has(conversationMessageKey(item)),
  );
  const previousLatestIncoming = [...cleanedPrevious]
    .reverse()
    .find((item) => item.direction === 'incoming')?.content;
  const observedLatestIncoming = [...observed]
    .reverse()
    .find((item) => item.direction === 'incoming')?.content;

  if (
    observedIsOlderSubset &&
    previousLatestIncoming &&
    observedLatestIncoming !== previousLatestIncoming
  ) {
    return cleanedPrevious;
  }
  return observed;
}
