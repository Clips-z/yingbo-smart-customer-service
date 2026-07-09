/**
 * DispatchService 单元测试 — 消息处理、回复生成、WebSocket 广播
 */
import { DispatchService } from '../../main/backend/services/dispatchService';

// Mock 所有外部依赖
jest.mock('sequelize', () => ({
  Op: { or: Symbol('or'), and: Symbol('and') },
  Model: class {},
  DataTypes: {},
}));
jest.mock('electron', () => ({
  safeStorage: {
    encryptString: jest.fn((s: string) => Buffer.from(s)),
    decryptString: jest.fn((b: Buffer) => b.toString()),
  },
  BrowserWindow: class {},
}), { virtual: true });
jest.mock('../../main/utils/secureStorage');
jest.mock('../../main/backend/controllers/configController');
jest.mock('../../main/backend/controllers/messageController');
jest.mock('../../main/backend/services/messageService');
jest.mock('../../main/backend/services/pluginService');
jest.mock('../../main/backend/services/loggerService');
jest.mock('../../main/backend/entities/config');
jest.mock('../../main/backend/entities/instance');
jest.mock('../../main/backend/services/platformRuntimeService');

// 模拟 electron BrowserWindow
const mockWebContentsSend = jest.fn();
const mockMainWindow = {
  webContents: {
    send: mockWebContentsSend,
  },
} as any;

