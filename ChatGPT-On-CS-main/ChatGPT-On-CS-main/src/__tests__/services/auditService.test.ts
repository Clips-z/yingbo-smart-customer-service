import sqlite from 'sqlite3';
import { Sequelize } from 'sequelize';
import { initAuditEvent } from '../../main/backend/entities/auditEvent';
import { appendAuditEvent, listAuditEvents, serializeAuditExport } from '../../main/backend/services/auditService';

describe('audit service', () => {
  let database: Sequelize;
  beforeEach(async () => {
    database = new Sequelize({ dialect: 'sqlite', dialectModule: sqlite, storage: ':memory:', logging: false });
    initAuditEvent(database);
    await database.sync();
    await appendAuditEvent({ action: 'knowledge.update', entityType: 'store-knowledge', entityId: 'a-1', payload: { token: 'hidden', note: 'safe' } });
    await appendAuditEvent({ action: 'backup.create', entityType: 'backup', entityId: 'b-1' });
    await appendAuditEvent({ action: 'knowledge.rollback', entityType: 'product-knowledge', entityId: 'a-2' });
  });
  afterEach(async () => database.close());

  it('filters and paginates audit events', async () => {
    await expect(listAuditEvents({ action: 'knowledge.', page: 2, pageSize: 1 })).resolves.toMatchObject({ total: 2, page: 2, pageSize: 1, items: [expect.objectContaining({ action: 'knowledge.update' })] });
  });

  it('exports only public audit fields as UTF-8 CSV and JSON', async () => {
    const { items } = await listAuditEvents({ pageSize: 20 });
    const csv = serializeAuditExport('csv', items);
    const json = serializeAuditExport('json', items);
    expect(csv.body).toContain('\uFEFFID,操作');
    expect(csv.body).not.toContain('hidden');
    expect(json.body).not.toContain('"payload"');
    expect(json.body).not.toContain('hidden');
  });
});
