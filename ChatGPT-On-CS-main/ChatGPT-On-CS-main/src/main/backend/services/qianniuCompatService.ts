import { execFile } from 'child_process';
import crypto from 'crypto';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { AppService } from './appService';
import { DispatchService } from './dispatchService';
import { LoggerService } from './loggerService';
import { Config } from '../entities/config';
import {
  ReplySuggestion,
  ReplySuggestionStatus,
} from '../entities/replySuggestion';
import {
  QianniuOcrCandidate,
  QianniuOcrResult,
  QianniuOcrWorker,
} from './qianniuOcrWorker';
import { isPlatformRunning, isPlatformActive } from './platformRuntimeService';
import { createIncomingMessageFingerprint } from './incomingMessageFingerprint';
import {
  cancelQueuedUnattendedDeliveries,
  finishSuggestionDelivery,
  reserveSuggestionDelivery,
} from './deliveryGuard';
import { runtimePath } from './runtimePaths';
import {
  assertReplyModeAllowed,
  evaluateReplyModeChange,
  getDefaultReplyMode,
  normalizeReplyMode,
} from './replySafetyPolicy';
import { evaluateQianniuCapture } from './qianniuCapturePolicy';
import { QianniuHealthTracker } from './qianniuHealth';
import {
  assertQianniuFillResult,
  parseQianniuFillResult,
} from './qianniuFillResult';
import { QianniuContextTracker } from './qianniuContextTracker';
import { assertDeliveryContext } from './deliveryContextGuard';
import { extractQianniuContextEvidence } from './qianniuContextEvidence';

const execFileAsync = promisify(execFile);

export type QianniuReplyMode = 'hint' | 'assist' | 'unattended';

const MIN_OCR_CONFIDENCE = Number(
  process.env.QIANNIU_OCR_MIN_CONFIDENCE || 0.88,
);

const CONFIRM_OCR_BELOW = Number(process.env.QIANNIU_OCR_CONFIRM_BELOW || 0.92);

type CaptureResult = {
  hwnd: number;
  image: string;
  chat_fingerprint: string;
  qianniu_foreground: boolean;
  click_performed: boolean;
  tab_alert_x: number[];
  conversation_alerts: Array<{ x: number; y: number; pixels: number }>;
  candidate: QianniuOcrCandidate;
  ocr_engine: 'rapidocr' | 'windows' | 'none';
  lines: QianniuOcrResult['lines'];
  store_id?: string;
  account_id?: string;
  product_id?: string;
};

export class QianniuCompatService {
  private timer?: NodeJS.Timeout;

  private busy = false;

  private lastMessageKey = '';

  private lastTabAlertX = -1;

  private lastConversationAlertY = -1;

  private lastActivePollAt = 0;

  private ocrWorker = new QianniuOcrWorker();

  private nextScanAt = 0;

  private lastFailureKey = '';

  private lastFailureLogAt = 0;

  private lastRecognizedFingerprint = '';

  private replyMode: QianniuReplyMode = 'assist';

  private clientRunning = false;

  private health = new QianniuHealthTracker();

  // The compatibility collector currently emits one validated OCR snapshot.
  // A multi-sample tracker can be enabled when the lightweight context probe is added.
  private contextTracker = new QianniuContextTracker(1);

  constructor(
    private dispatchService: DispatchService,
    private appService: AppService,
    private log: LoggerService,
  ) {}

  public getMode(): QianniuReplyMode {
    return this.replyMode;
  }

  public getHealth() {
    return this.health.getHealth();
  }

  public getContext() {
    const snapshot = this.contextTracker.getSnapshot();
    if (!snapshot) return undefined;
    return { ...snapshot, ...this.contextTracker.keys(snapshot) };
  }

  public async setMode(mode: QianniuReplyMode): Promise<void> {
    const config = await Config.findOne({ where: { global: true } });
    const decision = evaluateReplyModeChange({
      platformId: 'win_qianniu',
      requestedMode: mode,
      unattendedEnabled: Boolean(config?.qianniu_unattended_enabled),
    });
    assertReplyModeAllowed(decision);

    this.replyMode = decision.mode;
    if (config) await config.update({ qianniu_reply_mode: decision.mode });
    this.dispatchService.receiveBroadcast({
      event: 'qianniu_reply_mode_changed',
      data: { mode: decision.mode },
    });
  }

