/**
 * KeywordReplyController 单元测试 — 关键词匹配、转人工检测、关键词替换
 */
import { KeywordReplyController } from '../../main/backend/controllers/keywordReplyController';
import { Keyword } from '../../main/backend/entities/keyword';
import { TransferKeyword } from '../../main/backend/entities/transfer';
import { ReplaceKeyword } from '../../main/backend/entities/replace';

jest.mock('exceljs', () => {
  return {
    Workbook: jest.fn().mockImplementation(() => ({
      xlsx: { readFile: jest.fn(), writeFile: jest.fn() },
      worksheets: [],
      addWorksheet: jest.fn(),
      getWorksheet: jest.fn(),
    })),
  };
});
jest.mock('sequelize', () => ({
  Op: {
    or: Symbol('or'),
    and: Symbol('and'),
  },
  Model: class {},
  DataTypes: {},
}));
jest.mock('axios');
jest.mock('../../main/utils', () => ({
  getTempPath: jest.fn(() => '/tmp/test'),
}));
jest.mock('../../main/backend/entities/keyword', () => ({
  Keyword: {
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
    bulkCreate: jest.fn(),
  },
}));
jest.mock('../../main/backend/entities/transfer', () => ({
  TransferKeyword: {
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
    bulkCreate: jest.fn(),
  },
}));
jest.mock('../../main/backend/entities/replace', () => ({
  ReplaceKeyword: {
    findAll: jest.fn(),
    findAndCountAll: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn(),
    bulkCreate: jest.fn(),
  },
}));

