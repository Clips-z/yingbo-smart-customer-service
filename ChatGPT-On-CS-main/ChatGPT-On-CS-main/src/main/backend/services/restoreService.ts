import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export type RestoreResult = { restored: boolean; id?: string; restoredAt?: string; reason?: string };

export function applyPendingRestore(appDir: string): RestoreResult {
  const marker = path.join(appDir, 'restore-pending.json');
  if (!fs.existsSync(marker)) return { restored: false, reason: 'no_pending_restore' };
  try {
    const request = JSON.parse(fs.readFileSync(marker, 'utf8'));
    const backupDir = path.join(appDir, 'backups');
    const source = path.resolve(backupDir, path.basename(String(request.database || '')));
    if (!source.startsWith(`${path.resolve(backupDir)}${path.sep}`) || !fs.existsSync(source)) return { restored: false, reason: 'backup_missing' };
    const actual = crypto.createHash('sha256').update(fs.readFileSync(source) as crypto.BinaryLike).digest('hex');
    if (actual !== request.sha256) return { restored: false, reason: 'hash_mismatch' };
    const database = path.join(appDir, 'msg.db');
    if (fs.existsSync(database)) fs.copyFileSync(database, path.join(backupDir, `pre-restore-${Date.now()}.db`));
    fs.copyFileSync(source, database);
    const restoredAt = new Date().toISOString();
    fs.writeFileSync(path.join(appDir, 'restore-rag-pending.json'), JSON.stringify({ id: String(request.id || ''), restoredAt }), 'utf8');
    return { restored: true, id: String(request.id || ''), restoredAt };
  } catch {
    return { restored: false, reason: 'invalid_request' };
  } finally {
    fs.unlinkSync(marker);
  }
}
