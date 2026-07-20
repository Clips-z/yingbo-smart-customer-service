import { GET, POST } from '../common/api/request';

export interface ProductQA {
  id: string;
  name: string;
  platformProductId: string;
  barcode?: string;
  shopName: string;
  shopId: string;
  tags?: string[];
  onSale: boolean;
  qaCount: number;
  hue: number;
  syncStatus?: 'pending' | 'synced' | 'failed';
  syncError?: string;
  createdAt?: string;
  updatedAt?: string;
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

export const SHOP_OPTIONS = [
  { id: 'shop_lixixi', name: '李西西旗舰店' },
  { id: 'shop_muzhi', name: '木之语家居' },
  { id: 'shop_chunyu', name: '春雨服饰专营' },
  { id: 'shop_xinghe', name: '星河数码' },
];

export async function fetchProductQAList(params: ProductQAListParams) {
  const response = await GET<{ data: ProductQAListResult }>(
    '/api/v1/knowledge/products',
    params,
  );
  return response.data;
}

export async function toggleProductOnSale(id: string, onSale: boolean) {
  await POST('/api/v1/knowledge/products/status', { ids: [id], onSale });
  return { id, onSale };
}

export async function addProductQA(input: {
  name: string;
  platformProductId: string;
  barcode?: string;
  shopId: string;
  onSale: boolean;
}) {
  const shop = SHOP_OPTIONS.find((item) => item.id === input.shopId);
  const response = await POST<{ data: ProductQA }>(
    '/api/v1/knowledge/products/create',
    { ...input, shopName: shop?.name || input.shopId },
  );
  return response.data;
}

export async function updateProductQA(
  id: string,
  input: {
    name: string;
    platformProductId: string;
    barcode?: string;
    shopId: string;
    onSale: boolean;
    tags?: string[];
  },
) {
  const shop = SHOP_OPTIONS.find((item) => item.id === input.shopId);
  const response = await POST<{ data: ProductQA }>(
    '/api/v1/knowledge/products/update',
    { id, ...input, shopName: shop?.name || input.shopId },
  );
  return response.data;
}

export async function batchSetOnSale(ids: string[], onSale: boolean) {
  await POST('/api/v1/knowledge/products/status', { ids, onSale });
}

export async function batchDeleteProducts(ids: string[]) {
  await POST('/api/v1/knowledge/products/delete', { ids });
}

export async function retryProductSync(id: string) {
  const response = await POST<{ data: ProductQA }>('/api/v1/knowledge/sync/retry', {
    kind: 'product',
    id,
  });
  return response.data;
}

export async function bulkImportProducts(rows: object[]) {
  const response = await POST<{
    data: { results: Array<{ row: number; success: boolean; id?: string; error?: string }> };
  }>('/api/v1/knowledge/products/import', { rows });
  return response.data.results;
}

export function productPlaceholderImage(name: string, hue: number): string {
  const c1 = `hsl(${hue}, 55%, 88%)`;
  const c2 = `hsl(${(hue + 28) % 360}, 48%, 70%)`;
  const initial = (name.trim()[0] ?? '商').slice(0, 1);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='${c1}'/><stop offset='100%' stop-color='${c2}'/></linearGradient></defs><rect width='200' height='200' fill='url(#g)'/><text x='100' y='100' font-size='72' font-family='sans-serif' font-weight='bold' fill='rgba(255,255,255,.9)' text-anchor='middle' dominant-baseline='central'>${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
