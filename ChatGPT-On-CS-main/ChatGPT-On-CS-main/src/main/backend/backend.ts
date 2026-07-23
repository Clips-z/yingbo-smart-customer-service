import express from 'express';
import cors from 'cors';
import asyncHandler from 'express-async-handler';
import bodyParser from 'body-parser';
import http from 'http';
import { Server } from 'socket.io';
import { BrowserWindow, shell } from 'electron';
import {
  clearPendingRestoreRagRebuild,
  databaseReady,
  getPendingRestoreRagRebuild,
  sequelize,
} from './ormconfig';
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
  JinmaiReplyMode,
  JinmaiSidecarService,
} from './services/jinmaiSidecarService';
import { CollectorState, ReplyMode } from './services/baseSidecarService';
import { PddSidecarService } from './services/pddSidecarService';
import { DouyinSidecarService } from './services/douyinSidecarService';
import { RagService } from './services/ragService';
import {
  evaluateAutomaticDelivery,
  getMinimumOcrConfidence,
  ReplyModeDeniedError,
} from './services/replySafetyPolicy';
import {
  listRetrievalEvidence,
  markRetrievalEvidence,
  saveRetrievalEvidence,
} from './services/retrievalEvidenceService';
import { KnowledgeService } from './services/knowledgeService';
import {
  ReplyFeedbackAction,
  ReplyFeedbackService,
} from './services/replyFeedbackService';
import {
  KnowledgeExportFormat,
  serializeKnowledgeExport,
} from './services/knowledgeExportService';
import {
  ReplySuggestion,
  ReplySuggestionStatus,
} from './entities/replySuggestion';
import { KnowledgeCandidateService } from './services/knowledgeCandidateService';
import { EvaluationService } from './services/evaluationService';
import { BackupService } from './services/backupService';
import { appendAuditEvent, AuditExportFormat, listAuditEvents, serializeAuditExport } from './services/auditService';
import { deleteReplayFixture, listReplayFixtures, replaySanitizedFixtures, saveReplayFixture } from './services/replayService';
import { CompanionContextRegistry } from './services/companionContextRegistry';
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

  private knowledgeService: KnowledgeService;

  private replyFeedbackService: ReplyFeedbackService;

  private knowledgeCandidateService: KnowledgeCandidateService;

  private evaluationService: EvaluationService;

  private backupService: BackupService;

  private qianniuCompatService: QianniuCompatService;

  private wechatSidecarService: WechatSidecarService;

  private ragService: RagService;

  private wecomSidecarService: WecomSidecarService;

  private jinmaiSidecarService: JinmaiSidecarService;

  private pddSidecarService: PddSidecarService;

  private douyinSidecarService: DouyinSidecarService;

  private companionContextRegistry = new CompanionContextRegistry(1);

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
    this.app.use((req, res, next) => {
      const role = String(req.get('x-local-role') || 'admin');
      if (
        role === 'viewer' &&
        req.method !== 'GET' &&
        /^\/api\/v1\/(knowledge|quality|governance)\//.test(req.path)
      ) {
        res.status(403).json({ success: false, message: '当前为只读角色，不能修改知识或治理数据' });
        return;
      }
      next();
    });
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
    this.knowledgeService = new KnowledgeService(sequelize);
    this.replyFeedbackService = new ReplyFeedbackService();
    this.knowledgeCandidateService = new KnowledgeCandidateService(this.knowledgeService);
    this.qianniuCompatService = new QianniuCompatService(
      this.dispatchService,
      this.appService,
      this.loggerService,
      async (input) => {
        const result = await this.replyFeedbackService.record(input);
        if (result.created) {
          await this.knowledgeCandidateService.considerFeedback(result.feedback);
        }
      },
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
    this.evaluationService = new EvaluationService((query, topK) =>
      this.ragService.search(query, topK),
    );
    this.backupService = new BackupService(sequelize);
    this.knowledgeService.setIndexer((text, filename) =>
      this.ragService.uploadText(text, filename),
    );
    this.knowledgeService.setRagRebuilder(() => this.ragService.clearKnowledgeSources());

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
    this.app.get('/api/analytics/overview', this.analyticsController.getOverview);
    this.app.get('/api/analytics/daily-trend', this.analyticsController.getDailyTrend);
    this.app.get('/api/analytics/platform-distribution', this.analyticsController.getPlatformDistribution);
    this.app.get('/api/analytics/status-distribution', this.analyticsController.getStatusDistribution);
    this.app.get('/api/analytics/top-senders', this.analyticsController.getTopSenders);
    this.app.get('/api/analytics/avg-response-time', this.analyticsController.getAvgResponseTime);

    const feedbackActions: ReplyFeedbackAction[] = [
      'generated',
      'draft_saved',
      'copied',
      'filled',
      'sent',
      'dismissed',
      'restored',
      'failed',
      'transferred',
      'evidence_irrelevant',
    ];
    this.app.post(
      '/api/v1/quality/feedback',
      asyncHandler(async (req, res) => {
        const suggestionId = Number(req.body.suggestionId);
        const action = String(req.body.action || '') as ReplyFeedbackAction;
        if (!Number.isInteger(suggestionId) || suggestionId <= 0 || !feedbackActions.includes(action)) {
          res.status(400).json({ success: false, message: '无效的回复反馈' });
          return;
        }
        const result = await this.replyFeedbackService.record({
          suggestionId,
          action,
          eventKey: req.body.eventKey ? String(req.body.eventKey) : undefined,
          finalContent: req.body.finalContent,
          reasonCode: req.body.reasonCode,
          metadata: req.body.metadata,
        });
        const candidate = result.created
          ? await this.knowledgeCandidateService.considerFeedback(result.feedback)
          : null;
        res.json({ success: true, data: { ...result, candidate } });
      }),
    );
    this.app.get(
      '/api/v1/quality/metrics',
      asyncHandler(async (req, res) => {
        res.json({
          success: true,
          data: await this.replyFeedbackService.getMetrics(Number(req.query.days) || 7),
        });
      }),
    );
    this.app.get(
      '/api/v1/quality/feedback/variants',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.replyFeedbackService.getVariantMetrics(Number(req.query.days) || 30) });
      }),
    );
    this.app.get(
      '/api/v1/quality/suggestions/:id/evidence',
      asyncHandler(async (req, res) => {
        res.json({
          success: true,
          data: await listRetrievalEvidence(Number(req.params.id)),
        });
      }),
    );
    this.app.post(
      '/api/v1/quality/evidence/:id/feedback',
      asyncHandler(async (req, res) => {
        res.json({
          success: true,
          data: await markRetrievalEvidence(
            String(req.params.id),
            req.body.relevant !== false,
          ),
        });
      }),
    );
    this.app.get(
      '/api/v1/knowledge/candidates',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.knowledgeCandidateService.list(req.query) });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/candidates/approve',
      asyncHandler(async (req, res) => {
        res.json({
          success: true,
          data: await this.knowledgeCandidateService.approve(String(req.body.id || ''), req.body),
        });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/candidates/reject',
      asyncHandler(async (req, res) => {
        res.json({
          success: true,
          data: await this.knowledgeCandidateService.reject(String(req.body.id || ''), req.body.reason),
        });
      }),
    );
    this.app.post(
      '/api/v1/quality/evaluation/search',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.evaluationService.search(req.body.question) });
      }),
    );
    this.app.get(
      '/api/v1/quality/evaluation/cases',
      asyncHandler(async (_req, res) => {
        res.json({ success: true, data: await this.evaluationService.listCases() });
      }),
    );
    this.app.post(
      '/api/v1/quality/evaluation/cases/save',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.evaluationService.saveCase(req.body) });
      }),
    );
    this.app.post(
      '/api/v1/quality/evaluation/cases/delete',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.evaluationService.deleteCase(String(req.body.id || '')) });
      }),
    );
    this.app.post(
      '/api/v1/quality/evaluation/run',
      asyncHandler(async (_req, res) => {
        res.json({ success: true, data: await this.evaluationService.runCases() });
      }),
    );
    this.app.post(
      '/api/v1/quality/evaluation/compare',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.evaluationService.compareVariants(req.body) });
      }),
    );
    this.app.get(
      '/api/v1/quality/evaluation/runs',
      asyncHandler(async (_req, res) => {
        res.json({ success: true, data: await this.evaluationService.listComparisonRuns() });
      }),
    );
    this.app.post('/api/v1/quality/replay', (req, res) => {
      const rows = replaySanitizedFixtures(req.body.fixtures);
      res.json({ success: true, data: { rows, passed: rows.filter((row) => row.passed).length, total: rows.length } });
    });
    this.app.get('/api/v1/quality/replay/fixtures', asyncHandler(async (_req, res) => {
      res.json({ success: true, data: await listReplayFixtures() });
    }));
    this.app.post('/api/v1/quality/replay/fixtures/save', asyncHandler(async (req, res) => {
      res.json({ success: true, data: await saveReplayFixture(req.body) });
    }));
    this.app.post('/api/v1/quality/replay/fixtures/delete', asyncHandler(async (req, res) => {
      res.json({ success: true, data: await deleteReplayFixture(String(req.body.id || '')) });
    }));
    this.app.get(
      '/api/v1/governance/audit',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await listAuditEvents(req.query) });
      }),
    );
    this.app.get(
      '/api/v1/governance/audit/export',
      asyncHandler(async (req, res) => {
        const format = String(req.query.format || 'csv') as AuditExportFormat;
        if (!['csv', 'json'].includes(format)) throw new Error('不支持的导出格式');
        const { items } = await listAuditEvents({ ...req.query, page: 1, pageSize: 200 });
        const exported = serializeAuditExport(format, items);
        const date = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', exported.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="yingbo-audit-${date}.${exported.extension}"`);
        res.send(exported.body);
      }),
    );
    this.app.get(
      '/api/v1/knowledge/:kind/:id/versions',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.knowledgeService.listVersions(req.params.kind as 'store' | 'product', req.params.id) });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/versions/rollback',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.knowledgeService.rollback(req.body.kind, String(req.body.id || ''), Number(req.body.version)) });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/rebuild-rag',
      asyncHandler(async (_req, res) => {
        res.json({ success: true, data: await this.knowledgeService.rebuildRag() });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/store-qa/merge/preview',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.knowledgeService.previewStoreMerge(String(req.body.targetId || ''), String(req.body.sourceId || '')) });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/store-qa/merge',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.knowledgeService.mergeStoreKnowledge(String(req.body.targetId || ''), String(req.body.sourceId || '')) });
      }),
    );
    this.app.post('/api/v1/governance/backups/create', asyncHandler(async (_req, res) => {
      res.json({ success: true, data: await this.backupService.create() });
    }));
    this.app.get('/api/v1/governance/backups', asyncHandler(async (_req, res) => {
      res.json({ success: true, data: await this.backupService.list() });
    }));
    this.app.post('/api/v1/governance/backups/verify', asyncHandler(async (req, res) => {
      res.json({ success: true, data: await this.backupService.verify(String(req.body.id || '')) });
    }));
    this.app.post('/api/v1/governance/backups/restore', asyncHandler(async (req, res) => {
      res.json({ success: true, data: await this.backupService.scheduleRestore(String(req.body.id || '')) });
    }));

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

        const binding = this.companionContextRegistry.bindingFor(
          String(platformId),
          String(sender),
        );
        const deliveryDecision = evaluateAutomaticDelivery({
          safeToAutoSend: reply.safeToAutoSend,
          source: reply.source,
          retrievalStatus: reply.retrievalStatus,
          ocrConfidence: binding?.snapshot.confidence,
          minimumOcrConfidence: getMinimumOcrConfidence(String(platformId)),
          conversationStable: Boolean(binding),
          content: reply.content,
        });
        const safeReply = { ...reply, safeToAutoSend: deliveryDecision.allowed };
        const suggestion = await ReplySuggestion.create({
          ...(binding
            ? {
                conversation_key: binding.conversationKey,
                draft_key: binding.draftKey,
                store_id: binding.snapshot.storeId,
                account_id: binding.snapshot.accountId,
                contact_id: binding.snapshot.contactId,
                chat_fingerprint: binding.snapshot.chatFingerprint,
                incoming_message_fingerprint:
                  binding.snapshot.incomingMessageFingerprint || null,
                context_revision: binding.snapshot.contextRevision,
                draft_state: 'draft',
              }
            : {}),
          platform_id: String(platformId),
          store: String(ctx.CTX_PLATFORM || platformName),
          sender: String(sender),
          incoming_content: String(content),
          reply_content: reply.content,
          original_reply_content: reply.content,
          draft_content: reply.content,
          retrieval_status: reply.retrievalStatus || 'disabled',
          risk_level: deliveryDecision.riskLevel,
          ocr_confidence: binding?.snapshot.confidence ?? null,
          ocr_reason_codes: deliveryDecision.allowed ? [] : [deliveryDecision.code],
          status: reply.type === 'NO_REPLY' ? 'dismissed' : 'pending',
          created_at: new Date(),
          updated_at: new Date(),
        });
        await saveRetrievalEvidence(suggestion, reply);
        void this.replyFeedbackService.record({
          suggestionId: suggestion.id,
          eventKey: `suggestion:${suggestion.id}:generated`,
          action: 'generated',
        }).catch((error) => this.loggerService.warn(`回复反馈保存失败：${String(error)}`));
        this.dispatchService.receiveBroadcast({
          event: 'reply_suggestion_created',
          data: suggestion.toJSON(),
        });

        res.json({
          success: true,
          data: {
            reply: safeReply,
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

    this.app.get('/api/v1/compat/qianniu/health', (_req, res) => {
      res.json({ success: true, data: this.qianniuCompatService.getHealth() });
    });

    this.app.post('/api/v1/compat/qianniu/refresh', (_req, res) => {
      res.json({
        success: true,
        data: this.qianniuCompatService.requestRefresh(),
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
        try {
          await this.qianniuCompatService.setMode(
            mode as 'hint' | 'assist' | 'unattended',
          );
        } catch (error) {
          if (error instanceof ReplyModeDeniedError) {
            res.status(error.statusCode).json({
              success: false,
              code: error.code,
              message: error.message,
            });
            return;
          }
          throw error;
        }
        res.json({ success: true, data: { mode } });
      }),
    );

    this.app.post(
      '/api/v1/compat/qianniu/emergency-stop',
      asyncHandler(async (_req, res) => {
        const cancelled = await this.qianniuCompatService.emergencyStop();
        res.json({ success: true, data: { mode: 'assist', cancelled } });
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
        try {
          await this.wechatSidecarService.setMode(
            mode as 'hint' | 'assist' | 'unattended',
          );
        } catch (error) {
          if (error instanceof ReplyModeDeniedError) {
            res.status(error.statusCode).json({
              success: false,
              code: error.code,
              message: error.message,
            });
            return;
          }
          throw error;
        }
        res.json({ success: true, data: { mode } });
      }),
    );

    this.app.post(
      '/api/v1/compat/wechat/emergency-stop',
      asyncHandler(async (_req, res) => {
        const cancelled = await this.wechatSidecarService.emergencyStop();
        res.json({ success: true, data: { mode: 'assist', cancelled } });
      }),
    );

    this.app.get('/api/v1/compat/wechat/health', (req, res) => {
      res.json({ success: true, data: this.wechatSidecarService.getHealth() });
    });

    this.app.get('/api/v1/compat/companion/context', (req, res) => {
      const platformId = String(req.query.platformId || 'win_qianniu');
      if (platformId === 'win_qianniu') {
        res.json({ success: true, data: this.qianniuCompatService.getContext() });
        return;
      }
      const snapshot = this.companionContextRegistry.get(platformId);
      const binding = snapshot
        ? this.companionContextRegistry.bindingFor(
            platformId,
            snapshot.contactId,
          )
        : undefined;
      res.json({
        success: true,
        data: binding
          ? {
              ...binding.snapshot,
              conversationKey: binding.conversationKey,
              draftKey: binding.draftKey,
            }
          : snapshot,
      });
    });

    this.app.post('/api/v1/compat/:platform/context', (req, res) => {
      const platformId =
        req.params.platform === 'wechat'
          ? 'win_wechat'
          : req.params.platform === 'wecom'
            ? 'win_wecom'
            : '';
      if (!platformId) {
        res.status(404).json({ success: false, message: 'Unsupported platform' });
        return;
      }
      try {
        const body = req.body || {};
        const update = this.companionContextRegistry.observe({
          platformId,
          storeId: String(body.storeId || platformId),
          accountId: String(body.accountId || `${platformId}-default`),
          contactId: String(body.contactId || '').trim(),
          chatFingerprint: String(body.chatFingerprint || '').trim(),
          recentMessages: Array.isArray(body.recentMessages)
            ? body.recentMessages
                .slice(-3)
                .map((message: any) => ({
                  direction:
                    message?.direction === 'outgoing'
                      ? ('outgoing' as const)
                      : ('incoming' as const),
                  content: String(message?.content || '')
                    .trim()
                    .slice(0, 500),
                }))
                .filter((message: { content: string }) => message.content)
            : [],
          incomingMessageFingerprint: body.incomingMessageFingerprint
            ? String(body.incomingMessageFingerprint)
            : null,
          capturedAt: String(body.capturedAt || new Date().toISOString()),
          confidence: Math.max(0, Math.min(1, Number(body.confidence) || 0)),
          storeName: body.storeName ? String(body.storeName) : undefined,
          accountName: body.accountName ? String(body.accountName) : undefined,
        });
        res.json({ success: true, data: update.snapshot });
      } catch (error) {
        res.status(400).json({
          success: false,
          message: error instanceof Error ? error.message : String(error),
        });
      }
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
            res.status(400).json({ success: false, message: '文本不能为空' });
            return;
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

    this.app.get('/api/v1/compat/qianniu/context', (req, res) => {
      res.json({ success: true, data: this.qianniuCompatService.getContext() });
    });

    this.app.post(
      '/api/v1/compat/qianniu/suggestions/draft',
      asyncHandler(async (req, res) => {
        const id = Number(req.body.id);
        if (!Number.isInteger(id) || id <= 0) {
          res.status(400).json({ success: false, message: 'Invalid suggestion id' });
          return;
        }
        const suggestion = await ReplySuggestion.findByPk(id);
        if (
          !suggestion ||
          !['win_qianniu', 'win_wechat', 'win_wecom'].includes(
            suggestion.platform_id,
          )
        ) {
          res.status(404).json({ success: false, message: '千牛回复记录不存在' });
          return;
        }
        try {
          const { saveConversationDraft } = await import(
            './services/conversationDraftService'
          );
          await saveConversationDraft({
            suggestion,
            content: req.body.content,
            contextRevision: req.body.contextRevision,
          });
          this.dispatchService.receiveBroadcast({
            event: 'qianniu_suggestion_updated',
            data: suggestion.toJSON(),
          });
          res.json({ success: true, data: suggestion });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          res.status(409).json({ success: false, message });
        }
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
          if (
            !this.companionContextRegistry.matchesLiveConversation({
              platformId: 'win_wechat',
              contactId: suggestion.contact_id || suggestion.sender,
              conversationKey: suggestion.conversation_key,
              contextRevision: suggestion.context_revision,
            })
          ) {
            res.status(409).json({
              success: false,
              message: '微信当前联系人已切换，请确认会话后重试',
            });
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
        (validStates.includes(state) ? state : 'running') as CollectorState,
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
          if (
            !this.companionContextRegistry.matchesLiveConversation({
              platformId: 'win_wecom',
              contactId: suggestion.contact_id || suggestion.sender,
              conversationKey: suggestion.conversation_key,
              contextRevision: suggestion.context_revision,
            })
          ) {
            res.status(409).json({
              success: false,
              message: '企业微信当前联系人已切换，请确认会话后重试',
            });
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
        await this.pddSidecarService.setMode(mode as ReplyMode);
        res.json({ success: true, data: { mode } });
      }),
    );
    this.app.get('/api/v1/compat/pdd/health', (req, res) => {
      res.json({ success: true, data: this.pddSidecarService.getHealth() });
    });
    this.app.post('/api/v1/compat/pdd/health', (req, res) => {
      const { state, error } = req.body || {};
      if (state && ['stopped', 'starting', 'running', 'degraded'].includes(state)) {
        this.pddSidecarService.reportHealth(state as CollectorState, error);
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
        await this.douyinSidecarService.setMode(mode as ReplyMode);
        res.json({ success: true, data: { mode } });
      }),
    );
    this.app.get('/api/v1/compat/douyin/health', (req, res) => {
      res.json({ success: true, data: this.douyinSidecarService.getHealth() });
    });
    this.app.post('/api/v1/compat/douyin/health', (req, res) => {
      const { state, error } = req.body || {};
      if (state && ['stopped', 'starting', 'running', 'degraded'].includes(state)) {
        this.douyinSidecarService.reportHealth(state as CollectorState, error);
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
    // 持久化知识库
    this.app.get(
      '/api/v1/knowledge/products',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.knowledgeService.listProducts(req.query) });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/products/create',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.knowledgeService.createProduct(req.body) });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/products/update',
      asyncHandler(async (req, res) => {
        res.json({
          success: true,
          data: await this.knowledgeService.updateProduct(String(req.body.id || ''), req.body, req.body.scope),
        });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/products/status',
      asyncHandler(async (req, res) => {
        const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String).slice(0, 500) : [];
        const updated = await this.knowledgeService.setProductsOnSale(ids, Boolean(req.body.onSale));
        res.json({ success: true, data: { updated } });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/products/delete',
      asyncHandler(async (req, res) => {
        const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String).slice(0, 500) : [];
        const deleted = await this.knowledgeService.deleteProducts(ids);
        res.json({ success: true, data: { deleted } });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/products/import',
      asyncHandler(async (req, res) => {
        const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
        const results = await this.knowledgeService.importProducts(rows);
        res.json({ success: true, data: { results } });
      }),
    );
    this.app.get(
      '/api/v1/knowledge/store-qa',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.knowledgeService.listStoreKnowledge(req.query) });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/store-qa/create',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.knowledgeService.createStoreKnowledge(req.body) });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/store-qa/update',
      asyncHandler(async (req, res) => {
        res.json({ success: true, data: await this.knowledgeService.updateStoreKnowledge(String(req.body.id || ''), req.body, req.body.scope) });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/store-qa/delete',
      asyncHandler(async (req, res) => {
        const deleted = await this.knowledgeService.deleteStoreKnowledge(String(req.body.id || ''));
        res.json({ success: true, data: { deleted } });
      }),
    );
    this.app.get(
      '/api/v1/knowledge/store-qa/conflicts',
      asyncHandler(async (_req, res) => {
        res.json({ success: true, data: await this.knowledgeService.listStoreKnowledgeConflicts() });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/store-qa/import',
      asyncHandler(async (req, res) => {
        const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
        const results = await this.knowledgeService.importStoreKnowledge(rows);
        res.json({ success: true, data: { results } });
      }),
    );
    this.app.post(
      '/api/v1/knowledge/sync/retry',
      asyncHandler(async (req, res) => {
        const kind = String(req.body.kind || '') as 'product' | 'store';
        if (!['product', 'store'].includes(kind)) {
          res.status(400).json({ success: false, message: '无效的知识类型' });
          return;
        }
        const data = await this.knowledgeService.retrySync(kind, String(req.body.id || ''));
        res.json({ success: true, data });
      }),
    );
    this.app.get(
      '/api/v1/knowledge/export',
      asyncHandler(async (req, res) => {
        const kind = String(req.query.kind || '') as 'store' | 'product';
        const format = String(req.query.format || 'csv') as KnowledgeExportFormat;
        if (!['store', 'product'].includes(kind) || !['csv', 'json'].includes(format)) {
          res.status(400).json({ success: false, message: '无效的知识库导出格式' });
          return;
        }
        const records = await this.knowledgeService.exportKnowledge(kind, req.query);
        const exported = serializeKnowledgeExport(format, records);
        const date = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', exported.contentType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="yingbo-${kind}-knowledge-${date}.${exported.extension}"`,
        );
        res.send(exported.body);
      }),
    );

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

  private async rebuildRagAfterRestore(): Promise<void> {
    const pending = getPendingRestoreRagRebuild();
    if (!pending) return;
    try {
      await this.ragService.waitUntilRunning();
      const result = await this.knowledgeService.rebuildRag();
      clearPendingRestoreRagRebuild();
      await appendAuditEvent({
        action: 'backup.restore_completed', entityType: 'backup', entityId: pending.id,
        payload: { restoredAt: pending.restoredAt, ragRebuild: result },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.loggerService.error(`恢复后重建 RAG 失败: ${message}`);
      await appendAuditEvent({
        action: 'backup.restore_rag_failed', entityType: 'backup', entityId: pending.id,
        payload: { restoredAt: pending.restoredAt, message },
      });
    }
  }

  // 启动服务器的方法
  start() {
    return new Promise((resolve, reject) => {
      this.server = this.server
        .listen(this.port, '127.0.0.1', async () => {
          try {
            await databaseReady;
            await this.appService.ensureLocalCompatTask('win_qianniu');
            console.log(`Server is running on http://localhost:${this.port}`);
            this.qianniuCompatService.start();
            this.wechatSidecarService.start();
            this.wecomSidecarService.start();
            this.jinmaiSidecarService.start();
            this.pddSidecarService.start();
            this.douyinSidecarService.start();
            this.ragService.start();
            void this.rebuildRagAfterRestore();
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
