import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { LoggerService } from './loggerService';
import { DispatchService } from './dispatchService';
import { isPlatformRunning, isPlatformActive } from './platformRuntimeService';
import { Config } from '../entities/config';

export type JinmaiReplyMode = 'hint' | 'assist' | 'unattended';
export type JinmaiCollectorState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'degraded';

export interface JinmaiCollectorHealth {
  state: JinmaiCollectorState;
  processRunning: boolean;
  lastHeartbeatAt?: string;
  lastError?: string;
  restartAttempts: number;
}

export class JinmaiSidecarService {
  private timer?: NodeJS.Timeout;

  private child?: ChildProcess;

  private checking = false;

  private replyMode: JinmaiReplyMode = 'hint';

  private collectorState: JinmaiCollectorState = 'stopped';

  private lastHeartbeatAt = 0;

  private lastError = '';

  private restartAttempts = 0;

  private nextStartAt = 0;

  private stoppingChild = false;

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
      this.log.error(`京麦回复模式初始化失败: ${String(error)}`);
    });
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 4000);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.stopChild();
  }

  public getMode(): JinmaiReplyMode {
    return this.replyMode;
  }

  public async setMode(mode: JinmaiReplyMode): Promise<void> {
    this.replyMode = mode;
    const config = await Config.findOne({ where: { global: true } });
    if (config) await config.update({ jinmai_reply_mode: mode });
    this.dispatchService.receiveBroadcast({
      event: 'jinmai_reply_mode_changed',
      data: { mode },
    });
  }

  public getHealth(): JinmaiCollectorHealth {
    const heartbeatStale =
      this.child &&
      this.lastHeartbeatAt > 0 &&
      Date.now() - this.lastHeartbeatAt > 15_000;
    const state = heartbeatStale ? 'degraded' : this.collectorState;
    return {
      state,
      processRunning: Boolean(this.child),
      lastHeartbeatAt: this.lastHeartbeatAt
        ? new Date(this.lastHeartbeatAt).toISOString()
        : undefined,
      lastError: heartbeatStale
        ? '京麦采集心跳超时，正在等待自动恢复'
        : this.lastError || undefined,
      restartAttempts: this.restartAttempts,
    };
  }

  public reportHealth(state: JinmaiCollectorState, error?: string): void {
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
      throw new Error('京麦正在定位另一个联系人，请稍后再试');
    }
    this.commandBusy = true;
    try {
      const root = process.cwd();
      const commandFile = path.join(
        root,
        '.tmp-userdata',
        'jinmai-sidecar-command.json',
      );
      const tempFile = `${commandFile}.tmp`;
      const resultFile = path.join(
        root,
        '.tmp-userdata',
        'jinmai-sidecar-command-result.json',
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

      const deadline = Date.now() + 30000; // 辅助回复定位需要足够时间（OCR+填入）
      while (Date.now() < deadline) {
        if (fs.existsSync(resultFile)) {
          const result = JSON.parse(fs.readFileSync(resultFile, 'utf8')) as {
            requestId: string;
            ok: boolean;
            error?: string;
          };
          if (result.requestId === requestId) {
            fs.unlinkSync(resultFile);
            if (!result.ok) throw new Error(result.error || '京麦定位失败');
            return;
          }
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('京麦定位超时，请确认京麦已登录');
    } finally {
      this.commandBusy = false;
    }
  }

  private async refresh(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const running = await isPlatformRunning('win_jinmai');
      const active = await isPlatformActive('win_jinmai');
      const shouldRun = running && active;

      if (shouldRun && !this.child && Date.now() >= this.nextStartAt) {
        this.startChild();
      }
      if (!shouldRun && this.child) this.stopChild();
      if (!shouldRun && !this.child && this.collectorState !== 'stopped') {
        this.collectorState = 'stopped';
        this.lastError = active ? '' : '京麦平台未激活，已停止采集';
        this.broadcastHealth();
      }
    } finally {
      this.checking = false;
    }
  }

  private async loadMode(): Promise<void> {
    await this.setMode('hint');
  }

  private startChild(): void {
    const root = process.cwd();
    const python = path.join(root, '.venv-wechat', 'Scripts', 'python.exe');
    const script = path.join(root, 'scripts', 'jinmai-sidecar.py');
    if (!fs.existsSync(python) || !fs.existsSync(script)) {
      this.collectorState = 'degraded';
      this.lastError = '京麦采集运行环境不完整';
      this.log.error(this.lastError);
      this.broadcastHealth();
      return;
    }
    this.collectorState = 'starting';
    this.lastError = '';
    this.broadcastHealth();
    const child = spawn(
      python,
      [
        script,
        '--backend',
        'jinmai',
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
      this.log.info('检测到京麦，京麦自动回复采集已启动');
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
        lifetime < JinmaiSidecarService.QUICK_FAIL_THRESHOLD * 1000;

      if (isQuickFail) {
        this.quickFailCount += 1;
        if (!this.longWaitMode) {
          this.longWaitMode = true;
          this.log.warn(
            `京麦采集启动失败（京麦可能未运行），${Math.ceil(JinmaiSidecarService.LONG_RETRY_DELAY / 60000)} 分钟后自动重试`,
          );
        }
      } else {
        this.quickFailCount = 0;
        this.longWaitMode = false;
      }

      this.restartAttempts += 1;

      const retryDelay = this.longWaitMode
        ? JinmaiSidecarService.LONG_RETRY_DELAY
        : Math.min(60_000, 2 ** this.restartAttempts * 2_000);

      this.nextStartAt = Date.now() + retryDelay;
      this.collectorState = 'degraded';
      this.lastError = this.longWaitMode
        ? `京麦采集未运行（京麦可能未登录），${Math.ceil(retryDelay / 60000)} 分钟后重试`
        : `京麦采集异常退出（代码 ${code ?? '未知'}），${Math.ceil(retryDelay / 1000)} 秒后重试`;

      // 快速失败时不重复打印日志（首次已打印），仅运行时错误打印
      if (!isQuickFail) {
        this.log.warn(this.lastError);
      }

      this.broadcastHealth();
    });
    child.once('error', (error) => {
      this.log.error(`京麦采集启动失败: ${error.message}`);
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
    this.log.info('京麦已关闭，京麦自动回复采集已停止');
  }

  private handleOutput(chunk: string, isError = false): void {
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

  private broadcastHealth(): void {
    this.dispatchService.receiveBroadcast({
      event: 'jinmai_collector_health_changed',
      data: this.getHealth(),
    });
  }
}
