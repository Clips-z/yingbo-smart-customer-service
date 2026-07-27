import fs from 'fs';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import sqlite from 'sqlite3';
import { Sequelize } from 'sequelize';
import { BackupService } from '../../main/backend/services/backupService';
import { applyPendingRestore } from '../../main/backend/services/restoreService';
import { KnowledgeService } from '../../main/backend/services/knowledgeService';
import { initAuditEvent } from '../../main/backend/entities/auditEvent';
import { initStoreKnowledge, StoreKnowledge, checkAndAddFields as migrateStoreKnowledge } from '../../main/backend/entities/storeKnowledge';
import { initProductKnowledge } from '../../main/backend/entities/productKnowledge';
import { initKnowledgeVersion } from '../../main/backend/entities/knowledgeVersion';

const configure = (database: Sequelize) => {
  initAuditEvent(database); initStoreKnowledge(database); initProductKnowledge(database); initKnowledgeVersion(database);
};
const runSql = (filename: string, sql: string) => new Promise<void>((resolve, reject) => {
  const database = new sqlite.Database(filename, (error) => {
    if (error) { reject(error); return; }
    database.exec(sql, (queryError) => { database.close(); queryError ? reject(queryError) : resolve(); });
  });
});

describe('backup restore migration and RAG drill', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yingbo-restore-drill-'));
  const storage = path.join(directory, 'msg.db');

  afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

  it('restores the backup, runs schema migration, and produces a searchable RAG source', async () => {
    let database = new Sequelize({ dialect: 'sqlite', dialectModule: sqlite, storage, logging: false });
    configure(database); await database.sync();
    await StoreKnowledge.create({ id: 'shipping', question: 'When do you ship?', answer: 'We ship today.', related_questions: [], tags: [], stage: 'presale', match_type: 'fuzzy', shop_id: 'shop-1', platform_id: 'platform-1', enabled: true, sync_status: 'synced', created_at: new Date(), updated_at: new Date() });
    const backup = await new BackupService(database).create();
    const backupFile = path.join(directory, 'backups', backup.database);
    await runSql(backupFile, 'DROP INDEX IF EXISTS n_store_knowledge_platform_id_shop_id_stage; ALTER TABLE n_store_knowledge DROP COLUMN platform_id');
    const legacyManifest = { ...backup, sha256: crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex'), size: fs.statSync(backupFile).size };
    fs.writeFileSync(path.join(directory, 'backups', `${backup.id}.json`), JSON.stringify(legacyManifest));
    await StoreKnowledge.update({ answer: 'Changed after backup.' }, { where: { id: 'shipping' } });
    await new BackupService(database).scheduleRestore(backup.id);
    await database.close();

    expect(applyPendingRestore(directory)).toMatchObject({ restored: true, id: backup.id });
    expect(fs.existsSync(path.join(directory, 'restore-rag-pending.json'))).toBe(true);

    database = new Sequelize({ dialect: 'sqlite', dialectModule: sqlite, storage, logging: false });
    configure(database); await migrateStoreKnowledge(database); await database.sync();
    await expect(StoreKnowledge.findByPk('shipping')).resolves.toMatchObject({ answer: 'We ship today.', platform_id: 'unassigned' });
    const indexed: Array<{ text: string; filename: string }> = [];
    const knowledge = new KnowledgeService(database);
    knowledge.setRagRebuilder(async () => undefined);
    knowledge.setIndexer(async (text, filename) => { indexed.push({ text, filename }); });
    await expect(knowledge.rebuildRag()).resolves.toMatchObject({ stores: 1, failed: 0 });
    const ragHit = indexed.find((item) => item.text.includes('When do you ship?'));
    expect(ragHit).toMatchObject({ filename: 'store-qa-shipping.txt' });
    expect(ragHit?.text).toContain('We ship today.');
    await database.close();
  });
});