  public async emergencyStop(): Promise<number> {
    await this.setMode('assist');
    return cancelQueuedUnattendedDeliveries('win_qianniu');
  }

  public async listSuggestions(
    status?: string,
    platformId = 'win_qianniu',
  ): Promise<ReplySuggestion[]> {
    const where: Record<string, unknown> = {};
    if (platformId && platformId !== 'all') {
      where.platform_id = platformId;
    }
    if (status && status !== 'all') {
      where.status = status as ReplySuggestionStatus;
    }
    return ReplySuggestion.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 100,
    });
  }

  public async fillSuggestion(
    id: number,
    editedContent?: string,
  ): Promise<ReplySuggestion> {
    if (this.replyMode !== 'assist') {
      throw new Error('请先切换到辅助回复模式');
    }
    const suggestion = await ReplySuggestion.findByPk(id);
    if (!suggestion) throw new Error('待回复记录不存在');
    if (suggestion.conversation_key) {
      assertDeliveryContext({
        draft: {
          conversationKey: suggestion.conversation_key,
          draftKey: suggestion.draft_key || '',
          platformId: suggestion.platform_id,
          storeId: suggestion.store_id || '',
          accountId: suggestion.account_id || '',
          contactId: suggestion.contact_id || suggestion.sender,
          chatFingerprint: suggestion.chat_fingerprint || '',
          productId: suggestion.product_id,
          incomingMessageFingerprint: suggestion.incoming_message_fingerprint,
          contextRevision: suggestion.context_revision || 0,
          state: suggestion.status === 'sent' ? 'sent' : suggestion.status === 'cancelled' ? 'cancelled' : suggestion.draft_state === 'expired' ? 'expired' : suggestion.status === 'failed' ? 'failed' : 'draft',
        },
        live: this.contextTracker.getSnapshot(),
      });
    }
    const replyContent = editedContent?.trim() || suggestion.reply_content;
    const requestId = await reserveSuggestionDelivery(id, 'prepare');
    try {
      await this.sendReply(replyContent, false, suggestion.sender);
      const completed = await finishSuggestionDelivery({
        id,
        requestId,
        status: 'prepared',
      });
      if (!completed) throw new Error('填入结果已过期，未更新回复状态');
      await suggestion.update({
        reply_content: replyContent,
        draft_content: replyContent,
        draft_state: 'prepared',
        draft_updated_at: new Date(),
      });
    } catch (error) {
      await finishSuggestionDelivery({
        id,
        requestId,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    await suggestion.reload();
    this.broadcastSuggestion('qianniu_suggestion_updated', suggestion);
    return suggestion;
  }

  public async updateSuggestionStatus(
    id: number,
    status: ReplySuggestionStatus,
  ): Promise<ReplySuggestion> {
    const suggestion = await ReplySuggestion.findByPk(id);
    if (!suggestion) throw new Error('待回复记录不存在');
    await suggestion.update({ status, updated_at: new Date() });
    this.broadcastSuggestion('qianniu_suggestion_updated', suggestion);
    return suggestion;
  }

  /**
   * 批量更新建议状态（如一键全部标记已处理）
   */
  public async batchUpdateStatus(
    ids: number[],
    status: ReplySuggestionStatus,
  ): Promise<number> {
    const [count] = await ReplySuggestion.update(
      { status, updated_at: new Date() },
      { where: { id: ids } },
    );
    // 广播更新事件
    const updated = await ReplySuggestion.findAll({
      where: { id: ids },
      limit: ids.length,
    });
    for (const s of updated) {
      this.broadcastSuggestion('qianniu_suggestion_updated', s);
    }
    return count;
  }

  /**
   * 批量删除建议记录
   */
  public async batchDelete(ids: number[]): Promise<number> {
    const count = await ReplySuggestion.destroy({ where: { id: ids } });
    this.dispatchService.receiveBroadcast({
      event: 'qianniu_suggestions_deleted',
      data: { ids, count },
    });
    return count;
  }

  /**
   * 按条件清理建议（如清空所有已处理的）
   */
  public async clearSuggestions(options?: {
    status?: ReplySuggestionStatus | 'handled';
    platformId?: string;
  }): Promise<number> {
    const where: Record<string, unknown> = {};
    if (options?.platformId && options.platformId !== 'all') {
      where.platform_id = options.platformId;
    }
    if (options?.status === 'handled') {
      // 已处理 = 非 pending/failed
      where.status = {
        [require('sequelize').Op.notIn]: ['pending', 'failed'],
      };
    } else if (options?.status) {
      where.status = options.status;
    }
    const count = await ReplySuggestion.destroy({ where });
    this.dispatchService.receiveBroadcast({
      event: 'qianniu_suggestions_cleared',
      data: { count, where: options || {} },
    });
    return count;
  }

  private async loadMode(): Promise<void> {
    const config = await Config.findOne({ where: { global: true } });
    const rawStoredMode = config?.qianniu_reply_mode;
    const stored = normalizeReplyMode(
      'win_qianniu',
      rawStoredMode,
    ) as QianniuReplyMode;
    const decision = evaluateReplyModeChange({
      platformId: 'win_qianniu',
      requestedMode: stored,
      unattendedEnabled: Boolean(config?.qianniu_unattended_enabled),
    });
    this.replyMode = decision.allowed
      ? decision.mode
      : getDefaultReplyMode('win_qianniu');
    if (config && this.replyMode !== rawStoredMode) {
      await config.update({ qianniu_reply_mode: this.replyMode });
    }
  }

  private broadcastSuggestion(
    event: string,
    suggestion: ReplySuggestion,
  ): void {
    this.dispatchService.receiveBroadcast({ event, data: suggestion.toJSON() });
  }

  public start(): void {
    if (process.platform !== 'win32') return;
    void this.loadMode().catch(() => {
      setTimeout(() => {
        void this.loadMode().catch((error) => {
          this.log.warn(
            `Qianniu reply mode could not be loaded: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      }, 1000);
    });
    this.timer = setInterval(() => {
      void (async () => {
        const running = await isPlatformRunning('win_qianniu');
        const active = await isPlatformActive('win_qianniu');
        const shouldRun = running && active;
        if (!shouldRun) {
          this.health.markStopped(
            running ? '千牛平台未激活' : '千牛客户端未启动',
          );
          if (this.clientRunning) {
            this.clientRunning = false;
            this.ocrWorker.stop();
            this.log.info(active ? '千牛已关闭，千牛采集已停止' : '千牛平台未激活，千牛采集已停止');
          }
          return;
        }
        if (!this.clientRunning) {
          this.clientRunning = true;
          this.log.info('检测到千牛，千牛采集已启动');
        }
        if (this.busy || Date.now() < this.nextScanAt) return;
        this.scan()
          .then(() => this.markScanHealthy())
          .catch((error) => this.handleScanError(error));
      })();
    }, 3000);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.clientRunning = false;
    this.health.markStopped();
    this.ocrWorker.stop();
  }

  private async capture(options?: {
    click?: { x: number; y: number };
    skipOcr?: boolean;
  }): Promise<CaptureResult> {
    const scriptPath = runtimePath('scripts', 'qianniu-compat-capture.ps1');
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
    ];
    if (options?.click) {
      args.push(
        '-ClickX',
        String(options.click.x),
        '-ClickY',
        String(options.click.y),
      );
    }
    args.push('-SkipOcr');
    if (process.env.QIANNIU_COMPAT_NON_INTRUSIVE === '0') {
      args.push('-AllowWhenForeground');
    }

    const { stdout } = await execFileAsync('powershell.exe', args, {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 5 * 1024 * 1024,
    });
    const capture = JSON.parse(stdout.trim()) as CaptureResult;
    if (options?.skipOcr) return capture;

    return this.recognizeCapture(capture);
  }

  private async recognizeCapture(
    capture: CaptureResult,
  ): Promise<CaptureResult> {
    try {
      const result = await this.ocrWorker.recognize(capture.image);
      return {
        ...capture,
        candidate: result.candidate,
        ocr_engine: result.engine,
        lines: result.lines,
      };
    } catch (error) {
      this.log.warn(
        `RapidOCR worker unavailable, using one-shot fallback: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      const result = await this.recognizeOnce(capture.image);
      return {
        ...capture,
        candidate: result.candidate,
        ocr_engine: result.engine,
        lines: result.lines,
      };
    }
  }

  private handleScanError(error: unknown): void {
    this.busy = false;
    const message = error instanceof Error ? error.message : String(error);
    const qianniuMissing = message.includes(
      'Qianniu reception window was not found',
    );
    const now = Date.now();
    this.nextScanAt = now + (qianniuMissing ? 30_000 : 10_000);
    this.health.markFailure(message, this.nextScanAt);
    const key = qianniuMissing
      ? 'qianniu-window-missing'
      : message.slice(0, 200);
    if (key !== this.lastFailureKey || now - this.lastFailureLogAt > 300_000) {
      this.log.warn(
        qianniuMissing
          ? '千牛兼容采集等待中：未找到千牛接待台，30 秒后重试'
          : `千牛兼容采集失败: ${message}`,
      );
      this.lastFailureKey = key;
      this.lastFailureLogAt = now;
    }
  }

  private markScanHealthy(): void {
    this.nextScanAt = 0;
    this.health.markRunning();
    if (this.lastFailureKey) {
      this.log.info('千牛兼容采集已恢复');
      this.lastFailureKey = '';
    }
  }

  private async recognizeOnce(image: string): Promise<QianniuOcrResult> {
    const python = runtimePath('tools', 'python311', 'python.exe');
    const script = runtimePath('scripts', 'qianniu-rapidocr.py');
    const { stdout } = await execFileAsync(
      python,
      ['-X', 'utf8', script, image],
      {
        encoding: 'utf8',
        windowsHide: true,
        maxBuffer: 5 * 1024 * 1024,
      },
    );
    const line = stdout.trim().split(/\r?\n/).pop();
    if (!line) throw new Error('RapidOCR fallback returned no output');
    const result = JSON.parse(line) as QianniuOcrResult;
    if (!result.ok) throw new Error(result.error || 'RapidOCR fallback failed');
    return result;
  }

  private async scan(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      let capture = await this.capture({ skipOcr: true });
      if (
        process.env.QIANNIU_COMPAT_NON_INTRUSIVE !== '0' &&
        capture.qianniu_foreground
      ) {
        return;
      }
      const tabAlerts = [...(capture.tab_alert_x || [])].sort(
        (left, right) => left - right,
      );
      const tabAlert =
        tabAlerts.find((x) => x > this.lastTabAlertX + 20) ?? tabAlerts[0];
      if (typeof tabAlert === 'number') {
        this.lastTabAlertX = tabAlert;
        capture = await this.capture({
          click: { x: tabAlert, y: 28 },
          skipOcr: true,
        });
        if (!capture.click_performed) return;
      }

      const conversationAlerts = [...(capture.conversation_alerts || [])].sort(
        (left, right) => left.y - right.y,
      );
      const conversationAlert =
        conversationAlerts.find(
          (item) => item.y > this.lastConversationAlertY + 22,
        ) ?? conversationAlerts[0];
      if (conversationAlert) {
        this.lastConversationAlertY = conversationAlert.y;
        capture = await this.capture({
          click: { x: 180, y: conversationAlert.y },
          skipOcr: true,
        });
        if (!capture.click_performed) return;
        if (capture.chat_fingerprint === this.lastRecognizedFingerprint) return;
        const fingerprint = capture.chat_fingerprint;
        capture = await this.recognizeCapture(capture);
        this.lastRecognizedFingerprint = fingerprint;
      } else {
        const now = Date.now();
        if (now - this.lastActivePollAt < 10_000) return;
        this.lastActivePollAt = now;
        if (capture.chat_fingerprint === this.lastRecognizedFingerprint) return;
        const fingerprint = capture.chat_fingerprint;
        capture = await this.recognizeCapture(capture);
        this.lastRecognizedFingerprint = fingerprint;
      }

      const decision = evaluateQianniuCapture(
        {
          sender: capture.candidate?.sender,
          content: capture.candidate?.content,
          direction: capture.candidate?.direction,
          latestDirection: capture.candidate?.latest_direction,
          confidence: capture.candidate?.confidence,
          ocrEngine: capture.ocr_engine,
        },
        MIN_OCR_CONFIDENCE,
      );
      if (!decision.accepted) {
        if (
          decision.reasonCode === 'ocr_unavailable' ||
          decision.reasonCode === 'ocr_low_confidence'
        ) {
          this.log.warn(`Qianniu capture skipped: ${decision.reasonCode}`);
        }
        return;
      }
      const { sender, content } = decision;
      const confidence = capture.candidate?.confidence || 0;
      const contextEvidence = extractQianniuContextEvidence(capture.lines || []);
      if (confidence < CONFIRM_OCR_BELOW) {
        const confirmation = await this.capture();
        const confirmedContent = confirmation.candidate?.content?.trim();
        const confirmedConfidence = confirmation.candidate?.confidence || 0;
        if (
          confirmation.ocr_engine !== 'rapidocr' ||
          confirmedContent !== content ||
          confirmedConfidence < MIN_OCR_CONFIDENCE
        ) {
          this.log.warn(
            `Qianniu OCR result was not stable: ` +
              `${content} (${confidence.toFixed(3)}) / ` +
              `${confirmedContent || '<empty>'} (${confirmedConfidence.toFixed(3)})`,
          );
          return;
        }
      }
      const task = (await this.appService.getTasks()).find(
        (item) => item.app_id === 'win_qianniu',
      );
      if (!task) return;

      const key = createIncomingMessageFingerprint({
        platformId: 'win_qianniu',
        chatFingerprint: capture.chat_fingerprint,
        sender,
        content,
      });
      const contextUpdate = this.contextTracker.observe({
        platformId: 'win_qianniu',
        storeId:
          contextEvidence.storeId ||
          capture.store_id?.trim() ||
          task.env_id ||
          'qianniu-default',
        storeName: contextEvidence.storeName || null,
        accountId:
          contextEvidence.accountId || capture.account_id?.trim() || task.task_id,
        accountName: contextEvidence.accountName || null,
        contactId: sender,
        chatFingerprint: capture.chat_fingerprint,
        productId:
          contextEvidence.productId || capture.product_id?.trim() || null,
        productTitle: contextEvidence.productTitle || null,
        incomingMessageFingerprint: key,
        capturedAt: new Date().toISOString(),
        confidence,
      });
      const contextKeys = this.contextTracker.keys(contextUpdate.snapshot);
      if (contextUpdate.changed) {
        this.dispatchService.receiveBroadcast({
          event: 'qianniu_context_changed',
          data: contextUpdate.snapshot,
        });
      }
      if (key === this.lastMessageKey) return;
      this.lastMessageKey = key;

      const existingSuggestion = await ReplySuggestion.findOne({
        where: { message_key: key },
      });
      if (existingSuggestion) {
        this.log.info(`千牛重复采集事件已忽略: ${sender}`);
        return;
      }

      const reply = await this.dispatchService.createReply({
        ctx: {
          CTX_APP_NAME: '千牛',
          CTX_APP_ID: 'win_qianniu',
          CTX_INSTANCE_ID: task.task_id,
          CTX_USERNAME: sender,
          CTX_PLATFORM: 'qianniu-9.96-compat',
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

      if (reply.type !== 'TEXT' || !reply.content.trim()) return;

      const [suggestion, created] = await ReplySuggestion.findOrCreate({
        where: { message_key: key },
        defaults: {
          platform_id: 'win_qianniu',
          store:
            contextUpdate.snapshot.storeName || contextUpdate.snapshot.storeId,
          sender,
          incoming_content: content,
          reply_content: reply.content.trim().slice(0, 300),
          original_reply_content: reply.content.trim().slice(0, 300),
          draft_content: reply.content.trim().slice(0, 300),
          conversation_key: contextKeys?.conversationKey || null,
          draft_key: contextKeys?.draftKey || null,
          store_id: contextUpdate.snapshot.storeId,
          account_id: contextUpdate.snapshot.accountId,
          contact_id: contextUpdate.snapshot.contactId,
          chat_fingerprint: contextUpdate.snapshot.chatFingerprint,
          product_id: contextUpdate.snapshot.productId || null,
          product_title: contextUpdate.snapshot.productTitle || null,
          incoming_message_fingerprint:
            contextUpdate.snapshot.incomingMessageFingerprint || null,
          context_revision: contextUpdate.snapshot.contextRevision,
          draft_state: 'draft',
          draft_updated_at: new Date(),
          message_key: key,
          status: 'pending',
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
      if (!created) {
        this.log.info(`千牛重复采集事件已忽略: ${sender}`);
        return;
      }
      this.broadcastSuggestion('qianniu_suggestion_created', suggestion);

      this.log.success(`千牛兼容采集: ${sender} -> ${content}`);
      if (
        this.replyMode === 'unattended' &&
        reply.type === 'TEXT' &&
        reply.safeToAutoSend === true
      ) {
        const requestId = await reserveSuggestionDelivery(suggestion.id, 'send');
        try {
          await this.sendReply(reply.content, true, sender);
          const completed = await finishSuggestionDelivery({
            id: suggestion.id,
            requestId,
            status: 'sent',
          });
          if (!completed) throw new Error('发送结果已过期，未更新回复状态');
        } catch (error) {
          await finishSuggestionDelivery({
            id: suggestion.id,
            requestId,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
        await suggestion.reload();
        this.broadcastSuggestion('qianniu_suggestion_updated', suggestion);
        this.log.success(`千牛兼容回复已发送: ${sender}`);
      } else {
        if (this.replyMode === 'unattended' && !reply.safeToAutoSend) {
          this.log.warn('回复来源不可靠，已阻止千牛自动发送并保留为待确认');
        }
        this.log.info(`影子回复已生成: ${reply.content}`);
      }
    } finally {
      this.busy = false;
    }
  }

  private async sendReply(
    content: string,
    submit: boolean,
    sender?: string,
  ): Promise<void> {
    const reply = content.trim().slice(0, 300);
    if (!reply) return;

    const replyPath = path.join(
      os.tmpdir(),
      `chatgpt-on-cs-qianniu-reply-${crypto.randomUUID()}.txt`,
    );
    const scriptPath = runtimePath('scripts', 'qianniu-compat-send.ps1');
    await fs.writeFile(replyPath, reply, 'utf8');
    try {
      const runScript = async (options: {
        sender?: string;
        selectOnly?: boolean;
        submit?: boolean;
      }) => {
        const args = [
          '-NoProfile',
          '-Sta',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-ReplyFile',
          replyPath,
        ];
        if (options.sender) args.push('-Sender', options.sender);
        if (options.selectOnly) args.push('-SelectOnly');
        if (options.submit) args.push('-Submit');
        const { stdout } = await execFileAsync('powershell.exe', args, {
          encoding: 'utf8',
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        });
        const result = parseQianniuFillResult(stdout);
        assertQianniuFillResult(
          result,
          options.selectOnly ? 'select' : 'fill',
          options.submit === true,
        );
      };

      if (sender) {
        await runScript({ sender, selectOnly: true });
        const verification = await this.capture();
        const actualSender =
          verification.candidate?.sender?.replace(/\s+/g, '') || '';
        if (actualSender.toLowerCase() !== sender.toLowerCase()) {
          throw new Error(
            `切换用户失败：目标 ${sender}，当前 ${actualSender || '未识别'}`,
          );
        }
      }

      await runScript({ submit });
    } finally {
      await fs.unlink(replyPath).catch(() => undefined);
    }
  }
}
