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
  const rawSender = input.sender?.replace(/\s+/g, '') || '';
  const sender = rawSender.match(/tb[A-Za-z0-9]{5,}/i)?.[0] || rawSender;
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
  return { accepted: true, sender, content };
}
