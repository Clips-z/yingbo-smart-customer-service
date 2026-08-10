import {
  compareContext,
  CompanionContextSnapshot,
  ConversationDraftBinding,
} from './companionContext';

const MISMATCH_LABELS: Record<string, string> = {
  platformId: '平台', storeId: '店铺', accountId: '客服账号', contactId: '客户',
  chatFingerprint: '聊天窗口', productId: '咨询商品',
  incomingMessageFingerprint: '客户最新问题', contextRevision: '会话版本',
};

export function assertDeliveryContext(args: {
  draft: ConversationDraftBinding;
  live?: CompanionContextSnapshot;
}): void {
  if (!args.live || args.live.state !== 'stable') {
    throw new Error('当前接待对象尚未稳定确认，已阻止填入');
  }
  if (['sent', 'cancelled', 'expired'].includes(args.draft.state)) {
    throw new Error('该回复已结束，不能再次填入');
  }
  const comparison = compareContext(args.draft, args.live);
  // A context revision or pixel-level chat fingerprint may advance during a
  // periodic OCR/header refresh even when the operator is still serving the
  // exact same customer and question. Treat both as freshness metadata; the
  // concrete identity and incoming-message fields remain the safety boundary.
  const materialMismatches = comparison.mismatches.filter(
    (field) => !['contextRevision', 'chatFingerprint'].includes(field),
  );
  if (materialMismatches.length > 0) {
    const fields = materialMismatches
      .map((field) => MISMATCH_LABELS[field] || field)
      .join('、');
    throw new Error(`${fields}已经变化，旧回复已保留但不能填入当前会话`);
  }
}
