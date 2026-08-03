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
import { QianniuCaptureWorker } from './qianniuCaptureWorker';
import { isPlatformRunning, isPlatformActive } from './platformRuntimeService';
import { createIncomingMessageFingerprint } from './incomingMessageFingerprint';
import {
  cancelQueuedUnattendedDeliveries,
  finishSuggestionDelivery,
  reserveSuggestionDelivery,
} from './deliveryGuard';
import { rapidOcrPythonPath, runtimePath } from './runtimePaths';
import {
  assertReplyModeAllowed,
  evaluateAutomaticDelivery,
  evaluateReplyModeChange,
  getDefaultReplyMode,
  getMinimumOcrConfidence,
  normalizeReplyMode,
} from './replySafetyPolicy';
import { saveRetrievalEvidence } from './retrievalEvidenceService';
import {
  evaluateQianniuCapture,
  normalizeQianniuContact,
} from './qianniuCapturePolicy';
import { QianniuHealthTracker } from './qianniuHealth';
import {
  assertQianniuFillResult,
  parseQianniuFillResult,
} from './qianniuFillResult';
import { QianniuContextTracker } from './qianniuContextTracker';
import { assertDeliveryContext } from './deliveryContextGuard';
import { prepareDraftDelivery } from './conversationDraftDelivery';
import { extractQianniuContextEvidence } from './qianniuContextEvidence';
import { sanitizeQianniuRecentMessages } from './qianniuRecentMessages';
import { RecordReplyFeedbackInput } from './replyFeedbackService';
import { ReplyDTO } from '../types';
import { CaptureMetrics } from './cdp/captureMetrics';
import { CaptureRouter } from './capture/captureRouter';
import { QianniuOcrAdapter } from './adapters/qianniu/qianniuOcrAdapter';

const execFileAsync = promisify(execFile);

export type QianniuReplyMode = 'hint' | 'assist' | 'unattended';

const MIN_OCR_CONFIDENCE = Number(
  process.env.QIANNIU_OCR_MIN_CONFIDENCE || 0.88,
);

const CONFIRM_OCR_BELOW = Number(process.env.QIANNIU_OCR_CONFIRM_BELOW || 0.92);
// A customer-service operator expects the current chat to follow a click in
// the reception list. Full OCR is still skipped for an unchanged fingerprint,
// but foreground snapshots must be checked much more often than the former
// four-second cadence.
// The resident worker already streams an OCR snapshot every 250ms.  Keeping
// another 750ms debounce here made a customer click feel one to two seconds
// late.  350ms leaves a small coalescing window for the UI transition while
// making the companion follow the reception list perceptibly immediately.
const ACTIVE_CONTEXT_POLL_MS = 350;
const ACTIVE_CONTEXT_TICK_MS = 350;
const HEADER_CONTEXT_REFRESH_MS = 5_000;

function usableCapturedStoreId(value?: string): string | undefined {
  const storeId = value?.trim();
  // A cropped OCR pass can occasionally read a tab index such as "1" as a
  // store name. Prefer the configured shop over binding a conversation to it.
  return storeId && !/^\d{1,2}$/.test(storeId) ? storeId : undefined;
}

type CaptureResult = {
  hwnd: number;
  image: string;
  chat_fingerprint: string;
  qianniu_foreground: boolean;
  qianniu_was_foreground?: boolean;
  click_performed: boolean;
  tab_alert_x: number[];
  conversation_alerts: Array<{ x: number; y: number; pixels: number }>;
  candidate: QianniuOcrCandidate;
  ocr_engine: 'rapidocr' | 'windows' | 'none';
  lines: QianniuOcrResult['lines'];
  recent_messages?: QianniuOcrResult['recent_messages'];
  store_id?: string;
  account_id?: string;
  product_id?: string;
};

export class QianniuCompatService {
  private timer?: NodeJS.Timeout;

  private busy = false;

  private lastMessageKey = '';

  private lastActivePollAt = 0;

