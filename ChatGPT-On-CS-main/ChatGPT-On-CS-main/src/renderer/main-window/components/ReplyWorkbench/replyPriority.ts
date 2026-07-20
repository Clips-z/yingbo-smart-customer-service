import { ReplySuggestion } from '../../../common/services/platform/platform';

export function replyAgeMinutes(item: ReplySuggestion, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(item.created_at).getTime()) / 60000));
}

export function replyPriority(item: ReplySuggestion, now = Date.now()) {
  const age = replyAgeMinutes(item, now);
  return (item.status === 'failed' ? 10000 : 0)
    + (item.risk_level === 'high' ? 5000 : 0)
    + (['pending', 'failed'].includes(item.status) && age >= 5 ? 2000 : 0)
    + Math.min(age, 1000);
}

export function sortReplies(items: ReplySuggestion[], mode: 'priority' | 'newest' | 'oldest', now = Date.now()) {
  return [...items].sort((left, right) => {
    if (mode === 'priority') return replyPriority(right, now) - replyPriority(left, now) || new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
    const delta = new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    return mode === 'newest' ? delta : -delta;
  });
}
