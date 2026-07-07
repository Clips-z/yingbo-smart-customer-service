/* ─────────────────────────────────────────────────────────────
 * 行业相关配置 —— 数据类型与 Mock 服务
 * 说明：行业模板配置（启用状态、话术覆盖、禁用词、行业术语）。
 * ───────────────────────────────────────────────────────────── */

export interface IndustryTemplate {
  id: string;
  /** 行业名称 */
  name: string;
  /** 图标 emoji（离线，无需网络） */
  icon: string;
  /** 主题色（hue） */
  hue: number;
  /** 是否启用 */
  enabled: boolean;
  /** 覆盖商品数 */
  productCount: number;
  /** 行业专属话术数 */
  phraseCount: number;
  /** 禁用词数 */
  bannedWordCount: number;
  /** 行业术语数 */
  termCount: number;
  /** 描述 */
  description: string;
}

export interface IndustryTemplateResult {
  list: IndustryTemplate[];
  total: number;
  enabledCount: number;
}

const INDUSTRIES: Omit<IndustryTemplate, 'enabled' | 'productCount' | 'phraseCount' | 'bannedWordCount' | 'termCount'>[] = [
  { id: 'ind_fashion', name: '服装鞋包', icon: '👗', hue: 330, description: '尺码、材质、退换、季节上新等高频问答' },
  { id: 'ind_3c', name: '3C数码', icon: '📱', hue: 210, description: '参数对比、保修、激活、兼容性问题' },
  { id: 'ind_beauty', name: '美妆个护', icon: '💄', hue: 350, description: '肤质适配、成分、用法、过敏提示' },
  { id: 'ind_food', name: '食品生鲜', icon: '🍎', hue: 110, description: '保质期、储存、发货、过敏源标注' },
  { id: 'ind_home', name: '家居家装', icon: '🛋️', hue: 30, description: '尺寸、安装、材质、搭配建议' },
  { id: 'ind_baby', name: '母婴玩具', icon: '🧸', hue: 270, description: '适用年龄、材质安全、清洗消毒' },
  { id: 'ind_sport', name: '运动户外', icon: '⚽', hue: 160, description: '尺码、功能、保养、适用场景' },
  { id: 'ind_book', name: '图书文娱', icon: '📚', hue: 250, description: '版本、正版、发货、内容适龄' },
];

function generateMockIndustries(): IndustryTemplate[] {
  return INDUSTRIES.map((b, i) => ({
    ...b,
    enabled: i % 4 !== 3, // 约 75% 启用
    productCount: 30 + ((i * 17) % 80),
    phraseCount: 5 + ((i * 3) % 20),
    bannedWordCount: 2 + ((i * 5) % 12),
    termCount: 8 + ((i * 7) % 24),
  }));
}

const ALL_INDUSTRIES = generateMockIndustries();

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchIndustryTemplates(): Promise<IndustryTemplateResult> {
  await delay(220);
  return {
    list: ALL_INDUSTRIES,
    total: ALL_INDUSTRIES.length,
    enabledCount: ALL_INDUSTRIES.filter((i) => i.enabled).length,
  };
}

export async function toggleIndustry(
  id: string,
  enabled: boolean
): Promise<{ id: string; enabled: boolean }> {
  await delay(120);
  const t = ALL_INDUSTRIES.find((i) => i.id === id);
  if (t) t.enabled = enabled;
  return { id, enabled };
}