  private lastHeaderContextRefreshAt = 0;

  private ocrWorker = new QianniuOcrWorker();

  private captureWorker = new QianniuCaptureWorker();

  private nextScanAt = 0;

  private lastFailureKey = '';

  private lastFailureLogAt = 0;

  private lastRecognizedFingerprint = '';

  private currentScanStartedAt = 0;

  private replyMode: QianniuReplyMode = 'assist';

  // Incremented as soon as the visible chat changes. A slow model response
  // carries the value it started with and is discarded if the operator has
  // already selected another customer or store.
  private generationEpoch = 0;

  private clientRunning = false;

  private health = new QianniuHealthTracker();

  private captureMetrics = new CaptureMetrics();

  private qianniuOcrAdapter = new QianniuOcrAdapter();

  private captureRouterEnabled = process.env.QIANNIU_CAPTURE_ROUTER === '1';

  private captureRouter = new CaptureRouter({
    onPrimaryEvent: (event) => {
      this.captureMetrics.record({
        name: 'incoming_message',
        durationMs: 0,
        ok: true,
        source: event.source === 'ocr' ? 'ocr' : 'unknown',
      });
    },
  });

  // The compatibility collector currently emits one validated OCR snapshot.
  // A multi-sample tracker can be enabled when the lightweight context probe is added.
  private contextTracker = new QianniuContextTracker(1);

  constructor(
    private dispatchService: DispatchService,
    private appService: AppService,
    private log: LoggerService,
    private onFeedback?: (input: RecordReplyFeedbackInput) => Promise<void>,
  ) {}

  public getMode(): QianniuReplyMode {
    return this.replyMode;
  }

  public getHealth() {
    return {
      ...this.health.getHealth(),
      captureMetrics: this.captureMetrics.snapshot(),
      captureRoute: this.captureRouter.healthSnapshot(),
    };
  }

  public getContext() {
    const snapshot = this.contextTracker.getSnapshot();
    if (!snapshot) return undefined;
    return { ...snapshot, ...this.contextTracker.keys(snapshot) };
  }

