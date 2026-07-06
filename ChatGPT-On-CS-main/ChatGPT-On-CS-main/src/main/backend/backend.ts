import express from 'express';
import cors from 'cors';
import asyncHandler from 'express-async-handler';
import bodyParser from 'body-parser';
import http from 'http';
import { Server } from 'socket.io';
import { BrowserWindow, shell } from 'electron';
import { databaseReady, sequelize } from './ormconfig';
import { ConfigController } from './controllers/configController';
import { MessageController } from './controllers/messageController';
import { KeywordReplyController } from './controllers/keywordReplyController';
import { AnalyticsController } from './controllers/analyticsController';
import { MessageService } from './services/messageService';
import { DispatchService } from './services/dispatchService';
import { PluginService } from './services/pluginService';
import { AppService } from './services/appService';
import { LoggerService } from './services/loggerService';
import { QianniuCompatService } from './services/qianniuCompatService';
import {
  WechatCollectorState,
  WechatSidecarService,
} from './services/wechatSidecarService';
import {
  WecomCollectorState,
  WecomSidecarService,
} from './services/wecomSidecarService';
import {
  JinmaiCollectorState,
  JinmaiSidecarService,
} from './services/jinmaiSidecarService';
import { PddSidecarService } from './services/pddSidecarService';
import { DouyinSidecarService } from './services/douyinSidecarService';
import { RagService } from './services/ragService';
import { ReplySuggestion } from './entities/replySuggestion';
import {
  CTX_APP_ID,
  CTX_APP_NAME,
  CTX_INSTANCE_ID,
  CTX_USERNAME,
} from './constants';

class BKServer {
  private app: express.Application;

  private port: number;

  private server: http.Server;

  private io: Server;

  private configController: ConfigController;

  private messageController: MessageController;

  private keywordReplyController: KeywordReplyController;

  private analyticsController: AnalyticsController;

  private messageService: MessageService;

  private pluginService: PluginService;

  private dispatchService: DispatchService;

  private loggerService: LoggerService;

  private appService: AppService;

  private qianniuCompatService: QianniuCompatService;

  private wechatSidecarService: WechatSidecarService;

  private ragService: RagService;

  private wecomSidecarService: WecomSidecarService;

  private jinmaiSidecarService: JinmaiSidecarService;

  private pddSidecarService: PddSidecarService;

  private douyinSidecarService: DouyinSidecarService;

