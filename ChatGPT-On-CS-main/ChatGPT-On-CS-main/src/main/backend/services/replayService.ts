import { evaluateAutomaticDelivery, getMinimumOcrConfidence } from './replySafetyPolicy';
import crypto from 'crypto';
import { ReplayFixture } from '../entities/replayFixture';
import { appendAuditEvent } from './auditService';

const normalizedFixtures = (fixtures: unknown) => (Array.isArray(fixtures) ? fixtures : []).slice(0, 500).map((fixture: any) => ({
  platformId: String(fixture.platformId || 'win_qianniu').slice(0, 100),
  source: String(fixture.source || 'llm').slice(0, 50),
  retrievalStatus: String(fixture.retrievalStatus || 'no_hit').slice(0, 50),
  ocrConfidence: Number(fixture.ocrConfidence),
  safeToAutoSend: fixture.safeToAutoSend !== false,
  conversationStable: fixture.conversationStable !== false,
  expectedAllowed: fixture.expectedAllowed === true,
  content: String(fixture.content || '').replace(/(?:1\d{10}|[\w.+-]+@[\w.-]+)/g, '[已脱敏]').slice(0, 300),
}));

export async function saveReplayFixture(body: any) {
  const name = String(body.name || '').trim().slice(0, 120);
  const fixtures = normalizedFixtures(body.fixtures);
  if (!name || !fixtures.length) throw new Error('回放名称和用例不能为空');
  const values = { name, fixtures, updated_at: new Date() };
  const item = body.id ? await ReplayFixture.findByPk(String(body.id)) : undefined;
  const saved = item ? await item.update(values) : await ReplayFixture.create({ id: crypto.randomUUID(), ...values, created_at: new Date() });
  await appendAuditEvent({ action: 'replay.save', entityType: 'replay-fixture', entityId: saved.id, payload: { count: fixtures.length } });
  return saved;
}

export const listReplayFixtures = () => ReplayFixture.findAll({ order: [['updated_at', 'DESC']] });
export async function deleteReplayFixture(id: string) {
  const deleted = await ReplayFixture.destroy({ where: { id } });
  if (deleted) await appendAuditEvent({ action: 'replay.delete', entityType: 'replay-fixture', entityId: id });
  return deleted;
}

export function replaySanitizedFixtures(fixtures: any[]) {
  return normalizedFixtures(fixtures).map((fixture, index) => {
    const platformId = String(fixture.platformId || 'win_qianniu');
    const decision = evaluateAutomaticDelivery({
      safeToAutoSend: fixture.safeToAutoSend !== false,
      source: String(fixture.source || 'llm'),
      retrievalStatus: String(fixture.retrievalStatus || 'no_hit'),
      ocrConfidence: Number(fixture.ocrConfidence),
      minimumOcrConfidence: getMinimumOcrConfidence(platformId),
      conversationStable: fixture.conversationStable !== false,
      content: String(fixture.content || '').slice(0, 300),
    });
    const expectedAllowed = fixture.expectedAllowed === true;
    return {
      index,
      platformId,
      expectedAllowed,
      actualAllowed: decision.allowed,
      passed: decision.allowed === expectedAllowed,
      reason: decision.allowed ? 'allowed' : decision.code,
    };
  });
}
