import { ReplySuggestion } from '../entities/replySuggestion';

export const MAX_DRAFT_LENGTH = 300;

export function normalizeDraftContent(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('回复草稿格式无效');
  }
  const content = value.trim();
  if (!content) throw new Error('回复草稿不能为空');
  if (content.length > MAX_DRAFT_LENGTH) {
    throw new Error(`回复草稿不能超过 ${MAX_DRAFT_LENGTH} 字`);
  }
  return content;
}

export function assertDraftRevision(
  storedRevision: number | null,
  requestedRevision: unknown,
): void {
  if (storedRevision === null) return;
  const revision = Number(requestedRevision);
  if (!Number.isInteger(revision) || revision !== storedRevision) {
    throw new Error('会话已经变化，旧草稿已保留但不能覆盖当前回复');
  }
}

export async function saveConversationDraft(args: {
  suggestion: ReplySuggestion;
  content: unknown;
  contextRevision: unknown;
}): Promise<ReplySuggestion> {
  const content = normalizeDraftContent(args.content);
  assertDraftRevision(args.suggestion.context_revision, args.contextRevision);
  await args.suggestion.update({
    draft_content: content,
    draft_state: 'draft',
    draft_updated_at: new Date(),
    updated_at: new Date(),
  });
  return args.suggestion;
}

