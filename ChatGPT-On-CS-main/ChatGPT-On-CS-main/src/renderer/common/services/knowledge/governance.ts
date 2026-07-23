import { GET, POST } from '../common/api/request';

export interface BackupManifest { id: string; size: number; sha256: string; createdAt: string; valid?: boolean }
export interface AuditItem { id: string; action: string; entity_type: string; entity_id: string; actor: string; event_hash: string; created_at: string; payload?: Record<string, any> }
export interface AuditPage { items: AuditItem[]; total: number; page: number; pageSize: number }
export interface AuditFilters { keyword?: string; action?: string; page?: number; pageSize?: number }

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
export async function fetchAudit(filters: AuditFilters = {}) {
  const response = await GET<{ data: AuditPage }>('/api/v1/governance/audit', filters);
  return response.data;
}
export async function downloadAuditExport(format: 'csv' | 'json', filters: AuditFilters = {}) {
  const params = new URLSearchParams({ format, ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)])) });
  const response = await fetch(`http://127.0.0.1:${window.electron.getPort()}/api/v1/governance/audit/export?${params}`);
  if (!response.ok) throw new Error(`导出失败 (${response.status})`);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `迎波-审计记录-${new Date().toISOString().slice(0, 10)}.${format}`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}
export async function replayFixtures(fixtures: unknown[]) {
  const response = await POST<{ data: { total: number; passed: number; rows: any[] } }>('/api/v1/quality/replay', { fixtures });
  return response.data;
}
export async function rebuildKnowledgeRag() {
  const response = await POST<{ data: { products: number; stores: number; failed: number } }>('/api/v1/knowledge/rebuild-rag', {});
  return response.data;
}
