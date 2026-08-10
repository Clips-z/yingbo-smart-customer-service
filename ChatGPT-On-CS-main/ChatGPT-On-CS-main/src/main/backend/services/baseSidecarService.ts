/* eslint-disable lines-between-class-members, no-void, no-nested-ternary */
import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { LoggerService } from './loggerService';
import { DispatchService } from './dispatchService';
import { isPlatformRunning, isPlatformActive } from './platformRuntimeService';
import { Config } from '../entities/config';
import {
  assertReplyModeAllowed,
  evaluateReplyModeChange,
  getDefaultReplyMode,
  getUnattendedConfigKey,
  normalizeReplyMode,
} from './replySafetyPolicy';
import { getRuntimeRoot, runtimePath } from './runtimePaths';
import { normalizePlatformHealthError, PlatformHealthReason } from './platformHealth';
import { cancelQueuedUnattendedDeliveries } from './deliveryGuard';

// ========== 通用类型定义 ==========

export type ReplyMode = 'hint' | 'assist' | 'unattended';
export type CollectorState = 'stopped' | 'starting' | 'running' | 'degraded';

export interface CollectorHealth {
  state: CollectorState;
  processRunning: boolean;
  lastHeartbeatAt?: string;
  lastError?: string;
  reasonCode?: PlatformHealthReason;
  recoveryAction?: string;
  nextRetryAt?: string;
  restartAttempts: number;
}

/** Sidecar 平台配置 */
export interface SidecarConfig {
  /** 平台唯一标识，如 'win_wechat', 'win_wecom', 'win_jinmai', 'win_pdd', 'win_douyin' */
  platformId: string;
  /** 平台中文名称 */
  platformName: string;
  /** 平台英文简称，用于日志和文件名 */
  platformKey: string;
  /** Python 脚本文件名（相对于 scripts/ 目录） */
  scriptName: string;
  /** 传递给 Python 脚本的 --backend 参数值 */
  backendArg: string;
  /** 子进程心跳超时时间（毫秒），默认 15000 */
  heartbeatTimeoutMs?: number;
  /** 广播健康状态的事件名 */
  healthEventName: string;
  /** 广播模式变更的事件名 */
  modeEventName: string;
  /** Config 表中存储 reply_mode 的字段名（snake_case） */
  configModeKey: string;
  /** Whether the platform must also be manually enabled in Settings. */
  requireActive?: boolean;
}

// ========== 抽象基类 ==========

/**
 * 通用 Sidecar 服务基类
 * 封装了子进程生命周期管理、健康检查、指数退避重试、命令通信等通用逻辑。
 * 子类只需提供平台配置和少量定制方法。
 */
export abstract class BaseSidecarService {
  protected timer?: NodeJS.Timeout;
  protected child?: ChildProcess;
  protected checking = false;
  protected replyMode: ReplyMode = 'hint';
  protected collectorState: CollectorState = 'stopped';
  protected lastHeartbeatAt = 0;
  protected lastError = '';
  protected restartAttempts = 0;
  protected nextStartAt = 0;
  protected stoppingChild = false;
  protected childStartedAt = 0;
  protected quickFailCount = 0;
  protected longWaitMode = false;
  protected lastLoggedError = '';
  protected lastLogTime = 0;
  protected commandBusy = false;

  protected static readonly QUICK_FAIL_THRESHOLD = 10; // 秒
  protected static readonly QUICK_FAIL_LIMIT = 3;
  protected static readonly LONG_RETRY_DELAY = 30_000; // 30 秒（原 5 分钟太长）
  protected static readonly LOG_DEDUP_INTERVAL = 5 * 60_000;
  // RapidOCR 在低负载机器上单轮可能超过 60 秒，并会短暂占用 Python GIL。
  // 看门狗必须覆盖最慢一轮，否则会在首轮 OCR 完成前误杀正常采集器。
  protected static readonly HEARTBEAT_WATCHDOG_MS = 180_000;
  protected static readonly STARTUP_GRACE_MS = 120_000;
  protected static readonly NO_HEARTBEAT_TIMEOUT_MS = 180_000;
  protected static readonly SIDECAR_DURATION = '12h';