  constructor(port: number, mainWindow: BrowserWindow) {
    this.app = express();
    this.app.use(bodyParser.json());
    this.app.use((req, res, next) => {
      const origin = req.get('origin');
      const allowed =
        !origin ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      if (!allowed) {
        res.status(403).json({ success: false, message: 'Origin not allowed' });
        return;
      }
      next();
    });
    this.app.use(
      cors({
        origin: true,
      }),
    );
    this.port = port;

    this.server = http.createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, 'null'],
        methods: ['GET', 'POST'],
      },
      connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000,
        skipMiddlewares: true,
        // 配置使用 websocket
      },
      transports: ['websocket'],
    });

    this.configController = new ConfigController();
    this.messageController = new MessageController();
    this.keywordReplyController = new KeywordReplyController(port);
    this.analyticsController = new AnalyticsController();
    this.loggerService = new LoggerService(mainWindow);

    this.messageService = new MessageService(
      this.loggerService,
      this.keywordReplyController,
    );

    this.pluginService = new PluginService(
      this.loggerService,
      this.configController,
      this.messageService,
    );

    this.dispatchService = new DispatchService(
      mainWindow,
      this.loggerService,
      this.io,
      this.configController,
      this.messageService,
      this.messageController,
      this.pluginService,
    );

    this.appService = new AppService(this.dispatchService, sequelize);
    this.qianniuCompatService = new QianniuCompatService(
      this.dispatchService,
      this.appService,
      this.loggerService,
    );
    this.wechatSidecarService = new WechatSidecarService(
      port,
      this.loggerService,
      this.dispatchService,
    );

    this.ragService = new RagService(
      this.loggerService,
      this.dispatchService,
    );

    this.wecomSidecarService = new WecomSidecarService(
      this.port,
      this.loggerService,
      this.dispatchService,
    );

    this.jinmaiSidecarService = new JinmaiSidecarService(
      this.port,
      this.loggerService,
      this.dispatchService,
    );

    this.pddSidecarService = new PddSidecarService(
      this.port,
      this.loggerService,
      this.dispatchService,
    );

    this.douyinSidecarService = new DouyinSidecarService(
      this.port,
      this.loggerService,
      this.dispatchService,
    );

    this.configureSocketIO();
    this.setupRoutes();
    // 开启定时任务：每 5 分钟同步一次任务状态，避免频繁操作数据库
    setInterval(
      () => {
        this.appService.initTasks();
      },
      5 * 60 * 1000,
    );
  }

  private configureSocketIO(): void {
    this.io.on('connection', (socket) => {
      console.log('Client connected registerHandlers');
      this.dispatchService.registerHandlers(socket);

      socket.on('disconnect', () => {
        console.log('user disconnected');
        // 再关闭这个连接绑定的事件处理器
        socket.removeAllListeners();
      });
    });
  }

  private setupRoutes(): void {
    // ========== 数据分析 API ==========
    this.app.get('/api/analytics/overview', (req, res) =>
      this.analyticsController.getOverview(req, res));
    this.app.get('/api/analytics/daily-trend', (req, res) =>
      this.analyticsController.getDailyTrend(req, res));
    this.app.get('/api/analytics/platform-distribution', (req, res) =>
      this.analyticsController.getPlatformDistribution(req, res));
    this.app.get('/api/analytics/status-distribution', (req, res) =>
      this.analyticsController.getStatusDistribution(req, res));
    this.app.get('/api/analytics/top-senders', (req, res) =>
      this.analyticsController.getTopSenders(req, res));
    this.app.get('/api/analytics/avg-response-time', (req, res) =>
      this.analyticsController.getAvgResponseTime(req, res));

    this.app.get('/', (req, res) => {
      res.type('html').send(`
        <!doctype html>
        <html lang="zh-CN">
          <head>
            <meta charset="utf-8" />
            <title>迎波智能客服本地服务</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 32px; line-height: 1.6; color: #1f2937; }
              code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
              a { color: #2563eb; }
            </style>
          </head>
          <body>
            <h1>迎波智能客服本地服务已启动</h1>
            <p>这个地址是后端 API 服务，不是桌面前端页面。桌面界面请使用 <code>run-app.cmd</code> 启动。</p>
            <p>可检查接口：<a href="/api/v1/base/health">/api/v1/base/health</a></p>
          </body>
        </html>
      `);
    });

    // 查询聊天会话
    this.app.post(
      '/api/v1/message/session',
      asyncHandler(async (req, res) => {
        const { page, pageSize, keyword, platformId } = req.body;
        const data = await this.messageController.getSessions({
          page,
          pageSize,
          keyword,
          platformId,
        });

        res.json({
          success: true,
          data,
        });
      }),
    );

    // 查询聊天消息
    this.app.post(
      '/api/v1/message/list',
      asyncHandler(async (req, res) => {
        const { sessionId } = req.body;
        const data = await this.messageController.getMessages(sessionId);
        res.json({
          success: true,
          data,
        });
      }),
    );

    this.app.post(
      '/api/v1/message/simulate',
      asyncHandler(async (req, res) => {
        const {
          platformId = 'win_wechat',
          platformName = '微信',
          instanceId = 'wechat_sidecar',
          sender = '微信用户',
          content = '',
          ctx = {},
          messages,
        } = req.body || {};

        const normalizedMessages = Array.isArray(messages)
          ? messages
          : [
              {
                sender: String(sender),
                content: String(content),
                role: 'OTHER' as const,
                type: 'TEXT' as const,
              },
            ];

        const reply = await this.dispatchService.createReply({
          ctx: {
            [CTX_APP_ID]: String(platformId),
            [CTX_APP_NAME]: String(platformName),
            [CTX_INSTANCE_ID]: String(instanceId),
            [CTX_USERNAME]: String(sender),
            ...ctx,
          },
          msgs: normalizedMessages,
        });

        const suggestion = await ReplySuggestion.create({
          platform_id: String(platformId),
          store: String(ctx.CTX_PLATFORM || platformName),
          sender: String(sender),
          incoming_content: String(content),
          reply_content: reply.content,
          status: reply.type === 'NO_REPLY' ? 'dismissed' : 'pending',
          created_at: new Date(),
          updated_at: new Date(),
        });
        this.dispatchService.receiveBroadcast({
          event: 'reply_suggestion_created',
          data: suggestion.toJSON(),
        });

        res.json({
          success: true,
          data: {
            reply,
            saved: reply.type !== 'NO_REPLY',
            suggestionId: suggestion.id,
            mode:
              String(platformId) === 'win_wechat'
                ? this.wechatSidecarService.getMode()
                : String(platformId) === 'win_wecom'
                  ? this.wecomSidecarService.getMode()
                  : undefined,
          },
        });
      }),
    );

    // 导出消息到 Excel
    this.app.get(
      '/api/v1/message/excel',
      asyncHandler(async (req, res) => {
        try {
          const path = await this.messageController.exportExcel();
          shell.openPath(path);
          res.json({ success: true, data: path });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );

    // 获取所有平台
    this.app.get(
      '/api/v1/base/platform/all',
      asyncHandler(async (req, res) => {
        const data = await this.dispatchService.getAllPlatforms();
        res.json({
          success: data && data.length > 0,
          data,
        });
      }),
    );

    // 取得平台是否激活
    this.app.get(
      '/api/v1/base/platform/active',
      asyncHandler(async (req, res) => {
        const { appId, instanceId } = req.query;
        const active = await this.configController.checkConfigActive({
          appId: appId ? String(appId) : undefined,
          instanceId: instanceId ? String(instanceId) : undefined,
        });
        res.json({
          success: true,
          data: {
            active,
          },
        });
      }),
    );

    // 更新平台激活状态
    this.app.post(
      '/api/v1/base/platform/active',
      asyncHandler(async (req, res) => {
        const { appId, instanceId, active } = req.body;
        await this.configController.activeConfig({
          appId: appId ? String(appId) : undefined,
          instanceId: instanceId ? String(instanceId) : undefined,
          active,
        });
        res.json({
          success: true,
        });
      }),
    );

    // 获取配置
    this.app.get(
      '/api/v1/base/setting',
      asyncHandler(async (req, res) => {
        const { appId, instanceId, type } = req.query;
        const data = {
          appId: appId ? String(appId) : undefined,
          instanceId: instanceId ? String(instanceId) : undefined,
          type: type ? String(type) : ('generic' as any),
        };

        const obj = await this.configController.getConfigByType(data);
        const active = await this.configController.checkConfigActive(data);

        res.json({
          success: true,
          data: {
            ...obj,
            active,
          },
        });
      }),
    );

    // 更新配置
    this.app.post(
      '/api/v1/base/setting',
      asyncHandler(async (req, res) => {
        const { appId, instanceId, type, cfg } = req.body;
        const data = {
          appId: appId ? String(appId) : undefined,
          instanceId: instanceId ? String(instanceId) : undefined,
          type: type ? String(type) : 'generic',
          cfg,
        };

        await this.configController.updateConfigByType(data);
        await this.dispatchService.syncConfig();
        res.json({ success: true });
      }),
    );

    // Endpoint to update runner status based on incoming configuration
    this.app.post(
      '/api/v1/base/sync',
      asyncHandler(async (req, res) => {
        try {
          await this.dispatchService.syncConfig();
          res.json({ success: true });
        } catch (error) {
          if (error instanceof Error) {
            res.status(500).json({ success: false, message: error.message });
          }
        }
      }),
    );

    this.app.get('/api/v1/reply/list', async (req, res) => {
      const { page = 1, page_size: pageSize, ptf_id: platformId } = req.query;

      const query = {
        page,
        pageSize,
        platformId,
      };

      const { total, autoReplies } =
        // @ts-ignore
        await this.keywordReplyController.list(query);

      const data = autoReplies;
      const ptfs = await this.dispatchService.getAllPlatforms();

      const ptfMap = new Map(ptfs.map((ptf) => [ptf.id, ptf]));
      const results: any[] = [];
      data.forEach((item) => {
        const ptfId = item.platform_id;
        const ptf = ptfMap.get(ptfId);

        const result = {
          id: item.id,
          platform_id: item.platform_id,
          keyword: item.keyword,
          reply: item.reply,
          mode: item.mode,
          fuzzy: item.fuzzy,
          has_regular: item.has_regular,
          app_name: ptf ? ptf.name : '全局',
        };

        results.push(result);
      });

      res.json({
        success: true,
        data: results,
        total,
        page,
        page_size: pageSize,
      });
    });

    this.app.post('/api/v1/reply/create', async (req, res) => {
      const {
        platform_id: platformId,
        keyword,
        reply,
        mode,
        fuzzy,
        has_regular,
      } = req.body;
      await this.keywordReplyController.create({
        mode,
        platform_id: platformId,
        keyword,
        reply,
        fuzzy,
        has_regular,
      });
      res.json({ success: true });
    });

    this.app.post('/api/v1/reply/update', async (req, res) => {
      const {
        id,
        platform_id: platformId,
        keyword,
        reply,
        mode,
        fuzzy,
        has_regular,
      } = req.body;
      await this.keywordReplyController.update(id, {
        mode,
        platform_id: platformId,
        keyword,
        reply,
        fuzzy,
        has_regular,
      });
      res.json({ success: true });
    });

    this.app.post('/api/v1/reply/delete', async (req, res) => {
      const { id } = req.body;
      await this.keywordReplyController.delete(id);
      res.json({ success: true });
    });

    this.app.post('/api/v1/reply/excel', async (req, res) => {
      const { path } = req.body;
      try {
        await this.keywordReplyController.importExcel(path);
        res.json({ success: true });
      } catch (error) {
        // @ts-ignore
        res.status(500).json({ success: false, message: error.message });
      }
    });

    this.app.get('/api/v1/reply/excel', async (req, res) => {
      try {
        const path = await this.keywordReplyController.exportExcel();
        shell.openPath(path);
        res.json({ success: true, data: path });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.app.get('/api/v1/transfer/list', async (req, res) => {
      const { page = 1, page_size: pageSize, app_id: appId } = req.query;

      const query = {
        page,
        pageSize,
        appId,
      };

      const { total, transferKeywords } =
        // @ts-ignore
        await this.keywordReplyController.listTransferKeywords(query);

      const data = transferKeywords;
      const ptfs = await this.dispatchService.getAllPlatforms();

      const ptfMap = new Map(ptfs.map((ptf) => [ptf.id, ptf]));
      const results: any[] = [];
      data.forEach((item) => {
        const ptfId = item.app_id;
        const ptf = ptfMap.get(ptfId);

        const result = {
          id: item.id,
          keyword: item.keyword,
          has_regular: item.has_regular,
          fuzzy: item.fuzzy,
          app_id: item.app_id,
          app_name: ptf ? ptf.name : '全局',
        };

        results.push(result);
      });

      res.json({
        success: true,
        data: results,
        total,
        page,
        page_size: pageSize,
      });
    });

    this.app.post('/api/v1/transfer/create', async (req, res) => {
      const { app_id: appId, keyword, has_regular, fuzzy } = req.body;
      await this.keywordReplyController.createTransfer({
        app_id: appId,
        keyword,
        has_regular,
        fuzzy,
      });
      res.json({ success: true });
    });

    this.app.post('/api/v1/transfer/update', async (req, res) => {
      const { id, app_id: appId, keyword, has_regular, fuzzy } = req.body;
      await this.keywordReplyController.updateTransfer(id, {
        app_id: appId,
        keyword,
        has_regular,
        fuzzy,
      });
      res.json({ success: true });
    });

    this.app.post('/api/v1/transfer/delete', async (req, res) => {
      const { id } = req.body;
      await this.keywordReplyController.deleteTransfer(id);
      res.json({ success: true });
    });

    this.app.post('/api/v1/transfer/excel', async (req, res) => {
      const { path } = req.body;
      try {
        await this.keywordReplyController.importTransferExcel(path);
        res.json({ success: true });
      } catch (error) {
        // @ts-ignore
        res.status(500).json({ success: false, message: error.message });
      }
    });

    this.app.get('/api/v1/transfer/excel', async (req, res) => {
      try {
        const path = await this.keywordReplyController.exportTransferExcel();
        shell.openPath(path);
        res.json({ success: true, data: path });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.app.get('/api/v1/replace/list', async (req, res) => {
      const { page = 1, page_size: pageSize, app_id: appId } = req.query;

      const query = {
        page,
        pageSize,
        appId,
      };

      const { total, replaceKeywords } =
        // @ts-ignore
        await this.keywordReplyController.listReplaceKeywords(query);

      const data = replaceKeywords;
      const ptfs = await this.dispatchService.getAllPlatforms();

      const ptfMap = new Map(ptfs.map((ptf) => [ptf.id, ptf]));
      const results: any[] = [];
      data.forEach((item) => {
        const ptfId = item.app_id;
        const ptf = ptfMap.get(ptfId);

        const result = {
          id: item.id,
          keyword: item.keyword,
          replace: item.replace,
          app_id: item.app_id,
          app_name: ptf ? ptf.name : '全局',
          has_regular: item.has_regular,
          fuzzy: item.fuzzy,
        };

        results.push(result);
      });

      res.json({
        success: true,
        data: results,
        total,
        page,
        page_size: pageSize,
      });
    });

    this.app.post('/api/v1/replace/create', async (req, res) => {
      const { app_id: appId, keyword, replace } = req.body;
      await this.keywordReplyController.createReplace({
        app_id: appId,
        keyword,
        replace,
      });
      res.json({ success: true });
    });

    this.app.post('/api/v1/replace/update', async (req, res) => {
      const { id, app_id: appId, keyword, replace } = req.body;
      await this.keywordReplyController.updateReplace(id, {
        app_id: appId,
        keyword,
        replace,
      });
      res.json({ success: true });
    });

    this.app.post('/api/v1/replace/delete', async (req, res) => {
      const { id } = req.body;
      await this.keywordReplyController.deleteReplace(id);
      res.json({ success: true });
    });

    this.app.post('/api/v1/replace/excel', async (req, res) => {
      const { path } = req.body;
      try {
        await this.keywordReplyController.importReplaceExcel(path);
        res.json({ success: true });
      } catch (error) {
        // @ts-ignore
        res.status(500).json({ success: false, message: error.message });
      }
    });

    this.app.get('/api/v1/replace/excel', async (req, res) => {
      try {
        const path = await this.keywordReplyController.exportReplaceExcel();
        shell.openPath(path);
        res.json({ success: true, data: path });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });

    this.app.get('/api/v1/plugin/list', async (req, res) => {
      const plugins = await this.configController.getAllCustomPlugins();
      const results = plugins.map((plugin) => {
        return {
          id: plugin.id,
          code: plugin.code,
          title: plugin.title,
          description: plugin.description,
          icon: plugin.icon,
          source: plugin.source,
          author: plugin.author,
          type: plugin.type,
          tags: JSON.parse(plugin.tags || '[]'),
        };
      });
      res.json({
        success: true,
        data: results,
      });
    });

    this.app.get('/api/v1/plugin/detail', async (req, res) => {
      const { id } = req.query;
      const plugin = await this.configController.getPluginConfig(Number(id));
      if (!plugin) {
        res.json({
          success: false,
          data: null,
        });
        return;
      }

      const tags = JSON.parse(plugin.tags || '[]');
      res.json({
        success: true,
        data: {
          id: plugin.id,
          code: plugin.code,
          title: plugin.title,
          description: plugin.description,
          icon: plugin.icon,
          source: plugin.source,
          author: plugin.author,
          type: plugin.type,
          tags,
        },
      });
    });

    this.app.post('/api/v1/plugin/create', async (req, res) => {
      const { code, source, author, description, icon, tags, title } = req.body;
      const plugin = await this.configController.createCustomPlugin({
        code,
        source,
        author,
        description,
        icon,
        tags: JSON.stringify(tags),
        title,
      });
      if (!plugin) {
        res.json({
          success: false,
          data: null,
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: plugin.id,
          code: plugin.code,
          title: plugin.title,
          description: plugin.description,
          icon: plugin.icon,
          source: plugin.source,
          author: plugin.author,
          type: plugin.type,
          tags,
        },
      });
    });

    this.app.post('/api/v1/plugin/update', async (req, res) => {
      const { id, code, description, icon, tags, title } = req.body;
      await this.configController.updateCustomPlugin({
        pluginId: id,
        code,
        description,
        icon,
        tags: JSON.stringify(tags),
        title,
      });
      res.json({ success: true });
    });

    this.app.post('/api/v1/plugin/delete', async (req, res) => {
      const { id } = req.body;
      await this.configController.deleteCustomPlugin(id);
      res.json({ success: true });
    });

    this.app.post(
      '/api/v1/compat/qianniu/reply',
      asyncHandler(async (req, res) => {
        const sender = String(req.body.sender || '').trim();
        const content = String(req.body.content || '').trim();
        const store = String(req.body.store || '').trim();
        if (!sender || !content) {
          res.status(400).json({
            success: false,
            message: 'sender and content are required',
          });
          return;
        }

        const task = (await this.appService.getTasks()).find(
          (item) => item.app_id === 'win_qianniu',
        );
        if (!task) {
          res.status(409).json({
            success: false,
            message: 'Qianniu task is not configured',
          });
          return;
        }

        const reply = await this.dispatchService.createReply({
          ctx: {
            CTX_APP_NAME: '千牛',
            CTX_APP_ID: 'win_qianniu',
            CTX_INSTANCE_ID: task.task_id,
            CTX_USERNAME: sender,
            CTX_PLATFORM: store,
          },
          msgs: [
            {
              sender,
              content,
              role: 'OTHER',
              type: 'TEXT',
            },
          ],
        });

        res.json({ success: true, data: reply });
      }),
    );

    this.app.get('/api/v1/compat/qianniu/mode', (req, res) => {
      res.json({
        success: true,
        data: { mode: this.qianniuCompatService.getMode() },
      });
    });

    this.app.post(
      '/api/v1/compat/qianniu/mode',
      asyncHandler(async (req, res) => {
        const mode = String(req.body.mode || '');
        if (!['hint', 'assist', 'unattended'].includes(mode)) {
          res
            .status(400)
            .json({ success: false, message: 'Invalid reply mode' });
          return;
        }
        await this.qianniuCompatService.setMode(
          mode as 'hint' | 'assist' | 'unattended',
        );
        res.json({ success: true, data: { mode } });
      }),
    );

    this.app.get('/api/v1/compat/wechat/mode', (req, res) => {
      res.json({
        success: true,
        data: { mode: this.wechatSidecarService.getMode() },
      });
    });

    this.app.post(
      '/api/v1/compat/wechat/mode',
      asyncHandler(async (req, res) => {
        const mode = String(req.body.mode || '');
        if (!['hint', 'assist', 'unattended'].includes(mode)) {
          res
            .status(400)
            .json({ success: false, message: 'Invalid reply mode' });
          return;
        }
        await this.wechatSidecarService.setMode(
          mode as 'hint' | 'assist' | 'unattended',
        );
        res.json({ success: true, data: { mode } });
      }),
    );

    this.app.get('/api/v1/compat/wechat/health', (req, res) => {
      res.json({ success: true, data: this.wechatSidecarService.getHealth() });
    });

    this.app.post('/api/v1/compat/wechat/health', (req, res) => {
      const state = String(req.body.state || 'running');
      if (!['starting', 'running', 'degraded', 'stopped'].includes(state)) {
        res
          .status(400)
          .json({ success: false, message: 'Invalid health state' });
        return;
      }
      this.wechatSidecarService.reportHealth(
        state as WechatCollectorState,
        req.body.error ? String(req.body.error).slice(0, 500) : undefined,
      );
      res.json({ success: true });
    });

    // RAG 知识库服务 - 健康检查
    this.app.get('/api/v1/rag/health', (req, res) => {
      res.json({ success: true, data: this.ragService.getHealth() });
    });

    // RAG 知识库服务 - 切换启用/禁用
    this.app.post(
      '/api/v1/rag/toggle',
      asyncHandler(async (req, res) => {
        const enabled = Boolean(req.body.enabled);
        this.ragService.setEnabled(enabled);
        res.json({ success: true, data: this.ragService.getHealth() });
      }),
    );

    // RAG 知识库 - 代理上传文件到 RAG 服务
    this.app.post(
      '/api/v1/rag/upload',
      asyncHandler(async (req, res) => {
        try {
          const { text, filename } = req.body;
          if (!text || !text.trim()) {
            res
              .status(400)
              .json({ success: false, message: '文本内容不能为空' });
            return;
          }
          const axios = (await import('axios')).default;
          const resp = await axios.post(
            'http://127.0.0.1:8000/api/text/upload',
            { text, filename: filename || 'knowledge_base.txt' },
            { timeout: 30000 },
          );
          res.json({ success: true, data: resp.data });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );

    // RAG 知识库 - 获取统计信息
    this.app.get(
      '/api/v1/rag/stats',
      asyncHandler(async (req, res) => {
        try {
          const axios = (await import('axios')).default;
          const resp = await axios.get('http://127.0.0.1:8000/api/stats', {
            timeout: 5000,
          });
          res.json({ success: true, data: resp.data });
        } catch (error) {
          res.json({
            success: false,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );

    // RAG 知识库 - 文本上传（从 textarea 同步到向量库）
    this.app.post(
      '/api/v1/rag/text-upload',
      asyncHandler(async (req, res) => {
        try {
          const { text, filename } = req.body || {};
          if (!text || typeof text !== 'string') {
            return res.status(400).json({ success: false, message: '文本不能为空' });
          }
          const axios = (await import('axios')).default;
          const resp = await axios.post(
            'http://127.0.0.1:8000/api/text/upload',
            { text, filename: filename || 'knowledge_base.txt' },
            { timeout: 60000 },
          );
          res.json({ success: true, data: resp.data });
        } catch (error) {
          res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );

    this.app.post(
      '/api/v1/compat/wechat/suggestions/delivery',
      asyncHandler(async (req, res) => {
        const id = Number(req.body.id);
        const status = String(req.body.status || '');
        if (
          !Number.isInteger(id) ||
          id <= 0 ||
          !['sent', 'failed'].includes(status)
        ) {
          res
            .status(400)
            .json({ success: false, message: 'Invalid delivery update' });
          return;
        }
        const suggestion = await ReplySuggestion.findByPk(id);
        if (!suggestion || suggestion.platform_id !== 'win_wechat') {
          res
            .status(404)
            .json({ success: false, message: '微信回复记录不存在' });
          return;
        }
        await suggestion.update({ status, updated_at: new Date() });
        this.dispatchService.receiveBroadcast({
          event: 'wechat_suggestion_updated',
          data: suggestion.toJSON(),
        });
        res.json({ success: true, data: suggestion });
      }),
    );

    this.app.get(
      '/api/v1/compat/qianniu/suggestions',
      asyncHandler(async (req, res) => {
        const status = String(req.query.status || 'all');
        const platformId = String(req.query.platformId || 'win_qianniu');
        const data = await this.qianniuCompatService.listSuggestions(
          status,
          platformId,
        );
        res.json({ success: true, data });
      }),
    );

    this.app.post(
      '/api/v1/compat/qianniu/suggestions/fill',
      asyncHandler(async (req, res) => {
        const id = Number(req.body.id);
        if (!Number.isInteger(id) || id <= 0) {
          res
            .status(400)
            .json({ success: false, message: 'Invalid suggestion id' });
          return;
        }
        const content = String(req.body.content || '').trim();
        const data = await this.qianniuCompatService.fillSuggestion(
          id,
          content || undefined,
        );
        res.json({ success: true, data });
      }),
    );

    this.app.post(
      '/api/v1/compat/wechat/suggestions/fill',
      asyncHandler(async (req, res) => {
        try {
          const id = Number(req.body.id);
          const content = String(req.body.content || '').trim();
          if (!Number.isInteger(id) || id <= 0 || !content) {
            res
              .status(400)
              .json({ success: false, message: '回复内容不能为空' });
            return;
          }
          const suggestion = await ReplySuggestion.findByPk(id);
          if (!suggestion || suggestion.platform_id !== 'win_wechat') {
            res
              .status(404)
              .json({ success: false, message: '微信回复记录不存在' });
            return;
          }
          await this.wechatSidecarService.focusAndFill(
            suggestion.sender,
            content,
          );
          await suggestion.update({
            reply_content: content,
            status: 'prepared',
            updated_at: new Date(),
          });
          this.dispatchService.receiveBroadcast({
            event: 'wechat_suggestion_updated',
            data: suggestion.toJSON(),
          });
          res.json({ success: true, data: suggestion });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.loggerService.warn(`微信定位失败: ${message}`);
          res.status(409).json({ success: false, message });
        }
      }),
    );

    // ============================================================
    // 企微 (WeCom) 兼容 API 路由
    // ============================================================

    // 企微回复模式 - GET
    this.app.get('/api/v1/compat/wecom/mode', (req, res) => {
      res.json({ success: true, data: { mode: this.wecomSidecarService.getMode() } });
    });

    // 企微回复模式 - SET
    this.app.post(
      '/api/v1/compat/wecom/mode',
      asyncHandler(async (req, res) => {
        const mode = req.body?.mode;
        if (!['hint', 'assist', 'unattended'].includes(mode)) {
          res.status(400).json({ success: false, message: '无效的回复模式' });
          return;
        }
        await this.wecomSidecarService.setMode(mode);
        res.json({ success: true, data: { mode } });
      }),
    );

    // 企微采集健康状态 - GET
    this.app.get('/api/v1/compat/wecom/health', (req, res) => {
      res.json({ success: true, data: this.wecomSidecarService.getHealth() });
    });

    // 企微采集健康状态 - POST (来自 Python sidecar 的心跳)
    this.app.post('/api/v1/compat/wecom/health', (req, res) => {
      const state = String(req.body?.state || 'running');
      const error = String(req.body?.error || '');
      const validStates = ['stopped', 'starting', 'running', 'degraded'];
      this.wecomSidecarService.reportHealth(
        validStates.includes(state) ? state : 'running',
        error,
      );
      res.json({ success: true });
    });

    // 企微回复发送确认（Python sidecar 回报发送结果）
    this.app.post(
      '/api/v1/compat/wecom/suggestions/delivery',
      asyncHandler(async (req, res) => {
        try {
          const id = Number(req.body.id);
          const status = String(req.body.status || '').trim();
          if (!['sent', 'failed'].includes(status)) {
            res.status(400).json({ success: false, message: '无效的发送状态' });
            return;
          }
          if (Number.isInteger(id) && id > 0) {
            await ReplySuggestion.update(
              { status, updated_at: new Date() },
              { where: { id } },
            );
          }
          res.json({ success: true });
        } catch (error) {
          res.json({
            success: false,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );

    // 企微"定位并填入"（辅助回复模式）
    this.app.post(
      '/api/v1/compat/wecom/suggestions/fill',
      asyncHandler(async (req, res) => {
        try {
          const id = Number(req.body.id);
          const content = String(req.body.content || '').trim();
          if (!Number.isInteger(id) || id <= 0 || !content) {
            res
              .status(400)
              .json({ success: false, message: '回复内容不能为空' });
            return;
          }
          const suggestion = await ReplySuggestion.findByPk(id);
          if (!suggestion || suggestion.platform_id !== 'win_wecom') {
            res
              .status(404)
              .json({ success: false, message: '企微回复记录不存在' });
            return;
          }
          await this.wecomSidecarService.focusAndFill(
            suggestion.sender,
            content,
          );
          await suggestion.update({
            reply_content: content,
            status: 'prepared',
            updated_at: new Date(),
          });
          this.dispatchService.receiveBroadcast({
            event: 'wecom_suggestion_updated',
            data: suggestion.toJSON(),
          });
          res.json({ success: true, data: suggestion });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.loggerService.warn(`企微定位失败: ${message}`);
          res.status(409).json({ success: false, message });
        }
      }),
    );

    // ========== 京麦 (JinMai) 自动回复路由 ==========
    this.app.get('/api/v1/compat/jinmai/mode', (req, res) => {
      res.json({ success: true, data: { mode: this.jinmaiSidecarService.getMode() } });
    });
    this.app.post(
      '/api/v1/compat/jinmai/mode',
      asyncHandler(async (req, res) => {
        const mode = String(req.body.mode || '');
        if (!['hint', 'assist', 'unattended'].includes(mode)) {
          res.status(400).json({ success: false, message: 'Invalid mode' });
          return;
        }
        await this.jinmaiSidecarService.setMode(mode as JinmaiReplyMode);
        res.json({ success: true, data: { mode } });
      }),
    );
    this.app.get('/api/v1/compat/jinmai/health', (req, res) => {
      res.json({ success: true, data: this.jinmaiSidecarService.getHealth() });
    });
    this.app.post('/api/v1/compat/jinmai/health', (req, res) => {
      const { state, error } = req.body || {};
      if (state && ['stopped', 'starting', 'running', 'degraded'].includes(state)) {
        this.jinmaiSidecarService.reportHealth(state as JinmaiCollectorState, error);
      }
      res.json({ success: true });
    });

    this.app.post(
      '/api/v1/compat/jinmai/suggestions/delivery',
      asyncHandler(async (req, res) => {
        const { sender, content, replyText, platformId, instanceId } = req.body || {};
        try {
          const suggestion = await ReplySuggestion.create({
            platform_id: platformId || 'win_jinmai',
            platform_name: '京麦',
            sender: sender || '京麦客户',
            buyer_message: content,
            reply_content: replyText,
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date(),
          });
          this.dispatchService.receiveBroadcast({
            event: 'jinmai_suggestion_created',
            data: suggestion.toJSON(),
          });
          res.json({ success: true, data: suggestion });
        } catch (error) {
          res.status(500).json({ success: false, message: String(error) });
        }
      }),
    );

    this.app.post(
      '/api/v1/compat/jinmai/suggestions/fill',
      asyncHandler(async (req, res) => {
        const id = Number(req.params.id || req.body.id);
        const suggestion = await ReplySuggestion.findByPk(id);
        if (!suggestion) {
          res.status(404).json({ success: false, message: '待回复记录不存在' });
          return;
        }
        const { content } = req.body || {};
        if (!content) {
          res.status(400).json({ success: false, message: '缺少回复内容' });
          return;
        }
        try {
          await this.jinmaiSidecarService.focusAndFill(suggestion.sender, content);
          await suggestion.update({
            reply_content: content,
            status: 'prepared',
            updated_at: new Date(),
          });
          this.dispatchService.receiveBroadcast({
            event: 'jinmai_suggestion_updated',
            data: suggestion.toJSON(),
          });
          res.json({ success: true, data: suggestion });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.loggerService.warn(`京麦定位失败: ${message}`);
          res.status(409).json({ success: false, message });
        }
      }),
    );

    // ========== 拼多多 Sidecar API ==========
    this.app.get('/api/v1/compat/pdd/mode', (req, res) => {
      res.json({ success: true, data: { mode: this.pddSidecarService.getMode() } });
    });
    this.app.post(
      '/api/v1/compat/pdd/mode',
      asyncHandler(async (req, res) => {
        const mode = String(req.body.mode || '');
        if (!['hint', 'assist', 'unattended'].includes(mode)) {
          res.status(400).json({ success: false, message: 'Invalid mode' });
          return;
        }
        await this.pddSidecarService.setMode(mode);
        res.json({ success: true, data: { mode } });
      }),
    );
    this.app.get('/api/v1/compat/pdd/health', (req, res) => {
      res.json({ success: true, data: this.pddSidecarService.getHealth() });
    });
    this.app.post('/api/v1/compat/pdd/health', (req, res) => {
      const { state, error } = req.body || {};
      if (state && ['stopped', 'starting', 'running', 'degraded'].includes(state)) {
        this.pddSidecarService.reportHealth(state, error);
      }
      res.json({ success: true });
    });
    this.app.post(
      '/api/v1/compat/pdd/suggestions/delivery',
      asyncHandler(async (req, res) => {
        const { sender, content, replyText, platformId, instanceId } = req.body || {};
        try {
          const suggestion = await ReplySuggestion.create({
            platform_id: platformId || 'win_pdd',
            platform_name: '拼多多',
            sender: sender || '拼多多客户',
            buyer_message: content,
            reply_content: replyText,
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date(),
          });
          this.dispatchService.receiveBroadcast({
            event: 'pdd_suggestion_created',
            data: suggestion.toJSON(),
          });
          res.json({ success: true, data: suggestion });
        } catch (error) {
          res.status(500).json({ success: false, message: String(error) });
        }
      }),
    );
    this.app.post(
      '/api/v1/compat/pdd/suggestions/fill',
      asyncHandler(async (req, res) => {
        const id = Number(req.params.id || req.body.id);
        const suggestion = await ReplySuggestion.findByPk(id);
        if (!suggestion) {
          res.status(404).json({ success: false, message: '待回复记录不存在' });
          return;
        }
        const { content } = req.body || {};
        if (!content) {
          res.status(400).json({ success: false, message: '缺少回复内容' });
          return;
        }
        try {
          await this.pddSidecarService.focusAndFill(suggestion.sender, content);
          await suggestion.update({
            reply_content: content,
            status: 'prepared',
            updated_at: new Date(),
          });
          this.dispatchService.receiveBroadcast({
            event: 'pdd_suggestion_updated',
            data: suggestion.toJSON(),
          });
          res.json({ success: true, data: suggestion });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.loggerService.warn(`拼多多定位失败: ${message}`);
          res.status(409).json({ success: false, message });
        }
      }),
    );

    // ========== 抖音电商 Sidecar API ==========
    this.app.get('/api/v1/compat/douyin/mode', (req, res) => {
      res.json({ success: true, data: { mode: this.douyinSidecarService.getMode() } });
    });
    this.app.post(
      '/api/v1/compat/douyin/mode',
      asyncHandler(async (req, res) => {
        const mode = String(req.body.mode || '');
        if (!['hint', 'assist', 'unattended'].includes(mode)) {
          res.status(400).json({ success: false, message: 'Invalid mode' });
          return;
        }
        await this.douyinSidecarService.setMode(mode);
        res.json({ success: true, data: { mode } });
      }),
    );
    this.app.get('/api/v1/compat/douyin/health', (req, res) => {
      res.json({ success: true, data: this.douyinSidecarService.getHealth() });
    });
    this.app.post('/api/v1/compat/douyin/health', (req, res) => {
      const { state, error } = req.body || {};
      if (state && ['stopped', 'starting', 'running', 'degraded'].includes(state)) {
        this.douyinSidecarService.reportHealth(state, error);
      }
      res.json({ success: true });
    });
    this.app.post(
      '/api/v1/compat/douyin/suggestions/delivery',
      asyncHandler(async (req, res) => {
        const { sender, content, replyText, platformId, instanceId } = req.body || {};
        try {
          const suggestion = await ReplySuggestion.create({
            platform_id: platformId || 'win_douyin',
            platform_name: '抖音电商',
            sender: sender || '抖音客户',
            buyer_message: content,
            reply_content: replyText,
            status: 'pending',
            created_at: new Date(),
            updated_at: new Date(),
          });
          this.dispatchService.receiveBroadcast({
            event: 'douyin_suggestion_created',
            data: suggestion.toJSON(),
          });
          res.json({ success: true, data: suggestion });
        } catch (error) {
          res.status(500).json({ success: false, message: String(error) });
        }
      }),
    );
    this.app.post(
      '/api/v1/compat/douyin/suggestions/fill',
      asyncHandler(async (req, res) => {
        const id = Number(req.params.id || req.body.id);
        const suggestion = await ReplySuggestion.findByPk(id);
        if (!suggestion) {
          res.status(404).json({ success: false, message: '待回复记录不存在' });
          return;
        }
        const { content } = req.body || {};
        if (!content) {
          res.status(400).json({ success: false, message: '缺少回复内容' });
          return;
        }
        try {
          await this.douyinSidecarService.focusAndFill(suggestion.sender, content);
          await suggestion.update({
            reply_content: content,
            status: 'prepared',
            updated_at: new Date(),
          });
          this.dispatchService.receiveBroadcast({
            event: 'douyin_suggestion_updated',
            data: suggestion.toJSON(),
          });
          res.json({ success: true, data: suggestion });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.loggerService.warn(`抖音电商定位失败: ${message}`);
          res.status(409).json({ success: false, message });
        }
      }),
    );

    this.app.post(
      '/api/v1/compat/qianniu/suggestions/status',
      asyncHandler(async (req, res) => {
        const id = Number(req.body.id);
        const status = String(req.body.status || '');
        if (
          !Number.isInteger(id) ||
          id <= 0 ||
          !['pending', 'prepared', 'sent', 'dismissed'].includes(status)
        ) {
          res
            .status(400)
            .json({ success: false, message: 'Invalid status update' });
          return;
        }
        const data = await this.qianniuCompatService.updateSuggestionStatus(
          id,
          status as 'pending' | 'prepared' | 'sent' | 'dismissed',
        );
        res.json({ success: true, data });
      }),
    );

    // 批量更新建议状态（一键全部标记已处理 / 一键重新待回复）
    this.app.post(
      '/api/v1/compat/qianniu/suggestions/batch-status',
      asyncHandler(async (req, res) => {
        const ids: unknown = req.body.ids;
        const status = String(req.body.status || '');
        if (!Array.isArray(ids) || ids.length === 0) {
          res.status(400).json({ success: false, message: 'ids must be non-empty array' });
          return;
        }
        if (!['pending', 'dismissed'].includes(status)) {
          res.status(400).json({ success: false, message: 'Invalid batch status' });
          return;
        }
        const validIds = ids
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0);
        if (validIds.length === 0) {
          res.status(400).json({ success: false, message: 'No valid ids' });
          return;
        }
        const count = await this.qianniuCompatService.batchUpdateStatus(
          validIds,
          status as 'pending' | 'dismissed',
        );
        res.json({ success: true, data: { updated: count } });
      }),
    );

    // 批量删除选中
    this.app.post(
      '/api/v1/compat/qianniu/suggestions/batch-delete',
      asyncHandler(async (req, res) => {
        const ids: unknown = req.body.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
          res.status(400).json({ success: false, message: 'ids must be non-empty array' });
          return;
        }
        const validIds = ids
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0);
        if (validIds.length === 0) {
          res.status(400).json({ success: false, message: 'No valid ids' });
          return;
        }
        const count = await this.qianniuCompatService.batchDelete(validIds);
        res.json({ success: true, data: { deleted: count } });
      }),
    );

    // 按条件清理（清空已处理 / 清空所有）
    this.app.post(
      '/api/v1/compat/qianniu/suggestions/clear',
      asyncHandler(async (req, res) => {
        const status = String(req.body.status || 'handled'); // 'handled'=已处理, 或具体状态
        const platformId = String(req.query.platformId || req.body.platformId || 'all');
        const count = await this.qianniuCompatService.clearSuggestions({
          status: status as ReplySuggestionStatus | 'handled',
          platformId,
        });
        res.json({ success: true, data: { cleared: count } });
      }),
    );

    // Health check endpoint
    // TODO: 后续需要根据通过 WS 去检查后端服务是否健康
    this.app.get('/api/v1/base/health', async (req, res) => {
      try {
        const resp = await this.dispatchService.checkHealth();
        if (resp) {
          res.json({
            success: true,
            data: true,
          });
        } else {
          res.json({
            success: false,
            data: false,
          });
        }
      } catch (error) {
        console.error(error);
        res.json({
          success: false,
          data: false,
        });
      }
    });

    // 检查 GPT 链接是否正常
    this.app.post('/api/v1/base/gpt/health', async (req, res) => {
      const { cfg } = req.body;
      try {
        const resp = await this.messageService.checkGptHealth(cfg);
        res.json(resp);
      } catch (error) {
        console.error(error);
        res.json({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // 检查插件是否正常工作
    this.app.post('/api/v1/base/plugin/check', async (req, res) => {
      try {
        const { code, messages, ctx } = req.body;
        const ctxMap = new Map(Object.entries(ctx));
        const resp = await this.pluginService.checkPlugin(
          code,
          // @ts-ignore
          ctxMap,
          messages,
        );
        res.json(resp);
      } catch (error) {
        res.json({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          message: error instanceof Error ? error.message : String(error),
          consoleOutput: [],
        });
      }
    });

    // 获取任务列表
    this.app.get('/api/v1/strategy/tasks', async (req, res) => {
      try {
        const tasks = await this.appService.getTasks();
        res.json({
          success: true,
          data: tasks,
        });
      } catch (error) {
        console.error(error);
        res.json({
          success: false,
          data: null,
        });
      }
    });

    // 添加任务
    this.app.post('/api/v1/strategy/tasks', async (req, res) => {
      const { appId } = req.body;
      try {
        const task = await this.appService.addTask(String(appId));
        res.json({
          success: true,
          data: task,
        });
      } catch (error) {
        res.json({
          success: false,
          error: error instanceof Error ? error.message : String(error),
          data: null,
        });
      }
    });

    // 删除任务
    this.app.post('/api/v1/strategy/task/remove', async (req, res) => {
      const { taskId } = req.body;
      try {
        await this.appService.removeTask(String(taskId));
        res.json({
          success: true,
        });
      } catch (error) {
        console.error(error);
        res.json({
          success: false,
        });
      }
    });
  }

  // 启动服务器的方法
  start() {
    return new Promise((resolve, reject) => {
      this.server = this.server
        .listen(this.port, '127.0.0.1', async () => {
          try {
            await databaseReady;
            console.log(`Server is running on http://localhost:${this.port}`);
            this.qianniuCompatService.start();
            this.wechatSidecarService.start();
            this.wecomSidecarService.start();
            this.jinmaiSidecarService.start();
            this.pddSidecarService.start();
            this.douyinSidecarService.start();
            this.ragService.start();
            resolve(true);
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
    });
  }

  // 停止服务器的方法
  stop() {
    this.qianniuCompatService.stop();
    this.wechatSidecarService.stop();
    this.wecomSidecarService.stop();
    this.jinmaiSidecarService.stop();
    this.pddSidecarService.stop();
    this.douyinSidecarService.stop();
    this.ragService.stop();
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err: any) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(true);
        });
      } else {
        reject(new Error('Server not initialized'));
      }
    });
  }
}

export default BKServer;
