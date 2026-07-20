import { Op, Sequelize } from 'sequelize';
import crypto from 'crypto';
import { ProductKnowledge } from '../entities/productKnowledge';
import { StoreKnowledge } from '../entities/storeKnowledge';
import {
  validateProductKnowledgeInput,
  validateStoreKnowledgeInput,
} from './knowledgeValidation';
import { KnowledgeExportRecord } from './knowledgeExportService';

const paging = (pageValue: unknown, pageSizeValue: unknown) => {
  const page = Math.max(1, Number(pageValue) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(pageSizeValue) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
};

const productJson = (item: ProductKnowledge) => ({
  id: item.id,
  name: item.name,
  platformProductId: item.platform_product_id,
  barcode: item.barcode || undefined,
  shopId: item.shop_id,
  shopName: item.shop_name,
  tags: item.tags || [],
  onSale: item.on_sale,
  qaCount: item.qa_count,
  hue: item.hue,
  syncStatus: item.sync_status,
  syncError: item.sync_error || undefined,
  createdAt: item.created_at.toISOString(),
  updatedAt: item.updated_at.toISOString(),
});

const storeJson = (item: StoreKnowledge) => ({
  id: item.id,
  question: item.question,
  answer: item.answer,
  relatedQuestions: item.related_questions || [],
  tags: item.tags || [],
  triggerCount: item.trigger_count,
  stage: item.stage,
  matchType: item.match_type,
  updatedAt: item.updated_at.toISOString(),
  shopId: item.shop_id,
  enabled: item.enabled,
  syncStatus: item.sync_status,
  syncError: item.sync_error || undefined,
  createdAt: item.created_at.toISOString(),
});

export class KnowledgeService {
  private indexer?: (text: string, filename: string) => Promise<void>;

  constructor(private sequelize: Sequelize) {}

  setIndexer(indexer: (text: string, filename: string) => Promise<void>) {
    this.indexer = indexer;
  }

  private async runSync(
    item: ProductKnowledge | StoreKnowledge,
    text: string,
    filename: string,
  ) {
    try {
      if (!this.indexer) throw new Error('RAG 同步服务未就绪');
      await this.indexer(text, filename);
      await item.update({ sync_status: 'synced', sync_error: null, updated_at: new Date() });
    } catch (error) {
      await item.update({
        sync_status: 'failed',
        sync_error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
        updated_at: new Date(),
      });
    }
  }

  private syncProduct(item: ProductKnowledge) {
    return this.runSync(
      item,
      [`商品：${item.name}`, `平台商品ID：${item.platform_product_id}`, item.barcode ? `条码：${item.barcode}` : '', `店铺：${item.shop_name}`].filter(Boolean).join('\n'),
      `product-${item.id}.txt`,
    );
  }

  private syncStore(item: StoreKnowledge) {
    return this.runSync(
      item,
      [`问题：${item.question}`, `回复：${item.answer}`, ...(item.related_questions || []).map((q) => `相似问法：${q}`)].join('\n'),
      `store-qa-${item.id}.txt`,
    );
  }

  async listProducts(query: any) {
    const { page, pageSize, offset } = paging(query.page, query.pageSize);
    const where: any = {};
    const keyword = String(query.keyword || '').trim();
    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { platform_product_id: { [Op.like]: `%${keyword}%` } },
        { barcode: { [Op.like]: `%${keyword}%` } },
      ];
    }
    if (query.shop && query.shop !== 'all') where.shop_id = String(query.shop);
    if (query.status === 'on') where.on_sale = true;
    if (query.status === 'off') where.on_sale = false;
    const result = await ProductKnowledge.findAndCountAll({ where, limit: pageSize, offset, order: [['updated_at', 'DESC']] });
    return { list: result.rows.map(productJson), total: result.count, page, pageSize };
  }

  async createProduct(body: any, sync = true) {
    const input = validateProductKnowledgeInput(body);
    const item = await ProductKnowledge.create({
      id: crypto.randomUUID(),
      name: input.name,
      platform_product_id: input.platformProductId,
      barcode: input.barcode,
      shop_id: input.shopId,
      shop_name: input.shopName,
      tags: input.tags,
      on_sale: input.onSale,
      hue: Math.abs([...input.name].reduce((n, c) => n + c.charCodeAt(0), 0)) % 360,
      sync_status: 'pending',
      created_at: new Date(),
      updated_at: new Date(),
    });
    if (sync && item.on_sale) await this.syncProduct(item);
    return productJson(item);
  }

  async updateProduct(id: string, body: any) {
    const item = await ProductKnowledge.findByPk(id);
    if (!item) throw new Error('商品不存在');
    const input = validateProductKnowledgeInput(body);
    await item.update({
      name: input.name,
      platform_product_id: input.platformProductId,
      barcode: input.barcode,
      shop_id: input.shopId,
      shop_name: input.shopName,
      tags: input.tags,
      on_sale: input.onSale,
      sync_status: 'pending',
      sync_error: null,
      updated_at: new Date(),
    });
    if (item.on_sale) await this.syncProduct(item);
    return productJson(item);
  }

  async setProductsOnSale(ids: string[], onSale: boolean) {
    const [updated] = await ProductKnowledge.update(
      { on_sale: onSale, sync_status: 'pending', updated_at: new Date() },
      { where: { id: ids } },
    );
    return updated;
  }

  async deleteProducts(ids: string[]) {
    return ProductKnowledge.destroy({ where: { id: ids } });
  }

  async listStoreKnowledge(query: any) {
    const { page, pageSize, offset } = paging(query.page, query.pageSize);
    const where: any = {};
    const keyword = String(query.keyword || '').trim();
    if (keyword) where[Op.or] = [{ question: { [Op.like]: `%${keyword}%` } }, { answer: { [Op.like]: `%${keyword}%` } }];
    if (query.shop && query.shop !== 'all') where.shop_id = String(query.shop);
    if (query.stage && query.stage !== 'all') where.stage = String(query.stage);
    const [result, counts] = await Promise.all([
      StoreKnowledge.findAndCountAll({ where, limit: pageSize, offset, order: [['updated_at', 'DESC']] }),
      Promise.all(['presale', 'mid', 'aftersale'].map((stage) => StoreKnowledge.count({ where: { stage } }))),
    ]);
    return {
      list: result.rows.map(storeJson),
      total: result.count,
      stats: { total: counts.reduce((a, b) => a + b, 0), presale: counts[0], mid: counts[1], aftersale: counts[2] },
      page,
      pageSize,
    };
  }

  async createStoreKnowledge(body: any, sync = true) {
    const input = validateStoreKnowledgeInput(body);
    const item = await StoreKnowledge.create({
      id: crypto.randomUUID(),
      question: input.question,
      answer: input.answer,
      related_questions: input.relatedQuestions,
      tags: input.tags,
      stage: input.stage,
      match_type: input.matchType,
      shop_id: input.shopId,
      enabled: input.enabled,
      sync_status: 'pending',
      created_at: new Date(),
      updated_at: new Date(),
    });
    if (sync && item.enabled) await this.syncStore(item);
    return storeJson(item);
  }

  async updateStoreKnowledge(id: string, body: any) {
    const input = validateStoreKnowledgeInput(body);
    const item = await StoreKnowledge.findByPk(id);
    if (!item) throw new Error('知识条目不存在');
    await item.update({
      question: input.question,
      answer: input.answer,
      related_questions: input.relatedQuestions,
      tags: input.tags,
      stage: input.stage,
      match_type: input.matchType,
      shop_id: input.shopId,
      enabled: input.enabled,
      sync_status: 'pending',
      sync_error: null,
      updated_at: new Date(),
    });
    await this.syncStore(item);
    return storeJson(item);
  }

  async deleteStoreKnowledge(id: string) {
    return StoreKnowledge.destroy({ where: { id } });
  }

  async retrySync(kind: 'product' | 'store', id: string) {
    if (kind === 'product') {
      const item = await ProductKnowledge.findByPk(id);
      if (!item) throw new Error('商品不存在');
      await item.update({ sync_status: 'pending', sync_error: null });
      await this.syncProduct(item);
      return productJson(item);
    }
    const item = await StoreKnowledge.findByPk(id);
    if (!item) throw new Error('知识条目不存在');
    await item.update({ sync_status: 'pending', sync_error: null });
    await this.syncStore(item);
    return storeJson(item);
  }

  async importProducts(rows: any[]) {
    const results: Array<{ row: number; success: boolean; id?: string; error?: string }> = [];
    for (let index = 0; index < rows.slice(0, 2000).length; index += 1) {
      try {
        const item = await this.createProduct(rows[index], false);
        results.push({ row: index + 2, success: true, id: item.id });
      } catch (error) {
        results.push({ row: index + 2, success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }

  async importStoreKnowledge(rows: any[]) {
    const results: Array<{ row: number; success: boolean; id?: string; error?: string }> = [];
    for (let index = 0; index < rows.slice(0, 2000).length; index += 1) {
      try {
        const item = await this.createStoreKnowledge(rows[index], false);
        results.push({ row: index + 2, success: true, id: item.id });
      } catch (error) {
        results.push({ row: index + 2, success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }

  async exportKnowledge(
    kind: 'store' | 'product',
    query: any,
  ): Promise<KnowledgeExportRecord[]> {
    if (kind === 'product') {
      const where: any = {};
      const keyword = String(query.keyword || '').trim();
      if (keyword) {
        where[Op.or] = [
          { name: { [Op.like]: `%${keyword}%` } },
          { platform_product_id: { [Op.like]: `%${keyword}%` } },
          { barcode: { [Op.like]: `%${keyword}%` } },
        ];
      }
      if (query.shop && query.shop !== 'all') where.shop_id = String(query.shop);
      if (query.status === 'on') where.on_sale = true;
      if (query.status === 'off') where.on_sale = false;
      const rows = await ProductKnowledge.findAll({ where, order: [['updated_at', 'DESC']] });
      return rows.map((item) => ({
        id: item.id,
        kind: 'product',
        name: item.name,
        platformProductId: item.platform_product_id,
        barcode: item.barcode || undefined,
        shopId: item.shop_id,
        shopName: item.shop_name,
        tags: item.tags || [],
        enabled: item.on_sale,
        syncStatus: item.sync_status,
        syncError: item.sync_error || undefined,
        createdAt: item.created_at.toISOString(),
        updatedAt: item.updated_at.toISOString(),
      }));
    }

    const where: any = {};
    const keyword = String(query.keyword || '').trim();
    if (keyword) {
      where[Op.or] = [
        { question: { [Op.like]: `%${keyword}%` } },
        { answer: { [Op.like]: `%${keyword}%` } },
      ];
    }
    if (query.shop && query.shop !== 'all') where.shop_id = String(query.shop);
    if (query.stage && query.stage !== 'all') where.stage = String(query.stage);
    const rows = await StoreKnowledge.findAll({ where, order: [['updated_at', 'DESC']] });
    return rows.map((item) => ({
      id: item.id,
      kind: 'store',
      question: item.question,
      answer: item.answer,
      relatedQuestions: item.related_questions || [],
      tags: item.tags || [],
      shopId: item.shop_id,
      stage: item.stage,
      matchType: item.match_type,
      enabled: item.enabled,
      syncStatus: item.sync_status,
      syncError: item.sync_error || undefined,
      createdAt: item.created_at.toISOString(),
      updatedAt: item.updated_at.toISOString(),
    }));
  }
}
