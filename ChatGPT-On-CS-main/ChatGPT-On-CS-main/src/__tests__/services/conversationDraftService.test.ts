import {
  assertDraftRevision,
  MAX_DRAFT_LENGTH,
  normalizeDraftContent,
} from '../../main/backend/services/conversationDraftService';

describe('conversation draft validation', () => {
  test('keeps edited reply text for later restoration', () => {
    expect(normalizeDraftContent('  客服手动编辑后的回复  ')).toBe(
      '客服手动编辑后的回复',
    );
  });

  test('rejects empty and oversized drafts', () => {
    expect(() => normalizeDraftContent('   ')).toThrow('不能为空');
    expect(() => normalizeDraftContent('a'.repeat(MAX_DRAFT_LENGTH + 1))).toThrow(
      `不能超过 ${MAX_DRAFT_LENGTH} 字`,
    );
  });

  test('allows legacy suggestions without a context revision', () => {
    expect(() => assertDraftRevision(null, undefined)).not.toThrow();
  });

  test('rejects a late edit from an old context revision', () => {
    expect(() => assertDraftRevision(8, 7)).toThrow('会话已经变化');
    expect(() => assertDraftRevision(8, 8)).not.toThrow();
  });
});

