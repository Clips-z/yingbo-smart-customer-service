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
  const taobaoId = raw.match(/tb[A-Za-z0-9]{5,}/i)?.[0];
  if (taobaoId) {
    const tail = taobaoId.slice(2);
    const digitCount = (tail.match(/\d/g) || []).length;
    if (
      tail.length >= 8 &&
      digitCount >= Math.ceil(tail.length / 2) &&
      /^[0-9OISBZ]+$/i.test(tail)
    ) {
      const numericTail = tail.replace(/[OISBZ]/gi, (character) => ({
        O: '0',
        I: '1',
        S: '5',
        B: '8',
        Z: '2',
      }[character.toUpperCase()] || character));
      return `tb${numericTail}`;
    }
    return taobaoId;
  }
  // Header OCR sometimes mistakes the latest message or a product phrase for
  // the buyer name. Only accept a stable account-like token here; keeping the
  // previous context in "switching" is safer than binding a draft to a phrase.
  return /^[A-Za-z0-9_.@-]{3,64}$/.test(raw) ? raw : '';
}

export function resolveQianniuFillTarget(suggestion: {
  conversation_key?: string | null;
  contact_id?: string | null;
  sender: string;
}): string | undefined {
  if (suggestion.conversation_key) return undefined;
  return normalizeQianniuContact(suggestion.contact_id || suggestion.sender) || undefined;
}

export function evaluateQianniuFocusVerification(
  target: string,
  observed?: string,
): 'confirmed' | 'pending' | 'mismatch' {
  const expected = normalizeQianniuContact(target);
  const actual = normalizeQianniuContact(observed);
  if (!expected || !actual) return 'pending';
  return actual.toLowerCase() === expected.toLowerCase()
    ? 'confirmed'
    : 'mismatch';
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
  // The resident capture worker uses Windows OCR deliberately: it avoids a
  // Python start-up on every customer click.  Treat it exactly like the
  // legacy RapidOCR path once the caller has supplied the same confidence
  // threshold.  Requiring "rapidocr" here made every fast-path detection
  // appear in the UI but silently prevented draft generation.
  if (input.ocrEngine !== 'rapidocr' && input.ocrEngine !== 'windows')
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
