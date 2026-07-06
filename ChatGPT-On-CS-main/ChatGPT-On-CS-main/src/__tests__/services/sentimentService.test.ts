/**
 * SentimentService 单元测试 — 情绪分析
 */
import { SentimentService } from '../../main/backend/services/sentimentService';

describe('SentimentService', () => {
  let service: SentimentService;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    service = new SentimentService(mockLogger);
  });

  describe('quickDetect (via analyze with high confidence)', () => {
    it('should detect angry sentiment with multiple anger keywords', async () => {
      const result = await service.analyze(
        [{ role: 'user', content: '你们太垃圾了，我要投诉退款，骗子！' }],
        { baseUrl: 'https://test.com', key: 'test', model: 'test' },
      );
      expect(result.sentiment).toBe('angry');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should detect urgent sentiment', async () => {
      const result = await service.analyze(
        [{ role: 'user', content: '在吗在吗？快回复，我很着急，今天能发货吗？' }],
        { baseUrl: 'https://test.com', key: 'test', model: 'test' },
      );
      expect(result.sentiment).toBe('urgent');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should detect negative sentiment', async () => {
      const result = await service.analyze(
        [{ role: 'user', content: '太慢了，不满意，怎么还没发货？' }],
        { baseUrl: 'https://test.com', key: 'test', model: 'test' },
      );
      expect(result.sentiment).toBe('negative');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should detect positive sentiment', async () => {
      const result = await service.analyze(
        [{ role: 'user', content: '谢谢，好的，太好了！' }],
        { baseUrl: 'https://test.com', key: 'test', model: 'test' },
      );
      expect(result.sentiment).toBe('positive');
    });

    it('should return neutral for plain messages', async () => {
      const result = await service.analyze(
        [{ role: 'user', content: '你好，这个多少钱' }],
        { baseUrl: 'https://test.com', key: 'test', model: 'test' },
      );
      expect(result.sentiment).toBe('neutral');
    });
  });
});
