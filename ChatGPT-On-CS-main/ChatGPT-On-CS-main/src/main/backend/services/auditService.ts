import crypto from 'crypto';
import { Op } from 'sequelize';
import { AuditEvent } from '../entities/auditEvent';

const safePayload = (payload: Record<string, unknown>) => Object.fromEntries(
  Object.entries(payload).filter(([key]) => !/key|token|secret|password/i.test(key)).slice(0, 50),
);

export async function appendAuditEvent(input: {
  action: string;
  entityType: string;
  entityId: string;
  actor?: string;
  payload?: Record<string, unknown>;
}) {
  const previous = await AuditEvent.findOne({ order: [['created_at', 'DESC'], ['id', 'DESC']] });
  const createdAt = new Date();
  const payload = safePayload(input.payload || {});
  const previousHash = previous?.event_hash || '';
  const canonical = JSON.stringify([input.action, input.entityType, input.entityId, input.actor || 'local-admin', payload, previousHash, createdAt.toISOString()]);
  return AuditEvent.create({
    id: crypto.randomUUID(), action: input.action, entity_type: input.entityType,
    entity_id: input.entityId, actor: input.actor || 'local-admin', payload,
    previous_hash: previousHash, event_hash: crypto.createHash('sha256').update(canonical).digest('hex'),
    created_at: createdAt,
  });
}

export interface AuditQuery {
  keyword?: unknown;
  action?: unknown;
  page?: unknown;
  pageSize?: unknown;
}

export const auditPaging = (query: AuditQuery) => ({
  page: Math.max(1, Number(query.page) || 1),
  pageSize: Math.min(200, Math.max(1, Number(query.pageSize) || 20)),
});

const auditWhere = (query: AuditQuery) => {
  const keyword = String(query.keyword || '').trim();
  const action = String(query.action || '').trim();
  const where: Record<string | symbol, unknown> = {};
  if (action) where.action = { [Op.like]: `${action}%` };
  if (keyword) where[Op.or] = ['action', 'entity_type', 'entity_id', 'actor'].map((field) => ({ [field]: { [Op.like]: `%${keyword}%` } }));
  return where;
};

export async function listAuditEvents(query: AuditQuery = {}) {
  const { page, pageSize } = auditPaging(query);
  const result = await AuditEvent.findAndCountAll({ where: auditWhere(query), limit: pageSize, offset: (page - 1) * pageSize, order: [['created_at', 'DESC'], ['id', 'DESC']] });
  return { items: result.rows, total: result.count, page, pageSize };
}

export type AuditExportFormat = 'csv' | 'json';
export const auditExportRows = (items: AuditEvent[]) => items.map((item) => ({
  id: item.id, action: item.action, entityType: item.entity_type, entityId: item.entity_id,
  actor: item.actor, previousHash: item.previous_hash, eventHash: item.event_hash,
  createdAt: item.created_at.toISOString(),
}));

const csv = (value: unknown) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function serializeAuditExport(format: AuditExportFormat, items: AuditEvent[]) {
  const rows = auditExportRows(items);
  if (format === 'json') return { extension: 'json', contentType: 'application/json; charset=utf-8', body: JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), count: rows.length, items: rows }, null, 2) };
  const headers = ['ID', '操作', '对象类型', '对象 ID', '操作人', '前序摘要', '校验摘要', '时间'];
  return { extension: 'csv', contentType: 'text/csv; charset=utf-8', body: `\uFEFF${[headers, ...rows.map((row) => [row.id, row.action, row.entityType, row.entityId, row.actor, row.previousHash, row.eventHash, row.createdAt])].map((row) => row.map(csv).join(',')).join('\r\n')}` };
}
