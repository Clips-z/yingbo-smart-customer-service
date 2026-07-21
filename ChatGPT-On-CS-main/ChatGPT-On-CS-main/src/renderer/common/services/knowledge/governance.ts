import { GET, POST } from '../common/api/request';

export interface BackupManifest { id: string; size: number; sha256: string; createdAt: string; valid?: boolean }
export interface AuditItem { id: string; action: string; entity_type: string; entity_id: string; actor: string; event_hash: string; created_at: string }

export async function fetchBackups() {
  const response = await GET<{ data: BackupManifest[] }>('/api/v1/governance/backups');
  return response.data;
}
export async function createBackup() {
  const response = await POST<{ data: BackupManifest }>('/api/v1/governance/backups/create', {});
  return response.data;
}
export async function verifyBackup(id: string) {
  const response = await POST<{ data: BackupManifest }>('/api/v1/governance/backups/verify', { id });
  return response.data;
}
export async function scheduleBackupRestore(id: string) {
  return POST('/api/v1/governance/backups/restore', { id });
}
export async function fetchAudit() {
  const response = await GET<{ data: AuditItem[] }>('/api/v1/governance/audit', { limit: 200 });
  return response.data;
}
export async function replayFixtures(fixtures: unknown[]) {
  const response = await POST<{ data: { total: number; passed: number; rows: any[] } }>('/api/v1/quality/replay', { fixtures });
  return response.data;
}
export async function rebuildKnowledgeRag() {
  const response = await POST<{ data: { products: number; stores: number; failed: number } }>('/api/v1/knowledge/rebuild-rag', {});
  return response.data;
}
