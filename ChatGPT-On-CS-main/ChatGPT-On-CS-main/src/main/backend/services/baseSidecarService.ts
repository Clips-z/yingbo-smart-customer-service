import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { LoggerService } from './loggerService';
import { DispatchService } from './dispatchService';
import { isPlatformRunning, isPlatformActive } from './platformRuntimeService';
import { Config } from '../entities/config';

// ========== 通用类型定义 ==========

export type ReplyMode = 'hint' | 'assist' | 'unattended';
export type CollectorState = 'stopped' | 'starting' | 'running' | 'degraded';

export interface CollectorHealth {
  state: CollectorState;
  processRunning: boolean;
  lastHeartbeatAt?: string;
  lastError?: string;
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
  protected static readonly LONG_RETRY_DELAY = 5 * 60_000; // 5 分钟
  protected static readonly LOG_DEDUP_INTERVAL = 5 * 60_000;

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
    this.replyMode = mode;
    const config = await Config.findOne({ where: { global: true } });
    if (config) {
      await config.update({
        [this.config.configModeKey]: mode,
      } as any);
    }
    this.dispatchService.receiveBroadcast({
      event: this.config.modeEventName,
      data: { mode },
    });
  }

  public getHealth(): CollectorHealth {
    const timeout = this.config.heartbeatTimeoutMs ?? 15_000;
    const heartbeatStale =
      this.child &&
      this.lastHeartbeatAt > 0 &&
      Date.now() - this.lastHeartbeatAt > timeout;
    const state = heartbeatStale ? 'degraded' : this.collectorState;
    return {
      state,
      processRunning: Boolean(this.child),
      lastHeartbeatAt: this.lastHeartbeatAt
        ? new Date(this.lastHeartbeatAt).toISOString()
        : undefined,
      lastError: heartbeatStale
        ? `${this.config.platformName}采集心跳超时，正在等待自动恢复`
        : this.lastError || undefined,
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
    if (this.commandBusy) {
      throw new Error(
        `${this.config.platformName}正在定位另一个联系人，请稍后再试`,
      );
    }
    this.commandBusy = true;
    try {
      const root = process.cwd();
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
        JSON.stringify({ requestId, sender, content, createdAt: Date.now() }),
        'utf8',
      );
      fs.renameSync(tempFile, commandFile);

      const deadline = Date.now() + 30000;
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
   * 默认使用 .venv-wechat，子类可覆盖
   */
  protected getPythonPath(): string {
    return path.join(
      process.cwd(),
      '.venv-wechat',
      'Scripts',
      'python.exe',
    );
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
      const shouldRun = running && active;

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
    const mode =
      ((config as any)?.[this.config.configModeKey] as ReplyMode) || 'hint';
    this.replyMode = mode;
    this.dispatchService.receiveBroadcast({
      event: this.config.modeEventName,
      data: { mode },
    });
    this.log.info(`${this.config.platformName}回复模式已加载: ${mode}`);
  }

  protected startChild(): void {
    const root = process.cwd();
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
      '12h',
      '--api-port',
      String(this.port),
      ...this.getExtraArgs(),
    ];

    const child = spawn(python, args, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
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

      if (isQuickFail) {
        this.quickFailCount += 1;
        if (!this.longWaitMode) {
          this.longWaitMode = true;
          this.log.warn(
            `${this.config.platformName}采集启动失败（${this.config.platformName}可能未运行或未登录），${Math.ceil((this.constructor as typeof BaseSidecarService).LONG_RETRY_DELAY / 60000)} 分钟后自动重试`,
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
        ? `${this.config.platformName}采集未运行（${this.config.platformName}可能未登录），${Math.ceil(retryDelay / 60000)} 分钟后重试`
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

  protected handleOutput(chunk: string, isError = false): void {
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    const important = lines.find(
      (line) =>
        isError || line.includes('[ERROR]') || line.includes('[CRITICAL]'),
    );
    if (!important) return;
    this.lastError = important.slice(-500);
    this.collectorState = 'degraded';
    this.broadcastHealth();
  }

  protected broadcastHealth(): void {
    this.dispatchService.receiveBroadcast({
      event: this.config.healthEventName,
      data: this.getHealth(),
    });
  }
}
