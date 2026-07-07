/* ─────────────────────────────────────────────────────────────
 * 内容安全 —— 数据类型与 Mock 服务
 * 说明：敏感词库、审核策略、风险统计。
 * ───────────────────────────────────────────────────────────── */

export type SensitiveCategory = 'political' | 'insult' | 'competitor' | 'privacy' | 'illegal';

export interface SensitiveWord {
  id: string;
  word: string;
  category: SensitiveCategory;
  action: 'block' | 'review' | 'replace';
}

export interface SecurityPolicy {
  filterEnabled: boolean;
  riskTipEnabled: boolean;
  manualReviewEnabled: boolean;
  /** 触发人工审核的风险分阈值 */
  reviewThreshold: number;
}

export interface SecurityOverview {
  totalWords: number;
  byCategory: Record<SensitiveCategory, number>;
  policy: SecurityPolicy;
}

const CATEGORY_LABELS: Record<SensitiveCategory, string> = {
  political: '政治敏感',
  insult: '辱骂攻击',
  competitor: '竞品导流',
  privacy: '隐私信息',
  illegal: '违法违规',
};

const CATEGORY_COLORS: Record<SensitiveCategory, string> = {
  political: 'red',
  insult: 'orange',
  competitor: 'purple',
  privacy: 'blue',
  illegal: 'pink',
};

const ACTION_LABELS: Record<SensitiveWord['action'], string> = {
  block: '拦截',
  review: '转人工审核',
  replace: '替换',
};

let WORDS: SensitiveWord[] = [
  { id: 'w_1', word: '加微信', category: 'competitor', action: 'block' },
  { id: 'w_2', word: '私聊我', category: 'competitor', action: 'block' },
  { id: 'w_3', word: '微信同款', category: 'competitor', action: 'review' },
  { id: 'w_4', word: '傻x', category: 'insult', action: 'replace' },
  { id: 'w_5', word: '垃圾', category: 'insult', action: 'replace' },
  { id: 'w_6', word: '身份证号', category: 'privacy', action: 'block' },
  { id: 'w_7', word: '银行卡', category: 'privacy', action: 'review' },
  { id: 'w_8', word: '代开发票', category: 'illegal', action: 'block' },
  { id: 'w_9', word: '刷单', category: 'illegal', action: 'block' },
  { id: 'w_10', word: '返利', category: 'illegal', action: 'review' },
  { id: 'w_11', word: '领导不行', category: 'political', action: 'block' },
  { id: 'w_12', word: '投诉热线', category: 'privacy', action: 'review' },
];

let POLICY: SecurityPolicy = {
  filterEnabled: true,
  riskTipEnabled: true,
  manualReviewEnabled: true,
  reviewThreshold: 60,
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchSecurityOverview(): Promise<SecurityOverview> {
  await delay(220);
  const byCategory: Record<SensitiveCategory, number> = {
    political: 0, insult: 0, competitor: 0, privacy: 0, illegal: 0,
  };
  WORDS.forEach((w) => { byCategory[w.category]++; });
  return { totalWords: WORDS.length, byCategory, policy: { ...POLICY } };
}

export async function addSensitiveWord(word: string, category: SensitiveCategory, action: SensitiveWord['action']): Promise<SensitiveWord> {
  await delay(120);
  const created: SensitiveWord = { id: `w_${Date.now()}`, word, category, action };
  WORDS = [created, ...WORDS];
  return created;
}

export async function deleteSensitiveWord(id: string): Promise<void> {
  await delay(100);
  WORDS = WORDS.filter((w) => w.id !== id);
}

export async function updatePolicy(patch: Partial<SecurityPolicy>): Promise<SecurityPolicy> {
  await delay(120);
  POLICY = { ...POLICY, ...patch };
  return { ...POLICY };
}

export async function fetchSensitiveWords(): Promise<SensitiveWord[]> {
  await delay(150);
  return WORDS;
}

export const SECURITY_CONST = {
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  ACTION_LABELS,
};
