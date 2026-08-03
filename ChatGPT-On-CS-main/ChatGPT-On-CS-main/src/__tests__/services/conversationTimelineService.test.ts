import { timelineState, toTimelineEntry } from '../../main/backend/services/conversationTimelineService';

const suggestion = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  platform_id: 'win_qianniu',
  store_id: 'store-a',
  account_id: 'agent-a',
  contact_id: 'buyer-1',
  sender: 'buyer-1',
  incoming_content: '这个有货吗',
  reply_content: '有现货，可以直接下单。',
  final_reply_content: null,
  status: 'pending' as const,
  draft_state: 'draft',
  product_id: null,
  product_title: null,
  incoming_message_fingerprint: 'fingerprint-1',
  context_revision: 2,
  created_at: new Date('2026-08-03T00:00:00.000Z'),
  updated_at: new Date('2026-08-03T00:00:01.000Z'),
  ...overrides,
});

describe('ConversationTimelineService', () => {
  test('maps a suggestion to a customer question and answer pair', () => {
    expect(toTimelineEntry(suggestion())).toMatchObject({
      question: '这个有货吗',
      answer: '有现货，可以直接下单。',
      state: 'suggested',
      contactId: 'buyer-1',
    });
  });

  test('preserves delivery state in the timeline', () => {
    expect(timelineState({ status: 'sent', draft_state: 'sent' })).toBe('sent');
    expect(timelineState({ status: 'failed', draft_state: 'failed' })).toBe('failed');
    expect(timelineState({ status: 'prepared', draft_state: 'filled' })).toBe('filled');
    expect(timelineState({ status: 'dismissed', draft_state: 'cancelled' })).toBe('dismissed');
  });
});
