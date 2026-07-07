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

  public async recognize(image: string): Promise<QianniuOcrResult> {
    const worker = this.ensureProcess();
    const id = crypto.randomUUID();
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
    this.resetProcess(new Error('RapidOCR worker stopped'));
  }

  private ensureProcess(): ChildProcessWithoutNullStreams {
    if (this.process && !this.process.killed) return this.process;

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
    } catch {
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
    if (worker && !worker.killed) worker.kill();
    if (!error) return;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
}