describe('KeywordReplyController', () => {
  let controller: KeywordReplyController;

  beforeEach(() => {
    controller = new KeywordReplyController(3000);
    jest.clearAllMocks();
  });

  describe('getKeywords', () => {
    it('should return platform-specific and global keywords combined', async () => {
      const mockPlatformKeywords = [
        { id: 1, keyword: '你好', reply: '你好呀', platform_id: 'win_wechat', fuzzy: true, has_regular: false, mode: 'fuzzy' },
        { id: 2, keyword: '在吗', reply: '在的', platform_id: 'win_wechat', fuzzy: true, has_regular: false, mode: 'fuzzy' },
      ];
      const mockGlobalKeywords = [
        { id: 3, keyword: '退货', reply: '请联系客服处理退货', platform_id: null, fuzzy: false, has_regular: false, mode: 'exact' },
        { id: 4, keyword: '发货', reply: '已经安排发货了', platform_id: '', fuzzy: true, has_regular: false, mode: 'fuzzy' },
      ];

      (Keyword.findAll as jest.Mock)
        .mockResolvedValueOnce(mockPlatformKeywords)
        .mockResolvedValueOnce(mockGlobalKeywords);

      const result = await controller.getKeywords('win_wechat');

      expect(result).toHaveLength(4);
      expect(result[0]!.keyword).toBe('退货');
      expect(result[1]!.keyword).toBe('发货');
      expect(result[2]!.keyword).toBe('你好');
      expect(result[3]!.keyword).toBe('在吗');
    });

    it('should return only global keywords when platform has none', async () => {
      const mockGlobalKeywords = [
        { id: 1, keyword: '退款', reply: '退款请走平台流程', platform_id: null, fuzzy: false, has_regular: false, mode: 'exact' },
      ];

      (Keyword.findAll as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mockGlobalKeywords);

      const result = await controller.getKeywords('unknown_platform');

      expect(result).toHaveLength(1);
      expect(result[0]!.keyword).toBe('退款');
    });

    it('should return only platform keywords when no global keywords exist', async () => {
      const mockPlatformKeywords = [
        { id: 1, keyword: '价格', reply: '请查看商品详情页', platform_id: 'win_qianniu', fuzzy: true, has_regular: false, mode: 'fuzzy' },
      ];

      (Keyword.findAll as jest.Mock)
        .mockResolvedValueOnce(mockPlatformKeywords)
        .mockResolvedValueOnce([]);

      const result = await controller.getKeywords('win_qianniu');

      expect(result).toHaveLength(1);
      expect(result[0]!.keyword).toBe('价格');
    });

    it('should return empty array when no keywords exist at all', async () => {
      (Keyword.findAll as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await controller.getKeywords('win_wechat');

      expect(result).toHaveLength(0);
    });
  });

  describe('getTransferKeywords', () => {
    it('should return transfer keywords for specific platform plus global ones', async () => {
      const mockPlatformTransfers = [
        { id: 1, keyword: '人工', app_id: 'win_wechat', fuzzy: true, has_regular: false },
      ];
      const mockGlobalTransfers = [
        { id: 2, keyword: '投诉', app_id: null, fuzzy: false, has_regular: false },
      ];

      (TransferKeyword.findAll as jest.Mock)
        .mockResolvedValueOnce(mockPlatformTransfers)
        .mockResolvedValueOnce(mockGlobalTransfers);

      const result = await controller.getTransferKeywords('win_wechat');

      expect(result).toHaveLength(2);
      expect(result[0]!.keyword).toBe('投诉');
      expect(result[1]!.keyword).toBe('人工');
    });

    it('should return empty array when no transfer keywords exist', async () => {
      (TransferKeyword.findAll as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await controller.getTransferKeywords('win_wechat');

      expect(result).toHaveLength(0);
    });
  });

  describe('getReplaceKeywords', () => {
    it('should return replace keywords for specific platform plus global ones', async () => {
      const mockPlatformReplaces = [
        { id: 1, keyword: '微信', replace: 'WeChat', app_id: 'win_qianniu', fuzzy: false, has_regular: false },
      ];
      const mockGlobalReplaces = [
        { id: 2, keyword: '亲', replace: '您', app_id: null, fuzzy: true, has_regular: false },
      ];

      (ReplaceKeyword.findAll as jest.Mock)
        .mockResolvedValueOnce(mockPlatformReplaces)
        .mockResolvedValueOnce(mockGlobalReplaces);

      const result = await controller.getReplaceKeywords('win_qianniu');

      expect(result).toHaveLength(2);
      expect(result[0]!.keyword).toBe('亲');
      expect(result[1]!.keyword).toBe('微信');
    });

    it('should return only global replace keywords when platform has none', async () => {
      const mockGlobalReplaces = [
        { id: 1, keyword: '亲', replace: '您', app_id: '', fuzzy: true, has_regular: false },
      ];

      (ReplaceKeyword.findAll as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mockGlobalReplaces);

      const result = await controller.getReplaceKeywords('win_wechat');

      expect(result).toHaveLength(1);
      expect(result[0]!.replace).toBe('您');
    });

    it('should return empty array when no replace keywords exist', async () => {
      (ReplaceKeyword.findAll as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await controller.getReplaceKeywords('win_wechat');

      expect(result).toHaveLength(0);
    });
  });

  describe('create', () => {
    it('should create a keyword with default fuzzy mode', async () => {
      const mockCreated = { id: 1, keyword: '你好', reply: '你好呀', mode: 'fuzzy' };
      (Keyword.create as jest.Mock).mockResolvedValue(mockCreated);

      const result = await controller.create({
        keyword: '你好',
        reply: '你好呀',
        platform_id: 'win_wechat',
      });

      expect(Keyword.create).toHaveBeenCalledWith(
        expect.objectContaining({
          keyword: '你好',
          reply: '你好呀',
          platform_id: 'win_wechat',
          mode: 'fuzzy',
        }),
      );
      expect(result).toEqual(mockCreated);
    });

    it('should create a keyword with explicit exact mode', async () => {
      const mockCreated = { id: 2, keyword: '退款', reply: '退款处理中', mode: 'exact' };
      (Keyword.create as jest.Mock).mockResolvedValue(mockCreated);

      const result = await controller.create({
        keyword: '退款',
        reply: '退款处理中',
        mode: 'exact',
      });

      expect(Keyword.create).toHaveBeenCalledWith(
        expect.objectContaining({
          keyword: '退款',
          reply: '退款处理中',
          mode: 'exact',
        }),
      );
      expect(result.mode).toBe('exact');
    });
  });

  describe('delete', () => {
    it('should throw an error when keyword not found', async () => {
      (Keyword.findByPk as jest.Mock).mockResolvedValue(null);

      await expect(controller.delete(999)).rejects.toThrow('AutoReply not found');
    });

    it('should destroy the keyword when found', async () => {
      const mockDestroy = jest.fn().mockResolvedValue(undefined);
      (Keyword.findByPk as jest.Mock).mockResolvedValue({
        destroy: mockDestroy,
      });

      await controller.delete(1);

      expect(mockDestroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('list', () => {
    it('should return paginated keywords with total count', async () => {
      const mockRows = [
        { id: 1, keyword: '你好', reply: '你好呀' },
        { id: 2, keyword: '在吗', reply: '在的' },
      ];
      (Keyword.findAndCountAll as jest.Mock).mockResolvedValue({
        rows: mockRows,
        count: 2,
      });

      const result = await controller.list({
        page: 1,
        pageSize: 10,
        platformId: 'win_wechat',
      });

      expect(result.total).toBe(2);
      expect(result.autoReplies).toHaveLength(2);
      expect(result.autoReplies![0]!.keyword).toBe('你好');
    });

    it('should return empty result on database error', async () => {
      (Keyword.findAndCountAll as jest.Mock).mockRejectedValue(new Error('DB error'));

      const result = await controller.list({
        page: 1,
        pageSize: 10,
        platformId: 'win_wechat',
      });

      expect(result.total).toBe(0);
      expect(result.autoReplies).toHaveLength(0);
    });
  });
});