  constructor(
    protected port: number,
    protected log: LoggerService,
    protected dispatchService: DispatchService,
    protected config: SidecarConfig,
  ) {}

  // ========== 公开 API ==========

  public start(): void {
    if (process.platform !== 'win32' || this.timer) return;
    void this.loadMode().catch((error) => {
      this.log.error(
        `${this.config.platformName}回复模式初始化失败: ${String(error)}`,
      );
    });
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 4000);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.stopChild();
  }

  public getMode(): ReplyMode {
    return this.replyMode;
  }

  public async setMode(mode: ReplyMode): Promise<void> {
    const config = await Config.findOne({ where: { global: true } });
    const unattendedConfigKey = getUnattendedConfigKey(this.config.platformId);
    const decision = evaluateReplyModeChange({
      platformId: this.config.platformId,
      requestedMode: mode,
      unattendedEnabled: Boolean(
        unattendedConfigKey && config?.[unattendedConfigKey],
      ),
    });
    assertReplyModeAllowed(decision);

    this.replyMode = decision.mode;
    if (config) {
      await config.update({
        [this.config.configModeKey]: decision.mode,
      } as any);
    }
    this.dispatchService.receiveBroadcast({
      event: this.config.modeEventName,
      data: { mode: decision.mode },
    });
  }

  public async emergencyStop(): Promise<number> {
    await this.setMode('assist');
    return cancelQueuedUnattendedDeliveries(this.config.platformId);
  }

  public getHealth(): CollectorHealth {
    const timeout = this.config.heartbeatTimeoutMs ?? 15_000;
    const heartbeatStale =
      this.child &&
      this.lastHeartbeatAt > 0 &&
      Date.now() - this.lastHeartbeatAt > timeout;
    const state = heartbeatStale ? 'degraded' : this.collectorState;
    const lastError = heartbeatStale
      ? `${this.config.platformName}采集心跳超时，正在等待自动恢复`
      : this.lastError || undefined;
    const normalized = normalizePlatformHealthError(lastError);
    return {
      state,
      processRunning: Boolean(this.child),
      lastHeartbeatAt: this.lastHeartbeatAt
        ? new Date(this.lastHeartbeatAt).toISOString()
        : undefined,
      lastError,
      ...normalized,
      nextRetryAt: this.nextStartAt
        ? new Date(this.nextStartAt).toISOString()
        : undefined,
      restartAttempts: this.restartAttempts,
    };
  }

  public reportHealth(state: CollectorState, error?: string): void {
    this.lastHeartbeatAt = Date.now();
    this.collectorState = state;
    this.lastError = error || '';
    if (state === 'running') {
      this.restartAttempts = 0;
      this.nextStartAt = 0;
      this.quickFailCount = 0;
      this.longWaitMode = false;
      this.lastLoggedError = '';
      this.lastLogTime = 0;
    }
    this.broadcastHealth();
  }

  /**
   * 辅助回复：定位联系人并填入回复内容
   * 通过文件系统与 Python sidecar 通信
   */
  public async focusAndFill(sender: string, content: string): Promise<void> {
    if (this.replyMode !== 'assist') {
      throw new Error('请先切换到辅助回复模式');
    }
    await this.dispatchContactCommand(sender, content, false);
  }

  /**
   * 聚合接待台：只切换到目标联系人并聚焦输入框，不写入或发送内容。
   */
  public async focusContact(sender: string): Promise<void> {
    await this.dispatchContactCommand(sender, '', true);
  }

  private async dispatchContactCommand(
    sender: string,
    content: string,
    focusOnly: boolean,
  ): Promise<void> {
    if (this.commandBusy) {
      throw new Error(
        `${this.config.platformName}正在定位另一个联系人，请稍后再试`,
      );
    }
    this.commandBusy = true;
    try {
      const root = getRuntimeRoot();
      const commandFileName = `${this.config.platformKey}-sidecar-command.json`;
      const resultFileName = `${this.config.platformKey}-sidecar-command-result.json`;
      const commandFile = path.join(root, '.tmp-userdata', commandFileName);
      const tempFile = `${commandFile}.tmp`;
      const resultFile = path.join(root, '.tmp-userdata', resultFileName);
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      fs.mkdirSync(path.dirname(commandFile), { recursive: true });
      if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
      fs.writeFileSync(
        tempFile,
        JSON.stringify({
          requestId,
          sender,
          content,
          focusOnly,
          createdAt: Date.now(),
        }),
        'utf8',
      );
      fs.renameSync(tempFile, commandFile);

      // A failed list lookup must never freeze the aggregate reception desk.
      // Filling may legitimately need longer; focus-only is a fast navigation
      // action and returns control promptly when the contact cannot be found.
      const deadline = Date.now() + (focusOnly ? 6000 : 30000);
      while (Date.now() < deadline) {
        if (fs.existsSync(resultFile)) {
          const result = JSON.parse(fs.readFileSync(resultFile, 'utf8')) as {
            requestId: string;
            ok: boolean;
            error?: string;
          };
          if (result.requestId === requestId) {
            fs.unlinkSync(resultFile);
            if (!result.ok)
              throw new Error(
                result.error || `${this.config.platformName}定位失败`,
              );
            return;
          }
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error(
        `${this.config.platformName}定位超时，请确认${this.config.platformName}已登录`,
      );
    } finally {
      this.commandBusy = false;
    }
  }

  // ========== 子类可覆盖的方法 ==========

  /**
   * 返回传递给 Python 子进程的额外命令行参数
   * 子类可覆盖以添加自定义参数
   */
  protected getExtraArgs(): string[] {
    return [];
  }

  /**
   * 获取 Python 解释器路径
   * 使用随安装包发布的可移植 Python，避免 Windows venv 记录构建机绝对路径。
   */
  protected getPythonPath(): string {
    return runtimePath('tools', 'python311', 'python.exe');
  }

  /**
   * 获取启动日志消息
   */
  protected getStartLogMessage(): string {
    return `检测到${this.config.platformName}，${this.config.platformName}自动回复采集已启动`;
  }

  /**
   * 获取停止日志消息
   */
  protected getStopLogMessage(): string {
    return `${this.config.platformName}已关闭，${this.config.platformName}自动回复采集已停止`;
  }

  // ========== 内部实现 ==========

  protected async refresh(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const running = await isPlatformRunning(this.config.platformId);
      const active = await isPlatformActive(this.config.platformId);
      const shouldRun = running && (this.config.requireActive !== false ? active : true);

      // ===== 心跳看门狗：检测死掉的子进程并强制重启 =====
      if (shouldRun && this.child) {
        const cls = this.constructor as typeof BaseSidecarService;
        const now = Date.now();
        const sinceStart = now - this.childStartedAt;

        // 备用检查：子进程已退出但 exit 事件未触发（Windows 偶发）
        if (this.child.exitCode !== null && this.child.exitCode !== undefined) {
          this.log.warn(
            `${this.config.platformName}采集进程已退出（代码 ${this.child.exitCode}）但未触发退出事件，清理并准备重启`,
          );
          this.forceRestart();
        }
        // 启动后超过宽限期才检查心跳
        else if (sinceStart > cls.STARTUP_GRACE_MS) {
          if (
            this.lastHeartbeatAt > 0 &&
            now - this.lastHeartbeatAt > cls.HEARTBEAT_WATCHDOG_MS
          ) {
            const staleSec = Math.ceil((now - this.lastHeartbeatAt) / 1000);
            this.log.warn(
              `${this.config.platformName}采集心跳超时（${staleSec}s 无心跳），强制重启`,
            );
            this.forceRestart();
          } else if (
            this.lastHeartbeatAt === 0 &&
            sinceStart > cls.NO_HEARTBEAT_TIMEOUT_MS
          ) {
            this.log.warn(
              `${this.config.platformName}采集启动后 ${Math.ceil(sinceStart / 1000)}s 无心跳，强制重启`,
            );
            this.forceRestart();
          }
        }
      }

      if (shouldRun && !this.child && Date.now() >= this.nextStartAt) {
        this.startChild();
      }
      if (!shouldRun && this.child) this.stopChild();
      if (!shouldRun && !this.child && this.collectorState !== 'stopped') {
        this.collectorState = 'stopped';
        this.lastError = active
          ? ''
          : `${this.config.platformName}平台未激活，已停止采集`;
        this.broadcastHealth();
      }
    } finally {
      this.checking = false;
    }
  }

  protected async loadMode(): Promise<void> {
    const config = await Config.findOne({ where: { global: true } });
    const rawStoredMode = (config as any)?.[this.config.configModeKey];
    const storedMode = normalizeReplyMode(
      this.config.platformId,
      rawStoredMode,
    );
    const unattendedConfigKey = getUnattendedConfigKey(this.config.platformId);
    const decision = evaluateReplyModeChange({
      platformId: this.config.platformId,
      requestedMode: storedMode,
      unattendedEnabled: Boolean(
        unattendedConfigKey && config?.[unattendedConfigKey],
      ),
    });
    const mode = decision.allowed
      ? decision.mode
      : getDefaultReplyMode(this.config.platformId);
    if (config && mode !== rawStoredMode) {
      await config.update({ [this.config.configModeKey]: mode } as any);
    }
    this.replyMode = mode;
    this.dispatchService.receiveBroadcast({
      event: this.config.modeEventName,
      data: { mode },
    });
    this.log.info(`${this.config.platformName}回复模式已加载: ${mode}`);
  }

  protected startChild(): void {
    const root = getRuntimeRoot();
    const python = this.getPythonPath();
    const script = path.join(root, 'scripts', this.config.scriptName);
    if (!fs.existsSync(python) || !fs.existsSync(script)) {
      this.collectorState = 'degraded';
      this.lastError = `${this.config.platformName}采集运行环境不完整`;
      this.log.error(this.lastError);
      this.broadcastHealth();
      return;
    }
    this.collectorState = 'starting';
    this.lastError = '';
    this.lastHeartbeatAt = 0;
    this.broadcastHealth();

    const args = [
      script,
      '--backend',
      this.config.backendArg,
      '--duration',
      (this.constructor as typeof BaseSidecarService).SIDECAR_DURATION,
      '--api-port',
      String(this.port),
      ...this.getExtraArgs(),
    ];

    const child = spawn(python, args, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONPATH: [runtimePath('tools', 'wechat-py311'), process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
        PYTHONUTF8: '1',
        PYTHONUNBUFFERED: '1',
      },
    });
    this.child = child;
    this.childStartedAt = Date.now();
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.handleOutput(chunk));
    child.stderr?.on('data', (chunk: string) =>
      this.handleOutput(chunk, true),
    );

    // 仅首次启动时打印
    if (this.restartAttempts === 0 && this.quickFailCount === 0) {
      this.log.info(this.getStartLogMessage());
    }

    child.once('exit', (code) => {
      if (this.child === child) this.child = undefined;
      if (this.stoppingChild) {
        this.stoppingChild = false;
        this.collectorState = 'stopped';
        this.quickFailCount = 0;
        this.longWaitMode = false;
        this.restartAttempts = 0;
        this.broadcastHealth();
        return;
      }

      const lifetime = Date.now() - this.childStartedAt;
      const isQuickFail =
        lifetime <
        (this.constructor as typeof BaseSidecarService).QUICK_FAIL_THRESHOLD *
          1000;
      const childError = this.lastError.trim();

      if (isQuickFail) {
        this.quickFailCount += 1;
        // 连续 QUICK_FAIL_LIMIT 次快速失败才进入 long wait
        if (
          this.quickFailCount >=
            (this.constructor as typeof BaseSidecarService).QUICK_FAIL_LIMIT &&
          !this.longWaitMode
        ) {
          this.longWaitMode = true;
          const retrySeconds = Math.ceil(
            (this.constructor as typeof BaseSidecarService).LONG_RETRY_DELAY /
              1000,
          );
          this.log.warn(
            childError
              ? `${this.config.platformName}采集连续 ${this.quickFailCount} 次启动失败：${childError}，${retrySeconds} 秒后自动重试`
              : `${this.config.platformName}采集连续 ${this.quickFailCount} 次启动失败（可能未运行或未登录），${retrySeconds} 秒后自动重试`,
          );
        }
      } else {
        this.quickFailCount = 0;
        this.longWaitMode = false;
      }

      this.restartAttempts += 1;

      const retryDelay = this.longWaitMode
        ? (this.constructor as typeof BaseSidecarService).LONG_RETRY_DELAY
        : Math.min(60_000, 2 ** this.restartAttempts * 2_000);

      this.nextStartAt = Date.now() + retryDelay;
      this.collectorState = 'degraded';
      this.lastError = this.longWaitMode
        ? childError
          ? `${this.config.platformName}采集启动失败：${childError}，${Math.ceil(retryDelay / 1000)} 秒后重试`
          : `${this.config.platformName}采集未运行（${this.config.platformName}可能未登录），${Math.ceil(retryDelay / 1000)} 秒后重试`
        : `${this.config.platformName}采集异常退出（代码 ${code ?? '未知'}），${Math.ceil(retryDelay / 1000)} 秒后重试`;

      if (!isQuickFail) {
        this.log.warn(this.lastError);
      }

      this.broadcastHealth();
    });

    child.once('error', (error) => {
      this.log.error(
        `${this.config.platformName}采集启动失败: ${error.message}`,
      );
      if (this.child === child) this.child = undefined;
      this.collectorState = 'degraded';
      this.lastError = error.message;
      this.broadcastHealth();
    });
  }

  protected stopChild(): void {
    if (!this.child) return;
    this.stoppingChild = true;
    this.child.kill();
    this.child = undefined;
    this.log.info(this.getStopLogMessage());
  }

  /**
   * 强制重启：kill 当前子进程并立即允许重启。
   * 用于心跳超时或进程假死场景，不走正常的 quick-fail/long-wait 逻辑。
   */
  protected forceRestart(): void {
    if (!this.child) return;
    // 标记为主动停止，让 exit handler 走 clean-stop 路径（不设 nextStartAt）
    this.stoppingChild = true;
    try {
      this.child.kill();
    } catch {
      // 进程可能已死
    }
    this.child = undefined;
    this.childStartedAt = 0;
    this.lastHeartbeatAt = 0;
    this.nextStartAt = 0; // 允许立即重启
    this.collectorState = 'degraded';
    this.lastError = `${this.config.platformName}采集正在重启`;
    this.broadcastHealth();
  }

  protected handleOutput(chunk: string, isError = false): void {
    const lines = chunk.split(/\r?\n/).filter(Boolean);

    // 错误级：Traceback / ModuleNotFoundError / RuntimeError / [ERROR] / [CRITICAL]
    const errorLine =
      [...lines].reverse().find((line) =>
        /(?:Error|Exception|Traceback|ModuleNotFoundError|RuntimeError):/.test(
          line,
        ),
      ) ||
      lines.find(
        (line) =>
          line.includes('[ERROR]') || line.includes('[CRITICAL]'),
      );

    // 警告级：[WARNING]（OCR 失败、窗口异常等关键警告）
    const warningLine = !errorLine
      ? lines.find((line) => line.includes('[WARNING]'))
      : undefined;

    // 兜底：stderr 最后一行
    const fallbackLine =
      !errorLine && !warningLine && isError
        ? lines[lines.length - 1]
        : undefined;

    const important = errorLine || warningLine || fallbackLine;
    if (!important) return;

    const normalized = this.normalizeSidecarError(important);

    if (errorLine || fallbackLine) {
      // 错误：更新 lastError 并标记 degraded
      this.lastError = normalized.slice(-500);
      this.collectorState = 'degraded';
      this.log.warn(
        `[${this.config.platformKey}] ${normalized.slice(-200)}`,
      );
      this.broadcastHealth();
    } else if (warningLine) {
      // 警告：透传到日志但不改变采集状态
      this.log.info(
        `[${this.config.platformKey}] ${normalized.slice(-200)}`,
      );
    }
  }

  protected normalizeSidecarError(line: string): string {
    return line
      .replace(/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3}\s+\[[^\]]+\]\s*/, '')
      .replace(/^\[[^\]]+\]\s*/, '')
      .trim();
  }

  protected broadcastHealth(): void {
    this.dispatchService.receiveBroadcast({
      event: this.config.healthEventName,
      data: this.getHealth(),
    });
  }
}
