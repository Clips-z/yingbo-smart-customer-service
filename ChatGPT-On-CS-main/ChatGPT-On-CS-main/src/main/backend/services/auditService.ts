import crypto from 'crypto';
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

export async function listAuditEvents(limit = 200) {
  return AuditEvent.findAll({ limit: Math.min(1000, Math.max(1, limit)), order: [['created_at', 'DESC']] });
}
