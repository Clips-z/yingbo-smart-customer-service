import { sortReplies } from '../../renderer/main-window/components/ReplyWorkbench/replyPriority';

const item = (id: number, status: any, minutes: number, risk?: string) => ({
  id, status, risk_level: risk, created_at: new Date(Date.now() - minutes * 60000).toISOString(),
}) as any;

describe('reply priority', () => {
  it('puts failures, high-risk items, and overdue pending replies first', () => {
    const sorted = sortReplies([
      item(1, 'pending', 1), item(2, 'pending', 10), item(3, 'failed', 2), item(4, 'pending', 3, 'high'),
    ], 'priority');
    expect(sorted.map((entry) => entry.id)).toEqual([3, 4, 2, 1]);
  });
});
