import {
  QianniuCompanionContext,
  ReplySuggestion,
} from '../common/services/platform/platform';

export function selectCompanionSuggestion(
  context: QianniuCompanionContext | undefined,
  suggestions: ReplySuggestion[],
): ReplySuggestion | undefined {
  if (!context || context.state !== 'stable') return undefined;
  const exact = context.draftKey
    ? suggestions.find((item) => item.draft_key === context.draftKey)
    : undefined;
  if (exact) return exact;
  if (!context.conversationKey) return undefined;
  return suggestions
    .filter((item) => item.conversation_key === context.conversationKey)
    .sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime(),
    )[0];
}