describe('DispatchService', () => {
  let dispatchService: DispatchService;
  let mockLogger: any;
  let mockIO: any;
  let mockConfigController: any;
  let mockMessageService: any;
  let mockMessageController: any;
  let mockPluginService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      success: jest.fn(),
    };

    mockIO = {
      sockets: { sockets: new Map([['client1', {}]]) },
      emit: jest.fn(),
    };

    mockConfigController = {
      get: jest.fn(),
      checkConfigActive: jest.fn(),
      escKeyDowHandler: jest.fn(),
      getConfigByType: jest.fn(),
    };

    mockMessageService = {
      extractMsgInfo: jest.fn(),
      getDefaultReply: jest.fn(),
    };

    mockMessageController = {
      getConversationMessages: jest.fn(),
      saveMessages: jest.fn(),
    };

    mockPluginService = {
      executePlugin: jest.fn(),
      executePluginCode: jest.fn(),
    };

    const { DispatchService: DS } = require('../../main/backend/services/dispatchService');
    dispatchService = new DS(
      mockMainWindow,
      mockLogger,
      mockIO,
      mockConfigController,
      mockMessageService,
      mockMessageController,
      mockPluginService,
    );
  });

  describe('createReply', () => {
    const validCfg = {
      has_use_gpt: true,
      context_count: 5,
      use_plugin: false,
      plugin_id: null,
      default_reply: '当前消息有点多，我稍后再回复你',
    } as any;

    const validData = {
      ctx: { CTX_APP_ID: 'win_wechat', CTX_INSTANCE_ID: 'inst_1' },
      msgs: [
        { sender: 'customer', content: '你好', role: 'OTHER' as const, type: 'TEXT' as const },
      ],
    };

    it('should return NO_REPLY when data is null or missing ctx/msgs', async () => {
      const result = await dispatchService.createReply(null as any);
      expect(result.type).toBe('NO_REPLY');
      expect(result.content).toBe('');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('无效数据'),
      );
    });

    it('should return NO_REPLY when config is not found', async () => {
      mockConfigController.get.mockResolvedValue(null);

      const result = await dispatchService.createReply(validData);
      expect(result.type).toBe('NO_REPLY');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('配置不存在'),
      );
    });

    it('should return NO_REPLY when config is not active', async () => {
      mockConfigController.get.mockResolvedValue(validCfg);
      mockConfigController.checkConfigActive.mockResolvedValue(false);

      const result = await dispatchService.createReply(validData);
      expect(result.type).toBe('NO_REPLY');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('未激活'),
      );
    });

    it('should return NO_REPLY when GPT is not enabled', async () => {
      const cfgWithoutGpt = { ...validCfg, has_use_gpt: false };
      mockConfigController.get.mockResolvedValue(cfgWithoutGpt);
      mockConfigController.checkConfigActive.mockResolvedValue(true);

      const result = await dispatchService.createReply(validData);
      expect(result.type).toBe('NO_REPLY');
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('未启用 GPT'),
      );
    });

    it('should generate reply via default plugin code', async () => {
      mockConfigController.get.mockResolvedValue(validCfg);
      mockConfigController.checkConfigActive.mockResolvedValue(true);
      mockMessageController.getConversationMessages.mockResolvedValue([]);
      mockPluginService.executePluginCode.mockResolvedValue({
        data: {
          type: 'TEXT',
          content: '您好，有什么可以帮您？',
        },
      });

      const result = await dispatchService.createReply(validData);

      expect(result.type).toBe('TEXT');
      expect(result.content).toBe('您好，有什么可以帮您？');
      expect(mockMessageController.saveMessages).toHaveBeenCalled();
    });

    it('should use custom plugin when use_plugin is enabled', async () => {
      const cfgWithPlugin = { ...validCfg, use_plugin: true, plugin_id: 'plugin_123' };
      mockConfigController.get.mockResolvedValue(cfgWithPlugin);
      mockConfigController.checkConfigActive.mockResolvedValue(true);
      mockMessageController.getConversationMessages.mockResolvedValue([]);
      mockPluginService.executePlugin.mockResolvedValue({
        type: 'TEXT',
        content: '自定义插件回复',
        source: 'plugin',
        safeToAutoSend: true,
      });

      const result = await dispatchService.createReply(validData);

      expect(mockPluginService.executePlugin).toHaveBeenCalledWith(
        'plugin_123',
        expect.any(Map),
        expect.any(Array),
      );
      expect(result.type).toBe('TEXT');
      expect(result.content).toBe('自定义插件回复');
      expect(result.source).toBe('plugin');
    });

    it('should fallback to default reply when plugin execution fails', async () => {
      mockConfigController.get.mockResolvedValue(validCfg);
      mockConfigController.checkConfigActive.mockResolvedValue(true);
      mockMessageController.getConversationMessages.mockResolvedValue([]);
      mockPluginService.executePluginCode.mockRejectedValue(new Error('Plugin error'));
      mockMessageService.getDefaultReply.mockResolvedValue({
        type: 'TEXT',
        content: '当前消息有点多，我稍后再回复你',
        source: 'default',
        safeToAutoSend: false,
      });

      const result = await dispatchService.createReply(validData);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('回复生成失败'),
      );
      expect(result.content).toBe('当前消息有点多，我稍后再回复你');
      expect(result.source).toBe('default');
    });

    it('should return NO_REPLY when plugin returns null data', async () => {
      mockConfigController.get.mockResolvedValue(validCfg);
      mockConfigController.checkConfigActive.mockResolvedValue(true);
      mockMessageController.getConversationMessages.mockResolvedValue([]);
      mockPluginService.executePluginCode.mockResolvedValue({
        data: null,
      });

      const result = await dispatchService.createReply(validData);

      expect(result.type).toBe('NO_REPLY');
    });

    it('should not save messages when reply type is NO_REPLY', async () => {
      mockConfigController.get.mockResolvedValue(validCfg);
      mockConfigController.checkConfigActive.mockResolvedValue(true);
      mockMessageController.getConversationMessages.mockResolvedValue([]);
      mockPluginService.executePluginCode.mockResolvedValue({
        data: { type: 'NO_REPLY', content: '' },
      });

      await dispatchService.createReply(validData);

      expect(mockMessageController.saveMessages).not.toHaveBeenCalled();
    });
  });

  describe('receiveBroadcast', () => {
    it('should send broadcast message to main window via webContents', () => {
      const msg = { event: 'has_paused', data: { platform: 'win_wechat' } };

      dispatchService.receiveBroadcast(msg);

      expect(mockWebContentsSend).toHaveBeenCalledWith('broadcast', msg);
    });

    it('should handle empty broadcast data gracefully', () => {
      dispatchService.receiveBroadcast({});

      expect(mockWebContentsSend).toHaveBeenCalledWith('broadcast', {});
    });
  });

  describe('checkHealth', () => {
    it('should return false when no socket clients are connected', async () => {
      const noClientService = new (require('../../main/backend/services/dispatchService').DispatchService)(
        mockMainWindow,
        mockLogger,
        { sockets: { sockets: new Map() }, emit: jest.fn() },
        mockConfigController,
        mockMessageService,
        mockMessageController,
        mockPluginService,
      );

      const result = await noClientService.checkHealth();
      expect(result).toBe(false);
    });
  });
});
