import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { LoggerService } from './loggerService';
import { DispatchService } from './dispatchService';
import { isPlatformRunning, isPlatformActive } from './platformRuntimeService';
import { Config } from '../entities/config';

export type WecomReplyMode = 'hint' | 'assist' | 'unattended';
export type WecomCollectorState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'degraded';

export interface WecomCollectorHealth {
  state: WecomCollectorState;
  processRunning: boolean;
  lastHeartbeatAt?: string;
  lastError?: string;
  restartAttempts: number;
}

export class WecomSidecarService {
  private timer?: NodeJS.Timeout;

  private child?: ChildProcess;

  private checking = false;

  private replyMode: WecomReplyMode = 'hint';

  private collectorState: WecomCollectorState = 'stopped';

  private lastHeartbeatAt = 0;

  private lastError = '';

  private restartAttempts = 0;

  private nextStartAt = 0;

  private stoppingChild = false;

  /** 子进程启动时间戳，用于检测快速失败 */
  private childStartedAt = 0;
  private quickFailCount = 0;
  private static readonly QUICK_FAIL_THRESHOLD = 10;
  private static readonly QUICK_FAIL_LIMIT = 3;
  private static readonly LONG_RETRY_DELAY = 5 * 60_000;
  private longWaitMode = false;
  private lastLoggedError = '';
  private lastLogTime = 0;
  private static readonly LOG_DEDUP_INTERVAL = 5 * 60_000;

  private commandBusy = false;

  constructor(
    private port: number,
    private log: LoggerService,
    private dispatchService: DispatchService,
  ) {}

