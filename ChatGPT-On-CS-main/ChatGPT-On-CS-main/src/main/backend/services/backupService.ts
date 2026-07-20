import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Sequelize } from 'sequelize';
import { appendAuditEvent } from './auditService';

const hashFile = async (filename: string) =>
  crypto.createHash('sha256').update(await fs.readFile(filename)).digest('hex');

export class BackupService {
  private databaseFile: string;
  private backupDir: string;

  constructor(private sequelize: Sequelize) {
    this.databaseFile = path.resolve(String((sequelize.options as any).storage));
    this.backupDir = path.join(path.dirname(this.databaseFile), 'backups');
  }

  async create() {
    await fs.mkdir(this.backupDir, { recursive: true });
    await this.sequelize.query('PRAGMA wal_checkpoint(FULL)');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = `msg-${stamp}`;
    const database = path.join(this.backupDir, `${id}.db`);
    await fs.copyFile(this.databaseFile, database);
    const manifest = {
      id,
      database: path.basename(database),
      sha256: await hashFile(database),
      size: (await fs.stat(database)).size,
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
    };
    await fs.writeFile(path.join(this.backupDir, `${id}.json`), JSON.stringify(manifest, null, 2), 'utf8');
    await appendAuditEvent({ action: 'backup.create', entityType: 'backup', entityId: id, payload: { size: manifest.size, sha256: manifest.sha256 } });
    return manifest;
  }

  async list() {
    await fs.mkdir(this.backupDir, { recursive: true });
    const files = (await fs.readdir(this.backupDir)).filter((name) => /^msg-.*\.json$/.test(name));
    const rows = [];
    for (const filename of files) {
      try { rows.push(JSON.parse(await fs.readFile(path.join(this.backupDir, filename), 'utf8'))); }
      catch { /* ignore invalid manifests */ }
    }
    return rows.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  }

  async verify(id: string) {
    const safeId = path.basename(id);
    if (safeId !== id || !/^msg-[\w-]+$/.test(safeId)) throw new Error('备份标识无效');
    const manifest = JSON.parse(await fs.readFile(path.join(this.backupDir, `${safeId}.json`), 'utf8'));
    const database = path.join(this.backupDir, path.basename(manifest.database));
    const actualHash = await hashFile(database);
    const header = (await fs.readFile(database)).subarray(0, 16).toString('utf8');
    const valid = actualHash === manifest.sha256
      && header === 'SQLite format 3\u0000'
      && manifest.schemaVersion === 1;
    return { ...manifest, valid, actualHash, sqliteHeaderValid: header === 'SQLite format 3\u0000' };
  }

  async scheduleRestore(id: string) {
    const verified = await this.verify(id);
    if (!verified.valid) throw new Error('备份校验失败，不能恢复');
    await fs.writeFile(path.join(path.dirname(this.databaseFile), 'restore-pending.json'), JSON.stringify({ id, database: verified.database, sha256: verified.sha256 }), 'utf8');
    await appendAuditEvent({ action: 'backup.restore_scheduled', entityType: 'backup', entityId: id });
    return { scheduled: true, restartRequired: true };
  }
}
