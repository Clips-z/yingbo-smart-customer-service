/* ─────────────────────────────────────────────────────────────
 * 时效管理 —— 数据类型与 Mock 服务
 * 说明：时效规则（限时活动/促销话术的有效期）。
 * ───────────────────────────────────────────────────────────── */

export type ValidityStatus = 'active' | 'upcoming' | 'expired';

export interface ValidityRule {
  id: string;
  /** 规则名称 */
  name: string;
  /** 关联对象（商品/活动） */
  target: string;
  /** 生效时间 */
  startAt: string;
  /** 失效时间 */
  endAt: string;
  /** 状态（由时间推算） */
  status: ValidityStatus;
  /** 关联 QA 数 */
  qaCount: number;
}

export interface ValidityListResult {
  list: ValidityRule[];
  total: number;
  counts: Record<ValidityStatus, number>;
}

function statusOf(startAt: string, endAt: string): ValidityStatus {
  const now = Date.now();
  const s = new Date(startAt).getTime();
  const e = new Date(endAt).getTime();
  if (now < s) return 'upcoming';
  if (now > e) return 'expired';
  return 'active';
}

const RAW: Omit<ValidityRule, 'status'>[] = [
  { id: 'v_1', name: '双11全场5折活动话术', target: '全店活动', startAt: '2025-11-01T00:00:00', endAt: '2025-11-12T00:00:00', qaCount: 18 },
  { id: 'v_2', name: '春装上新预售', target: '李西西旗舰店', startAt: '2025-03-01T00:00:00', endAt: '2025-03-31T00:00:00', qaCount: 9 },
  { id: 'v_3', name: '618年中大促', target: '全店活动', startAt: '2025-06-01T00:00:00', endAt: '2025-06-20T00:00:00', qaCount: 23 },
  { id: 'v_4', name: '会员日专属优惠', target: '星河数码', startAt: '2025-08-15T00:00:00', endAt: '2025-08-16T00:00:00', qaCount: 6 },
  { id: 'v_5', name: '年货节不打烊', target: '木之语家居', startAt: '2025-01-20T00:00:00', endAt: '2025-02-05T00:00:00', qaCount: 14 },
  { id: 'v_6', name: '99重阳节感恩', target: '春雨服饰专营', startAt: '2025-10-01T00:00:00', endAt: '2025-10-09T00:00:00', qaCount: 7 },
  { id: 'v_7', name: '春节不打烊发货', target: '全店活动', startAt: '2026-02-10T00:00:00', endAt: '2026-02-18T00:00:00', qaCount: 11 },
  { id: 'v_8', name: '双12返场清仓', target: '全店活动', startAt: '2025-12-10T00:00:00', endAt: '2025-12-15T00:00:00', qaCount: 16 },
];

let ALL_RULES: ValidityRule[] = RAW.map((r) => ({ ...r, status: statusOf(r.startAt, r.endAt) }));

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchValidityRules(): Promise<ValidityListResult> {
  await delay(220);
  const counts: Record<ValidityStatus, number> = {
    active: ALL_RULES.filter((r) => r.status === 'active').length,
    upcoming: ALL_RULES.filter((r) => r.status === 'upcoming').length,
    expired: ALL_RULES.filter((r) => r.status === 'expired').length,
  };
  return { list: ALL_RULES, total: ALL_RULES.length, counts };
}

export async function addValidityRule(
  rule: Omit<ValidityRule, 'id' | 'status' | 'qaCount'>
): Promise<ValidityRule> {
  await delay(150);
  const created: ValidityRule = {
    ...rule,
    id: `v_${Date.now()}`,
    status: statusOf(rule.startAt, rule.endAt),
    qaCount: 0,
  };
  ALL_RULES = [created, ...ALL_RULES];
  return created;
}

export async function deleteValidityRule(id: string): Promise<void> {
  await delay(120);
  ALL_RULES = ALL_RULES.filter((r) => r.id !== id);
}

export const VALIDITY_STATUS_LABELS: Record<ValidityStatus, string> = {
  active: '生效中',
  upcoming: '未开始',
  expired: '已过期',
};

export const VALIDITY_STATUS_COLORS: Record<ValidityStatus, string> = {
  active: 'green',
  upcoming: 'blue',
  expired: 'gray',
};

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
