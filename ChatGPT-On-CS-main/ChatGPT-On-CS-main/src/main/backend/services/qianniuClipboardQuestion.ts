const MAX_CLIPBOARD_QUESTION_LENGTH = 2000;

export function normalizeQianniuClipboardQuestion(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Clipboard does not contain a text question');
  }
  const normalized = value
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized) throw new Error('Clipboard does not contain a text question');
  if (normalized.length > MAX_CLIPBOARD_QUESTION_LENGTH) {
    throw new Error(`Copied question exceeds ${MAX_CLIPBOARD_QUESTION_LENGTH} characters`);
  }
  return normalized;
}

export function isLikelyQianniuClipboardQuestion(value: unknown): boolean {
  let content: string;
  try {
    content = normalizeQianniuClipboardQuestion(value);
  } catch {
    return false;
  }
  if (/^https?:\/\//iu.test(content) || /\[object Object\]/iu.test(content)) return false;
  const meaningful = content.match(/[\p{Script=Han}A-Za-z0-9]/gu) || [];
  if (meaningful.length < 3) return false;
  return /[?？]$/u.test(content) ||
    /怎么|怎样|是否|可以|能否|有没有|多少|什么|多久|哪里|哪款|配置|问题|发货|库存|尺寸|价格|支持/u.test(content);
}

export function createClipboardQuestionKey(input: {
  conversationKey: string;
  content: string;
}): string {
  return crypto
    .createHash('sha256')
    .update(`clipboard\u001f${input.conversationKey}\u001f${input.content}`)
    .digest('hex');
}
import crypto from 'crypto';
