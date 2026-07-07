/* ─────────────────────────────────────────────────────────────
 * 店铺知识库 —— 数据类型与 Mock 服务
 * 说明：当前后端暂无店铺问答知识库 API，先用高质量本地 mock 数据驱动 UI。
 * ───────────────────────────────────────────────────────────── */

export type QAStage = 'presale' | 'mid' | 'aftersale'; // 售前 / 售中 / 售后
export type QAMatchType = 'exact' | 'fuzzy'; // 精确 / 模糊

export interface QAItem {
  id: string;
  /** 问题 */
  question: string;
  /** 关联回复 */
  answer: string;
  /** 关联问题（相似问法） */
  relatedQuestions: string[];
  /** 标签 */
  tags: string[];
  /** 触发次数 */
  triggerCount: number;
  /** 阶段分类 */
  stage: QAStage;
  /** 匹配类型 */
  matchType: QAMatchType;
  /** 更新时间 */
  updatedAt: string;
  /** 所属店铺 */
  shopId: string;
}

export interface QAListParams {
  keyword?: string;
  stage?: QAStage | 'all';
  shop?: string;
  page?: number;
  pageSize?: number;
}

export interface QAStats {
  total: number;
  presale: number;
  mid: number;
  aftersale: number;
}

export interface QAListResult {
  list: QAItem[];
  total: number;
  stats: QAStats;
  page: number;
  pageSize: number;
}

const SHOPS = [
  { id: 'shop_lixixi', name: '李西西旗舰店' },
  { id: 'shop_muzhi', name: '木之语家居' },
  { id: 'shop_chunyu', name: '春雨服饰专营' },
  { id: 'shop_xinghe', name: '星河数码' },
];

const QUESTIONS = [
  {
    q: '这款衣服会缩水吗？正常洗涤会变形吗？',
    a: '亲，本款采用预缩处理工艺，正常机洗（30℃以下）不会缩水变形。建议反面洗涤、阴凉晾干，避免暴晒和高温熨烫哦~',
    stage: 'presale' as QAStage,
  },
  {
    q: '支持七天无理由退换货吗？退货运费谁出？',
    a: '我们支持7天无理由退换，只要商品不影响二次销售即可。非质量问题退换运费由买家承担，质量问题我们承担运费，敬请放心购买~',
    stage: 'presale' as QAStage,
  },
  {
    q: '下单后多久发货？发什么快递？',
    a: '现货当天16:00前付款当日发出，默认发顺丰/中通，偏远地区发EMS。您可以在订单详情查看物流单号~',
    stage: 'mid' as QAStage,
  },
  {
    q: '我买的两件怎么只收到一件？',
    a: '非常抱歉给您带来不便！有可能是分两个包裹发出的，请先查看是否有多条物流信息。如确实漏发，我马上为您补发并补偿一张5元无门槛券~',
    stage: 'mid' as QAStage,
  },
  {
    q: '收到货发现有线头/瑕疵怎么办？',
    a: '亲十分抱歉！小瑕疵我们可补偿3-10元红包，严重质量问题支持退换并承担运费。请拍下照片，我立刻为您处理~',
    stage: 'aftersale' as QAStage,
  },
  {
    q: '这个尺寸怎么选？我160cm 50kg穿什么码？',
    a: '根据您的身高体重建议选M码哦~我们尺码偏标准，如果喜欢宽松可以选L。详情页有尺码表，也可参考买家秀实拍~',
    stage: 'presale' as QAStage,
  },
  {
    q: '可以开发票吗？发票怎么寄？',
    a: '支持开具电子普通发票/增值税专用发票，下单时备注抬头税号即可，电子发票将于发货后3个工作日内发送至您邮箱~',
    stage: 'mid' as QAStage,
  },
  {
    q: '保修期多久？坏了怎么修？',
    a: '本店商品享一年质保，非人为损坏免费维修。请保留好订单号，联系客服寄回检测，往返运费我们承担~',
    stage: 'aftersale' as QAStage,
  },
];

const TAG_POOL = ['物流', '尺码', '质量', '退换', '优惠', '材质', '发票', '保修'];

function generateMockQA(): QAItem[] {
  const list: QAItem[] = [];
  const now = Date.now();
  for (let i = 0; i < 129; i++) {
    const tpl = QUESTIONS[i % QUESTIONS.length];
    const shop = SHOPS[i % SHOPS.length];
    const matchType: QAMatchType = i % 3 === 0 ? 'fuzzy' : 'exact';
    const tags = TAG_POOL.filter((_, idx) => (i + idx) % 3 === 0).slice(0, 2);
    list.push({
      id: `qa_${2000 + i}`,
      question: tpl.q,
      answer: tpl.a,
      relatedQuestions: [
        `和「${tpl.q}」类似的问法还有吗？`,
        `再确认一下：${tpl.q}`,
      ],
      tags,
      triggerCount: (i * 7) % 53,
      stage: tpl.stage,
      matchType,
      updatedAt: new Date(now - i * 3600 * 1000 * 7).toISOString(),
      shopId: shop.id,
    });
  }
  return list;
}

const ALL_QA = generateMockQA();

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchStoreQAList(
  params: QAListParams
): Promise<QAListResult> {
  await delay(280);
  const { keyword, stage = 'all', shop, page = 1, pageSize = 20 } = params;

  let filtered = ALL_QA.slice();
  if (keyword) {
    const kw = keyword.trim().toLowerCase();
    filtered = filtered.filter(
      (q) =>
        q.question.toLowerCase().includes(kw) ||
        q.answer.toLowerCase().includes(kw) ||
        q.tags.some((t) => t.toLowerCase().includes(kw))
    );
  }
  if (stage !== 'all') filtered = filtered.filter((q) => q.stage === stage);
  if (shop && shop !== 'all') filtered = filtered.filter((q) => q.shopId === shop);

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const list = filtered.slice(start, start + pageSize);

  const stats: QAStats = {
    total: ALL_QA.length,
    presale: ALL_QA.filter((q) => q.stage === 'presale').length,
    mid: ALL_QA.filter((q) => q.stage === 'mid').length,
    aftersale: ALL_QA.filter((q) => q.stage === 'aftersale').length,
  };

  return { list, total, stats, page, pageSize };
}

export const SHOP_OPTIONS = SHOPS;

export const STAGE_LABELS: Record<QAStage, string> = {
  presale: '售前',
  mid: '售中',
  aftersale: '售后',
};

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / (3600 * 1000 * 24));
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days}天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}个月前`;
  return `${Math.floor(months / 12)}年前`;
}
