import crypto from 'crypto';
import { Op } from 'sequelize';
import { ReplyFeedback } from '../entities/replyFeedback';
import { ReplySuggestion } from '../entities/replySuggestion';

export type ReplyFeedbackAction =
  | 'generated'
  | 'draft_saved'
  | 'copied'
  | 'filled'
  | 'sent'
  | 'dismissed'
  | 'restored'
  | 'failed'
  | 'transferred'
  | 'evidence_irrelevant';

export interface RecordReplyFeedbackInput {
  suggestionId: number;
  eventKey?: string;
  action: ReplyFeedbackAction;
  finalContent?: string | null;
  reasonCode?: string | null;
  metadata?: Record<string, unknown>;
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

export function calculateEditRatio(original: string, finalContent: string): number {
  const maxLength = Math.max(original.length, finalContent.length);
  if (maxLength === 0) return 0;
  return Math.round((levenshteinDistance(original, finalContent) / maxLength) * 10000) / 10000;
}

function normalizedMetadata(value: Record<string, unknown> | undefined) {
  if (!value) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !/key|token|secret|password/i.test(key))
      .slice(0, 30),
  );
}

export class ReplyFeedbackService {
  async record(input: RecordReplyFeedbackInput) {
    const suggestion = await ReplySuggestion.findByPk(input.suggestionId);
    if (!suggestion) throw new Error('回复建议不存在');

    const eventKey = String(input.eventKey || crypto.randomUUID()).slice(0, 160);
    const existing = await ReplyFeedback.findOne({ where: { event_key: eventKey } });
    if (existing) return { feedback: existing, created: false };

    const original = suggestion.original_reply_content || suggestion.reply_content || '';
    const finalContent = input.finalContent == null
      ? null
      : String(input.finalContent).trim().slice(0, 300);
    const feedback = await ReplyFeedback.create({
      id: crypto.randomUUID(),
      suggestion_id: suggestion.id,
      event_key: eventKey,
      action: input.action,
      original_content: original || null,
      final_content: finalContent,
      edit_ratio: finalContent == null ? null : calculateEditRatio(original, finalContent),
      reason_code: input.reasonCode ? String(input.reasonCode).slice(0, 64) : null,
      metadata: normalizedMetadata(input.metadata),
      created_at: new Date(),
    });

    if (finalContent != null) {
      await suggestion.update({
        final_reply_content: finalContent,
        updated_at: new Date(),
      });
    }
    return { feedback, created: true };
  }

  async getMetrics(days = 7) {
    const safeDays = Math.min(365, Math.max(1, Number(days) || 7));
    const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
    const rows = await ReplyFeedback.findAll({
      where: { created_at: { [Op.gte]: since } },
      attributes: ['action', 'edit_ratio'],
      raw: true,
    }) as unknown as Array<{ action: string; edit_ratio: number | null }>;
    const count = (...actions: string[]) => rows.filter((row) => actions.includes(row.action)).length;
    const editedRows = rows.filter((row) => Number(row.edit_ratio || 0) > 0.05);
    return {
      days: safeDays,
      totalActions: rows.length,
      accepted: count('filled', 'sent'),
      copied: count('copied'),
      edited: editedRows.length,
      dismissed: count('dismissed'),
      transferred: count('transferred'),
      failed: count('failed'),
      irrelevantEvidence: count('evidence_irrelevant'),
      averageEditRatio: editedRows.length
        ? Math.round((editedRows.reduce((sum, row) => sum + Number(row.edit_ratio), 0) / editedRows.length) * 10000) / 10000
        : 0,
    };
  }

  async getVariantMetrics(days = 30) {
    const since = new Date(Date.now() - Math.min(365, Math.max(1, Number(days) || 30)) * 24 * 60 * 60 * 1000);
    const rows = await ReplyFeedback.findAll({ where: { created_at: { [Op.gte]: since } } });
    const suggestions = await ReplySuggestion.findAll({
      where: { id: { [Op.in]: [...new Set(rows.map((row) => row.suggestion_id))] } },
      attributes: ['id', 'model_name', 'prompt_version'],
    });
    const byId = new Map(suggestions.map((item) => [item.id, item]));
    const groups = new Map<string, { variant: string; totalActions: number; accepted: number; edited: number; editTotal: number }>();
    rows.forEach((row) => {
      const suggestion = byId.get(row.suggestion_id);
      const variant = `${suggestion?.model_name || '未知模型'} / ${suggestion?.prompt_version || '默认提示词'}`;
      const group = groups.get(variant) || { variant, totalActions: 0, accepted: 0, edited: 0, editTotal: 0 };
      group.totalActions += 1;
      if (['filled', 'sent'].includes(row.action)) group.accepted += 1;
      if (Number(row.edit_ratio || 0) > 0.05) { group.edited += 1; group.editTotal += Number(row.edit_ratio); }
      groups.set(variant, group);
    });
    return [...groups.values()].map((group) => ({
      ...group,
      acceptanceRate: group.totalActions ? Math.round(group.accepted / group.totalActions * 1000) / 10 : 0,
      averageEditRatio: group.edited ? Math.round(group.editTotal / group.edited * 10000) / 10000 : 0,
    })).sort((left, right) => right.totalActions - left.totalActions);
  }
}