  public requestRefresh() {
    this.lastRecognizedFingerprint = '';
    this.lastActivePollAt = 0;
    this.lastHeaderContextRefreshAt = 0;
    this.nextScanAt = 0;
    if (!this.busy) {
      void this.scan()
        .then(() => this.markScanHealthy())
        .catch((error) => this.handleScanError(error));
    }
    return { accepted: true };
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
    const verifiedReplyContent = suggestion.conversation_key
      ? prepareDraftDelivery({
          content: replyContent,
          draft: {
        conversationKey: suggestion.conversation_key || '',
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
          action: 'fill',
        })
      : replyContent.trim().slice(0, 300);
    const requestId = await reserveSuggestionDelivery(id, 'prepare');
    const fillStartedAt = Date.now();
    try {
      await this.sendReply(verifiedReplyContent, false, suggestion.sender);
      this.captureMetrics.record({
        name: 'draft_fill',
        durationMs: Date.now() - fillStartedAt,
        ok: true,
        source: 'ocr',
      });
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
      this.captureMetrics.record({
        name: 'draft_fill',
        durationMs: Date.now() - fillStartedAt,
        ok: false,
        source: 'ocr',
      });
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
    storeId?: string;
  }): Promise<number> {
    const where: Record<string, unknown> = {};
    if (options?.platformId && options.platformId !== 'all') {
      where.platform_id = options.platformId;
    }
    if (options?.storeId && options.storeId !== 'all') {
      where.store_id = options.storeId;
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

  private broadcastGenerationState(input: {
    state: 'generating' | 'ready' | 'discarded' | 'failed';
    contextRevision?: number;
    chatFingerprint: string;
    startedAt?: number;
    error?: string;
  }): void {
    this.dispatchService.receiveBroadcast({
      event: 'qianniu_reply_generation_changed',
      data: {
        platformId: 'win_qianniu',
        ...input,
      },
    });
  }

  private retryLoadMode(): void {
    setTimeout(() => {
      void this.loadMode().catch((error) => {
        this.log.warn(
          `Qianniu reply mode could not be loaded: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
    }, 1000);
  }

  public start(): void {
    if (process.platform !== 'win32') return;
    if (this.captureRouterEnabled) this.captureRouter.setPrimary('ocr', 'feature flag enabled');
    void this.loadMode().catch(() => this.retryLoadMode());
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
            this.captureWorker.stop();
            this.contextTracker.markDegraded();
            this.broadcastCurrentContext();
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
    }, ACTIVE_CONTEXT_TICK_MS);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.clientRunning = false;
    this.health.markStopped();
    this.ocrWorker.stop();
    this.captureWorker.stop();
    this.captureRouter.recover('ocr', 'service stopped');
  }

  private async capture(options?: {
    click?: { x: number; y: number };
    skipOcr?: boolean;
  }): Promise<CaptureResult> {
    if (options?.skipOcr && !options.click) {
      return this.captureWorker.capture() as Promise<CaptureResult>;
    }
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
    // The persistent capture worker already performs Windows OCR. Re-running
    // the heavyweight RapidOCR model here would make every customer switch
    // wait several seconds before the assistant can react.
    if (capture.ocr_engine !== 'none' && capture.lines?.length) {
      return capture;
    }
    try {
      const result = await this.ocrWorker.recognize(capture.image);
      return {
        ...capture,
        candidate: result.candidate,
        ocr_engine: result.engine,
        lines: result.lines,
        recent_messages: result.recent_messages,
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
        recent_messages: result.recent_messages,
      };
    }
  }

  private handleScanError(error: unknown): void {
    const durationMs = this.currentScanStartedAt
      ? Date.now() - this.currentScanStartedAt
      : undefined;
    this.busy = false;
    this.currentScanStartedAt = 0;
    const message = error instanceof Error ? error.message : String(error);
    const qianniuMissing = message.includes(
      'Qianniu reception window was not found',
    );
    const now = Date.now();
    this.nextScanAt = now + (qianniuMissing ? 30_000 : 10_000);
    this.health.markFailure(message, this.nextScanAt);
    if (typeof durationMs === 'number') {
      this.captureMetrics.record({
        name: 'ocr_capture',
        durationMs,
        ok: false,
        source: 'ocr',
      });
    }
    this.contextTracker.markDegraded();
    this.broadcastCurrentContext();
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

  private broadcastCurrentContext(): void {
    const snapshot = this.contextTracker.getSnapshot();
    if (!snapshot) return;
    this.dispatchService.receiveBroadcast({
      event: 'qianniu_context_changed',
      data: snapshot,
    });
  }

  private markScanHealthy(): void {
    this.nextScanAt = 0;
    const durationMs = this.currentScanStartedAt
      ? Date.now() - this.currentScanStartedAt
      : undefined;
    this.health.markRunning(durationMs);
    if (typeof durationMs === 'number') {
      this.captureMetrics.record({
        name: 'ocr_capture',
        durationMs,
        ok: true,
        source: 'ocr',
      });
    }
    this.currentScanStartedAt = 0;
    if (this.lastFailureKey) {
      this.log.info('千牛兼容采集已恢复');
      this.lastFailureKey = '';
    }
  }

  private async recognizeOnce(image: string): Promise<QianniuOcrResult> {
    const python = rapidOcrPythonPath();
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
    let releasedCapture = false;
    try {
      let capture = await this.capture({ skipOcr: true });
      const now = Date.now();
      if (now - this.lastActivePollAt < ACTIVE_CONTEXT_POLL_MS) return;
      this.lastActivePollAt = now;
      if (capture.chat_fingerprint !== this.lastRecognizedFingerprint) {
        this.generationEpoch += 1;
        const switching = this.contextTracker.markSwitching(
          capture.chat_fingerprint,
        );
        if (switching) {
          this.dispatchService.receiveBroadcast({
            event: 'qianniu_context_changed',
            data: switching,
          });
        }
      }
      const refreshHeaderContext =
        now - this.lastHeaderContextRefreshAt >= HEADER_CONTEXT_REFRESH_MS;
      if (
        capture.chat_fingerprint === this.lastRecognizedFingerprint &&
        this.contextTracker.getSnapshot()?.state === 'stable' &&
        !refreshHeaderContext
      ) {
        return;
      }
      const fingerprint = capture.chat_fingerprint;
      this.currentScanStartedAt = Date.now();
      this.health.markScanning(!this.ocrWorker.isWarm());
      capture = await this.recognizeCapture(capture);
      this.lastRecognizedFingerprint = fingerprint;
      this.lastHeaderContextRefreshAt = now;

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
      const confidence = capture.candidate?.confidence || 0;
      const contextEvidence = extractQianniuContextEvidence(capture.lines || []);
      const capturedStoreId = usableCapturedStoreId(capture.store_id);
      const recentMessages = sanitizeQianniuRecentMessages(
        capture.recent_messages,
      );
      const task = (await this.appService.getTasks()).find(
        (item) => item.app_id === 'win_qianniu',
      );
      if (!task) return;

      if (this.captureRouterEnabled) {
        const observedEvent = this.qianniuOcrAdapter.toEvent(capture, {
            storeId:
              contextEvidence.storeId ||
              capturedStoreId ||
              task.env_id ||
              'qianniu-default',
            accountId: capture.account_id?.trim() || task.task_id,
            storeName: contextEvidence.storeName || undefined,
            accountName: contextEvidence.accountName || undefined,
            product:
              contextEvidence.productId || capture.product_id
                ? {
                    productId: contextEvidence.productId || capture.product_id,
                    title: contextEvidence.productTitle || undefined,
                  }
                : undefined,
          });
        if (observedEvent) {
          const routed = this.captureRouter.handle(observedEvent, 'primary');
          if (routed.reason === 'duplicate') {
            this.log.info('Qianniu capture router dropped a duplicate observation');
          }
        }
      }

      const contactId = decision.accepted
        ? decision.sender
        : normalizeQianniuContact(capture.candidate?.sender);
      const messageKey = decision.accepted
        ? createIncomingMessageFingerprint({
            platformId: 'win_qianniu',
            chatFingerprint: capture.chat_fingerprint,
            sender: decision.sender,
            content: decision.content,
          })
        : null;

      let contextUpdate;
      let contextKeys;
      // The persistent Windows OCR worker is the fast path.  It carries the
      // same positional evidence as RapidOCR, so context switching must not
      // wait for a slower Python pass before updating the companion.
      if (capture.ocr_engine !== 'none' && contactId) {
        contextUpdate = this.contextTracker.observe({
          platformId: 'win_qianniu',
          storeId:
            contextEvidence.storeId ||
            capturedStoreId ||
            task.env_id ||
            'qianniu-default',
          storeName: contextEvidence.storeName || null,
          accountId:
            contextEvidence.accountId ||
            capture.account_id?.trim() ||
            task.task_id,
          accountName: contextEvidence.accountName || null,
          recentMessages,
          contactId,
          chatFingerprint: capture.chat_fingerprint,
          productId:
            contextEvidence.productId || capture.product_id?.trim() || null,
          productTitle: contextEvidence.productTitle || null,
          incomingMessageFingerprint: messageKey,
          capturedAt: new Date().toISOString(),
          confidence,
        });
        contextKeys = this.contextTracker.keys(contextUpdate.snapshot);
        if (contextUpdate.changed) {
          this.dispatchService.receiveBroadcast({
            event: 'qianniu_context_changed',
            data: contextUpdate.snapshot,
          });
        }
      }

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
      const key = messageKey as string;
      if (key === this.lastMessageKey) return;
      this.lastMessageKey = key;

      const existingSuggestion = await ReplySuggestion.findOne({
        where: { message_key: key },
      });
      if (existingSuggestion) {
        this.log.info(`千牛重复采集事件已忽略: ${sender}`);
        return;
      }

      const generationEpoch = this.generationEpoch;
      const generationRevision = contextUpdate?.snapshot.contextRevision;
      const generationFingerprint = capture.chat_fingerprint;
      const generationStartedAt = Date.now();
      this.broadcastGenerationState({
        state: 'generating',
        contextRevision: generationRevision,
        chatFingerprint: generationFingerprint,
        startedAt: generationStartedAt,
      });
      // OCR/capture is the scarce sequential part. Let the next visible chat
      // be captured while a slower LLM request for this chat is in flight.
      this.busy = false;
      releasedCapture = true;

      // Exact questions that were already answered for this shop are the
      // fastest and most useful knowledge base: return the prior approved
      // draft immediately instead of starting another retrieval/model round.
      const cachedAnswer = await ReplySuggestion.findOne({
        where: {
          platform_id: 'win_qianniu',
          incoming_content: content,
          store_id: contextUpdate?.snapshot.storeId || task.env_id,
        },
        order: [['updated_at', 'DESC']],
      });

      let reply: ReplyDTO;
      const customerSentLink = /^https?:\/\//i.test(content.trim());
      if (customerSentLink) {
        // A bare item URL is evidence supplied by the buyer, not a request
        // to answer with a generic sales pitch.  Keep it visible in the Q/A
        // timeline and wait for the buyer's accompanying question.
        reply = {
          type: 'TEXT',
          content: '已识别客户发送的商品链接，等待其补充具体咨询。',
          source: 'default',
          safeToAutoSend: false,
          retrievalStatus: 'disabled',
        };
      } else if (cachedAnswer?.reply_content?.trim()) {
        reply = {
          type: 'TEXT',
          content: cachedAnswer.reply_content.trim(),
          source: 'keyword',
          safeToAutoSend: true,
          retrievalStatus: 'hit',
        };
        this.log.info(`千牛命中本店历史问答，跳过模型生成: ${content}`);
      } else try {
        reply = await this.dispatchService.createReply({
          ctx: {
            CTX_APP_NAME: '千牛',
            CTX_APP_ID: 'win_qianniu',
            CTX_INSTANCE_ID: task.task_id,
            CTX_USERNAME: sender,
            CTX_PLATFORM: 'qianniu-9.96-compat',
          },
          msgs: [
            ...recentMessages
              .filter((item) => item.content !== content)
              .slice(-3)
              .map((item) => ({
                sender: item.direction === 'incoming' ? sender : task.task_id,
                content: item.content,
                role: item.direction === 'incoming' ? ('OTHER' as const) : ('SELF' as const),
                type: 'TEXT' as const,
              })),
            {
              sender,
              content,
              role: 'OTHER',
              type: 'TEXT',
            },
          ],
        });
      } catch (error) {
        this.broadcastGenerationState({
          state: 'failed',
          contextRevision: generationRevision,
          chatFingerprint: generationFingerprint,
          startedAt: generationStartedAt,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }

      if (reply.type !== 'TEXT' || !reply.content.trim()) {
        this.broadcastGenerationState({
          state: 'failed',
          contextRevision: generationRevision,
          chatFingerprint: generationFingerprint,
          startedAt: generationStartedAt,
          error: '未生成可发送的文本回复',
        });
        return;
      }
      if (
        generationEpoch !== this.generationEpoch ||
        !this.isCurrentContext(generationRevision, generationFingerprint)
      ) {
        this.broadcastGenerationState({
          state: 'discarded',
          contextRevision: generationRevision,
          chatFingerprint: generationFingerprint,
          startedAt: generationStartedAt,
        });
        this.log.info('千牛旧会话回复已丢弃：当前客户或店铺已切换');
        return;
      }

      const deliveryDecision = evaluateAutomaticDelivery({
        safeToAutoSend: reply.safeToAutoSend,
        source: reply.source,
        retrievalStatus: reply.retrievalStatus,
        ocrConfidence: confidence,
        minimumOcrConfidence: getMinimumOcrConfidence('win_qianniu'),
        content: reply.content,
        conversationStable: Boolean(contextUpdate?.snapshot.state === 'stable'),
      });

      const [suggestion, created] = await ReplySuggestion.findOrCreate({
        where: { message_key: key },
        defaults: {
          platform_id: 'win_qianniu',
          store:
            contextUpdate?.snapshot.storeName ||
            contextUpdate?.snapshot.storeId ||
            task.env_id,
          sender,
          incoming_content: content,
          reply_content: reply.content.trim().slice(0, 300),
          original_reply_content: reply.content.trim().slice(0, 300),
          draft_content: reply.content.trim().slice(0, 300),
          conversation_key: contextKeys?.conversationKey || null,
          draft_key: contextKeys?.draftKey || null,
          store_id: contextUpdate?.snapshot.storeId || task.env_id,
          account_id: contextUpdate?.snapshot.accountId || task.task_id,
          contact_id: contextUpdate?.snapshot.contactId || sender,
          chat_fingerprint:
            contextUpdate?.snapshot.chatFingerprint || capture.chat_fingerprint,
          product_id: contextUpdate?.snapshot.productId || null,
          product_title: contextUpdate?.snapshot.productTitle || null,
          incoming_message_fingerprint:
            contextUpdate?.snapshot.incomingMessageFingerprint || null,
          context_revision: contextUpdate?.snapshot.contextRevision || null,
          draft_state: 'draft',
          draft_updated_at: new Date(),
          retrieval_status: reply.retrievalStatus || 'disabled',
          risk_level: deliveryDecision.riskLevel,
          ocr_confidence: confidence,
          ocr_reason_codes: deliveryDecision.allowed ? [] : [deliveryDecision.code],
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
      if (
        generationEpoch !== this.generationEpoch ||
        !this.isCurrentContext(generationRevision, generationFingerprint)
      ) {
        await suggestion.destroy();
        this.log.info('千牛旧会话草稿已撤销：当前客户或店铺已切换');
        return;
      }
      await saveRetrievalEvidence(suggestion, reply);
      if (this.onFeedback) void this.onFeedback({
          suggestionId: suggestion.id,
          eventKey: `suggestion:${suggestion.id}:generated`,
          action: 'generated',
        }).catch((error) => this.log.warn(`回复反馈保存失败：${String(error)}`));
      this.broadcastSuggestion('qianniu_suggestion_created', suggestion);
      this.broadcastGenerationState({
        state: 'ready',
        contextRevision: generationRevision,
        chatFingerprint: generationFingerprint,
        startedAt: generationStartedAt,
      });

      this.log.success(`千牛兼容采集: ${sender} -> ${content}`);
      if (
        this.replyMode === 'unattended' &&
        reply.type === 'TEXT' &&
        deliveryDecision.allowed
      ) {
        const requestId = await reserveSuggestionDelivery(suggestion.id, 'send');
        try {
          const verifiedAutoContent = suggestion.conversation_key
            ? prepareDraftDelivery({
                content: reply.content,
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
                  state: 'draft',
                },
                live: this.contextTracker.getSnapshot(),
                action: 'send',
              })
            : reply.content.trim().slice(0, 300);
          await this.sendReply(verifiedAutoContent, true, sender);
          const completed = await finishSuggestionDelivery({
            id: suggestion.id,
            requestId,
            status: 'sent',
          });
          if (!completed) throw new Error('发送结果已过期，未更新回复状态');
          if (this.onFeedback) void this.onFeedback({
              suggestionId: suggestion.id,
              eventKey: `suggestion:${suggestion.id}:sent:${requestId}`,
              action: 'sent',
              finalContent: verifiedAutoContent,
            }).catch((error) => this.log.warn(`回复反馈保存失败：${String(error)}`));
        } catch (error) {
          await finishSuggestionDelivery({
            id: suggestion.id,
            requestId,
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
          if (this.onFeedback) void this.onFeedback({
              suggestionId: suggestion.id,
              eventKey: `suggestion:${suggestion.id}:failed:${requestId}`,
              action: 'failed',
              reasonCode: 'delivery_failed',
            }).catch((feedbackError) => this.log.warn(`回复反馈保存失败：${String(feedbackError)}`));
          throw error;
        }
        await suggestion.reload();
        this.broadcastSuggestion('qianniu_suggestion_updated', suggestion);
        this.log.success(`千牛兼容回复已发送: ${sender}`);
      } else {
        if (this.replyMode === 'unattended' && !deliveryDecision.allowed) {
          this.log.warn(`自动发送已阻止并保留待确认：${deliveryDecision.code}`);
        }
        this.log.info(`影子回复已生成: ${reply.content}`);
      }
    } finally {
      if (!releasedCapture) this.busy = false;
    }
  }

  private isCurrentContext(
    contextRevision: number | undefined,
    chatFingerprint: string,
  ): boolean {
    const current = this.contextTracker.getSnapshot();
    return Boolean(
      current &&
        current.state === 'stable' &&
        current.chatFingerprint === chatFingerprint &&
        current.contextRevision === contextRevision,
    );
  }

  public async focusContact(sender: string): Promise<void> {
    const target = sender.trim();
    if (!target) throw new Error('目标客户不能为空');
    const markerPath = path.join(
      os.tmpdir(),
      `chatgpt-on-cs-qianniu-focus-${crypto.randomUUID()}.txt`,
    );
    const scriptPath = runtimePath('scripts', 'qianniu-compat-send.ps1');
    await fs.writeFile(markerPath, 'focus', 'utf8');
    try {
      const { stdout } = await execFileAsync(
        'powershell.exe',
        [
          '-NoProfile',
          '-Sta',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          scriptPath,
          '-ReplyFile',
          markerPath,
          '-Sender',
          target,
          '-SelectOnly',
        ],
        {
          encoding: 'utf8',
          windowsHide: true,
          maxBuffer: 1024 * 1024,
        },
      );
      assertQianniuFillResult(
        parseQianniuFillResult(stdout),
        'select',
        false,
      );
      const verification = await this.capture();
      const actualSender =
        verification.candidate?.sender?.replace(/\s+/g, '') || '';
      if (actualSender.toLowerCase() !== target.toLowerCase()) {
        throw new Error(
          `切换用户失败：目标 ${target}，当前 ${actualSender || '未识别'}`,
        );
      }
      this.requestRefresh();
    } finally {
      await fs.unlink(markerPath).catch(() => undefined);
    }
  }

  public async focusConversation(target: {
    storeId?: string | null;
    accountId?: string | null;
    contactId: string;
  }): Promise<void> {
    const contactId = target.contactId.trim();
    if (!contactId) throw new Error('目标客户不能为空');
    await this.focusContact(contactId);
    const verification = await this.capture();
    const actualContact = verification.candidate?.sender?.replace(/\s+/g, '') || '';
    if (actualContact.toLowerCase() !== contactId.replace(/\s+/g, '').toLowerCase()) {
      throw new Error(`客户校验失败：目标 ${contactId}，当前 ${actualContact || '未识别'}`);
    }
    const expectedStore = target.storeId?.trim();
    const actualStore = usableCapturedStoreId(verification.store_id);
    if (expectedStore && actualStore && expectedStore !== actualStore) {
      throw new Error(`店铺校验失败：目标 ${expectedStore}，当前 ${actualStore}`);
    }
    const expectedAccount = target.accountId?.trim();
    const actualAccount = verification.account_id?.trim();
    if (expectedAccount && actualAccount && expectedAccount !== actualAccount) {
      throw new Error(`客服账号校验失败：目标 ${expectedAccount}，当前 ${actualAccount}`);
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
