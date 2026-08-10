import { ReplySuggestion } from '../../common/services/platform/platform';

export interface CustomerIdentity {
  label: string;
  reliable: boolean;
}

export type ReceptionFilter = 'all' | 'manual' | 'replied';

const PLACEHOLDER_IDENTITIES = new Set([
  'unknown',
  'undefined',
  'null',
  '未识别',
  '客户待确认',
]);

function normalized(value?: string | null): string {
  return String(value || '').trim();
}

export function normalizedQianniuCustomerId(value?: string | null): string {
  const raw = normalized(value).replace(/\s+/g, '').replace(/(?:已读|未读)$/u, '');
  const taobaoId = raw.match(/tb[A-Za-z0-9]{5,}/i)?.[0];
  if (!taobaoId) return raw;
  const tail = taobaoId.slice(2);
  const digitCount = (tail.match(/\d/g) || []).length;
  if (
    tail.length >= 8 &&
    digitCount >= Math.ceil(tail.length / 2) &&
    /^[0-9OISBZ]+$/i.test(tail)
  ) {
    const repaired = tail.replace(/[OISBZ]/gi, (character) => ({
      O: '0',
      I: '1',
      S: '5',
      B: '8',
      Z: '2',
    }[character.toUpperCase()] || character));
    return `tb${repaired}`;
  }
  return taobaoId;
}

export function storeLabel(value?: string | null): string {
  const compact = normalized(value).replace(/\s+/g, '');
  if (
    /^\d{1,8}$/.test(compact) ||
    /^win_[a-z0-9_]+$/i.test(compact) ||
    compact.toLowerCase() === 'qianniu-default' ||
    /^(淘宝|京东|拼多多|抖音电商|微信|企业微信)$/u.test(compact)
  ) return '';
  // Do not surface OCR garbage as a new shop. QianNiu shop names may contain
  // Chinese, ASCII letters/numbers and normal separators; mojibake such as
  // "Ü/æ" is rejected and the caller falls back to the platform label.
  if (compact && !/^[\u4e00-\u9fffA-Za-z0-9_.-]+$/u.test(compact)) return '';
  if (compact.endsWith('牌店') && !compact.endsWith('品牌店')) {
    return `${compact.slice(0, -2)}旗舰店`;
  }
  return compact;
}

export function customerIdentity(item: ReplySuggestion): CustomerIdentity {
  const candidates = [item.contact_id, item.sender]
    .map((candidate) =>
      item.platform_id === 'win_qianniu'
        ? normalizedQianniuCustomerId(candidate)
        : normalized(candidate),
    )
    .filter(Boolean);

  const reliable = candidates
    .map((candidate) => candidate.replace(/\s+/g, ''))
    .find(
      (candidate) =>
        !PLACEHOLDER_IDENTITIES.has(candidate.toLowerCase()) &&
        /^[A-Za-z0-9_.@-]{3,64}$/.test(candidate),
    );
  if (reliable) return { label: reliable, reliable: true };

  // QianNiu exposes stable ASCII buyer IDs. Other desktop clients identify
  // conversations by their visible contact/group name, which may be Chinese.
  if (item.platform_id !== 'win_qianniu') {
    const visibleName = candidates.find(
      (candidate) =>
        candidate.length >= 2 &&
        candidate.length <= 80 &&
        !PLACEHOLDER_IDENTITIES.has(candidate.toLowerCase()) &&
        !/^win_[a-z0-9_]+$/i.test(candidate),
    );
    if (visibleName) return { label: visibleName, reliable: true };
  }

  return { label: '客户 ID 待确认', reliable: false };
}

function conversationKey(item: ReplySuggestion): string {
  const identity = customerIdentity(item);
  const scope = [
    item.platform_id,
    storeLabel(item.store_id || item.store),
    normalized(item.account_id),
  ].join('|');
  // OCR phrases are not identities. Collapse unresolved records inside the
  // same account so one customer cannot flood the list under several names.
  return identity.reliable ? `${scope}|${identity.label.toLowerCase()}` : `${scope}|unresolved`;
}

export function selectReceptionRows(
  suggestions: ReplySuggestion[],
  filter: ReceptionFilter | boolean,
): ReplySuggestion[] {
  let normalizedFilter: ReceptionFilter = filter as ReceptionFilter;
  if (typeof filter === 'boolean') {
    normalizedFilter = filter ? 'manual' : 'replied';
  }
  const ordered = [...suggestions].sort(
      (left, right) =>
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime(),
    );
  const seen = new Set<string>();
  const latestByCustomer = ordered.filter((item) => {
    const key = conversationKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return latestByCustomer.filter((item) => {
    if (normalizedFilter === 'manual') {
      return ['pending', 'failed', 'prepared'].includes(item.status);
    }
    if (normalizedFilter === 'replied') return item.status === 'sent';
    return !['dismissed', 'cancelled'].includes(item.status);
  });
}

export function receptionStatusLabel(item: ReplySuggestion): string {
  if (item.status === 'sent') {
    return item.delivery_request_id ? '自动已回复' : '人工已回复';
  }
  if (item.status === 'prepared') return '待人工发送';
  if (item.status === 'failed') return '待人工处理';
  if (item.status === 'sending') return '自动回复中';
  if (item.status === 'preparing') return '正在填入';
  return '待人工回复';
}
