export type KnowledgeExportKind = 'store' | 'product';
export type KnowledgeExportFormat = 'csv' | 'json';

export async function downloadKnowledgeExport(
  kind: KnowledgeExportKind,
  format: KnowledgeExportFormat,
  filters: Record<string, string> = {},
) {
  const params = new URLSearchParams({ kind, format, ...filters });
  const response = await fetch(
    `http://127.0.0.1:${window.electron.getPort()}/api/v1/knowledge/export?${params.toString()}`,
  );
  if (!response.ok) throw new Error(`导出失败 (${response.status})`);
  const blob = await response.blob();
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `迎波-${kind === 'store' ? '店铺问答' : '商品知识'}-${date}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
