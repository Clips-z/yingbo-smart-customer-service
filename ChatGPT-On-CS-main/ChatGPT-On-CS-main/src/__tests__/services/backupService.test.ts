import fs from 'fs';
import os from 'os';
import path from 'path';
import sqlite from 'sqlite3';
import { Sequelize } from 'sequelize';
import { initAuditEvent } from '../../main/backend/entities/auditEvent';
import { BackupService } from '../../main/backend/services/backupService';

describe('BackupService', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yingbo-backup-'));
  const storage = path.join(directory, 'msg.db');
  let database: Sequelize;

  beforeEach(async () => {
    database = new Sequelize({ dialect: 'sqlite', dialectModule: sqlite, storage, logging: false });
    initAuditEvent(database);
    await database.sync();
  });
  afterEach(async () => database.close());
  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('creates, verifies, and schedules a checked restore', async () => {
    const service = new BackupService(database);
    const backup = await service.create();
    await expect(service.verify(backup.id)).resolves.toMatchObject({ valid: true, integrityValid: true, sha256: backup.sha256 });
    await expect(service.scheduleRestore(backup.id)).resolves.toMatchObject({ scheduled: true, restartRequired: true });
    expect(fs.existsSync(path.join(directory, 'restore-pending.json'))).toBe(true);
  });

  it('rejects a damaged backup before scheduling restore', async () => {
    const service = new BackupService(database);
    const backup = await service.create();
    fs.appendFileSync(path.join(directory, 'backups', `${backup.id}.db`), 'damaged');
    await expect(service.verify(backup.id)).resolves.toMatchObject({ valid: false });
    await expect(service.scheduleRestore(backup.id)).rejects.toThrow('备份校验失败');
  });
});
