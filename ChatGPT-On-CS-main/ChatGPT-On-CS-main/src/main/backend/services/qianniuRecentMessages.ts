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
  /买家30天内|才能给买家发消息|转交给|商品详情页/u,
  /https?:\/\//iu,
];

function normalizeContent(content: string): string {
  return content.replace(/\s+/gu, ' ').trim().slice(0, 300);
}

export function sanitizeQianniuRecentMessages(
  input: QianniuRecentMessage[] | null | undefined,
): QianniuRecentMessage[] {
  const result: QianniuRecentMessage[] = [];
  for (const item of input || []) {
    const content = normalizeContent(item.content || '');
    if (
      content.length < 2 ||
      content.includes('\uFFFD') ||
      METADATA_PATTERNS.some((pattern) => pattern.test(content))
    ) {
      continue;
    }
    const previous = result[result.length - 1];
    if (previous?.direction === item.direction && previous.content === content) {
      continue;
    }
    result.push({ direction: item.direction, content });
  }
  return result.slice(-3);
}
