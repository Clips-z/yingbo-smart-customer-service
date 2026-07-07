import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { LoggerService } from './loggerService';
import { DispatchService } from './dispatchService';
import { Config } from '../entities/config';

export type RagState = 'stopped' | 'starting' | 'running' | 'degraded';

export interface RagHealth {
  state: RagState;
  processRunning: boolean;
  port: number;
  lastError?: string;
  restartAttempts: number;
  totalChunks?: number;
}

const RAG_PORT = 8000;

export class RagService {
  private timer?: NodeJS.Timeout;

  private child?: ChildProcess;

  private checking = false;

  private enabled = false;

  private state: RagState = 'stopped';

  private lastError = '';

  private restartAttempts = 0;

  private nextStartAt = 0;

  private stoppingChild = false;

  private totalChunks = 0;

  /** 外部 RAG 服务已检测到（避免重复日志） */
  private externalDetected = false;

  constructor(
    private log: LoggerService,
    private dispatchService: DispatchService,
  ) {}

  /**
   * 启动 RAG 服务管理器（定时检测是否需要启停）
   */
  public start(): void {
    if (this.timer) return;
    // 从数据库读取 rag_enabled 配置
    void this.loadEnabled().catch((error) => {
      this.log.error(`RAG 服务初始化失败: ${String(error)}`);
    });
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), 5000);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.stopChild();
  }

  /**
   * 从数据库加载 RAG 启用状态
   */
  private async loadEnabled(): Promise<void> {
    const config = await Config.findOne({ where: { global: true } });
    this.setEnabled(Boolean(config?.rag_enabled));
  }

  /**
   * 设置 RAG 启用/禁用（由前端开关调用）
   */
  public setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    this.log.info(`RAG 知识库服务已${enabled ? '启用' : '禁用'}`);
    if (!enabled) {
      this.stopChild();
    }
    this.broadcastHealth();
  }

  public getHealth(): RagHealth {
    return {
      state: this.state,
      processRunning: Boolean(this.child),
      port: RAG_PORT,
      lastError: this.lastError || undefined,
      restartAttempts: this.restartAttempts,
      totalChunks: this.totalChunks,
    };
  }

  /**
   * 定时刷新：检查是否需要启停 RAG 子进程
   */
  private async refresh(): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      // 定期从数据库同步 rag_enabled 状态（用户可能在设置页面切换了开关）
      const dbConfig = await Config.findOne({ where: { rag_enabled: true } });
      const dbEnabled = Boolean(dbConfig);
      if (dbEnabled !== this.enabled) {
        this.setEnabled(dbEnabled);
      }

      if (this.enabled && !this.child && Date.now() >= this.nextStartAt) {
        // 先检查是否已有外部 RAG 服务在运行（比如用户手动 start.bat）
        const externalRunning = await this.checkExternalHealth();
        if (externalRunning) {
          this.state = 'running';
          this.lastError = '';
          this.restartAttempts = 0;
          this.broadcastHealth();
          if (!this.externalDetected) {
            this.externalDetected = true;
            this.log.info('检测到外部 RAG 服务已在运行，跳过启动');
          }
          // 60 秒后再检查，避免频繁探测
          this.nextStartAt = Date.now() + 60_000;
          return;
        }
        // 外部服务不存在了，重置标记
        this.externalDetected = false;
        this.startChild();
      }
      if (!this.enabled && this.child) {
        this.stopChild();
      }
      // 如果子进程在运行，定期健康检查
      if (this.child && this.state === 'running') {
        await this.checkHealth();
      }
    } finally {
      this.checking = false;
    }
  }

  /**
   * 查找 Python 可执行文件和 RAG 脚本路径
   */
  private findPythonAndScript(): { python: string; script: string } | null {
    const root = process.cwd();

    // 候选 Python 路径（优先级从高到低）
    const pythonCandidates = [
      // 1. _installer-stage/rag-server/.venv（自包含部署，如果存在）
      path.join(root, 'rag-server', '.venv', 'Scripts', 'pythonw.exe'),
      // 2. 上三级目录的 rag-server/.venv（打包版：_installer-stage → ChatGPT-On-CS-main → ChatGPT-On-CS-main → 懒人客服 → rag-server）
      path.join(root, '..', '..', '..', 'rag-server', '.venv', 'Scripts', 'pythonw.exe'),
      // 3. 上两级目录（开发环境）
      path.join(root, '..', '..', 'rag-server', '.venv', 'Scripts', 'pythonw.exe'),
      // 4. .venv-wechat（备用，可能没有 RAG 依赖）
      path.join(root, '.venv-wechat', 'Scripts', 'pythonw.exe'),
    ];

    // 候选脚本路径
    const scriptCandidates = [
      path.join(root, 'rag-server', 'server.py'),
      path.join(root, '..', '..', '..', 'rag-server', 'server.py'),
      path.join(root, '..', '..', 'rag-server', 'server.py'),
    ];

    for (const python of pythonCandidates) {
      if (!fs.existsSync(python)) continue;
      for (const script of scriptCandidates) {
        if (fs.existsSync(script)) {
          return { python, script };
        }
      }
    }

    return null;
  }

  private startChild(): void {
    const found = this.findPythonAndScript();
    if (!found) {
      this.state = 'degraded';
      this.lastError = 'RAG 运行环境不完整（未找到 Python 或 server.py）';
      this.log.error(this.lastError);
      this.broadcastHealth();
      return;
    }

    const { python, script } = found;
    const ragDir = path.dirname(script);

    this.state = 'starting';
    this.lastError = '';
    this.broadcastHealth();

    const child = spawn(
      python,
      [script],
      {
        cwd: ragDir,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // 确保 RAG 服务能找到自己的 config.json 和 data 目录
          PYTHONUNBUFFERED: '1',
          // 禁用 ChromaDB 遥测（避免 capture() 参数错误警告）
          CHROMA_TELEMETRY_IMPL: 'none',
          ANONYMIZED_TELEMETRY: 'False',
        },
      },
    );

    this.child = child;
    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => this.handleOutput(chunk));
    child.stderr?.on('data', (chunk: string) => this.handleOutput(chunk, true));

    this.log.info('RAG 知识库服务子进程已启动');

    // 启动后等待几秒再检查健康
    setTimeout(() => {
      if (this.child === child && this.state === 'starting') {
        void this.checkHealth();
      }
    }, 3000);

    child.once('exit', (code) => {
      if (this.child === child) this.child = undefined;
      if (this.stoppingChild) {
        this.stoppingChild = false;
        this.state = 'stopped';
        this.broadcastHealth();
        return;
      }
      this.restartAttempts += 1;
      const retryDelay = Math.min(60_000, 2 ** this.restartAttempts * 2_000);
      this.nextStartAt = Date.now() + retryDelay;
      this.state = 'degraded';
      this.lastError = `RAG 服务异常退出（代码 ${code ?? '未知'}），${Math.ceil(
        retryDelay / 1000,
      )} 秒后重试`;
      this.log.warn(this.lastError);
      this.broadcastHealth();
    });

    child.once('error', (error) => {
      this.log.error(`RAG 服务启动失败: ${error.message}`);
      if (this.child === child) this.child = undefined;
      this.state = 'degraded';
      this.lastError = error.message;
      this.broadcastHealth();
    });
  }

  private stopChild(): void {
    if (!this.child) {
      this.state = 'stopped';
      this.broadcastHealth();
      return;
    }
    this.stoppingChild = true;
    this.child.kill();
    this.child = undefined;
    this.log.info('RAG 知识库服务已停止');
  }

  /**
   * 通过 HTTP /health 端点检查 RAG 服务是否健康
   */
  private checkHealth(): Promise<void> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${RAG_PORT}/health`,
        { timeout: 5000 },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const health = JSON.parse(data);
              if (health.status === 'ok') {
                if (this.state !== 'running') {
                  this.state = 'running';
                  this.lastError = '';
                  this.restartAttempts = 0;
                  this.nextStartAt = 0;
                  this.log.info('RAG 知识库服务已就绪');
                  this.broadcastHealth();
                }
                this.totalChunks = health.chunks || 0;
              } else {
                this.state = 'degraded';
                this.lastError = 'RAG 服务返回异常状态';
                this.broadcastHealth();
              }
            } catch (parseErr) {
              console.error('[ragService] health response parse error:', parseErr);
            }
            resolve();
          });
        },
      );
      req.on('error', () => {
        // 连接失败，可能是服务还在启动中
        if (this.state === 'starting') {
          // 启动中，不报错
        } else if (this.child && this.state === 'running') {
          this.state = 'degraded';
          this.lastError = 'RAG 服务健康检查失败';
          this.broadcastHealth();
        }
        resolve();
      });
      req.on('timeout', () => {
        req.destroy();
        resolve();
      });
    });
  }

  /**
   * 检查是否有外部 RAG 服务在运行（非子进程）
   */
  private checkExternalHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://127.0.0.1:${RAG_PORT}/health`,
        { timeout: 3000 },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const health = JSON.parse(data);
              this.totalChunks = health.chunks || 0;
              resolve(health.status === 'ok');
            } catch (parseErr) {
              console.error('[ragService] health parse error:', parseErr);
              resolve(false);
            }
          });
        },
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  private handleOutput(chunk: string, isError = false): void {
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      // 过滤掉 ChromaDB 遥测相关的噪音日志
      if (line.includes('telemetry') || line.includes('Telemetry') || line.includes('capture()')) {
        continue;
      }
      // 过滤掉 Uvicorn 启动信息（非错误）
      if (line.includes('Uvicorn running') || line.includes('Waiting for application startup') || line.includes('Application startup complete') || line.includes('Started server process')) {
        continue;
      }
      // 只记录重要的错误日志
      if (isError || line.includes('[ERROR]') || line.includes('Traceback') || line.includes('CRITICAL')) {
        this.lastError = line.slice(-500);
        if (this.state === 'starting' || this.state === 'running') {
          this.log.warn(`[RAG] ${line.slice(-200)}`);
        }
      }
    }
  }

  private broadcastHealth(): void {
    this.dispatchService.receiveBroadcast({
      event: 'rag_health_changed',
      data: this.getHealth(),
    });
  }
}
