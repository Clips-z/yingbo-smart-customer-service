export type QianniuCaptureRejectReason =
  | 'sender_missing'
  | 'content_too_short'
  | 'not_incoming'
  | 'latest_not_incoming'
  | 'ocr_unavailable'
  | 'ocr_low_confidence'
  | 'invalid_text'
  | 'metadata_text';

export type QianniuCaptureDecision =
  | { accepted: true; sender: string; content: string }
  | { accepted: false; reasonCode: QianniuCaptureRejectReason };

export function normalizeQianniuContact(value?: string): string {
  const raw = value?.replace(/\s+/g, '').replace(/(?:已读|未读)$/u, '') || '';
  if (!raw || /https?:\/\/|买家30天内|才能给买家发消息/u.test(raw)) return '';
  return raw.match(/tb[A-Za-z0-9]{5,}/i)?.[0] || raw;
}

export function evaluateQianniuCapture(
  input: {
    sender?: string;
    content?: string;
    direction?: string;
    latestDirection?: string;
    confidence?: number;
    ocrEngine?: string;
  },
  minConfidence: number,
): QianniuCaptureDecision {
  const sender = normalizeQianniuContact(input.sender);
  const content = input.content?.trim() || '';
  if (!sender) return { accepted: false, reasonCode: 'sender_missing' };
  if (content.length < 2)
    return { accepted: false, reasonCode: 'content_too_short' };
  if (input.direction !== 'incoming')
    return { accepted: false, reasonCode: 'not_incoming' };
  if (input.latestDirection !== 'incoming')
    return { accepted: false, reasonCode: 'latest_not_incoming' };
  if (input.ocrEngine !== 'rapidocr')
    return { accepted: false, reasonCode: 'ocr_unavailable' };
  if ((input.confidence || 0) < minConfidence)
    return { accepted: false, reasonCode: 'ocr_low_confidence' };
  if (content.includes('\uFFFD'))
    return { accepted: false, reasonCode: 'invalid_text' };
  if (/^tb[A-Za-z0-9]{5,}(?:20\d{2})?/i.test(content))
    return { accepted: false, reasonCode: 'metadata_text' };
  if (/^20\d{2}[.\-/]/.test(content))
    return { accepted: false, reasonCode: 'metadata_text' };
  if (/^(?:已读|未读)$/u.test(content) || /买家30天内|才能给买家发消息/u.test(content))
    return { accepted: false, reasonCode: 'metadata_text' };
  if (/转交给|商品详情页|[¥￥]\s*\d/u.test(content))
    return { accepted: false, reasonCode: 'metadata_text' };
  if (/^(?:月销|销量|库存)\s*\d/u.test(content))
    return { accepted: false, reasonCode: 'metadata_text' };
  return { accepted: true, sender, content };
}
