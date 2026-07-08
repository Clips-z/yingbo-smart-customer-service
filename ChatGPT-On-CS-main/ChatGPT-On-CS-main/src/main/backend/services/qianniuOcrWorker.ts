import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import crypto from 'crypto';
import path from 'path';
import readline from 'readline';

export type QianniuOcrCandidate = {
  sender: string;
  content: string;
  confidence: number;
  direction: 'incoming' | 'unknown';
  latest_direction: 'incoming' | 'outgoing' | 'unknown';
  bubble_blue_bias: number;
  lowest_outgoing_y: number;
  x: number;
  y: number;
};

export type QianniuOcrResult = {
  ok: boolean;
  engine: 'rapidocr';
  candidate: QianniuOcrCandidate;
  lines: Array<{
    text: string;
    score: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  error?: string;
};

type PendingRequest = {
  resolve: (result: QianniuOcrResult) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

export class QianniuOcrWorker {
  private process?: ChildProcessWithoutNullStreams;

  private pending = new Map<string, PendingRequest>();

  private stderrTail = '';

  private lastActivityAt = 0;

  private healthCheckTimer?: NodeJS.Timeout;

  private readonly IDLE_TIMEOUT_MS = 10 * 60_000; // 10分钟空闲后回收进程

  private readonly HEALTH_CHECK_INTERVAL_MS = 30_000; // 每30秒检查一次进程健康

  public async recognize(image: string): Promise<QianniuOcrResult> {
    const worker = this.ensureProcess();
    const id = crypto.randomUUID();
    this.lastActivityAt = Date.now();
    return new Promise<QianniuOcrResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('RapidOCR worker timed out'));
        this.resetProcess();
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      worker.stdin.write(`${JSON.stringify({ id, image })}\n`, 'utf8');
    });
  }

  public stop(): void {
    this.clearHealthCheck();
    this.resetProcess(new Error('RapidOCR worker stopped'));
  }

  private clearHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) return;
    this.healthCheckTimer = setInterval(() => {
      // 空闲超时检查：10分钟无活动则回收进程以节省资源
      if (
        this.pending.size === 0 &&
        Date.now() - this.lastActivityAt > this.IDLE_TIMEOUT_MS
      ) {
        this.resetProcess();
        this.clearHealthCheck();
        return;
      }

      // 进程健康检查：确认进程仍在运行
      const worker = this.process;
      if (!worker) {
        this.clearHealthCheck();
        return;
      }
      if (worker.killed || worker.exitCode !== null) {
        this.resetProcess(
          new Error('RapidOCR worker health check failed: process exited'),
        );
        this.clearHealthCheck();
      }
    }, this.HEALTH_CHECK_INTERVAL_MS);
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.process && !this.process.killed) {
      this.lastActivityAt = Date.now();
      return this.process;
    }

    const python = path.resolve(process.cwd(), 'tools', 'python311', 'python.exe');
    const script = path.resolve(
      process.cwd(),
      'scripts',
      'qianniu-rapidocr-worker.py',
    );
    const worker = spawn(python, ['-X', 'utf8', script], {
      cwd: process.cwd(),
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.process = worker;
    this.stderrTail = '';
    this.lastActivityAt = Date.now();
    this.startHealthCheck();

    const output = readline.createInterface({ input: worker.stdout });
    output.on('line', (line) => this.handleLine(line));
    worker.stderr.on('data', (chunk: Buffer) => {
      this.stderrTail = `${this.stderrTail}${chunk.toString('utf8')}`.slice(-2000);
    });
    worker.on('error', (error) => this.resetProcess(error));
    worker.on('exit', (code) => {
      if (this.process !== worker) return;
      const detail = this.stderrTail.trim();
      this.resetProcess(
        new Error(
          `RapidOCR worker exited (${code ?? 'unknown'})${
            detail ? `: ${detail}` : ''
          }`,
        ),
      );
    });
    return worker;
  }

  private handleLine(line: string): void {
    let response: (QianniuOcrResult & { id?: string; type?: string }) | undefined;
    try {
      response = JSON.parse(line) as QianniuOcrResult & {
        id?: string;
        type?: string;
      };
    } catch (parseErr) {
      // 非 JSON 行（如 stderr 日志），正常跳过
      return;
    }
    if (!response.id) return;
    const request = this.pending.get(response.id);
    if (!request) return;
    clearTimeout(request.timer);
    this.pending.delete(response.id);
    if (response.ok) {
      request.resolve(response);
    } else {
      request.reject(new Error(response.error || 'RapidOCR worker failed'));
    }
  }

  private resetProcess(error?: Error): void {
    const worker = this.process;
    this.process = undefined;
    this.clearHealthCheck();
    if (worker && !worker.killed) worker.kill();
    if (!error) return;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}
