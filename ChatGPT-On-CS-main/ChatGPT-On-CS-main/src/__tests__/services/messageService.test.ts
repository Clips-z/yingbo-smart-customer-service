/**
 * MessageService 单元测试 — 关键词匹配、默认回复、替换关键词
 */
import { MessageService } from '../../main/backend/services/messageService';

// Mock 依赖
jest.mock('../../main/backend/controllers/keywordReplyController');
jest.mock('../../main/backend/services/loggerService');
jest.mock('../../main/backend/services/visionService');
jest.mock('../../main/backend/services/sentimentService');
jest.mock('../../main/gptproxy', () => ({}));
jest.mock('openai', () => ({}), { virtual: true });
jest.mock('fs/promises');
jest.mock('axios');

describe('MessageService', () => {
  let messageService: MessageService;
  let mockLogger: any;
  let mockKeywordController: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    };
    mockKeywordController = {
      getKeywordReplies: jest.fn().mockResolvedValue([]),
      getReplaceKeywords: jest.fn().mockResolvedValue([]),
      getTransferKeywords: jest.fn().mockResolvedValue([]),
    };

    const { MessageService: MS } = require('../../main/backend/services/messageService');
    messageService = new MS(mockLogger, mockKeywordController);
  });

  describe('createTextReply', () => {
    it('should create a text reply with plugin source', async () => {
      const reply = await messageService.createTextReply('你好');
      expect(reply.type).toBe('TEXT');
      expect(reply.content).toBe('你好');
      expect(reply.source).toBe('plugin');
      expect(reply.safeToAutoSend).toBe(true);
    });
  });

  describe('matchReplaceKeyword', () => {
    it('should return original reply when no match found', async () => {
      mockKeywordController.getReplaceKeywords.mockResolvedValue([]);
      const ctx = new Map([['CTX_APP_ID', 'win_qianniu']]);
      const result = await messageService.matchReplaceKeyword(ctx, '你好');
      expect(result).toBe('你好');
    });
  });
});
