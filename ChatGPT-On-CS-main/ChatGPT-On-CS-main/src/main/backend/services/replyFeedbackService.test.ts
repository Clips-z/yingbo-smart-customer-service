import { buildDailyReplyMetrics } from './replyFeedbackService';

describe('buildDailyReplyMetrics', () => {
  it('fills missing days and counts accepted feedback only inside the range', () => {
    const now = new Date(2026, 6, 28, 12);
    const result = buildDailyReplyMetrics([
      { action: 'sent', created_at: new Date(2026, 6, 24, 9) },
      { action: 'copied', created_at: new Date(2026, 6, 24, 10) },
      { action: 'filled', created_at: new Date(2026, 6, 28, 9) },
      { action: 'sent', created_at: new Date(2026, 6, 20, 9) },
    ], 5, now);

    expect(result).toEqual([
      { date: '2026-07-24', totalActions: 2, accepted: 1 },
      { date: '2026-07-25', totalActions: 0, accepted: 0 },
      { date: '2026-07-26', totalActions: 0, accepted: 0 },
      { date: '2026-07-27', totalActions: 0, accepted: 0 },
      { date: '2026-07-28', totalActions: 1, accepted: 1 },
    ]);
  });
});
