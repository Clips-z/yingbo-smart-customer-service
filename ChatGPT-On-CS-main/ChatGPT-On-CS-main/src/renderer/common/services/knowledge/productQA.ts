/* ─────────────────────────────────────────────────────────────
 * 商品问答库 —— 数据类型与 Mock 服务
 * 说明：当前后端暂无商品问答库 API，先用高质量本地 mock 数据驱动 UI，
 *       后续接入真实接口时只需替换下方 service 函数实现即可。
 * ───────────────────────────────────────────────────────────── */

export interface ProductQA {
  id: string;
  /** 商品名称 */
  name: string;
  /** 平台商品 ID */
  platformProductId: string;
  /** 商品条码（69 码） */
  barcode?: string;
  /** 所属店铺 */
  shopName: string;
  shopId: string;
  /** 是否上架（开关状态） */
  onSale: boolean;
  /** 已配置问答数 */
  qaCount: number;
  /** 占位图色调种子（决定渐变颜色） */
  hue: number;
}

export interface ProductQAListParams {
  keyword?: string;
  shop?: string;
  status?: 'all' | 'on' | 'off';
  page?: number;
  pageSize?: number;
}

export interface ProductQAListResult {
  list: ProductQA[];
  total: number;
  page: number;
  pageSize: number;
}

const SHOPS = [
  { id: 'shop_lixixi', name: '李西西旗舰店' },
  { id: 'shop_muzhi', name: '木之语家居' },
  { id: 'shop_chunyu', name: '春雨服饰专营' },
  { id: 'shop_xinghe', name: '星河数码' },
];

const PRODUCT_NAMES = [
  '【爱心涂鸦】2025新款宽松男女同款纯棉短袖T恤',
  '北欧实木简约书桌学习桌卧室电脑桌',
  '高弹力加绒打底裤女秋冬加厚保暖踩脚裤',
  '真无线蓝牙耳机降噪入耳式长续航运动耳机',
  '纯棉A类婴儿连体衣新生儿和尚服春夏款',
  '日式陶瓷餐具套装家用碗碟礼盒乔迁礼物',
  '羊毛混纺针织开衫女慵懒风外套毛衣',
  '不锈钢保温杯大容量便携车载水杯礼盒装',
  '天然乳胶枕护颈枕人体工学记忆枕一对装',
  '复古牛皮纸笔记本手账本日记本简约空白页',
  '运动速干健身短裤男透气跑步训练五分裤',
  '儿童积木拼装玩具益智早教大颗粒安全无毒',
  '香薰蜡烛礼盒卧室助眠家用氛围精油蜡烛',
  '空气炸锅家用新款可视无油多功能电炸锅',
  '羊绒围巾女士冬季保暖加厚流苏情侣围巾',
  '机械键盘客制化热插拔RGB游戏电竞键盘',
  '有机茉莉花茶浓香型茶叶礼盒装送礼',
  '硅藻泥吸水垫厨房卫生间防滑速干地垫',
  '防晒衣女薄款透气冰丝防晒服户外紫外线衣',
  '便携榨汁机充电款迷你果汁杯随行杯',
];

const BARCODE_PREFIX = ['690', '691', '692', '693', '694', '695'];

/** 生成 99 条 mock 商品 */
function generateMockProducts(): ProductQA[] {
  const list: ProductQA[] = [];
  for (let i = 0; i < 99; i++) {
    const shop = SHOPS[i % SHOPS.length];
    const name = PRODUCT_NAMES[i % PRODUCT_NAMES.length];
    const onSale = i % 7 !== 0; // 约 85% 上架
    list.push({
      id: `prod_${1000 + i}`,
      name: `${name}${i >= PRODUCT_NAMES.length ? ` (${Math.floor(i / PRODUCT_NAMES.length) + 1})` : ''}`,
      platformProductId: `${888874062298 - i * 137}`,
      barcode: `${BARCODE_PREFIX[i % BARCODE_PREFIX.length]}${String(10000000000 + i * 7919).slice(0, 10)}`,
      shopName: shop.name,
      shopId: shop.id,
      onSale,
      qaCount: (i * 3) % 17,
      hue: (i * 37) % 360,
    });
  }
  return list;
}

const ALL_PRODUCTS = generateMockProducts();

/** 模拟网络延迟 */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 获取商品问答库列表（带筛选 + 分页） */
export async function fetchProductQAList(
  params: ProductQAListParams
): Promise<ProductQAListResult> {
  await delay(280);

  const { keyword, shop, status = 'all', page = 1, pageSize = 20 } = params;

  let filtered = ALL_PRODUCTS.slice();

  if (keyword) {
    const kw = keyword.trim().toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.name.toLowerCase().includes(kw) ||
        p.platformProductId.includes(kw) ||
        (p.barcode ?? '').includes(kw)
    );
  }

  if (shop && shop !== 'all') {
    filtered = filtered.filter((p) => p.shopId === shop);
  }

  if (status === 'on') filtered = filtered.filter((p) => p.onSale);
  else if (status === 'off') filtered = filtered.filter((p) => !p.onSale);

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const list = filtered.slice(start, start + pageSize);

  return { list, total, page, pageSize };
}

/** 切换商品上架状态 */
export async function toggleProductOnSale(
  id: string,
  onSale: boolean
): Promise<{ id: string; onSale: boolean }> {
  await delay(120);
  const target = ALL_PRODUCTS.find((p) => p.id === id);
  if (target) target.onSale = onSale;
  return { id, onSale };
}

/** 店铺列表（用于筛选下拉） */
export const SHOP_OPTIONS = SHOPS;

/** 占位商品图（SVG data URI，渐变 + 商品首字），完全离线，无需网络 */
export function productPlaceholderImage(name: string, hue: number): string {
  const c1 = `hsl(${hue}, 70%, 82%)`;
  const c2 = `hsl(${(hue + 40) % 360}, 65%, 65%)`;
  const initial = (name.trim()[0] ?? '商').slice(0, 1);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/>
    </linearGradient></defs>
    <rect width='200' height='200' fill='url(#g)'/>
    <text x='100' y='100' font-size='72' font-family='sans-serif' font-weight='bold'
      fill='rgba(255,255,255,0.9)' text-anchor='middle' dominant-baseline='central'>${initial}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