  public start(): void {
    if (process.platform !== 'win32' || this.timer) return;
    void this.loadMode().catch((error) => {
      this.log.error(`企微回复模式初始化失败: ${String(error)}`);
    });
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 4000);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.stopChild();
  }

  public getMode(): WecomReplyMode {
    return this.replyMode;
  }

  public async setMode(mode: WecomReplyMode): Promise<void> {
    this.replyMode = mode;
    const config = await Config.findOne({ where: { global: true } });
    if (config) await config.update({ wecom_reply_mode: mode });
    this.dispatchService.receiveBroadcast({
      event: 'wecom_reply_mode_changed',
      data: { mode },
    });
  }

  public getHealth(): WecomCollectorHealth {
    const heartbeatStale =
      this.child &&
      this.lastHeartbeatAt > 0 &&
      Date.now() - this.lastHeartbeatAt > 30_000;
    const state = heartbeatStale ? 'degraded' : this.collectorState;
    return {
      state,
      processRunning: Boolean(this.child),
      lastHeartbeatAt: this.lastHeartbeatAt
        ? new Date(this.lastHeartbeatAt).toISOString()
        : undefined,
      lastError: heartbeatStale
        ? '企微采集心跳超时，正在等待自动恢复'
        : this.lastError || undefined,
      restartAttempts: this.restartAttempts,
    };
  }

  public reportHealth(state: WecomCollectorState, error?: string): void {
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

  public async focusAndFill(sender: string, content: string): Promise<void> {
    if (this.replyMode !== 'assist') {
      throw new Error('请先切换到辅助回复模式');
    }
    if (this.commandBusy) {
      throw new Error('企微正在定位另一个联系人，请稍后再试');
    }
    this.commandBusy = true;
    try {
      const root = process.cwd();
      const commandFile = path.join(
        root,
        '.tmp-userdata',
        'wecom-sidecar-command.json',
      );
      const tempFile = `${commandFile}.tmp`;
      const resultFile = path.join(
        root,
        '.tmp-userdata',
        'wecom-sidecar-command-result.json',
      );
      const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      fs.mkdirSync(path.dirname(commandFile), { recursive: true });
      if (fs.existsSync(resultFile)) fs.unlinkSync(resultFile);
      fs.writeFileSync(
        tempFile,
        JSON.stringify({ requestId, sender, content, createdAt: Date.now() }),
        'utf8',
      );
      fs.renameSync(tempFile, commandFile);

      const deadline = Date.now() + 30000; // 辅助回复定位需要足够时间（OCR+点击+填入）
      while (Date.now() < deadline) {
        if (fs.existsSync(resultFile)) {
          const result = JSON.parse(fs.readFileSync(resultFile, 'utf8')) as {
            requestId: string;
            ok: boolean;
            error?: string;
          };
          if (result.requestId === requestId) {
            fs.unlinkSync(resultFile);
            if (!result.ok) throw new Error(result.error || '企微定位失败');
            return;
          }
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('企微定位超时，请确认企业微信已登录');
    } finally {
      this.commandBusy = false;
    }
  }

  private async refresh(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const running = await isPlatformRunning('win_wecom');
      const active = await isPlatformActive('win_wecom');
      const shouldRun = running && active;

      if (shouldRun && !this.child && Date.now() >= this.nextStartAt) {
        this.startChild();
      }
      if (!shouldRun && this.child) this.stopChild();
      if (!shouldRun && !this.child && this.collectorState !== 'stopped') {
        this.collectorState = 'stopped';
        this.lastError = active ? '' : '企微平台未激活，已停止采集';
        this.broadcastHealth();
      }
    } finally {
      this.checking = false;
    }
  }

  private async loadMode(): Promise<void> {
    const config = await Config.findOne({ where: { global: true } });
    const mode = (config?.wecom_reply_mode as WecomReplyMode) || 'hint';
    this.replyMode = mode;
    this.dispatchService.receiveBroadcast({
      event: 'wecom_reply_mode_changed',
      data: { mode },
    });
    this.log.info(`企微回复模式已加载: ${mode}`);
  }

  private startChild(): void {
    const root = process.cwd();
    const python = path.join(root, '.venv-wechat', 'Scripts', 'python.exe');
    const script = path.join(root, 'scripts', 'wecom-sidecar.py');
    if (!fs.existsSync(python) || !fs.existsSync(script)) {
      this.collectorState = 'degraded';
      this.lastError = '企微采集运行环境不完整';
      this.log.error(this.lastError);
      this.broadcastHealth();
      return;
    }
    this.collectorState = 'starting';
    this.lastError = '';
    this.lastHeartbeatAt = 0;
    this.broadcastHealth();
    const child = spawn(
      python,
      [
        script,
        '--backend',
        'wecom',
        '--duration',
        '12h',
        '--api-port',
        String(this.port),
      ],
      { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    this.child = child;
    this.childStartedAt = Date.now();
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.handleOutput(chunk));
    child.stderr?.on('data', (chunk: string) => this.handleOutput(chunk, true));
    // 仅首次启动时打印，重试时不重复打印
    if (this.restartAttempts === 0 && this.quickFailCount === 0) {
      this.log.info('检测到企业微信，企微自动回复采集已启动');
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
        lifetime < WecomSidecarService.QUICK_FAIL_THRESHOLD * 1000;

      if (isQuickFail) {
        this.quickFailCount += 1;
        if (!this.longWaitMode) {
          this.longWaitMode = true;
          this.log.warn(
            `企微采集启动失败（企微可能未运行或未登录），${Math.ceil(WecomSidecarService.LONG_RETRY_DELAY / 60000)} 分钟后自动重试`,
          );
        }
      } else {
        this.quickFailCount = 0;
        this.longWaitMode = false;
      }

      this.restartAttempts += 1;

      const retryDelay = this.longWaitMode
        ? WecomSidecarService.LONG_RETRY_DELAY
        : Math.min(60_000, 2 ** this.restartAttempts * 2_000);

      this.nextStartAt = Date.now() + retryDelay;
      this.collectorState = 'degraded';
      this.lastError = this.longWaitMode
        ? `企微采集未运行（企微可能未登录），${Math.ceil(retryDelay / 60000)} 分钟后重试`
        : `企微采集异常退出（代码 ${code ?? '未知'}），${Math.ceil(retryDelay / 1000)} 秒后重试`;

      // 快速失败时不重复打印日志（首次已打印），仅运行时错误打印
      if (!isQuickFail) {
        this.log.warn(this.lastError);
      }

      this.broadcastHealth();
    });
    child.once('error', (error) => {
      this.log.error(`企微采集启动失败: ${error.message}`);
      if (this.child === child) this.child = undefined;
      this.collectorState = 'degraded';
      this.lastError = error.message;
      this.broadcastHealth();
    });
  }

  private stopChild(): void {
    if (!this.child) return;
    this.stoppingChild = true;
    this.child.kill();
    this.child = undefined;
    this.log.info('企业微信已关闭，企微自动回复采集已停止');
  }

  private handleOutput(chunk: string, isError = false): void {
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    const important = lines.find(
      (line) => line.includes('[ERROR]') || line.includes('[CRITICAL]'),
    );
    if (!important) return;
    this.lastError = important.slice(-500);
    this.collectorState = 'degraded';
    this.broadcastHealth();
  }

  private broadcastHealth(): void {
    this.dispatchService.receiveBroadcast({
      event: 'wecom_collector_health_changed',
      data: this.getHealth(),
    });
  }
}
