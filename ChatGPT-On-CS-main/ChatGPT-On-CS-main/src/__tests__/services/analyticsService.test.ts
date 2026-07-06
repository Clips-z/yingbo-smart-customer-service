/**
 * AnalyticsService 单元测试 — 统计分析
 */
import { AnalyticsService } from '../../main/backend/services/analyticsService';
import { ReplySuggestion } from '../../main/backend/entities/replySuggestion';

jest.mock('../../main/backend/entities/replySuggestion');

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    service = new AnalyticsService();
    jest.clearAllMocks();
  });

  describe('getOverview', () => {
    it('should return stats for default 7 days', async () => {
      (ReplySuggestion.count as jest.Mock)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(20)  // pending
        .mockResolvedValueOnce(60)  // sent
        .mockResolvedValueOnce(5);  // failed

      const result = await service.getOverview();
      expect(result.total).toBe(100);
      expect(result.pending).toBe(20);
      expect(result.sent).toBe(60);
      expect(result.failed).toBe(5);
      expect(result.days).toBe(7);
    });
  });

  describe('getDailyTrend', () => {
    it('should return daily trend data', async () => {
      (ReplySuggestion.findAll as jest.Mock).mockResolvedValue([
        { date: '2024-01-01', count: 10 },
        { date: '2024-01-02', count: 15 },
      ]);

      const result = await service.getDailyTrend(7);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ date: '2024-01-01', count: 10 });
    });
  });

  describe('getPlatformDistribution', () => {
    it('should return platform distribution', async () => {
      (ReplySuggestion.findAll as jest.Mock).mockResolvedValue([
        { platform_id: 'win_wechat', count: 50 },
        { platform_id: 'win_qianniu', count: 30 },
      ]);

      const result = await service.getPlatformDistribution(7);
      expect(result).toHaveLength(2);
      expect(result[0].platformName).toBe('微信');
      expect(result[1].platformName).toBe('千牛');
    });
  });

  describe('getStatusDistribution', () => {
    it('should return status distribution with Chinese labels', async () => {
      (ReplySuggestion.findAll as jest.Mock).mockResolvedValue([
        { status: 'pending', count: 20 },
        { status: 'sent', count: 60 },
        { status: 'dismissed', count: 15 },
      ]);

      const result = await service.getStatusDistribution(7);
      expect(result).toHaveLength(3);
      expect(result[0].label).toBe('待回复');
      expect(result[1].label).toBe('已发送');
    });
  });

  describe('getTopSenders', () => {
    it('should return top N senders', async () => {
      (ReplySuggestion.findAll as jest.Mock).mockResolvedValue([
        { sender: '客户A', count: 25 },
        { sender: '客户B', count: 18 },
        { sender: '客户C', count: 10 },
      ]);

      const result = await service.getTopSenders(30, 3);
      expect(result).toHaveLength(3);
      expect(result[0].sender).toBe('客户A');
      expect(result[0].count).toBe(25);
    });
  });
});
